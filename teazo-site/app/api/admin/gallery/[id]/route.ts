
import { requireAdminApi } from "@/app/lib/admin";
import { D1Error } from "@/app/lib/d1";
import { removeGalleryImage } from "@/app/lib/gallery";

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
 * Requires an authenticated administrator and uses
 * the shared gallery functionality to remove images
 * from the active database records and queue their
 * stored files for cleanup.
 */
export async function DELETE(
  request: Request,
  context: {
    params: Promise<{ id: string }>;
  },
): Promise<Response> {
  const access = await requireAdminApi(request, 3);

  if (!access.ok) {
    return access.response;
  }

  try {
    const { id } = await context.params;

    if (!id) {
      return errorResponse(
        "An image ID is required.",
        400,
      );
    }

    const deleted = await removeGalleryImage(id);

    if (!deleted) {
      return errorResponse(
        "The gallery image was not found.",
        404,
      );
    }

    return new Response(null, {
      status: 204,
      headers: {
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    if (error instanceof D1Error) {
      console.error(
        "Gallery database deletion failed:",
        error,
      );

      return errorResponse(
        "The image could not be removed from the database.",
        503,
      );
    }

    console.error(
      "Unexpected gallery deletion failure:",
      error,
    );

    return errorResponse(
      "The image could not be deleted. Please try again.",
      500,
    );
  }
}
