import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  HISTORY_ERROR_COPY,
  HIGH_SEVERITY_THRESHOLD,
  analysisVerificationCopy,
  commodityChipAriaLabel,
  emptyBriefingCopy,
  eventAlertCta,
  formatConfidencePercent,
  formatPriceSinceFiredSubtext,
  historyErrorCodeFromResponse,
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

runTest("CommodityChip confidence is labeled as confidence, not a price move", () => {
  assert.equal(formatConfidencePercent(0.88), "88%");
  assert.match(commodityChipAriaLabel("USOIL", "up", 0.88), /88% confidence/);
});

runTest("flat price change does not render (+0.0%)", () => {
  const flat = formatPriceSinceFiredSubtext("USOIL", 100.05, 100.05);
  assert.equal(flat, "No price move recorded yet since this fired");
  assert.equal(flat.includes("+0.0%"), false);
  const tiny = formatPriceSinceFiredSubtext("USOIL", 100, 100.04);
  assert.equal(tiny, "No price move recorded yet since this fired");
});

runTest("real price move still shows fired / now / percent", () => {
  const moved = formatPriceSinceFiredSubtext("USOIL", 100, 102);
  assert.match(moved, /USOIL was \$100\.00 when this fired/);
  assert.match(moved, /Now: \$102\.00 \(\+2\.0%\)/);
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
