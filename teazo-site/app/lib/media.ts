/**
 * Server side client for file storage.
 *
 * Files live in Cloudflare R2 and are written through the proxy Worker, so the
 * app needs no R2 credentials of its own. See docs/ENDPOINTS.md.
 *
 * The database stores a file's KEY, never its URL. A key looks like
 * gallery/2026/09/<uuid>.webp. The URL is built at render time from
 * R2_PUBLIC_BASE, so the same row works locally, on preview and in production.
 *
 * SERVER ONLY for writes. toPublicUrl is safe anywhere, since it only reads a
 * public base URL.
 */

export type StoredMedia = {
  key: string;
  size: number;
  /** Record this in media_asset.r2_bucket. */
  bucket: string;
};

/** Accepted by the proxy. Anything else is rejected with 415. */
export const MEDIA_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
] as const;

export type MediaType = (typeof MEDIA_TYPES)[number];

/** Backstop in the proxy. Resize before uploading rather than relying on it. */
export const MAX_MEDIA_BYTES = 10 * 1024 * 1024;

export class MediaError extends Error {
  readonly status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.name = "MediaError";
    this.status = status;
  }
}

/**
 * Read configuration on call rather than on import, so that importing this file
 * cannot fail a build that has no environment set.
 */
function config(): { url: string; token: string } {
  const url = process.env.D1_PROXY_URL;
  const token = process.env.PROXY_TOKEN;
  if (!url || !token) {
    throw new MediaError(
      "D1_PROXY_URL and PROXY_TOKEN must be set. See docs/DEV-GUIDE.md section 2.",
    );
  }
  return { url, token };
}

/** The only place a public URL is ever built. */
export function toPublicUrl(key: string): string {
  const base = process.env.R2_PUBLIC_BASE;
  if (!base) {
    throw new MediaError(
      "R2_PUBLIC_BASE must be set. See docs/DEV-GUIDE.md section 2.",
    );
  }
  return `${base.replace(/\/$/, "")}/${key}`;
}

/**
 * Mint a fresh key, for example gallery/2026/09/<uuid>.webp.
 *
 * Keys are never reused, which is what lets stored files be cached forever.
 * Reusing a key would serve a stale image from every cache that holds it.
 */
export function mintKey(prefix: string, ext: string): string {
  const now = new Date();
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `${prefix}/${now.getUTCFullYear()}/${month}/${crypto.randomUUID()}.${ext}`;
}

/**
 * Store bytes and return what to record in media_asset.
 *
 * Store the bytes BEFORE writing the database rows. If the rows then fail, one
 * unreferenced file is left behind, which is harmless and gets cleaned up. The
 * other order leaves rows pointing at a file that does not exist.
 */
export async function putMedia(
  key: string,
  body: Uint8Array,
  contentType: MediaType,
): Promise<StoredMedia> {
  const { url, token } = config();

  if (body.byteLength === 0) {
    throw new MediaError("refusing to store an empty file");
  }
  if (body.byteLength > MAX_MEDIA_BYTES) {
    throw new MediaError(
      `file is ${body.byteLength} bytes, over the ${MAX_MEDIA_BYTES} byte limit`,
      413,
    );
  }

  // A plain Uint8Array may be backed by a SharedArrayBuffer, which cannot be a
  // request body, so TypeScript refuses the assignment. Copying into a view we
  // know is ArrayBuffer backed satisfies that without narrowing the parameter,
  // which matters because sharp hands back a Node Buffer and callers should be
  // able to pass it straight in.
  const payload = new Uint8Array(body.byteLength);
  payload.set(body);

  let res: Response;
  try {
    res = await fetch(`${url}/media/${key}`, {
      method: "PUT",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": contentType,
      },
      body: payload,
    });
  } catch (cause) {
    throw new MediaError(`could not reach the media proxy at ${url}: ${String(cause)}`);
  }

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new MediaError(`upload failed: ${res.status} ${detail}`, res.status);
  }

  return (await res.json()) as StoredMedia;
}

/**
 * Remove bytes immediately. Feature code should NOT normally call this.
 *
 * The usual way to delete a file is to mark its rows deleted and insert a row
 * into pending_r2_deletion in the same batch. A scheduled job removes the bytes
 * 24 hours later, and that delay is the only undo window the system has. This
 * exists for cleaning up a file whose database rows were never written.
 */
export async function deleteMediaNow(key: string): Promise<void> {
  const { url, token } = config();

  const res = await fetch(`${url}/media/${key}`, {
    method: "DELETE",
    headers: { authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    throw new MediaError(`delete failed: ${res.status}`, res.status);
  }
}
