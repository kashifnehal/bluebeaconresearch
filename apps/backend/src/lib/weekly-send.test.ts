import assert from "node:assert/strict";

import { weeklyEmailFixture } from "./weekly-email.fixture.js";
import {
  WEEKLY_SEND_GAP_MS,
  buildRecipientMessage,
  runWeeklySend,
  validateEditionFile,
  type WeeklyEditionFile,
  type WeeklySendDeps,
  type WeeklySendLogRow,
  type WeeklySendOpts,
  type WeeklySubscriber,
} from "./weekly-send.js";

function runTest(name: string, fn: () => Promise<void> | void) {
  return Promise.resolve()
    .then(fn)
    .then(() => {
      console.log(`✔ ${name}`);
    })
    .catch((err: unknown) => {
      console.error(`✖ ${name}`);
      console.error(err);
      process.exitCode = 1;
    });
}

function realEdition(overrides: Partial<WeeklyEditionFile> = {}): WeeklyEditionFile {
  const { unsubscribeUrl: _unsubscribeUrl, preferencesUrl: _preferencesUrl, ...rest } = weeklyEmailFixture;
  return {
    ...rest,
    ...overrides,
    lead: {
      ...rest.lead,
      headline: "Gulf shipping lane disruption lifts freight risk",
      ...(overrides.lead ?? {}),
    },
  };
}

function sampleEdition(): WeeklyEditionFile {
  const { unsubscribeUrl: _unsubscribeUrl, preferencesUrl: _preferencesUrl, ...rest } = weeklyEmailFixture;
  return rest;
}

function subscriber(id: string, token: string, email = "reader@example.com"): WeeklySubscriber {
  return { id, email, unsubscribe_token: token };
}

function harness(input: {
  subscribers?: WeeklySubscriber[];
  sentIds?: Set<string>;
  send?: WeeklySendDeps["send"];
}) {
  const sentCalls: Array<{ to: string; headers?: Record<string, string>; html: string; text: string }> = [];
  const recorded: WeeklySendLogRow[] = [];
  const sleeps: number[] = [];
  const deps: WeeklySendDeps = {
    loadConfirmed: async () => input.subscribers ?? [],
    loadSentIds: async () => input.sentIds ?? new Set<string>(),
    record: async (row) => {
      recorded.push(row);
    },
    send:
      input.send ??
      (async (opts) => {
        sentCalls.push(opts);
        return { sent: true as const, id: "re_test" };
      }),
    sleep: async (ms) => {
      sleeps.push(ms);
    },
  };
  return { deps, sentCalls, recorded, sleeps };
}

function sendOpts(overrides: Partial<WeeklySendOpts> = {}): WeeklySendOpts {
  const edition = overrides.edition ?? realEdition();
  return {
    edition,
    editionNumber: edition.edition,
    mode: "send",
    max: 10,
    appUrl: "https://bluebeaconresearch.com",
    env: { WEEKLY_SEND_ENABLED: "true" },
    ...overrides,
  };
}

async function captureLogs(fn: () => Promise<void>): Promise<string[]> {
  const lines: string[] = [];
  const original = console.log;
  console.log = (...args: unknown[]) => {
    lines.push(args.map((arg) => String(arg)).join(" "));
  };
  try {
    await fn();
  } finally {
    console.log = original;
  }
  return lines;
}

await runTest("dry run sends and records nothing", async () => {
  const { deps, sentCalls, recorded, sleeps } = harness({
    subscribers: [subscriber("aaaaaaaa-1111", "tok-a"), subscriber("bbbbbbbb-2222", "tok-b")],
  });
  const result = await runWeeklySend(
    sendOpts({ mode: "dry-run", env: {}, edition: sampleEdition(), editionNumber: 99 }),
    deps,
  );
  assert.equal(sentCalls.length, 0);
  assert.equal(recorded.length, 0);
  assert.equal(sleeps.length, 0);
  assert.deepEqual(result, { eligible: 2, built: 2, sent: 0, failed: 0 });
});

await runTest("send mode throws without WEEKLY_SEND_ENABLED", async () => {
  const { deps, sentCalls, recorded } = harness({
    subscribers: [subscriber("aaaaaaaa-1111", "tok-a")],
  });
  await assert.rejects(
    () => runWeeklySend(sendOpts({ env: {} }), deps),
    /WEEKLY_SEND_ENABLED/,
  );
  assert.equal(sentCalls.length, 0);
  assert.equal(recorded.length, 0);
});

await runTest("throws for a SAMPLE LAYOUT headline", async () => {
  const { deps, sentCalls } = harness({
    subscribers: [subscriber("aaaaaaaa-1111", "tok-a")],
  });
  await assert.rejects(
    () => runWeeklySend(sendOpts({ edition: sampleEdition() }), deps),
    /sample layout/i,
  );
  assert.equal(sentCalls.length, 0);
});

await runTest("throws when max is 0 or above 90", async () => {
  const { deps, sentCalls } = harness({
    subscribers: [subscriber("aaaaaaaa-1111", "tok-a")],
  });
  await assert.rejects(() => runWeeklySend(sendOpts({ max: 0 }), deps), /max must be an integer from 1 to 90/);
  await assert.rejects(() => runWeeklySend(sendOpts({ max: 91 }), deps), /max must be an integer from 1 to 90/);
  await assert.rejects(() => runWeeklySend(sendOpts({ max: 1.5 }), deps), /max must be an integer from 1 to 90/);
  assert.equal(sentCalls.length, 0);
});

await runTest("max of 90 is accepted", async () => {
  const { deps, sentCalls } = harness({ subscribers: [] });
  const result = await runWeeklySend(sendOpts({ max: 90 }), deps);
  assert.equal(result.sent, 0);
  assert.equal(sentCalls.length, 0);
});

await runTest("throws when the edition numbers differ", async () => {
  const { deps, sentCalls } = harness({
    subscribers: [subscriber("aaaaaaaa-1111", "tok-a")],
  });
  await assert.rejects(
    () => runWeeklySend(sendOpts({ editionNumber: realEdition().edition + 1 }), deps),
    /edition number does not match/,
  );
  assert.equal(sentCalls.length, 0);
});

await runTest("each message has its own unsubscribe token and one-click header", () => {
  const appUrl = "https://bluebeaconresearch.com";
  const edition = realEdition({ correctionsCount: 2 });
  delete edition.correctionsUrl;
  const first = buildRecipientMessage(edition, { id: "aaaaaaaa-1111", unsubscribe_token: "tok/a+1" }, appUrl);
  const second = buildRecipientMessage(edition, { id: "bbbbbbbb-2222", unsubscribe_token: "tok/b 2" }, appUrl);
  const firstUrl = `${appUrl}/api/unsubscribe?t=${encodeURIComponent("tok/a+1")}`;
  const secondUrl = `${appUrl}/api/unsubscribe?t=${encodeURIComponent("tok/b 2")}`;
  const firstPrefs = `${appUrl}/unsubscribe?t=${encodeURIComponent("tok/a+1")}`;

  assert.equal(first.headers["List-Unsubscribe"], `<${firstUrl}>`);
  assert.equal(second.headers["List-Unsubscribe"], `<${secondUrl}>`);
  assert.equal(first.headers["List-Unsubscribe-Post"], "List-Unsubscribe=One-Click");
  assert.equal(second.headers["List-Unsubscribe-Post"], "List-Unsubscribe=One-Click");
  assert.ok(first.html.includes(firstUrl));
  assert.ok(first.text.includes(firstUrl));
  assert.ok(first.html.includes(firstPrefs));
  assert.ok(first.text.includes(firstPrefs));
  assert.ok(!first.html.includes(secondUrl));
  assert.ok(!second.html.includes(firstUrl));
  assert.ok(first.html.includes(`${appUrl}/corrections`));
  assert.ok(first.text.includes(`${appUrl}/corrections`));
});

await runTest("already-sent ids are skipped", async () => {
  const people = [
    subscriber("ccccccc1-3333", "tok-c"),
    subscriber("aaaaaaa1-1111", "tok-a"),
    subscriber("bbbbbbb1-2222", "tok-b"),
  ];
  const { deps, sentCalls, recorded } = harness({
    subscribers: people,
    sentIds: new Set(["bbbbbbb1-2222"]),
  });
  const result = await runWeeklySend(sendOpts(), deps);
  assert.deepEqual(
    sentCalls.map((call) => call.to),
    ["reader@example.com", "reader@example.com"],
  );
  assert.deepEqual(
    recorded.map((row) => row.subscriber_id),
    ["aaaaaaa1-1111", "ccccccc1-3333"],
  );
  assert.equal(result.eligible, 2);
  assert.equal(result.sent, 2);
  assert.ok(!recorded.some((row) => row.subscriber_id === "bbbbbbb1-2222"));
});

await runTest("a failed send is recorded and the run continues", async () => {
  let calls = 0;
  const { deps, recorded, sleeps } = harness({
    subscribers: [subscriber("aaaaaaa1-1111", "tok-a", "ada@example.com"), subscriber("bbbbbbb1-2222", "tok-b")],
    send: async () => {
      calls += 1;
      if (calls === 1) return { sent: false as const, reason: "ada@example.com bounced" };
      return { sent: true as const, id: "re_ok" };
    },
  });
  const lines = await captureLogs(async () => {
    const result = await runWeeklySend(sendOpts({ max: 5 }), deps);
    assert.deepEqual(result, { eligible: 2, built: 2, sent: 1, failed: 1 });
  });
  assert.equal(calls, 2);
  assert.equal(recorded[0]?.status, "failed");
  assert.equal(recorded[0]?.subscriber_id, "aaaaaaa1-1111");
  assert.equal(recorded[0]?.error?.includes("@"), false);
  assert.equal(recorded[1]?.status, "sent");
  assert.equal(recorded[1]?.resend_id, "re_ok");
  assert.deepEqual(sleeps, [WEEKLY_SEND_GAP_MS]);
  assert.ok(lines.every((line) => !line.includes("@")));
});

await runTest("max stops the run", async () => {
  const { deps, sentCalls, recorded, sleeps } = harness({
    subscribers: [
      subscriber("aaaaaaa1-1111", "tok-a"),
      subscriber("bbbbbbb1-2222", "tok-b"),
      subscriber("ccccccc1-3333", "tok-c"),
    ],
  });
  const result = await runWeeklySend(sendOpts({ max: 2 }), deps);
  assert.equal(sentCalls.length, 2);
  assert.equal(recorded.length, 2);
  assert.deepEqual(
    recorded.map((row) => row.subscriber_id),
    ["aaaaaaa1-1111", "bbbbbbb1-2222"],
  );
  assert.deepEqual(sleeps, [WEEKLY_SEND_GAP_MS]);
  assert.equal(result.sent, 2);
  assert.equal(result.eligible, 3);
  assert.equal(result.built, 2);
});

await runTest("no log line contains an @", async () => {
  const { deps } = harness({
    subscribers: [subscriber("abcdef12-9999", "tok-a", "reader@example.com")],
  });
  const lines = await captureLogs(() => runWeeklySend(sendOpts({ max: 1 }), deps).then(() => undefined));
  assert.ok(lines.length > 0);
  assert.ok(lines.some((line) => line.includes("abcdef12")));
  assert.ok(lines.every((line) => !line.includes("@")));
  assert.ok(lines.every((line) => !line.includes("reader@example.com")));
});

await runTest("non-https appUrl throws", async () => {
  const { deps, sentCalls, recorded } = harness({
    subscribers: [subscriber("aaaaaaaa-1111", "tok-a")],
  });
  await assert.rejects(
    () => runWeeklySend(sendOpts({ mode: "dry-run", appUrl: "http://bluebeaconresearch.com" }), deps),
    /https/,
  );
  assert.equal(sentCalls.length, 0);
  assert.equal(recorded.length, 0);
});

await runTest("validateEditionFile accepts the sample file and renders a placeholder token", () => {
  const edition = validateEditionFile(weeklyEmailFixture);
  assert.equal(edition.edition, weeklyEmailFixture.edition);
  assert.equal("unsubscribeUrl" in edition, false);
  assert.throws(() => validateEditionFile({ edition: 1 }), /edition file/);
});
