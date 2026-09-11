# TEAZO — Data Model (Cloudflare D1 + R2)

Status: proposed, migrations validated locally, not yet deployed.
Runtime: Vercel + a Cloudflare D1 proxy Worker + R2. See §2.
Scope: the database and object-storage layer the team builds against. Application
code, API routes and Square wiring are out of scope here.

---

## 1. What the project actually is today

TEAZO is a Next.js 16 / React 19 app for a single bubble-tea shop at 1050 Taraval St,
San Francisco. Eight routes outside the admin (six public pages, sign-in and an account page),
six admin routes, three Square API routes plus NextAuth's. ~8,200 lines of
TypeScript under `teazo-site/app`.

**There is no persistence of any kind.** No database client, no ORM, no storage SDK,
no `localStorage`. `package.json` dependencies are exactly: `next`, `next-auth`,
`react`, `react-dom`, `pdfjs-dist`, `square`. Every byte the site displays is either a git-tracked
file in `public/` or a TypeScript literal in a component.

| Surface | State | What backs it now |
|---|---|---|
| `/` home | built | inline JSX; carousel is a hardcoded `string[]` |
| `/menu` | built | **787 lines of literals** — 71 items via a `createMenuItem` factory |
| `/gallery` | built | 9 mock records that all point at `/TEAZO_logo.png` |
| `/contact` | built | `contact-content.ts` — real address, phone, hours |
| `/delivery` | built | 3 hardcoded marketplace deeplinks |
| `/static-menu` | built | serves `public/teazo-menu.pdf` |
| `/login` | partial | **Google sign-in works** (NextAuth). The email/password form above it has no `onSubmit` — it is still decoration |
| `/account` | built | shows the signed-in name and email; redirects to `/login` otherwise |
| `/admin` | **stub** | `<h1>Hello World</h1>` |
| `/admin/menu` | partial | really fetches Square; every mutation is `console.log` |
| `/admin/gallery` | built UI | fully client-side, uploads die on refresh (`URL.createObjectURL`) |
| `/admin/events` | built UI | events admin on sample data (#49) |
| `/admin/settings` | built UI | admins table on sample data (#47) |
| `/admin/website-content` | **stub** | `<h1>Hello World</h1>` |

The Square integration is real but read-mostly and **pinned to Sandbox**
(`app/lib/square.ts:8`), and no public page consumes it — `grep "fetch("` across
`app/(site)/` returns zero hits.

---

## 2. The runtime, and the one thing still broken

### The architecture — decided

**Hosting is Vercel. The database is Cloudflare D1. Object storage is Cloudflare R2.**

Those are compatible, but not directly: D1 is exposed as a runtime **binding**, and a
Vercel function has no bindings. Cloudflare's own documentation is explicit about the
answer — *"To access a D1 database outside of a Worker project, you need to create an
API using a Worker"* — and equally explicit that the D1 REST API is not a substitute,
being *"best suited for administrative use as the global Cloudflare API rate limit
applies."*

So the data path is:

```
Vercel (Next.js) --HTTPS + bearer--> teazo-d1-proxy (Worker) --binding--> D1
Vercel (Next.js) --HTTPS + bearer--> teazo-d1-proxy (Worker) --binding--> R2  (uploads)
browser          --CDN-cached-----> media.<domain>  (reads, never touches Vercel)
```

Files go through the same Worker, which holds the R2 binding. So the app needs one
credential, and local development gets a simulated bucket as well as a simulated
database. Public reads go to a custom domain with Cloudflare's CDN in front — or
through the Worker itself where there is no custom domain.

**None of this changes the schema.** Every table, index, trigger and CHECK below is
plain SQLite and is unaffected by where the app runs. What it changes is the wiring,
and that is documented in [`DEV-GUIDE.md` §2](./DEV-GUIDE.md#2-set-up-your-machine)
(for building) and [`OPERATIONS.md`](./OPERATIONS.md) (for deploying).

The cost to be aware of: every database read crosses a network hop. Batch reads, and
cache public pages with `revalidate`.

### Still broken — `/admin` is publicly reachable right now

There is no `proxy.ts` (Next.js 16's name for what used to be `middleware.ts`)
anywhere in the repo, and `app/admin/layout.tsx` is pure
presentation with no guard. Anyone who knows the URL can open the admin portal.

Worse, `POST /api/square/products` and `PUT|DELETE /api/square/products/[id]` are
unauthenticated route handlers that **write to the live Square catalog**. That is a
production-catalog write endpoint open to the internet, currently pointed at Sandbox.

This is a live hole today, independent of the database work. The `admin_user`
table below is the storage half of the fix; a `proxy.ts` redirect and a per-route
role check against it are the other half.

---

## 3. The Square boundary — the rule that keeps the site and the register agreeing

Square's Catalog API **authoritatively owns** far more than the current code reads:

- item name, description, variations, prices, currency
- categories, and the **`ordinal`** on each category membership — Square owns display order
- modifier lists, their `selectionType`, and `min/maxSelectedModifiers`
- item images (`imageIds[]`)
- sold-out state (`ItemVariationLocationOverrides.soldOut` + the Inventory API)
- online visibility and availability periods
- store address, phone, timezone and business hours (the **Locations** API)

The current code reads a narrow projection of this and throws the rest away —
`app/api/square/products/route.ts:63-65` maps categories to `{id, name}` and discards
`ordinal`; `square-helpers.ts:48-63` drops `selectionType` and min/max.

> **Rule: D1 never stores a field Square owns as an editable value.**
> Cache it (with `square_version` so staleness is detectable), or read it live.
> Anything an admin can edit in D1 that Square also owns *will* drift, and the
> website will contradict the register in front of a customer.

**D1 legitimately owns** what Square genuinely cannot express for this site:

- the synthetic **"TEAZO Special"** grouping — a curated block with no Square CATEGORY
- section **subtitles** ("Think cottony clouds of heaven that melt in your mouth")
- everything non-catalog: gallery, events, site copy, admin identity, inquiries

**Product photos are served straight from Square** — decided with the team. D1
caches Square's image URL as a pointer and R2 never holds a copy. R2 is for what
Square can't hold: the gallery, the home carousel, event flyers and the PDF menu.

### Three landmines in the current code

1. **`variations[0]` truncation.** `PUT /api/square/products/[id]:90-104` rewrites
   `itemData.variations` to a **single-element array** named `"Regular"`. For a boba
   shop, sizes / ice / sugar are exactly what Square models as multiple variations and
   `CatalogItemOption`. Every admin edit silently deletes all but the first. **Fix this
   route before caching variations** — otherwise the cache faithfully mirrors data
   corruption.

2. **Sandbox → production is a keyspace change.** Sandbox and production are separate
   merchant accounts sharing no object ids. Every curation row keyed on a Square id
   dies at cutover. Hence `square_env` in the primary key of every Square-keyed table.

3. **The BigInt patch is on the money path.** `app/lib/square.ts:12-21` monkey-patches
   `BigInt.prototype.toJSON` at module scope to return `Number(this)`. It is lossy, it
   is a global side effect of an import, and every price in the system passes through
   it. Convert `bigint` explicitly at the Square boundary instead.

---

## 4. Schema

25 tables, 26 indexes, 6 triggers. `migrations/0001_init.sql` and `0002_seed.sql`.
Validated against SQLite 3.45 and through wrangler's own migration runner:
the DDL applies clean and its constraint checks pass.

**For how to build against it, see [`DEV-GUIDE.md`](./DEV-GUIDE.md).
For how to deploy it, see [`OPERATIONS.md`](./OPERATIONS.md).**

### Conventions

| Concern | Choice | Why |
|---|---|---|
| ids | `TEXT` via `hex(randomblob(16))` | D1 has no UUID type; the gallery admin already mints `crypto.randomUUID()` client-side |
| PKs | every `TEXT` PK is explicitly `NOT NULL` | in SQLite **only `INTEGER PRIMARY KEY` implies NOT NULL** — a bare `id TEXT PRIMARY KEY` accepts NULL, and a helper returning `undefined` then writes a row nothing can ever look up |
| booleans | `INTEGER 0/1` + `CHECK` | SQLite has no BOOLEAN |
| enums | `TEXT` + `CHECK` | no ENUM, and **SQLite cannot add a CHECK later** without a full table rebuild — so they are declared now |
| timestamps | ISO-8601 `TEXT`, UTC | sorts lexicographically, no timezone ambiguity |
| soft delete | `deleted_at` + **partial** uniques | a plain unique makes "delete then re-add" fail |
| JSON columns | `TEXT` + `json_valid()` CHECK | no JSONB |

### 4.1 Identity & access — 2 tables

`role`, `admin_user`

Sign-in is NextAuth with Google (`teazo-site/auth.ts`). With no database adapter,
NextAuth keeps sessions in a signed cookie — confirmed in the installed package:
`strategy: config.adapter ? "database" : "jwt"`. So the database's job is narrow:
**who is an admin, and what may they do.** `admin_user` is matched to the signed-in
Google account by `email_normalized`.

Roles are `1=Owner, 2=Can Edit, 3=Can View` — the exact `ADMIN_ROLE_LABELS` in
`teazo-site/app/types/admin-perms.ts`. `admin_user.username` and `can_invite_users`
mirror the Settings admins table.

- `UNIQUE(email_normalized) WHERE deleted_at IS NULL` — normalization is an explicit
  column because SQLite's `NOCASE` folds ASCII only.
- `UNIQUE(role_id) WHERE role_id = 1` — at most one Owner. *At least* one is not
  expressible in SQLite; the delete/demote handler has to refuse it.
- `can_invite_users` may only be 1 for role 2, matching the Settings UI.
- Adding an admin inserts a row with `status = 'invited'`. There are no invitation
  tokens: signing in with that Google address is the invitation.

**Deliberately absent:** sessions, OAuth account links and invitation tokens.
NextAuth owns sign-in; copying its state into D1 would only drift.

> **Security gap in `auth.ts`, for its owner:** it accepts **any** Google account.
> Nothing grants that account anything today, but a check that only asks "is
> someone signed in?" would let every Google user in. The role check has to
> consult `admin_user`.

### 4.2 Media — 2 tables + a guard trigger

`media_asset`, `pending_r2_deletion`

D1 holds metadata, R2 holds bytes. `mime_type` is restricted to the three types the
upload form already accepts (`gallery-upload-form.tsx:27`) plus PDF.

There is **no refcount column** — a hand-maintained counter across seven referencing
tables drifts the first time a write path forgets to decrement, and then the cleanup
job either deletes live objects or leaks dead ones.

Instead, protection is a **trigger**, not the foreign keys. Media is *soft*-deleted,
so `ON DELETE RESTRICT` never fires on a normal retirement —
`trg_media_soft_delete_guard` refuses to set `deleted_at` while any of the seven
referencing tables still points at the row. The delete handler should still run an
explicit usage query first so it can return a helpful 409 naming the holder instead
of surfacing a raw constraint error.

`pending_r2_deletion` is the queue a cron Worker drains. Deleting bytes is decoupled
from deleting rows on purpose — R2 deletes are not transactional with D1.

### 4.3 Gallery — 3 tables

`gallery_image`, `gallery_tag`, `gallery_image_tag`

- **`name_sort_key`** exists because the admin sorts with `localeCompare`, D1 ships only
  BINARY/NOCASE/RTRIM, and the content is bilingual (`厚烧蛋糕波波奶茶`). Compute the key
  with `Intl.Collator` in the Worker at write time and sort on that, or the order
  visibly changes when this moves to SQL.
- **`gallery_tag.name_normalized` is UNIQUE.** Today `normalizeTag` trims and collapses
  whitespace but does not lowercase, and duplicate-checks only within one image — so
  "Matcha" and "matcha" become two sidebar entries. The unique index is the fix.
- Search is a case-insensitive substring over name **and** tags — `LIKE '%q%'`, which no
  B-tree serves. At this size a scan is fine; if it grows, D1 supports FTS5.
- The public `GalleryImage {id,url,alt,caption}` and admin `AdminGalleryImage
  {id,name,url,tags,createdAt}` types are reconciled into one table. `alt` and `caption`
  are **not collected by the upload form today** — the form's value type is exactly
  `{name, tags, file}`. Either add the inputs or accept the columns start null.

### 4.4 Site content — 7 tables

`business_profile`, `business_hours`, `hours_exception`, `site_link`,
`content_block`, `carousel_slide`, `menu_document`

This is what replaces `contact-content.ts` and the inline JSX literals. It is the
highest-value slice for the client: it is what lets Karen change hours without a deploy.

- `business_profile` is a singleton (`CHECK (id = 1)`) with `synced_from_square_at`,
  because **Square's Locations API also owns address, phone and hours**. Decide the
  direction of sync deliberately: if the owner changes hours in the Square dashboard —
  which is where POS behavior lives — the website must not silently keep the old ones.
- `hours_exception` handles holiday closures. `business_hours` alone cannot express
  "closed for Lunar New Year", which is the most common hours edit a shop owner makes.
- `site_link` is **one** table for social + delivery. The drafts wanted four tables for
  what is, in total, eight URLs that change roughly never.
- `menu_document` versions the static-menu PDF with `UNIQUE(is_current) WHERE
  is_current = 1`, so replacing it is an insert rather than a destructive overwrite of
  a live URL.

### 4.5 Square catalog — 7 tables

`square_sync_state`, `catalog_item_cache`, `catalog_variation_cache`,
`catalog_category_cache`, `menu_section`, `menu_section_item`, `menu_item_display`

- **Prices live in `catalog_variation_cache`, not on the item.** A boba shop's
  Regular/Large *is* a Square `ITEM_VARIATION`. One row per item would collapse every
  size pair to whichever the sync wrote last and show one wrong price. This is the same
  truncation as landmine 1 below, and the reason that bug must be fixed before syncing.
- `catalog_category_cache` exists so "render only sections joined to a live catalog
  row" has something to join to when a category is deleted in Square.
- `catalog_item_cache` carries **`square_version`** — Square's optimistic-concurrency
  token, which the PUT handler already reads and echoes. Without it there is no way to
  tell whether a cached price is current, and a stale price on the public menu is a
  customer-facing error.
- `menu_section.square_category_id` is **nullable** — that is what makes the "TEAZO
  Special" block representable. Modelling `square_category_id` as the primary key (as
  two drafts did) cannot express the most prominent section on the menu page.
- `menu_item_display` holds presentation only: badge, featured,
  hide-on-website, allergen note. **No price, no name, no availability, no modifiers.**
- Every one of these is keyed on `square_env`, **including `square_sync_state`** — its
  PK is `(key, square_env)` so both environments hold independent watermarks and a
  cutover does not destroy the sandbox cursor.
- `menu_section_item` carries a composite FK pinning its `square_env` to its section's,
  and another into `catalog_item_cache`, so a membership row can neither cross
  environments nor point at an item that was never synced.
- `menu_section_item.square_ordinal` mirrors Square's per-category ordinal and *seeds*
  the D1-owned `position` on first sync. Square's ordinal cannot be the ongoing
  authority, because "TEAZO Special" has no Square category and therefore no ordinal.

**Orphan policy.** SQLite cannot foreign-key into Square. When a catalog object is
deleted, curation rows point at a dead id and the menu renders gaps. `DELETE
/api/square/products/[id]` returns `deletedObjectIds` and currently **consumes it
nowhere**. Required: on delete, mark `catalog_item_cache.is_deleted = 1`; render only
sections joined to a live cache row; sweep `menu_section_item` on reconciliation.
Note that a re-created item gets a **fresh Square id**, so its curation state is lost —
that is inherent, and worth telling the client.

**Sync mechanism.** Square emits exactly one catalog webhook, `catalog.version.updated`,
and its payload carries only the merchant's new catalog version — **it does not say
which objects changed**. So there is no object-level delta to key on. The correct design
is `square_sync_state.last_catalog_version` driving a delta scan via
`SearchCatalogObjects` with `beginTime` and `includeDeletedObjects`.

D1 caps a query at roughly 100 bound parameters and ~100 KB of SQL, so a full sync of
71 items cannot be one statement — chunk it and use `db.batch()`, which is D1's only
transaction primitive.

### 4.6 Events & inquiries — 4 tables

`event`, `event_item`, `event_category`, `contact_message`

`event` follows the events admin (`teazo-site/app/types/admin-event.ts`): a name,
description, image, start and end, and either the whole menu (`applies_to_all`) or
chosen Square items and categories, held in `event_item` and `event_category`.
Status — upcoming, active, ended — is worked out from the dates, not stored.

The item and category links are **not** foreign-keyed to the Square cache, on
purpose: an event can be saved before the catalog sync has ever run. Showing an
event should skip ids the cache no longer has.

`contact_message` has six columns matching the five inputs the form actually collects.
The contact form currently posts to a `mailto:` with `encType="text/plain"`, which most
browsers drop silently — **every inquiry submitted so far has been lost.** This is the
cheapest real win in the whole schema.

Deliberately **not** included: `phone`, `inquiry_type`, `spam_score`, `handled_by`,
`ip`. There is no inbox screen to triage anything, and a raw visitor IP in a student
project is a liability with no consumer. Add triage columns when someone builds the
inbox.

---

## 5. Object storage (R2)

### Buckets

| Bucket | Purpose |
|---|---|
| `teazo-media` | production user-uploaded content |
| `teazo-media-preview` | preview/dev |

### Key layout

```
gallery/{yyyy}/{mm}/{uuid}.{ext}      gallery photographs
carousel/{uuid}.{ext}                 home-page carousel slides
events/{event_id}/{uuid}.{ext}        event flyers
documents/menu/{uuid}.pdf             versioned static menu PDF
branding/{uuid}.{ext}                 owner-replaceable logos
```

UUID keys, not content-addressed hashes: dedupe by checksum is a feature nothing asks
for, and it makes "delete then re-upload the same file" fail on a unique index.

### What moves and what stays

`public/` is 18.6 MB across 106 files. The split is by **who owns the file**, not by type:

| Stays in the repo (build-time assets) | Moves to R2 (owner-editable content) |
|---|---|
| `admin_icons/` (14 files) | `carousel_images/` — 5 files, 8.4 MB |
| `social_icons/` (4) | `promotions/` — 1 file |
| `pdfjs/` (2, vendored lib) | `teazo-menu.pdf` |
| logos, `pink_scribble.png` | |

`menu_items/` — the 65 product photos — moves to neither. Product photos come from
Square, so those files are retired once the menu reads from Square.

Roughly **8.7 MB migrates**; the rest is code, not content.

### Derivatives

None. `next/image` already generates renditions on demand and that is how every
`<Image>` in the app works today. There is no `sharp`, no image pipeline, and no
measured page-weight problem. Add a variant table when there is evidence, not before.

### Serving

Serve through a Worker route or a bound custom domain, not public bucket URLs — that
keeps `next.config.ts` `remotePatterns` to one hostname. Note `app/lib/imageHosts.ts`
currently allowlists only the **sandbox** Square S3 bucket, which will need the
production host at cutover.

---

## 6. Build order

Sequenced by what is broken now, not by what is architecturally tidy.

| # | Slice | Fixes |
|---|---|---|
| 1 | `media_asset` + gallery + R2 | uploads that vanish on refresh |
| 2 | `admin_user` role check + **`proxy.ts`** | `/admin` and the Square write routes are open to the internet |
| 3 | `contact_message` | the mailto form that silently loses every inquiry |
| 4 | `business_profile` + hours + `site_link` + `content_block` | Karen can edit the site without a deploy |
| 5 | `catalog_item_cache` + `menu_section` + `menu_item_display` | replaces the 787-line mock menu |
| 6 | `event` + `event_item` + `event_category` | `/admin/events` reads `sample-events.txt`; every edit is lost |

Slices 1–3 are each roughly a sprint of one developer's time and each closes a real
defect. Slice 5 is the largest and depends on fixing the `variations[0]` truncation
first.

### Deliberately cut

Proposed by the analysis, cut for lack of evidence in the repo. Each names what would
earn it back.

| Cut | Earn it back with |
|---|---|
| `audit_log` with before/after JSON | an activity-log screen, or >5 admins |
| `content_block_revision` | a "restore previous version" control |
| analytics event + daily rollup tables | the Dashboard is `<h1>Hello World</h1>`; per-pageview INSERTs are a D1 anti-pattern — use Workers Analytics Engine |
| `web_order` / `payment_ref` | there is no cart, no checkout, no Payments SDK; ordering is delegated to three marketplaces |
| `addon_group` / `addon_option` | justified only by two unreferenced PNG icons; these are Square's ModifierList/Modifier and belong there |
| image variant tables, `refcount`, `checksum` | a measured page-weight problem `next/image` can't solve |
| `navigation_item`, `page_metadata` | nav is 5 labels in a container locked to `grid-cols-5`; a DB-driven nav breaks on the 6th item |

The union of everything the analysis proposed was ~68 tables — larger than the
remaining semester for seven developers. This is 25.

---

## 7. Open questions for the team

1. **Hours: who wins?** Square Locations, or D1? Both can hold them. Pick one direction
   and make the other a mirror.
2. **When is the Square production cutover?** Every curation row created before it is
   keyed to sandbox ids and will need re-mapping. Cheapest if curation starts *after*.
3. **Alt text and captions** — add the inputs to the upload form, or accept nulls?
