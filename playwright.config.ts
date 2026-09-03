import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./apps/website/test/browser",
  testMatch: "**/*.pw.ts",
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: "http://localhost:1337",
    trace: "retain-on-failure",
  },
  // `alchemy dev` runs the Worker in local workerd with a local D1, so the
  // suite exercises the same server entry and repository as production.
  webServer: {
    command: "bun run dev",
    url: "http://localhost:1337",
    reuseExistingServer: true,
    timeout: 180_000,
  },
});
