import { NextResponse } from "next/server";
import { mintKey, putMedia, toPublicUrl, type MediaType, MAX_MEDIA_BYTES } from "@/app/lib/media";
import { updateWebsiteContent } from "@/app/lib/website-content";
import { revalidatePath } from "next/cache";

export const runtime = "nodejs";

const ALLOWED_MIME_TYPES: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: "No image file provided." }, { status: 400 });
    }

    const ext = ALLOWED_MIME_TYPES[file.type];
    if (!ext) {
      return NextResponse.json(
        { error: "Unsupported image format. Please upload PNG, JPG, or WebP." },
        { status: 415 },
      );
    }

    if (file.size > MAX_MEDIA_BYTES) {
      return NextResponse.json(
        { error: "Image file is too large. Must be 10 MB or less." },
        { status: 413 },
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);
    const key = mintKey("logo", ext);

    const stored = await putMedia(key, bytes, file.type as MediaType);
    const publicUrl = toPublicUrl(stored.key);

    await updateWebsiteContent({ logo: publicUrl });

    revalidatePath("/");
    revalidatePath("/admin/website-content");

    return NextResponse.json({ success: true, url: publicUrl });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to upload logo";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
