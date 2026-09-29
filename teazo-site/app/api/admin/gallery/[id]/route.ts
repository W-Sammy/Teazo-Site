import { requireAdminApi } from "@/app/lib/admin";

export const runtime = "nodejs";

function errorResponse(
  message: string,
  status: number,
): Response {
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

/**
 * Admin gallery deletion endpoint.
 *
 * Gallery deletion will be connected to the shared
 * gallery storage/database functionality when it is available.
 */
export async function DELETE(
  request: Request,
): Promise<Response> {
  const access = await requireAdminApi(request, 3);

  if (!access.ok) {
    return access.response;
  }

  return errorResponse(
    "Gallery image deletion is not available yet.",
    503,
  );
}