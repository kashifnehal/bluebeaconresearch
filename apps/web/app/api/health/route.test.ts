import assert from "node:assert/strict";

import { GET } from "./route";

function runTest(name: string, fn: () => void | Promise<void>) {
  return Promise.resolve()
    .then(fn)
    .then(() => {
      console.log(`✔ ${name}`);
    })
    .catch((err) => {
      console.error(`✖ ${name}`);
      console.error(err);
      process.exitCode = 1;
    });
}

void runTest("GET /api/health returns 200 and { status: \"ok\" }", async () => {
  const res = await GET();
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { status: "ok" });
  assert.equal(res.headers.get("cache-control"), "no-store");
});
