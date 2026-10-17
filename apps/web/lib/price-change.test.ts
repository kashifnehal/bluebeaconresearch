import assert from "node:assert/strict";
import { priceChangeParts } from "./price-change";

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

runTest("priceChangeParts labels up, down and flat with arrow and word", () => {
  assert.equal(priceChangeParts(3.44).text, "↑ up 3.4%");
  assert.equal(priceChangeParts(-2.5).text, "↓ down 2.5%");
  assert.equal(priceChangeParts(0).text, "→ flat 0.0%");
  assert.equal(priceChangeParts(0.04).direction, "flat");
  assert.equal(priceChangeParts(-1.234, 2).figure, "1.23%");
});
