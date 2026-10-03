import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./test/browser",
  testMatch: "**/*.pw.ts",
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: "http://localhost:1341",
    trace: "retain-on-failure",
  },
  // A stage and port of its own, so tests never touch a developer's demo data. Per user, like
  // Test.make's default, so CI runs for different pull requests never share a stage.
  webServer: {
    command:
      "PORT=1341 API_PORT=1342 WORKOS_API_URL=http://localhost:4101 bun run dev --stage browser_${USER:-local}",
    url: "http://localhost:1341",
    reuseExistingServer: false,
    // The first run creates the stage's database branch, which takes a few minutes.
    timeout: 600_000,
  },
});
