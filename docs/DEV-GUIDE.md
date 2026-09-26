# TEAZO Developer Guide

Everything you need to run the whole site on your own machine, with a working
database, file storage, sign-in, bot check and email, and to build against
them. Deploying to Cloudflare is separate infrastructure work; you don't need
any of it to build your feature.

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
  and a simulated bucket.** No Cloudflare account, no Cloudflare credentials,
  nothing shared with anyone. Break it freely.
- **Square owns the product catalog, photos included.** Item names, prices,
  sizes, photos and sold-out state are edited in Square, never in our database.

The app also talks to a few outside services. What each one needs on your
machine:

| Service | What it does | On your machine |
|---|---|---|
| Google (through NextAuth) | Admin sign-in | The team's OAuth client id and secret (§2.3) |
| Square | The product catalog | The team's sandbox token, only for Square, menu admin or events work (§2.2) |
| Cloudflare Turnstile | The contact form's bot check | Nothing. Test keys are used automatically, but you need an internet connection |
| Brevo | Email in production | Nothing. Email is printed in your terminal, or caught by Mailpit (§2.2) |

**What is real today:**

- Google sign-in, checked against the `admin_user` table, and a guard on every
  admin page and admin write route (§5).
- The contact form: bot-checked, saved to the database, and emailed to the
  owner.
- The PDF menu: uploaded from `/admin/menu`, stored in R2, and served on
  `/static-menu`.
- The Worker's billing limits on R2 and the storage usage report (§2.5).

**Still sample data or hardcoded:** the Settings admins table, the events,
gallery and website content admin pages, and the content of every public page
(address, hours, menu, gallery). Those are waiting for their features.

---

## 2. Set up your machine

You need **Node.js 22 or newer** and **Git**. Wrangler refuses to start on
anything older, and it says which version it wants.

> **Windows: clone to a short path**, such as `C:\dev\Teazo-Site`. The local
> database lives several folders deep inside the repo; if the full path passes
> Windows' 260-character limit, every `wrangler d1` command fails with a bare
> `internal error` that says nothing about paths.

**What you need from someone else:**

- **Google sign-in:** the team's `AUTH_GOOGLE_ID` and `AUTH_GOOGLE_SECRET`.
  Ask Sammy. Needed for sign-in and anything under `/admin`.
- **Square:** the team's sandbox access token. Ask whoever holds the team's
  Square developer account. Needed only for Square, the menu admin (including
  the PDF menu upload) and the events admin.

Nothing else. You don't need a Cloudflare, Brevo or Turnstile account, and you
never need `wrangler login` for local work.

**Terminals and ports.** Keep these open while you work:

| Terminal | Runs | Port |
|---|---|---|
| 1 | The Worker, from `teazo-d1-proxy` (§2.1) | `8787` |
| 2 | The app, from `teazo-site` (§2.2) | `3000` |
| 3 | Mailpit, optional (§2.2) | `8025` |
| 4 | Everything else: seeding, queries, git | |

The app must stay on port **3000**: Google sign-in is registered for it. If
Next.js offers another port, something else is using 3000; stop it.

### 2.1 Start the database and storage

```bash
git clone https://github.com/W-Sammy/Teazo-Site.git
cd Teazo-Site/teazo-d1-proxy
npm install
npm run db:migrate:local
echo "PROXY_TOKEN=local-dev-token" > .dev.vars
npm run dev
```

`db:migrate:local` asks before applying migrations; press Enter or `y`. It
creates your database with the full schema and its starting data (the real
address and hours, the menu sections, the admin roles). `npm run dev` then
starts the Worker on `http://127.0.0.1:8787`. **Leave it running.**

Check it from another terminal:

```bash
curl -s http://127.0.0.1:8787/query -H 'authorization: Bearer local-dev-token' -H 'content-type: application/json' -d '{"sql":"SELECT label FROM role ORDER BY id"}'
```

You should see `Owner`, `Can Edit` and `Can View`.

**Looking inside your database.** The quickest way needs no token and no
running Worker:

```bash
cd teazo-d1-proxy
npx wrangler d1 execute teazo-db --local --command "SELECT email_normalized, role_id, status FROM admin_user"
```

`.dev.vars` holds the Worker's local settings. The `echo ... >` above creates
it; when you add a line later, append with `>>` or edit the file, because `>`
replaces everything in it.

### 2.2 Start the app

Create `teazo-site/.env.local`:

```bash
D1_PROXY_URL=http://127.0.0.1:8787
PROXY_TOKEN=local-dev-token
R2_PUBLIC_BASE=http://127.0.0.1:8787/media
```

`PROXY_TOKEN` must match the one in `teazo-d1-proxy/.dev.vars`. Then, from the
repo root:

```bash
cd teazo-site
npm install
npm run dev
```

Open **`http://localhost:3000`**. Use `localhost`, not `127.0.0.1` or the
network address Next.js prints: sign-in only works on `localhost`.

**If you are working on Square, the menu admin or the events admin**, add:

```bash
SQUARE_ACCESS_TOKEN=<the team's sandbox token>
NEXT_PUBLIC_BASE_URL=http://localhost:3000/
```

The trailing `/` matters: `/admin/menu` and `/admin/events` build the request
as `${NEXT_PUBLIC_BASE_URL}api/square/products`. Without these two the public
pages still run, but `/api/square/*`, `/admin/menu` (and with it the PDF menu
upload) and `/admin/events` fail. The Square client is fixed to Square's
**sandbox**, and the sandbox catalog is shared by the whole team, so only
create or delete test items, never other people's.

#### The contact form and email

**The contact form needs no extra setup.** It does need the Worker running
(it saves each message) and an internet connection (the bot check talks to
Cloudflare even with test keys).

- **Bot check.** With no keys set, development uses Cloudflare's published
  test keys, which always pass and show a small "for testing only" label on
  the widget. Leave `NEXT_PUBLIC_TURNSTILE_SITE_KEY` and `TURNSTILE_SECRET_KEY`
  unset. To see a failed check, set `TURNSTILE_SECRET_KEY=2x0000000000000000000000000000000AA`
  (always fails on the server) or
  `NEXT_PUBLIC_TURNSTILE_SITE_KEY=2x00000000000000000000AB` (the widget fails),
  then restart `npm run dev`.
- **Email.** Every email the site sends is printed in the terminal running
  `npm run dev` instead of being sent. Nothing reaches a real inbox from your
  machine. Never put a Brevo key in `.env.local`.

To see emails in a real inbox instead, run **[Mailpit](https://mailpit.axllent.org/docs/install/)**,
a free local inbox:

- **Windows:** download `mailpit-windows-amd64.zip` from the
  [releases page](https://github.com/axllent/mailpit/releases), unzip it, and
  from that folder run `./mailpit.exe --listen 127.0.0.1:8025`
- **macOS:** `brew install mailpit`, then `mailpit --listen 127.0.0.1:8025`
- **Linux:** follow the install page linked above, then
  `mailpit --listen 127.0.0.1:8025`

Then add `MAILPIT_URL=http://127.0.0.1:8025` to `.env.local`, restart
`npm run dev`, and open `http://127.0.0.1:8025`. Mailpit must be running before
you trigger an email, or the email fails and is only logged.

Where an email goes is decided in this order: through Brevo if
`BREVO_API_KEY` is set (production only), else to Mailpit if `MAILPIT_URL` is
set, else printed.

| Email | How to trigger it locally | Goes to |
|---|---|---|
| New contact message | Submit the form on `/contact` | `owner@teazo.test`, or `CONTACT_NOTIFY_TO` if you set it |
| "Email alerts paused" | The 21st message within an hour (or the 101st within a day) | Same |
| Admin invite | Adding an admin in Settings, once Settings saves to the database (§5) | The new admin's address |

Emails come from `website@teazo.test` unless you set `EMAIL_FROM`.

To see saved messages, and to hide or show the form:

```bash
cd teazo-d1-proxy
npx wrangler d1 execute teazo-db --local --command "SELECT created_at, email, subject FROM contact_message ORDER BY created_at DESC"
npx wrangler d1 execute teazo-db --local --command "UPDATE business_profile SET contact_form_enabled = 0 WHERE id = 1"
```

Set it back to `1` to show the form again. There is no admin page for
messages or for the switch yet.

### 2.3 Sign in locally

**Every page under `/admin` needs sign-in**, so do this if you work on anything
there. Add to `teazo-site/.env.local`:

```bash
AUTH_SECRET=<a long random string, from `openssl rand -base64 33`>
AUTH_GOOGLE_ID=<the team's Google OAuth client id>
AUTH_GOOGLE_SECRET=<the team's Google OAuth client secret>
```

`AUTH_SECRET` is yours; generate your own. Get the Google id and secret from
Sammy, and never commit them (`.env*` files are gitignored). Leave `AUTH_URL`
and `AUTH_TRUST_HOST` unset: NextAuth trusts `localhost` in development.

Sign-in reads the database, so **the Worker must be running**. Your Google
account also needs an admin row in your own database. From the repo root, in
your spare terminal:

```bash
cd teazo-d1-proxy
npm run db:seed:local -- you@gmail.com
```

Use the Google address you sign in with. The first address you seed becomes
the Owner, and any address added after that gets Can Edit. Pass `--role 2`
(Can Edit) or `--role 3` (Can View) to choose. Running it again for an address
you already added keeps its role unless you pass `--role`, and never adds a
second row. It applies any new migrations first, and only ever touches your
local database. Uploads and Square edits need Owner or Can Edit.

Then open `http://localhost:3000/login` and choose **Continue with Google**.
The email and password fields and "Forgot password?" on that page are
placeholders: there is no password sign-in yet. Don't type a real password
into them; the form puts what you type into the page's URL.

**If sign-in fails:**

| You see | Cause | Fix |
|---|---|---|
| "This Google account does not have admin access" | No live admin row for that exact address, or it is suspended | `npm run db:seed:local -- <that address>` |
| "We could not verify your access" | The database lookup failed | Start the Worker, and check `D1_PROXY_URL` and `PROXY_TOKEN` in `.env.local` |
| Sent back to `/login` with no message | Usually a missing `AUTH_SECRET` | Read the `[auth][error]` line in the `npm run dev` terminal |
| Google's `redirect_uri_mismatch` | You opened `127.0.0.1` or another port, or the redirect isn't registered | Use `http://localhost:3000`. The OAuth client must list `http://localhost:3000/api/auth/callback/google` |
| Google blocks you before our page | The OAuth app may only allow listed test users | Ask Sammy to add your Google account |

### 2.4 Reset

Your database is disposable. To start clean:

1. Stop the Worker (Ctrl+C in its terminal). A running Worker keeps the old
   files open.
2. From `teazo-d1-proxy`:

   ```bash
   rm -rf .wrangler/state
   npm run db:seed:local -- you@gmail.com
   npm run dev
   ```

The seed recreates the schema and your admin row. A reset also empties your
local bucket, so any menu PDF you uploaded is gone and `/static-menu` goes
back to the bundled PDF.

**After every pull:** run `npm install` in both `teazo-d1-proxy` and
`teazo-site`, then `npm run db:migrate:local` (or `npm run db:seed:local -- you@gmail.com`,
which also migrates). Restart the Worker if `wrangler.jsonc` changed.

### 2.5 Storage limits and usage

R2 bills for anything past its free allowance, so the Worker refuses uploads
before that happens (the full rules are in [ENDPOINTS.md](ENDPOINTS.md)). Your
local Worker runs with production's share: a 9.5 GB storage cap and 25,000
uploads a day. To see how full your local storage is:

```bash
curl -s http://127.0.0.1:8787/usage -H 'authorization: Bearer local-dev-token'
```

`r2.uploadsBlocked` is `true` when no upload can succeed. Add `?verify=1` to
also list the bucket and compare; that spends at least one upload from the
day's budget.

To make uploads fail on purpose, stop the Worker, append a limit to
`teazo-d1-proxy/.dev.vars`, and restart it. `.dev.vars` overrides the values in
`wrangler.jsonc` on your machine only.

```bash
echo "R2_STORAGE_CAP_BYTES=1000" >> .dev.vars    # the next upload gets 507 storage_full
echo "R2_CLASS_A_DAILY_BUDGET=1" >> .dev.vars     # after one upload today, the rest get 429 r2_daily_limit
```

Remove those lines afterwards. To upload a test file without the admin pages:

```bash
curl -X PUT http://127.0.0.1:8787/media/test/sample.pdf -H 'authorization: Bearer local-dev-token' -H 'content-type: application/pdf' --data-binary @some-file.pdf
```

A `503 limits_unavailable` on upload means your database is missing a
migration: run `npm run db:migrate:local`.

### 2.6 The scheduled sweeper

Deleting a file queues its bytes in `pending_r2_deletion`, and an hourly job in
the Worker removes them once they are 24 hours old (§4.2). Plain `npm run dev`
never runs that job. To run it by hand:

1. Stop the Worker and start it with `npm run dev:cron` instead.
2. Queue a file that is already due. No page deletes files yet, so queue one
   yourself, for example the test upload from §2.5:

   ```bash
   npx wrangler d1 execute teazo-db --local --command "INSERT INTO pending_r2_deletion (r2_bucket, r2_key, queued_at) VALUES ('teazo-media', 'test/sample.pdf', strftime('%Y-%m-%dT%H:%M:%fZ','now','-25 hours'))"
   ```

3. Run the job: `curl "http://127.0.0.1:8787/__scheduled?cron=0+*+*+*+*"`
4. The Worker terminal prints `sweep ok: {"reaped":1,...}`, and
   `http://127.0.0.1:8787/media/test/sample.pdf` now returns 404.

Use `teazo-media` as the bucket: the local Worker only removes files from its
own bucket.

### 2.7 Every environment variable

**`teazo-site/.env.local`**

| Variable | Local value | Needed for |
|---|---|---|
| `D1_PROXY_URL` | `http://127.0.0.1:8787` | Everything that reads or writes the database: sign-in, `/admin`, the contact form, the PDF menu, storage usage |
| `PROXY_TOKEN` | `local-dev-token` | Same. Must match `teazo-d1-proxy/.dev.vars` |
| `R2_PUBLIC_BASE` | `http://127.0.0.1:8787/media` | Serving stored files. Keep exactly this; `next.config.ts` allows images from that address |
| `AUTH_SECRET` | your own random string | Sign-in and `/admin` (§2.3) |
| `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET` | from Sammy | Sign-in and `/admin` (§2.3) |
| `SQUARE_ACCESS_TOKEN` | the team's sandbox token | `/api/square/*`, `/admin/menu`, `/admin/events` |
| `NEXT_PUBLIC_BASE_URL` | `http://localhost:3000/` | `/admin/menu`, `/admin/events`, and the sign-in link in invite emails |
| `MAILPIT_URL` | `http://127.0.0.1:8025` (optional) | Sending email to Mailpit instead of the terminal |
| `CONTACT_NOTIFY_TO` | optional | Where contact emails go. Defaults to `owner@teazo.test` |
| `EMAIL_FROM`, `EMAIL_FROM_NAME` | optional | The sender. Defaults to `website@teazo.test` and "TEAZO website" |

**Leave unset on your machine:** `NEXT_PUBLIC_TURNSTILE_SITE_KEY` and
`TURNSTILE_SECRET_KEY` (test keys are used automatically), `BREVO_API_KEY` and
`BREVO_SANDBOX` (production only), `AUTH_URL` and `AUTH_TRUST_HOST`, and the
variables Vercel sets itself: `VERCEL`, `VERCEL_ENV`,
`VERCEL_PROJECT_PRODUCTION_URL`.

**`teazo-d1-proxy/.dev.vars`**

| Variable | Local value | Notes |
|---|---|---|
| `PROXY_TOKEN` | `local-dev-token` | Must match `.env.local` |
| `R2_STORAGE_CAP_BYTES`, `R2_CLASS_A_DAILY_BUDGET` | normally not set | Come from `wrangler.jsonc`. Override only to test the limits (§2.5) |

The values for Vercel are in §8.1.

### 2.8 Scripts

| Where | Script | What it does | Run it locally? |
|---|---|---|---|
| `teazo-d1-proxy` | `npm run dev` | Starts the Worker | Yes |
| | `npm run dev:cron` | Same, plus the sweeper on demand (§2.6) | Yes, instead of `dev` |
| | `npm run db:migrate:local` | Applies new migrations to your database | Yes |
| | `npm run db:seed:local -- <email>` | Migrates, then gives that address an admin role | Yes |
| | `npm run typegen` | Generates Cloudflare types | Not needed |
| | `npm run tail`, `npm run db:backup` | Read the real Worker and database | No: they need the team Cloudflare account |
| `teazo-site` | `npm run dev` | Starts the app | Yes |
| | `npm run lint` | Lints the app | Yes, before a pull request |
| | `npm run build`, `npm start` | A production build | Only as in §2.9 |

### 2.9 Checking a production build locally

Everyday work uses `npm run dev`. A production build behaves differently: the
development defaults are off, so the test keys and printed email stop. To try
one anyway:

```bash
# teazo-site/.env.local, in addition to the usual lines
SQUARE_ACCESS_TOKEN=<any value, if you don't have the real one>
NEXT_PUBLIC_TURNSTILE_SITE_KEY=1x00000000000000000000AA
TURNSTILE_SECRET_KEY=1x0000000000000000000000000000000AA
AUTH_TRUST_HOST=true
MAILPIT_URL=http://127.0.0.1:8025
CONTACT_NOTIFY_TO=owner@teazo.test
```

Then `npm run build` and `npm start`. The build fails without
`SQUARE_ACCESS_TOKEN`, because the Square client checks for it as soon as it
loads. Emails only reach Mailpit in this mode; they are never printed.

---

## 3. Talking to the database

`teazo-site/app/lib/d1.ts` is the only way the app reaches the database.
Import from it; don't copy it.

| Export | What it does |
|---|---|
| `prepare(sql)` | Builds one statement. Chain `.bind(...)`, then `.all()`, `.first()` or `.run()` |
| `batch([...])` | Runs up to 40 statements as one transaction |
| `D1Error` | Thrown on failure, with the database's own message and the HTTP `status` |
| `D1Result` | The type `.all()` and `.run()` return, including `meta.changes` |
| `MAX_STATEMENTS` | The batch limit, 40 |

Using it:

```ts
import { prepare, batch } from "@/app/lib/d1";

const { results: hours } = await prepare(
  "SELECT day_of_week, display_text FROM business_hours ORDER BY day_of_week"
).all<{ day_of_week: number; display_text: string }>();

const profile = await prepare("SELECT * FROM business_profile WHERE id = ?1").bind(1).first();
```

Parameters are positional (`?1`, `?2`, and so on), bound in order with `.bind()`.

Rules:

- **Server only.** Call it from server components, route handlers and server
  actions, never from client components. `PROXY_TOKEN` must never be named
  `NEXT_PUBLIC_*`: it gives full access to the database.
- **`batch()` is the only transaction.** Writes that must succeed or fail
  together go in one `batch()` call. Two calls are two transactions.
- **At most 40 statements per `batch()`, and at least one.** `batch()` throws a
  `D1Error` before sending anything otherwise. One request, the SQL plus its
  values, must stay under 1 MB.
- **Every call is a network round trip**, so fetch what a page needs in as few
  calls as you can. Pages that read the database render on every request; if
  a public page needs caching, ask Juan.

### 3.1 Writing queries for your feature

Put the SQL for your feature in its own file under `teazo-site/app/lib/queries/`,
one file per feature, with one function for each thing a page needs, named for
what it does. Pages call those functions and never contain SQL themselves.
Whoever builds a feature writes its query file, in the same pull request.

Two real ones to copy from: `queries/contact.ts` (a read, an insert, and an
update that checks it really changed a row) and `queries/menu-documents.ts`
(several writes in one `batch()`).

For example, whoever builds the gallery would write something like:

```ts
// teazo-site/app/lib/queries/gallery.ts
import { prepare } from "@/app/lib/d1";

type Image = { id: string; name: string; media_id: string };

export function listGalleryImages() {
  return prepare(
    `SELECT id, name, media_id FROM gallery_image
     WHERE deleted_at IS NULL ORDER BY name_sort_key, id`
  ).all<Image>();
}

export function renameGalleryImage(id: string, name: string) {
  return prepare("UPDATE gallery_image SET name = ?1, name_sort_key = ?2 WHERE id = ?3")
    .bind(name, sortKey(name), id)
    .run();
}

export function sortKey(name: string) {
  return name.normalize("NFKD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}
```

Rules for query files:

- **Server code only.** Never import one into a `"use client"` component.
- **Pass values with `?1`, `?2` and `.bind()`.** Never build SQL by pasting
  values into the string.
- **Filter out deleted rows.** Add `WHERE deleted_at IS NULL` when reading
  `gallery_image`, `event`, `media_asset` or `admin_user`.
- **End every `ORDER BY` with the table's primary key** (usually `id`), so rows
  that tie keep a stable order.
- **Group writes that belong together** in one `batch([...])`.
- **Check that a write happened** when it must: `result.meta.changes === 0`
  means no row matched.
- **Set the computed columns when you write.** `gallery_image.name_sort_key`,
  `gallery_tag.name_normalized` and `admin_user.email_normalized` are not filled
  in for you. Write `email_normalized` with `normalizeEmail()` from
  `app/lib/admin-whitelist.ts`, the same function sign-in uses, or the admin
  can't sign in.
- **Deleting anything with a file attached** takes ordered steps. Follow §4.2.

---

## 4. Storing files

**Product photos are not in our storage.** They stay at Square. Today the photo
URL comes live from Square's API (`app/lib/square-helpers.ts`); once the
catalog sync exists it will be cached in `catalog_item_cache.square_image_url`.
Our bucket is for what Square can't hold: gallery photos, the home carousel,
event flyers and the PDF menu.

**The database stores a file's key, never its URL.** A key looks like
`gallery/2026/09/<uuid>.webp`. The URL is built when the page renders, from
`R2_PUBLIC_BASE`, so the same row works locally, on preview and in production.

`teazo-site/app/lib/media.ts` has everything for files. Import from it.

| Export | What it does |
|---|---|
| `putMedia(key, bytes, type)` | Stores a file and returns `{ key, size, bucket }`. Record `bucket` in `media_asset.r2_bucket` |
| `StoredMedia` | The type `putMedia` returns; pass it to your query function |
| `mintKey(prefix, ext)` | Creates a new key such as `gallery/2026/09/<uuid>.webp`. Keys are never reused |
| `toPublicUrl(key)` | Builds the public URL for a key. The only place a URL is ever built |
| `deleteMediaNow(key)` | Removes bytes immediately. Only for a file whose rows were never saved (§4.1) |
| `MEDIA_TYPES`, `MediaType` | The accepted types: jpeg, png, webp and pdf |
| `MAX_MEDIA_BYTES` | 10 MB. `putMedia` refuses anything larger |
| `MediaError` | Thrown on failure, with the HTTP `status` when the Worker answered |

`putMedia` accepts a Node `Buffer`, so the output of `sharp` can be passed
straight in.

Locally, uploads land in your simulated bucket and are served by your Worker at
`http://127.0.0.1:8787/media/<key>`. `next.config.ts` already lets `<Image>`
show files from there in development, as long as `R2_PUBLIC_BASE` is exactly
`http://127.0.0.1:8787/media`. Before a page shows stored images with
`<Image>` on Vercel, add the Worker's `workers.dev` hostnames to
`app/lib/imageHosts.ts`.

Keys start with a prefix that matches `media_asset.purpose`. The Worker
doesn't check prefixes, but the database checks `purpose`:

| Key prefix | `media_asset.purpose` |
|---|---|
| `gallery/` | `gallery` |
| `carousel/` | `carousel` |
| `events/` | `event` |
| `documents/menu/` | `document` (and `/api/menu/pdf` only serves this prefix) |
| `branding/` | `branding` |

**An upload can be refused**, so show the admin a clear message rather than a
generic failure. `putMedia` throws a `MediaError` with the `status`:

| Status | Why |
|---|---|
| `413` | Over 10 MB |
| `429` | The day's upload budget is used up. It resets at midnight UTC |
| `503` | The limits couldn't be checked. Locally: a missing migration |
| `507` | This upload would take storage past the cap, which keeps the client from ever being billed |

`docs/ENDPOINTS.md` has the details. To show how full storage is, for example
on the dashboard, use `getStorageUsage()` from `app/lib/usage.ts`; it reports
bytes and limits for both the database and storage, and `r2.uploadsBlocked`.

### 4.1 Saving a file

Every file follows the same three steps: resize (images only), store the bytes,
record the rows.

**The working example is the PDF menu:** `app/api/admin/menu/upload/route.ts`
(the route), `app/lib/menu-upload.ts` (the file checks shared by the browser
and the server), `app/lib/queries/menu-documents.ts` (the rows) and
`app/api/menu/pdf/route.ts` (serving it). PDFs skip the resize.

For images, a new upload route would look like this. It is a template; no
gallery route exists yet.

```ts
// teazo-site/app/api/admin/gallery/route.ts
import sharp from "sharp";
import { prepare, batch, D1Error } from "@/app/lib/d1";
import { putMedia, mintKey, deleteMediaNow, MediaError } from "@/app/lib/media";
import { requireAdminApi } from "@/app/lib/admin";
import { sortKey } from "@/app/lib/queries/gallery";

export async function POST(request: Request) {
  const access = await requireAdminApi(request, 2); // Can Edit or above, see §5
  if (!access.ok) return access.response;
  const admin = access.admin;

  const form = await request.formData();
  const file = form.get("file");
  const name = String(form.get("name") ?? "").trim();
  if (!(file instanceof File) || !name) {
    return Response.json({ error: "file and name are required" }, { status: 400 });
  }

  // 1. Resize. Re-encoding to webp at most 2000px wide turns a 1.6 MB phone
  //    photo into a few hundred KB. Photo size is what fills the free storage.
  const { data, info } = await sharp(Buffer.from(await file.arrayBuffer()))
    .rotate()
    .resize({ width: 2000, withoutEnlargement: true })
    .webp({ quality: 82 })
    .toBuffer({ resolveWithObject: true });

  // 2. Store the bytes first, so a failure never leaves rows pointing at nothing.
  let stored;
  try {
    stored = await putMedia(mintKey("gallery", "webp"), data, "image/webp");
  } catch (error) {
    if (error instanceof MediaError && error.status === 507) {
      return Response.json({ error: "Storage is full. Delete some photos first." }, { status: 507 });
    }
    if (error instanceof MediaError && error.status === 429) {
      return Response.json({ error: "Too many uploads today. Try again tomorrow." }, { status: 429 });
    }
    throw error;
  }

  // 3. Record it: both rows or neither.
  const mediaId = crypto.randomUUID();
  try {
    await batch([
      prepare(
        `INSERT INTO media_asset (id, r2_bucket, r2_key, mime_type, byte_size, width, height,
                                  original_filename, purpose, uploaded_by)
         VALUES (?1, ?2, ?3, 'image/webp', ?4, ?5, ?6, ?7, 'gallery', ?8)`
      ).bind(mediaId, stored.bucket, stored.key, stored.size, info.width, info.height, file.name, admin.id),
      prepare(`INSERT INTO gallery_image (id, media_id, name, name_sort_key) VALUES (?1, ?2, ?3, ?4)`)
        .bind(crypto.randomUUID(), mediaId, name, sortKey(name)),
    ]);
  } catch (error) {
    // The database refused the rows, so nothing points at the file: remove it.
    // With no status the outcome is unknown, so leave it rather than risk a
    // row that points at nothing.
    if (error instanceof D1Error && error.status !== undefined && error.status < 500) {
      await deleteMediaNow(stored.key);
    }
    throw error;
  }

  return Response.json({ mediaId, key: stored.key }, { status: 201 });
}
```

A file left behind by a failed save keeps counting toward the storage cap,
because nothing cleans it up later. That is why the example removes it when
the database definitely refused the rows.

The resize needs `sharp`. It already imports, because Next.js ships it as an
optional dependency, but add it to `teazo-site/package.json`
(`npm install sharp`) so its version is pinned.

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

**Never delete the bytes yourself.** Retire the rows and queue the bytes, in one
`batch()`. The Worker removes queued bytes 24 hours later, which leaves a day to
undo a mistake. Copy the bucket and key from the media row so they can't be
mistyped:

```ts
await batch([
  prepare("UPDATE gallery_image SET deleted_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?1").bind(imageId),
  prepare("UPDATE media_asset SET deleted_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?1").bind(mediaId),
  prepare("INSERT INTO pending_r2_deletion (r2_bucket, r2_key) SELECT r2_bucket, r2_key FROM media_asset WHERE id = ?1").bind(mediaId),
]);
```

The order matters. The database refuses to retire a `media_asset` while
anything still uses it, so whatever uses it goes first:

| What uses the file | First statement |
|---|---|
| `gallery_image`, `event`, an admin's avatar | Set its `deleted_at` |
| `content_block.media_id`, `site_link.icon_media_id` | Set the reference to `NULL` |
| `carousel_slide`, `menu_document` | Delete the row |

If the file is still used somewhere else, the batch fails with a `D1Error`
whose message contains `media_asset is still referenced`. Return a 409. The
error doesn't say where the file is used; run a query first if you want to tell
the admin.

**Old menu PDFs are kept on purpose.** Replacing the menu keeps every earlier
version. Removing one means deleting its `menu_document` row, then retiring and
queueing its media, in the same batch.

**To undo a deletion** within the 24 hours, clear `deleted_at` on the media row
and on what used it, and delete the `pending_r2_deletion` row, in one batch.
§2.6 shows how to watch the sweeper work locally.

---

## 5. Authentication

**How sign-in works.** Sign-in is Google only, through NextAuth
(`teazo-site/auth.ts`). `/login` is both the sign-in page and where errors are
shown. After Google, NextAuth admits the person only if Google has verified
their email and it matches a live `admin_user` row with status `active` or
`invited`; everyone else sees "This Google account does not have admin
access". The session is an encrypted cookie that lasts 8 hours; the database
holds no sessions. After sign-in the admin lands on `/admin`, and signs out
from the admin navigation.

The admin check runs twice: once at sign-in, and again on every admin page and
admin API request. So removing or suspending an admin takes effect on their
next request, even though their cookie is still valid.

**The helpers.** Import them; never write your own check.

| From | Export | Use it in | What it does |
|---|---|---|---|
| `app/lib/admin.ts` | `requireAdminPage(minRole = 3)` | Pages, layouts, server actions | Returns the admin, or redirects to `/login` (not signed in) or `/login?error=AccessDenied` (not enough access) |
| | `requireAdminApi(request, minRole = 3)` | Route handlers | Returns `{ ok: true, admin }`, or `{ ok: false, response }` with a ready 401, 403 or 503 |
| | `getAdmin(minRole)` | Code that must branch without redirecting | Returns the admin or `null`. Throws if the database can't be reached |
| | `Admin` | | `{ id, username, role_id, can_invite_users }` |
| `app/lib/admin-whitelist.ts` | `normalizeEmail(email)` | Anything that writes `admin_user.email_normalized` | Trims and lowercases, exactly as sign-in does |
| | `findAuthorizedAdmin(email)`, `AdminRole` | Rarely needed directly | The sign-in lookup |

Roles: 1 Owner, 2 Can Edit, 3 Can View. A lower number is more access, so
`minRole = 2` lets in Owners and Can Edit.

In a page:

```ts
const admin = await requireAdminPage(2);
```

In a route handler:

```ts
const access = await requireAdminApi(request, 2);
if (!access.ok) return access.response;
const admin = access.admin;
```

Three rules:

- **Every page under `/admin` calls `requireAdminPage` itself**, even though
  `app/admin/layout.tsx` also does. A layout isn't re-run on every client
  navigation, and it never protects route handlers or server actions.
- **Every admin route handler calls `requireAdminApi(request, n)` first.**
- **In an admin server action**, call `await requireAdminPage(n)` at the top.

**Who can reach what today:**

| Route | Who |
|---|---|
| Every page under `/admin` | Any admin (Can View and up) |
| `POST`, `PUT` and `DELETE` on `/api/square/products`, `POST /api/admin/menu/upload` | Can Edit and up |
| `GET /api/square/*`, `GET /api/menu/pdf`, `/api/auth/*`, the contact form | Everyone, on purpose |
| `/account` | Anyone signed in |

**Testing an admin write from a terminal.** `requireAdminApi` refuses a write
(anything but `GET`, `HEAD` or `OPTIONS`) unless its `Origin` header is the
site's own, so send one along with your session cookie (copy
`authjs.session-token` from your browser's cookies for `localhost:3000`):

```bash
curl -X POST http://localhost:3000/api/... -H "Origin: http://localhost:3000" -H "Cookie: authjs.session-token=..."
```

Otherwise you get 403 "Request origin is not allowed." Never call an admin
route from server code; call the query function directly.

**Adding admins.** Settings doesn't save to the database yet, so on your
machine the only way to add an admin is `npm run db:seed:local` (§2.3). When
the add-admin route is built, it inserts the row with status `invited` and then
emails the new admin how to sign in:

```ts
import { after } from "next/server";
import { sendAdminInvite } from "@/app/lib/admin-invite";

// once the admin_user row is saved
after(() => sendAdminInvite({ email, username, role, canManageAdmins, invitedBy: admin.username }));
```

`after()` sends it once the response is on its way, so the admin panel doesn't
wait. `sendAdminInvite` never throws: a failed email is logged, and the new
admin can still sign in. Locally the invite is printed or caught by Mailpit
(§2.2). Both `invited` and `active` can sign in, and nothing changes one into
the other yet. The database allows at most one Owner, and the handlers must
refuse to delete or demote the Owner.

**There are no passwords.** Sign-in is Google only, so there is no password
reset email. The "Forgot password?" link on `/login` is a placeholder. An admin
who loses their Google account is removed and added again under their new
address, which sends a new invite.

---

## 6. The database

27 tables, created by the migrations in `teazo-site/migrations/` (most of them
in `0001_init.sql`). Open them when you need exact columns.

**In use today:**

| Table | Holds | Written by | Read by |
|---|---|---|---|
| `admin_user` | admin accounts | `npm run db:seed:local` today; the Settings handlers once built | sign-in, `requireAdminPage`, `requireAdminApi` |
| `business_profile` | address, phone, email, and `contact_form_enabled` (one row) | the seed; the switch has a setter with no caller yet | `/contact` and its action, which read the switch only |
| `contact_message` | contact form messages | the public contact form, after the bot check | emailed to the owner; no inbox page yet |
| `media_asset` | one row per stored file | the PDF menu upload | `/api/menu/pdf` |
| `menu_document` | the PDF menu, versioned | the PDF menu upload on `/admin/menu` | `/api/menu/pdf`, used by `/static-menu` and `/admin/menu` |
| `pending_r2_deletion` | files waiting to be removed | delete handlers (none yet, §4.2) | the Worker's hourly sweeper, which marks rows done |
| `r2_object`, `r2_class_a_day` | what is stored in R2, and uploads per day | **the Worker only**, never app code | the Worker's billing limits and `GET /usage` |
| `role` | Owner / Can Edit / Can View | the seed | the `admin_user.role_id` foreign key. The app uses the ids 1 to 3 directly |

**Built, waiting for their features** (seeded by `0002_seed.sql` or empty):

| Table | Holds | Will be written by | Will be read by |
|---|---|---|---|
| `business_hours` | the 7 weekday rows | `/admin/website-content` | `/contact` |
| `hours_exception` | holiday closures, by date | `/admin/website-content` | `/contact` |
| `site_link` | social and delivery links | `/admin/website-content` | `/`, `/contact`, `/delivery` |
| `content_block` | editable text on the site | `/admin/website-content` | public pages |
| `carousel_slide` | home page carousel | no admin page yet | `/` |
| `gallery_image` | gallery entries | `/admin/gallery` | `/gallery` |
| `gallery_tag` | tag names | the seed, then uploads | gallery filter |
| `gallery_image_tag` | image ↔ tag | uploads | gallery filter |
| `event` | events: name, image, start and end | `/admin/events` | public pages |
| `event_item`, `event_category` | which Square items or categories an event covers | `/admin/events` | public pages |
| `square_sync_state` | where the Square sync is up to | the sync | the sync |
| `catalog_item_cache` | Square items, cached, including Square's photo URL | the sync | `/menu`, `/admin/menu` |
| `catalog_variation_cache` | **sizes and prices** | the sync | `/menu` |
| `catalog_category_cache` | Square categories, cached | the sync | `/menu` |
| `menu_section` | menu sections and subtitles | `/admin/menu` | `/menu` |
| `menu_section_item` | which items, in what order | `/admin/menu` | `/menu` |
| `menu_item_display` | badge, featured, hidden | `/admin/menu` | `/menu` |

Whoever wires holidays: the admin page treats a holiday as a month and day
that repeats every year, while `hours_exception` stores one row per date.
Decide how to map them before building it.

There are no passwords, reset tokens or invitation tokens in the schema:
sign-in is Google only (§5). Password sign-in would need a new migration (§7)
and a new provider in `auth.ts`.

### Columns that look odd but matter

| Column | Why it is there |
|---|---|
| `square_env` | Square's sandbox and production catalogs share no ids. Every Square-keyed row says which one it belongs to. |
| `square_version` | Tells you whether a cached price is stale. A stale price is a customer-facing error. |
| `name_sort_key` | SQLite cannot sort the way the admin UI does, and names are bilingual. Computed when you write the row. |
| `email_normalized`, `name_normalized` | Stop `Karen@x.com` / `karen@x.com` and `Matcha` / `matcha` being two different things. Write `email_normalized` with `normalizeEmail()`. |
| `status` (`admin_user`) | `active` and `invited` can sign in; `suspended` cannot. |
| `can_invite_users` | Per-admin flag, valid only for role 2. |
| `contact_form_enabled` | 1 shows the public contact form; 0 hides it, and the form's action refuses messages. |
| `r2_bucket` | Always record the `bucket` that `putMedia` returns. The sweeper only removes files from its own bucket, which keeps a preview from ever deleting production files. |
| `is_current` | At most one live PDF menu. None means the site serves the bundled `public/teazo-menu.pdf`. |
| `deleted_at` | `admin_user`, `media_asset`, `gallery_image` and `event` are soft-deleted: filter `WHERE deleted_at IS NULL`. In `pending_r2_deletion` it means the bytes are gone. |

SQLite has no `BOOLEAN` (use `INTEGER` 0/1), no `ENUM` (`TEXT` with a
`CHECK`), no JSON type (`TEXT`, validated) and no `UUID` (`TEXT` ids).
Timestamps are ISO-8601 text in UTC, written with
`strftime('%Y-%m-%dT%H:%M:%fZ','now')`.

### The Square cache

`catalog_item_cache`, `catalog_variation_cache` and `catalog_category_cache`
will be a copy of Square, filled by a sync that doesn't exist yet. Whoever
writes it:

- Key every row by the Square id **and** `square_env` (`sandbox` or
  `production`), because the two catalogs share no ids. The Square client in
  `app/lib/square.ts` is fixed to the sandbox, so set `square_env` from
  configuration, not from the client.
- Store `square_version`, so a stale price can be detected.
- One `catalog_variation_cache` row per size, never just the first.
- Never delete a cached row: set `is_deleted = 1`. Menu sections point at
  cached items.
- `square_image_url` is Square's own photo URL. The photo stays at Square.
- Events can name Square items before the sync has ever run, so when showing
  an event, skip item ids the cache doesn't have.
- Read the Square gotcha in §9 first.

---

## 7. Changing the schema

A schema change is a new migration file, reviewed in a pull request like any
other code.

1. Add `teazo-site/migrations/000N_what_it_does.sql`, taking the next number
   (currently `0005`). The descriptive name keeps two people's migrations from
   colliding.
2. Apply it on top of your existing data. From the repo root:
   `cd teazo-d1-proxy && npm run db:migrate:local`
3. Prove it also works from empty: stop the Worker, then
   `rm -rf .wrangler/state && npm run db:seed:local -- you@gmail.com`
   (the seed migrates and restores your admin row). **Nothing checks
   migrations automatically**, so say in the pull request that you did both.
4. Once it merges, everyone else runs `npm run db:migrate:local` (or the seed).

**Never edit a migration after it has merged.** It is recorded as applied, so
your edit silently never runs on any database that already has it. Write a new
migration instead.

One pull request is enough for a new table, an index, a nullable column, or a
new column with a `DEFAULT` (it may carry its own `CHECK`, as `0003` does).
Removing or renaming a column, or making an existing column `NOT NULL`, needs
**two** pull requests merged separately: first the code that stops using the
column, then the migration, because migrations are applied before the new code
goes live. Adding a `CHECK` or foreign key to an existing column rebuilds the
whole table; raise it in the channel before you start.

---

## 8. How your code reaches production

**The site deploys to Vercel, but the Worker doesn't exist yet**, so nothing
there can reach a database. On Vercel today, sign-in fails with "We could not
verify your access", the contact form refuses every message, and the PDF menu
link returns an error. Test anything that involves the database, storage,
sign-in or email on your machine.

Two D1 databases exist on the team Cloudflare account, `teazo-db` and
`teazo-db-preview`, with migrations `0001` and `0002`. The Worker and the R2
buckets are waiting on the account's payment setup. When they go live, the
order is: apply the missing migrations (`0003` and `0004` must be in place
before the Worker, or every upload is refused), then deploy the Worker, then
the app. Build as though that is already true and nothing you write now will
need reworking.

While that is pending:

- **Nothing validates your migrations for you.** Test them yourself (§7).
- **Nothing you merge reaches those databases.** The app can only reach them
  through the deployed Worker.
- `npm run tail` and `npm run db:backup` work on the real Worker and database
  and need the team Cloudflare account. Leave them to Juan.

### 8.1 Settings for Vercel

Mark every secret as Sensitive, and never prefix one with `NEXT_PUBLIC_`.

| Variable | Production | Preview | Notes |
|---|---|---|---|
| `D1_PROXY_URL` | the production Worker's `workers.dev` URL | the preview Worker's URL | |
| `PROXY_TOKEN` | the production Worker's secret | the preview Worker's secret | Secret. Must match `wrangler secret put PROXY_TOKEN` for that Worker |
| `R2_PUBLIC_BASE` | the production Worker URL + `/media` | the preview Worker URL + `/media` | |
| `AUTH_SECRET` | a long random string | its own string | Secret |
| `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET` | the team OAuth client | the same | Secret. The client must list each deployment's `/api/auth/callback/google` |
| `SQUARE_ACCESS_TOKEN` | the sandbox token, for now | the same | Secret. The Square client is fixed to the sandbox |
| `NEXT_PUBLIC_BASE_URL` | `https://teazo-site.vercel.app/` | that preview's URL | Trailing `/`. Also the sign-in link in invite emails |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | the production widget's site key | `1x00000000000000000000AA` | Public |
| `TURNSTILE_SECRET_KEY` | the production widget's secret | `1x0000000000000000000000000000000AA` | Secret |
| `BREVO_API_KEY` | the Brevo API key | leave unset | Secret. Unset means the deployment sends no email |
| `EMAIL_FROM` | a sender address verified in Brevo | | Required whenever `BREVO_API_KEY` is set, or every email fails |
| `EMAIL_FROM_NAME` | optional | | Defaults to "TEAZO website" |
| `CONTACT_NOTIFY_TO` | the owner's inbox | | Where new contact messages are emailed |

Vercel sets `NODE_ENV`, `VERCEL`, `VERCEL_ENV` and
`VERCEL_PROJECT_PRODUCTION_URL` itself; don't add them. `BREVO_SANDBOX=1` makes
Brevo check a request and deliver nothing, for testing a key.

**The Worker's own settings** live in `teazo-d1-proxy/wrangler.jsonc`: the
bucket name and each deployment's R2 storage cap and daily upload budget. Its
one secret is set with `npx wrangler secret put PROXY_TOKEN` (and again with
`--env preview`).

Previews use Cloudflare's Turnstile test keys because each preview gets its own
`*.vercel.app` address, and a widget only covers the hostnames listed on it. On
the production deployment the code ignores a test secret, so every submission
is refused until the real one is set; a test site key there is logged as an
error. Either way the check fails closed, never open.

**Turnstile.** On the team Cloudflare account, open Turnstile, add a widget in
Managed mode, and list the production hostname (`teazo-site.vercel.app` for
now, plus the shop's own domain later). It is free, and the site does not need
to be on Cloudflare.

**Brevo** (free plan: 300 emails a day, never billed while no card is added):

1. The client opens the account. The free plan allows one login.
2. Verify the sender address under Settings > Senders, using the 6-digit code
   Brevo emails to it.
3. Create an API key, and add it to Vercel for Production only.
4. Turn off IP blocking for API keys: Settings > Security > Authorized IPs >
   "Deactivate for API". Vercel has no fixed IP address, and once Brevo switches
   blocking on after 30 days, every email would be refused. Don't authorize IPs
   by hand, because that switches blocking on.
5. Never add a card or buy credits. Buying credits replaces the free 300 a day.
6. Brevo expires a key that goes unused for 90 days and emails a warning 7 days
   before. If the site goes that long without sending an email, create a new
   key.
7. Without the shop's own domain, Brevo rewrites the sender address, and
   Hotmail and Gmail may file the emails as junk. Have the owner mark the first
   one "Not junk", and tell new admins to check their spam folder for the
   invite. A domain fixes this for good.

A failed email never loses a contact message: it is saved before the email is
attempted, and a failure is only logged. The owner gets at most 20 contact
emails an hour and 100 a day, so a flood of spam can't use up Brevo's 300 a
day. The first message over either limit sends one "alerts paused" email, and
every message is still saved. Admin invites come out of the same 300 a day.

---

## 9. Gotchas

- **`business_hours.day_of_week` is 0 = Monday.** JavaScript's `getDay()` is
  0 = Sunday.
- **Compare timestamps only in the same format.** Comparing a column against
  `datetime('now', …)` compares `'2026-09-08T…'` with `'2026-09-08 …'` as
  text and silently gives the wrong answer. Use
  `strftime('%Y-%m-%dT%H:%M:%fZ', 'now', …)` on both sides.
- **End every `ORDER BY` with the primary key** (`…, id`), or rows that tie
  can come back in a different order on each request.
- **Never gate anything on `auth()` alone.** The session cookie stays valid for
  up to 8 hours after an admin is removed. Use `requireAdminPage` or
  `requireAdminApi` (§5), which check `admin_user` on every request.
- **Leave `GET /api/square/*` public.** `/admin/menu` and `/admin/events` fetch
  it from the server without your cookie, so guarding it would break both
  pages. Guard only the writes.
- **Use `http://localhost:3000`, never `127.0.0.1:3000`.** They are different
  addresses to Google, and only `localhost` is registered for sign-in (§2.3).
- **Renaming a gallery image means recomputing `name_sort_key`.**
- **Tag names are unique ignoring case**, so add them with
  `INSERT … ON CONFLICT(name_normalized) DO NOTHING`.
- **Building the Square sync?** The Square routes will corrupt the cache if the
  sync copies them. `PUT /api/square/products/[id]` sends Square only the first
  size, so every other size is dropped, and it leaves out the item's photo ids,
  which may clear its photo.
  `POST` creates a single size named "Regular", and the list and helper code
  read only the first size's price. `app/lib/square.ts` also replaces
  `BigInt.prototype.toJSON` with a lossy `Number(this)`, which every price
  passes through. Fix these before caching anything.

---

## 10. Where everything else lives

| What | Where |
|---|---|
| The schema: every table, column, constraint and trigger | `teazo-site/migrations/`, read in order (`0001` creates most tables, `0003` adds the contact form switch, `0004` adds the R2 ledger) |
| The starting data: roles, address, hours, links, content blocks, menu sections, gallery tags (no admins) | `teazo-site/migrations/0002_seed.sql` |
| Giving yourself an admin role locally | `teazo-d1-proxy/scripts/seed-local.mjs` (`npm run db:seed:local`) |
| The proxy Worker: the only file with Cloudflare bindings | `teazo-d1-proxy/src/index.ts` |
| Its bindings, cron schedule, bucket names, and each deployment's R2 cap and daily budget | `teazo-d1-proxy/wrangler.jsonc` |
| Every Worker endpoint, limit and error code | `docs/ENDPOINTS.md` |
| Database, storage, usage, email and bot-check helpers | `teazo-site/app/lib/` (`d1.ts`, `media.ts`, `usage.ts`, `email.ts`, `turnstile.ts`) |
| The emails the site sends | `teazo-site/app/lib/contact-notification.ts`, `teazo-site/app/lib/admin-invite.ts` |
| Feature SQL | `teazo-site/app/lib/queries/` |
| Sign-in and admin checks | `teazo-site/auth.ts`, `teazo-site/app/lib/admin.ts`, `teazo-site/app/lib/admin-whitelist.ts` |

**The migrations are the source of truth** for columns, constraints and
triggers. If this guide disagrees with them, they win; say so in the channel
and the guide gets corrected. Their prose comments can lag behind the code,
because a merged migration is never edited.

Creating the real Cloudflare resources and deploying (databases, buckets,
secrets, going live) is tracked separately as infrastructure work.

If you get stuck on setup, post the command and its full output in the channel
rather than a screenshot of the error line. The useful part is usually three
lines above it.
