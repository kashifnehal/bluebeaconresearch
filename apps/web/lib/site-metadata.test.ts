import assert from "node:assert/strict";

import { rootMetadata, SHARE_DESCRIPTION, SHARE_TITLE, SITE_ORIGIN } from "./site-metadata";

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

runTest("root metadata has openGraph, twitter, and metadataBase", () => {
  assert.ok(rootMetadata.openGraph);
  assert.ok(rootMetadata.twitter);
  assert.ok(rootMetadata.metadataBase);
  assert.equal(rootMetadata.metadataBase?.toString(), `${SITE_ORIGIN}/`);
  assert.equal(rootMetadata.title, "Blue Beacon Research");
  assert.equal(rootMetadata.description, "Geopolitical intelligence for markets that matter.");
  assert.equal(rootMetadata.openGraph && "title" in rootMetadata.openGraph ? rootMetadata.openGraph.title : null, SHARE_TITLE);
  assert.equal(
    rootMetadata.openGraph && "description" in rootMetadata.openGraph ? rootMetadata.openGraph.description : null,
    SHARE_DESCRIPTION,
  );
  assert.equal(rootMetadata.twitter && "card" in rootMetadata.twitter ? rootMetadata.twitter.card : null, "summary_large_image");
});
