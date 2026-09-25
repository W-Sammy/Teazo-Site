import { getAdmin } from "@/app/lib/admin";
import { removeSettingsAdmin, updateSettingsAdminManagePermission, updateSettingsAdminRole } from "@/app/lib/queries/settings";
import type { AdminRole } from "@/app/types/admin-perms";

function errorResponse(message: string, status: number) {
  return Response.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } });
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const viewer = await getAdmin(2);
  if (!viewer || (viewer.role_id === 2 && viewer.can_invite_users !== 1)) {
    return errorResponse("You do not have permission to change admin access.", 403);
  }
  try {
    const { id } = await context.params;
    const input = await request.json() as { role?: AdminRole; canManageAdmins?: boolean };
    if (input.role === undefined && input.canManageAdmins === undefined) {
      return errorResponse("No admin change was provided.", 400);
    }
    if (input.role !== undefined && ![1, 2, 3].includes(input.role)) {
      return errorResponse("Invalid admin role.", 400);
    }
    const admin = input.role !== undefined
      ? await updateSettingsAdminRole(id, input.role)
      : await updateSettingsAdminManagePermission(id, input.canManageAdmins === true);
    return Response.json({ admin });
  } catch (error) {
    console.error("Could not update admin:", error);
    return errorResponse("The admin could not be updated.", 400);
  }
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const viewer = await getAdmin(2);
  if (!viewer || (viewer.role_id === 2 && viewer.can_invite_users !== 1)) {
    return errorResponse("You do not have permission to delete admins.", 403);
  }
  try {
    const { id } = await context.params;
    await removeSettingsAdmin(id);
    return new Response(null, { status: 204 });
  } catch (error) {
    console.error("Could not delete admin:", error);
    return errorResponse("The admin could not be deleted.", 400);
  }
}
