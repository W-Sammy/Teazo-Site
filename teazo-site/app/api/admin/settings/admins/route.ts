import { requireAdminApi } from "@/app/lib/admin";
import {
  createSettingsAdmin,
  listSettingsAdmins,
} from "@/app/lib/queries/settings";

function errorResponse(message: string, status: number) {
  return Response.json(
    { error: message },
    {
      status,
      headers: { "Cache-Control": "no-store" },
    },
  );
}

// Both Owner and Admin may view the administrator list.
export async function GET(request: Request) {
  try {
    const access = await requireAdminApi(request, 2);

    if (!access.ok) {
      return access.response;
    }

    return Response.json(
      {
        admins: await listSettingsAdmins(),

        // Only the Owner can create or remove administrators.
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

  try {
    // The database query automatically assigns role 2 (Admin).
    // Client-supplied roles and permission flags are ignored.
    const admin = await createSettingsAdmin({
      username,
      email,
    });

    return Response.json(
      { admin },
      {
        status: 201,
        headers: { "Cache-Control": "no-store" },
      },
    );
  } catch (error) {
    console.error("Could not create admin:", error);

    return errorResponse(
      "The admin could not be added. The email may already exist.",
      400,
    );
  }
}
