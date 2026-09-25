/**
 * Server side client for storage usage: how full the D1 database and the R2
 * bucket are against their limits, and whether the Worker's billing hard stops
 * are currently refusing uploads. Wraps the proxy Worker's GET /usage. See
 * docs/ENDPOINTS.md.
 *
 * SERVER ONLY. PROXY_TOKEN carries full access to the database and must never
 * reach the browser.
 */

export type StorageUsage = {
  measuredAt: string;
  d1: {
    bytes: number;
    limitBytes: number;
    percentUsed: number;
  };
  r2: {
    bucket: string;
    bytes: number;
    objects: number;
    /** Uploads are refused once stored files would pass this. */
    limitBytes: number;
    remainingBytes: number;
    percentUsed: number;
    /** R2 uploads and listings today (UTC), against the daily budget. */
    classAToday: { used: number; budget: number };
    /** True when no upload can succeed right now. */
    uploadsBlocked: boolean;
  };
  /** Present only when requested with { verify: true }. */
  verify?: {
    bytes: number;
    objects: number;
    pages: number;
    complete: boolean;
    driftBytes: number | null;
    driftObjects: number | null;
  };
};

export class UsageError extends Error {
  readonly status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.name = "UsageError";
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
    throw new UsageError(
      "D1_PROXY_URL and PROXY_TOKEN must be set. See docs/DEV-GUIDE.md section 2.",
    );
  }
  return { url, token };
}

/**
 * Measure storage now. By default this reads the Worker's own records and
 * costs no R2 operations, so it is fine on every page load.
 *
 * `verify: true` also lists the bucket to check those records. That costs one
 * R2 operation per 1,000 files from the daily budget, so keep it occasional.
 */
export async function getStorageUsage(
  options: { verify?: boolean } = {},
): Promise<StorageUsage> {
  const { url, token } = config();
  const path = options.verify ? "/usage?verify=1" : "/usage";

  let res: Response;
  try {
    res = await fetch(`${url}${path}`, {
      headers: { authorization: `Bearer ${token}` },
      cache: "no-store",
    });
  } catch (cause) {
    throw new UsageError(`could not reach the proxy at ${url}: ${String(cause)}`);
  }

  if (!res.ok) {
    const payload = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    const message = payload.message ?? payload.error ?? res.statusText;
    throw new UsageError(`usage lookup failed: ${String(message)}`, res.status);
  }

  return (await res.json()) as StorageUsage;
}
