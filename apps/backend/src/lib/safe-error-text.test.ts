import assert from "node:assert/strict";
import { describeError } from "./safe-error-text.js";

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

runTest("an Error instance returns its message", () => {
  assert.equal(describeError(new Error("connection refused")), "connection refused");
});

runTest("a PostgREST-shaped object prefixes the code onto the message", () => {
  assert.equal(describeError({ message: "x", code: "57014" }), "57014: x");
});

runTest("a PostgREST-shaped object with no code returns the bare message", () => {
  assert.equal(describeError({ message: "connection refused" }), "connection refused");
});

runTest("a plain string is returned as-is", () => {
  assert.equal(describeError("just a string"), "just a string");
});

runTest("a number is stringified", () => {
  assert.equal(describeError(404), "404");
});

runTest("a Cloudflare 521 HTML error page is summarized with its error code", () => {
  const html =
    `<!DOCTYPE html><html><head><title>bluebeaconresearch.com | 521: Web server is down</title></head>` +
    `<body><h1>Error code 521</h1><p>Ray ID: abc123</p></body></html>`;
  assert.equal(describeError(html), `html error page (${html.length} chars) (Error code 521)`);
});

runTest("an html fragment with no recognizable Cloudflare code still summarizes safely", () => {
  const html = "<html><body>Service unavailable</body></html>";
  assert.equal(describeError(html), `html error page (${html.length} chars)`);
});

runTest("a very long string is truncated to maxLen with an ellipsis", () => {
  const long = "x".repeat(500);
  const result = describeError(long);
  assert.equal(result.length, 301);
  assert.equal(result.endsWith("…"), true);
  assert.equal(result.startsWith("x".repeat(300)), true);
});

runTest("a custom maxLen is honored", () => {
  const result = describeError("abcdefghij", 5);
  assert.equal(result, "abcde…");
});
