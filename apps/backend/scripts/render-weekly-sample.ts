/**
 * Renders the weekly-email fixture to disk for a manual layout check — no
 * network calls, no Resend. Writes apps/backend/scripts/out/ (git-ignored)
 * and prints the rendered HTML's byte size.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

import { renderWeeklyEmail } from "../src/lib/weekly-email.js";
import { weeklyEmailFixture } from "../src/lib/weekly-email.fixture.js";

const OUT_DIR = new URL("./out/", import.meta.url);
const HTML_PATH = new URL("./weekly-sample.html", OUT_DIR);
const TEXT_PATH = new URL("./weekly-sample.txt", OUT_DIR);

export function renderWeeklySample(): { subject: string; html: string; text: string; bytes: number } {
  const { subject, html, text } = renderWeeklyEmail(weeklyEmailFixture);
  const bytes = Buffer.byteLength(html, "utf8");

  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(HTML_PATH, html, "utf8");
  writeFileSync(TEXT_PATH, text, "utf8");

  return { subject, html, text, bytes };
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  try {
    const { subject, bytes } = renderWeeklySample();
    console.log(`Subject: ${subject}`);
    console.log(`HTML size: ${bytes} bytes`);
    console.log(`Written to ${HTML_PATH.pathname} and ${TEXT_PATH.pathname}`);
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  }
}
