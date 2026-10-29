import { requireAdminApi } from "@/app/lib/admin";
import {
  removeSettingsAdmin,
  updateSettingsAdminUsername,
} from "@/app/lib/queries/settings";

const MAX_USERNAME_LENGTH = 40;

function errorResponse(message: string, status: number) {
  return Response.json(
    { error: message },
    {
      status,
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}

// Role changes and Manage Admins permission changes
// remain unsupported in the two-role system.
//
// PATCH supports username updates only.
// Only the Owner can edit administrator account details.
export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  // Require Owner (role 1).
  // Regular Admins (role 2) receive HTTP 403.
  const access = await requireAdminApi(request, 1);

  if (!access.ok) {
    return access.response;
  }

  const { id } = await context.params;

  if (!id.trim()) {
    return errorResponse(
      "Invalid administrator ID.",
      400,
    );
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return errorResponse(
      "Invalid JSON request body.",
      400,
    );
  }

  if (
    typeof body !== "object" ||
    body === null ||
    Array.isArray(body)
  ) {
    return errorResponse(
      "Invalid account update request.",
      400,
    );
  }

  // Explicitly reject attempts to update roles,
  // permissions, email addresses, or other fields.
  const fields = Object.keys(body);

  if (
    fields.length !== 1 ||
    fields[0] !== "username"
  ) {
    return errorResponse(
      "Only the username field may be updated.",
      400,
    );
  }

  const { username } = body as {
    username?: unknown;
  };

  if (typeof username !== "string") {
    return errorResponse(
      "Username must be a string.",
      400,
    );
  }

  const normalizedUsername = username.trim();

  if (!normalizedUsername) {
    return errorResponse(
      "Username is required.",
      400,
    );
  }

  if (normalizedUsername.length > MAX_USERNAME_LENGTH) {
    return errorResponse(
      `Username must be ${MAX_USERNAME_LENGTH} characters or fewer.`,
      400,
    );
  }

  try {
    // D1 updates only username and updated_at.
    // Account ID, email, role, permissions, password,
    // and session version remain unchanged.
    const admin = await updateSettingsAdminUsername(
      id,
      normalizedUsername,
    );

    return Response.json(
      { admin },
      {
        status: 200,
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  } catch (error) {
    if (
      error instanceof Error &&
      error.message ===
        "Admin not found or cannot be changed."
    ) {
      return errorResponse(
        "Admin not found or cannot be changed.",
        404,
      );
    }

    console.error(
      "Could not update administrator username:",
      error,
    );

    return errorResponse(
      "The administrator username could not be updated.",
      500,
    );
  }
}

// Only the Owner can remove administrator accounts.
export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  // Require Owner (role 1).
  // Regular Admins (role 2) receive HTTP 403.
  const access = await requireAdminApi(request, 1);

  if (!access.ok) {
    return access.response;
  }

  const { id } = await context.params;

  if (!id.trim()) {
    return errorResponse(
      "Invalid administrator ID.",
      400,
    );
  }

  try {
    // The database query independently protects
    // the Owner account from deletion.
    await removeSettingsAdmin(id);

    return new Response(null, {
      status: 204,
    });
  } catch (error) {
    console.error("Could not delete admin:", error);

    return errorResponse(
      "The admin could not be deleted.",
      400,
    );
  }
}
