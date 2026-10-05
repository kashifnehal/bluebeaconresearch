import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { SeverityBadge } from "./SeverityBadge";

function visibleText(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

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

runTest("score 10 shows the sourced Critical label", () => {
  const html = renderToStaticMarkup(createElement(SeverityBadge, { score: 10 }));
  assert.equal(visibleText(html), "10 Critical");
});

runTest("score 7 shows the sourced Elevated label", () => {
  const html = renderToStaticMarkup(createElement(SeverityBadge, { score: 7 }));
  assert.equal(visibleText(html), "7 Elevated");
});

runTest("score below 7 shows the number only, no invented Low label", () => {
  const html = renderToStaticMarkup(createElement(SeverityBadge, { score: 6 }));
  assert.equal(visibleText(html), "6");
});

runTest("score 1 shows the number only, no invented Low label", () => {
  const html = renderToStaticMarkup(createElement(SeverityBadge, { score: 1 }));
  assert.equal(visibleText(html), "1");
});
