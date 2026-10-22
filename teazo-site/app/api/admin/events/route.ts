import { requireAdminApi } from "@/app/lib/admin";
import { D1Error } from "@/app/lib/d1";
import { listEvents, softDeleteEndedEvents } from "@/app/lib/queries/events";
import { saveEvent } from "@/app/lib/event-api";

function errorResponse(message: string, status: number) {
  return Response.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } });
}

export async function GET(request: Request) {
  const access = await requireAdminApi(request, 3);
  if (!access.ok) return access.response;
  try {
    return Response.json(await listEvents(), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Could not load events:", error);
    return errorResponse("The events could not be loaded.", error instanceof D1Error ? 503 : 500);
  }
}

export async function POST(request: Request) {
  return saveEvent(request, null);
}

export async function DELETE(request: Request) {
  const access = await requireAdminApi(request, 2);
  if (!access.ok) return access.response;
  try {
    const body = await request.json().catch(() => ({}));
    if (body?.endedOnly !== true) return errorResponse("Only ended-event cleanup is supported here.", 400);
    await softDeleteEndedEvents();
    return new Response(null, { status: 204 });
  } catch (error) {
    console.error("Could not delete ended events:", error);
    return errorResponse("The ended events could not be deleted.", 503);
  }
}
