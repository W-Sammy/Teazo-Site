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
 * Admin gallery upload endpoint.
 *
 * Gallery persistence will be connected to the shared
 * gallery storage/database functionality when it is available.
 */
export async function POST(
  request: Request,
): Promise<Response> {
  const access = await requireAdminApi(request, 3);

  if (!access.ok) {
    return access.response;
  }

  return errorResponse(
    "Gallery image upload is not available yet.",
    503,
  );
}