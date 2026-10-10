import YahooFinance from "yahoo-finance2";

// One-off probe (2026-10-10): checks which commodity futures tickers actually
// resolve on Yahoo Finance before any are added to a real asset list. Read-only:
// no DB writes, no changes to COMMODITY_SYMBOLS/YAHOO_TICKERS. See
// docs/claude_project/probe-yahoo-tickers-2026-10-10.md for the result table.
// NOTE: licensing for a paid product has not been checked for any of these symbols.

const CONTROL_SYMBOLS = ["CL=F", "NG=F"];

const CANDIDATE_SYMBOLS = [
  "TTF=F",
  "RB=F",
  "HO=F",
  "SB=F",
  "ZS=F",
  "ZL=F",
  "KC=F",
  "CC=F",
  "CT=F",
  "ALI=F",
  "PL=F",
  "PA=F",
  "LE=F",
  "HE=F",
  "GF=F",
  "LBR=F",
  "ZO=F",
  "ZR=F",
];

const ALL_SYMBOLS = [...CONTROL_SYMBOLS, ...CANDIDATE_SYMBOLS];

type Row = {
  symbol: string;
  status: "ok" | "error";
  name: string;
  quoteType: string;
  exchange: string;
  currency: string;
  marketState: string;
  regularMarketPrice: string;
  regularMarketTime: string;
  rowCount: string;
  firstDate: string;
  lastDate: string;
  gapsOver5d: string;
  error: string;
};

function fiveYearsAgo(): Date {
  const d = new Date();
  d.setFullYear(d.getFullYear() - 5);
  return d;
}

function countGapsOver5Days(timestamps: number[]): number {
  let gaps = 0;
  for (let i = 1; i < timestamps.length; i++) {
    const diffDays = (timestamps[i] - timestamps[i - 1]) / (1000 * 60 * 60 * 24);
    if (diffDays > 5) gaps++;
  }
  return gaps;
}

async function probeSymbol(yf: YahooFinance, symbol: string): Promise<Row> {
  const row: Row = {
    symbol,
    status: "ok",
    name: "",
    quoteType: "",
    exchange: "",
    currency: "",
    marketState: "",
    regularMarketPrice: "",
    regularMarketTime: "",
    rowCount: "",
    firstDate: "",
    lastDate: "",
    gapsOver5d: "",
    error: "",
  };

  try {
    const quote: any = await yf.quote(symbol);
    row.name = quote?.shortName ?? quote?.longName ?? "";
    row.quoteType = quote?.quoteType ?? "";
    row.exchange = quote?.exchange ?? "";
    row.currency = quote?.currency ?? "";
    row.marketState = quote?.marketState ?? "";
    row.regularMarketPrice =
      quote?.regularMarketPrice !== undefined ? String(quote.regularMarketPrice) : "";
    row.regularMarketTime = quote?.regularMarketTime
      ? new Date(quote.regularMarketTime).toISOString()
      : "";
  } catch (err: any) {
    row.status = "error";
    row.error = `quote: ${err?.message ?? String(err)}`;
  }

  try {
    const chart: any = await yf.chart(symbol, {
      period1: fiveYearsAgo(),
      interval: "1d",
    });
    const quotes = chart?.quotes ?? [];
    row.rowCount = String(quotes.length);
    if (quotes.length > 0) {
      const timestamps: number[] = quotes
        .map((q: any) => (q?.date ? new Date(q.date).getTime() : NaN))
        .filter((t: number) => Number.isFinite(t));
      row.firstDate = timestamps[0] ? new Date(timestamps[0]).toISOString().slice(0, 10) : "";
      row.lastDate = timestamps[timestamps.length - 1]
        ? new Date(timestamps[timestamps.length - 1]).toISOString().slice(0, 10)
        : "";
      row.gapsOver5d = String(countGapsOver5Days(timestamps));
    }
  } catch (err: any) {
    row.status = "error";
    row.error = row.error ? `${row.error}; chart: ${err?.message ?? String(err)}` : `chart: ${err?.message ?? String(err)}`;
  }

  return row;
}

function toMarkdownTable(rows: Row[]): string {
  const header =
    "| Symbol | Name | Quote Type | Exchange | Currency | Market State | Regular Mkt Price | Regular Mkt Time | Daily Rows | First Date | Last Date | Gaps >5d | Error |";
  const sep =
    "|---|---|---|---|---|---|---|---|---|---|---|---|---|";
  const lines = rows.map(
    (r) =>
      `| ${r.symbol} | ${r.name} | ${r.quoteType} | ${r.exchange} | ${r.currency} | ${r.marketState} | ${r.regularMarketPrice} | ${r.regularMarketTime} | ${r.rowCount} | ${r.firstDate} | ${r.lastDate} | ${r.gapsOver5d} | ${r.error} |`
  );
  return [header, sep, ...lines].join("\n");
}

async function main() {
  const yf = new YahooFinance();
  const rows: Row[] = [];

  for (const symbol of ALL_SYMBOLS) {
    const row = await probeSymbol(yf, symbol);
    rows.push(row);
    // eslint-disable-next-line no-console
    console.log(`${symbol}: ${row.status}${row.error ? ` (${row.error})` : ""}`);
  }

  const table = toMarkdownTable(rows);
  console.log("\n" + table);

  const working = rows.filter((r) => r.status === "ok").map((r) => r.symbol);
  const failing = rows.filter((r) => r.status === "error").map((r) => r.symbol);

  console.log(`\nWorking (${working.length}): ${working.join(", ")}`);
  console.log(`Failing (${failing.length}): ${failing.join(", ")}`);
  console.log("\nNote: licensing for a paid product not checked.");

  return { rows, table, working, failing };
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
