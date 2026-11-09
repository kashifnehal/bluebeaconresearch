#!/usr/bin/env node
// Copies the single source-of-truth economic calendar JSON
// (apps/backend/src/data/economic-calendar.json) into apps/web's own
// data/ folder so the web app can keep its existing static import
// (`import calendarData from "@/data/economic-calendar.json"`) without a
// runtime cross-service HTTP call.
//
// Added 2026-11-09 (TASK W-CALENDAR Part 2) to replace a hand-maintained
// duplicate: before this script existed, both files were edited by hand in
// every calendar-data task, which drifted at least once (see
// docs/brain/LIVE_TODO.md's "known follow-up" note on the EIA/digest work,
// 2026-10-27). Runs automatically via package.json's "predev"/"prebuild"
// hooks; `economic-calendar.test.ts` on both sides also fails loudly if the
// two files are ever out of sync (e.g. this script wasn't run after an edit).
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SOURCE_OF_TRUTH = resolve(__dirname, "../../backend/src/data/economic-calendar.json");
const WEB_COPY = resolve(__dirname, "../data/economic-calendar.json");

const raw = readFileSync(SOURCE_OF_TRUTH, "utf8");
// Round-trip through JSON.parse/stringify so formatting is deterministic
// regardless of how the source file happens to be saved.
const data = JSON.parse(raw);
writeFileSync(WEB_COPY, JSON.stringify(data, null, 2) + "\n");
console.log(`[sync-calendar-data] copied ${data.events.length} events from ${SOURCE_OF_TRUTH} -> ${WEB_COPY}`);
