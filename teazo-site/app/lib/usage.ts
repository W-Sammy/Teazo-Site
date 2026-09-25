/**
 * Server side client for storage usage: how full the D1 database and the R2
 * bucket are against the free-plan limits. Wraps the proxy Worker's GET /usage.
 * See docs/ENDPOINTS.md.
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
    freeBytes: number;
    percentOfFree: number;
    /** False when the bucket had more files than one listing covers. Totals are then a lower bound. */
    complete: boolean;
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
 * Measure storage now. Each call lists the bucket, which costs one R2 operation
 * per 1,000 files, so call it when a page loads rather than on a timer.
 */
export async function getStorageUsage(): Promise<StorageUsage> {
  const { url, token } = config();

  let res: Response;
  try {
    res = await fetch(`${url}/usage`, {
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
