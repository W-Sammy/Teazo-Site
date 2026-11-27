# TEAZO Automated Testing Guide

This document explains how to run, maintain, extend, and troubleshoot automated tests for the TEAZO website.

It is intended for developers and administrators responsible for maintaining the website after its initial development.

The automated test suites help verify application behavior, detect regressions, and reduce the risk of introducing defects when changing the website. Vitest exercises unit, component, API, and database behavior; Playwright tests selected workflows in a real Chromium browser. Neither replaces manual verification of production services.

For general development setup, including the Next.js application, Cloudflare Worker, local database, authentication, and environment variables, see the [Developer Guide](DEV-GUIDE.md).

## Table of Contents

1. [Requirements and initial setup](#1-requirements-and-initial-setup)
2. [Testing frameworks and configuration](#2-testing-frameworks-and-configuration)
3. [Running automated tests](#3-running-automated-tests)
4. [Test coverage areas](#4-test-coverage-areas)
5. [Writing and maintaining tests](#5-writing-and-maintaining-tests)
6. [Mocking and test isolation](#6-mocking-and-test-isolation)
7. [Database test fixtures](#7-database-test-fixtures)
8. [Branch dependencies and application changes](#8-branch-dependencies-and-application-changes)
9. [Verification before merging or releasing changes](#9-verification-before-merging-or-releasing-changes)
10. [Troubleshooting](#10-troubleshooting)
11. [Coverage limitations](#11-coverage-limitations)
12. [Maintaining the testing system](#12-maintaining-the-testing-system)

## 1. Requirements and initial setup

### Prerequisites

- Node.js **22.13 or newer**.
- npm.
- Git.
- A local checkout of the TEAZO repository.

Commands in this guide assume the repository has the following structure:

```text
Teazo-Site/
├── docs/
│   ├── AUTOMATED-TESTING.md
│   └── DEV-GUIDE.md
├── teazo-site/
│   ├── app/
│   ├── e2e/
│   ├── migrations/
│   ├── test/
│   ├── playwright.config.ts
│   ├── package.json
│   ├── package-lock.json
│   └── vitest.config.mts
└── teazo-d1-proxy/
```

Run application testing commands from the `teazo-site/` directory.

### Install dependencies

From the repository root:

```bash
cd teazo-site
npm ci
```

`npm ci` installs dependencies from the committed `package-lock.json` and is recommended for reproducible test environments.

If the application is already installed and the dependencies have not changed, reinstalling may not be necessary.

Windows developers can use Git Bash or PowerShell for the testing commands shown here. The general Developer Guide recommends Git Bash for the broader local development environment.

### Install the Playwright browser

After `npm ci`, install the Chromium browser used by the Playwright configuration:

```bash
npx playwright install chromium
```

`@playwright/test` is a development dependency in `teazo-site/package.json`. Browser binaries are installed separately from npm packages. Do not add an unrelated `npm audit fix` or dependency upgrade while making a focused testing change.

### Running tests does not normally require production services

Most **Vitest** tests use mocks or in-memory databases. They generally do not require:

- A running Next.js development server.
- A running Cloudflare Worker.
- A Cloudflare D1 or R2 connection.
- Live Square credentials.
- Live email delivery.
- A production database.

Playwright browser tests require a local Next.js server. The Playwright configuration can start it automatically at `http://localhost:3000` if one is not already running. Protected Owner account-management tests additionally need a valid local Owner session, and the local D1 proxy may need to be running for authentication and protected pages to work. Admin Delivery browser tests also require a saved local administrator session. Public Delivery browser tests read the currently configured local delivery links, so at least one complete, enabled platform must exist in local website content; the local D1 proxy may be needed to serve that content.

Some separate manual and integration verification procedures also require these services or their sandbox equivalents.

Never use production credentials or customer data simply to make automated tests run.

## 2. Testing frameworks and configuration

TEAZO uses the following testing tools.

| Tool | Purpose |
|---|---|
| Vitest | Test runner, assertions, mocks, lifecycle hooks |
| Playwright (`@playwright/test`) | Chromium browser tests for authentication, administrator management, public cart/checkout, Delivery, Admin Delivery, and Static Menu workflows |
| React Testing Library | Testing React components and user interactions |
| jsdom | Simulated browser DOM for React component tests |
| Node.js | Default test execution environment |
| `node:sqlite` | In-memory SQLite for database and migration tests |
| ESLint | Static analysis of test and application code |
| TypeScript | Type checking |
| Next.js production build | Verification that the application compiles for deployment |

### Vitest configuration

The configuration is in:

`teazo-site/vitest.config.mts`

Vitest discovers files matching:

```text
app/**/*.test.ts
app/**/*.test.tsx
```

The equivalent combined pattern is:

```text
app/**/*.test.{ts,tsx}
```

Tests are normally stored alongside the application code they verify.

For example:

```text
app/lib/checkout-validators.ts
app/lib/checkout-validators.test.ts
```

The configuration also supports the `@/` TypeScript import alias.

Because Next.js server modules can contain `server-only` imports, the testing configuration substitutes `test/server-only.ts` when those modules are imported by Vitest.

### Node and browser-like test environments

The default test environment is Node.js.

React components that require DOM APIs use jsdom. These test files declare:

```typescript
// @vitest-environment jsdom
```

This declaration must appear near the beginning of the relevant test file.

A jsdom test can verify rendered elements and simulated interactions, but it does not reproduce every feature of Chrome, Safari, Firefox, or mobile browsers.

### Playwright configuration

The browser-testing configuration is in:

`teazo-site/playwright.config.ts`

Playwright discovers `e2e/**/*.spec.ts` separately from Vitest, using:

- Base URL: `http://localhost:3000` (use `localhost`, not `127.0.0.1`, for the established local login workflow).
- Browser project: `chromium` using Playwright's Desktop Chrome device settings. Individual tests may set a mobile viewport.
- Parallel execution: two workers; CI retries are configured separately from local runs.
- Development server: start `npm run dev -- --hostname localhost --port 3000` when needed, or reuse an existing local server outside CI.
- Failure artifacts: screenshots and traces are written below `.next/playwright-test-results`, an ignored build directory.

The browser suite covers administrator authentication and account management, public cart and checkout interactions, public Delivery, Admin Delivery, and Static Menu behavior. It does not automate real Google sign-in, production administrator changes, or actual Square payments. The new Delivery and Static Menu specs optionally read `TEAZO_E2E_BASE_URL`; the Static Menu spec also accepts `TEAZO_E2E_STATIC_MENU_PATH` (default `/static-menu`). These overrides are spec-specific, not changes to the shared Playwright server configuration.

## 3. Running automated tests

All commands in this section are run from `teazo-site/`.

### Run the complete Vitest suite

```bash
npm test
```

The `test` script invokes `vitest run`, which runs the discovered Vitest files once and exits. It does not run Playwright specs.

### Recommended command for large regression runs

```bash
npm test -- --maxWorkers=2 --reporter=dot
```

Vitest runs test files in parallel by default. However, running the complete TEAZO test suite with unrestricted worker concurrency has previously caused intermittent timeouts, particularly in the Square SDK tests.

For more reliable full-suite verification, use `--maxWorkers=2` to limit execution to two concurrent workers. The `--reporter=dot` option displays compact test output without affecting test execution.

If any tests still fail when running with `--maxWorkers=2`, run the affected test file individually to determine whether the failure is reproducible:

```bash
# Example: rerun a failing test file individually.
npx vitest run app/lib/square.test.ts
```

If the test passes individually but fails during the full suite, investigate possible worker contention, shared state, timing issues, or incomplete test cleanup. Rerun the full suite after investigating to confirm that all tests pass together.

If the test also fails individually, inspect its assertions, mocks, dependencies, and error messages to identify the underlying issue.

**Do not assume that an individually passing test resolves a full-suite failure.** A successful full-suite run is still required before considering the test suite verified.

### Understanding test results

After running the test command, Vitest displays the results in the terminal. When using the dot reporter, individual tests are represented by dots, followed by a summary of the run.

For example, a successful run may end with output similar to:

```text
 RUN  v4.1.12

.................................................
.................................................

 Test Files  12 passed (12)
      Tests  240 passed (240)
   Start at  14:30:00
   Duration  18.42s
```

**This output is an illustrative example, not a recorded test run.** The test counts, start time, and duration are placeholders and do not represent the current test inventory.

The output contains several important details:

- **RUN** identifies the Vitest version executing the tests.
- **Dots** represent completed tests when using the dot reporter.
- **Test Files** indicates how many test files completed successfully.
- **Tests** indicates how many individual tests passed.
- **Start at** shows when execution began.
- **Duration** shows how long the run took.

A successful run should report all completed tests as passed, with no failed tests, and exit with status code 0.

If a test fails, Vitest displays failure details, including the affected test name and error messages. The final summary will indicate how many tests passed and failed.

Some tests intentionally simulate unavailable external services and may print warnings or error messages. These messages do not necessarily indicate a failed test run.

Always check the final Vitest summary and process exit status when determining whether the tests passed.

The number of test files, total test count, and execution duration will vary as the suite grows and the execution environment changes.

### Run one test file

```bash
npm test -- app/lib/checkout-validators.test.ts
```

For a React component test:

```bash
npm test -- app/admin/events/components/event-form.test.tsx
```

### Run Delivery and Static Menu Vitest tests

The public Delivery, Static Menu, and administrator Delivery tests are distributed across multiple directories. The following PowerShell-compatible command runs all nine affected Vitest files, including existing website-content assertions in those files:

```powershell
npx vitest run "app/(site)/delivery/page.test.tsx" "app/(site)/static-menu/page.test.tsx" "app/(site)/static-menu/static-menu-content.test.ts" "app/admin/website-content/components/sections/delivery-section.test.tsx" "app/admin/website-content/handlers/use-website-content.test.tsx" "app/api/website-content/route.test.ts" "app/lib/website-content-delivery.test.ts" "app/lib/website-content-validators.test.ts" "app/lib/website-content.test.ts"
```

The command runs complete files, not only the newly added tests. It is a focused regression run and does not replace `npm test`.

### Run related tests using a directory filter

```bash
npm test -- app/admin/menu/
```

For directory paths containing parentheses, use quotation marks:

```bash
npm test -- "app/(site)/contact/"
```

A directory filter only selects matching test-file paths.

Tests for a single feature may be distributed across the frontend, API routes, and shared libraries. A directory filter therefore might not include every related test.

### Run several test files or groups

```bash
npm test -- app/api/checkout/ app/api/orders/
```

### Run tests matching a name

```bash
npm test -- app/lib/checkout-validators.test.ts -t "refuses"
```

The `-t` option filters tests by their descriptions.

### Watch mode

During active development:

```bash
npx vitest --watch app/lib/checkout-validators.test.ts
```

Watch mode reruns relevant tests as files change.

Press Ctrl+C to stop watch mode.

### Discover and run Playwright browser tests

List discovered browser tests without executing them:

```bash
npx playwright test --list
```

Run all configured browser specs in Chromium:

```bash
npx playwright test --project=chromium
```

Run only administrator login and password tests (these mock authentication and password APIs):

```bash
npx playwright test e2e/admin-login.spec.ts e2e/admin-password-flow.spec.ts --project=chromium
```

Run Owner account-management tests (requires an authenticated local Owner session):

```bash
npx playwright test e2e/admin-account-management.spec.ts e2e/admin-account-management-mobile.spec.ts --project=chromium
```

Run the public cart/customizer/checkout browser spec, which uses mocked checkout and Square responses and needs no authenticated Owner session:

```bash
npx playwright test e2e/customizer-cart-checkout.spec.ts --workers=2
```

Playwright's exit summary reports passed, failed, and skipped tests. A skipped Owner test **does not demonstrate that its workflow passed**. Confirm the expected test count and zero skips when reporting complete verification.

### Run Delivery and Static Menu browser tests

The three additional browser specs can be run independently or together:

```powershell
npx playwright test e2e/delivery.spec.ts e2e/delivery-admin.spec.ts e2e/static-menu.spec.ts --project=chromium --workers=2
```

```powershell
npx playwright test e2e/delivery.spec.ts --project=chromium
npx playwright test e2e/delivery-admin.spec.ts --project=chromium
npx playwright test e2e/static-menu.spec.ts --project=chromium
```

`delivery.spec.ts` is a public, unauthenticated browser suite. It reads delivery platforms saved in local website content and expects at least one complete, enabled platform. It checks page content, configured link destinations, keyboard activation, and responsive layouts. Destination navigation is intercepted with a fake page; it does not contact real delivery providers. The local Next.js app and its local database proxy may need to be running to load the saved links.

`delivery-admin.spec.ts` loads the real local `/admin/website-content` page and requires `TEAZO_E2E_ADMIN_STORAGE_STATE` to point to a saved, authorized local Admin or Owner session. If that variable does not point to an existing file, its tests skip; if the session is expired, navigation to login fails the test. The suite intercepts website-content saves, records attempted PATCH payloads, and blocks unexpected writes. It verifies user interactions and outgoing save data, **not** database persistence.

`static-menu.spec.ts` tests `/static-menu` and the `OPEN PDF` interaction, keyboard access, new-tab behavior, PDF preview rendering, fallbacks, viewport changes, and simulated Safari user-agent behavior. It loads `public/teazo-menu.pdf` as a fixture and intercepts PDF requests to test success and failure conditions. Safari behavior is simulated in Chromium; it is not a real Safari test.

### Prepare a local Owner session for protected browser tests

Do this only with an authorized local development Owner account. Keep saved browser state **outside the repository**: it contains authentication cookies and must never be committed, shared, or uploaded to test logs.

In PowerShell, from `teazo-site/`:

```powershell
$sessionDir = Join-Path $env:LOCALAPPDATA 'Teazo-Playwright'
New-Item -ItemType Directory -Force -Path $sessionDir | Out-Null
$env:TEAZO_E2E_OWNER_STORAGE_STATE = Join-Path $sessionDir 'owner-state.json'

npx playwright codegen --save-storage="$env:TEAZO_E2E_OWNER_STORAGE_STATE" 'http://localhost:3000/login'
```

Sign in within the opened Playwright Chromium browser, navigate to `http://localhost:3000/admin/settings`, and confirm the Owner-only administrator-management interface loads. Close the browser and inspector so codegen saves its storage state.

Verify the path exists without printing the file's credentials:

```powershell
Write-Host "Owner session configured: $([bool]$env:TEAZO_E2E_OWNER_STORAGE_STATE)"
Write-Host "Owner session file exists: $(Test-Path -LiteralPath $env:TEAZO_E2E_OWNER_STORAGE_STATE)"
```

The account-management specs read `TEAZO_E2E_OWNER_STORAGE_STATE` (or, as a fallback, `TEAZO_E2E_ADMIN_STORAGE_STATE`). Environment variables set in PowerShell apply only to that terminal session; set the path again in any new terminal. File existence does not guarantee the cookies remain valid. If the session expires, sign in again and regenerate the storage state.

Run the local D1 proxy alongside Next.js when needed for sign-in or protected pages. The browser tests' synthetic administrator API interactions are intercepted, but loading the protected settings page still depends on a valid Owner session.

## 4. Test coverage areas

The test suite covers frontend components, backend API routes, database operations, and shared application utilities.

Tests are organized by the functionality they verify rather than by individual development branches.

### Functional coverage

The Delivery and Static Menu areas include both component-level tests and Chromium browser tests. Delivery administration also covers saving, validation, visibility, ordering, removal, and error recovery without writing production data.

| Website area | Types of behavior tested |
|---|---|
| Public Menu | Catalog display, loading states, category visibility, data handling, and error conditions |
| Static Menu | Page content, logo, link behavior, PDF preview, fallback states, keyboard access, responsive layout, and simulated Safari behavior |
| Public Delivery | Page content, logo, visible platform links and ordering, external-link destinations, keyboard activation, and responsive layout |
| Admin Delivery | Delivery platform add/edit/hide/show/remove, field requirements, URL and name validation, debounced saves, errors, and multi-platform isolation |
| Admin Menu | Item forms, creation, editing, deletion, refresh behavior, category display controls, validation, PDF uploads |
| Gallery | Public image and video display, administrator List/Card View interactions, selection, editing, deletion confirmation previews, upload and replacement validation, image compression without reducing pixel dimensions, file-size boundaries, thumbnail rendering, media utilities, database queries, and public cache invalidation |
| Events | Public Events display, administrator forms, API routes, event dates, database queries |
| Checkout | Cart/customizer interactions, synchronous duplicate-submit prevention, checkout-attempt UUID validation, persistent D1 idempotency coordination, Square retry and failure handling, cart revision ownership, payment confirmation, and abandoned-checkout recovery |
| Orders and Webhooks | Order lifecycle, Square webhook validation, category synchronization, cache invalidation, and failure scenarios |
| Contact | Form submission, deferred notifications, recipient selection from stored Website Content, invalid or unavailable recipient handling, notification recovery, email limits, Turnstile verification, and database queries |
| Website Content | Public content rendering, administrative editing, store hours, content validation, API behavior, social-link URL normalization, hostname-based Facebook/Instagram/Yelp icon recognition, custom share-icon fallback, and Admin/public social-icon rendering |
| Analytics | Dashboard queries, analytics storage, SQL behavior, cleanup procedures |
| Authentication | Session validation, password setup/reset, password tokens, rate limiting, invitation handling; browser login/password workflows |
| Administrator Management | Owner/Admin authorization, administrator settings, invitations, database migrations; desktop/mobile browser account workflows |
| Ownership Transfer | Ownership-transfer requests, acceptance/decline, concurrency, SQL operations, notifications, UI behavior |

Some application features have additional tests in shared utility directories.

### Frontend tests

Frontend tests usually involve React components and may use React Testing Library and jsdom.

Relevant directories include:

```text
app/(site)/
app/admin/
app/ownership-transfer/
```

Examples of behaviors to test include:

- Whether components render the correct information.
- Whether buttons and forms respond to interaction.
- Whether user input is validated.
- Whether successful actions update displayed information.
- Whether failed requests produce appropriate feedback.
- Whether cancellation and retry behavior work correctly.
- Whether loading and disabled states prevent unintended actions.

Frontend tests should focus on observable behavior rather than implementation details whenever practical.

Gallery frontend tests also cover image and video deletion previews, Card View editing and selection, List View thumbnail rendering, client-side upload-size validation, and delayed video-loading feedback. These tests verify that oversized videos are rejected, large images are prepared before upload, and failed image preparation does not submit an invalid file. Public Gallery video tests verify that the loading indicator appears only after a delay, disappears when playback begins, reappears when playback stalls, and displays an unavailable message when loading fails.

Website Content frontend tests verify that supported social media platforms display the correct icons based on URL hostnames rather than internal IDs. They also verify that unsupported destinations use TEAZO's existing custom share SVG in both the Admin editor and public pages.

These component tests use jsdom and mocked dependencies. Real-browser verification is still required for image appearance, video playback, and other behavior that depends on browser media processing.

### Delivery and Static Menu Vitest files

The following nine test files contain the new Delivery and Static Menu coverage. Some also contain earlier website-content tests, so do not interpret their entire test counts as new additions.

| Test file | Main behaviors |
|---|---|
| `app/(site)/delivery/page.test.tsx` | Public heading, description, displayed/hidden delivery platforms, ordering, content loading, and logo source |
| `app/(site)/static-menu/page.test.tsx` | Page metadata, headings, logo, static-menu component, and website-content loading |
| `app/(site)/static-menu/static-menu-content.test.ts` | PDF link and helper text, server-rendered fallback, and simulated Safari behavior |
| `app/admin/website-content/components/sections/delivery-section.test.tsx` | Form validation, blank drafts, name length, visibility, editing, and removing the correct row |
| `app/admin/website-content/handlers/use-website-content.test.tsx` | Delivery save timing, failed/invalid saves, drafts, visibility and deletion, capacity limits, and cross-row isolation |
| `app/api/website-content/route.test.ts` | Administrator authorization, delivery PATCH validation, empty-list saves, and persistence failure responses |
| `app/lib/website-content-delivery.test.ts` | Delivery URL protocol requirements, hidden items, invalid URLs, and empty-list saves |
| `app/lib/website-content-validators.test.ts` | Shared website-content validation, delivery link formats, platform limits, and invalid data |
| `app/lib/website-content.test.ts` | Local fake-D1 delivery reads/writes, delete semantics, validation failures, and cache invalidation |

### Playwright browser tests

Browser tests are kept under `teazo-site/e2e/` and run independently of the co-located Vitest tests:

| Spec file | Verified cases | Main behaviors |
|---|---:|---|
| `admin-login.spec.ts` | 9 | Login controls, form validation, mocked invalid credentials, redirect safety, mobile usability |
| `admin-password-flow.spec.ts` | 10 | Password-link requests, setup/reset validation, API error handling, mobile dialog |
| `admin-account-management.spec.ts` | 19 | Owner-only account list, add/edit/delete flows, invitations, authorization failures, responsive UI |
| `admin-account-management-mobile.spec.ts` | 1 | Synthetic add, edit, invitation, and delete workflows at a mobile viewport |
| `customizer-cart-checkout.spec.ts` | 9 | Public cart totals, item customization, checkout validation and error handling, retry, pending/disabled states, mocked Square redirect, and mobile viewport |
| `delivery.spec.ts` | Not yet included in historical baseline | Public Delivery page, live local content, links, keyboard access, refresh behavior, and responsive layouts |
| `delivery-admin.spec.ts` | Not yet included in historical baseline | Authenticated local admin editor, draft management, field validation, intercepted saves, failures, visibility, and mobile interaction |
| `static-menu.spec.ts` | Not yet included in historical baseline | PDF button, preview rendering, fallback states, keyboard activation, new tab, resizing, and Safari simulation |

**Verified Playwright baselines:** Playwright browser tests cover selected application workflows using Chromium. Account-management specifications require a saved local Owner session. Mobile viewport tests use Chromium with simulated mobile dimensions, not actual mobile Safari or Android Chrome. Test counts may change as coverage expands, so run the relevant specifications to determine the current results.

### Backend and API tests

API route tests are generally located under:

```text
app/api/
```

These tests may invoke exported route handlers directly using mock `Request` objects.

Relevant assertions include:

- HTTP status codes.
- Response bodies and headers.
- Authentication and authorization.
- Input validation.
- Expected service calls.
- Database and storage side effects.
- Error recovery and failure responses.
- Rate limiting.
- Idempotency and duplicate-request handling.

API route tests commonly mock external systems rather than performing live network requests.

Contact-form tests mock Website Content lookups to verify that notifications use the stored contact email instead of an environment recipient. They also test invalid or unavailable recipients and confirm that saved messages remain intact when notification delivery is skipped or fails.

### Checkout idempotency and cart recovery tests

The checkout regression tests are distributed across shared utilities, components, route handlers, and the cart context. Useful focused files include:

| Test file | Focus |
|---|---|
| `app/lib/checkout-validators.test.ts` | Required checkout-attempt UUID, customer contact, pickup timing, and cart validation |
| `app/api/checkout/route.duplicate-submission.test.ts` | Sequential/concurrent duplicate requests, stable Square idempotency keys, safe retries, and D1 failures with mocked services |
| `app/lib/queries/checkout-attempts.test.ts` | Atomic claim and processing-owner SQL, completion, and uncertain-state transitions through mocked D1 calls |
| `app/(site)/components/cart-drawer-checkout.test.tsx` | Duplicate direct submissions, disabled states, Turnstile, errors, retry, and mocked redirect |
| `app/lib/checkout-attempt-storage.test.ts` | Attempt identity and reuse; new IDs for new purchases; matching payment cleanup |
| `app/lib/cart-payment-ownership.test.ts` | Cart revision changes and paid-order ownership guards |
| `app/context/cart-context.frontend.test.tsx` | Existing cart persistence, quantity, customization, and totals |
| `app/context/cart-context.checkout-recovery.test.tsx` | Recovery after Square is closed, including modified/new carts and delayed responses |
| `app/(site)/order/confirmation/page.test.tsx` | Receipt states, payment verification, matching cart ownership |
| `app/(site)/order/confirmation/page.checkout-attempt.test.tsx` | Paid/unpaid/canceled checkout-attempt cleanup and protection against old receipts |

For a focused checkout regression run, pass these filenames to `npx vitest run`. A successful targeted run does **not** establish that the full repository suite passes.

### Database and migration tests

Database-related tests are commonly located under:

```text
app/lib/
app/lib/queries/
```

Migration scripts are stored under:

```text
migrations/
```

Tests may verify:

- SQL query behavior.
- Filtering and data retrieval.
- Database constraints.
- Schema migrations.
- Data preservation during migrations.
- Transaction and concurrency behavior.
- Application behavior when database operations fail.

SQLite-backed tests execute real SQL against temporary in-memory databases. This differs from testing the actual deployed Cloudflare D1 service.

### Local D1 concurrency verification

`teazo-site/scripts/verify-checkout-d1-concurrency.ps1` is a **separate manual integration check**, not a Vitest or Playwright test. It sends concurrent SQL operations to the local D1 proxy and verifies that the unique checkout-attempt reservation and conditional processing ownership each have exactly one winner. The script uses a temporary attempt record and deletes it afterward. It does **not** contact Square or prove production D1 concurrency.

Prerequisites: PowerShell 7 (`pwsh`), the local D1 proxy running at `http://127.0.0.1:8787`, matching local proxy credentials in `teazo-site/.env.local`, and migration `0014_checkout_idempotency.sql` applied to the local D1 database. From `teazo-site/`:

```powershell
pwsh -NoProfile -File ".\scripts\verify-checkout-d1-concurrency.ps1"
```

Expected: one successful reservation out of ten, one successful processing-owner claim out of ten, and successful cleanup. The script is restricted to a loopback proxy; never change it to target a production endpoint or include credentials in logs. Database ownership is one part of payment safety: mocked route tests separately verify that duplicate requests do not issue independent Square operations.

When changing D1 schema, verify migrations in a local database first. `teazo-site/migrations/0014_checkout_idempotency.sql` creates the persistent checkout-attempt table. Database migrations are **not automatically applied during deployment**. Before deploying an application version that requires a new table, the authorized deployer must apply the migration to the target database and verify the schema; see [Developer Guide](DEV-GUIDE.md), section 7. Do not use a remote migration command as part of routine automated testing.

### Utility tests

Shared business logic tests are commonly found under:

```text
app/lib/
```

These include validation, dates, store hours, Square catalog rules, email content, and other reusable application logic.

Utility tests should cover successful input, rejected input, edge cases, and relevant business rules.

Gallery utility tests cover resolution-preserving image compression, upload-size boundaries, media conversion, mocked database persistence behavior, and public Gallery cache invalidation. Compression tests verify that oversized images are converted without reducing their pixel dimensions and rejected when compression cannot meet the upload limit.

Social platform utility tests verify hostname-based icon recognition for Facebook, Instagram, and Yelp. They also reject misleading hostnames and return null for unsupported destinations, allowing the interface to display TEAZO's custom share icon.

## 5. Writing and maintaining tests

### Naming conventions

Use:

- `*.test.ts` for TypeScript tests.
- `*.test.tsx` for React component tests.
- `e2e/*.spec.ts` for Playwright browser tests.

Place Vitest tests near the corresponding application modules when practical. Keep Playwright specs in `e2e/`. Include explanatory comments and avoid embedding credentials or customer data.

### Example utility test

```typescript
import { describe, expect, it } from "vitest";
import { toE164Phone } from "@/app/lib/checkout-validators";

describe("toE164Phone", () => {
  it("normalizes a US phone number", () => {
    expect(toE164Phone("4155550199")).toBe("+14155550199");
  });
});
```

Use test names that explain the expected behavior.

Prefer assertions that describe what the application should do rather than how the implementation happens to be written.

### React component tests

Use React Testing Library helpers such as:

```typescript
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
```

Use jsdom for tests that need browser-like DOM APIs.

Mock browser or framework features that are not available in the test environment when necessary.

### API route tests

Construct realistic requests and invoke the route handler being tested.

Verify successful and unsuccessful responses, authorization requirements, validation, and important side effects.

Do not contact production systems in automated unit or mocked integration tests.

### Authentication and administrator roles

The current administrator system uses two roles:

| Role ID | Role | Intended access |
|---|---|---|
| 1 | Owner | Site administration, content management, and administrator membership management |
| 2 | Admin | Authorized content management without administrator membership management |

Authentication tests should confirm that permissions are enforced server-side, not solely by hiding controls in the user interface.

Tests must not rely on the retired Can View/Can Edit role system or treat the legacy `can_invite_users` flag as granting administrator-management permissions.

If the role model changes in the future, update both the relevant implementation and its authorization tests.

## 6. Mocking and test isolation

Vitest supports:

- `vi.fn()` for mock functions.
- `vi.mock()` for mocked modules.
- `vi.hoisted()` for values used during module mocking.
- `vi.spyOn()` for observing or replacing existing functions.
- `beforeEach()` and `afterEach()` for test setup and cleanup.

Common mocked services include:

- Square catalog, location, checkout, and webhook integrations.
- Cloudflare D1 and R2 operations.
- Email providers and invitation delivery.
- Website Content recipient lookups for contact-form notifications.
- Authentication sessions.
- Turnstile verification.
- Next.js server utilities and cache behavior.
- Browser image decoding, canvas encoding, and Gallery media compression.
- Next.js image rendering for React component tests that do not require real image optimization.

Mocks must be established before modules that depend on them are evaluated.

Some tests use dynamic imports to control module initialization and mocking order.

Gallery tests mock Sharp, Cloudflare R2, D1 queries, browser image decoding, canvas encoding, and Next.js cache invalidation. Upload-size tests may simulate file sizes without allocating large files. These mocks verify validation and application behavior but do not measure actual image quality or network performance.

React component tests may mock `next/image` when testing user interactions, saving, deletion, or icon selection. This prevents framework image URL processing from interfering with tests that do not exercise image optimization. Real image rendering and optimization must be verified separately.

### Square webhook category synchronization

The two Square webhook Vitest files (`app/api/square/webhooks/route.test.ts` and `route.catalog-cache.test.ts`) mock `@/app/lib/sync-menu-categories` and its `syncSquareMenuCategories()` function. This prevents tests from initializing a real Square client and tests category synchronization without live credentials. The route tests also verify menu cache revalidation, including `/admin/menu/display-categories`, for valid catalog events.

### Playwright request interception and real sessions

The login and password-flow specs intercept authentication and password endpoints, so their simulated failures and success responses do not change real credentials or send email. The account-management specs require a real **local Owner session to enter the protected page**, then use synthetic account records and intercepted account APIs; unexpected writes are blocked in those specs.

The checkout browser spec intercepts the checkout and related dependencies and uses mock responses; it does not create real Square payment links.

Do not assume every browser test is fully isolated merely because it uses Playwright routing. Review new test routes before adding them, avoid production services, and never run destructive authenticated workflows against real customer or production data. A valid local Owner session proves local access; it is not a production login test.

### Delivery and Static Menu isolation

Delivery administration tests use the real local authenticated page but intercept `PATCH /api/website-content`, record intended payloads, and block unexpected write requests. They also stub carousel initialization, so tests do not persist website-content or carousel changes. A valid local session is still required to load protected routes.

Public Delivery tests allow local content reads but mock navigation to delivery platforms. This prevents tests from reaching external delivery websites. They depend on valid, enabled links in the local website-content data.

Static Menu browser tests intercept PDF requests and use the committed `public/teazo-menu.pdf` fixture. They simulate missing PDFs, corrupt PDFs, and PDF module failures, rather than requiring these failures in the live application. Always distinguish simulated Safari user-agent tests in Chromium from testing on Safari itself.

### Reset state between tests

Relevant Vitest utilities include:

| Utility | Behavior |
|---|---|
| `vi.clearAllMocks()` | Clears mock call histories |
| `vi.resetAllMocks()` | Also resets mock implementations |
| `vi.restoreAllMocks()` | Restores spied-on implementations |
| `vi.unstubAllEnvs()` | Removes environment-variable stubs |
| `vi.unstubAllGlobals()` | Removes stubbed globals |

These functions are not interchangeable.

Tests should clean up timers, rendered components, environment settings, database fixtures, and other mutable state as necessary.

A test must not depend on another test having run first.

## 7. Database test fixtures

Shared test utilities are located in:

`teazo-site/test/`

### `test/fake-d1.ts`

Provides a lightweight D1 substitute backed by in-memory table rows.

Use this helper when testing query construction, parameter binding, or application behavior without executing SQL against a database engine.

The helper can also record statements passed to `batch()` for verification.

### `test/sqlite-d1.ts`

Provides an in-memory SQLite database with D1-like query methods.

It loads SQL migrations from `teazo-site/migrations/` in filename order and applies them to a fresh database.

Use this helper when tests require actual SQL execution, database constraints, or migration behavior.

Call `sqliteD1.reset()` when a test needs a fresh database.

### Other shared helpers

| File | Purpose |
|---|---|
| `test/catalog-fixtures.ts` | Shared Square catalog test data |
| `test/server-only.ts` | Substitute for the Next.js `server-only` import guard |
| `test/node-sqlite.d.ts` | TypeScript support for SQLite APIs |

Do not duplicate shared fixture utilities when extending an existing test suite.

### SQLite warnings

Node.js may display a warning that its SQLite support is experimental.

This warning alone does not indicate a failed test. Evaluate the test assertions and final process exit status.

## 8. Branch dependencies and application changes

**Branch dependency:** Tests that reference code or migrations unavailable in the current checkout may fail even when the tests themselves are correct. Run each testing branch against an updated `dev` checkout containing its required implementation and database migrations before opening a pull request.

Tests should be updated whenever their application's public interfaces or expected behavior change.

Examples include:

- A React component prop being added or removed.
- An API response structure changing.
- A database migration changing a table or field.
- Authorization requirements changing.
- Error messages or user-facing behavior changing.
- An external integration being upgraded.

When an existing test fails after a code change, determine whether the failure exposes a regression or whether the test expectation is outdated.

**Do not weaken a security or behavior assertion simply to make the suite pass.**

Changes to permission checks, payment handling, stored data, and email security should receive particular attention.

## 9. Verification before merging or releasing changes

For each meaningful application change or testing pull request:

1. Ensure the local branch contains the required current implementation.
2. Install or refresh dependencies when package files have changed.
3. Run the directly affected tests.
4. Run related regression tests outside the changed directory.
5. Run the complete Vitest suite and, where configured, the relevant Playwright browser suite.
6. Run targeted ESLint on changed code.
7. Run TypeScript checking.
8. Verify the Next.js production build.
9. Review the Git diff for unrelated modifications.
10. Perform manual integration or browser checks when the change requires them. For new D1 tables, verify the local migration and document the required production migration-before-application deployment order.

### Recommended commands

```bash
npm test -- --maxWorkers=2 --reporter=dot
npx playwright test --project=chromium
npx tsc --noEmit
npm run build
```

For targeted ESLint:

```bash
npx eslint "app/lib/checkout-validators.test.ts"
```

For a whitespace check, after committing the changes:

```bash
git diff --check origin/dev...HEAD
```

For uncommitted changes:

```bash
git diff --check
```

Avoid mixing unrelated formatting changes, dependency upgrades, or repository-wide lint cleanups into a focused testing change.

### Manual verification

Automated tests should be supplemented with manual verification when functionality depends on real browser behavior or external services.

Examples include:

- Signing in through Google.
- Checking Owner/Admin permissions in the deployed interface.
- Testing checkout using Square's sandbox.
- Checking real email delivery in an approved test environment.
- Verifying Cloudflare D1/R2 integrations.
- Testing responsive layout on mobile devices.
- Confirming browser-specific behavior.
- Checking accessibility and keyboard navigation, including manual review with the WAVE browser extension when evaluating accessibility. WAVE findings are manual verification results unless explicitly captured in automated assertions.
- Verifying Gallery image and video uploads, replacements, playback, and deletion previews in a real browser.
- Comparing original and stored image dimensions after compression to confirm that pixel resolution is preserved.
- Checking Admin Gallery List/Card View thumbnail appearance and network transfer sizes.
- Confirming social platform icons and custom share-icon fallbacks display correctly in the Admin editor and public pages.

Use development or sandbox systems whenever possible.

Do not modify production records or submit real payments solely for testing without an approved procedure.

## 10. Troubleshooting

### Vitest reports no tests found

Check that:

- The terminal is in `teazo-site/`.
- The test filename ends in `.test.ts` or `.test.tsx`.
- The test exists in the current checkout.
- The path filter is correct.
- The file matches the configured Vitest discovery pattern.

### A React test reports missing browser APIs

Verify that the test uses:

```typescript
// @vitest-environment jsdom
```

Confirm that the testing dependencies were installed with `npm ci`.

### Tests intermittently time out

Retry a large suite with:

```bash
npm test -- --maxWorkers=2 --reporter=dot
```

If an individual test continues to time out, investigate its asynchronous operations, mocked services, timers, and cleanup.

Avoid increasing timeouts indiscriminately.

### Playwright reports a missing browser executable

Install the browser binary corresponding to the current Playwright package:

```bash
npx playwright install chromium
```

A new checkout also needs `npm ci` from `teazo-site/`.

### Owner account-management tests are skipped or redirected to login

Confirm `TEAZO_E2E_OWNER_STORAGE_STATE` points to an existing JSON file **outside the repository**, that its cookies are still valid, and that the account can access `/admin/settings`. Regenerate the session with `playwright codegen --save-storage` if needed. Run the local D1 proxy when authentication or the settings page depends on it.

A run showing `20 skipped` is not a passing verification of the Owner workflows, even if Playwright exits successfully.

### Playwright cannot connect to the local website

The configured origin is `http://localhost:3000`, not `http://127.0.0.1:3000`. Ensure port 3000 is free or the correct Next.js dev server is running. If login appears broken, confirm the local D1 proxy is active before changing the tests or credentials.

### Local checkout concurrency script cannot connect

Confirm the local D1 proxy is running at `http://127.0.0.1:8787`, that `.env.local` contains a matching local `PROXY_TOKEN`, and that the checkout-attempt migration was applied to the **local** database. Run the script from `teazo-site/` with PowerShell 7. Do not paste authentication tokens into bug reports or switch the test to a remote database.

### Delivery browser tests have no visible platforms

Run the local application and, where required, the local D1 proxy. In the local administrator Website Content editor, confirm at least one delivery platform has a nonempty name, a valid URL, and enabled visibility. The public Delivery browser tests intentionally require one such configured platform; hidden and empty-state behavior is covered by Vitest instead.

### Admin Delivery browser tests are skipped or redirected to login

Set `TEAZO_E2E_ADMIN_STORAGE_STATE` in the terminal running Playwright to a valid local browser storage-state file outside the repository. The `TEAZO_E2E_OWNER_STORAGE_STATE` variable alone is not read by this spec. If redirected to `/login`, re-export the saved local session and confirm the D1 proxy and authenticated editor are available. A skipped test does not prove its workflow passed.

### Static Menu PDF tests cannot find their fixture

Run Playwright from `teazo-site/` and check that `public/teazo-menu.pdf` exists in the checkout. The tests read that PDF at startup. They use mocked failure responses and Chromium-based Safari simulation, not live failures or a real Safari browser.

### SQLite or migration errors

Confirm that the expected migration files exist in the current checkout.

Check the initialization and reset behavior of the in-memory database fixture.

If the schema recently changed, update the relevant tests and fixtures.

### TypeScript errors after switching branches

Next.js can retain generated route types from a previous checkout.

Inspect the paths reported by TypeScript before changing production code.

If generated route types are stale, regenerate them:

```bash
npx next typegen
npx tsc --noEmit
```

Then check that no unintended tracked-file changes were introduced.

### An API or component test fails after an application update

Compare the test's expected behavior against the current implementation and product requirements.

Look for changes to:

- API authorization.
- Component props.
- Error messages.
- Form validation.
- Database schema.
- Request and response formats.

Correct outdated expectations only when the new behavior is intentional.

### React warns about `jsx` or `global` attributes

Some Next.js styling constructs may be rendered by jsdom without the normal Next.js compiler transformation.

These warnings do not automatically mean the test failed.

Review the component and assertions separately rather than suppressing all React warnings.

### Square or other service errors appear in test output

Some tests deliberately simulate unavailable external services.

Messages such as a Square catalog being unavailable may be expected output from error-handling tests.

The final Vitest result and process exit status determine whether the test run passed.

### Individual tests pass but the full suite fails

Investigate:

- Shared mutable state.
- Unreset mocks.
- Environment-variable leakage.
- Timer cleanup.
- Module caching.
- Database-fixture cleanup.
- Worker contention.

Tests should be independent and repeatable.

## 11. Coverage limitations

The presence of automated tests does not guarantee complete application coverage.

The Vitest suite primarily verifies:

- TypeScript utility and business logic.
- React component behavior in a simulated DOM.
- API handlers and error responses.
- Mocked external service interactions.
- Database queries and migrations.

Playwright additionally verifies selected browser-based authentication, administrator management, public cart/checkout, public Delivery, Admin Delivery, and Static Menu interactions in Chromium. These tests use a combination of mocked APIs, intercepted requests, and local application data. Further testing may be necessary for:

- Other real browser end-to-end workflows outside the eight currently documented Playwright specs.
- Production Google authentication behavior.
- Live Square sandbox integrations.
- Deployed Cloudflare D1 and R2 behavior.
- Actual email deliverability.
- Mobile Safari and Android browser differences.
- Accessibility, including manual WAVE browser-extension reviews, screen-reader checks, color contrast, and keyboard navigation across the site. Browser keyboard assertions and simulated states do not constitute a complete accessibility audit.
- Performance under load.
- Production concurrency and operational monitoring; local proxy SQL concurrency testing cannot establish all production conditions.
- Real-browser Gallery upload, playback, buffering indicators, and media replacement workflows not covered by dedicated Playwright specifications. Video-loading states are simulated in jsdom and require separate real-browser verification.
- Image compression quality across different image formats, dimensions, browsers, and devices.
- Large Gallery performance with many stored images, particularly when original images are used for List View thumbnails.
- Public and Admin social-link interactions in browsers not covered by existing automated browser tests.

Vitest and Playwright are separate automated testing suites. Vitest does not provide real-browser end-to-end coverage; Playwright provides limited real-browser coverage for selected workflows. Passing either suite does not prove every production integration or browser is supported.

A successful test count is **not** a code-coverage percentage.

Do not claim complete frontend, backend, or end-to-end coverage without separate measurement and verification.

## 12. Maintaining the testing system

The automated tests should be maintained alongside the application.

Whenever a feature changes:

- Update affected tests in the same development workflow.
- Add regression tests for confirmed defects.
- Add tests for new validation and error cases.
- Keep authentication and authorization tests aligned with current permissions.
- Keep database fixtures aligned with migrations.
- Avoid relying on live external services in ordinary unit tests.
- Review flaky tests rather than routinely increasing timeouts.
- Record test failures and resolutions when they affect release decisions.

### Keeping this documentation current

This document is the canonical reference for automated testing.

Update it when:

- Test frameworks or dependencies change.
- Commands or configuration change.
- New shared fixtures are introduced.
- Test conventions change.
- New functional testing areas are added.
- Additional integration or end-to-end testing tools are adopted.
- Playwright browser configurations, authenticated-session requirements, or covered workflows change.

The repository READMEs and the [Developer Guide](DEV-GUIDE.md) should link to this document rather than maintain duplicate testing instructions.

The test inventory is intentionally organized by website functionality instead of temporary development branches or historical test counts.

For the current number of tests, run the test suite against the latest appropriate checkout and use its reported totals.

This helps ensure the guide remains accurate and useful to future maintainers as the website evolves.
