import { requireAdminApi } from "@/app/lib/admin";
import { findOwnershipTransfer } from "@/app/lib/ownership-transfer";

export const runtime = "nodejs";

function json(body: unknown, status = 200): Response {
  return Response.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
    },
  });
}

// Reviewing a transfer does not consume its token
// or change any administrator permissions.
export async function POST(request: Request) {
  const access = await requireAdminApi(request, 2);

  if (!access.ok) {
    return access.response;
  }

  // The current Owner cannot review an offer as its recipient.
  if (access.admin.role_id !== 2) {
    return json(
      { error: "Only the receiving Admin can review this offer." },
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
    typeof body.token !== "string"
  ) {
    return json(
      { error: "A valid transfer token is required." },
      400,
    );
  }

  try {
    const transfer = await findOwnershipTransfer(
      body.token,
      access.admin.id,
    );

    if (!transfer) {
      return json(
        {
          error:
            "This ownership transfer is invalid, expired, or no longer available.",
        },
        404,
      );
    }

    return json({
      transfer: {
        id: transfer.id,
        ownerUsername: transfer.owner.username,
        recipientUsername: transfer.recipient.username,
        expiresAt: transfer.expiresAt,
      },
    });
  } catch {
    console.error("Could not review ownership transfer.");

    return json(
      { error: "Ownership transfers are temporarily unavailable." },
      503,
    );
  }
}
