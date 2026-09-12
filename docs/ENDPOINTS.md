# TEAZO Endpoint Reference

Every endpoint the data layer exposes. The database is Cloudflare D1 and file
storage is Cloudflare R2, both reached through one small Worker. This covers
what each endpoint accepts, what it returns, and the limits that apply.

---

## Contents

1. [How a request flows](#1-how-a-request-flows)
2. [The endpoints](#2-the-endpoints)
3. [Limits](#3-limits)
4. [Error reference](#4-error-reference)
5. [Reaching the Worker from app code](#5-reaching-the-worker-from-app-code)

---

## 1. How a request flows

```
Next.js on Vercel ──HTTPS + bearer token──▶ proxy Worker ──▶ D1   the database
                                                  └────────▶ R2   file storage

browser ─────────────────────────────────────────────────▶ proxy Worker
                                                            /media/<key>
```

The app holds no Cloudflare bindings, so it never reaches D1 or R2 directly.
Every query and every file goes through one Worker, `teazo-d1-proxy`, which is
the only component that binds them.

Image reads are the exception to that shape. A browser fetches those from the
Worker directly, because the images are public and the responses are cached for
a year.

---

## 2. The endpoints

| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/query` | bearer token | Run one SQL statement |
| POST | `/batch` | bearer token | Run up to 40 statements as one transaction |
| GET, HEAD | `/media/<key>` | **public** | Read a stored file |
| PUT | `/media/<key>` | bearer token | Store a file |
| DELETE | `/media/<key>` | bearer token | Remove a file |
| cron | no URL | not reachable | Hourly, deletes files queued more than 24 hours ago |

Two database endpoints, three media endpoints, and one scheduled job that has no
URL at all.

**Base URL.** In development the Worker runs on your own machine at
`http://127.0.0.1:8787`. In production it is a `workers.dev` URL, supplied to
the app as `D1_PROXY_URL`.

**Authentication.** Every endpoint except image reads requires a bearer token:

```
Authorization: Bearer <PROXY_TOKEN>
```

The token is compared in constant time. A missing or wrong token returns 401.
Production and preview use different token values, so a preview deployment
cannot reach production data.

### POST /query

Runs one SQL statement and returns D1's result.

Request:

```json
{
  "sql": "SELECT day_of_week, display_text FROM business_hours WHERE day_of_week = ?1",
  "params": [0]
}
```

Response, 200:

```json
{
  "results": [{ "day_of_week": 0, "display_text": "11:00 AM - 8:00 PM" }],
  "success": true,
  "meta": { "changes": 0, "rows_read": 1, "rows_written": 0 }
}
```

`meta` is trimmed above for readability. D1 returns about a dozen fields on it,
including `duration`, `last_row_id`, `changed_db` and `served_by_region`.

Parameters are positional, `?1`, `?2` and so on, and are bound in order from
`params`. D1 rejects a string containing more than one statement, so one request
is always exactly one statement.

`sql` is required. `params` may be omitted when the statement has no
placeholders.

### POST /batch

Runs many statements as a single all or nothing transaction. Either every
statement commits or none does.

Request:

```json
{
  "statements": [
    { "sql": "UPDATE gallery_image SET deleted_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?1", "params": ["img_1"] },
    { "sql": "INSERT INTO pending_r2_deletion (r2_bucket, r2_key) VALUES (?1, ?2)", "params": ["teazo-media", "gallery/2026/09/x.webp"] }
  ]
}
```

Response, 200:

```json
{ "results": [ { "success": true, "meta": {} }, { "success": true, "meta": {} } ] }
```

This is the only transaction the system has. Writes that must succeed or fail
together have to travel in one `/batch` request. Two separate calls are two
separate transactions.

At most 40 statements per request. More returns 400 `too_many_statements`.

### GET `/media/<key>`

Reads a stored file. Public, no token.

```
GET /media/gallery/2026/09/6f1c2a80.webp
```

Returns the bytes with the stored content type, an `ETag`, and
`Cache-Control: public, max-age=31536000, immutable`. Keys are UUID based and
never reused, so a cached copy can never go stale.

`HEAD` works the same way and returns headers only. A missing key returns 404.

### PUT `/media/<key>`

Stores a file. Token required. The body is the raw bytes, and `Content-Type`
must be set.

```
PUT /media/gallery/2026/09/6f1c2a80.webp
Authorization: Bearer <PROXY_TOKEN>
Content-Type: image/webp
```

Response, 201:

```json
{ "key": "gallery/2026/09/6f1c2a80.webp", "size": 17401, "bucket": "teazo-media" }
```

The bucket name comes back so the caller can record `media_asset.r2_bucket`
from one source of truth rather than a second environment variable.

`Content-Length` is required. A request without it returns 411, because the size
check cannot run otherwise.

Accepted content types: `image/jpeg`, `image/png`, `image/webp`,
`application/pdf`. Anything else returns 415.

Keys must match `^[a-z0-9][a-z0-9/_.-]{0,511}$` and may not contain `..` or
`//`. The prefixes in use are `gallery/`, `carousel/`, `events/`,
`documents/menu/` and `branding/`.

### DELETE `/media/<key>`

Removes a stored file. Token required. Returns 204 with no body, and is
idempotent, so deleting a key that is not there still returns 204.

Application code does not normally call this. Deleting a file is done by marking
the rows deleted and inserting a row into `pending_r2_deletion`, which lets the
scheduled job remove the bytes 24 hours later. That delay is the only undo
window the system has.

### The scheduled job

The Worker also runs an hourly cron handler. It has no URL and cannot be
triggered over HTTP. It deletes the R2 bytes of files queued for deletion more
than 24 hours earlier, then marks those rows done, and reports anything queued
against a different bucket rather than acting on it.

---

## 3. Limits

| Limit | Value | Applies to |
|---|---|---|
| Statements per batch | 40 | `/batch` |
| Request body | 1 MB | `/query`, `/batch` |
| Upload size | 10 MB | `PUT /media` |
| `Content-Length` | required | `/query`, `/batch`, `PUT /media` |
| Upload types | jpeg, png, webp, pdf | `PUT /media` |
| Key length | 512 characters | all `/media` routes |

Two limits come from outside the Worker and are worth knowing. Vercel rejects
request bodies over 4.5 MB before a route runs, so large images are resized in
the browser before upload. And on Cloudflare's free plan a single Worker
invocation may issue at most 50 D1 queries and 50 subrequests, which is why the
batch ceiling is 40 rather than higher.

---

## 4. Error reference

Every error is JSON in the shape `{ "error": "<code>" }`, sometimes with an
extra field.

| Status | Code | Meaning |
|---|---|---|
| 400 | `bad_json` | Body was not valid JSON |
| 400 | `bad_key` | Media key failed validation |
| 400 | `empty_body` | `PUT /media` with no body |
| 400 | `statements_required` | `/batch` with a missing or empty array |
| 400 | `too_many_statements` | More than 40 statements. Includes `max` |
| 400 | `d1_error` | The database rejected the statement. Includes `message` |
| 401 | `unauthorized` | Missing or wrong bearer token |
| 404 | plain text | Media key not found |
| 404 | `not_found` | POST to a path other than `/query` or `/batch` |
| 405 | `method_not_allowed` | Wrong method for that path |
| 411 | `length_required` | No `Content-Length` header |
| 413 | `payload_too_large` | Over the size limit. Includes `max` |
| 415 | `unsupported_type` | Upload content type not accepted |
| 500 | `proxy_misconfigured` | The Worker has no token configured |

`d1_error` passes the database's own message through, so constraint failures
stay readable. For example, retiring a file that something still points at
returns `media_asset is still referenced`, which is the signal to answer the
caller with 409 rather than 500.

---

## 5. Reaching the Worker from app code

The app does not call the Worker with `fetch` at each call site. Two helpers
wrap it, and they are what feature code uses.

```ts
import { prepare, batch } from "@/app/lib/d1";

const { results } = await prepare(
  "SELECT day_of_week, display_text FROM business_hours ORDER BY day_of_week"
).all<{ day_of_week: number; display_text: string }>();

const profile = await prepare("SELECT * FROM business_profile WHERE id = ?1").bind(1).first();
```

`prepare(sql).bind(...).all()` maps onto `POST /query`. `batch([...])` maps onto
`POST /batch`. For files, `putMedia()` in `app/lib/media.ts` maps onto
`PUT /media/<key>`, and `toPublicUrl(key)` builds a read URL from
`R2_PUBLIC_BASE`.

These helpers run in server components, route handlers and server actions.
`PROXY_TOKEN` is a server side environment variable and is never prefixed with
`NEXT_PUBLIC_`, because the token carries full access to the database.

The three environment variables involved:

| Variable | Value in development |
|---|---|
| `D1_PROXY_URL` | `http://127.0.0.1:8787` |
| `PROXY_TOKEN` | any string, matching `.dev.vars` in the Worker |
| `R2_PUBLIC_BASE` | `http://127.0.0.1:8787/media` |

Setup instructions are in the Developer Guide.
