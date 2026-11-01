import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const fromRoot = (path: string) => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  resolve: {
    alias: [
      // Same as the "@/*" path in tsconfig.json.
      { find: /^@\/(.*)$/, replacement: `${fromRoot("./")}$1` },
      // "server-only" throws outside a Next.js server build. Tests run server
      // code directly, so it is swapped for an empty module here.
      { find: /^server-only$/, replacement: fromRoot("./test/server-only.ts") },
    ],
  },
  test: {
    // Existing tests run in Node by default.
    // React component tests can opt into jsdom using
    // the @vitest-environment jsdom directive.
    environment: "node",

    // Discover both TypeScript and React TSX test files.
    include: ["app/**/*.test.{ts,tsx}"],
  },
});
