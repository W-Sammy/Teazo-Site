import { requireAdminApi } from "@/app/lib/admin";
import { D1Error } from "@/app/lib/d1";
import { createEvent, eventExists, updateEvent, type EventInput } from "@/app/lib/queries/events";
import { deleteMediaNow, MAX_MEDIA_BYTES, mintKey, putMedia, type MediaType } from "@/app/lib/media";

const acceptedTypes = new Set<MediaType>(["image/jpeg", "image/png", "image/webp"]);

function parseInput(form: FormData): EventInput {
  const name = String(form.get("name") ?? "").trim();
  const description = String(form.get("description") ?? "").trim();
  const startAt = String(form.get("startAt") ?? "");
  const endAt = String(form.get("endAt") ?? "");
  const appliesToAll = form.get("appliesToAll") === "true";
  const parseIds = (key: string) => {
    try {
      const value = JSON.parse(String(form.get(key) ?? "[]"));
      return Array.isArray(value) ? value.filter((id): id is string => typeof id === "string") : [];
    } catch {
      return [];
    }
  };
  const start = Date.parse(startAt);
  const end = Date.parse(endAt);
  if (!name || !description || Number.isNaN(start) || Number.isNaN(end) || end < start) {
    throw new Error("A name, description, and valid start/end dates are required.");
  }
  return { name, description, startAt, endAt, appliesToAll, categoryIds: parseIds("categoryIds"), itemIds: parseIds("itemIds") };
}

async function readMedia(form: FormData) {
  const value = form.get("imageFile");
  if (!(value instanceof File) || value.size === 0) return undefined;
  if (!acceptedTypes.has(value.type as MediaType)) throw new Error("Use a JPEG, PNG, or WebP image.");
  if (value.size > MAX_MEDIA_BYTES) throw new Error("The event image must be 10 MB or smaller.");
  const mimeType = value.type as MediaType;
  const ext = mimeType === "image/jpeg" ? "jpg" : mimeType.split("/")[1];
  const stored = await putMedia(mintKey("events", ext), new Uint8Array(await value.arrayBuffer()), mimeType);
  return { id: crypto.randomUUID(), stored, mimeType, originalFilename: value.name.slice(0, 200) };
}

export async function saveEvent(request: Request, id: string | null) {
  const access = await requireAdminApi(request, 2);
  if (!access.ok) return access.response;

  let uploaded: Awaited<ReturnType<typeof readMedia>>;

  try {
    const form = await request.formData();
    const input = parseInput(form);
    if (id && !(await eventExists(id))) {
      return Response.json({ error: "Event not found." }, { status: 404 });
    }

    uploaded = await readMedia(form);
    const media = uploaded ? { ...uploaded, adminId: access.admin.id } : undefined;

    if (id) {
      const updated = await updateEvent(id, input, media, "sandbox");
      if (!updated) {
        throw new Error("Event not found.");
      }
      return Response.json({ id });
    }

    const newId = await createEvent(input, access.admin.id, media, "sandbox");
    return Response.json({ id: newId }, { status: 201 });
  } catch (error) {
    console.error("Could not save event:", error);

    // Clean up a newly uploaded R2 image if the event save failed.
    // Do not delete an existing image that belongs to another event.
    // Only clean up when the database definitely rejected the write.
    if (uploaded && (error instanceof D1Error && error.status !== undefined && error.status < 500 || error instanceof Error && error.message === "Event not found.")) {
      try {
        await deleteMediaNow(uploaded.stored.key);
      } catch (cleanupError) {
        // Preserve the original save error if R2 cleanup also fails.
        console.error("Could not clean up uploaded event image:", cleanupError);
      }
    }

    const message = error instanceof Error && !(error instanceof D1Error) ? error.message : "The event could not be saved.";
    return Response.json({ error: message }, { status: error instanceof D1Error ? 503 : error instanceof Error && error.message === "Event not found." ? 404 : 400 });
  }
}
