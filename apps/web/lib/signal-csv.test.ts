import assert from "node:assert/strict";

import type { Signal } from "@blue-beacon-research/shared";

import { signalsToCsv } from "./signal-csv";

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

function baseSignal(overrides: Partial<Signal> = {}): Signal {
  return {
    id: "sig-1",
    title: "Refinery outage in Gulf Coast",
    summary: "A summary.",
    severity: 5,
    confidence: 0.8,
    eventType: "supply_disruption_logistics",
    country: "United States",
    region: "americas",
    sourcesCount: 2,
    commodityImpacts: [],
    isBreaking: false,
    isActive: true,
    createdAt: "2026-09-01T00:00:00.000Z",
    ...overrides,
  };
}

runTest("header row has the 8 columns in order", () => {
  const csv = signalsToCsv([]);
  const header = csv.split("\r\n")[0];
  assert.equal(
    header,
    '"Date","Event","Summary","Type","Direction","Impact","Sources","Topic/commodity"',
  );
});

runTest(
  "a summary with a comma, a double quote and a newline round-trips as one quoted field",
  () => {
    const signal = baseSignal({
      summary: 'Contains, a comma, a "quote", and\na newline.',
    });
    const csv = signalsToCsv([signal]);
    const dataRow = csv.split("\r\n")[1];
    assert.ok(
      dataRow.includes(
        '"Contains, a comma, a ""quote"", and\na newline."',
      ),
    );
  },
);

runTest('a title starting with "=" gets the quote prefix', () => {
  const signal = baseSignal({ title: "=SUM(A1:A9)" });
  const csv = signalsToCsv([signal]);
  const dataRow = csv.split("\r\n")[1];
  assert.ok(dataRow.includes('"\'=SUM(A1:A9)"'));
});

runTest("empty commodityImpacts gives an empty Direction and Topic", () => {
  const signal = baseSignal({ commodityImpacts: [] });
  const csv = signalsToCsv([signal]);
  const fields = csv.split("\r\n")[1].split(",");
  // Direction is index 4, Topic/commodity is the last field.
  assert.equal(fields[4], '""');
  assert.equal(fields[fields.length - 1], '""');
});

runTest(
  "a signal with a currency pair impact lists it in Topic/commodity",
  () => {
    const signal = baseSignal({
      commodityImpacts: [],
      currencyPairImpacts: [
        { asset: "EUR/USD", direction: "up", confidence: 0.6 },
      ],
    });
    const csv = signalsToCsv([signal]);
    const dataRow = csv.split("\r\n")[1];
    assert.ok(dataRow.includes('"EUR/USD"'));
  },
);
