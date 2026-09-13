import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { MediaImpactTag } from "./MediaImpactTag";

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

runTest("no tag when media_impact_entity is null", () => {
  const html = renderToStaticMarkup(
    createElement(MediaImpactTag, { entity: null, caveat: "unused" }),
  );
  assert.equal(html, "");
});

runTest("card tag shows [Media-Impact] plus entity/caveat on hover, no forecast copy", () => {
  const html = renderToStaticMarkup(
    createElement(MediaImpactTag, {
      entity: "OPEC",
      caveat:
        "Official OPEC statements have historically REDUCED oil volatility (stabilizing/reassuring), not spiked it.",
    }),
  );
  const text = visibleText(html);
  assert.match(text, /\[Media-Impact\]/);
  assert.equal(text.includes("OPEC"), false);
  assert.match(html, /Official OPEC statements have historically REDUCED oil volatility/);
  assert.match(html, /Historical pattern only — not a forecast/);
  assert.equal(/buy|sell|recommend/i.test(html), false);
  assert.match(html, /data-testid="media-impact-tag"/);
});

runTest("detail expansion names the entity and the short caveat", () => {
  const html = renderToStaticMarkup(
    createElement(MediaImpactTag, {
      entity: "US President",
      caveat: "Short-term reaction historically, not a lasting repricing.",
      expanded: true,
    }),
  );
  const text = visibleText(html);
  assert.match(text, /\[Media-Impact\]/);
  assert.match(text, /US President/);
  assert.match(text, /Short-term reaction historically, not a lasting repricing/);
  assert.match(text, /Historical pattern only — not a forecast/);
  assert.equal(/buy|sell/i.test(text), false);
});
