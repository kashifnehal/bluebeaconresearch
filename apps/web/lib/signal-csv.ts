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

function csvField(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

export function signalsToCsv(signals: Signal[]): string {
  const rows = signals.map((s) => {
    const primaryImpact = s.commodityImpacts?.[0];
    const assets = [
      ...(s.commodityImpacts ?? []).map((c) => c.asset),
      ...(s.currencyPairImpacts ?? []).map((c) => c.asset),
    ];
    return [
      s.eventDate ?? s.createdAt,
      s.title,
      s.summary,
      s.eventType,
      primaryImpact?.direction ?? "",
      String(s.severity),
      String(s.sourcesCount),
      assets.join("; "),
    ]
      .map((v) => csvField(String(v ?? "")))
      .join(",");
  });
  return [CSV_COLUMNS.map(csvField).join(","), ...rows].join("\r\n");
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
