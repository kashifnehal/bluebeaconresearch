# #139 — Signal ingestion, filter, and severity/confidence audit

**Date:** 2026-09-13  
**Status:** Research findings. Not a build spec. No Cursor prompt. Awaiting founder review.  
**Ticket:** #139 (`docs/claude_project/09_BACKLOG.md`, `docs/brain/LIVE_TODO.md`)  
**Live DB:** `evavcgfmemwryggdkjmx`, queried 2026-09-13. Window unless noted: `signals.created_at` last 14 days = **684 rows** (2026-08-29 21:13 UTC → 2026-09-12 20:00 UTC).

**What this is not.** The kickoff asked to start from `claude/84_LIVE_TRUST_BUGS_AND_COPY_LOGIC_AUDIT_PLAN.md` Part 4. That file is not in this repo (it lives in the other session’s `claude/` tree). The founder’s three-part framing was taken from the kickoff paste itself. A prior read-only slice of the same problem is `claude/NEW_signal_quality_audit_2026-09-11.md` (#115 follow-through). This doc supersedes that slice: it traces the live code path, not just distributions, and answers the “what news do we want / what should the UI be allowed to claim” questions.

**How this was verified.** Code read in `apps/backend` collectors, `relevance-filter.ts`, `claude.service.ts`, `signal-merge.ts`, `title-prefilter.ts`, `signal-generator.ts`; UI gates in `apps/web/lib/signal-display.ts`, `SeverityBadge`, dashboard, event page, ProductTour. Live SQL on `signals` / `raw_events`. Filter replayed against constructed should-matter headlines **and** today’s BBC World / Guardian World / Al Jazeera / BBC Business RSS. GDELT live fetch was rate-limited (`Please limit requests to one every 5 seconds`); not treated as evidence.

---

## Verdict (read this first)

The pipeline is not “a bit noisy.” It is two different products glued together.

1. **A keyword hose** that pulls almost any English headline containing `war`, `oil`, `market`, `trade`, `military`, `drone`, `china`, `fund`, etc., then **classifies every survivor** into a `signals` row. There is no “this does not mean anything — drop it” step after classification. Claude’s own one-liner often says “no market impact” and the row still lands in the Intelligence Feed at severity 1–4 with 85–95% confidence.

2. **A real geopolitical/energy desk** that, when the story is actually a pipeline attack, a Houthi/Hormuz move, or a Ukraine strike, produces on-brief severity 7–9, filled `commodity_impacts`, and a Sonnet briefing. That path works. It is a minority of the table: **122 / 684 (17.8%) are severity ≥ 7**. **431 / 684 (63%) are severity 1–4** — the junk bucket.

The founder’s instruction (“we can expand filters a bit, but each news that is coming should mean something”) is the opposite of today’s default. Expanding the keyword list without a **post-classify reject** will make the feed worse. The thing that is genuinely wrong is not a missing synonym. It is that **meaning is never required**.

The docs that describe how severity is supposed to work (`docs/claude_project/17_SIGNAL_ENGINE.md` multi-factor Goldstein / source-count / chokepoint / actor rules; `18_AI_ENGINE.md` classification prompt with SEVERITY RULES and CONFIDENCE RULES) **are not the code that runs**. Goldstein is not referenced anywhere under `apps/backend`. The live Haiku prompt is a JSON schema with no rubric, and it does not even receive the article summary.

The founder said they will rebuild pipeline pieces if research shows they are wrong. This research says: **rebuild the classify-and-keep contract; do not just patch the UI again.** #137 was the right display patch for a flat price. It did not fix why a diplomatic solidarity note, a Fed calendar preview, or a 9/11 memoir can still occupy the same surfaces as a Saudi pipeline fire.

---

## Part 1 — What news BBR ingests today, and why

### 1.1 What the product says it wants

`21_PROJECT_BRIEFING.md` / `01_PRODUCT.md`: convert **conflicts, sanctions, policy shifts** into structured market signals for commodity traders, import/export SMBs, and boutique fund analysts. Informational only — no buy/sell. Coverage the map/product copy already names and the classifier **cannot currently represent as first-class impacts**: cyber, COPPER (priced and on the watchlist; stripped from the classifier allowlist), chokepoints (Hormuz / Suez / Bab-el-Mandeb / Malacca / Black Sea — `shipping_proximity` column exists, **nothing writes it**).

The founder’s #139 bar, in their words: do not restrict users to a narrow news genre; if it has impact and it is important, it should get in; **but every row that gets in should mean something.**

### 1.2 What actually runs (verified)

```
RSS (13 feeds, 4h age) / GNews (1 query) / GDELT (1 query, English)
        → isRelevantEvent()          ← ONLY keep/drop gate
        → raw_events insert
        → tryTitlePreFilterSkip()    ← exact same title + same source, 45 min
        → classifyEvent()            ← ALWAYS returns a ClassificationResult
        → insertOrMergeSignal()      ← ALWAYS writes or folds a signals row
        → if severity ≥ 7: Sonnet briefing
        → dispatchAlertsForSignal()  ← every NEW signal, any severity
```

ACLED is wired and skipped when credentials are missing (0 `raw_events` with `source='acled'` in the 14-day window). The dormant BullMQ `ai-classifier` worker is **not** on this path; collectors classify inline.

| Source | Query / window | Filter tier | Notes |
|---|---|---|---|
| RSS world (6) | Full feed, **drop if older than 4 hours** | exclude + keyword | BBC, Al Jazeera, NPR, France24, DW, Guardian World. UN News removed 2026-08-28. |
| RSS finance (7) | Same 4h window | **exclude only** | BBC/Guardian/NYT Business, MarketWatch, WSJ Markets, Investing.com, OilPrice. Almost everything that is not sports/celebrity becomes a signal. |
| GNews | `conflict OR war OR sanctions OR oil OR stock market OR trade OR inflation OR fed OR earnings OR futures` | world (title+summary) | No 4h age cap. Free tier, 10 articles/run. `source` stored as `newsapi`. |
| GDELT | Same idea + `sourcelang:eng`, 50 records | world (**title only**) | No 4h age cap. Country field is **outlet country**, not event geography. |
| ACLED | n/a | none | Not configured. |

**14-day raw vs signal:** 730 `raw_events` (620 GDELT / 110 `newsapi` / 0 ACLED) → 684 `signals` → **0 orphans**. The 46-row gap is title-prefilter folds and merge-into-existing, not rejects. **If it passed the keyword gate, it is in the product.**

Filtered titles are **never stored and never logged** (only a `filtered++` counter). There is no table of “what we threw away.” Exclusion evidence below is therefore reconstructed: live RSS replay + constructed should-matter headlines run through the same `isRelevantEvent()`.

### 1.3 The keep/drop rules, and whether each has a real reason

**Hard exclude (`shouldExclude`) — word-boundary as of `b0783ab`.** Sports, celebrity, lifestyle, a few false-positive phrases (`star wars`, `oil painting`, `farmers market`, `trade deadline`, `military history`, `net worth`), plus **any headline containing a year 1970–2005**.

- Real reason: 2026-08-25 production false positives (NFL substring killing “inflation”, `dow` matching “Down”, etc.).
- Artifact that now hurts: the year list is a blunt archive filter. Constructed test: **“Iran nuclear talks compared to 2003 invasion” → DROP (`excl=true`)**. A current story that mentions a historical year dies.

**World-tier include (`matchesKeywords`).** Three piles:

- Exact-word: `war`, `oil`, `gas`, `fed`, `gold`, `bomb`, `coup`, …
- Geopolitical phrases/substrings: `conflict`, `military`, `sanction`, `iran`, `russia`, `ukraine`, `taiwan`, `israel`, `hamas`, `houthi`, `china`, `tanker`, `hormuz`, `red sea`, `drone`, `pipeline`, …
- Market phrases/substrings: `market`, `trade`, `trading`, `growth`, `credit`, `fund`, `investment`, `regulation`, `lawsuit`, `ceo`, `earnings`, `inflation`, …

Real reason for the *existence* of a keyword gate: cost + noise control after GDELT/GNews queries that already contain `earnings` / `stock market` / `fed`.  
Artifact: **bare `market` / `trade` / `war` / `drone` / `military` / `fund` / `china`**. Those are why a Christmas market, a meat market, a Cowboys “trade,” a Kate Atkinson “war correspondent” novel, a municipal “funding” vote, and a 9/11 drone-display recreation become signals. Substring `includes()` (not word-boundary) on the phrase lists is why **“World Trade Center” matches `trade`**.

**Finance-tier include.** If it is not sports/celebrity, it stays. Live replay **2026-09-13: BBC Business 56 titles, 56 kept, 0 dropped.** Ryanair jokes, skimpflation mackerel, Alstom trains, “high-fare rapists” remarks — all would become `raw_events` and then signals. This is the original “finance feeds are already on-topic” shortcut. It is not a meaning test.

**Not a filter, but a silent exclude:** RSS older than 4 hours. Deliberate freshness rule. Side effect: a story that matters but is first seen on a slow feed after 4h never enters via RSS (GNews/GDELT can still catch it, later and without the same age cap).

### 1.4 Included but should not have been (live rows)

Newest severity ≤ 3, all `classification_method='claude'`, all still in the feed:

| Sev / conf | Title | Why it got in |
|---|---|---|
| 1 / 0.95 | Christmas village and market stalls selling festive food | `market` |
| 1 / 0.95 | Kate Atkinson new postwar novel *Our Noble Selves* | `war` (war correspondent / postwar) |
| 1 / 0.95 | Dallas Cowboys player … **trade** an all-time great | `trade` (sports; `trade deadline` is excluded, bare `trade` is not) |
| 1 / 0.95 | Jaipur: debt … killing of wife, three daughters | `debt` via `debt ceiling`? or `credit` — local crime |
| 1 / 0.95 | Havana vintage **market** | `market` |
| 1 / 0.95 | Johnston **meat market** … Tallahassee | `market`; heuristic-style wheat/corn tags at 0.30 even on Claude |
| 1 / 0.95 | Sequim council … 2027 municipal **funding** | `fund` |
| 2 / 0.85 | 10 Best Zero-Fee Crypto Exchanges … **Trading** | `trading` |
| 2 / 0.95 | World Trade Center beams … 9/11 memorial | `trade` inside “World Trade Center” |
| 2 / 0.65 | Ontario **gas** prices rise 8 cents Saturday | `gas` — retail pump, tagged USOIL |

Claude’s own summaries on these rows say “no geopolitical or financial market implications.” The pipeline has no action for that sentence.

**High-severity junk that still occupies the loud UI** (heuristic, before the 2026-09-12 cap — rows still live):

| Sev / conf | Title | Trigger |
|---|---|---|
| 9 / 0.76 | 9/11 in the Navy: I went to war, but never got off the boat | `war` → heuristic 9; briefing is the generic template |
| 9 / 0.76 | Spectre Lighting boosts united kingdom **stock** | `stock` + war-tier? template briefing |
| 8 / 0.76 | Public comment … $1.1B **military** radar sites in Oregon | `military` → 8; cited in `heuristicClassify` comments |
| 8 / 0.76 | Limerock Speedway to celebrate first responders, **military** personnel | `military` |

Dashboard featured-card rule is `severity >= 8 || first row`. Any of those 8s can become the hero with the label **“PRIORITY: CRITICAL”** (the named Critical label in `SEVERITY_CONFIG` is score **10**, which has **never** appeared in this window).

**On-brief high-severity (the desk that works):** “East-West Oil Pipeline Offline After Attacks…”, “Houthi Grip on Bab al-Mandab…”, “Deadly Russian strikes hit Ukraine after Putin warning…”, “Oil prices climb over $100… as US war in Iran continues.” These are the product. They are not the typical row.

### 1.5 Excluded but arguably matters

Cannot read “recently excluded” from the DB. Two reconstructions.

**A. Constructed headlines the founder’s bar would want, run through today’s `isRelevantEvent(..., 'world')`:**

| Headline | Result | Why |
|---|---|---|
| Chile nationalizes lithium industry, threatening EV battery supply | **DROP** | no lithium / rare-earth / battery token |
| Panama Canal drought restricts daily transits for third month | **DROP** | Suez/Hormuz/Red Sea are listed; Panama is not |
| US presidential election results too close to call | **DROP** | `election` is a heuristic *severity* word, **not** a filter word |
| Port workers strike shuts Houston ship channel | **DROP** | `strike` is heuristic-only; no port/labor token |
| Major ransomware attack disrupts US port terminals | **DROP** | no cyber / ransomware token |
| Rare earth export controls expanded by Beijing | **DROP** | `china` is a keyword; “Beijing” is not. Country synonym gap |
| Australian coal export ban considered after mine disaster | **DROP** | coal / thermal energy not in list |
| Wildfire forces evacuation of Los Angeles suburbs | **DROP** | climate/disaster without an oil/wheat word |
| Iran nuclear talks compared to 2003 invasion | **DROP (exclude)** | year 2003 |
| Bank of Japan surprises markets with emergency rate hike | KEEP | `market` + `rate hike` |
| Category 5 hurricane shuts US Gulf Coast oil platforms | KEEP | `oil` |
| Colonial Pipeline cyberattack halts fuel shipments | KEEP | `pipeline` (cyber itself is not why) |
| Suez Canal blockage eases after grounded vessel is refloated | KEEP | `suez` |

**B. Live RSS, 2026-09-13 (titles only, same function the collectors call):**

BBC World: **25 fetched → 7 keep / 18 drop.** Drops that fail the “if it has impact, it should get in” test:

- Bulgaria investigates fire at a **weapons site** the owner calls **sabotage** (no `military`/`explosion`/`sanction` hit)
- DR Congo’s worst **Ebola** epidemic (Al Jazeera; pandemic/health not in the list)
- US court rejects Trump order keeping a Michigan **coal** plant open
- French officials investigate a possible malicious **train derailment**
- Record **heatwaves** in France (ag/climate, no wheat/oil word)
- Ecuadorian crime gang designated a **terrorist** group by the US (Guardian)
- Philippines **ferry** fire death toll (maritime disaster; `maritime`/`tanker` not in the title)
- Gaza genocide documentary wins Venice prize — **“Gaza” is not a keyword** (israel/hamas/houthi are). Current war coverage that says “Gaza” and not those tokens is invisible to world-tier.

Keeps that should not have survived: “Five minutes to steal a Renoir…” (Europe + theft — likely a phrase-list hit); “Drone display recreates the Twin Towers…” (`drone`); “$15m **fund** … to end FGM” (`fund`); “Uganda to withdraw from Invictus Games … **military** chief”; “Selling the **war**: Purges, polygraphs and propaganda.”

Al Jazeera sports (US Open, Chelsea, India vs Sri Lanka) mostly dropped — exclude/keyword doing its job. Gaza documentary dropped for the wrong reason (no `gaza` token), not because it was a film (`film`/`movie` would have excluded it too).

**Boundary that is a real reason, not an artifact:** English-only GDELT (`sourcelang:eng` + language field). Product is English-first.  
**Boundary that is an artifact:** “Gaza” / “Beijing” / “Panama” / “lithium” / “cyber” / “election” / “coal” missing while “market” / “trade” / “drone” / “funding” are present. That is list accretion, not a coverage philosophy.

---

## Part 2 — How severity and confidence are actually assigned

### 2.1 End-to-end map (live path, not the docs)

```
raw_event { title, summary?, country?, event_type='news', event_date }
        │
        ├─ Claude path (if ANTHROPIC_API_KEY + ingestion budget open)
        │     INPUTS ACTUALLY SENT:
        │       title, country (often null), event_type ("news"), event_date
        │       ★ article summary is computed and then NOT sent
        │     PROMPT: "Classify this news event for financial market impact."
        │             + JSON schema. No 1–10 rubric. No confidence rubric.
        │             No "return empty / reject if no market mechanism."
        │     OUTPUT: parsed JSON as-is. commodity/forex arrays sanitized
        │             to allowlists. severity/confidence NOT clamped.
        │     method = 'claude'
        │
        └─ Heuristic path (no key, budget closed, or API error)
              INPUTS: title + summary, lowercased, regex buckets
              severity: start 5; war/invasion/nuclear/… → 9;
                        sanction/military/opec → 8;
                        tariff/tanker/strike/protest → 7;
                        tension/talks/election → 6;
                        then Math.min(severity, 6)   ← cap shipped 2026-09-12
              confidence: 0.55 + 0.07 × (sev>5, region≠global,
                          >1 commodity, isBreaking, rawEvent.country)
                          → 0.55–0.90
              commodities: oil/gas/wheat/gold regexes, direction almost always "up"
              wheat regex includes `food` and `shipments?` (over-tag)
              method = 'heuristic'
        │
        ▼
insertOrMergeSignal()
  severity/confidence written once from this classification
  merge: exact region, not "global", 8h event_date window,
         Jaccard ≥ 0.55 on **summaries** (not titles)
  duplicate: sources_count++, no rewrite of severity/impacts
  escalation: severity raised; briefing regen if new sev ≥ 7
  title-prefilter (earlier): same-source exact title, 45 min,
         also ++sources_count  ← a refetch is counted as another "source"
```

**What the planning docs say that the code does not do**

| Documented (`17_SIGNAL_ENGINE` / `18_AI_ENGINE`) | Live code |
|---|---|
| Goldstein scale from GDELT as base severity | GDELT DOC API only. No Goldstein field. Zero references in `apps/backend`. |
| Source-count +0.5 / +1.0 to severity | `sources_count` is a merge/refetch counter, not an input to scoring |
| Chokepoint proximity +0.5 / +1 | `shipping_proximity` column unused |
| Actor / sanctions-list +0.5 | `sanctions_matches` column unused |
| Hard floors (tanker attack ≥ 8, etc.) | Not implemented |
| Classification prompt with SEVERITY RULES 10…1 and CONFIDENCE RULES 0.85–1.0 = confirmed infrastructure attack | Live prompt is schema-only |
| Event type enum (conflict / sanctions / …) | Collectors hardcode `event_type: "news"` |
| Confidence = certainty of the **commodity impact** | Claude: undefined “certainty.” Heuristic: how many regex buckets fired |

The dormant `ai-classifier.ts` worker **does** have a Zod schema (`severity` 1–10, `confidence` 0–1). The live collector path never uses it.

### 2.2 Live distributions (14 days, n=684)

**Severity**

| Score | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 |
|------:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|
| Count | 87 | 136 | 117 | 91 | 31 | 100 | 79 | 38 | 5 | 0 |
| Share | 12.7% | 19.9% | 17.1% | 13.3% | 4.5% | 14.6% | 11.5% | 5.6% | 0.7% | 0% |

Same shape as the Sep 11 500-row audit: bunched 1–4, a hole at 5, a pile at 6 (heuristic default + cap), a useful tail at 7–8, almost no 9, no 10. Two-thirds of the product is below the “Elevated” badge.

**Confidence**

| Band | 0–0.24 | 0.25–0.44 | 0.45–0.64 | 0.65–0.84 | 0.85–1.00 |
|------|------:|------:|------:|------:|------:|
| Count | 4 | 39 | 58 | 374 | 209 |
| Share | 0.6% | 5.7% | 8.5% | 54.7% | 30.6% |

**85.2% ≥ 0.65.** Christmas market, Jaipur crime, and a Saudi pipeline fire can all show “95% / 85% confidence.” The number does not separate them.

**`classification_method`** (column added ~2026-09-12): 607 null (legacy) / 45 `claude` / 32 `heuristic`. Among tagged rows, Claude is what is producing both the junk 1–3s **and** the good 7–8s. Heuristic is now capped at 6 going forward; pre-cap 8–9 heuristic rows remain in the table and still have generic template briefings.

**Commodity impacts**

| Severity | Rows | Empty impacts |
|---|---:|---:|
| 1 | 87 | 84 (97%) |
| 2 | 136 | 95 (70%) |
| 3 | 117 | 36 (31%) |
| 4–6 | 222 | 21 (9%) |
| 7 | 79 | **0** |
| 8 | 38 | 2 |
| 9 | 5 | 2 (the memoir / lighting false 9s) |

Empty impacts at 1–2 is Claude correctly saying “nothing to tag” and then **still inserting the row**. At 7+ the fill rate is the number that matters for traders, and it is high — except the heuristic false 9s.

**Sources:** 655 / 684 (95.8%) have `sources_count = 1`. Merge is not doing its job. The Sep 11 title-pair backtest (0/26 near-duplicates cleared the gates) still matches the code: summaries differ, regions are freeform (`Middle East` vs `Middle East/Yemen` vs `middle-east`), outlet country is treated as event country.

**Briefings:** 122 / 122 severity ≥ 7 have non-null `ai_analysis`. That includes the template paragraph (“Market volatility expected across impacted commodity benchmarks (Energy/Metals)”) on the memoir / radar / speedway rows — so “has a briefing” ≠ “has a real briefing.”

### 2.3 Why each piece lives where it does

- **Keyword filter in the collector, before `raw_events`:** cost. Haiku on every GDELT hit was estimated at hundreds of dollars/month in `18_AI_ENGINE.md`. That is a real reason. It is the *only* gate, which is the mistake.
- **Classify-everything, drop-nothing:** original “Claude will score junk low” assumption. Live data says Claude scores junk **low severity, high confidence**, which the UI still renders as a professional signal.
- **Heuristic cap at 6:** added 2026-09-12 after the Oregon radar / Navy memoir rows were found in this same DB. Correct patch. Does not apply to Claude, and does not remove the old rows.
- **Merge after classify, on summaries:** ADR 010, bias toward not merging. Correct fear (don’t fold a distinct development). Current thresholds make the feature approximately dead.
- **Briefing and alerts at ≥ 7:** matches `SeverityBadge` “Elevated.” Correct *if* 7 means elevated. Today a Fed “week ahead” calendar blurb is an 8 / 0.92 with a full Sonnet briefing and would page anyone whose `alert_rules.min_severity` default is 7.

### 2.4 The #137 USOIL case, in this model

LIVE_TODO #137: signal `7b43abe7-…`, USOIL/UKOIL/XAUUSD quotes $100.05 / $104.61 / $4408.90 at 16:30 and the same on a later 19:00 tick — a real flat. Current row `7b43abe7-e9bb-478d-88cf-850b5106d6d3` is **“UK reaffirms solidarity with Saudi Arabia after Houthi attacks”**, severity **6**, confidence **0.72**, Claude, USOIL/UKOIL `up` at 0.68/0.70. A diplomatic statement, mid severity, commodity direction invented, price unchanged. #137 changed the *subtext* under ±0.05%. It did not change the chip, the direction, the confidence, or the fact that this is a feed card.

Same-day neighbors that are the louder version of the same mismatch:

- `3548370f-…` **“Wall Street week ahead: Federal Reserve decision…”** — severity **8**, confidence **0.92**, Claude, XAUUSD/USOIL/NGAS `volatile`. A calendar preview. Clears the featured-card gate and **CREATE SEVERE ALERT**.
- `4dbf2e14-…` **“Iraq confirms Saudi pipeline attacks…”** — 8 / 0.85, real event, impacts filled. This is what 8 is for.

---

## Part 3 — What each UI surface is supposed to represent, and whether it does

| Surface | Intended meaning (product + tour copy) | What the field actually is | Edge cases the code does **not** guard |
|---|---|---|---|
| **Severity badge** | “1–10 tells you how market-relevant this is. 8+ moves markets before you hear about it elsewhere.” (ProductTour) | Claude’s unconstrained integer, or heuristic 5–6 (or leftover 7–9). No price, no source count, no chokepoint in the number. | Scores 1–6 all render the label **“Low”** (`SeverityBadge`). 8 on the dashboard is painted **“PRIORITY: CRITICAL”**. A memoir at 9 and a pipeline fire at 8 use the same visual language. |
| **Confidence %** | “How many independent sources have confirmed this and how directly it maps to a market outcome — not a guess dressed up as a number.” (ProductTour) | Claude: unaided “certainty.” Heuristic: bucket-count. **Not source count. Not outcome quality.** | 95% on a Christmas market. 76% on a speedway. 92% on a Fed week-ahead. `classification_method` exists and is unused in the UI. |
| **Projected impact (chips + direction)** | Named assets this event should move, and which way | Allowlisted tickers from Claude or from oil/gas/wheat/gold regexes. Direction is almost never “neutral” on the heuristic path. COPPER is on the watchlist and priced; **cannot appear here.** | Direction shown next to a flat Yahoo series (#137). `food`/`shipments` → WHEAT. Empty array at sev 1–2 still sits on a signal page. No check that a move has happened or is even plausible. |
| **Price-since-fired subtext** | What the named commodity did after `event_date` | Independent `priceAtSignal` vs latest tick (#137). Honest. | Guarded: ±0.05% → “No price move recorded yet.” **Not** tied back to chip direction or to the severe-alert CTA. |
| **CREATE SEVERE ALERT / Create Alert** | CTA scaled to seriousness | `eventAlertCta`: label flips at severity ≥ 7. Default new rule is `max(1, severity-1)`. `alert_rules.min_severity` default **7**; `user_preferences.min_severity` default **8**. | A Fed calendar 8, or a leftover heuristic 8, creates a “severe” rule. No check of impacts, price, or method. Alerts dispatch on **every new signal**, any severity; the rule threshold is the only quiet filter. |
| **Verification / source count** | “{n} High-Integrity Sources” (event hero). Map popup: “n source(s).” | `sources_count`: how many raw_events were folded in (cross-source merge **or** same-source refetch). 95.8% are 1. | “High-Integrity” is hardcoded. One GDELT scrape of a Christmas market is “1 High-Integrity Source.” Title-prefilter increments the count for the same article. ANALYSIS-tab restatement was removed in #137; the hero line was not. |
| **Analyst briefing** | Full Sonnet file for the highest-severity work | Generated only if severity ≥ 7 at insert (or escalation). Empty-state copy is now honest (`emptyBriefingCopy`). | Template fallback still reads as a briefing (“volatility expected… Energy/Metals”) on false 8–9s. No `classification_method` / template detector. Chat (#111) will then treat that template as ground truth. |
| **Featured / stream sort** | Hero = what matters now | `find(s => s.severity >= 8) \|\| signals[0]`; API default `event_date DESC, severity DESC`. | Newest junk at 1–4 fills the stream. A single leftover 8 steals the hero from a real 7 that fired later. |
| **Location** | Where the event happened | RSS: `formatCountryName(null)` → **“Global.”** GDELT: outlet `sourcecountry`. Claude `region` is freeform (`middle-east` vs `Middle East / Global`). | Merge misses. Map dots cluster on outlet geography. |

**Combinations that do not hold together (beyond #137):**

1. High confidence + low severity + empty impacts + “no market impact” summary → still a feed card with a green confidence %.
2. Severity ≥ 8 + heuristic/template briefing + empty impacts → featured hero + CREATE SEVERE ALERT + generic “volatility expected.”
3. Severity ≥ 7 + calendar/preview story (Fed week ahead, “oil prices likely won’t come down until after midterms”) → same surfaces as a live pipeline fire.
4. Severity 6 diplomatic solidarity + USOIL `up` + flat price → chips assert a move the tape does not show (#137).
5. `sources_count` 1 + “High-Integrity Sources” + ProductTour “independent sources have confirmed this.”
6. ProductTour “8+ moves markets before you hear about it” vs a live 8 that is a permitting comment period or a speedway military-appreciation night.

#137 fixed (2)’s empty-briefing *story* and (4)’s `+0.0%` *wording*. It did not fix the combinations.

---

## What is actually working

- Collectors run, dedupe by URL `external_id`, and recover from individual RSS feed failures (#63 health rows).
- Word-boundary exclude no longer kills “inflation” / “conflict” via `nfl`. That was a real production bug; the fix is still correct.
- Commodity/forex alias maps + allowlists stop Claude from writing “Crude Oil” / “Barley” / “Shipping Costs” into the chips. Scope is tight on purpose.
- Heuristic no longer emits 7–9 on a bare keyword (2026-09-12 cap). Right response to a real incident.
- When the story is a real energy/conflict event, Claude 7–9 + filled impacts + Sonnet briefing is on-brief. The 14-day ≥7 briefing fill rate is 100% (quality of the text is a separate question).
- Price path is honest: `event_date` vs latest tick, two queries, #137 flat copy.
- Empty-briefing copy is now severity-gated, not an outage story.
- English-only GDELT and the 4-hour RSS freshness window are deliberate, documented product choices.
- Alert rules *can* be raised by the user; the dispatcher respects `min_severity`.

---

## What is genuinely broken or misleading

1. **No meaning gate after classify.** “No market impact” is a summary, not a reject. This is the core bug.
2. **Live classification prompt is not the spec.** No rubric, no reject instruction, **summary not sent**. Docs and code have drifted far enough that implementing “the 18_AI_ENGINE prompt” would be a behavior change, not a restore.
3. **Confidence is not a filter and the UI claims it is.** Tour copy is false. 85% of rows are ≥ 0.65.
4. **Keyword include list is both too wide and too narrow** — wide on `market`/`trade`/`war`/`drone`/`funding`/`military`; narrow on lithium, Panama, Gaza, Beijing, cyber, election, coal, pandemic, port labor. Expanding without (1) adds more Christmas markets.
5. **Finance-tier pass-through** is an unfiltered second product (56/56 BBC Business).
6. **Merge / `sources_count` do not mean verification.** 96% single-source; refetch increments the count; UI says “High-Integrity.”
7. **Documented severity physics (Goldstein, chokepoints, sanctions lists) are unimplemented.** Columns exist. Do not cite them in UI or sales copy.
8. **Leftover heuristic 8–9 rows** still trigger featured + severe-alert + template briefing.
9. **Label lies:** 1–6 = “Low”; ≥8 dashboard = “CRITICAL”; Critical in `SEVERITY_CONFIG` is 10 and has never fired.
10. **COPPER / cyber / chokepoints** are product-visible and pipeline-invisible.

---

## Recommendation (what should change — not a Cursor prompt)

Do this in order. Do not start with “add more keywords.”

### A. Logic (required — this is the rebuild the founder offered)

**A1. Post-classify reject.** After `classifyEvent()`, do not insert a `signals` row when any of: severity ≤ 3; Claude summary asserts no / minimal market impact; severity ≤ 5 **and** `commodityImpacts` + `currencyPairImpacts` are both empty. Keep the `raw_events` row (audit + reconciliation). This is the single change that makes “each news that is coming should mean something” true.

**A2. Put a rubric in the live Haiku prompt, and send the summary.** Port the SEVERITY RULES / CONFIDENCE RULES / “[] if no mechanism” block from `18_AI_ENGINE.md` into `classifyEvent()`. Add an explicit `reject: true` (or severity 0) the collector honors. Clamp parsed severity to 1–10 and confidence to 0–1 (the dormant Zod schema already knows how).

**A3. Redefine confidence as something a trader can use, or stop showing it as a %.** Two honest options: (i) source-confirmation score = independent domains in `raw_event_ids` after a merge that actually works; (ii) model-certainty, labeled “model certainty (auto)” and never the same visual weight as severity. Do not keep the ProductTour sentence until (i) is real.

**A4. Fix merge or stop incrementing `sources_count` on refetches.** Title Jaccard + normalized region slug (`middle-east` / `Middle East` / `Middle East/Yemen`). Title-prefilter must not add a “source.” Until then, UI must not say “High-Integrity Sources.”

**A5. Quarantine leftover heuristic ≥ 7.** One-off: set `is_active=false` (or rewrite severity to the cap) on pre-2026-09-12 heuristic rows with empty impacts or template briefings. Otherwise the featured card will keep lying after A1 ships.

### B. Filter changes (only after A1, or in the same ship)

**B1. Narrow the include list.** Promote `market`, `trade`, `war`, `drone`, `military`, `funding`, `growth`, `china` to phrase forms (`stock market`, `trade war`, `drone strike`, `military strike`, `china tariff`, …). Keep exact-word `oil` / `opec` / `hormuz`.

**B2. Finance tier is not a pass.** Run finance feeds through a *finance-relevant* list (oil price, OPEC, sanctions, rates, CPI, Fed, tanker, pipeline), not “anything that isn’t sports.”

**B3. Expand only with phrase tokens that match the founder’s bar.** Add: `gaza`, `panama canal`, `lithium`, `rare earth`, `cyber`, `ransomware`, `election`, `coal`, `port strike` / `dockworkers`, `sabotage`, plus climate-ag phrases (`drought`, `crop failure`) if commodities stay in scope. Do **not** add bare `election` / `cyber` without A1 — they will import campaign noise.

**B4. Soften the year exclude.** Drop 1970–2005 as a hard kill, or require the year to be the *focus* (e.g. “in 2003” as the only date) so “compared to 2003” survives.

**B5. Log a sample of filtered titles** (Redis list or `raw_events` with `rejected_reason`). Otherwise the next audit is reconstruction again.

**B6. Do not turn ACLED on as a noise fix.** It would add conflict events without a meaning gate. Wire it after A1.

### C. UI changes (honest until A lands; some stay even after)

**C1.** Rewrite ProductTour confidence / “8+ moves markets” copy to match reality, or hide the tour targets until A3/A2 ship.  
**C2.** Event hero: “{n} source{s}” — drop “High-Integrity.” If n=1, say “Single source.”  
**C3.** `SeverityBadge`: use the 17_SIGNAL_ENGINE names (Minimal / Low / Medium / Elevated / High / Extreme / Critical), not “Low” for 1–6. Dashboard: stop labeling 8 as CRITICAL.  
**C4.** Default feed: hide or de-emphasize severity ≤ 3 (or empty-impact ≤ 5) until A1 is live — this is the cheapest trust fix and does not require a prompt change.  
**C5.** Severe-alert CTA: require severity ≥ 7 **and** at least one commodity/forex impact **and** `classification_method !== 'heuristic'` (or briefing is not the template).  
**C6.** Surface `classification_method` as “auto-classified” on heuristic rows (the column comment already anticipated this).  
**C7.** Projected-impact chips: if price-since-fired is flat, do not imply a completed move (direction chevron + “up” is the remaining #137 residue).

### What I would not do

- Do not implement Goldstein / chokepoint / sanctions-list severity math as a first patch. Those are a second research thread (GDELT events API vs DOC API; a real chokepoint dataset). They are not why Christmas markets are in the feed.
- Do not raise the briefing gate from 7 to 8. The good 7s (Houthi pipeline, Bab al-Mandab) deserve a file. Kill the bad 7–8s at classify time.
- Do not write a Cursor prompt that “tunes keywords” in isolation. That is how `market` and `trade` got here.

---

## Founder decisions this thread still needs

Before any Cursor prompt:

1. **Reject vs demote.** Is severity 1–3 allowed to exist as an archive / “low relevance” rail, or must those rows never reach `signals`? Recommendation: never reach `signals`.
2. **Macro calendar.** Is “Fed week ahead” / CPI preview in scope as Elevated/High, or is that a different product (economic calendar, already listed as planned in `18_AI_ENGINE.md`)? Recommendation: not a severity-8 geopolitical signal.
3. **Finance-desk scope.** Earnings, Ryanair, skimpflation — in or out? Recommendation: out, unless the story names a commodity mechanism or a sanctions/trade-policy action.
4. **Coverage expansions** (lithium, Panama, cyber, elections, coal, Gaza-without-israel): which of B3 is in v1 vs later?
5. **Confidence:** source-count (A3-i) or honest “model certainty” (A3-ii)?

---

## Evidence index

- Filter: `apps/backend/src/lib/relevance-filter.ts`
- Collectors: `rss-collector.ts` (4h, finance pass-through), `gnews-collector.ts`, `gdelt-collector.ts` (title-only), `acled-collector.ts`
- Classify: `apps/backend/src/services/claude.service.ts` `classifyEvent` / `heuristicClassify` (cap at L336)
- Merge / prefilter: `signal-merge.ts`, `title-prefilter.ts`
- Briefing gate: `signal-generator.ts`, collectors `if (classification.severity >= 7)`
- UI: `apps/web/lib/signal-display.ts`, `components/signals/SeverityBadge.tsx`, `components/onboarding/ProductTour.tsx`, `app/(dashboard)/dashboard/page.tsx` (featured ≥ 8, “PRIORITY: CRITICAL”), `app/(dashboard)/events/[id]/page.tsx` (“High-Integrity Sources”)
- Prior slice: `claude/NEW_signal_quality_audit_2026-09-11.md`
- Spec drift: `docs/claude_project/17_SIGNAL_ENGINE.md` §2, `docs/claude_project/18_AI_ENGINE.md` §2 vs live prompt
- SQL: 14-day distributions and samples in this session against `evavcgfmemwryggdkjmx` (2026-09-13)
- RSS replay: BBC World / Guardian World / Al Jazeera / BBC Business, 2026-09-13

No production rows, prompts, or UI were changed for this audit.
