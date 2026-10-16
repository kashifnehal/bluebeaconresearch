import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import type { User } from "@supabase/supabase-js";

import { resolveRouteUser } from "./supabase-server";

const here = dirname(fileURLToPath(import.meta.url));
const apiRoot = join(here, "../app/api");

function runTest(name: string, fn: () => Promise<void> | void) {
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

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) out.push(...walk(path));
    else if (name.endsWith(".ts") && !name.endsWith(".test.ts")) out.push(path);
  }
  return out;
}

async function main() {
  await runTest("claims mode does not call getUser", async () => {
    let getUserCalls = 0;
    const user = await resolveRouteUser(
      {
        getUser: async () => {
          getUserCalls += 1;
          return { data: { user: { id: "server" } as User } };
        },
        getClaims: async () => ({
          data: { claims: { sub: "local", email: "local@example.com" } },
          error: null,
        }),
      },
      "claims",
    );
    assert.equal(getUserCalls, 0);
    assert.equal(user?.id, "local");
    assert.equal(user?.email, "local@example.com");
  });

  await runTest("server mode still calls getUser", async () => {
    let getUserCalls = 0;
    let claimsCalls = 0;
    const user = await resolveRouteUser(
      {
        getUser: async () => {
          getUserCalls += 1;
          return { data: { user: { id: "server", email: "server@example.com" } as User } };
        },
        getClaims: async () => {
          claimsCalls += 1;
          return { data: null, error: null };
        },
      },
      "server",
    );
    assert.equal(getUserCalls, 1);
    assert.equal(claimsCalls, 0);
    assert.equal(user?.id, "server");
  });

  await runTest("an error or missing claims means signed out", async () => {
    const errored = await resolveRouteUser(
      {
        getUser: async () => {
          throw new Error("server mode must not run");
        },
        getClaims: async () => ({ data: null, error: { message: "bad token" } }),
      },
      "claims",
    );
    assert.equal(errored, null);

    const missing = await resolveRouteUser(
      {
        getUser: async () => {
          throw new Error("server mode must not run");
        },
        getClaims: async () => ({ data: { claims: {} }, error: null }),
      },
      "claims",
    );
    assert.equal(missing, null);
  });

  await runTest("verify claims is only in read-only GET route files", () => {
    const mutating = /export async function (POST|PUT|PATCH|DELETE)\b/;
    const offenders: string[] = [];
    for (const file of walk(apiRoot)) {
      const src = readFileSync(file, "utf8");
      if (src.includes('verify: "claims"') && mutating.test(src)) {
        offenders.push(file.slice(apiRoot.length + 1));
      }
    }
    assert.deepEqual(offenders, []);
  });
}

void main();
