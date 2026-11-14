import { test, expect } from "@playwright/test";

// Public-page smoke checks (TASK W4 Part 2) — no sign-in. Each page: loads,
// zero console errors, no 401 network response, and no leaked file path or
// raw HTTP status code in the rendered text.
const PUBLIC_PAGES = ["/", "/accuracy", "/calendar", "/how-it-works"];

const FILE_PATH_RE = /\/apps\/(?:web|backend)\/|[\w/-]+\.(?:tsx|ts|jsx|js|json):\d+/;
const HTTP_CODE_RE = /\b(?:400|401|402|403|404|408|429|500|501|502|503|504)\b/;

for (const path of PUBLIC_PAGES) {
  test(`${path} loads clean`, async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });

    const unauthorizedResponses: string[] = [];
    page.on("response", (res) => {
      if (res.status() === 401) unauthorizedResponses.push(res.url());
    });

    const response = await page.goto(path, { waitUntil: "networkidle" });
    expect(response?.ok(), `${path} did not return an ok response`).toBeTruthy();

    expect(consoleErrors, `${path} logged console errors: ${consoleErrors.join(" | ")}`).toEqual([]);
    expect(
      unauthorizedResponses,
      `${path} triggered 401 responses: ${unauthorizedResponses.join(" | ")}`,
    ).toEqual([]);

    const bodyText = await page.locator("body").innerText();
    expect(FILE_PATH_RE.test(bodyText), `${path} rendered what looks like a file path`).toBe(false);
    expect(HTTP_CODE_RE.test(bodyText), `${path} rendered what looks like a raw HTTP status code`).toBe(
      false,
    );
  });
}
