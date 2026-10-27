import { requireAdminApi } from "@/app/lib/admin";
import { D1Error } from "@/app/lib/d1";
import {
  cancelOwnershipTransfer,
  createOwnershipTransfer,
} from "@/app/lib/ownership-transfer";
import { sendOwnershipTransferOffer } from "@/app/lib/ownership-transfer-email";
import { consumePasswordRequestLimit } from "@/app/lib/password-request-rate-limit";

export const runtime = "nodejs";

const REQUEST_LIMIT = {
  name: "ownership-transfer-request",
  limit: 5,
  windowMs: 60 * 60 * 1000,
};

function json(body: unknown, status = 200): Response {
  return Response.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
      ...(status === 429 && {
        "Retry-After": "3600",
      }),
    },
  });
}

async function readBody(
  request: Request,
): Promise<Record<string, unknown> | null> {
  try {
    const body: unknown = await request.json();

    if (
      typeof body !== "object" ||
      body === null ||
      Array.isArray(body)
    ) {
      return null;
    }

    return body as Record<string, unknown>;
  } catch {
    return null;
  }
}

// Only the current Owner can offer ownership
// to an existing, active Admin.
export async function POST(request: Request) {
  const access = await requireAdminApi(request, 1);

  if (!access.ok) {
    return access.response;
  }

  const body = await readBody(request);
  const recipientId = body?.recipientAdminId;

  if (
    typeof recipientId !== "string" ||
    !recipientId.trim()
  ) {
    return json(
      { error: "A receiving administrator is required." },
      400,
    );
  }

  try {
    const allowed = await consumePasswordRequestLimit(
      REQUEST_LIMIT,
      access.admin.id,
    );

    if (!allowed) {
      return json(
        {
          error:
            "Too many ownership transfer requests. Try again later.",
        },
        429,
      );
    }
  } catch {
    console.error("Ownership transfer rate limit failed.");

    return json(
      { error: "Ownership transfers are temporarily unavailable." },
      503,
    );
  }

  let created;

  try {
    created = await createOwnershipTransfer(
      access.admin.id,
      recipientId,
    );
  } catch (error) {
    if (
      error instanceof D1Error &&
      /unique constraint failed/i.test(error.message)
    ) {
      return json(
        {
          error:
            "An ownership transfer is already pending.",
        },
        409,
      );
    }

    console.error("Could not create ownership transfer.");

    return json(
      { error: "Ownership transfers are temporarily unavailable." },
      503,
    );
  }

  if (!created) {
    return json(
      {
        error:
          "The receiving account is not eligible, or an ownership transfer is already pending.",
      },
      409,
    );
  }

  // A failed email should not leave an inaccessible pending
  // request blocking future transfers.
  let outcome;

  try {
    outcome = await sendOwnershipTransferOffer(created);
  } catch {
    outcome = "skipped" as const;
  }

  if (outcome === "skipped") {
    try {
      await cancelOwnershipTransfer(
        created.id,
        access.admin.id,
      );
    } catch {
      console.error(
        "Could not cancel a transfer after email delivery failed.",
      );
    }

    return json(
      {
        error:
          "The ownership offer could not be delivered. Please try again.",
      },
      503,
    );
  }

  const sandbox =
    outcome === "sent" &&
    process.env.BREVO_SANDBOX === "1";

  const message =
    sandbox
      ? "The transfer was created in Brevo sandbox mode. No email was delivered."
      : outcome === "printed"
        ? "The transfer was created. The invitation was printed in the server terminal."
        : outcome === "captured"
          ? "The transfer was created. The invitation is available in Mailpit."
          : "The ownership transfer invitation was submitted for delivery.";

  // Never return the secret acceptance token to the Owner.
  return json(
    {
      transfer: {
        id: created.id,
        recipientUsername: created.recipient.username,
        expiresAt: created.expiresAt,
      },
      invitation: {
        submitted: outcome === "sent" && !sandbox,
        message,
      },
    },
    201,
  );
}

// Only the current Owner can cancel an outstanding offer.
export async function DELETE(request: Request) {
  const access = await requireAdminApi(request, 1);

  if (!access.ok) {
    return access.response;
  }

  const body = await readBody(request);
  const transferId = body?.transferId;

  if (
    typeof transferId !== "string" ||
    !transferId.trim()
  ) {
    return json(
      { error: "A transfer ID is required." },
      400,
    );
  }

  try {
    const canceled = await cancelOwnershipTransfer(
      transferId,
      access.admin.id,
    );

    if (!canceled) {
      return json(
        {
          error:
            "No eligible pending ownership transfer was found.",
        },
        409,
      );
    }

    return json({
      message: "Ownership transfer canceled.",
    });
  } catch {
    console.error("Could not cancel ownership transfer.");

    return json(
      { error: "Ownership transfers are temporarily unavailable." },
      503,
    );
  }
}
