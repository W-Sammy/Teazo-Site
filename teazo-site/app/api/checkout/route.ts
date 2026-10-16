import { squareClient } from "@/app/lib/square";
import { SquareError } from "square";
import { validateCheckoutRequestBody } from "@/app/lib/checkout-validators";
import { ONLINE_ORDERING_PAUSED_MESSAGE, validatePickupTiming } from "@/app/lib/store-hours";
import { getWebsiteContent } from "@/app/lib/website-content";
import { resolveSquareLocationId } from "@/app/lib/square-location";
import { verifyTurnstile } from "@/app/lib/turnstile";
import { ONLINE_ORDER_METADATA } from "@/app/lib/online-orders";
import { CHECKOUT_RATE_LIMIT, consumeRateLimit } from "@/app/lib/queries/rate-limit";

export const runtime = "nodejs";

const BOT_CHECK_MESSAGES = {
  missing: "Please wait for the security check above the checkout button to finish, then try again.",
  rejected: "The security check didn't pass. Please try it again.",
  unavailable: "The security check isn't working right now. Please try again in a moment.",
} as const;

/** The visitor's IP as Vercel reports it, for the rate limit and as a Turnstile signal. */
function visitorIp(request: Request): string | undefined {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded && /^[0-9a-fA-F:.]{3,45}$/.test(forwarded) ? forwarded : undefined;
}

/**
 * Returns the canonical base URL for post-payment redirects.
 */
function getSiteBaseUrl(): string {
  const configured = process.env.NEXT_PUBLIC_BASE_URL?.trim();
  if (configured) {
    return configured.replace(/\/+$/, "");
  }
  const vercelUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (vercelUrl) {
    return `https://${vercelUrl}`;
  }
  return "http://localhost:3000";
}

/**
 * POST /api/checkout
 *
 * Validates cart items and customer pickup details, enforces store hours
 * and preparation lead times, constructs a Square Order with PICKUP fulfillment,
 * and generates a Square Hosted Checkout payment link.
 *
 * @returns 200 - { checkoutUrl: string, orderId: string }
 * @returns 400 - Validation failure (missing fields, failed bot check, ordering paused, store closed, lead time violation, etc.)
 * @returns 429 - Too many attempts from this visitor
 * @returns 500 - Server or Square API error
 * @returns 503 - The bot check can't run right now
 */
export async function POST(request: Request) {
  // 1. Parse JSON body
  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return Response.json(
      { error: "Request body must contain valid JSON." },
      { status: 400 },
    );
  }

  // 2. Validate request payload structure
  const validation = validateCheckoutRequestBody(rawBody);
  if (!validation.ok) {
    return Response.json({ error: validation.error }, { status: 400 });
  }
  const body = validation.data;

  // 2a. Bot check, before anything reaches Square
  const ip = visitorIp(request);
  const token = (rawBody as { turnstileToken?: unknown }).turnstileToken;
  const botCheck = await verifyTurnstile(typeof token === "string" ? token : "", ip);
  if (!botCheck.ok) {
    return Response.json(
      { error: BOT_CHECK_MESSAGES[botCheck.reason], code: "BOT_CHECK_FAILED" },
      { status: botCheck.reason === "unavailable" ? 503 : 400 },
    );
  }

  // 2b. Limit attempts per visitor. Only attempts that passed the bot check
  // count, so junk requests can't use up the limit for everyone sharing an IP.
  // Every attempt that gets past here creates a Square order.
  if (!(await consumeRateLimit(CHECKOUT_RATE_LIMIT, ip))) {
    return Response.json(
      {
        error: "Too many checkout attempts from your connection. Please wait a few minutes and try again.",
        code: "RATE_LIMITED",
      },
      {
        status: 429,
        headers: { "Retry-After": String(CHECKOUT_RATE_LIMIT.windowMs / 1000) },
      },
    );
  }

  // 3. Refuse orders while the owner has paused online ordering
  const content = await getWebsiteContent();
  if (!content.onlineOrderingEnabled) {
    return Response.json(
      { error: ONLINE_ORDERING_PAUSED_MESSAGE, code: "ORDERING_PAUSED" },
      { status: 400 },
    );
  }

  // 4. Validate store operating hours, holiday exceptions, and pickup lead times
  const timingResult = await validatePickupTiming(body.pickupTiming, { content });
  if (!timingResult.valid) {
    return Response.json(
      { error: timingResult.error || "Pickup timing is invalid." },
      { status: 400 },
    );
  }

  // 5. Resolve active Square store location
  let locationId: string;
  try {
    locationId = await resolveSquareLocationId();
  } catch (locationErr) {
    console.error("[checkout] Failed to resolve Square location:", locationErr);
    return Response.json(
      { error: "Server misconfiguration: unable to resolve store location." },
      { status: 500 },
    );
  }

  // 6. Construct Order and create Square Payment Link
  const baseUrl = getSiteBaseUrl();
  // Square automatically appends ?orderId=...&transactionId=... to the redirectUrl upon successful payment
  const redirectUrl = `${baseUrl}/order/confirmation`;

  try {
    const response = await squareClient.checkout.paymentLinks.create({
      idempotencyKey: crypto.randomUUID(),
      order: {
        locationId,
        // Lets /api/orders/[id] show this order's receipt, and only orders like it.
        metadata: ONLINE_ORDER_METADATA,
        lineItems: body.items.map((item) => ({
          catalogObjectId: item.variationId,
          quantity: String(item.quantity),
          note: item.notes?.trim() || undefined,
          modifiers:
            item.modifierOptionIds && item.modifierOptionIds.length > 0
              ? item.modifierOptionIds.map((id) => ({
                  catalogObjectId: id,
                }))
              : undefined,
        })),
        fulfillments: [
          {
            type: "PICKUP",
            state: "PROPOSED",
            pickupDetails: {
              scheduleType:
                body.pickupTiming.type === "SCHEDULED" ? "SCHEDULED" : "ASAP",
              pickupAt:
                body.pickupTiming.type === "SCHEDULED"
                  ? timingResult.pickupTimeIsoUtc
                  : undefined,
              prepTimeDuration:
                body.pickupTiming.type === "ASAP" ? "PT25M" : undefined,
              recipient: {
                displayName: body.customer.displayName,
                emailAddress: body.customer.email,
                phoneNumber: body.customer.phone,
              },
              note: `Online pickup order for ${body.customer.displayName}`,
            },
          },
        ],
      },
      checkoutOptions: {
        allowTipping: true,
        askForShippingAddress: false,
        redirectUrl,
        acceptedPaymentMethods: {
          applePay: true,
          googlePay: true,
          cashAppPay: true,
          afterpayClearpay: false,
        },
      },
    });

    const checkoutUrl =
      response.paymentLink?.url ?? response.paymentLink?.longUrl;
    const orderId = response.paymentLink?.orderId;

    if (!checkoutUrl || !orderId) {
      console.error(
        "[checkout] Square API response missing paymentLink URL or orderId:",
        response,
      );
      return Response.json(
        { error: "Square did not return a valid checkout URL or order ID." },
        { status: 500 },
      );
    }

    return Response.json(
      {
        checkoutUrl,
        orderId,
      },
      { status: 200 },
    );
  } catch (error) {
    console.error("[checkout] Error creating Square payment link:", error);

    if (error instanceof SquareError) {
      const firstError = error.errors?.[0];
      const clientStatus =
        error.statusCode && error.statusCode >= 400 && error.statusCode < 500
          ? error.statusCode
          : 500;

      return Response.json(
        {
          error:
            firstError?.detail ||
            "Square rejected the order or payment link request.",
          code: firstError?.code,
        },
        { status: clientStatus },
      );
    }

    const message =
      error instanceof Error ? error.message : "Failed to initiate checkout.";
    return Response.json({ error: message }, { status: 500 });
  }
}
