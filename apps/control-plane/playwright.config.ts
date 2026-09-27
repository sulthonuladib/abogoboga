import { defineConfig, devices } from "@playwright/test"

/**
 * Playwright configuration for the control-plane smoke tests.
 *
 * The tests run against the production build served by `vite preview`, which
 * proxies `/api` to the control-plane process exactly like the dev server
 * does. The API server is reused when it is already running.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:4173",
    trace: "retain-on-failure"
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] }
    }
  ],
  webServer: [
    {
      command: "bun run start",
      cwd: "../..",
      url: "http://localhost:3001/api/workers",
      reuseExistingServer: true,
      timeout: 60_000
    },
    {
      command: "bun run build && bun run preview",
      cwd: ".",
      url: "http://localhost:4173",
      reuseExistingServer: true,
      timeout: 120_000
    }
  ]
})
