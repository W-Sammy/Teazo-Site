
import { requireAdminApi } from "@/app/lib/admin";
import { D1Error } from "@/app/lib/d1";
import {
  GalleryInputError,
  saveGalleryImage,
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
 * Admin gallery upload endpoint.
 *
 * Validates administrator access and delegates image
 * processing, storage, and database persistence to
 * the shared gallery functionality.
 */
export async function POST(
  request: Request,
): Promise<Response> {
  const access = await requireAdminApi(request, 2);

  if (!access.ok) {
    return access.response;
  }

  try {
    const formData = await request.formData();

    const file = formData.get("file");
    const name = formData.get("name");
    const rawTags = formData.get("tags");

    let tags: unknown;

    try {
      tags = JSON.parse(String(rawTags ?? "[]"));
    } catch {
      return errorResponse("Invalid image tags.", 400);
    }

    const image = await saveGalleryImage({
      file,
      name,
      tags,
      adminId: access.admin.id,
    });

    return Response.json(
      image,
      {
        status: 201,
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  } catch (error) {
    if (error instanceof GalleryInputError) {
      return errorResponse(error.message, error.status);
    }

    if (error instanceof MediaError) {
      console.error("Gallery media upload failed:", error);

      return errorResponse(
        "The image could not be stored. Please try again.",
        error.status ?? 503,
      );
    }

    if (error instanceof D1Error) {
      console.error("Gallery database upload failed:", error);

      return errorResponse(
        "The image could not be saved to the database.",
        503,
      );
    }

    console.error("Unexpected gallery upload failure:", error);

    return errorResponse(
      "The image could not be uploaded. Please try again.",
      500,
    );
  }
}
