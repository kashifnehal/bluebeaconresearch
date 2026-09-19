import assert from "node:assert/strict";
import { parseFeedbackBody } from "./feedback";

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

runTest("rejects empty or short messages", () => {
  assert.equal(parseFeedbackBody({ message: "too short" }).ok, false);
  assert.equal(parseFeedbackBody({}).ok, false);
});

runTest("accepts message plus optional email and page context", () => {
  const parsed = parseFeedbackBody({
    message: "The confidence score on the feed is confusing.",
    email: " trader@example.com ",
    pageContext: "/help",
  });
  assert.equal(parsed.ok, true);
  if (parsed.ok) {
    assert.equal(parsed.value.email, "trader@example.com");
    assert.equal(parsed.value.pageContext, "/help");
  }
});

runTest("allows omitting email and page context", () => {
  const parsed = parseFeedbackBody({
    message: "Found a bug on the accuracy page table.",
  });
  assert.equal(parsed.ok, true);
  if (parsed.ok) {
    assert.equal(parsed.value.email, null);
    assert.equal(parsed.value.pageContext, null);
  }
});

runTest("rejects a malformed email", () => {
  const parsed = parseFeedbackBody({
    message: "Found a bug on the accuracy page table.",
    email: "not-an-email",
  });
  assert.equal(parsed.ok, false);
});
