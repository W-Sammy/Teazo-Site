import { requireAdminApi } from "@/app/lib/admin";
import { sendAdminInvite } from "@/app/lib/admin-invite";
import { findSettingsAdminForInvitation } from "@/app/lib/queries/settings";
import { consumePasswordRequestLimit } from "@/app/lib/password-request-rate-limit";

export const runtime = "nodejs";

const REQUESTER_LIMIT = {
  name: "admin-invite-resend-requester",
  limit: 10,
  windowMs: 15 * 60 * 1000,
};

const TARGET_LIMIT = {
  name: "admin-invite-resend-target",
  limit: 3,
  windowMs: 15 * 60 * 1000,
};

function json(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
      ...(status === 429 && { "Retry-After": "900" }),
    },
  });
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const access = await requireAdminApi(request, 2);

    if (!access.ok) return access.response;

    const viewer = access.admin;

    if (
      viewer.role_id !== 1 &&
      !(viewer.role_id === 2 && viewer.can_invite_users === 1)
    ) {
      return json(
        { error: "You do not have permission to resend invitations." },
        403,
      );
    }

    const requesterAllowed = await consumePasswordRequestLimit(
      REQUESTER_LIMIT,
      viewer.id,
    );

    if (!requesterAllowed) {
      return json(
        { error: "Too many invitation requests. Try again in 15 minutes." },
        429,
      );
    }

    const { id } = await context.params;
    const admin = await findSettingsAdminForInvitation(id);

    if (!admin) {
      return json(
        {
          error:
            "This account is not eligible for a setup invitation. Refresh the admin list.",
        },
        409,
      );
    }

    const targetAllowed = await consumePasswordRequestLimit(
      TARGET_LIMIT,
      admin.id,
    );

    if (!targetAllowed) {
      return json(
        {
          error:
            "Too many invitations for this account. Try again in 15 minutes.",
        },
        429,
      );
    }

    // Await delivery so Settings can display success or failure.
    // The token helper checks target eligibility again during insertion.
    const outcome = await sendAdminInvite({
      adminId: admin.id,
      email: admin.email,
      username: admin.username,
      role: admin.role,
      canManageAdmins: admin.canManageAdmins,
      invitedBy: viewer.username,
    });

    if (outcome === "failed" || outcome === "skipped") {
      return json(
        {
          error:
            "The invitation could not be sent. Refresh the list and try again.",
        },
        503,
      );
    }

    return json({
      message:
        outcome === "sent"
          ? "Invitation submitted for delivery."
          : "Invitation generated. Check your local email output.",
    });
  } catch {
    console.error("Admin invitation resend could not be completed.");

    return json(
      { error: "Invitations are temporarily unavailable. Try again later." },
      503,
    );
  }
}