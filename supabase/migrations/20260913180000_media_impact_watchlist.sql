-- #142 — live media-impact watchlist (replaces #141's hardcoded array in
-- claude.service.ts) + signals.media_impact_entity for the matched entity_name.
--
-- Reference data, not user data: public read, service-role write only.
-- RLS policy shape matches signal_outcomes (#121).

create table if not exists public.media_impact_watchlist (
  id uuid primary key default gen_random_uuid(),
  entity_name text not null,
  entity_aliases text[] not null default '{}',
  tier text not null check (tier in (
    'institutional_official',
    'political_geopolitical',
    'individual_social_media'
  )),
  markets text[] not null,
  statement_type text not null,
  evidence_summary text not null,
  evidence_sources text[] not null,
  caveat text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (entity_name)
);

create index if not exists media_impact_watchlist_active_idx
  on public.media_impact_watchlist (active)
  where active = true;

alter table public.media_impact_watchlist enable row level security;

drop policy if exists "media_impact_watchlist_select_public" on public.media_impact_watchlist;
create policy "media_impact_watchlist_select_public"
on public.media_impact_watchlist
for select
to anon, authenticated
using (true);

comment on table public.media_impact_watchlist is
  '#142 — sourced communicators whose statements have a documented historical market reaction. Public read (reference data); service-role write only. Replaces the hardcoded MATERIALITY_WATCHLIST array shipped with #141.';

alter table public.signals
  add column if not exists media_impact_entity text;

comment on column public.signals.media_impact_entity is
  '#142 — matched media_impact_watchlist.entity_name when classifyEvent() attributes the story''s statement/commentary to a watchlist communicator; null otherwise. Not a forecast.';

-- Seed: exactly the 7 sourced entries from the #142 brief. Do not add
-- Michael Saylor or Cathie Wood — no independent quantified study was found.
-- Elon Musk markets are empty: BBR's approved commodity allowlist is
-- USOIL/UKOIL/NGAS/XAUUSD/WHEAT/CORN (plus forex). BTC is not tracked.
insert into public.media_impact_watchlist (
  entity_name,
  entity_aliases,
  tier,
  markets,
  statement_type,
  evidence_summary,
  evidence_sources,
  caveat
) values
(
  'OPEC',
  ARRAY['OPEC+', 'Organization of the Petroleum Exporting Countries'],
  'institutional_official',
  ARRAY['USOIL', 'UKOIL'],
  'official communication',
  $evid$Federal Reserve working paper analyzed 262 OPEC press releases from 2002-2021. The model explains about 34% of oil volatility variance and about 57% of trader-position variance.$evid$,
  ARRAY['https://www.federalreserve.gov/econres/feds/files/2024003pap.pdf'],
  $cav$Official OPEC statements have historically REDUCED oil volatility (stabilizing/reassuring), not spiked it. Reserve high severity for an actual OPEC+ production/output decision, a different kind of event entirely.$cav$
),
(
  'Saudi Arabia''s Energy Minister',
  ARRAY['Prince Abdulaziz bin Salman', 'Abdulaziz bin Salman'],
  'institutional_official',
  ARRAY['USOIL', 'UKOIL'],
  'public statement',
  $evid$Multiple dated, sourced instances of comments from Saudi Arabia's Energy Minister (Prince Abdulaziz bin Salman) moving oil prices, reported by Bloomberg (November 2023) and CNBC (September 2023).$evid$,
  ARRAY[
    'https://www.bloomberg.com/news/articles/2023-11-09/saudi-energy-minister-blames-speculators-for-oil-price-drop',
    'https://www.cnbc.com/2023/09/19/saudi-energy-minister-says-oil-supply-cuts-are-not-about-jacking-up-prices.html'
  ],
  $cav$Real, dated, specific evidence — stronger than the generic OPEC entry.$cav$
),
(
  'US Federal Reserve Chair',
  ARRAY['Jerome Powell', 'Fed Chair', 'Federal Reserve Chair', 'FOMC Chair'],
  'institutional_official',
  ARRAY['USOIL', 'XAUUSD', 'EURUSD'],
  'official communication',
  $evid$FRBSF event-study database of scheduled FOMC communications, plus CEPR research on the market impact of the Fed press conference itself.$evid$,
  ARRAY[
    'https://www.frbsf.org/wp-content/uploads/wp2025-30.pdf',
    'https://cepr.org/voxeu/columns/market-impact-fed-press-conference'
  ],
  $cav$Only the scheduled FOMC statement/press conference itself counts — never a 'week ahead' preview, which gets is_preview=true and doesn't pass the gate as this entity's media-impact event.$cav$
),
(
  'USDA',
  ARRAY['WASDE', 'Crop Production', 'Grain Stocks'],
  'institutional_official',
  ARRAY['WHEAT', 'CORN'],
  'official communication',
  $evid$Mattos & Silveira 2016, cited via Virginia Tech: +28.13% conditional volatility in corn futures around USDA report windows (WASDE / Crop Production / Grain Stocks).$evid$,
  ARRAY['https://aaec.vt.edu/people/faculty/Isengildina_Olga/report/move_markets.html'],
  $cav$Same caveat as the Fed — only the actual data release counts, not a preview. Individual reports mostly don't move markets alone; the January cluster (WASDE + Grain Stocks + Crop Production together) is the real high-materiality case.$cav$
),
(
  'Russian President',
  ARRAY['Vladimir Putin', 'President Putin', 'Putin'],
  'political_geopolitical',
  ARRAY['NGAS'],
  'public statement',
  $evid$Multiple dated, sourced instances of Russian presidential statements on gas supply to Europe coinciding with European energy-market moves.$evid$,
  ARRAY[
    'https://tass.com/economy/2186493',
    'https://www.aljazeera.com/news/2026/3/9/putin-says-russia-can-supply-oil-gas-to-europe-amid-global-energy-crisis'
  ],
  $cav$Directly relevant to BBR's current live natural-gas/European-energy coverage.$cav$
),
(
  'US President',
  ARRAY['U.S. President', 'President of the United States'],
  'political_geopolitical',
  ARRAY['USOIL', 'UKOIL'],
  'public statement',
  $evid$Dated, sourced roughly $2/barrel WTI/Brent moves around presidential oil comments (CFR; Forbes). The Trump-tweet EMH paper is the rigorous version of the same finding. Tagged as the office, not one officeholder.$evid$,
  ARRAY[
    'https://www.cfr.org/articles/presidential-oil-tweets-oil-prices-and-cycle',
    'https://www.forbes.com/sites/michaellynch/2019/04/28/why-do-tweets-from-trump-move-oil-prices/',
    'https://papers.ssrn.com/sol3/papers.cfm?abstract_id=2973186'
  ],
  $cav$Explicitly transient — statistically insignificant after 5 trading days. Tag copy must say 'short-term reaction historically, not a lasting repricing,' never imply a forecast.$cav$
),
(
  'Elon Musk',
  ARRAY['Musk'],
  'individual_social_media',
  ARRAY[]::text[],
  'public social-media post',
  $evid$Multiple sourced instances of market-moving tweets, including a real $20M SEC fine for a market-moving tweet (CNBC, 2021). Markets left empty: BBR does not track BTC/crypto on the approved asset list.$evid$,
  ARRAY['https://www.cnbc.com/2021/01/29/elon-musks-tweets-are-moving-markets.html'],
  $cav$Strongest, most-litigated single-person example found — same transience caveat as the academic literature broadly finds for attention-driven moves.$cav$
)
on conflict (entity_name) do nothing;
