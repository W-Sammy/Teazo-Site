/**
 * Server side client for the D1 database.
 *
 * The app runs on Vercel and has no Cloudflare bindings, so it never reaches D1
 * directly. Every query goes over HTTPS to the proxy Worker, which holds the
 * binding. See docs/ENDPOINTS.md for the endpoints this wraps.
 *
 * SERVER ONLY. Call these from server components, route handlers and server
 * actions. PROXY_TOKEN carries full access to the database and must never be
 * named NEXT_PUBLIC_ or reach the browser.
 */

/** Thrown for transport failures and for anything the database rejects. */
export class D1Error extends Error {
  readonly status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.name = "D1Error";
    this.status = status;
  }
}

type Stmt = { sql: string; params: unknown[] };

export type D1Result<T> = {
  results: T[];
  success: boolean;
  meta: Record<string, unknown>;
};

/** The proxy rejects a batch larger than this. */
export const MAX_STATEMENTS = 40;

/**
 * Read configuration when a call is made, not when this file is imported.
 * Importing must never throw: `next build` loads every route, so a module that
 * throws at import time fails the build rather than the request.
 */
function config(): { url: string; token: string } {
  const url = process.env.D1_PROXY_URL;
  const token = process.env.PROXY_TOKEN;
  if (!url || !token) {
    throw new D1Error(
      "D1_PROXY_URL and PROXY_TOKEN must be set. See docs/DEV-GUIDE.md section 2.",
    );
  }
  return { url, token };
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const { url, token } = config();

  let res: Response;
  try {
    res = await fetch(`${url}${path}`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
      cache: "no-store",
    });
  } catch (cause) {
    throw new D1Error(`could not reach the database proxy at ${url}: ${String(cause)}`);
  }

  const payload = (await res.json().catch(() => ({}))) as Record<string, unknown>;

  if (!res.ok) {
    // The proxy passes the database message through, so constraint failures stay
    // readable, for example "media_asset is still referenced".
    const message = payload.message ?? payload.error ?? res.statusText;
    throw new D1Error(String(message), res.status);
  }

  return payload as T;
}

/**
 * Build one statement. Parameters are positional and bound in order.
 *
 *   const hours = await prepare(
 *     "SELECT display_text FROM business_hours WHERE day_of_week = ?1"
 *   ).bind(0).all<{ display_text: string }>();
 */
export function prepare(sql: string) {
  let params: unknown[] = [];

  const api = {
    bind(...values: unknown[]) {
      params = values;
      return api;
    },

    /** Every matching row. */
    all<T = Record<string, unknown>>(): Promise<D1Result<T>> {
      return post<D1Result<T>>("/query", { sql, params });
    },

    /** The first row, or null. */
    async first<T = Record<string, unknown>>(): Promise<T | null> {
      const result = await post<D1Result<T>>("/query", { sql, params });
      return result.results[0] ?? null;
    },

    /** For writes, when the rows are not needed. */
    run(): Promise<D1Result<never>> {
      return post<D1Result<never>>("/query", { sql, params });
    },

    /** Hand to batch() instead of running on its own. */
    toStmt(): Stmt {
      return { sql, params };
    },
  };

  return api;
}

/**
 * Run several statements as one transaction. Every statement commits, or none
 * does. This is the only transaction available, so writes that must succeed or
 * fail together have to go in a single call. Two calls are two transactions.
 *
 *   await batch([
 *     prepare("UPDATE gallery_image SET deleted_at = ?1 WHERE id = ?2").bind(now, id),
 *     prepare("INSERT INTO pending_r2_deletion (r2_bucket, r2_key) VALUES (?1, ?2)").bind(bucket, key),
 *   ]);
 */
export async function batch(
  statements: Array<{ toStmt(): Stmt }>,
): Promise<{ results: unknown[] }> {
  if (statements.length === 0) {
    throw new D1Error("batch() needs at least one statement");
  }
  if (statements.length > MAX_STATEMENTS) {
    throw new D1Error(
      `batch() takes at most ${MAX_STATEMENTS} statements, received ${statements.length}`,
    );
  }
  return post<{ results: unknown[] }>("/batch", {
    statements: statements.map((s) => s.toStmt()),
  });
}
