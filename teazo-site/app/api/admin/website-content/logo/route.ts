import { NextResponse } from "next/server";
import {
  mintKey,
  putMedia,
  toPublicUrl,
  deleteMediaNow,
  type MediaType,
} from "@/app/lib/media";
import { updateWebsiteContent } from "@/app/lib/website-content";
import { D1Error } from "@/app/lib/d1";
import {
  ALLOWED_LOGO_MIME_TYPES,
  MAX_LOGO_BYTES,
  isValidLogoFile,
} from "@/app/lib/website-content-validators";
import { revalidatePath } from "next/cache";
import { requireAdminApi } from "@/app/lib/admin";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const access = await requireAdminApi(request, 2);
  if (!access.ok) {
    return access.response;
  }

  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: "No image file provided." }, { status: 400 });
    }

    const validation = isValidLogoFile(file);
    if (!validation.valid) {
      const status = !Object.prototype.hasOwnProperty.call(ALLOWED_LOGO_MIME_TYPES, file.type)
        ? 415 : file.size > MAX_LOGO_BYTES ? 413 : 400;
      return NextResponse.json(
        { error: validation.error },
        { status },
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);
    const ext = ALLOWED_LOGO_MIME_TYPES[file.type as keyof typeof ALLOWED_LOGO_MIME_TYPES];
    const key = mintKey("logo", ext);
    // Resolve configuration before uploading so a missing public base cannot
    // leave a file behind before persistence even begins.
    const publicUrl = toPublicUrl(key);
    const stored = await putMedia(key, bytes, file.type as MediaType);

    try {
      await updateWebsiteContent({ logo: publicUrl });
    } catch (persistError) {
      // The proxy's 4xx responses reject the atomic batch. Transport failures
      // and 5xx responses can hide a commit; keep the bytes in that case.
      const rejected = persistError instanceof D1Error &&
        persistError.status !== undefined && persistError.status >= 400 &&
        persistError.status < 500 && persistError.status !== 408;
      if (rejected) {
        await deleteMediaNow(stored.key).catch((cleanupError) => {
          console.error("Could not remove a rejected logo upload:", stored.key, cleanupError);
        });
      }
      console.error("Logo persistence failed; reconcile this media key:", stored.key, persistError);
      return NextResponse.json({
        error: rejected
          ? "Could not save the logo. Please try again."
          : "The logo save could not be confirmed. Reload this page to check the saved logo before uploading again.",
        requiresReload: !rejected,
      }, { status: 503 });
    }

    revalidatePath("/", "layout");
    revalidatePath("/admin/website-content");

    return NextResponse.json({ success: true, url: publicUrl });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to upload logo";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
