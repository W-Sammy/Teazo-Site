import { createHash, randomUUID } from "node:crypto";
import { squareClient } from "@/app/lib/square";
import { SquareError } from "square";
import { validateCheckoutRequestBody } from "@/app/lib/checkout-validators";
import { ONLINE_ORDERING_PAUSED_MESSAGE, validatePickupTiming } from "@/app/lib/store-hours";
import { getWebsiteContent } from "@/app/lib/website-content";
import { resolveSquareLocationId } from "@/app/lib/square-location";
import { verifyTurnstile } from "@/app/lib/turnstile";
import { ONLINE_ORDER_METADATA } from "@/app/lib/online-orders";
import { CHECKOUT_RATE_LIMIT, consumeRateLimit } from "@/app/lib/queries/rate-limit";
import { validateCartAgainstCatalog } from "@/app/lib/catalog-validation";
import { applicationUrl } from "@/app/lib/site-url";
import {
  beginCheckoutProcessing,
  completeCheckoutAttempt,
  getCheckoutAttempt,
  markCheckoutUncertain,
  recoverStalledCheckoutAttempt,
  reserveCheckoutAttempt,
  resumeUncertainCheckoutAttempt,
  type CheckoutAttempt,
} from "@/app/lib/queries/checkout-attempts";
import type { CheckoutRequestBody } from "@/app/types/checkout";

export const runtime = "nodejs";

const BOT_CHECK_MESSAGES = {
  missing: "Please wait for the security check above the checkout button to finish, then try again.",
  rejected: "The security check didn't pass. Please try it again.",
  unavailable: "The security check isn't working right now. Please try again in a moment.",
} as const;

// Square does not publish a guaranteed idempotency-key retention period.
// Automatic recovery is deliberately limited to a short interval. Older
// unresolved attempts must be reconciled manually, never assigned a new key.
const MAX_AUTOMATIC_RECOVERY_MS = 10 * 60_000;
const STALLED_REQUEST_MS = 2 * 60_000;

type SquareCheckoutRequest = Parameters<typeof squareClient.checkout.paymentLinks.create>[0];

/** The visitor IP Vercel reports, used for Turnstile and rate limits. */
function visitorIp(request: Request): string | undefined {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded && /^[0-9a-fA-F:.]{3,45}$/.test(forwarded) ? forwarded : undefined;
}

/** Excludes one-time bot tokens and the attempt ID itself. */
function checkoutFingerprint(body: CheckoutRequestBody): string {
  return createHash("sha256")
    .update(JSON.stringify({
      customer: body.customer,
      pickupTiming: body.pickupTiming,
      items: body.items,
    }))
    .digest("hex");
}

function errorResponse(error: string, code: string, status: number, retryAfter?: number) {
  return Response.json(
    { error, code },
    {
      status,
      headers: {
        "Cache-Control": "no-store",
        ...(retryAfter ? { "Retry-After": String(retryAfter) } : {}),
      },
    },
  );
}

function databaseUnavailable(error: unknown): Response {
  console.error("[checkout] D1 idempotency record unavailable:", error);
  return errorResponse(
    "Checkout records are temporarily unavailable. Please try again.",
    "STORAGE_UNAVAILABLE",
    503,
  );
}

function inProgress(): Response {
  return errorResponse(
    "This checkout attempt is already being processed. Please retry shortly.",
    "CHECKOUT_IN_PROGRESS",
    409,
    2,
  );
}

function completedResponse(attempt: CheckoutAttempt): Response {
  if (!attempt.checkout_url || !attempt.order_id) {
    return errorResponse("Stored checkout result is incomplete.", "CHECKOUT_RECOVERY_REQUIRED", 503);
  }
  return Response.json(
    { checkoutUrl: attempt.checkout_url, orderId: attempt.order_id },
    { status: 200, headers: { "Cache-Control": "no-store" } },
  );
}

function recoveryAgeMs(attempt: CheckoutAttempt): number {
  return Date.now() - Date.parse(attempt.created_at);
}

function recoveryPermitted(attempt: CheckoutAttempt): boolean {
  const age = recoveryAgeMs(attempt);
  return Number.isFinite(age) && age >= 0 && age <= MAX_AUTOMATIC_RECOVERY_MS;
}

async function safelyMarkUncertain(attemptId: string, ownerId: string) {
  try {
    await markCheckoutUncertain(attemptId, ownerId);
  } catch (error) {
    // Never fabricate a success or release the ownership lock if D1 is down.
    console.error("[checkout] Could not record uncertain Square outcome:", error);
  }
}

/**
 * Always send the exact JSON snapshot recorded *before* contacting Square.
 * Returning a successful link requires persisting it first.
 */
async function createSquareLink(attempt: CheckoutAttempt, ownerId: string): Promise<Response> {
  let squareRequest: SquareCheckoutRequest;
  try {
    squareRequest = JSON.parse(attempt.square_request_json) as SquareCheckoutRequest;
    if (
      !squareRequest ||
      typeof squareRequest !== "object" ||
      squareRequest.idempotencyKey !== attempt.square_idempotency_key
    ) {
      throw new Error("Saved Square request does not match its idempotency key.");
    }
  } catch (error) {
    console.error("[checkout] Invalid stored Square request:", error);
    return errorResponse("Checkout recovery requires assistance.", "CHECKOUT_RECOVERY_REQUIRED", 503);
  }

  let response: Awaited<ReturnType<typeof squareClient.checkout.paymentLinks.create>>;
  try {
    response = await squareClient.checkout.paymentLinks.create(squareRequest);
  } catch (error) {
    console.error("[checkout] Error creating Square payment link:", error);
    await safelyMarkUncertain(attempt.attempt_id, ownerId);
    if (error instanceof SquareError) {
      const firstError = error.errors?.[0];
      const status = error.statusCode && error.statusCode >= 400 && error.statusCode < 500
        ? error.statusCode
        : 500;
      return Response.json(
        { error: firstError?.detail || "Square rejected the order or payment link request.", code: firstError?.code },
        { status, headers: { "Cache-Control": "no-store" } },
      );
    }
    return errorResponse("Checkout could not be confirmed. Please retry with the same attempt.", "CHECKOUT_UNCERTAIN", 503);
  }

  const checkoutUrl = response.paymentLink?.url ?? response.paymentLink?.longUrl;
  const orderId = response.paymentLink?.orderId;
  if (!checkoutUrl || !orderId) {
    console.error("[checkout] Square response lacked a checkout URL/order ID:", response);
    await safelyMarkUncertain(attempt.attempt_id, ownerId);
    return errorResponse("Square returned an incomplete checkout result. Retry this attempt.", "CHECKOUT_UNCERTAIN", 503);
  }

  try {
    const completed = await completeCheckoutAttempt(attempt.attempt_id, ownerId, checkoutUrl, orderId);
    if (!completed) {
      // Another processing owner won the race or the claim has changed.
      return inProgress();
    }
    return completedResponse(completed);
  } catch (error) {
    console.error("[checkout] Square succeeded but saving the result failed:", error);
    await safelyMarkUncertain(attempt.attempt_id, ownerId);
    return errorResponse("Checkout was created but could not be confirmed. Retry this attempt.", "CHECKOUT_UNCERTAIN", 503);
  }
}

/** Handle an existing ID, including a race losing an INSERT claim. */
async function handleExistingAttempt(attempt: CheckoutAttempt, fingerprint: string): Promise<Response> {
  if (attempt.request_hash !== fingerprint) {
    return errorResponse(
      "This checkout attempt ID was already used for different order details.",
      "CHECKOUT_ATTEMPT_CONFLICT",
      409,
    );
  }

  if (attempt.status === "completed") return completedResponse(attempt);

  if ((attempt.status === "processing" || attempt.status === "uncertain") && !recoveryPermitted(attempt)) {
    return errorResponse(
      "This checkout needs manual reconciliation before it can be retried.",
      "CHECKOUT_RECOVERY_REQUIRED",
      409,
    );
  }

  const ownerId = randomUUID();
  let owned: CheckoutAttempt | null = null;
  try {
    if (attempt.status === "reserved") {
      owned = await beginCheckoutProcessing(attempt.attempt_id, ownerId);
    } else if (attempt.status === "uncertain") {
      owned = await resumeUncertainCheckoutAttempt(attempt.attempt_id, ownerId);
    } else if (attempt.status === "processing") {
      const startedAt = Date.parse(attempt.processing_started_at ?? "");
      const elapsed = Date.now() - startedAt;
      if (!Number.isFinite(elapsed) || elapsed < STALLED_REQUEST_MS) return inProgress();
      owned = await recoverStalledCheckoutAttempt(attempt, ownerId);
    }
  } catch (error) {
    return databaseUnavailable(error);
  }
  if (!owned) return inProgress();
  return createSquareLink(owned, ownerId);
}

/**
 * POST /api/checkout
 * Validates the purchase and Turnstile, then atomically reserves an attempt.
 * Retries use the original Square request and key. No D1 claim = no Square call.
 */
export async function POST(request: Request) {
  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return Response.json({ error: "Request body must contain valid JSON." }, { status: 400 });
  }

  const validation = validateCheckoutRequestBody(rawBody);
  if (!validation.ok) return Response.json({ error: validation.error }, { status: 400 });
  const body = validation.data;

  const ip = visitorIp(request);
  const token = (rawBody as { turnstileToken?: unknown }).turnstileToken;
  const botCheck = await verifyTurnstile(typeof token === "string" ? token : "", ip);
  if (!botCheck.ok) {
    return Response.json(
      { error: BOT_CHECK_MESSAGES[botCheck.reason], code: "BOT_CHECK_FAILED" },
      { status: botCheck.reason === "unavailable" ? 503 : 400 },
    );
  }

  if (!(await consumeRateLimit(CHECKOUT_RATE_LIMIT, ip))) {
    return Response.json(
      { error: "Too many checkout attempts from your connection. Please wait a few minutes and try again.", code: "RATE_LIMITED" },
      { status: 429, headers: { "Retry-After": String(CHECKOUT_RATE_LIMIT.windowMs / 1000) } },
    );
  }

  const fingerprint = checkoutFingerprint(body);
  // Completed results and previously reserved Square requests must not be
  // rebuilt from changed store hours, location, or catalog data.
  try {
    const existing = await getCheckoutAttempt(body.checkoutAttemptId);
    if (existing) return handleExistingAttempt(existing, fingerprint);
  } catch (error) {
    return databaseUnavailable(error);
  }

  let content;
  try {
    content = await getWebsiteContent();
  } catch (error) {
    console.error("[checkout] Could not load authoritative website content:", error);
    return errorResponse("Checkout is temporarily unavailable. Please try again in a few moments.", "STORAGE_UNAVAILABLE", 503);
  }
  if (!content.onlineOrderingEnabled) {
    return Response.json({ error: ONLINE_ORDERING_PAUSED_MESSAGE, code: "ORDERING_PAUSED" }, { status: 400 });
  }

  const timingResult = await validatePickupTiming(body.pickupTiming, { content });
  if (!timingResult.valid) {
    return Response.json({ error: timingResult.error || "Pickup timing is invalid." }, { status: 400 });
  }

  let locationId: string;
  try {
    locationId = await resolveSquareLocationId();
  } catch (error) {
    console.error("[checkout] Failed to resolve Square location:", error);
    return Response.json({ error: "Server misconfiguration: unable to resolve store location." }, { status: 500 });
  }

  let baseUrl: string;
  try {
    baseUrl = applicationUrl();
  } catch (error) {
    console.error("[checkout] Invalid return URL configuration:", error);
    return Response.json({ error: "Checkout is temporarily unavailable. Please try again later." }, { status: 503 });
  }

  try {
    const catalogValidation = await validateCartAgainstCatalog(body.items, locationId);
    if (!catalogValidation.valid) {
      return Response.json({
        error: catalogValidation.error,
        code: catalogValidation.code,
        variationIds: catalogValidation.variationIds,
      }, { status: 400, headers: { "Cache-Control": "no-store" } });
    }
  } catch (error) {
    console.error("[checkout] Catalog validation failed:", error);
    return errorResponse("Checkout is temporarily unavailable. Please try again.", "CATALOG_UNAVAILABLE", 503);
  }

  // Form this payload once. In particular, scheduled pickup and redirect URL
  // must never be recalculated when an existing attempt is recovered.
  const squareRequest: SquareCheckoutRequest = {
    idempotencyKey: body.checkoutAttemptId,
    order: {
      locationId,
      metadata: ONLINE_ORDER_METADATA,
      lineItems: body.items.map((item) => ({
        catalogObjectId: item.variationId,
        quantity: String(item.quantity),
        note: item.notes?.trim() || undefined,
        modifiers: item.modifierOptionIds?.length
          ? item.modifierOptionIds.map((id) => ({ catalogObjectId: id }))
          : undefined,
      })),
      fulfillments: [{
        type: "PICKUP",
        state: "PROPOSED",
        pickupDetails: {
          scheduleType: body.pickupTiming.type === "SCHEDULED" ? "SCHEDULED" : "ASAP",
          pickupAt: body.pickupTiming.type === "SCHEDULED" ? timingResult.pickupTimeIsoUtc : undefined,
          prepTimeDuration: body.pickupTiming.type === "ASAP" ? "PT25M" : undefined,
          recipient: {
            displayName: body.customer.displayName,
            emailAddress: body.customer.email,
            phoneNumber: body.customer.phone,
          },
          note: `Online pickup order for ${body.customer.displayName}`,
        },
      }],
    },
    checkoutOptions: {
      allowTipping: true,
      askForShippingAddress: false,
      redirectUrl: `${baseUrl}/order/confirmation`,
      acceptedPaymentMethods: {
        applePay: true,
        googlePay: true,
        cashAppPay: true,
        afterpayClearpay: false,
      },
    },
  };

  // A unique insert reserves the attempt. Competing requests may both have
  // completed validation; only the saved winner's payload is ever sent.
  try {
    const reserved = await reserveCheckoutAttempt({
      attemptId: body.checkoutAttemptId,
      requestHash: fingerprint,
      squareIdempotencyKey: body.checkoutAttemptId,
      squareRequestJson: JSON.stringify(squareRequest),
    });
    if (reserved) return handleExistingAttempt(reserved, fingerprint);
    const existing = await getCheckoutAttempt(body.checkoutAttemptId);
    if (!existing) return databaseUnavailable(new Error("Claim conflict without a saved attempt"));
    return handleExistingAttempt(existing, fingerprint);
  } catch (error) {
    return databaseUnavailable(error);
  }
}
