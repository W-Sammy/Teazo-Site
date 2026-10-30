import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const fromRoot = (path: string) =>
  fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  resolve: {
    alias: [
      // Match the "@/*" path in tsconfig.json.
      {
        find: /^@\/(.*)$/,
        replacement: `${fromRoot("./")}$1`,
      },

      // Server-only modules throw outside Next.js server builds.
      // Replace the guard with an empty module during tests.
      {
        find: /^server-only$/,
        replacement: fromRoot("./test/server-only.ts"),
      },
    ],
  },

  test: {
    // Server-side tests continue using Node by default.
    environment: "node",

    // Include both TypeScript and React component tests.
    include: [
      "app/**/*.test.ts",
      "app/**/*.test.tsx",
    ],
  },
});
