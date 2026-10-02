import { requireAdminApi } from "@/app/lib/admin";
import { softDeleteEvent } from "@/app/lib/queries/events";
import { saveEvent } from "@/app/lib/event-api";

type RouteContext = { params: Promise<{ id: string }> };

function errorResponse(message: string, status: number) {
  return Response.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } });
}

export async function PATCH(request: Request, context: RouteContext) {
  const { id } = await context.params;
  return saveEvent(request, id);
}

export async function DELETE(request: Request, context: RouteContext) {
  const access = await requireAdminApi(request, 2);
  if (!access.ok) return access.response;
  try {
    const { id } = await context.params;
    await softDeleteEvent(id);
    return new Response(null, { status: 204 });
  } catch (error) {
    console.error("Could not delete event:", error);
    return errorResponse("The event could not be deleted.", 503);
  }
}
