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
- **Square owns the product catalog, photos included.** We keep a cached copy
  for display. Item names, prices, sizes, photos and sold-out state are always
  edited in Square — never in our database.

Today nothing persists yet. Google sign-in works, and the Settings admins
table and the events admin are built on sample data — but every page still
renders hardcoded values. You are adding the first real reads and writes.

---

## 2. Set up your machine

You need **Node.js 22 or newer** and **Git**. Wrangler refuses to start on
anything older, and CI builds on 22.

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

**If you are working on Square, the menu admin, or the events admin**, also
add these two:

```bash
SQUARE_ACCESS_TOKEN=<the sandbox token>
NEXT_PUBLIC_BASE_URL=http://localhost:3000/
```

The trailing `/` matters: `/admin/menu` **and `/admin/events`** both build the
request as `${NEXT_PUBLIC_BASE_URL}api/square/products`, with no slash of their
own. Without these two the public pages still run, but `/api/square/*`,
`/admin/menu` and `/admin/events` all fail — `app/lib/square.ts` throws as soon
as it is imported when the token is missing, and both admin pages throw on the
failed fetch (`app/admin/events/page.tsx:20`). The events admin is easy to miss
here: it needs the Square catalog to pick which items an event covers.

### 2.3 Sign in locally

Sign-in is Google, through NextAuth (`teazo-site/auth.ts`). **Only if you are
working on sign-in or a page behind it**, add three more lines to
`teazo-site/.env.local`:

```bash
AUTH_SECRET=<a long random string — `openssl rand -base64 33` makes one>
AUTH_GOOGLE_ID=<the team's Google OAuth client id>
AUTH_GOOGLE_SECRET=<the team's Google OAuth client secret>
```

The Google client id and secret come from whoever set up sign-in.

To give your Google account an admin role in your own database:

```bash
cd teazo-d1-proxy
npx wrangler d1 execute teazo-db --local --command "INSERT INTO admin_user (id, email, email_normalized, username, role_id) VALUES ('me', 'you@gmail.com', 'you@gmail.com', 'you', 1);"
```

Put your own address in both email columns, lower-case in `email_normalized`.
Role `1` is Owner, `2` Can Edit, `3` Can View.

### 2.4 Reset

Your database is disposable. To start clean:

```bash
cd teazo-d1-proxy
rm -rf .wrangler/state
npm run db:migrate:local
```

That also empties your local bucket, and removes your admin row — re-run the
insert from [§2.3](#23-sign-in-locally) if you need your role back.

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

**Product photos are not in our storage.** They come straight from Square:
`catalog_item_cache.square_image_url` holds Square's own URL for each item's
photo, and `<Image>` loads it from Square. Our bucket is for what Square can't
hold — gallery photos, the home carousel, event flyers and the PDF menu.

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
at `http://127.0.0.1:8787/media/<key>`. To show them with `<Image>` in
development, `next.config.ts` needs this — Next.js 16 refuses to optimize
images from local addresses unless told to. It is tested, and development-only;
production keeps the defaults:

```ts
// teazo-site/next.config.ts
const isDev = process.env.NODE_ENV === "development";

images: {
  remotePatterns: [
    ...allowedHosts.map((hostname) => ({ protocol: "https" as const, hostname })),
    ...(isDev ? [{ protocol: "http" as const, hostname: "127.0.0.1", port: "8787", pathname: "/media/**" }] : []),
  ],
  dangerouslyAllowLocalIP: isDev,
},
```

Accepted types: `image/jpeg`, `image/png`, `image/webp`, `application/pdf`.
Key prefixes: `gallery/`, `carousel/`, `events/`, `documents/menu/`,
`branding/`.

### 4.1 Saving a file

Every file follows the same three steps — resize, store the bytes, record the
row. Shown here for a gallery upload:

```ts
// teazo-site/app/api/admin/gallery/route.ts
import sharp from "sharp";
import { prepare, batch } from "@/app/lib/d1";
import { putMedia, mintKey } from "@/app/lib/media";
import { getAdmin } from "@/app/lib/admin";

export async function POST(request: Request) {
  const admin = await getAdmin(2); // Can Edit or above — see §5
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
    ).bind(mediaId, stored.bucket, stored.key, stored.size, info.width, info.height, file.name, admin.id),
    prepare(`INSERT INTO gallery_image (id, media_id, name, name_sort_key) VALUES (?1, ?2, ?3, ?4)`)
      .bind(crypto.randomUUID(), mediaId, name, name.normalize("NFKD").replace(/\p{Diacritic}/gu, "").toLowerCase()),
  ]);

  return Response.json({ mediaId, key: stored.key }, { status: 201 });
}
```

The resize step needs `sharp`, which is not in `teazo-site/package.json` today —
whoever builds the upload route adds it (`npm install sharp` in `teazo-site/`).
Any equivalent resizer is fine; what matters is that something shrinks the image
before it is stored.

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

Sign-in is **NextAuth with Google** (`teazo-site/auth.ts`). NextAuth keeps the
session in a signed cookie, so the database holds no sessions. What it holds
is **who is an admin and what they may do** — `admin_user` — matched to the
signed-in Google account by email.

To get the signed-in admin and their role:

```ts
// teazo-site/app/lib/admin.ts
import { auth } from "@/auth";
import { prepare } from "./d1";

export type Admin = { id: string; username: string; role_id: number; can_invite_users: number };

/** Roles: 1 Owner, 2 Can Edit, 3 Can View. A lower number is more access. */
export async function getAdmin(minRole: 1 | 2 | 3): Promise<Admin | null> {
  const email = (await auth())?.user?.email;
  if (!email) return null;
  const admin = await prepare(
    `SELECT id, username, role_id, can_invite_users
       FROM admin_user
      WHERE email_normalized = ?1
        AND deleted_at IS NULL
        AND status IN ('active', 'invited')`
  ).bind(email.trim().toLowerCase()).first<Admin>();
  return admin && admin.role_id <= minRole ? admin : null;
}
```

Call it first in every admin page, route handler and server action:

```ts
const admin = await getAdmin(2);
if (!admin) return Response.json({ error: "unauthorized" }, { status: 401 });
```

Because it reads `admin_user` on every request, removing or suspending an
admin takes effect immediately.

An admin added in Settings starts with `status = 'invited'`. There is no
invitation email: signing in with that Google address is the invitation.
There is exactly one Owner, and `can_invite_users` can only be set on role 2.

> **Heads-up for whoever owns sign-in:** `auth.ts` currently accepts **any**
> Google account. That grants nothing today, but a check that only asks "is
> someone signed in?" would let every Google user through. The check has to
> consult `admin_user` — per request as above, or in NextAuth's `signIn`
> callback.

> **`/admin` and the Square write routes (`/api/square/products`) are open to
> anyone right now** — no check exists yet. Next.js 16's file for guarding
> routes is `proxy.ts` (it replaced `middleware.ts`); nothing to do with our
> proxy Worker.

---

## 6. The database

25 tables. The definition is
[`teazo-site/migrations/0001_init.sql`](../teazo-site/migrations/0001_init.sql)
— open it when you need exact columns.

| Table | Holds | Written by | Read by |
|---|---|---|---|
| `role` | Owner / Can Edit / Can View | seed | auth |
| `admin_user` | admin accounts | Settings | auth, every admin route |
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
| `catalog_item_cache` | Square items, cached — including Square's photo URL | sync | `/menu`, `/admin/menu` |
| `catalog_variation_cache` | **sizes and prices** | sync | `/menu` |
| `catalog_category_cache` | Square categories, cached | sync | `/menu` |
| `menu_section` | menu sections and subtitles | `/admin/menu` | `/menu` |
| `menu_section_item` | which items, in what order | `/admin/menu` | `/menu` |
| `menu_item_display` | badge, featured, hidden | `/admin/menu` | `/menu` |
| `event` | events: name, image, start and end | `/admin/events` | public pages |
| `event_item`, `event_category` | which Square items or categories an event covers | `/admin/events` | public pages |
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

### The Square cache

`catalog_item_cache`, `catalog_variation_cache` and `catalog_category_cache`
are a copy of Square, filled by a sync. Whoever writes that sync:

- Key every row by the Square id **and** `square_env` (`sandbox` or
  `production`) — the two catalogs share no ids.
- Store `square_version`, so a stale price can be detected.
- One `catalog_variation_cache` row per size, never just the first.
- Never delete a cached row: set `is_deleted = 1`. Menu sections point at
  cached items.
- `square_image_url` is Square's own photo URL — the photo stays at Square.
- Events can name Square items before the sync has ever run, so when showing
  an event, skip item ids the cache doesn't have.

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

Nobody deploys by hand. Merging is deploying — once the pipeline is switched on.

| You merge into | What happens |
|---|---|
| a pull request | CI checks the migrations and the Worker. **This part runs today.** |
| `dev` | The shared preview database and Worker are updated. |
| `main` | Production — migrations first, then the Worker, then the app. |

> **The `dev` and `main` rows are not live yet.** Both are gated behind a
> repository variable that stays unset until the Cloudflare resources exist, and
> the Vercel project is still being set up. Until then, merging to `dev` does
> **not** update any shared database — only the pull-request check runs. Do not
> assume a migration you merged is live anywhere; ask.

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
- **Removing an admin locks them out only because pages check `admin_user`.**
  NextAuth's cookie stays valid until it expires, so always go through
  `getAdmin()` ([§5](#5-authentication)), which reads `admin_user` on every
  request.
- **Google says `redirect_uri_mismatch` on your machine?** The team's OAuth
  client needs `http://localhost:3000/api/auth/callback/google` added as an
  authorized redirect URI.
- **Renaming a gallery image means recomputing `name_sort_key`.**
- **Tag names are unique ignoring case**, so add them with
  `INSERT … ON CONFLICT(name_normalized) DO NOTHING`.
- **Building the Square sync?** Read the landmines in
  [DATA-MODEL.md §3](./DATA-MODEL.md#3-the-square-boundary--the-rule-that-keeps-the-site-and-the-register-agreeing)
  first — the `variations[0]` truncation and the `BigInt` patch will both
  corrupt the cache if the sync inherits them.

---

## 10. Where everything else lives

- **[DATA-MODEL.md](./DATA-MODEL.md)** — why the schema looks the way it does.
- **[OPERATIONS.md](./OPERATIONS.md)** — the real Cloudflare setup and the
  deploy pipeline.
