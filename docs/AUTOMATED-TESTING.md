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

Playwright browser tests require a local Next.js server. The Playwright configuration can start it automatically at `http://localhost:3000` if one is not already running. Protected Owner account-management tests additionally need a valid local Owner session, and the local D1 proxy may need to be running for authentication and protected pages to work.

Some separate manual and integration verification procedures also require these services or their sandbox equivalents.

Never use production credentials or customer data simply to make automated tests run.

## 2. Testing frameworks and configuration

TEAZO uses the following testing tools.

| Tool | Purpose |
|---|---|
| Vitest | Test runner, assertions, mocks, lifecycle hooks |
| Playwright (`@playwright/test`) | Chromium browser tests for authentication and Owner account-management workflows |
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

The initial browser suite is focused on administrator authentication and account management. It does not automate real Google sign-in or production administrator changes.

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

### Latest verified test results

On **November 18, 2026**, testing on `ben-update-vitests` after merging the approved `dev` changes and adding the four Playwright spec files produced:

| Framework | Verified result | Test files |
|---|---|---|
| Vitest | 2,034 passed, 0 failed | 119 passed |
| Playwright (Chromium) | 39 passed, 0 failed, 0 skipped | 4 specs |

The Playwright results cover 19 authentication/password-flow tests and 20 account-management tests. TypeScript, targeted ESLint, and Git whitespace checks also passed for the browser-test additions. The Next.js production build passed after the `dev` integration, before the Playwright dependency was added.

These figures are a historical **branch-local verification**, not a guaranteed result for future checkouts or a claim that these tests are already on `dev`. Run both suites again after changes. Do not combine the Vitest and Playwright totals into a single Vitest count.

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
- **Duration** shows how long the test run took.

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

Playwright's exit summary reports passed, failed, and skipped tests. A skipped Owner test **does not demonstrate that its workflow passed**. Confirm the expected test count and zero skips when reporting complete verification.

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

| Website area | Types of behavior tested |
|---|---|
| Public Menu | Catalog display, loading states, category visibility, data handling, and error conditions |
| Admin Menu | Item forms, creation, editing, deletion, refresh behavior, category display controls, validation, PDF uploads |
| Gallery | Public image display, administrator selection, upload/deletion routes, media utilities, database queries |
| Events | Public Events display, administrator forms, API routes, event dates, database queries |
| Checkout | Cart interactions, duplicate submissions, payment-link handling, order confirmation |
| Orders and Webhooks | Order lifecycle, Square webhook validation, category synchronization, cache invalidation, and failure scenarios |
| Contact | Form submission, email notifications, notification recovery, Turnstile verification, database queries |
| Website Content | Public content rendering, administrative editing, store hours, content validation, API behavior |
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

### Playwright browser tests

Browser tests are kept under `teazo-site/e2e/` and run independently of the co-located Vitest tests:

| Spec file | Verified cases | Main behaviors |
|---|---:|---|
| `admin-login.spec.ts` | 9 | Login controls, form validation, mocked invalid credentials, redirect safety, mobile usability |
| `admin-password-flow.spec.ts` | 10 | Password-link requests, setup/reset validation, API error handling, mobile dialog |
| `admin-account-management.spec.ts` | 19 | Owner-only account list, add/edit/delete flows, invitations, authorization failures, responsive UI |
| `admin-account-management-mobile.spec.ts` | 1 | Synthetic add, edit, invitation, and delete workflows at a mobile viewport |

**Verified Playwright baseline:** 39 Chromium tests passed across 4 specs on November 18, 2026. The account-management specs need a saved Owner session. Mobile viewport tests use Chromium, not actual mobile Safari or Android Chrome.

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

### Utility tests

Shared business logic tests are commonly found under:

```text
app/lib/
```

These include validation, dates, store hours, Square catalog rules, email content, and other reusable application logic.

Utility tests should cover successful input, rejected input, edge cases, and relevant business rules.

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
- Authentication sessions.
- Turnstile verification.
- Next.js server utilities and cache behavior.

Mocks must be established before modules that depend on them are evaluated.

Some tests use dynamic imports to control module initialization and mocking order.

### Square webhook category synchronization

The two Square webhook Vitest files (`app/api/square/webhooks/route.test.ts` and `route.catalog-cache.test.ts`) mock `@/app/lib/sync-menu-categories` and its `syncSquareMenuCategories()` function. This prevents tests from initializing a real Square client and tests category synchronization without live credentials. The route tests also verify menu cache revalidation, including `/admin/menu/display-categories`, for valid catalog events.

### Playwright request interception and real sessions

The login and password-flow specs intercept authentication and password endpoints, so their simulated failures and success responses do not change real credentials or send email. The account-management specs require a real **local Owner session to enter the protected page**, then use synthetic account records and intercepted account APIs; unexpected writes are blocked in those specs.

Do not assume every browser test is fully isolated merely because it uses Playwright routing. Review new test routes before adding them, avoid production services, and never run destructive authenticated workflows against real customer or production data. A valid local Owner session proves local access; it is not a production login test.

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
10. Perform manual integration or browser checks when the change requires them.

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
- Checking accessibility and keyboard navigation.

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

Playwright additionally verifies selected browser-based authentication and administrator-management interactions in Chromium, with mocked APIs. Further testing may be necessary for:

- Other real browser end-to-end workflows outside the four current Playwright specs.
- Production Google authentication behavior.
- Live Square sandbox integrations.
- Deployed Cloudflare D1 and R2 behavior.
- Actual email deliverability.
- Mobile Safari and Android browser differences.
- Accessibility.
- Performance under load.
- Production concurrency and operational monitoring.

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