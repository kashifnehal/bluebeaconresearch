# GDELT DOC artlist — stale 250-article list (2026-10-06)

Diagnosis only. No application code was changed.

## Verdict

The repeated 250-article list, newest item 2026-10-02 10:45 UTC, is a **GDELT-side delay**. It is not a cache inside this repo, and it is not an HTTP cache replaying a days-old response.

One request from this machine, to the exact collector URL, returned HTTP 200 with a `Date` of 2026-10-06 02:47:00 GMT and the same newest `seendate` (`20261002T104500Z`). There was no `Age` header. GDELT's own `Cache-Control: public, max-age=900` only allows a shared cache to reuse that payload for 15 minutes. The payload GDELT emitted on 2026-10-06 was already frozen on 2026-10-02.

## Request

URL, copied from `apps/backend/src/workers/gdelt-collector.ts` lines 41–42 on `origin/main` (`e51bb1e` at request time):

`https://api.gdeltproject.org/api/v2/doc/doc?query=(conflict+OR+war+OR+sanctions+OR+military+OR+oil+OR+stock+market+OR+trade+OR+inflation+OR+fed+OR+earnings)+sourcelang:eng&mode=artlist&maxrecords=250&format=json&sort=DateDesc`

Command (once, no retry): `curl -sS -D - -o /tmp/g.json` with that URL. Exit 0. Wall time about 15 seconds.

## Status and headers

```
HTTP/1.1 200 OK
Date: Tue, 06 Oct 2026 02:47:00 GMT
Server: GDELT Server
Access-Control-Allow-Origin: *
Timing-Allow-Origin: *
X-XSS-Protection: 1; mode=block
Cache-Control: public, max-age=900
Transfer-Encoding: chunked
Content-Type: application/json; charset=utf-8
```

Absent from this response: `Age`, `ETag`, `Last-Modified`, `Via`, `X-Cache`, `CF-Cache-Status`, `Vary`.

## Body (the one saved response)

- Top-level keys: `articles` only.
- Article count: 250.
- File size: 119,786 bytes.
- Unique URLs: 250 of 250. No empty URL.
- `language`: English on all 250.
- Sort: `seendate` descending, matches `sort=DateDesc`.
- First item: `seendate` `20261002T104500Z` (2026-10-02 10:45:00 UTC), domain `dunfermlinepress.com`, title starts "Dont worry about diesel shortages , Government says , as US urges use of reserve".
- Last item: `seendate` `20261002T094500Z` (2026-10-02 09:45:00 UTC), domain `austinglobe.com`, title starts "US Reinforcing Military Presence In Middle East As Iran Tensions Rise".
- Every article's `seendate` is on 2026-10-02. Three values only:
  - `20261002T104500Z`: 130
  - `20261002T100000Z`: 94
  - `20261002T094500Z`: 26
- Span of the whole list: 09:45–10:45 UTC on 2026-10-02 (one hour).
- SHA1 of the sorted URL list, joined with newlines, same method as the collector's `urls_hash` log: `943d439b58aaa5acbfa15edba2b771be15668d92`. Newest `seendate` for that log line would be `20261002T104500Z`, `fetched=250`.

## Why this is not our cache

`fetchGdeltWithBackoff()` calls `axios.get(GDELT_API_URL, { timeout: 40_000 })`. No cache adapter, no Redis key, no disk copy of the artlist. The `urls_hash` line only logs; it does not reuse a previous body.

This request did not go through the Railway worker. It still returned the newest item the task already described (2026-10-02 10:45 UTC). A collector-only or Railway-egress cache would not produce that result on a different machine.

`max-age=900` is 15 minutes. The `Date` header is the request time (2026-10-06), not 2026-10-02. A days-old HTTP cache hit would normally keep the original `Date` and send `Age`. Neither showed up. The 15-minute header can only repeat whatever GDELT just generated. What GDELT generated was already four days behind (from 2026-10-02 10:45 UTC to 2026-10-06 02:47 UTC).

## 429s

This single call was HTTP 200. It does not measure how often production receives 429. The collector comment and `docs/claude_project/16_DATA_PIPELINE.md` section 2.1 already say the keyless DOC API can answer 429 for an IP-level block of up to about 15 minutes on the shared Railway egress address, and the code allows one retry then stops. That is a separate failure mode from the stale list: a 200 from this machine still contained the frozen list.

## Repo notes checked

- `docs/claude_project/16_DATA_PIPELINE.md` section 2.1 describes this DOC 2.0 artlist call, the 429 IP block, and title-only fields. It still says `maxrecords=50`. The code on `origin/main` uses `maxrecords=250`. That doc drift is not the cause of the frozen dates.
- `docs/brain/15_INGESTION_PIPELINE.md` section 2.3 says HTTP 429 is common and describes a 30-second retry. The code uses one retry with a 5-second base plus up to 10 seconds of jitter (`GDELT_BACKOFF_BASE_MS` and `GDELT_MAX_RETRIES` in `gdelt-collector.ts`). That mismatch is not the cause of the frozen dates.
- No file matching `247_GDELT` exists in this repo (searched `docs/` and the rest of the tree). If that planning note records a different cause, it was not available here.

## Not verified

- Railway worker logs and the production 429 rate, this session.
- A second request (explicitly not done).
- GDELT's `lastupdate.txt` or any URL other than the collector URL.
- Whether GDELT's 15-minute update files after 2026-10-02 10:45 UTC exist and this query is skipping them. That would be another request.
