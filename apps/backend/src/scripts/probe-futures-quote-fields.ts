import YahooFinance from "yahoo-finance2";

// One-off probe (P-TA-2, 2026-10-10): checks what yf.quote() actually returns
// for the eight live COMMODITY_SYMBOLS futures tickers (price-syncer.ts) —
// specifically marketState, regularMarketTime freshness, and whether Yahoo
// exposes underlyingSymbol/expireDate on a futures quote. Read-only: no DB
// writes, no changes to price-syncer.ts or any asset list.

const SYMBOLS = ["CL=F", "BZ=F", "GC=F", "NG=F", "ZW=F", "HG=F", "SI=F", "ZC=F"];

type Row = {
  symbol: string;
  quoteType: string;
  shortName: string;
  fullExchangeName: string;
  marketState: string;
  regularMarketTime: string;
  minutesOld: string;
  regularMarketPrice: string;
  underlyingSymbol: string;
  expireDate: string;
  error: string;
};

function fmt(value: unknown): string {
  return value === undefined ? "absent" : String(value);
}

function fmtDate(value: unknown): string {
  if (value === undefined || value === null) return "absent";
  const d = value instanceof Date ? value : new Date(value as string | number);
  return Number.isNaN(d.getTime()) ? "absent" : d.toISOString();
}

async function probeSymbol(yf: YahooFinance, symbol: string): Promise<Row> {
  const row: Row = {
    symbol,
    quoteType: "absent",
    shortName: "absent",
    fullExchangeName: "absent",
    marketState: "absent",
    regularMarketTime: "absent",
    minutesOld: "absent",
    regularMarketPrice: "absent",
    underlyingSymbol: "absent",
    expireDate: "absent",
    error: "",
  };

  try {
    const quote: any = await yf.quote(symbol);
    row.quoteType = fmt(quote?.quoteType);
    row.shortName = fmt(quote?.shortName);
    row.fullExchangeName = fmt(quote?.fullExchangeName);
    row.marketState = fmt(quote?.marketState);
    row.regularMarketTime = fmtDate(quote?.regularMarketTime);
    if (quote?.regularMarketTime !== undefined) {
      const t = new Date(quote.regularMarketTime).getTime();
      row.minutesOld = Number.isNaN(t)
        ? "absent"
        : String(Math.round((Date.now() - t) / 60000));
    }
    row.regularMarketPrice = fmt(quote?.regularMarketPrice);
    row.underlyingSymbol = fmt(quote?.underlyingSymbol);
    row.expireDate = fmtDate(quote?.expireDate);
  } catch (err: any) {
    row.error = err?.message ?? String(err);
  }

  return row;
}

function toMarkdownTable(rows: Row[]): string {
  const header =
    "| Symbol | QuoteType | ShortName | Exchange | MarketState | RegularMktTime | MinOld | Price | UnderlyingSymbol | ExpireDate | Error |";
  const sep = "|---|---|---|---|---|---|---|---|---|---|---|";
  const lines = rows.map(
    (r) =>
      `| ${r.symbol} | ${r.quoteType} | ${r.shortName} | ${r.fullExchangeName} | ${r.marketState} | ${r.regularMarketTime} | ${r.minutesOld} | ${r.regularMarketPrice} | ${r.underlyingSymbol} | ${r.expireDate} | ${r.error} |`,
  );
  return [header, sep, ...lines].join("\n");
}

async function main() {
  const now = new Date();
  console.log(`Current UTC time: ${now.toISOString()} (${now.toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" })})`);

  const yf = new YahooFinance();
  const rows: Row[] = [];
  for (const symbol of SYMBOLS) {
    const row = await probeSymbol(yf, symbol);
    rows.push(row);
    console.log(`${symbol}: ${row.error ? `error (${row.error})` : "ok"}`);
  }

  console.log("\n" + toMarkdownTable(rows));
  return rows;
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
