/** One combined status line (TASK UI-ALL PART 6b) replacing three separately
 * stacked <p> lines under the dashboard's feed header — same text, fonts,
 * colours and data-testid values as before, just joined with " · " instead
 * of each starting on its own row. */
export function StatusLine({
  dataAsOf,
  coverageLine,
  windowExpandedLine,
}: {
  dataAsOf: string | null;
  coverageLine: string | null;
  windowExpandedLine: string | null;
}) {
  const parts: {
    testId: string;
    text: string;
    fontFamily: string;
    suppressHydrationWarning?: boolean;
  }[] = [];
  if (dataAsOf) {
    parts.push({
      testId: "data-as-of",
      text: dataAsOf,
      fontFamily: "'JetBrains Mono', monospace",
      suppressHydrationWarning: true,
    });
  }
  if (coverageLine) {
    parts.push({ testId: "coverage-line", text: coverageLine, fontFamily: "'Inter', sans-serif" });
  }
  if (windowExpandedLine) {
    parts.push({
      testId: "window-expanded-line",
      text: windowExpandedLine,
      fontFamily: "'Inter', sans-serif",
    });
  }

  if (parts.length === 0) return null;

  return (
    <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] md:text-[11px]">
      {parts.map((part, i) => (
        <span key={part.testId}>
          {i > 0 ? <span aria-hidden="true"> · </span> : null}
          <span
            data-testid={part.testId}
            style={{ color: "var(--text-muted)", fontFamily: part.fontFamily }}
            suppressHydrationWarning={part.suppressHydrationWarning}
          >
            {part.text}
          </span>
        </span>
      ))}
    </p>
  );
}
