import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./apps/website/test/browser",
  testMatch: "**/*.pw.ts",
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: "http://localhost:1341",
    trace: "retain-on-failure",
  },
  // Use a dedicated stage and port so tests never clear a developer's demo notes.
  webServer: {
    command: "PORT=1341 API_PORT=1342 bun run dev --stage browser-test",
    url: "http://localhost:1341",
    reuseExistingServer: false,
    timeout: 180_000,
  },
});
