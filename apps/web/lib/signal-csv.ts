import type { Signal } from "@blue-beacon-research/shared";

const CSV_COLUMNS = [
  "Date",
  "Event",
  "Summary",
  "Type",
  "Direction",
  "Impact",
  "Sources",
  "Topic/commodity",
] as const;

// OWASP CSV injection guidance: a text field opening with one of these
// characters can be interpreted as a formula by spreadsheet software, so we
// prefix it with a quote to force it to stay literal text.
const FORMULA_TRIGGER_CHARS = /^[=+\-@\t\r]/;

function csvField(value: string, isText: boolean): string {
  const safe =
    isText && FORMULA_TRIGGER_CHARS.test(value) ? `'${value}` : value;
  return `"${safe.replace(/"/g, '""')}"`;
}

export function signalsToCsv(signals: Signal[]): string {
  const rows = signals.map((s) => {
    const primaryImpact = s.commodityImpacts?.[0];
    const assets = [
      ...(s.commodityImpacts ?? []).map((c) => c.asset),
      ...(s.currencyPairImpacts ?? []).map((c) => c.asset),
    ];
    return [
      { value: s.eventDate ?? s.createdAt, isText: false },
      { value: s.title, isText: true },
      { value: s.summary, isText: true },
      { value: s.eventType, isText: true },
      { value: primaryImpact?.direction ?? "", isText: true },
      { value: String(s.severity), isText: false },
      { value: String(s.sourcesCount), isText: false },
      { value: assets.join("; "), isText: true },
    ]
      .map(({ value, isText }) => csvField(String(value ?? ""), isText))
      .join(",");
  });
  return [
    CSV_COLUMNS.map((c) => csvField(c, false)).join(","),
    ...rows,
  ].join("\r\n");
}

export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
