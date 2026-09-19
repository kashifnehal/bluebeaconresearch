import assert from "node:assert/strict";

process.env.NODE_ENV = process.env.NODE_ENV || "test";
process.env.SUPABASE_URL = process.env.SUPABASE_URL || "http://localhost";
process.env.SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || "test-supabase-role-key";

import { SEARCH_FAQ_ENTRIES, SEARCH_PAGE_ENTRIES, getSearchCatalog } from "./search-catalog.js";
import {
  parseSearchAssistAnswer,
  pickConfidentMatch,
  type RetrievedSearchDoc,
} from "./search-assist.js";
import {
  LOCAL_HASH_MODEL,
  activeEmbeddingModel,
  cosineSimilarity,
  localHashEmbedding,
  similarityThresholdFor,
} from "./search-embeddings.js";

function runTest(name: string, fn: () => void) {
  try {
    fn();
    console.log(`✔ ${name}`);
  } catch (err) {
    console.error(`✖ ${name}`);
    console.error(err);
    process.exitCode = 1;
  }
}

runTest("catalog is real pages only — FAQ waits on #155", () => {
  assert.equal(SEARCH_FAQ_ENTRIES.length, 0);
  const urls = getSearchCatalog().map((e) => e.url);
  assert.deepEqual(
    urls.sort(),
    ["/alerts", "/backtesting", "/calendar", "/dashboard", "/map", "/settings", "/watchlist"],
  );
  assert.equal(
    SEARCH_PAGE_ENTRIES.every((e) => e.content.length > 20 && e.sourceKind === "page"),
    true,
  );
});

runTest("NODE_ENV=test uses local-hash-v1, never Voyage", () => {
  assert.equal(activeEmbeddingModel(), LOCAL_HASH_MODEL);
});

runTest("local-hash ranks a map query above an unrelated query for the Map page", () => {
  const mapDoc = SEARCH_PAGE_ENTRIES.find((e) => e.url === "/map");
  assert.ok(mapDoc);
  const docVec = localHashEmbedding(`${mapDoc.title}. ${mapDoc.content}`);
  const mapScore = cosineSimilarity(localHashEmbedding("where is the global map"), docVec);
  const junkScore = cosineSimilarity(localHashEmbedding("banana bread recipe"), docVec);
  assert.ok(mapScore > junkScore, `map ${mapScore} vs junk ${junkScore}`);
  assert.ok(
    mapScore >= similarityThresholdFor(LOCAL_HASH_MODEL),
    `expected map query to clear threshold, got ${mapScore}`,
  );
  assert.ok(
    junkScore < similarityThresholdFor(LOCAL_HASH_MODEL),
    `expected junk query under threshold, got ${junkScore}`,
  );
});

runTest("pickConfidentMatch rejects missing, below-threshold, and non-app URLs", () => {
  const ok: RetrievedSearchDoc = {
    contentKey: "page:/map",
    title: "Map",
    url: "/map",
    content: "Map",
    sourceKind: "page",
    similarity: 0.5,
  };
  assert.equal(pickConfidentMatch([], 0.22), null);
  assert.equal(pickConfidentMatch([{ ...ok, similarity: 0.1 }], 0.22), null);
  assert.equal(pickConfidentMatch([{ ...ok, url: "https://evil.example" }], 0.22), null);
  assert.equal(pickConfidentMatch([ok], 0.22)?.url, "/map");
});

runTest("parseSearchAssistAnswer drops NO_ANSWER and appends the retrieved URL if missing", () => {
  assert.equal(parseSearchAssistAnswer("NO_ANSWER", "/map"), null);
  assert.equal(parseSearchAssistAnswer("", "/map"), null);
  const withUrl = parseSearchAssistAnswer("The Global Map is at /map.", "/map");
  assert.equal(withUrl, "The Global Map is at /map.");
  const appended = parseSearchAssistAnswer("Open the Global Map to see risk concentration", "/map");
  assert.match(appended ?? "", /\/map/);
});
