import { requireAdminApi } from "@/app/lib/admin";
import { D1Error } from "@/app/lib/d1";
import {
  editGalleryImageMetadata,
  GalleryInputError,
  removeGalleryImage,
  replaceGalleryImage,
} from "@/app/lib/gallery";
import { MediaError } from "@/app/lib/media";

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
 * Update image metadata, optionally replacing its stored file.
 */
export async function PATCH(
  request: Request,
  context: {
    params: Promise<{ id: string }>;
  },
): Promise<Response> {
  // Gallery write access: role 1 or 2, with the existing same-origin guard.
  const access = await requireAdminApi(request, 2);

  if (!access.ok) {
    return access.response;
  }

  try {
    const { id } = await context.params;

    if (!id?.trim()) {
      return errorResponse(
        "An image ID is required.",
        400,
      );
    }

    const contentType =
      request.headers.get("content-type") ?? "";

    if (
      !contentType
        .toLowerCase()
        .startsWith("multipart/form-data")
    ) {
      return errorResponse(
        "Send image edits as form data.",
        415,
      );
    }

    let formData: FormData;

    try {
      formData = await request.formData();
    } catch {
      return errorResponse(
        "The image edit request could not be read.",
        400,
      );
    }

    if (
      formData.getAll("name").length !== 1 ||
      formData.getAll("tags").length !== 1
    ) {
      return errorResponse(
        "Provide one image name and one tag list.",
        400,
      );
    }

    const rawTags = formData.get("tags");

    if (typeof rawTags !== "string") {
      return errorResponse(
        "The image tags must be a JSON list.",
        400,
      );
    }

    let tags: unknown;

    try {
      tags = JSON.parse(rawTags);
    } catch {
      return errorResponse(
        "The image tags must be a valid JSON list.",
        400,
      );
    }

    if (formData.getAll("file").length > 1) {
      return errorResponse("Provide only one replacement file.", 400);
    }
    const file = formData.get("file");
    if (file !== null && !(file instanceof File)) {
      return errorResponse("The replacement must be an image file.", 400);
    }
    const image = file
      ? await replaceGalleryImage({
          id, name: formData.get("name"), tags, file,
          adminId: access.admin.id,
        })
      : await editGalleryImageMetadata({
          id, name: formData.get("name"), tags,
        });

    return Response.json(image, {
      status: 200,
      headers: {
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    if (error instanceof GalleryInputError) {
      return errorResponse(
        error.message,
        error.status,
      );
    }

    if (error instanceof D1Error) {
      console.error(
        "Gallery metadata update failed:",
        error,
      );

      // A lost response can leave the database outcome unknown.
      return errorResponse(
        "The update could not be confirmed. Refresh the gallery to check the saved values before trying again.",
        503,
      );
    }

    if (error instanceof MediaError) {
      console.error(
        "Gallery image URL configuration failed:",
        error,
      );

      return errorResponse(
        "The gallery image service is temporarily unavailable.",
        503,
      );
    }

    console.error(
      "Unexpected gallery metadata update failure:",
      error,
    );

    return errorResponse(
      "The update could not be confirmed. Refresh the gallery before trying again.",
      500,
    );
  }
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