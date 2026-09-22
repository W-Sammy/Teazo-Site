import { getAdmin } from "@/app/lib/admin";
import { D1Error } from "@/app/lib/d1";
import { MediaError, mintKey, putMedia } from "@/app/lib/media";
import { getMenuFileError, MAX_MENU_PDF_BYTES } from "@/app/lib/menu-upload";
import { publishMenuDocument } from "@/app/lib/queries/menu-documents";

export const runtime = "nodejs";

// Allow multipart headers as well as the PDF, but still bound the whole request.
const MAX_REQUEST_BYTES = MAX_MENU_PDF_BYTES + 100_000;

class UploadError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

function errorResponse(message: string, status: number): Response {
  return Response.json({ error: message }, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

/** Read a bounded multipart body, including when Content-Length is absent. */
async function readUploadForm(request: Request): Promise<FormData> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().startsWith("multipart/form-data;")) {
    throw new UploadError("Expected a file-upload form.", 400);
  }

  if (Number(request.headers.get("content-length")) > MAX_REQUEST_BYTES) {
    throw new UploadError("The upload is too large. Choose a PDF of 4 MB or less.", 413);
  }

  const reader = request.body?.getReader();
  if (!reader) throw new UploadError("No file was received.", 400);

  const chunks: Uint8Array[] = [];
  let length = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > MAX_REQUEST_BYTES) {
        await reader.cancel().catch(() => undefined);
        throw new UploadError("The upload is too large. Choose a PDF of 4 MB or less.", 413);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const body = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }

  try {
    return await new Response(body, {
      headers: { "Content-Type": contentType },
    }).formData();
  } catch {
    throw new UploadError("The upload form could not be read. Choose the PDF again.", 400);
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    // Check the database role on every upload, not just when opening the page.
    const admin = await getAdmin(2);
    if (!admin) {
      return errorResponse("Sign in with an Owner or Can Edit account to upload a menu.", 401);
    }

    // Only this site's browser form may submit a cookie-authenticated upload.
    const origin = request.headers.get("origin");
    const host = request.headers.get("host") ?? new URL(request.url).host;
    let sameOrigin = false;
    try {
      sameOrigin = !!origin && new URL(origin).host === host;
    } catch {
      sameOrigin = false;
    }
    if (!sameOrigin) return errorResponse("Please upload from the Teazo admin page.", 403);

    const form = await readUploadForm(request);
    const file = form.get("file");
    if (!(file instanceof File) || form.getAll("file").length !== 1) {
      return errorResponse("Please choose one PDF file.", 400);
    }

    const fileError = getMenuFileError(file);
    if (fileError) {
      return errorResponse(fileError, file.size > MAX_MENU_PDF_BYTES ? 413 : 400);
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    const decoder = new TextDecoder("ascii");
    const header = decoder.decode(bytes.subarray(0, 5));
    const trailer = decoder.decode(bytes.subarray(Math.max(0, bytes.length - 2048)));

    // Basic format checks, not a full PDF parser or a malware scan.
    if (header !== "%PDF-" || !trailer.includes("%%EOF")) {
      return errorResponse("This file does not appear to be a complete PDF. Export it again and retry.", 400);
    }

    // Use generated keys, never a user-supplied filename, for storage paths.
    const key = mintKey("documents/menu", "pdf");
    const documentId = crypto.randomUUID();
    const mediaId = crypto.randomUUID();
    const originalFilename = Array.from(file.name.split(/[\\/]/).pop() || "menu.pdf")
      .filter((character) => character.charCodeAt(0) >= 32 && character.charCodeAt(0) !== 127)
      .join("").slice(0, 200);

    // Store first, then publish the new version in one database transaction.
    const stored = await putMedia(key, bytes, "application/pdf");
    await publishMenuDocument({ documentId, mediaId, stored, originalFilename, adminId: admin.id });

    return Response.json({ success: true, documentId }, {
      status: 201,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    if (error instanceof UploadError) return errorResponse(error.message, error.status);

    console.error("Menu PDF upload failed:", error);

    // Do not delete the stored file here. A lost /batch response can occur AFTER
    // a commit; deleting then could remove the newly published menu's bytes.
    // A failed transaction can leave an unreferenced file for later cleanup.
    const status = error instanceof D1Error || error instanceof MediaError ? 503 : 500;
    return errorResponse(
      "The upload could not be confirmed. Check the public menu before retrying. If it did not change, check the app and Worker terminals.",
      status,
    );
  }
}
