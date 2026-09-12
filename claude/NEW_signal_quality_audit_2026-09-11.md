# Signal quality audit — 2026-09-11

Report-only. No code or database rows were modified. Not committed / not pushed.

**Source:** live Supabase project `evavcgfmemwryggdkjmx`, newest 500 `signals` rows with `created_at > now() - 14 days` (window actually filled in ~9.4 days: 2026-09-01 14:00 UTC → 2026-09-10 23:01 UTC).

**Code read:** `apps/backend/src/services/claude.service.ts` (`classifyEvent`, `heuristicClassify`, `generateAnalysis`) and `apps/backend/src/workers/signal-merge.ts`.

---

## 1. Severity distribution (1–10)

| Score | Count | Share |
|------:|------:|------:|
| 1 | 62 | 12.4% |
| 2 | 105 | 21.0% |
| 3 | 91 | 18.2% |
| 4 | 72 | 14.4% |
| 5 | 14 | 2.8% |
| 6 | 68 | 13.6% |
| 7 | 62 | 12.4% |
| 8 | 23 | 4.6% |
| 9 | 3 | 0.6% |
| 10 | 0 | 0% |

**Bunched, not spread.** Two-thirds of the window (330 / 500 = 66%) sit at 1–4. Score 5 is a hole (14 rows). 8–9 are rare; 10 never appears.

This matches the classifier split. `heuristicClassify` starts at 5 and only moves **up** (6 / 7 / 8 / 9) on keyword hits — it cannot emit 1–4. The 330 low-severity rows are therefore real Claude Haiku classifications, and many of those titles are not geopolitical market events (celebrity Vietnam anecdote, vitamin powder formats, a historical magazine essay). Claude is running, scoring junk low instead of dropping it. The 14 rows at 5 are consistent with heuristic default (no keyword hit) or a cautious Claude mid-score.

---

## 2. Confidence distribution

| Band | Count | Share |
|------|------:|------:|
| 0.00–0.24 | 4 | 0.8% |
| 0.25–0.44 | 29 | 5.8% |
| 0.45–0.64 | 31 | 6.2% |
| 0.65–0.84 | 280 | 56.0% |
| 0.85–1.00 | 156 | 31.2% |
| null / out of range | 0 | 0% |

**Bunched high.** 436 / 500 (87.2%) are ≥ 0.65. Almost no row admits low certainty.

Heuristic confidence is `min(0.9, 0.55 + 0.07 × matchedCategories)`, so it naturally lands in 0.55–0.90. Claude is also returning high confidence on low-severity noise (0.95 on the Rick Springfield and vitamin-powder rows). Confidence is not a useful filter in this window.

---

## 3. `commodity_impacts` fill rate

- Non-empty array: **327 / 500 = 65.4%**
- Empty array: **173 / 500 = 34.6%**
- Null / non-array: 0

About one in three signals has no mapped commodity. That is expected for the low-severity junk Claude is letting through (no allowlisted ticker). The heuristic path only writes impacts when oil / gas / gold / wheat regexes fire; the wheat regex is broad (`grain|wheat|corn|agriculture|food|black sea|crop|shipments?`), so some nonempty arrays on the heuristic path may be over-tagged. Alias-map + allowlist sanitization is in place (USOIL / UKOIL / NGAS / XAUUSD / WHEAT / CORN only).

---

## 4. Near-duplicate estimate

`signal-merge.ts` does **not** compare titles and does **not** use a 48h `created_at` window. Actual gates:

- 8-hour window on `event_date`
- Jaccard ≥ 0.55 on **summaries** (stopword-stripped tokens, length ≥ 3)
- Exact (case-sensitive) `region` match; skip missing / `"global"`
- Skip if both sides have a non-`"Global"` country and they differ

Applied to this 500-row window:

- **26** title-near-duplicate pairs (title Jaccard ≥ 0.55, created within 48h)
- **19** of those are identical titles (Jaccard 1.0)
- **0** pairs pass the current merge gates

So merge is not catching obvious same-story reprints. Main miss reasons among the 26 title pairs: summary Jaccard just under 0.55 (20 pairs — Claude writes a different one-liner for the same headline), outlet stored as `country` (UK vs Ireland vs US on the same tanker strike), freeform region strings (`United States` vs `North America`, `Middle East` vs `Middle East/Yemen`), one `global` pair skipped by design, and a couple just outside the 8h `event_date` window.

These are same-event pairs merge was built to fold and did not. Up to 10 examples:

1. **Stock market closed on Labor Day? 2026 NYSE and Nasdaq schedule** — identical title, three+ rows within minutes. Regions `United States` vs `North America` (exact-match miss). Some already have `sources_count` 2, so merge sometimes worked when region happened to match.
2. **Trump calls Iran conflict "small potatoe" and says it not a war** — identical title, same second, regions `Middle East` vs `Middle East / Global`. A near-variant adding Vance lands at title Jaccard 0.778 and also splits.
3. **Senior U.S. military leaders faced polygraphs in leak probe of weapons stockpiles** — identical title, 0–1.25h apart. `United States` vs `North America`; even the same-region pair fails because summary Jaccard is 0.389–0.500.
4. **What to know about Canada escalating trade war with the U.S.** — identical title, same `North America` + `United States`, event delta 0.75–2h. Summary Jaccard 0.438–0.500 — **just under 0.55**. This is the cleanest “should have merged” miss.
5. **Yemen: Fighting intensifies amid Houthi push in the west** — same title aside from colon spacing, 0.5h apart. Regions `Middle East` vs `Middle East/Yemen`; summary Jaccard 0.300.
6. **Argentina government moves to enforce Falkland Islands oil sanctions** — identical title, same region and country, ~1h apart. Summary Jaccard 0.438.
7. **Canada Responds With Tariffs Amid U.S. Trade Tensions** — identical title, same region and country, 1.5h apart. Summary Jaccard 0.267.
8. **US military hits three Iranian oil tankers after navy ships targeted** — identical title plus a “3 Iranian oil tankers / Navy warships” variant (title Jaccard 0.583). Same `Middle East`; blocked by country (`United Kingdom` / `Ireland` / `United States` — outlet, not event geography) and, on the variant, a 9h event-date gap.
9. **Trump Suggests Renaming Strait Of Hormuz To Trump Strait** vs **Trump suggests renaming Strait of Hormuz after himself** — title Jaccard 0.833, same Middle East / United States, 5.5–7.5h. Summary Jaccard 0.273.
10. **US envoys meet with Putin in new push to end Ukraine war** — identical title, same Eastern Europe / United States, ~2–5h. Summary Jaccard 0.389.

Also present, lower priority: **Trump Calls For Interest Rate Cut** (identical, same US, summary 0.368); **Army Secretary Dan Driscoll Resigns Amid Pentagon Tensions** (US vs North America); **Rick Springfield… NBC Chicago** vs **NBC Bay Area** (same junk story, two affiliates); **Milei declares Falklands are Argentinean** (event delta 8.25h, just outside the 8h gate).

---

## 5. Fifteen real signals across the severity range

No severity-10 rows exist in this window. Samples are the newest row(s) per score.

1. **Sev 1 / conf 0.95** — Rick Springfield recalls killing a man in Vietnam while performing for troops – NBC Chicago. *Rick Springfield recalls Vietnam War experience. No direct financial market impact.*
2. **Sev 1 / conf 0.95** — Oil and powder formats for fat-soluble vitamins. *Pharmaceutical/nutritional product development. No geopolitical or market risk identified.*
3. **Sev 2 / conf 0.65** — Kyrgyzstan will need to develop cold-chain logistics to increase berry exports to China – Ministry of Agriculture. *Kyrgyzstan develops cold-chain logistics for berry exports to China. Minor trade infrastructure development.*
4. **Sev 2 / conf 0.85** — World Trade Center Steel Melted Down For Warship Memorial. *WTC steel repurposed for warship memorial. Symbolic domestic event with minimal direct market impact.*
5. **Sev 3 / conf 0.65** — Nintendo Launches a Major Discount Initiative Thanks to Customs Tariff Refunds, But Only in the United States. *Nintendo US discount initiative from tariff refunds has limited market impact; company-specific rather than systemic.*
6. **Sev 3 / conf 0.45** — How Europe Politically Underdeveloped Africa – Dissent Magazine. *Historical analysis piece on European colonial impact in Africa. Limited immediate market relevance.*
7. **Sev 4 / conf 0.65** — US: Trump promises $5,000 dividend if Republicans win House, Senate. *Trump pledges $5k dividend if Republicans control Congress; fiscal stimulus could boost USD and risk assets.*
8. **Sev 4 / conf 0.60** — Nigeria news: Dangote IPO, free data, DTigress payment. *Dangote IPO and fintech initiatives signal market confidence but limited immediate geopolitical risk impact.*
9. **Sev 5 / conf 0.65** — The Race to Cut Methane Emissions Is Exposing a Global Divide. *Global methane emissions divide creates regulatory uncertainty affecting energy markets and emerging market currencies.*
10. **Sev 6 / conf 0.85** — Oil prices leap to their highest since May and drag Wall Street lower. *Oil prices surge to 4-month highs, triggering equity market selloff amid inflation concerns.*
11. **Sev 6 / conf 0.72** — Guest column: U.S.-China summit will hinge on critical minerals. *U.S.-China summit focused on critical minerals supply chain negotiations signals potential trade policy shifts.*
12. **Sev 7 / conf 0.78** — Yemen Perim Island Gains New Strategic Importance as U.S. and Regional Tensions Rise. *Perim Island strategic tensions elevate Red Sea geopolitical risk, threatening oil transit and regional stability.*
13. **Sev 7 / conf 0.85** — Tanker Struck by Projectile off Al Faw | Iraq Business News. *Tanker struck by projectile off Al Faw, Iraq. Escalating maritime security risks in Persian Gulf shipping lanes.*
14. **Sev 8 / conf 0.85** — European Central Bank raises interest rates a quarter point to quell inflation as Iran war drives oil prices higher. *ECB rate hike amid Iran conflict drives oil spike, EUR weakness, safe-haven demand.*
15. **Sev 9 / conf 0.85** — Oil prices climb over $100 per barrel as US war in Iran continues. *US-Iran conflict escalates oil prices above $100/bbl, triggering risk-off sentiment and safe-haven demand.*

(Extra at the top of the range, not counted in the 15: **Sev 9 / conf 0.92** — Families grieve in the ruins of an Iranian school where a US strike killed dozens of children.)

Low-severity copy often says “no market impact” / “limited relevance” and still becomes a `signals` row. High-severity copy is on-brief (Hormuz / Iran / tankers / oil). `generateAnalysis` was not in this SELECT; its live path is Sonnet with a generic template fallback and a hard no-buy/sell rule.

---

## Implications (not a change proposal)

- Ingest is classifying almost everything Claude can parse, including entertainment, memorials, and magazine essays. Severity 1–4 is the junk bucket, not a calibrated low-impact geopolitical scale.
- Confidence is saturated; it will not separate noise from signal in the UI.
- Merge is failing on the exact same-story reprints it was tuned for, because it compares Claude summaries (which vary) and freeform region / outlet-as-country strings (which vary), not titles.
- `commodity_impacts` empty on ~35% is mostly the junk cohort; the fill rate on severity ≥ 6 is the number that matters for traders and was not separately computed here.
