import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30_000,
  expect: {
    timeout: 5_000,
  },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: "http://127.0.0.1:4321",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "mobile",
      use: { ...devices["Pixel 7"] },
    },
  ],
  webServer: {
    command:
      "DEMO_MODE=true ADMIN_EMAIL=admin@example.com ADMIN_PASSWORD_HASH=demo ADMIN_SESSION_SECRET=dev-secret PUBLIC_SITE_URL=http://127.0.0.1:4321 PUBLIC_STATE_POLL_INTERVAL_MS=1000 EVENTS_REFRESH_INTERVAL_MS=1000 STATS_REFRESH_INTERVAL_MS=1000 PLAYER_STATS_REFRESH_INTERVAL_MS=1000 pnpm exec astro dev --host 127.0.0.1 --port 4321",
    url: "http://127.0.0.1:4321",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
