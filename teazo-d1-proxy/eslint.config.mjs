/**
 * ESLint configuration for Cloudflare Worker automated tests.
 *
 * Uses the recommended TypeScript ESLint rules.
 * The configuration applies only to Worker test files,
 * leaving the existing production Worker implementation unchanged.
 */

import tseslint from "typescript-eslint";

export default tseslint.config({
  files: ["src/**/*.test.ts"],
  extends: [tseslint.configs.recommended],
});
