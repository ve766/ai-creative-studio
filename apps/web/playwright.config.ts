import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.PW_PORT ?? 3100);
const MOCK_PORT = Number(process.env.PW_MOCK_PORT ?? 3200);

// Local runs reuse the installed Chrome. CI installs the bundled Chromium and
// sets PW_CHANNEL=chromium.
const channel = process.env.PW_CHANNEL ?? "chrome";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"]],
  outputDir: "./test-results",
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    channel,
    trace: "retain-on-failure",
    screenshot: "only-on-failure"
  },
  projects: [
    {
      name: "desktop",
      testMatch: /.*\.desktop\.spec\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        channel,
        viewport: { width: 1440, height: 900 }
      }
    },
    {
      name: "mobile",
      testMatch: /.*\.mobile\.spec\.ts/,
      use: {
        ...devices["Pixel 7"],
        channel
      }
    }
  ],
  webServer: [
    {
      command: `pnpm exec next start -p ${PORT}`,
      url: `http://127.0.0.1:${PORT}`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000
    },
    {
      command: `pnpm exec next start -p ${MOCK_PORT}`,
      url: `http://127.0.0.1:${MOCK_PORT}/api/v1/ai/status`,
      env: { AI_MODE: "mock", APP_ENV: "dev" },
      reuseExistingServer: !process.env.CI,
      timeout: 120_000
    }
  ]
});
