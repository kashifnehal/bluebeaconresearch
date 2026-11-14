import { defineConfig } from "@playwright/test";

// New test framework for this repo (TASK W4 Part 2) — not part of `pnpm test`
// (the tsx-based rendered/unit chain) and not part of the Vercel build. Run
// explicitly with `pnpm test:e2e`. Starts a real production server
// (`next start`) against a build already produced by `next build`, so a
// build must exist before this runs.
const PORT = 3100;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  reporter: "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
  },
  webServer: {
    command: `next start -p ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
