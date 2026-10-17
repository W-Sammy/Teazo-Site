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
    environment: "node",
    include: ["app/**/*.test.ts"],
  },
});
