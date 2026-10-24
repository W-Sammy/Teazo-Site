import { isIP } from "node:net";

import { savePasswordWithToken } from "@/app/lib/admin-password-tokens";
import { consumePasswordRequestLimit } from "@/app/lib/password-request-rate-limit";
import { after } from "next/server";
import { sendAdminPasswordChangedEmail } from "@/app/lib/admin-password-email";

export const runtime = "nodejs";

const SUBMISSION_LIMIT = {
  name: "password-complete-ip",
  limit: 20,
  windowMs: 15 * 60 * 1000,
};

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
  const forwarded = request.headers
    .get("x-forwarded-for")
    ?.split(",")[0]
    ?.trim();

  return forwarded && isIP(forwarded) ? forwarded : undefined;
}

export async function POST(request: Request) {
  const configuredUrl = process.env.NEXT_PUBLIC_BASE_URL;

  if (!configuredUrl && process.env.NODE_ENV !== "development") {
    return json({ error: "Password updates are unavailable." }, 503);
  }

  let expectedOrigin: string;

  try {
    expectedOrigin = new URL(
      configuredUrl || request.url,
    ).origin;
  } catch {
    return json({ error: "Password updates are unavailable." }, 503);
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

  // Limit attempts before password hashing or token lookup.
  try {
    const allowed = await consumePasswordRequestLimit(
      SUBMISSION_LIMIT,
      visitorIp(request),
    );

    if (!allowed) {
      return json(
        { error: "Too many attempts. Try again in 15 minutes." },
        429,
        15 * 60,
      );
    }
  } catch {
    console.error("Password submission rate-limit check failed.");

    return json(
      { error: "Password updates are temporarily unavailable." },
      503,
    );
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
    !("token" in body) ||
    !("purpose" in body) ||
    !("password" in body) ||
    !("confirmPassword" in body) ||
    typeof body.token !== "string" ||
    typeof body.password !== "string" ||
    typeof body.confirmPassword !== "string" ||
    (body.purpose !== "setup" && body.purpose !== "reset")
  ) {
    return json({ error: "Invalid password submission." }, 400);
  }

  if (!/^[A-Za-z0-9_-]{43}$/.test(body.token)) {
    return json(
      {
        error: "This password link is invalid or has expired.",
        code: "INVALID_TOKEN",
      },
      400,
    );
  }

  // 128 Unicode code points use at most 256 UTF-16 code units.
  // The helper performs the exact character-count check.
  if (
    body.password.length > 256 ||
    body.confirmPassword.length > 256
  ) {
    return json(
      {
        error: "Use a password between 15 and 128 characters.",
        code: "INVALID_PASSWORD",
      },
      400,
    );
  }

  try {
    const result = await savePasswordWithToken(
      body.token,
      body.purpose,
      body.password,
      body.confirmPassword,
    );

    if (!result.ok) {
      switch (result.reason) {
        case "invalid-password":
          return json(
            {
              error: "Use a password between 15 and 128 characters.",
              code: "INVALID_PASSWORD",
            },
            400,
          );

        case "password-mismatch":
          return json(
            {
              error: "Your passwords do not match.",
              code: "PASSWORD_MISMATCH",
            },
            400,
          );

        case "invalid-token":
          return json(
            {
              error: "This password link is invalid or has expired.",
              code: "INVALID_TOKEN",
            },
            400,
          );
      }
    }

    const recipient = result.adminEmail;

    after(async () => {
      try {
        const outcome = await sendAdminPasswordChangedEmail(recipient);

        if (outcome === "skipped") {
          console.error(
            "Password changed, but confirmation email delivery is not configured.",
          );
        }
      } catch {
        // The password change already succeeded.
        // Do not log passwords, tokens, or provider error payloads.
        console.error(
          "Password changed, but the confirmation email could not be sent.",
        );
      }
    });

    return json({
      message: "Your password has been saved. Sign in to continue.",
    });
  } catch {
    // Never log the request body, password, or token.
    console.error("Password update could not be completed.");

    return json(
      {
        error:
          "Unable to complete the password update. Try signing in or request a new link.",
      },
      503,
    );
  }
}