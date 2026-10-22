
import { requireAdminApi } from "@/app/lib/admin";
import { removeSettingsAdmin } from "@/app/lib/queries/settings";

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
// are no longer supported in the two-role system.
// Therefore, this route does not implement PATCH.

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
