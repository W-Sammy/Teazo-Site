import { getAdmin } from "@/app/lib/admin";
import { removeSettingsAdmin, updateSettingsAdminInvitePermission, updateSettingsAdminRole } from "@/app/lib/queries/settings";
import type { AdminRole } from "@/app/types/admin-perms";

function errorResponse(message: string, status: number) {
  return Response.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } });
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!await getAdmin(1)) return errorResponse("Only the owner can change admin access.", 403);
  try {
    const { id } = await context.params;
    const input = await request.json() as { role?: AdminRole; canInviteUsers?: boolean };
    if (input.role === undefined && input.canInviteUsers === undefined) {
      return errorResponse("No admin change was provided.", 400);
    }
    if (input.role !== undefined && ![1, 2, 3].includes(input.role)) {
      return errorResponse("Invalid admin role.", 400);
    }
    const admin = input.role !== undefined
      ? await updateSettingsAdminRole(id, input.role)
      : await updateSettingsAdminInvitePermission(id, input.canInviteUsers === true);
    return Response.json({ admin });
  } catch (error) {
    console.error("Could not update admin:", error);
    return errorResponse("The admin could not be updated.", 400);
  }
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  if (!await getAdmin(1)) return errorResponse("Only the owner can delete admins.", 403);
  try {
    const { id } = await context.params;
    await removeSettingsAdmin(id);
    return new Response(null, { status: 204 });
  } catch (error) {
    console.error("Could not delete admin:", error);
    return errorResponse("The admin could not be deleted.", 400);
  }
}
