/**
 * Configures Playwright browser testing for the TEAZO website.
 *
 * Defines test discovery, Chromium settings, execution limits,
 * reporting, debugging artifacts, and the local Next.js server.
 *
 * Use localhost consistently instead of 127.0.0.1 because
 * the TEAZO development server and working login use localhost.
 *
 * Playwright tests run separately from the Vitest suite.
 */

import {
  defineConfig,
  devices,
} from "@playwright/test";

// Match the hostname used by the working local TEAZO website.
const baseURL = "http://localhost:3000";

export default defineConfig({
  // Discover browser tests only inside the e2e directory.
  testDir: "./e2e",
  testMatch: "**/*.spec.ts",

  // Allow independent browser tests to execute concurrently.
  fullyParallel: true,

  // Prevent accidentally leaving focused tests in CI.
  forbidOnly: Boolean(process.env.CI),

  // Retry failures only in continuous integration.
  retries: process.env.CI ? 2 : 0,

  // Limit concurrent browser workers.
  workers: 2,

  // Maximum duration for an individual browser test.
  timeout: 45_000,

  // Maximum duration for individual Playwright assertions.
  expect: {
    timeout: 10_000,
  },

  // Display individual test results in the terminal.
  reporter: "list",

  // Store failure screenshots and traces in the ignored
  // Next.js build directory.
  outputDir: "./.next/playwright-test-results",

  // Configure shared settings for all browser tests.
  use: {
    // Use the same origin as the working local website.
    baseURL,

    // Allow additional time for Next.js navigation.
    navigationTimeout: 60_000,

    // Capture screenshots only when tests fail.
    screenshot: "only-on-failure",

    // Retain traces for failed tests.
    trace: "retain-on-failure",
  },

  // Run browser tests using Chromium.
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
      },
    },
  ],

  // Start Next.js automatically if no local server is running.
  webServer: {
    // Bind the server to the same hostname used by tests.
    command:
      "npm run dev -- --hostname localhost --port 3000",

    // Wait for the login page to become available.
    url: `${baseURL}/login`,

    // Reuse the manually running server during local testing.
    reuseExistingServer: !process.env.CI,

    // Allow Next.js sufficient startup time.
    timeout: 120_000,
  },
});
