import assert from "node:assert/strict";

import { sourceHostname, uniqueSourceCount } from "./source-host";

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

runTest("strips a leading www and lowercases the host", () => {
  assert.equal(sourceHostname("https://www.Example.com/world/story"), "example.com");
  assert.equal(sourceHostname("https://WWW.Reuters.com/article"), "reuters.com");
});

runTest("keeps a host that has no www prefix", () => {
  assert.equal(sourceHostname("https://bbc.co.uk/news/story"), "bbc.co.uk");
  assert.equal(sourceHostname("https://blog.www.example.com/a"), "blog.www.example.com");
});

runTest("returns null for a bad URL, a blank string, null, and undefined", () => {
  assert.equal(sourceHostname("not a url"), null);
  assert.equal(sourceHostname("www.example.com"), null);
  assert.equal(sourceHostname(""), null);
  assert.equal(sourceHostname("   "), null);
  assert.equal(sourceHostname(null), null);
  assert.equal(sourceHostname(undefined), null);
});

runTest("uniqueSourceCount drops nulls and counts duplicate domains once", () => {
  assert.equal(
    uniqueSourceCount([
      { domain: "reuters.com", sourceLabel: "Reuters" },
      { domain: "reuters.com", sourceLabel: "Other" },
      { domain: null, sourceLabel: "DW World" },
      { domain: null, sourceLabel: "DW World" },
      { domain: null, sourceLabel: null },
      { domain: "", sourceLabel: "BBC" },
    ]),
    3,
  );
});

runTest("uniqueSourceCount is null when no source has a domain or label", () => {
  assert.equal(
    uniqueSourceCount([
      { domain: null, sourceLabel: null },
      { domain: "", sourceLabel: "" },
    ]),
    null,
  );
  assert.equal(uniqueSourceCount([]), null);
});
