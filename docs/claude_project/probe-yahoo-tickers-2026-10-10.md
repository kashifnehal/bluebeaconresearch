# Yahoo Finance ticker probe — 2026-10-10

Read-only probe run via `apps/backend/src/scripts/probe-yahoo-tickers.ts`
(`npx tsx src/scripts/probe-yahoo-tickers.ts` from `apps/backend`). Reuses the
same `yahoo-finance2` client setup as `apps/backend/src/workers/price-syncer.ts`
(`new YahooFinance()`, no custom options). No database writes. No existing
ticker list (`COMMODITY_SYMBOLS`, `FOREX_SYMBOLS`, `YAHOO_TICKERS`) was changed.

Control symbols: `CL=F` (WTI Crude), `NG=F` (Natural Gas) — both already live
in `COMMODITY_SYMBOLS`, included to confirm the probe itself works.

All candidate symbols below were **unverified, from memory** per the task —
sourced from Reddit threads / catalogue tranche T3, not from Yahoo's own
symbol lookup. Symbols that failed are reported as-is; no alternative symbols
were guessed.

**Licensing for a paid product has not been checked for any of these
symbols.**

## Results

| Symbol | Name | Quote Type | Exchange | Currency | Market State | Regular Mkt Price | Regular Mkt Time (UTC) | Daily Rows | First Date | Last Date | Gaps >5d | Error |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| CL=F | Crude Oil Nov 26 | FUTURE | NYM | USD | CLOSED | 91.85 | 2026-10-09T20:59:58Z | 1260 | 2021-10-11 | 2026-10-09 | 0 | |
| NG=F | Natural Gas Nov 26 | FUTURE | NYM | USD | CLOSED | 3.22 | 2026-10-09T21:00:00Z | 1260 | 2021-10-11 | 2026-10-09 | 0 | |
| TTF=F | Dutch TTF Natural Gas Calendar | FUTURE | NYM | EUR | CLOSED | 81.434 | 2026-10-09T15:03:21Z | 1260 | 2021-10-11 | 2026-10-09 | 0 | |
| RB=F | RBOB Gasoline Nov 26 | FUTURE | NYM | USD | CLOSED | 3.1534 | 2026-10-09T20:59:57Z | 1260 | 2021-10-11 | 2026-10-09 | 0 | |
| HO=F | Heating Oil Nov 26 | FUTURE | NYM | USD | CLOSED | 4.7384 | 2026-10-09T20:59:58Z | 1260 | 2021-10-11 | 2026-10-09 | 0 | |
| SB=F | — | — | — | — | — | — | — | 1520 | 2021-10-11 | 2026-10-09 | 0 | `quote: Failed Yahoo Schema validation` |
| ZS=F | Soybean Futures,Nov-2026 | FUTURE | CBT | USX | CLOSED | 1292 | 2026-10-09T18:19:59Z | 1260 | 2021-10-11 | 2026-10-09 | 0 | |
| ZL=F | Soybean Oil Futures,Dec-2026 | FUTURE | CBT | USX | CLOSED | 68.02 | 2026-10-09T18:19:59Z | 1260 | 2021-10-11 | 2026-10-09 | 0 | |
| KC=F | Coffee Dec 26 | FUTURE | NYB | USX | CLOSED | 285.15 | 2026-10-09T17:29:58Z | 1260 | 2021-10-11 | 2026-10-09 | 0 | |
| CC=F | Cocoa Dec 26 | FUTURE | NYB | USD | CLOSED | 5671 | 2026-10-09T17:29:55Z | 1260 | 2021-10-11 | 2026-10-09 | 0 | |
| CT=F | — | — | — | — | — | — | — | 1520 | 2021-10-11 | 2026-10-09 | 0 | `quote: Failed Yahoo Schema validation` |
| ALI=F | Aluminum Futures,Dec-2026 | FUTURE | CMX | USD | CLOSED | 3185 | 2026-10-09T20:00:13Z | 1260 | 2021-10-11 | 2026-10-09 | 0 | |
| PL=F | Platinum Jan 27 | FUTURE | NYM | USD | CLOSED | 1693.3 | 2026-10-09T20:59:56Z | 1260 | 2021-10-11 | 2026-10-09 | 0 | |
| PA=F | Palladium Dec 26 | FUTURE | NYM | USD | CLOSED | 1150.4 | 2026-10-09T20:59:55Z | 1260 | 2021-10-11 | 2026-10-09 | 0 | |
| LE=F | Live Cattle Futures,Dec-2026 | FUTURE | CME | USX | CLOSED | 227.05 | 2026-10-09T18:04:55Z | 1260 | 2021-10-11 | 2026-10-09 | 0 | |
| HE=F | Lean Hog Futures,Dec-2026 | FUTURE | CME | USX | CLOSED | 67.825 | 2026-10-09T18:04:59Z | 1260 | 2021-10-11 | 2026-10-09 | 0 | |
| GF=F | Feeder Cattle Futures,Nov-2026 | FUTURE | CME | USX | CLOSED | 341.95 | 2026-10-09T18:04:56Z | 1260 | 2021-10-11 | 2026-10-09 | 0 | |
| LBR=F | Lumber Futures,Nov-2026 | FUTURE | CME | USD | CLOSED | 533 | 2026-10-09T20:04:59Z | 1054 | 2022-08-05 | 2026-10-09 | 0 | |
| ZO=F | Oat Futures,Dec-2026 | FUTURE | CBT | USX | CLOSED | 420.75 | 2026-10-09T18:19:55Z | 1260 | 2021-10-11 | 2026-10-09 | 0 | |
| ZR=F | Rough Rice Futures,Nov-2026 | FUTURE | CBT | USD | CLOSED | 16.94 | 2026-10-09T18:19:58Z | 1260 | 2021-10-11 | 2026-10-09 | 0 | |

## Summary

- **Fully working (18):** `CL=F`, `NG=F`, `TTF=F`, `RB=F`, `HO=F`, `ZS=F`, `ZL=F`, `KC=F`, `CC=F`, `ALI=F`, `PL=F`, `PA=F`, `LE=F`, `HE=F`, `GF=F`, `LBR=F`, `ZO=F`, `ZR=F` — `yf.quote()` and `yf.chart()` both returned clean data, 0 gaps over 5 days, ~5 years of daily rows (`LBR=F` only goes back to 2022-08-05 — shorter listing history, not a gap).
- **Partially failing (2):** `SB=F` (Sugar #11) and `CT=F` (Cotton #2) — `yf.quote()` throws `Failed Yahoo Schema validation` (library-side issue in `yahoo-finance2@4.0.0`, a known/flagged behavior for some futures responses; library has a newer `4.0.3` available but was not upgraded as part of this probe, per "do not change any existing list / do not add any asset"). `yf.chart()` **did** succeed for both (1520 daily rows, 2021-10-11 to 2026-10-09, 0 gaps), so historical data is retrievable even though the live quote call currently is not.
- No symbol failed outright (both quote and chart).
- **Licensing for a paid product not checked.**
