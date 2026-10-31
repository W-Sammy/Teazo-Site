# TEAZO Automated Testing Guide

This guide is the primary reference for automated tests in the TEAZO website. It covers setup, frameworks, test creation, individual and grouped execution, parallelism, test isolation, database fixtures, and limitations.

For general development setup (Next.js, Cloudflare Worker, local database, authentication, and environment variables), see [DEV-GUIDE.md](DEV-GUIDE.md).

## 1. Requirements and setup

- Node.js **22.13 or newer**, consistent with the project developer guide.
- npm and Git.
- A checkout containing the features that the tests exercise.

Run commands in the `teazo-site/` directory:

```bash
cd teazo-site
npm ci
```

Use `npm ci` for reproducible installation from `package-lock.json`. Existing installations may skip this if dependencies are up to date. On Windows, Git Bash is the recommended shell in the general developer guide. Quote paths containing parentheses in shell commands.

Most automated tests do **not** require a running Next.js development server, Cloudflare Worker, R2 bucket, external database, real Square credentials, or other production services. The tests use mocks or local in-memory fixtures. This does not mean that such tests verify live service integrations.

## 2. Frameworks and configuration

The application uses **Vitest** (`npm test` invokes `vitest run`), with:

- Vitest's `describe`, `it`, `expect`, lifecycle hooks, and `vi` mocking utilities.
- **React Testing Library** for user-facing React component behavior.
- **jsdom** for DOM-dependent component tests.
- **Node.js** as the default test environment.
- In-memory **SQLite** through Node's `node:sqlite` for SQL integration tests.

The configuration is in `vitest.config.mts`. It discovers:

```text
app/**/*.test.ts
app/**/*.test.tsx
```

Tests are generally located alongside the code they verify. For example, `app/lib/checkout-validators.test.ts` tests the checkout validators, while `app/admin/events/components/event-form.test.tsx` tests the Events form.

The `@/` alias points to the `teazo-site/` root. The Next.js `server-only` guard is replaced by `test/server-only.ts` during tests, so server modules can be imported without a Next.js server build.

React tests that need a simulated browser declare this near the top of the test file:

```typescript
// @vitest-environment jsdom
```

This file-level override matters: the default environment is Node, not jsdom.

## 3. Running tests

Run these commands from `teazo-site/`.

### Entire suite

```bash
npm test
```

For the expanded testing branch, the locally established command uses two workers and compact output:

```bash
npm test -- --maxWorkers=2 --reporter=dot
```

A full-suite result applies only to the checkout and dependencies used for that run. Do not interpret results from an older commit as proof that newly added tests pass.

### One test file

```bash
npm test -- app/lib/checkout-validators.test.ts --maxWorkers=2 --reporter=dot
```

A React component example:

```bash
npm test -- app/admin/events/components/event-form.test.tsx --maxWorkers=2 --reporter=dot
```

### A related group

Pass a path substring as a file filter. For Admin Menu:

```bash
npm test -- app/admin/menu/ --maxWorkers=2 --reporter=dot
```

For the public Contact page (quote shell-special parentheses):

```bash
npm test -- 'app/(site)/contact/' --maxWorkers=2 --reporter=dot
```

Tests for a single feature may be spread across `app/`, `app/api/`, and `app/lib/`. A directory filter does not automatically find every related test elsewhere.

### Several file paths or groups

```bash
npm test -- app/api/checkout/ app/api/orders/ --maxWorkers=2 --reporter=dot
```

### Tests matching a name

```bash
npm test -- app/lib/checkout-validators.test.ts -t 'refuses' --maxWorkers=2 --reporter=dot
```

### Watch mode during development

```bash
npx vitest --watch app/lib/checkout-validators.test.ts
```

Stop watch mode with Ctrl+C. `npm test` uses `vitest run` and exits after one run.

## 4. Parallel execution

Vitest may execute different test files concurrently using worker processes or threads. The default worker count can increase contention and cause intermittent timeouts in heavier suites.

For local regression runs, use:

```bash
npm test -- --maxWorkers=2 --reporter=dot
```

`--maxWorkers=2` limits worker concurrency; it does not activate parallelism. `--reporter=dot` changes only output presentation. Normal tests inside a file run sequentially unless concurrency is explicitly requested.

In previous local runs, two workers were more stable than default concurrency. This is a project-specific operating recommendation, not a guarantee that every future test run will pass.

Tests must not depend on execution order across files. Reset mock state, environment settings, timers, component trees, and database data between relevant cases.

## 5. Writing a test

Name a test `*.test.ts` or `*.test.tsx` and place it beside the module or component under test.

Example utility test:

```typescript
import { describe, expect, it } from "vitest";
import { toE164Phone } from "@/app/lib/checkout-validators";

describe("toE164Phone", () => {
  it("normalizes a US phone number", () => {
    expect(toE164Phone("4155550199")).toBe("+14155550199");
  });
});
```

Use clear descriptions that state the expected behavior. Cover success cases, rejected input, boundary conditions, failure paths, and meaningful side effects. For many inputs with the same assertion pattern, use `it.each`.

For React component tests, import tools such as `render`, `screen`, `fireEvent`, `waitFor`, and `cleanup` from `@testing-library/react`. Add the jsdom environment comment. Prefer assertions about what a person can observe and interact with rather than internal implementation details.

For API route tests, construct realistic `Request` objects and invoke the exported handler. Assert the response status, returned body, authorization behavior, validation, and side effects. Mock integration boundaries instead of contacting production systems.

## 6. Mocking and isolation

Vitest offers `vi.fn`, `vi.mock`, `vi.hoisted`, `vi.spyOn`, and setup/cleanup hooks such as `beforeEach` and `afterEach`.

Test modules in this repository commonly mock:

- Square service responses and Square location/catalog lookups.
- D1 queries, R2 operations, and other storage helpers.
- Email delivery, Turnstile verification, and authentication.
- Next.js cache revalidation and browser-dependent modules.

Module mocks must be established before the module under test is evaluated. Some tests use a dynamic `await import()` for precisely that reason. Avoid accidentally accessing real credentials, remote services, or production data.

Reset the state appropriate to the test: `vi.clearAllMocks()` clears call history, `vi.resetAllMocks()` also resets mock implementations, `vi.restoreAllMocks()` restores spied-on implementations, and `vi.unstubAllEnvs()` removes environment stubs. These operations are not interchangeable.

## 7. Database fixtures

Shared test utilities are located under `teazo-site/test/`.

### `test/fake-d1.ts`

Provides a lightweight D1 replacement backed by in-memory table rows. It records statements passed to `batch()`. Use it when a test checks query parameters, SQL construction, or application behavior but does not need to execute real SQL.

### `test/sqlite-d1.ts`

Provides an in-memory SQLite database with D1-like `prepare()` and `batch()` methods. It reads the `.sql` files from `teazo-site/migrations/` in filename order and applies them to a fresh database. Use it for actual SQL behavior, constraints, and transaction tests. Call `sqliteD1.reset()` when a test needs a fresh database.

This helper uses Node's `node:sqlite` API. Your Node version may print an experimental SQLite warning; that warning is not itself a failed test.

### Other helpers

- `test/catalog-fixtures.ts`: shared catalog test data.
- `test/server-only.ts`: substitute for Next.js's `server-only` import guard.
- `test/node-sqlite.d.ts`: TypeScript support for Node's SQLite API.

The fixture files are already part of the project's shared testing base; do not duplicate them in each feature PR.

**Branch dependency:** Tests that reference unmerged code or migration files may fail even when the tests themselves are correct. For example, admin-role and ownership-transfer tests require the implementation and migrations from PR #84. Verify them against the integrated `dev` code before opening their PRs.

## 8. Checks before a testing PR

For each focused PR:

1. Run the new or modified files.
2. Run related existing regression tests, including relevant tests outside the changed directory.
3. Run ESLint on the changed test and configuration files.
4. Run the full suite against an integrated branch with the required application code.
5. Check TypeScript and build results, distinguishing existing problems from newly introduced failures.
6. Record commands, results, and relevant limitations in the PR description.

Examples:

```bash
npx eslint "app/admin/events/components/event-form.test.tsx"
npm test -- --maxWorkers=2 --reporter=dot
npx tsc --noEmit
npm run build
```

Do not combine a testing PR with repository-wide formatting or ESLint autofixes. The general developer guide documents pre-existing lint problems. Keep changes limited to the feature being tested and any explicitly reviewed prerequisites.

## 9. Troubleshooting

**No tests found:** Ensure the current directory is `teazo-site/`, the test matches a configured `.test.ts` or `.test.tsx` pattern, and the path filter refers to a real file on the current branch.

**Missing module or DOM APIs:** Verify dependencies with `npm ci`, use the correct checkout, and add `// @vitest-environment jsdom` where DOM access is needed.

**Timeouts:** Try `--maxWorkers=2`; if an individual test still times out, investigate mocks, promises, cleanup, or external work rather than raising timeouts indiscriminately.

**SQLite migration failures:** Check that the required migration exists in the current checkout. Never copy unmerged application changes into a test-only branch without review.

**Individual tests pass, grouped tests fail:** Look for shared state, mock leakage, module caching, environment mutations, and incomplete fixture resets.

**Service failure messages:** Some tests deliberately simulate unavailable Square, email, or database services. Judge the outcome from Vitest assertions and process exit status, not a warning message alone.

## 10. Coverage and limitations

Automated tests can verify utility logic, UI behavior in a simulated DOM, mocked API routes, and SQLite queries. They cannot by themselves establish correctness of every production integration or user workflow.

Additional verification may be needed for:

- Real Google sign-in and session behavior.
- Live Square sandbox transactions and webhooks.
- Real Cloudflare D1, R2, and deployment configuration.
- Actual contact and invitation email delivery.
- Browser-specific, responsive, mobile, and accessibility behavior.
- End-to-end interactions in a real browser.
- Performance, concurrency in production, and operational monitoring.

The project uses Vitest for this suite; Playwright is not part of the established TEAZO testing workflow. Passing test counts are not equivalent to line, branch, statement, or path coverage percentages. Do not claim complete coverage without a separate measurement and review.

## 11. Maintaining this guide

Keep this document as the canonical testing reference. The repository's READMEs and [DEV-GUIDE.md](DEV-GUIDE.md) should link here rather than repeat detailed testing instructions. Update this guide when commands, dependencies, configuration, fixtures, or test conventions materially change.
