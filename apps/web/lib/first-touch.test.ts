import assert from "node:assert/strict";

import { captureFirstTouch, parseFirstTouch, readFirstTouch, FIRST_TOUCH_STORAGE_KEY } from "./first-touch";

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

const OWN = "www.bluebeaconresearch.com";

runTest("no params and no referrer returns null", () => {
  assert.equal(parseFirstTouch("", "", OWN), null);
  assert.equal(parseFirstTouch("?email=a@b.com", "", OWN), null);
});

runTest("utm only", () => {
  const touch = parseFirstTouch("?utm_source=newsletter&utm_medium=email", "", OWN);
  assert.deepEqual(touch, { utm_source: "newsletter", utm_medium: "email" });
});

runTest("external referrer only", () => {
  const touch = parseFirstTouch("", "https://news.example/story?id=1", OWN);
  assert.deepEqual(touch, { referrer_host: "news.example" });
});

runTest("own-host referrer ignored", () => {
  assert.equal(parseFirstTouch("", "https://www.bluebeaconresearch.com/signup", OWN), null);
  const touch = parseFirstTouch("?utm_source=ad", "https://www.bluebeaconresearch.com/pricing", OWN);
  assert.deepEqual(touch, { utm_source: "ad" });
});

runTest("150-character value is cut to 100", () => {
  const raw = "A".repeat(150);
  const touch = parseFirstTouch(`?utm_campaign=${raw}`, "", OWN);
  assert.equal(touch?.utm_campaign?.length, 100);
  assert.equal(touch?.utm_campaign, "a".repeat(100));
});

runTest("upper case is lowered", () => {
  const touch = parseFirstTouch("?utm_source=NewsLetter&utm_term=Brent", "https://News.Example/a", OWN);
  assert.equal(touch?.utm_source, "newsletter");
  assert.equal(touch?.utm_term, "brent");
  assert.equal(touch?.referrer_host, "news.example");
});

function installBrowser(search: string, referrer: string, storage: Storage) {
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { location: { search, hostname: OWN } },
  });
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: { referrer },
  });
  Object.defineProperty(globalThis, "sessionStorage", {
    configurable: true,
    value: storage,
  });
}

runTest("storage that throws does not throw out of read or capture", () => {
  const throwing: Storage = {
    getItem() {
      throw new Error("blocked");
    },
    setItem() {
      throw new Error("blocked");
    },
    removeItem() {
      throw new Error("blocked");
    },
    clear() {
      throw new Error("blocked");
    },
    key() {
      throw new Error("blocked");
    },
    length: 0,
  };
  installBrowser("?utm_source=ad", "https://news.example/", throwing);
  assert.doesNotThrow(() => readFirstTouch());
  assert.equal(readFirstTouch(), null);
  assert.doesNotThrow(() => captureFirstTouch());
});

runTest("a stored value is not overwritten", () => {
  const stored = JSON.stringify({ utm_source: "first" });
  let writes = 0;
  const storage: Storage = {
    getItem(key: string) {
      assert.equal(key, FIRST_TOUCH_STORAGE_KEY);
      return stored;
    },
    setItem() {
      writes += 1;
    },
    removeItem() {},
    clear() {},
    key() {
      return null;
    },
    length: 1,
  };
  installBrowser("?utm_source=second", "https://other.example/", storage);
  captureFirstTouch();
  assert.equal(writes, 0);
  assert.deepEqual(readFirstTouch(), { utm_source: "first" });
});
