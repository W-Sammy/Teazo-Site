import { requireAdminApi } from "@/app/lib/admin";
import { D1Error } from "@/app/lib/d1";
import {
  decideOwnershipTransfer,
} from "@/app/lib/ownership-transfer";
import {
  sendOwnershipTransferCompleted,
  sendOwnershipTransferDeclined,
} from "@/app/lib/ownership-transfer-email";

export const runtime = "nodejs";

function json(body: unknown, status = 200): Response {
  return Response.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
    },
  });
}

// The receiving Admin must explicitly accept or decline.
// Viewing the invitation or signing in does not transfer ownership.
export async function POST(request: Request) {
  const access = await requireAdminApi(request, 2);

  if (!access.ok) {
    return access.response;
  }

  if (access.admin.role_id !== 2) {
    return json(
      {
        error:
          "Only the receiving Admin can respond to an ownership offer.",
      },
      403,
    );
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid request body." }, 400);
  }

  if (
    typeof body !== "object" ||
    body === null ||
    Array.isArray(body) ||
    !("token" in body) ||
    typeof body.token !== "string" ||
    !("decision" in body) ||
    (body.decision !== "accepted" &&
      body.decision !== "declined")
  ) {
    return json(
      { error: "A valid token and decision are required." },
      400,
    );
  }

  let transfer;

  try {
    transfer = await decideOwnershipTransfer(
      body.token,
      access.admin.id,
      body.decision,
    );
  } catch (error) {
    if (
      error instanceof D1Error &&
      /ownership transfer link expired|ownership transfer accounts are no longer eligible|invalid ownership transfer status transition/i.test(
        error.message,
      )
    ) {
      return json(
        {
          error:
            "This ownership offer is no longer available.",
        },
        409,
      );
    }

    console.error("Could not process ownership decision.");

    return json(
      {
        error:
          "Ownership transfers are temporarily unavailable.",
      },
      503,
    );
  }

  if (!transfer) {
    return json(
      {
        error:
          "This ownership offer is invalid, expired, or already resolved.",
      },
      409,
    );
  }

  if (body.decision === "declined") {
    // Notification failure does not reverse the decline.
    try {
      await sendOwnershipTransferDeclined(transfer);
    } catch {
      console.error(
        "Ownership decline notification failed.",
      );
    }

    return json({
      status: "declined",
      message:
        "Ownership transfer declined. Both accounts retain their existing permissions.",
    });
  }

  // At this point, the database trigger has already
  // exchanged the roles and invalidated both sessions.
  // Notification failures must never reverse that transfer.
  try {
    const outcomes =
      await sendOwnershipTransferCompleted(transfer);

    if (
      outcomes.some(
        (outcome) => outcome.status === "rejected",
      )
    ) {
      console.error(
        "One or more ownership completion notifications failed.",
      );
    }
  } catch {
    console.error(
      "Ownership completion notifications failed.",
    );
  }

  return json({
    status: "accepted",
    message:
      "Ownership transfer completed. Both accounts must sign in again to use their updated permissions.",
  });
}
