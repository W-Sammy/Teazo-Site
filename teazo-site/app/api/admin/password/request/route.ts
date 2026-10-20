import { isIP } from "node:net";
import { after } from "next/server";

import { normalizeEmail } from "@/app/lib/admin-whitelist";
import { sendAdminPasswordEmail } from "@/app/lib/admin-password-email";
import {
  consumePasswordRequestLimit,
  PASSWORD_EMAIL_LIMIT,
  PASSWORD_IP_LIMIT,
} from "@/app/lib/password-request-rate-limit";

export const runtime = "nodejs";

const CONFIRMATION =
  "If this email is eligible, a password link will be sent shortly.";

function json(body: unknown, status = 200, retryAfter?: number) {
  return Response.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
      ...(retryAfter !== undefined && {
        "Retry-After": String(retryAfter),
      }),
    },
  });
}

function visitorIp(request: Request): string | undefined {
  // Matches the existing checkout route's Vercel forwarding convention.
  const forwarded = request.headers
    .get("x-forwarded-for")
    ?.split(",")[0]
    ?.trim();

  return forwarded && isIP(forwarded) ? forwarded : undefined;
}

export async function POST(request: Request) {
  // Only accept requests originating from our application.
  const configuredUrl = process.env.NEXT_PUBLIC_BASE_URL;

  if (!configuredUrl && process.env.NODE_ENV !== "development") {
    return json({ error: "Password requests are unavailable." }, 503);
  }

  let expectedOrigin: string;

  try {
    expectedOrigin = new URL(configuredUrl || request.url).origin;
  } catch {
    return json({ error: "Password requests are unavailable." }, 503);
  }

  if (request.headers.get("origin") !== expectedOrigin) {
    return json({ error: "Request origin is not allowed." }, 403);
  }

  const contentType = request.headers
    .get("content-type")
    ?.split(";")[0]
    .trim()
    .toLowerCase();

  if (contentType !== "application/json") {
    return json({ error: "Send the request as JSON." }, 415);
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return json({ error: "Request body must contain valid JSON." }, 400);
  }

  if (
    typeof body !== "object" ||
    body === null ||
    !("email" in body) ||
    typeof body.email !== "string" ||
    body.email.length > 254
  ) {
    return json({ error: "Enter a valid email address." }, 400);
  }

  const email = normalizeEmail(body.email);

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return json({ error: "Enter a valid email address." }, 400);
  }

  try {
    const ipAllowed = await consumePasswordRequestLimit(
      PASSWORD_IP_LIMIT,
      visitorIp(request),
    );

    if (!ipAllowed) {
      return json(
        { error: "Too many requests. Try again in 15 minutes." },
        429,
        15 * 60,
      );
    }

    const emailAllowed = await consumePasswordRequestLimit(
      PASSWORD_EMAIL_LIMIT,
      email,
    );

    if (emailAllowed) {
      // Perform account lookup and delivery after the response.
      // The response does not wait for an eligible account's email.
      after(async () => {
        try {
          const outcome = await sendAdminPasswordEmail(email);

          if (outcome === "skipped") {
            console.error("Password email delivery is not configured.");
          }
        } catch {
          // Do not log the email, password link, token, or provider payload.
          console.error("Password email request could not be completed.");
        }
      });
    }

    // Email throttling is also hidden behind the same confirmation.
    return json({ message: CONFIRMATION });
  } catch {
    console.error("Password request rate-limit check failed.");

    return json(
      { error: "Password requests are temporarily unavailable." },
      503,
    );
  }
}
