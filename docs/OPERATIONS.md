# TEAZO — Setup, Deployment and Operations

This is the runbook for the infrastructure: creating the Cloudflare
resources, setting up the deploy pipeline and its secrets, and taking the site
live. After that one-time setup, **deploys happen by merging** — nobody runs them
by hand. If you are building features, the document you want is
[`DEV-GUIDE.md`](./DEV-GUIDE.md). [`DATA-MODEL.md`](./DATA-MODEL.md) explains
*why* the schema looks like this.

**Source of truth for the schema is [`teazo-site/migrations/0001_init.sql`](../teazo-site/migrations/0001_init.sql).**
If this guide and that file disagree, the file wins.

| | |
|---|---|
| Hosting | **Vercel** — the app has no Cloudflare bindings |
| Database | Cloudflare D1 (SQLite) — 25 tables, 26 indexes, 6 triggers — reached through a proxy Worker |
| Object storage | Cloudflare R2 — bucket `teazo-media`, served from a custom domain |
| Catalog | Square API (authoritative — we cache it, we do not own it) |
| Cost | **$0 on Cloudflare** — the whole stack fits the free tier ([§16](#16-running-it-free)) |
| Status | Migrations and proxy Worker written and tested locally. **Nothing deployed yet.** |

---

## Contents

1. [What I own](#1-what-i-own)
2. [Blockers today](#2-blockers-today)
3. [The architecture, and why there is a proxy Worker](#3-the-architecture-and-why-there-is-a-proxy-worker)
4. [The proxy Worker](#4-the-proxy-worker)
5. [Environment variables](#5-environment-variables)
6. [How deploys happen](#6-how-deploys-happen)
7. [Production and preview](#7-production-and-preview)
8. [Serving media from the R2 custom domain](#8-serving-media-from-the-r2-custom-domain)
9. [Migrating existing assets into R2](#9-migrating-existing-assets-into-r2)
10. [The sweeper](#10-the-sweeper)
11. [Deploy order for a schema change](#11-deploy-order-for-a-schema-change)
12. [Reviewing a schema change](#12-reviewing-a-schema-change)
13. [Go-live checklist](#13-go-live-checklist)
14. [Square sandbox → production cutover](#14-square-sandbox--production-cutover)
15. [Rollback and backups](#15-rollback-and-backups)
16. [Running it free](#16-running-it-free)
17. [How much can it actually hold?](#17-how-much-can-it-actually-hold)

---

## 1. What I own

| Area | What that means |
|---|---|
| **Database schema** | Reviews every migration pull request — `.github/CODEOWNERS` routes them here. Migrations are applied by the pipeline, never by hand. |
| **D1 proxy Worker** | Owns `teazo-d1-proxy/` and its secret. Deployed by the pipeline. |
| **Cloudflare resources & the pipeline** | Creates the D1 databases and R2 buckets once, attaches the custom domain, and sets up the deploy pipeline ([§6](#6-how-deploys-happen)). After that, deploys happen on merge. |

Concretely, the state of that work:

- The 25-table schema in `teazo-site/migrations/` — written, validated, **done**.
- The D1 proxy Worker in `teazo-d1-proxy/` — written and tested locally, **done**.
- The deploy pipeline — `.github/workflows/deploy.yml` and `.github/CODEOWNERS`
  — written, **done**. Switched off until its secrets exist
  ([§6.1](#61-setting-the-pipeline-up)).
- Creating the real D1 databases and R2 buckets, wiring the custom domain, and
  turning the pipeline on. **Blocked** — see [§2](#2-blockers-today).
- Reviewing schema changes. The team opens migrations as pull requests;
  [§12](#12-reviewing-a-schema-change) is what to check before approving one.

**Most of the team needs no credentials at all.** Public pages, admin screens and
gallery work all run against a local D1 and a local R2 with a made-up proxy token.
Only two jobs need a real secret: Square work (the sandbox access token) and
sign-in work (the team's Google OAuth client). Nobody deploys by hand — merging does ([§6](#6-how-deploys-happen)).

Everything else — the read path, the mutation contract, auth, the table reference, the
query API, local setup — lives in `DEV-GUIDE.md`.

---

## 2. Blockers today

**The schema and the proxy Worker are finished and tested. Nothing is deployed.**

Three things are blocking deployment, all outside the code:

1. **The team's Cloudflare account has to be confirmed.** The one currently
   authenticated locally is a personal one, and resources created there would
   not be reachable by the rest of you.
2. **R2 is not enabled yet.** It needs the checkout flow completed in the
   dashboard — a card on the account. It still costs **$0**; the free allowance
   covers this project many times over ([§16](#16-running-it-free)). Until then
   the API returns error 10042.
3. **Turning the pipeline on needs admin on the GitHub repository.** Actions
   secrets and branch protection rules can only be set by a repository admin. The
   repository belongs to the `W-Sammy` account and the infrastructure owner has
   write access, not admin — so either the repository owner makes those two
   changes ([§6.1](#61-setting-the-pipeline-up)) or grants admin.

None of them blocks the team. Everything in `DEV-GUIDE.md` can be built against a local
database and a local R2, and it will work unchanged when the real ones exist. But
nothing in [§13](#13-go-live-checklist) can start until both are cleared.

---

## 3. The architecture, and why there is a proxy Worker

The app is hosted on **Vercel**. The database is still **Cloudflare D1** and the
object storage is still **Cloudflare R2**. Those are compatible, but not for
free: D1 is only reachable from inside a Worker, so we run one.

> From Cloudflare's own docs: *"To access a D1 database outside of a Worker
> project, you need to create an API using a Worker."* The D1 REST API is not
> an alternative for the request path — Cloudflare describes it as *"best
> suited for administrative use as the global Cloudflare API rate limit
> applies."*

### 3.1 The shape of it

```
  browser --> Vercel: Next.js app (teazo-site/)
                |
                |  HTTPS + bearer token
                v
              Worker: teazo-d1-proxy   /query  /batch  /media/*
                |                 |
                | binding         | binding
                v                 v
              D1: teazo-db      R2: teazo-media
                                  |
  browser <-- image reads --------+  via media.<domain>, CDN-cached
                                     (or the Worker's /media/, section 8.1)
```

Three things follow from this diagram:

1. **Writes to the database cross a network hop.** Batch aggressively; a page
   that makes eight sequential queries pays eight round trips.
2. **Reads of media do not touch Vercel at all.** They go to the R2 custom
   domain and are served from Cloudflare's CDN. That is faster and cheaper than
   proxying bytes through a function.
3. **The proxy Worker is a real deployable** with an owner, a secret, and a
   deploy step. It is small — one file — but it is not free.

### 3.2 Repository layout

```
Teazo-Site/
├── teazo-site/            Next.js app  →  deployed to Vercel
│   ├── app/
│   └── migrations/        the D1 schema lives with the app
└── teazo-d1-proxy/        Cloudflare Worker  →  deployed with wrangler
    ├── src/index.ts       /query, /batch, and the scheduled sweeper
    ├── wrangler.jsonc     the only file in the repo with bindings
    └── tsconfig.json
```

> **The Worker must live outside `teazo-site/`.** `teazo-site/tsconfig.json`
> has `"include": ["**/*.ts", …]` with only `node_modules` excluded, so a
> Worker placed inside the app directory gets type-checked by `next build` and
> fails it on `D1Database` and `R2Bucket`. Keeping it a sibling avoids the
> problem entirely rather than papering over it with an `exclude` entry.

`wrangler.jsonc` points `migrations_dir` back at `../teazo-site/migrations`.
Wrangler accepts a path outside its own project, and the schema belongs next to
the app that depends on it.

---

## 4. The proxy Worker

The whole thing is [`teazo-d1-proxy/src/index.ts`](../teazo-d1-proxy/src/index.ts).
It exposes two endpoints and one cron:

| | |
|---|---|
| `POST /query` | `{ sql, params }` → one statement, returns D1's `.all()` result |
| `POST /batch` | `{ statements: [{sql, params}] }` → `env.DB.batch()`, all-or-nothing |
| `scheduled()` | the sweeper — see [§10](#10-the-sweeper) |

Auth is a bearer token compared in constant time (both sides are SHA-256'd
first, so the comparison never branches on length).

**On accepting arbitrary SQL.** The proxy will run whatever the token-holder
sends. That is deliberate: the only intended caller is our own Next.js server,
which is exactly as trusted as the database itself. The security property that
matters is therefore *the token never reaches the browser* — it is a
server-only Vercel environment variable and must never be named
`NEXT_PUBLIC_*`. If it leaks, rotate it on both sides in one sitting:

```bash
cd teazo-d1-proxy && npx wrangler secret put PROXY_TOKEN
```

Production and preview hold **different** tokens, so a rotation is two commands —
see [§7](#7-production-and-preview) and step 7 of [§13](#13-go-live-checklist).

**`/batch` is the only transaction that exists.** D1 has no interactive
transactions, so anything that must be atomic has to travel as a single
`/batch` request. Splitting a logical transaction across two calls silently
gives up atomicity.

### 4.1 Scripts

In `teazo-d1-proxy/package.json` (already there):

```bash
npm run dev                  # proxy against local D1
npm run dev:cron             # same, plus a triggerable scheduled handler
npm run db:migrate:local     # apply migrations to the local D1
npm run db:backup            # wrangler d1 export -> backup.sql (a read)
npm run tail                 # live logs from the deployed Worker
```

There are deliberately **no `deploy` or `db:migrate:prod` scripts**. Deploys and
remote migrations run only in the pipeline ([§6](#6-how-deploys-happen)); a
one-word shortcut for doing either by hand would just be a convenient way around
review.

---

## 5. Environment variables

All server-only except `NEXT_PUBLIC_BASE_URL`. **Never give a secret the
`NEXT_PUBLIC_` prefix** — Next.js ships every such variable to the browser.

| Variable | Where | What |
|---|---|---|
| `D1_PROXY_URL` | Vercel | `https://teazo-d1-proxy.<sub>.workers.dev` |
| `PROXY_TOKEN` | Vercel **and** `wrangler secret put` | same value both sides |
| `R2_PUBLIC_BASE` | Vercel | `https://media.teazosf.com`, or `https://teazo-d1-proxy.<sub>.workers.dev/media` without a custom domain ([§8.1](#81-without-a-custom-domain)) |
| `SQUARE_ACCESS_TOKEN` | Vercel | sandbox today. **Needed at build time:** without it `next build` fails at "Collecting page data", so set it for Production **and** Preview |
| `SQUARE_ENV` | Vercel | `sandbox` \| `production` — see [§14](#14-square-sandbox--production-cutover) |
| `SQUARE_WEBHOOK_SIGNATURE_KEY` | Vercel | webhook verification |
| `AUTH_SECRET` | Vercel | NextAuth's signing secret — Auth.js calls it "the only strictly required environment variable". Use the same value in Production and Preview if preview sign-in goes through the redirect proxy below |
| `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET` | Vercel | the Google OAuth client, from whoever owns sign-in |
| `AUTH_REDIRECT_PROXY_URL` | Vercel | only for Google sign-in on preview deploys, whose URLs keep changing: a stable URL ending in `/api/auth` that Google always redirects to |
| `NEXT_PUBLIC_BASE_URL` | Vercel | the site's own URL, **ending in `/`** — `/admin/menu` requests `${NEXT_PUBLIC_BASE_URL}api/square/products` |

> **`SQUARE_ACCESS_TOKEN` is needed at *build* time, not just at run time.**
> Verified: with no environment set, `next build` fails at "Collecting page
> data" with `SQUARE_ACCESS_TOKEN is not set` — `app/lib/square.ts` throws the
> moment it is imported, and the build imports every API route. Set it for
> **Production and Preview**, or pull-request previews stop building. With it
> set, the build is clean; `AUTH_SECRET` is only needed at run time, but a
> deploy without it will fail on the first sign-in.

**The app needs no R2 credentials.** Files go through the proxy Worker
(`/media/*`), which holds the bucket binding and returns the bucket name with
every upload, so there is no access key to mint, store or rotate.

Local dev uses `teazo-site/.env.local` for the app and
`teazo-d1-proxy/.dev.vars` for the Worker. Both are gitignored.

Every one of these has to be set **twice** on Vercel — once for Production, once for
Preview. See the callout in [§7](#7-production-and-preview); it is the single easiest
way to lose real data on this stack.

---

## 6. How deploys happen

Nobody deploys by hand. Merging is deploying, and the whole pipeline is one file:
`.github/workflows/deploy.yml`.

| When code merges into | The pipeline does |
|---|---|
| a pull request into `dev` or `main` | **validate** — typechecks the proxy Worker and applies every migration to a fresh local D1 on the runner. No credentials involved. |
| `dev` | validate, then **preview**: migrate `teazo-db-preview`, deploy the preview Worker. Vercel builds the `dev` preview itself. |
| `main` | validate, then **production**, strictly in order: migrate `teazo-db` → deploy the proxy Worker → deploy the app to Vercel production. |

**Why production is sequenced by the pipeline, not by Vercel.** The schema has to
exist before the app that reads it goes live ([§11](#11-deploy-order-for-a-schema-change)).
If Vercel deployed `main` on its own the moment the commit landed, it would race the
migration. So at setup, `teazo-site/vercel.json` switches off Vercel's automatic
deploy for `main` — and only `main`:

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "git": { "deploymentEnabled": { "main": false } }
}
```

That file is deliberately **not in the repo yet** — it goes in at the same moment
the pipeline is switched on. [§6.1](#61-setting-the-pipeline-up) explains why.

The workflow deploys the app itself, as its last step, only after the migration and
the Worker have both succeeded. **A failed migration stops the app from shipping.**
Every other branch — `dev` and every pull request — still gets Vercel's automatic
preview. This is Vercel's documented pattern for deploying from CI: `vercel pull`,
`vercel build --prod`, then `vercel deploy --prebuilt --prod`.

**Runs never overlap.** The workflow's `concurrency` group allows one run per branch
at a time and never cancels one in progress — a half-applied migration run is far
worse than a queued one.

| Deployable | Lives in | Deployed by | Holds |
|---|---|---|---|
| Next.js app | `teazo-site/` | the pipeline on `main`; Vercel's Git integration for previews | all UI and API routes |
| D1 proxy Worker | `teazo-d1-proxy/` | the pipeline, on `dev` and `main` | the only Cloudflare bindings; the sweeper |
| D1 database + R2 bucket | Cloudflare | created once by hand ([§13](#13-go-live-checklist)); schema by the pipeline | the data |

On Vercel, set the project's **Root Directory to `teazo-site`** — the repo root is
not the app. The pipeline runs `vercel` from the repo root and relies on that
setting, which `vercel pull` fetches.

### 6.1 Setting the pipeline up

One-time. After this, nobody touches a deploy again. **Everything in this
subsection needs admin on the repository** — see [§2](#2-blockers-today).

**GitHub Actions secrets** — Settings → Secrets and variables → Actions:

| Secret | What |
|---|---|
| `CLOUDFLARE_API_TOKEN` | a Cloudflare API token with **Account › D1 › Edit** and **Account › Workers Scripts › Edit** — nothing broader |
| `CLOUDFLARE_ACCOUNT_ID` | the team Cloudflare account's id |
| `VERCEL_TOKEN` | a Vercel access token from the team's Vercel account |
| `VERCEL_ORG_ID` | from `.vercel/project.json`, after running `vercel link` once locally |
| `VERCEL_PROJECT_ID` | the same file |

**Branch protection on `main`** — Settings → Branches — because a merge to `main` is
a production deploy:

- Require a pull request before merging, with at least one approval.
- Require the **Validate schema and Worker** status check to pass.
- Require review from Code Owners. `.github/CODEOWNERS` routes pull requests that
  touch the schema, the Worker or the pipeline to their owner.
- Do not allow bypassing the above.

> **A sole code owner cannot approve their own pull requests.** With only one
> account listed in `CODEOWNERS`, that person's own schema changes could never
> satisfy "Require review from Code Owners". Add a second owner for those paths
> before turning the setting on.

Apply at least the status check to `dev` as well, so broken SQL cannot reach the
preview database either.

**Commit the database ids.** `wrangler d1 create` prints an id for each database.
Put both into `teazo-d1-proxy/wrangler.jsonc` in a pull request — they are
identifiers, not secrets, and the pipeline cannot run without them.

**Switch it on — last, and both together:**

1. Set the repository **variable** `DEPLOYS_ENABLED` to `true` — Settings →
   Secrets and variables → Actions → Variables. Until it is `true`, the deploy
   jobs are skipped: pull requests are still validated, and nothing is deployed.
2. Add `teazo-site/vercel.json`, with the contents shown in
   [§6](#6-how-deploys-happen), in a pull request.

> **Do these two together, never one alone.** `vercel.json` stops Vercel deploying
> `main` by itself; `DEPLOYS_ENABLED` lets the pipeline do it instead. The file
> without the variable means merges to `main` **stop reaching production at all,
> silently** — which is exactly what would happen if the file were committed
> today and rode along on an ordinary `dev` → `main` merge before setup is
> finished. The variable without the file means `main` deploys twice, and Vercel's
> copy races the migration.

`DEPLOYS_ENABLED` is also the **emergency brake**: set it to anything other than
`true` and every deploy stops, while pull requests keep being validated.

---

## 7. Production and preview

| | Production | Preview |
|---|---|---|
| D1 | `teazo-db` | `teazo-db-preview` |
| R2 | `teazo-media` | `teazo-media-preview` |
| Worker | the pipeline, on merge to `main` | the pipeline, on merge to `dev` |
| `PROXY_TOKEN` | one value | **a different value** |

> **Scope every Vercel environment variable.** Vercel applies unscoped
> variables to preview deployments too, so an unscoped `D1_PROXY_URL` means
> every pull-request preview writes to the production database. Set each
> variable twice — once for Production, once for Preview — with different
> values. This is the single easiest way to lose real data on this stack.

Media is separated by the Worker, not by credentials: the preview Worker is
bound to `teazo-media-preview`, so a preview deployment physically cannot
write to production media.

---

## 8. Serving media from the R2 custom domain

Attach a custom domain to the bucket: Cloudflare dashboard → R2 → `teazo-media`
→ Settings → Public access → Custom Domains → `media.teazosf.com`.

> **Do not use the `r2.dev` subdomain.** Cloudflare states it is
> "rate-limited and should only be used for development purposes", and it
> cannot use WAF rules, caching, or access controls. It must never appear in
> `R2_PUBLIC_BASE`.

**Add a Cache Rule**, or the custom domain buys you very little: Cloudflare
caches only a subset of file extensions by default. Dashboard → the zone →
Rules → Caching → Cache Rules → hostname equals `media.teazosf.com` →
**Cache Everything**.

Verify it works by requesting the same object twice:

```bash
curl -sI https://media.teazosf.com/gallery/2026/09/x.webp | grep -i cf-cache-status
```

The second response should say `HIT`. `DYNAMIC` or `BYPASS` means the rule is
missing.

### 8.1 Without a custom domain

A custom domain needs the domain's DNS to be on Cloudflare. If the client's DNS
has to stay where it is, **the proxy Worker serves media itself** — no DNS
change and no extra setup:

```
R2_PUBLIC_BASE=https://teazo-d1-proxy.<sub>.workers.dev/media
```

It costs one Worker request for each image view the browser has not already
cached, against 100,000 free per day. Every response is sent with
`Cache-Control: public, max-age=31536000, immutable`, so a returning visitor
downloads each image once. For a one-location shop that is comfortably inside
the free tier, and moving to a custom domain later is one environment variable:
no rows change, because the database stores keys, not URLs.

Put the Worker's hostname in `app/lib/imageHosts.ts` instead of
`media.teazosf.com` in that case.

---

## 9. Migrating existing assets into R2

> **This is the one sanctioned by-hand write to production.** Everything else
> reaches production through the pipeline. Uploading the images that already
> exist is a one-time bootstrap before launch — R2 objects cannot ship inside a
> migration — so it is run once, by hand, against preview first and production
> second.

A one-time job, mine, not developer work. `public/` is 18 MB / 101 files. Split by
**who owns the file**, not by type:

| Stays in repo | Moves to R2 |
|---|---|
| `admin_icons/` (14), `social_icons/` (4) | `carousel_images/` — 5 files, 8.1 MB |
| `pdfjs/` (2, vendored) | `promotions/` (1), `teazo-menu.pdf` |
| logos, `pink_scribble.png` | |

About 8.4 MB migrates — the carousel, one promotion image and the PDF menu.
**Product photos do not move:** they come from Square, so `public/menu_items` is
retired once the menu reads from Square. A script, not an afternoon of clicking:

```ts
// scripts/migrate-assets.ts — run with: npx tsx scripts/migrate-assets.ts
import { readFile } from "node:fs/promises";
import { putMedia } from "../app/lib/media";
import { prepare, batch } from "../app/lib/d1";

const MIME: Record<string, string> = {
  ".webp": "image/webp", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
  ".png": "image/png", ".pdf": "application/pdf",
};

// The home carousel, in the order image-carousel.tsx shows it today.
// Product photos (public/menu_items) are not migrated: they come from Square.
const CAROUSEL = ["menu.jpg", "fresh_leaf.jpg", "leaf_basket.jpeg", "dried_leaves.jpg", "drink.jpg"];

for (const [order, name] of CAROUSEL.entries()) {
  const path = `public/carousel_images/${name}`;
  const bytes = await readFile(path);
  const ext = path.slice(path.lastIndexOf(".")).toLowerCase();
  const stored = await putMedia(`carousel/${crypto.randomUUID()}${ext}`, bytes, MIME[ext]);
  const mediaId = crypto.randomUUID();

  await batch([
    prepare(
      `INSERT INTO media_asset (id, r2_bucket, r2_key, mime_type, byte_size, original_filename, purpose)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'carousel')`
    ).bind(mediaId, stored.bucket, stored.key, MIME[ext], stored.size, path),
    prepare("INSERT INTO carousel_slide (media_id, sort_order) VALUES (?1, ?2)").bind(mediaId, order),
  ]);
  console.log(stored.key, "←", path);
}
```

Resize the five carousel JPEGs before uploading them. Once the rows exist,
delete the originals from `public/` in the same PR that switches the components
over — not before, or the site breaks between merges.

> `public/carousel_images/dried_leaves.jpg` is **8.1 MB**. The optimizer will
> serve a resized derivative, but it still has to fetch and process the
> original on the first request. Resize the carousel images during the
> migration script above rather than shipping 8 MB originals to R2.

---

## 10. The sweeper

D1 has no scheduled jobs of its own. Deleting a file only queues it in
`pending_r2_deletion`; without a sweeper, the bytes would stay in R2 forever.

**It runs as the `scheduled()` handler in the proxy Worker**, not as a Vercel
Cron route. Three reasons:

1. It needs to delete from R2. Putting it on Vercel means giving the most
   destructive operation in the system a second set of credentials.
2. A `scheduled()` handler has **no public URL to defend**. A Vercel cron route
   is a public endpoint that permanently deletes files, and is safe only if you
   remember the `CRON_SECRET` guard on its first line.
3. It talks to D1 through a binding, with no proxy hop and no 100-statement
   batch ceiling.

The code is in [`teazo-d1-proxy/src/index.ts`](../teazo-d1-proxy/src/index.ts).
It does one job: delete the R2 bytes of files queued more than 24 hours ago,
then mark their rows done.

The schedule is in `wrangler.jsonc`: `"triggers": { "crons": ["0 * * * *"] }`.
Hourly is plenty — the 24-hour grace period is the real limit.

Test it without waiting an hour:

```bash
cd teazo-d1-proxy && npx wrangler dev --test-scheduled
curl "http://127.0.0.1:8787/cdn-cgi/handler/scheduled"
```

Watch it in production with `npx wrangler tail teazo-d1-proxy`.

> **Never compare a `%fZ` timestamp against `datetime('now', …)`.** Every
> timestamp column in `0001_init.sql` is written as
> `strftime('%Y-%m-%dT%H:%M:%fZ','now')` → `2026-09-08T08:05:53.485Z`.
> `datetime('now','-24 hours')` gives `2026-09-07 08:05:53` — a space where the
> `T` is, no fraction, no `Z`. SQLite compares these as **strings**, and `'T'`
> (0x54) sorts above `' '` (0x20), so the comparison is silently wrong for
> same-day rows instead of failing. Build both sides with the same `strftime`.

---

## 11. Deploy order for a schema change

There is one shared database and, during a rollout, two live app versions —
Vercel drains the old deployment while the new one serves. So the rule is about
what the schema must tolerate, not what the new code wants:

> **The schema must be compatible with the outgoing app version and the
> incoming one at the same time.**

| Change | Order |
|---|---|
| New table, index, **nullable** column, or trigger | **migration first, app second** — the old app ignores what it does not know about |
| Drop a column or table, rename, add `NOT NULL`, add a `CHECK` | **app first, migration second** — two separate deploys, because the old app is still writing that column while it drains |

The pipeline always applies migrations **before** it deploys the app, so the
first row is automatic. The second is not: a destructive change has to arrive as
**two pull requests merged separately** — the app change first, the migration once
that is live. Merged together, the pipeline would drop the column while the
outgoing version is still using it.

A **rename** is three phases: add the new column → dual-write and backfill →
switch reads → stop writing the old one → drop it.

Two D1 complications:

- **Tightening a constraint is never a one-step migration.** SQLite's
  `ALTER TABLE` cannot add a `CHECK` or a `FOREIGN KEY`; it needs the 12-step
  table rebuild. That is destructive-class work even though nothing is removed.
- **Migrations are forward-only.** There are no down migrations and
  `wrangler d1 migrations` has no revert command.

> **Never run migrations from the Vercel build.** Vercel builds run on every push
> to every branch, so every preview build of unmerged work would apply its
> branch's migrations to a shared database. Migrations run in the GitHub Actions
> pipeline, gated on merge to `dev` or `main` ([§6](#6-how-deploys-happen)) — and
> nowhere else.

---

## 12. Reviewing a schema change

Migrations arrive as pull requests from anyone on the team, and `CODEOWNERS` routes
every one that touches `teazo-site/migrations/` here. Once it merges, the pipeline
applies it — to preview on `dev`, to production on `main` — within minutes. So the
review **is** the control point. Before approving:

1. **It is a new file, not an edit.** Never approve a change to a migration that
   has already merged. Wrangler tracks applied migrations by full filename and skips
   anything it has already recorded, so an edited file silently does nothing on
   every database that already has it — while a fresh database gets the new
   version. Verified: after editing an applied migration, `wrangler d1 migrations
   apply` reports *"No migrations to apply!"* and the change never runs. The fix for
   a bad migration is always a new one.
2. **Two migrations sharing a number is fine** if the names differ.
   `0003_add_x.sql` and `0003_add_y.sql` both apply, in filename order — also
   verified. Check only that neither depends on the other in a way filename order
   would break.
3. **Classify it** against [§11](#11-deploy-order-for-a-schema-change). Additive
   ships in one pull request. Destructive must arrive as two, with the app change
   already merged and live. A single pull request that both stops using a column and
   drops it goes back.
4. **Types and constraints are what the table is stuck with.** SQLite cannot add a
   `CHECK` or `FOREIGN KEY` afterwards without the 12-step table rebuild.
5. **Think about the rows already in production.** The **Validate** check proves the
   migration applies to a fresh, seeded database — not to production's data. A
   `CREATE UNIQUE INDEX` passes on the seed and fails on a production table that
   already holds duplicates.
6. **Back up before merging anything destructive into `main`**
   ([§15](#15-rollback-and-backups)). The pipeline applies it within minutes of the
   merge, and destructive migrations are not reversible.

After it merges, the team picks it up locally with:

```bash
cd teazo-d1-proxy && npm run db:migrate:local
```

or, for a clean seeded database:

```bash
cd teazo-d1-proxy && rm -rf .wrangler/state && npm run db:migrate:local
```

> **Production: nobody, ever, by hand.** Not `wrangler d1 execute --remote`, not the
> dashboard console. Changes reach production by merging to `main`. If production
> data needs fixing, that is a migration too, so there is a record of it.

---

## 13. Go-live checklist

None of this exists yet — `wrangler.jsonc` still has empty `database_id`
fields and the buckets have never been created. Work top to bottom.

**Billing**

1. Enable R2: Dashboard → Storage & databases → R2 → Overview → complete the
   checkout flow. This adds a card to the account but **costs nothing** — the
   free allowance covers us many times over. No Workers Paid subscription is
   needed; see [§16](#16-running-it-free).

**Cloudflare resources**

2. `npx wrangler d1 create teazo-db` and `… teazo-db-preview`, then paste both
   ids into `teazo-d1-proxy/wrangler.jsonc` (top level and `env.preview` — both
   `database_id` fields are empty today).
3. `npx wrangler r2 bucket create teazo-media` and `… teazo-media-preview`.
4. Attach the custom domain to each bucket ([§8](#8-serving-media-from-the-r2-custom-domain)).
   Leave `r2.dev` disabled.
5. Add the **Cache Everything** rule for `media.teazosf.com`.

**Secrets**

6. Generate two independent proxy tokens and install each on both sides:

   ```bash
   openssl rand -base64 32
   cd teazo-d1-proxy && npx wrangler secret put PROXY_TOKEN
   npx wrangler secret put PROXY_TOKEN --env preview
   ```

   Worker secrets are the one thing the pipeline does not deploy: they live in
   Cloudflare, not the repo, and survive every Worker deploy.

7. Fill in every Vercel variable from [§5](#5-environment-variables), each scoped
   to Production or Preview. The preview `D1_PROXY_URL` points at the preview
   Worker, `teazo-d1-proxy-preview.<sub>.workers.dev`.

**Pipeline**

8. Commit both database ids from step 2 into `teazo-d1-proxy/wrangler.jsonc`, in a
   pull request.
9. Add the five GitHub Actions secrets from [§6.1](#61-setting-the-pipeline-up).
10. In Vercel, set **Root Directory** to `teazo-site`, and confirm the project's
    **production branch** is `main` — the pipeline assumes it.
11. Add `media.teazosf.com` to `app/lib/imageHosts.ts`, in a pull request,
    **before** the first production deploy — every `<Image>` of our own media
    fails without it.
12. Turn on branch protection for `main` ([§6.1](#61-setting-the-pipeline-up)).
13. **Switch the pipeline on** — set `DEPLOYS_ENABLED` and add
    `teazo-site/vercel.json`, together ([§6.1](#61-setting-the-pipeline-up)).

**First deploy**

14. Merge to `dev`. The pipeline migrates `teazo-db-preview` — `0002_seed.sql` is a
    migration, so roles, hours, links and content blocks arrive with the schema —
    and deploys the preview Worker. Follow it in the repository's **Actions** tab.
15. Smoke-test the preview Worker before anything depends on it. The first call
    must fail:

    ```bash
    curl -s -o /dev/null -w '%{http_code}\n' https://teazo-d1-proxy-preview.<sub>.workers.dev/query
    ```

    That must print `405` for a GET, and `401` for a POST without the token.
16. Upload the existing `public/` assets per
    [§9](#9-migrating-existing-assets-into-r2) — to preview now, to production
    after step 17.
17. Merge `dev` into `main`. The pipeline migrates `teazo-db`, deploys the Worker,
    and only then deploys the app to production.
18. Confirm the seed landed — seven hour rows, Monday to Sunday, ending
    `11:00 AM - 8:00 PM`:

    ```bash
    npx wrangler d1 execute teazo-db --remote --command "SELECT day_of_week, display_text FROM business_hours ORDER BY day_of_week;"
    ```

    That is a read, so it is no exception to "nobody touches production by hand".

**Verify** — each failure points at exactly one step above:

| Check | Fails when |
|---|---|
| `/contact` shows the real address and hours | `D1_PROXY_URL` or `PROXY_TOKEN` |
| a gallery image renders | `R2_PUBLIC_BASE`, custom domain, or `imageHosts.ts` |
| `curl -sI https://media.teazosf.com/<key>` twice → `cf-cache-status: HIT` | the Cache Everything rule |
| admin login → upload → image appears | R2 credentials, `/batch` |
| delete an image → a `pending_r2_deletion` row exists | the deletion ordering in DEV-GUIDE.md |
| `wrangler tail` shows the hourly sweep | the `triggers.crons` entry |
| the `main` run in **Actions** shows migrate → Worker → Vercel, in that order | `teazo-site/vercel.json` missing — Vercel deployed on its own and raced the migration |
| open a PR → its preview writes only to `teazo-db-preview` | env var scoping |

19. Last, once all of the above is green: the Square cutover
    ([§14](#14-square-sandbox--production-cutover)). It goes last because re-creating
    curation against production object ids is manual work that is wasted if
    anything before it has to be rebuilt.

---

## 14. Square sandbox → production cutover

`app/lib/square.ts:8` hardcodes `SquareEnvironment.Sandbox`. Read it from
`env.SQUARE_ENV` instead. Then:

1. Set the production Square token as a secret.
2. `INSERT INTO square_sync_state (key, square_env) VALUES ('catalog','production')`
   — `last_synced_at` NULL correctly forces a full initial sync.
3. Run `fullSync` against production. Sandbox rows are untouched: every key
   includes `square_env`.
4. Re-create menu sections and curation against production ids. **This is manual
   work** — sandbox and production share no object ids.
5. Add the production image host to `app/lib/imageHosts.ts`.
6. Flip `SQUARE_ENV`.

Cheapest if curation work starts *after* cutover.

---

## 15. Rollback and backups

| Change | Reversible? | How |
|---|---|---|
| App deploy | **Yes, instantly** | Vercel Instant Rollback, or `vercel rollback` |
| Worker deploy | **Yes** | `wrangler versions list` then `wrangler rollback [id]` |
| Env var change | Yes, but redeploy | running deployments captured the old value |
| Additive migration | Effectively yes | the new column is unused; leave it |
| Destructive migration | **No** | forward-only — write a corrective migration |
| Rows deleted | Only from a backup | below |
| **R2 objects reaped** | **No** | no versioning; the bytes are gone |

**Back up before every destructive migration.** One command:

```bash
cd teazo-d1-proxy && npx wrangler d1 export teazo-db --remote --output ./backup-$(date +%F-%H%M).sql
```

Keep it outside the repo — it contains admin emails and contact-form messages.

Cloudflare **Time Travel** is the other net: on a paid plan D1 restores any
point in the last 30 days.

```bash
npx wrangler d1 time-travel restore teazo-db --timestamp=2026-09-08T12:00:00Z
```

It restores the *whole database*, so it undoes a bad migration well and "one
admin deleted one image" badly.

**Do not hand-edit an applied migration.** Wrangler tracks applied migrations by
name, so editing one means the change never runs where it has already been
applied, and environments silently diverge. Write `0003_fix_whatever.sql`.

**R2 deletion is the genuinely one-way door**, which is why the sweeper waits 24
hours. Within that window a deletion is undone by clearing `deleted_at` on the
media row and its owner and deleting the pending row. After it, the only
recovery is the original file on somebody's laptop.

---

## 16. Running it free

**The entire Cloudflare stack fits in the free tier, and this project is built
to stay there.** Nothing here needs Workers Paid.

| | Free allowance | What we actually use |
|---|---|---|
| Workers requests | 100,000 / day | a few hundred — every D1 read is one request, and public pages are cached |
| Cron triggers | 5 per account | 1 (hourly sweeper) |
| D1 storage | 5 GB total | a few MB |
| D1 rows read | 5,000,000 / day | thousands |
| D1 rows written | 100,000 / day | tens |
| R2 storage | 10 GB-month | ~8 MB after the asset migration |
| R2 Class A (writes) | 1,000,000 / month | a handful of uploads |
| R2 Class B (reads) | 10,000,000 / month | most reads are CDN cache hits and never touch R2 |
| R2 egress | **free at any volume** | this is why R2 is in the stack |

Uploads also pass through the Worker — one request each, a handful a week.
Image views cost Worker requests only if media is served through the Worker
rather than a custom domain ([§8.1](#81-without-a-custom-domain)).

Storage and traffic are not close to any limit — this is a one-location shop
site. What *does* bite on the free plan is a pair of **per-invocation** limits:

| Limit | Free | Workers Paid |
|---|---|---|
| D1 queries per Worker invocation | **50** | 1,000 |
| Subrequests per request | **50** | 1,000 |
| CPU time per invocation | 10 ms | 30 s |

The proxy is sized for those, and the constants are the enforcement:

- **`MAX_STATEMENTS = 40`** — a `/batch` of N statements costs N D1 queries.
  Going over 50 fails partway, and because `batch()` is all-or-nothing you get
  a confusing "nothing happened" rather than a clear limit error.
- **`REAP_LIMIT = 20`** — each reaped row costs two subrequests (one R2 delete,
  one D1 update). 20 rows = 40, plus the SELECT and the session/invitation
  statements = 44. At hourly that drains 480 objects/day, far more than this
  shop will ever delete, and any backlog simply clears over the next few runs.

CPU time is not a concern: the proxy is I/O-bound, and waiting on D1 or R2 does
not count against the 10 ms.

**Two things to know before you count on free:**

1. **R2 requires completing a checkout flow** — a card on the account — even
   though the free allowance costs $0. This is the step that is currently
   blocking us; the API returns error 10042 until it is done.
2. **Exceeding a daily D1 limit stops queries**, it does not bill you. The site
   would break rather than surprise anyone with an invoice. Upgrading to
   Workers Paid lifts the caps "typically within minutes" if it ever happens.

**When you would need to upgrade** — none of these are near:

- sustained traffic past ~100k Worker requests/day
- a genuine need to batch more than ~40 statements atomically
- the database growing past 500 MB (the free per-database ceiling)

**Vercel is the one line item that is not free in principle.** Hobby is $0 and
technically sufficient for this traffic, but its terms restrict it to
non-commercial use, and a shop's live website is commercial. That is a
conversation to have with the client, and it is a Vercel question, not a
Cloudflare one.

> **Keeping it free is a design constraint, not an accident.** If you raise
> `MAX_STATEMENTS` or `REAP_LIMIT`, you have quietly moved the project onto a
> paid plan. Both constants carry a comment saying so.

---

## 17. How much can it actually hold?

Computed from the real code paths, against the free-tier allowances.

**Uploads per day.** The binding limit is D1 rows written (100,000/day) — each
upload writes a `media_asset` row, a `gallery_image` row, and two rows per tag.

| Tags per photo | D1 rows per upload | Uploads per day |
|---|---|---|
| 0 | 2 | 33,333 *(R2 Class A becomes the limit)* |
| 3 | 8 | **12,500** |
| 5 | 12 | 8,333 |
| 10 | 22 | 4,545 |

You would need 12,500 uploads **in a single day** to hit a wall. Karen will
upload a handful a week.

**Image views.** Effectively unlimited, because of the custom domain. A viewer
hitting a cached image never reaches R2 — Cloudflare's edge serves it. Only
cache *misses* count against the 10 M/month Class B budget, and keys are
immutable UUIDs, so the hit rate should be very high.

| CDN hit rate | Image views/month before R2 Class B runs out |
|---|---|
| 0% (Cache Everything rule missing) | 10,000,000 |
| 90% | 100,000,000 |
| 99% | ~1,000,000,000 |

Page views are similarly unbounded: with `revalidate = 300` the gallery page
re-renders at most 288 times a day regardless of traffic, and visitors are served
cached HTML without ever reaching a Worker.

**The one real ceiling: total R2 storage.** Not a daily rate — a cumulative one,
and the only number worth watching.

| Average photo size | Photos that fit in 10 GB |
|---|---|
| 98 KB — a well-compressed webp (the existing menu photos average this) | ~107,000 |
| 300 KB — good-quality webp | ~35,000 |
| 1.6 MB — the existing `carousel_images` JPEGs | ~6,400 |
| 10 MB — our upload cap | ~1,000 |

That 100× spread is the whole story: **photo size decides capacity, and nothing
else does.** `public/carousel_images/` averages 1.6 MB and one file is 7.9 MB —
nearly the entire upload cap in a single image. Straight-from-the-phone uploads
put you in the 6,000-photo range; resized webp puts you past 100,000.

Which is why the upload route resizes — see the upload route in DEV-GUIDE.md.
Do not remove it.

D1 metadata is a non-issue: 100,000 `media_asset` rows is roughly 30 MB against
a 500 MB per-database ceiling.
