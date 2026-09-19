-- #142 data update — individual_social_media evidence refresh + AP-hack row.
-- Table, tiers, RLS, and classifyEvent() path are unchanged.
--
-- Elon Musk already exists (unique entity_name). UPDATE the sourced evidence
-- to the independently-checkable Aug 2018 "funding secured" / SEC record.
-- markets stays {} : TSLA (equity) and BTC are not on BBR's approved asset
-- allowlist (USOIL/UKOIL/NGAS/XAUUSD/WHEAT/CORN + EURUSD/GBPUSD/USDJPY/
-- USDCHF/USDRUB/USDCNY).
--
-- New row: compromised/false official social-media account, evidenced by the
-- April 2013 AP Twitter hack. Not a named individual's ongoing credibility.
-- markets {} : S&P 500 / equity-index drop is not a BBR-tracked asset.
--
-- Do not insert a Trump-named individual_social_media row without founder
-- sign-off (positioning decision, not an evidence gap).

update public.media_impact_watchlist
set
  entity_aliases = ARRAY['Musk'],
  tier = 'individual_social_media',
  markets = ARRAY[]::text[],
  statement_type = 'public social-media post',
  evidence_summary = $evid$August 7, 2018 "funding secured" tweet (considering taking Tesla private at $420) moved TSLA up to ~13% intraday the same day; the stock closed up more than 10%. Led to SEC v. Musk securities-fraud charges and a $20 million civil penalty for Musk plus $20 million for Tesla (September 2018 settlement, without admitting or denying). 2023 NPR/CNN coverage of the related shareholder trial concerns the same tweets; that jury found Musk not liable. This is equity/securities-fraud impact, not a commodity or FX market BBR currently tracks.$evid$,
  evidence_sources = ARRAY[
    'https://www.sec.gov/newsroom/press-releases/2018-219',
    'https://www.sec.gov/newsroom/press-releases/2018-226',
    'https://www.cnbc.com/2018/08/07/tesla-says-no-final-decision-has-been-made-to-take-company-private.html',
    'https://www.cnbc.com/2018/09/29/sec-settles-charges-with-teslas-elon-musk-will-remain-as-ceo.html',
    'https://www.npr.org/2023/02/03/1154420431/elon-musk-tesla-tweets-jury-verdict',
    'https://www.cnn.com/2023/02/03/cars/musk-tesla-tweet-lawsuit-jury'
  ],
  caveat = $cav$Equity/securities-fraud impact, not a commodity or FX market BBR currently tracks. Markets left empty: TSLA and BTC are not on the approved asset allowlist. Same transience caveat as the academic literature broadly finds for attention-driven moves.$cav$
where entity_name = 'Elon Musk';

insert into public.media_impact_watchlist (
  entity_name,
  entity_aliases,
  tier,
  markets,
  statement_type,
  evidence_summary,
  evidence_sources,
  caveat
) values (
  'Compromised official social-media account',
  ARRAY[
    'AP Twitter hack',
    'hacked AP Twitter',
    'Associated Press Twitter hack'
  ],
  'individual_social_media',
  ARRAY[]::text[],
  'compromised or false official social-media post',
  $evid$April 23, 2013: a false tweet from the compromised Associated Press Twitter account claiming an explosion at the White House caused a documented ~$136 billion brief drop in S&P 500 market value in about 2-3 minutes, before full recovery once confirmed a hoax. This is a documented case of a single compromised/false official social-media post moving markets, not an individual's own ongoing credibility.$evid$,
  ARRAY[
    'https://www.reuters.com/article/technology/hackers-send-fake-market-moving-ap-tweet-on-white-house-explosions-idUSBRE93M12Y/',
    'https://www.bloomberg.com/news/articles/2013-04-23/fake-report-erasing-136-billion-shows-market-s-fragility',
    'https://www.bbc.com/news/world-us-canada-21508660'
  ],
  $cav$Compromised or false official-account post — not a named individual's ongoing credibility. Markets left empty: the S&P 500 / equity-index move is not a BBR-tracked commodity or FX pair.$cav$
)
on conflict (entity_name) do update set
  entity_aliases = excluded.entity_aliases,
  tier = excluded.tier,
  markets = excluded.markets,
  statement_type = excluded.statement_type,
  evidence_summary = excluded.evidence_summary,
  evidence_sources = excluded.evidence_sources,
  caveat = excluded.caveat,
  active = true;
