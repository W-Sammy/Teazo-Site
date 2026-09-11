# TEAZO — Developer Guide

Everything you need to run the site on your machine with a working database and
file storage, and to build against them. Setting up the real Cloudflare
resources and the deploy pipeline is in [`OPERATIONS.md`](./OPERATIONS.md) —
you will not need it.

Commands assume a bash shell. On Windows, use **Git Bash**, not PowerShell.

---

## Contents

1. [The stack in one minute](#1-the-stack-in-one-minute)
2. [Set up your machine](#2-set-up-your-machine)
3. [Talking to the database](#3-talking-to-the-database)
4. [Storing files](#4-storing-files)
5. [Authentication](#5-authentication)
6. [The database](#6-the-database)
7. [Changing the schema](#7-changing-the-schema)
8. [How your code reaches production](#8-how-your-code-reaches-production)
9. [Gotchas](#9-gotchas)
10. [Where everything else lives](#10-where-everything-else-lives)

---

## 1. The stack in one minute

```
your app (Next.js) ──HTTP──▶ proxy Worker ──▶ D1   the database
                                          └─▶ R2   file storage
```

- The app runs on **Vercel**. It never talks to the database or the storage
  directly: every query and every file goes through one small Cloudflare
  Worker, `teazo-d1-proxy/`, using one token.
- **On your machine, that same Worker runs locally with a simulated database
  and a simulated bucket.** No Cloudflare account, no real credentials, nothing
  shared with anyone. Break it freely.
- **Square owns the product catalog.** We keep a cached copy for display. Item
  names, prices, sizes and sold-out state are always edited in Square — never
  in our database.

Today nothing persists: every page renders hardcoded data, and `/login` and
most of `/admin` are stubs. You are adding the first real reads and writes.

---

## 2. Set up your machine

You need **Node.js 20.9 or newer** and **Git**.

> **Windows: clone to a short path**, such as `C:\dev\Teazo-Site`. The local
> database lives several folders deep inside the repo; if the full path passes
> Windows' 260-character limit, every `wrangler d1` command fails with a bare
> `internal error` that says nothing about paths.

### 2.1 Start the database and storage

```bash
git clone https://github.com/W-Sammy/Teazo-Site.git
cd Teazo-Site/teazo-d1-proxy
npm install
npm run db:migrate:local
echo "PROXY_TOKEN=local-dev-token" > .dev.vars
npm run dev
```

That creates your database with the full schema and its starting data — the
real address and hours, the menu sections, the admin roles — then starts the
Worker on `http://127.0.0.1:8787`. **Leave it running.**

Check it from a second terminal:

```bash
curl -s http://127.0.0.1:8787/query -H 'authorization: Bearer local-dev-token' -H 'content-type: application/json' -d '{"sql":"SELECT label FROM role ORDER BY id"}'
```

You should see `Owner`, `Can Edit` and `Can View`.

### 2.2 Start the app

Create `teazo-site/.env.local`:

```bash
D1_PROXY_URL=http://127.0.0.1:8787
PROXY_TOKEN=local-dev-token
R2_PUBLIC_BASE=http://127.0.0.1:8787/media
```

Then, from the repo root:

```bash
cd teazo-site
npm install
npm run dev
```

The site is at `http://localhost:3000`.

**Only if you are working on Square**, also add these two:

```bash
SQUARE_ACCESS_TOKEN=<the sandbox token>
NEXT_PUBLIC_BASE_URL=http://localhost:3000/
```

The trailing `/` on `NEXT_PUBLIC_BASE_URL` matters: `/admin/menu` builds its
request as `${NEXT_PUBLIC_BASE_URL}api/square/products`, with no slash of its
own. Without these two the site still runs; only `/admin/menu` and
`/api/square/*` fail, because `app/lib/square.ts` throws when the token is
missing.

### 2.3 Sign in to /admin locally

Google sign-in does not exist yet, so give yourself a local admin:

```bash
cd teazo-d1-proxy
npm run db:seed:dev
```

Then, in your browser's dev tools on `http://localhost:3000`, add a cookie
named `teazo_session` with the value `local-dev-session`. You are now signed in
as the Owner — as soon as the session check in [§5](#5-authentication) exists.

### 2.4 Reset

Your database is disposable. To start clean:

```bash
cd teazo-d1-proxy
rm -rf .wrangler/state
npm run db:migrate:local
```

That also empties your local bucket. Run `npm run db:seed:dev` again if you
want the admin login back.

---

## 3. Talking to the database

Put this in `teazo-site/app/lib/d1.ts`. It is the only way the app reaches the
database.

```ts
// teazo-site/app/lib/d1.ts
const URL_ = process.env.D1_PROXY_URL!;
const TOKEN = process.env.PROXY_TOKEN!;

type Stmt = { sql: string; params: unknown[] };
type D1Result<T> = { results: T[]; success: boolean; meta: { changes: number } };

export class D1Error extends Error {}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${URL_}${path}`, {
    method: "POST",
    headers: { authorization: `Bearer ${TOKEN}`, "content-type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  const json = await res.json();
  // Database errors come back with their message intact, e.g.
  // "UNIQUE constraint failed: ..." or "media_asset is still referenced".
  if (!res.ok) throw new D1Error(json.message ?? json.error ?? res.statusText);
  return json as T;
}

export function prepare(sql: string) {
  let params: unknown[] = [];
  const api = {
    bind(...p: unknown[]) { params = p; return api; },
    async all<T>() { return post<D1Result<T>>("/query", { sql, params }); },
    async first<T>() {
      const r = await post<D1Result<T>>("/query", { sql, params });
      return r.results[0] ?? null;
    },
    async run() { return post<D1Result<unknown>>("/query", { sql, params }); },
    toStmt(): Stmt { return { sql, params }; },
  };
  return api;
}

/** All or nothing: every statement commits, or none does. */
export async function batch(stmts: Array<{ toStmt(): Stmt }>) {
  return post<{ results: unknown[] }>("/batch", { statements: stmts.map((s) => s.toStmt()) });
}
```

Using it:

```ts
import { prepare, batch } from "@/app/lib/d1";

const { results: hours } = await prepare(
  "SELECT day_of_week, display_text FROM business_hours ORDER BY day_of_week"
).all<{ day_of_week: number; display_text: string }>();

const profile = await prepare("SELECT * FROM business_profile WHERE id = ?1").bind(1).first();
```

Parameters are positional — `?1`, `?2`, … — bound in order with `.bind()`.

Four rules:

- **Server only.** Call it from server components, route handlers and server
  actions, never from client components. `PROXY_TOKEN` must never be named
  `NEXT_PUBLIC_*`: it gives full access to the database.
- **`batch()` is the only transaction.** Writes that must succeed or fail
  together go in one `batch()` call. Two calls are two transactions.
- **At most 40 statements per `batch()`.** The proxy rejects more with
  `too_many_statements`.
- **Every call is a network round trip.** Fetch what a page needs in as few
  calls as you can, and cache public pages with `export const revalidate = 300`.

---

## 4. Storing files

**The database stores a file's key, never its URL.** A key looks like
`gallery/2026/09/<uuid>.webp`. The URL is built when the page renders, from
`R2_PUBLIC_BASE` — so the same row works locally, on preview and in production.

Put this in `teazo-site/app/lib/media.ts`:

```ts
// teazo-site/app/lib/media.ts
const PROXY = process.env.D1_PROXY_URL!;
const TOKEN = process.env.PROXY_TOKEN!;
const PUBLIC_BASE = process.env.R2_PUBLIC_BASE!;

/** The only place a URL is ever built. */
export const toPublicUrl = (key: string) => `${PUBLIC_BASE}/${key}`;

/** gallery/2026/09/<uuid>.webp — keys are never reused, so they cache forever. */
export function mintKey(prefix: string, ext: string) {
  const d = new Date();
  const month = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${prefix}/${d.getUTCFullYear()}/${month}/${crypto.randomUUID()}.${ext}`;
}

/** Stores the bytes. Returns the bucket too — record it in media_asset.r2_bucket. */
export async function putMedia(key: string, body: Uint8Array, contentType: string) {
  const res = await fetch(`${PROXY}/media/${key}`, {
    method: "PUT",
    headers: { authorization: `Bearer ${TOKEN}`, "content-type": contentType },
    body,
  });
  if (!res.ok) throw new Error(`upload failed: ${res.status} ${await res.text()}`);
  return (await res.json()) as { key: string; size: number; bucket: string };
}
```

Locally, uploads land in your simulated bucket and are served by your Worker
at `http://127.0.0.1:8787/media/<key>`. `next.config.ts` already allows that
address for `<Image>` in development.

Accepted types: `image/jpeg`, `image/png`, `image/webp`, `application/pdf`.
Key prefixes: `gallery/`, `menu/items/`, `carousel/`, `events/`,
`documents/menu/`, `branding/`.

### 4.1 Saving a file

Every file follows the same three steps — resize, store the bytes, record the
row. Shown here for a gallery upload:

```ts
// teazo-site/app/api/admin/gallery/route.ts
import sharp from "sharp";
import { prepare, batch } from "@/app/lib/d1";
import { putMedia, mintKey } from "@/app/lib/media";
import { requireAdmin } from "@/app/lib/auth";

export async function POST(request: Request) {
  const admin = await requireAdmin(2); // Can Edit or above
  if (!admin) return Response.json({ error: "unauthorized" }, { status: 401 });

  const form = await request.formData();
  const file = form.get("file");
  const name = String(form.get("name") ?? "").trim();
  if (!(file instanceof File) || !name) {
    return Response.json({ error: "file and name are required" }, { status: 400 });
  }

  // 1. Resize. Re-encoding to webp at most 2000px wide turns a 1.6 MB phone
  //    photo into a few hundred KB — photo size is what fills the free storage.
  const { data, info } = await sharp(Buffer.from(await file.arrayBuffer()))
    .rotate()
    .resize({ width: 2000, withoutEnlargement: true })
    .webp({ quality: 82 })
    .toBuffer({ resolveWithObject: true });

  // 2. Store the bytes first. If step 3 then fails we leak one file, which is
  //    harmless. The other way round would leave rows pointing at nothing.
  const stored = await putMedia(mintKey("gallery", "webp"), data, "image/webp");

  // 3. Record it — both rows or neither.
  const mediaId = crypto.randomUUID();
  await batch([
    prepare(
      `INSERT INTO media_asset (id, r2_bucket, r2_key, mime_type, byte_size, width, height,
                                original_filename, purpose, uploaded_by)
       VALUES (?1, ?2, ?3, 'image/webp', ?4, ?5, ?6, ?7, 'gallery', ?8)`
    ).bind(mediaId, stored.bucket, stored.key, stored.size, info.width, info.height, file.name, admin.admin_id),
    prepare(`INSERT INTO gallery_image (id, media_id, name, name_sort_key) VALUES (?1, ?2, ?3, ?4)`)
      .bind(crypto.randomUUID(), mediaId, name, name.normalize("NFKD").replace(/\p{Diacritic}/gu, "").toLowerCase()),
  ]);

  return Response.json({ mediaId, key: stored.key }, { status: 201 });
}
```

This needs `npm install sharp` in `teazo-site/`.

> **Vercel rejects request bodies over 4.5 MB**, before your route even runs,
> and phone photos are often bigger. Shrink them in the browser first:
>
> ```ts
> async function shrink(file: File, max = 2000): Promise<File> {
>   const img = await createImageBitmap(file);
>   const scale = Math.min(1, max / Math.max(img.width, img.height));
>   const canvas = new OffscreenCanvas(Math.round(img.width * scale), Math.round(img.height * scale));
>   canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
>   const blob = await canvas.convertToBlob({ type: "image/jpeg", quality: 0.9 });
>   return new File([blob], "photo.jpg", { type: "image/jpeg" });
> }
> ```

### 4.2 Deleting a file

**Never delete the bytes yourself.** Mark the rows deleted and queue the bytes.
A scheduled job removes them 24 hours later, which leaves a window to undo a
mistake.

```ts
await batch([
  prepare("UPDATE gallery_image SET deleted_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?1").bind(imageId),
  prepare("UPDATE media_asset  SET deleted_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?1").bind(mediaId),
  prepare("INSERT INTO pending_r2_deletion (r2_bucket, r2_key) VALUES (?1, ?2)").bind(bucket, key),
]);
```

The order matters. The database refuses to retire a `media_asset` while
anything still uses it, so the gallery row goes first. If the same file is used
somewhere else too — the home carousel, an event flyer — the batch fails with
`media_asset is still referenced`. Return a 409 and tell the admin where it is
in use.

---

## 5. Authentication

Admins sign in (eventually with Google), and a `teazo_session` cookie
identifies them. The database stores only the SHA-256 of that cookie, so a
leaked database row is never a usable session.

Put this in `teazo-site/app/lib/auth.ts`:

```ts
// teazo-site/app/lib/auth.ts
import { cookies } from "next/headers";
import { prepare } from "./d1";

type Session = { admin_id: string; display_name: string; role_id: number };

async function sha256Hex(s: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** The signed-in admin, or null. Works in server components and route handlers. */
export async function getSession(): Promise<Session | null> {
  const token = (await cookies()).get("teazo_session")?.value;
  if (!token) return null;
  return prepare(
    `SELECT au.id AS admin_id, au.display_name, au.role_id
       FROM admin_session s
       JOIN admin_user au ON au.id = s.admin_user_id
      WHERE s.id = ?1
        AND s.revoked_at IS NULL
        AND s.expires_at > strftime('%Y-%m-%dT%H:%M:%fZ','now')
        AND au.deleted_at IS NULL
        AND au.status = 'active'`
  ).bind(await sha256Hex(token)).first<Session>();
}

/** Roles: 1 Owner, 2 Can Edit, 3 Can View. A lower number is more access. */
export async function requireAdmin(minRole: 1 | 2 | 3) {
  const s = await getSession();
  return s && s.role_id <= minRole ? s : null;
}
```

**Every admin route and server action calls `requireAdmin` first.** The cookie
on its own proves nothing:

```ts
const admin = await requireAdmin(2);
if (!admin) return Response.json({ error: "unauthorized" }, { status: 401 });
```

And `teazo-site/proxy.ts` sends anyone without a session cookie away from
`/admin`. Next.js 16 renamed `middleware.ts` to `proxy.ts` — this file has
nothing to do with our proxy *Worker*; the name is Next's, not ours.

```ts
// teazo-site/proxy.ts
import { NextResponse, type NextRequest } from "next/server";

export function proxy(req: NextRequest) {
  if (!req.cookies.get("teazo_session")) {
    return NextResponse.redirect(new URL("/login", req.url));
  }
  return NextResponse.next();
}

export const config = { matcher: ["/admin/:path*"] };
```

That is only a convenience redirect — it does not check the session is real.
`requireAdmin` is the actual check.

> **Right now `/admin` and the Square write routes (`/api/square/products`) are
> open to anyone** — there is no check at all. Adding these two pieces closes
> that.

There is exactly one Owner. `can_invite_users` can only be set on role 2.

---

## 6. The database

26 tables. The definition is
[`teazo-site/migrations/0001_init.sql`](../teazo-site/migrations/0001_init.sql)
— open it when you need exact columns.

| Table | Holds | Written by | Read by |
|---|---|---|---|
| `role` | Owner / Can Edit / Can View | seed | auth |
| `admin_user` | admin accounts | Settings | auth, every admin route |
| `oauth_account` | Google identity → admin | sign-in | sign-in |
| `admin_session` | sessions (hashed cookie) | sign-in, sign-out, removing an admin | auth |
| `admin_invitation` | pending invites | Settings | sign-in |
| `media_asset` | one row per stored file | uploads | every image |
| `pending_r2_deletion` | files waiting to be removed | delete handlers | the scheduled job |
| `gallery_image` | gallery entries | `/admin/gallery` | `/gallery` |
| `gallery_tag` | tag names | uploads | gallery filter |
| `gallery_image_tag` | image ↔ tag | uploads | gallery filter |
| `business_profile` | address, phone, email (one row) | Settings | `/contact`, footer |
| `business_hours` | the 7 weekday rows | Settings | `/contact` |
| `hours_exception` | holiday closures | Settings | `/contact` |
| `site_link` | social and delivery links | Settings | `/`, `/contact`, `/delivery` |
| `content_block` | editable text on the site | Website Content | public pages |
| `carousel_slide` | home page carousel | Website Content | `/` |
| `menu_document` | the PDF menu, versioned | Website Content | `/static-menu` |
| `square_sync_state` | where the Square sync is up to | sync | sync |
| `catalog_item_cache` | Square items, cached | sync | `/menu`, `/admin/menu` |
| `catalog_variation_cache` | **sizes and prices** | sync | `/menu` |
| `catalog_category_cache` | Square categories, cached | sync | `/menu` |
| `menu_section` | menu sections and subtitles | `/admin/menu` | `/menu` |
| `menu_section_item` | which items, in what order | `/admin/menu` | `/menu` |
| `menu_item_display` | photo, badge, featured | `/admin/menu` | `/menu` |
| `event` | events | `/admin/events` | an events page |
| `contact_message` | contact form messages | **the public** | an admin inbox |

### Columns that look odd but matter

| Column | Why it is there |
|---|---|
| `square_env` | Square's sandbox and production catalogs share no ids. Every Square-keyed row says which one it belongs to. |
| `square_version` | Tells you whether a cached price is stale. A stale price is a customer-facing error. |
| `name_sort_key` | SQLite cannot sort the way the admin UI does, and names are bilingual. Computed when you write the row. |
| `email_normalized`, `name_normalized` | Stop `Karen@x.com` / `karen@x.com` and `Matcha` / `matcha` being two different things. |
| `can_invite_users` | Per-admin flag, valid only for role 2. |
| `is_current` | Exactly one live PDF menu at a time. |
| `deleted_at` | Most tables are soft-deleted. Filter `WHERE deleted_at IS NULL` in reads. |

SQLite has no `BOOLEAN` (use `INTEGER` 0/1), no `ENUM` (`TEXT` with a
`CHECK`), no JSON type (`TEXT`, validated) and no `UUID` (`TEXT` ids).
Timestamps are ISO-8601 text in UTC, written with
`strftime('%Y-%m-%dT%H:%M:%fZ','now')`.

---

## 7. Changing the schema

A schema change is a new migration file, reviewed in a pull request like any
other code.

1. Add `teazo-site/migrations/000N_what_it_does.sql`, taking the next number.
   The descriptive name is what keeps two people's migrations from colliding.
2. Apply it to your database: `cd teazo-d1-proxy && npm run db:migrate:local`
3. Open a pull request. CI applies every migration to a fresh database, so
   broken SQL fails there instead of anywhere real.
4. Once it merges, CI applies it everywhere. Everyone else runs
   `npm run db:migrate:local` to pick it up.

**Never edit a migration after it has merged.** It is recorded as applied, so
your edit silently never runs on any database that already has it. Write a new
migration instead.

Adding a table, an index or a **nullable** column is one pull request.
Removing or renaming a column, or adding `NOT NULL`, has to be **two** pull
requests merged separately — first the code that stops using the column, then
the migration — because CI runs migrations before the new code goes live.
Adding a `CHECK` or foreign key to an existing table needs the whole table
rebuilt; raise it in the channel before you start.

---

## 8. How your code reaches production

Nobody deploys by hand. Merging is deploying.

| You merge into | What happens |
|---|---|
| a pull request | CI checks the migrations and the Worker. Vercel builds a preview of your branch. |
| `dev` | The shared preview database and Worker are updated. |
| `main` | Production — migrations first, then the Worker, then the app. |

A pull request's preview uses the shared preview database, which does not have
your branch's migrations yet. Test schema changes locally.

---

## 9. Gotchas

- **`business_hours.day_of_week` is 0 = Monday.** JavaScript's `getDay()` is
  0 = Sunday.
- **Compare timestamps only in the same format.** Comparing a column against
  `datetime('now', …)` compares `'2026-09-08T…'` with `'2026-09-08 …'` as
  text and silently gives the wrong answer. Use
  `strftime('%Y-%m-%dT%H:%M:%fZ', 'now', …)` on both sides.
- **End every `ORDER BY` with a unique column** (`…, id`), or rows that tie
  can come back in a different order on each request.
- **Removing an admin does not end their sessions.** Revoke them in the same
  `batch()`:
  `UPDATE admin_session SET revoked_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE admin_user_id = ?1 AND revoked_at IS NULL`
- **Renaming a gallery image means recomputing `name_sort_key`.**
- **Tag names are unique ignoring case**, so add them with
  `INSERT … ON CONFLICT(name_normalized) DO NOTHING`.
- **Building the Square sync?** Fix the `variations[0]` bug first — see
  FEATURE-NOTES.md.

---

## 10. Where everything else lives

- **[FEATURE-NOTES.md](./FEATURE-NOTES.md)** — the query each public page
  needs, the Square sync, the admin API routes, and the build order. Open the
  section for your feature.
- **[DATA-MODEL.md](./DATA-MODEL.md)** — why the schema looks the way it does.
- **[OPERATIONS.md](./OPERATIONS.md)** — the real Cloudflare setup and the
  deploy pipeline.
