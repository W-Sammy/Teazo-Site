import { requireAdminApi } from "@/app/lib/admin";
import { createSettingsAdmin, listSettingsAdmins } from "@/app/lib/queries/settings";
import type { NewAdminInput } from "@/app/types/admin-perms";

function errorResponse(message: string, status: number) {
  return Response.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } });
}

export async function GET(request: Request) {
  try {
    const access = await requireAdminApi(request, 3);
    if (!access.ok) return access.response;
    const viewer = access.admin;
    return Response.json(
      {
        admins: await listSettingsAdmins(),
        canEdit: viewer?.role_id === 1 ||
          (viewer?.role_id === 2 && viewer.can_invite_users === 1),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("Could not load admins:", error);
    return errorResponse("The admins could not be loaded.", 503);
  }
}

export async function POST(request: Request) {
  try {
    const access = await requireAdminApi(request, 2);
    if (!access.ok) return access.response;
    if (access.admin.role_id === 2 && access.admin.can_invite_users !== 1) {
      return errorResponse("You do not have permission to add admins.", 403);
    }
    const input = await request.json() as NewAdminInput;
    if (!input.username?.trim() || !input.email?.trim()) return errorResponse("Username and email are required.", 400);
    if (![1, 2, 3].includes(input.role)) return errorResponse("Invalid admin role.", 400);
    return Response.json({ admin: await createSettingsAdmin(input) }, { status: 201 });
  } catch (error) {
    console.error("Could not create admin:", error);
    return errorResponse("The admin could not be added. The email may already exist.", 400);
  }
}
