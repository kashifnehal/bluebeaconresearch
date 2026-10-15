import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  HISTORY_ERROR_COPY,
  HIGH_SEVERITY_THRESHOLD,
  analysisVerificationCopy,
  commodityChipAriaLabel,
  delayMinutes,
  describeReports,
  emptyBriefingCopy,
  eventAlertCta,
  formatConfidencePercent,
  formatDelay,
  formatPriceTimelineLines,
  historyErrorCodeFromResponse,
  shouldShowLastUpdated,
} from "./signal-display";

const here = dirname(fileURLToPath(import.meta.url));

function runTest(name: string, fn: () => void) {
  try {
    fn();
    console.log(`✔ ${name}`);
  } catch (err) {
    console.error(`✖ ${name}`);
    console.error(err);
    process.exitCode = 1;
  }
}

runTest("each HistoryErrorCode has distinct copy", () => {
  const codes = [
    "unauthorized",
    "early_access_only",
    "server_error",
    "network_error",
  ] as const;
  const texts = codes.map((c) => HISTORY_ERROR_COPY[c]);
  assert.equal(new Set(texts).size, codes.length);
  for (const text of texts) {
    assert.equal(text.includes("please reload the page"), false);
    assert.equal(text.includes("Couldn't load chat history"), false);
  }
});

runTest("history-load maps 401 / 403 / 500 / other to the right code", () => {
  assert.equal(historyErrorCodeFromResponse(401), "unauthorized");
  assert.equal(historyErrorCodeFromResponse(401, { error: "anything" }), "unauthorized");
  assert.equal(
    historyErrorCodeFromResponse(403, { error: "chat_early_access_only" }),
    "early_access_only",
  );
  assert.equal(historyErrorCodeFromResponse(403), "early_access_only");
  assert.equal(historyErrorCodeFromResponse(500), "server_error");
  assert.equal(historyErrorCodeFromResponse(502), "server_error");
});

runTest("CommodityChip aria-label names model classification confidence, not a price probability", () => {
  assert.equal(formatConfidencePercent(0.88), "88%");
  assert.equal(
    commodityChipAriaLabel("USOIL", "up", 0.88),
    "USOIL up, model classification confidence 88%",
  );
  assert.equal(commodityChipAriaLabel("USOIL", "up", 0.88).includes("% confidence"), false);
});

runTest("delay from the first report to the flag rounds to minutes", () => {
  const minutes = delayMinutes("2026-10-04T20:13:41Z", "2026-10-05T10:54:14Z");
  assert.equal(minutes, 881);
  assert.equal(formatDelay(881), "14 h 41 min");
  assert.equal(formatDelay(0), "under 1 min");
  assert.equal(formatDelay(1), "1 min");
  assert.equal(formatDelay(59), "59 min");
  assert.equal(formatDelay(60), "1 h");
  assert.equal(formatDelay(120), "2 h");
  assert.equal(delayMinutes(null, "2026-10-05T10:54:14Z"), null);
  assert.equal(delayMinutes("not-a-date", "2026-10-05T10:54:14Z"), null);
  assert.equal(delayMinutes("2026-10-05T10:54:14Z", "2026-10-04T20:13:41Z"), null);
});

runTest("price timeline names the first report, the flag, and now", () => {
  const lines = formatPriceTimelineLines(
    "USOIL",
    { price: 100, at: "2026-10-14T12:31:00Z" },
    { price: 102, at: "2026-10-14T14:00:00Z" },
    { price: 101, at: "2026-10-15T08:05:00Z" },
  );
  assert.deepEqual(lines, [
    "USOIL was $100.00 at the first linked report (quote as of 14 Oct, 12:31 UTC).",
    "$102.00 when BBR flagged it (quote as of 14 Oct, 14:00 UTC, +2.0%).",
    "$101.00 now (quote as of 15 Oct, 08:05 UTC, -1.0% since BBR flagged it).",
  ]);
  const withoutFlag = formatPriceTimelineLines(
    "USOIL",
    { price: 100, at: "2026-10-14T12:31:00Z" },
    null,
    { price: 103, at: "2026-10-15T08:05:00Z" },
  );
  assert.equal(withoutFlag.length, 2);
  assert.match(withoutFlag[1], /since the first linked report/);
  assert.equal(withoutFlag[1].includes("flagged"), false);
  const flat = formatPriceTimelineLines(
    "USOIL",
    { price: 100.05, at: "2026-10-14T12:31:00Z" },
    { price: 100.05, at: "2026-10-14T14:00:00Z" },
    { price: 100.05, at: "2026-10-15T08:05:00Z" },
  );
  assert.equal(flat[flat.length - 1], "Recorded price unchanged (closed market or unchanged quote)");
  const joined = lines.join(" ");
  for (const word of ["fast", "quickest", "real-time", "realtime", "instant", "bullish", "bearish"]) {
    assert.equal(joined.toLowerCase().includes(word), false);
  }
});

runTest("headlines that differ only by case or punctuation count as one", () => {
  assert.equal(describeReports([{ title: "One wire", domain: "reuters.com" }]), "1 report");
  assert.equal(
    describeReports([
      { title: "Oil prices surge!", domain: "reuters.com" },
      { title: "oil prices surge", domain: "bbc.com" },
    ]),
    "2 outlets, same headline",
  );
  assert.equal(
    describeReports([
      { title: "Oil prices surge!", url: "https://www.reuters.com/a" },
      { title: "Oil prices surge.", url: "https://reuters.com/b" },
    ]),
    "1 outlet, same headline",
  );
  assert.equal(
    describeReports([
      { title: "Oil prices surge", domain: "reuters.com" },
      { title: "Ports reopen after the strike", domain: "bbc.com" },
    ]),
    "2 outlets, 2 distinct headlines",
  );
});

runTest("severe-alert CTA is relabeled for low-severity signals", () => {
  const low = eventAlertCta(4);
  assert.equal(low.variant, "standard");
  assert.equal(low.label, "Create Alert");
  assert.equal(low.label.toLowerCase().includes("severe"), false);
  const high = eventAlertCta(HIGH_SEVERITY_THRESHOLD);
  assert.equal(high.variant, "severe");
  assert.equal(high.label, "CREATE SEVERE ALERT");
});

runTest("ANALYSIS Verification box no longer restates a source count", () => {
  assert.equal(analysisVerificationCopy(1), null);
  assert.equal(analysisVerificationCopy(100), null);
  const page = readFileSync(
    join(here, "../app/(dashboard)/events/[id]/page.tsx"),
    "utf8",
  );
  assert.equal(page.includes("Confirmed by"), false);
  assert.equal(page.includes("when this fired"), false);
  assert.equal(page.includes("Since signal"), false);
  assert.equal(page.includes('"Reports"'), false);
  assert.equal(page.includes('"Report"'), false);
  const fresh = readFileSync(join(here, "../components/signals/FreshTag.tsx"), "utf8");
  assert.equal(fresh.includes("Fresh "), false);
  assert.equal(fresh.includes("Fresh recently"), false);
  assert.match(fresh, /Reported/);
  assert.match(fresh, /Flagged/);
});

runTest("empty briefing copy is severity-gated, not an outage story", () => {
  const gated = emptyBriefingCopy(4);
  assert.equal(gated.kind, "severity_gated");
  assert.match(gated.text, /Severity 4/);
  assert.equal(gated.text.includes("restoring"), false);
  assert.equal(gated.text.includes("capacity"), false);
  const fail = emptyBriefingCopy(8);
  assert.equal(fail.kind, "pipeline_failure");
  assert.notEqual(fail.text, gated.text);
  assert.equal(fail.text.includes("restoring"), false);
  const compact = emptyBriefingCopy(6, "compact");
  assert.equal(compact.kind, "severity_gated");
  assert.match(compact.text, /Severity 6/);
});

runTest("Last updated shows only for merged coverage with a real later update", () => {
  const created = "2026-09-01T00:00:00.000Z";
  const sameTime = "2026-09-01T00:00:00.000Z";
  const later = "2026-09-02T00:00:00.000Z";
  assert.equal(shouldShowLastUpdated(1, created, later), false);
  assert.equal(shouldShowLastUpdated(2, created, sameTime), false);
  assert.equal(shouldShowLastUpdated(2, created, later), true);
  assert.equal(shouldShowLastUpdated(2, created, undefined), false);
  assert.equal(shouldShowLastUpdated(1, created, sameTime), false);
});

runTest("old restoring-capacity string is gone from event page and quick view", () => {
  const page = readFileSync(
    join(here, "../app/(dashboard)/events/[id]/page.tsx"),
    "utf8",
  );
  const quick = readFileSync(
    join(here, "../components/signals/SignalQuickView.tsx"),
    "utf8",
  );
  const chat = readFileSync(
    join(here, "../components/signals/SignalChatPanel.tsx"),
    "utf8",
  );
  for (const src of [page, quick, chat]) {
    assert.equal(src.includes("restoring as intelligence"), false);
    assert.equal(src.includes("Couldn't load chat history"), false);
  }
});
