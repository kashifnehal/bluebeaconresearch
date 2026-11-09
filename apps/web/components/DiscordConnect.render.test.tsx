// TASK W2-AUTH Part 2: DiscordConnect's load effect and upsertDiscord() must
// read the signed-in user from AuthProvider's context, never calling
// supabase.auth.getUser() itself.
import assert from "node:assert/strict";
import { createElement } from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { QueryClientProvider, QueryClient } from "@tanstack/react-query";

import { setupDom, setupSignedInSupabase } from "@/lib/test-render";
import { AuthProvider } from "@/components/auth/AuthProvider";

const document = setupDom();

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

async function main() {
  const { client } = await setupSignedInSupabase(document);
  let getUserCalls = 0;
  const originalGetUser = client.auth.getUser;
  client.auth.getUser = (async (...args: Parameters<typeof originalGetUser>) => {
    getUserCalls += 1;
    return originalGetUser(...args);
  }) as typeof client.auth.getUser;

  const originalFrom = client.from;
  client.from = ((table: string) => {
    if (table === "user_channels") {
      const builder: any = {
        select: () => builder,
        eq: () => builder,
        maybeSingle: async () => ({
          data: { discord_webhook_url: null, discord_connected_at: null },
          error: null,
        }),
      };
      return builder;
    }
    return originalFrom(table);
  }) as typeof client.from;

  const { DiscordConnect } = await import("./DiscordConnect");

  await runTest("DiscordConnect resolves the signed-in user from context, calling getUser() 0 times", async () => {
    const queryClient = new QueryClient();
    document.body.replaceChildren();
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    try {
      await act(async () => {
        root.render(
          createElement(
            QueryClientProvider,
            { client: queryClient },
            createElement(AuthProvider, null, createElement(DiscordConnect)),
          ),
        );
      });
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 30));
      });

      assert.equal(getUserCalls, 0, "DiscordConnect must not call supabase.auth.getUser()");
      assert.match(document.body.innerHTML, /data-testid="discord-connect"/);
    } finally {
      await act(async () => root.unmount());
      queryClient.clear();
    }
  });
}

main().then(() => {
  process.exit(process.exitCode ?? 0);
});
