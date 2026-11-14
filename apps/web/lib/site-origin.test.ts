import assert from "node:assert/strict";

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

function withHost(hostname: string, origin: string, fn: () => void) {
  const g = globalThis as any;
  Object.defineProperty(g, "window", {
    configurable: true,
    value: { location: { hostname, origin } },
  });
  fn();
}

async function main() {
  const { getSiteOrigin } = await import("./site-origin");

  withHost("www.bluebeaconresearch.com", "https://www.bluebeaconresearch.com", () => {
    runTest("www production host returns the canonical origin", () => {
      assert.equal(getSiteOrigin(), "https://www.bluebeaconresearch.com");
    });
  });

  withHost("bluebeaconresearch.com", "https://bluebeaconresearch.com", () => {
    runTest("bare apex production host returns the canonical www origin", () => {
      assert.equal(getSiteOrigin(), "https://www.bluebeaconresearch.com");
    });
  });

  withHost("localhost", "http://localhost:3000", () => {
    runTest("localhost returns window.location.origin as-is", () => {
      assert.equal(getSiteOrigin(), "http://localhost:3000");
    });
  });

  withHost("blue-beacon-research-git-w4.vercel.app", "https://blue-beacon-research-git-w4.vercel.app", () => {
    runTest("a Vercel preview host returns window.location.origin as-is", () => {
      assert.equal(getSiteOrigin(), "https://blue-beacon-research-git-w4.vercel.app");
    });
  });
}

main();
