import assert from "node:assert/strict";

process.env.SUPABASE_URL = process.env.SUPABASE_URL || "http://localhost";
process.env.SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || "test-supabase-role-key";

const {
  runDigestOnce,
  recordDigestSendLog,
  __setDigestSupabaseForTests,
  __setDigestEmailForTests,
} = await import("./digest-sender.js");

function runTest(name: string, fn: () => void | Promise<void>) {
  try {
    const result = fn();
    if (result instanceof Promise) {
      return result.then(
        () => console.log(`✔ ${name}`),
        (err) => {
          console.error(`✖ ${name}`);
          console.error(err);
          process.exitCode = 1;
        },
      );
    }
    console.log(`✔ ${name}`);
  } catch (err) {
    console.error(`✖ ${name}`);
    console.error(err);
    process.exitCode = 1;
  }
}

function thenable(payload: { data: unknown; error: unknown }) {
  const builder: Record<string, unknown> = {
    select: () => builder,
    not: () => builder,
    eq: () => builder,
    in: () => builder,
    then: (resolve: (value: { data: unknown; error: unknown }) => unknown) =>
      Promise.resolve(payload).then(resolve),
  };
  return builder;
}

function logInsertClient(insertResult: { error: { code?: string; message?: string } | null }) {
  const inserted: Array<Record<string, unknown>> = [];
  return {
    inserted,
    from(table: string) {
      if (table !== "digest_send_log") throw new Error(`unexpected table ${table}`);
      return {
        insert: async (row: Record<string, unknown>) => {
          inserted.push(row);
          return insertResult;
        },
      };
    },
  };
}

function wiringClient() {
  const inserted: Array<Record<string, unknown>> = [];
  return {
    inserted,
    from(table: string) {
      if (table === "user_preferences") {
        return thenable({
          data: [
            {
              user_id: "user-1",
              commodities: [],
              regions: [],
              forex_pairs: [],
              min_severity: null,
            },
          ],
          error: null,
        });
      }
      if (table === "profiles") {
        return thenable({ data: [], error: null });
      }
      if (table === "alerts_sent") {
        return thenable({ data: [], error: null });
      }
      if (table === "digest_send_log") {
        return {
          insert: async (row: Record<string, unknown>) => {
            inserted.push(row);
            return { error: null };
          },
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
    auth: {
      admin: {
        async listUsers() {
          return { data: { users: [{ id: "user-1", email: "reader@example.com" }] } };
        },
      },
    },
  };
}

async function main() {
  await runTest("runDigestOnce writes a digest_send_log row with the counters", async () => {
    const client = wiringClient();
    __setDigestSupabaseForTests(client);
    __setDigestEmailForTests({
      enabled: true,
      async send() {
        throw new Error("send should not run when there are no signals");
      },
    } as unknown as import("../services/email.service.js").EmailService);

    const result = await runDigestOnce();
    assert.equal(result.eligible, 1);
    assert.equal(result.sent, 0);
    assert.equal(result.skippedNoSignals, 1);
    assert.equal(result.failed, 0);
    assert.equal(client.inserted.length, 1);
    assert.deepEqual(client.inserted[0], {
      eligible: 1,
      sent: 0,
      skipped_no_signals: 1,
      failed: 0,
      sender_enabled: true,
      error: null,
    });
  });

  await runTest("an insert error does not throw", async () => {
    const client = logInsertClient({
      error: { code: "42501", message: "permission denied for table digest_send_log" },
    });
    __setDigestSupabaseForTests(client);
    await recordDigestSendLog({
      eligible: 3,
      sent: 1,
      skippedNoSignals: 1,
      failed: 1,
      senderEnabled: false,
    });
    assert.equal(client.inserted.length, 1);
    assert.equal(client.inserted[0]?.eligible, 3);
    assert.equal(client.inserted[0]?.sent, 1);
    assert.equal(client.inserted[0]?.skipped_no_signals, 1);
    assert.equal(client.inserted[0]?.failed, 1);
    assert.equal(client.inserted[0]?.sender_enabled, false);
  });

  await runTest("a missing table does not throw", async () => {
    for (const code of ["42P01", "PGRST205"] as const) {
      const client = logInsertClient({
        error: { code, message: "Could not find the table 'public.digest_send_log' in the schema cache" },
      });
      __setDigestSupabaseForTests(client);
      await recordDigestSendLog({
        eligible: 0,
        sent: 0,
        skippedNoSignals: 0,
        failed: 0,
        senderEnabled: true,
      });
      assert.equal(client.inserted.length, 1);
    }
  });
}

void main();
