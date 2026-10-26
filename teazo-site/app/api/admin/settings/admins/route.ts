import { requireAdminApi } from "@/app/lib/admin";
import {
  createSettingsAdmin,
  listSettingsAdmins,
} from "@/app/lib/queries/settings";
import { sendAdminInvite } from "@/app/lib/admin-invite";

export const runtime = "nodejs";

function errorResponse(message: string, status: number) {
  return Response.json(
    { error: message },
    {
      status,
      headers: { "Cache-Control": "no-store" },
    },
  );
}

// Only the Owner may view the administrator list.
export async function GET(request: Request) {
  try {
    const access = await requireAdminApi(request, 1);

    if (!access.ok) {
      return access.response;
    }

    return Response.json(
      {
        admins: await listSettingsAdmins(),
        canEdit: access.admin.role_id === 1,
      },
      {
        headers: { "Cache-Control": "no-store" },
      },
    );
  } catch (error) {
    console.error("Could not load admins:", error);

    return errorResponse(
      "The admins could not be loaded.",
      503,
    );
  }
}

// Only the Owner may create administrator accounts.
export async function POST(request: Request) {
  const access = await requireAdminApi(request, 1);

  if (!access.ok) {
    return access.response;
  }

  let input: unknown;

  try {
    input = await request.json();
  } catch {
    return errorResponse("Invalid request body.", 400);
  }

  if (
    typeof input !== "object" ||
    input === null ||
    Array.isArray(input) ||
    !("username" in input) ||
    typeof input.username !== "string" ||
    !("email" in input) ||
    typeof input.email !== "string"
  ) {
    return errorResponse(
      "Username and email are required.",
      400,
    );
  }

  const username = input.username.trim();
  const email = input.email.trim();

  if (!username || !email) {
    return errorResponse(
      "Username and email are required.",
      400,
    );
  }

  let admin: Awaited<ReturnType<typeof createSettingsAdmin>>;

  try {
    // Client-supplied roles and permission flags are ignored.
    // The query always creates a role-2 Admin.
    admin = await createSettingsAdmin({
      username,
      email,
    });
  } catch (error) {
    console.error("Could not create admin:", error);

    return errorResponse(
      "The admin could not be added. The email may already exist.",
      400,
    );
  }

  // The account is already saved. Email failures must not
  // turn successful account creation into an API failure.
  let outcome: Awaited<ReturnType<typeof sendAdminInvite>>;

  try {
    outcome = await sendAdminInvite({
      adminId: admin.id,
      email: admin.email,
      username: admin.username,
      role: admin.role,
      invitedBy: access.admin.username,
    });
  } catch {
    outcome = "failed";
  }

  const submitted =
    outcome === "sent" && process.env.BREVO_SANDBOX !== "1";

  let message: string;

  if (submitted) {
    message =
      "Admin account created. Invitation submitted for delivery.";
  } else if (outcome === "printed") {
    message =
      "Admin account created. The invitation was printed in the server terminal; no email was sent.";
  } else if (outcome === "captured") {
    message =
      "Admin account created. The invitation is available in the local Mailpit inbox.";
  } else if (
    outcome === "sent" &&
    process.env.BREVO_SANDBOX === "1"
  ) {
    message =
      "Admin account created. Brevo sandbox mode is enabled, so no email was delivered.";
  } else {
    message =
      "Admin account created, but the invitation could not be sent. Open this admin's three-dot menu and choose Resend Invitation to retry.";
  }

  return Response.json(
    {
      admin,
      invitation: {
        submitted,
        message,
      },
    },
    {
      status: 201,
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}
