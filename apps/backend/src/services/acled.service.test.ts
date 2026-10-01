import assert from "node:assert/strict";
import axios from "axios";
import { AcledAccessDeniedError, AcledService, describeAxiosError } from "./acled.service.js";

process.env.NODE_ENV = "test";
process.env.SUPABASE_URL = process.env.SUPABASE_URL || "http://localhost";
process.env.SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || "test-supabase-role-key";

function runTest(name: string, fn: () => void | Promise<void>) {
  try {
    const result = fn();
    if (result instanceof Promise) {
      return result.then(() => console.log(`✔ ${name}`));
    }
    console.log(`✔ ${name}`);
  } catch (err) {
    console.error(`✖ ${name}`);
    console.error(err);
    process.exitCode = 1;
  }
}

// axios's default export is a shared, mutable object under Node's CJS/ESM
// interop — monkey-patching .post/.get here is observable inside acled.service.ts's
// own `import axios from "axios"` in the same process, so no mocking library is
// needed (this codebase's other *.test.ts files use the same no-framework style).
type AxiosLike = { post: typeof axios.post; get: typeof axios.get };
const realPost = axios.post;
const realGet = axios.get;

function restoreAxios() {
  (axios as unknown as AxiosLike).post = realPost;
  (axios as unknown as AxiosLike).get = realGet;
}

function mockAxios(opts: {
  post?: typeof axios.post;
  get?: typeof axios.get;
}) {
  if (opts.post) (axios as unknown as AxiosLike).post = opts.post;
  if (opts.get) (axios as unknown as AxiosLike).get = opts.get;
}

function makeAxiosError(
  status: number,
  statusText: string,
  response?: { data?: unknown; headers?: Record<string, string> },
) {
  const err = new Error(`Request failed with status code ${status}`) as Error & {
    isAxiosError: boolean;
    response: { status: number; statusText: string; data?: unknown; headers?: Record<string, string> };
  };
  err.isAxiosError = true;
  err.response = { status, statusText, ...response };
  return err;
}

const TOKEN_RESPONSE = {
  data: {
    token_type: "Bearer",
    expires_in: 86_400,
    access_token: "test-access-token",
    refresh_token: "test-refresh-token",
  },
};

async function main() {
  process.env.ACLED_EMAIL = "test@example.com";
  process.env.ACLED_PASSWORD = "test-password";

  await runTest(
    "fetchRecentEvents: successful token + events returns the events array",
    async () => {
      let capturedTokenBody = "";
      let capturedAuthHeader = "";
      mockAxios({
        post: (async (url: string, body: string) => {
          capturedTokenBody = body;
          return TOKEN_RESPONSE;
        }) as typeof axios.post,
        get: (async (url: string, config?: { headers?: Record<string, string> }) => {
          capturedAuthHeader = config?.headers?.Authorization ?? "";
          return {
            data: {
              status: 200,
              success: true,
              count: 1,
              data: [
                {
                  event_id_cnty: "ABC1234",
                  event_date: "2026-09-30",
                  event_type: "Violence against civilians",
                  sub_event_type: "Attack",
                  country: "Nigeria",
                  latitude: "9.0765",
                  longitude: "7.3986",
                  notes: "Test event notes",
                  fatalities: "2",
                },
              ],
              last_update: "1",
              messages: [],
            },
          };
        }) as typeof axios.get,
      });

      const service = new AcledService();
      const events = await service.fetchRecentEvents();

      assert.equal(events.length, 1);
      assert.equal(events[0].event_id_cnty, "ABC1234");
      assert.match(capturedTokenBody, /grant_type=password/);
      assert.match(capturedTokenBody, /client_id=acled/);
      assert.equal(capturedAuthHeader, "Bearer test-access-token");
      restoreAxios();
    },
  );

  await runTest(
    "getAccessToken: login failure throws instead of returning null",
    async () => {
      mockAxios({
        post: (async () => {
          throw makeAxiosError(401, "Unauthorized");
        }) as typeof axios.post,
      });

      const service = new AcledService();
      await assert.rejects(
        () => service.fetchRecentEvents(),
        /ACLED login failed: HTTP 401 Unauthorized/,
      );
      restoreAxios();
    },
  );

  await runTest(
    "getAccessToken: 403 with a response body surfaces that body in the error message",
    async () => {
      mockAxios({
        post: (async () => {
          throw makeAxiosError(403, "Forbidden", {
            data: "blocked by policy",
            headers: { server: "cloudflare", "cf-ray": "test-ray-id" },
          });
        }) as typeof axios.post,
      });

      const service = new AcledService();
      await assert.rejects(
        () => service.fetchRecentEvents(),
        /blocked by policy/,
      );
      restoreAxios();
    },
  );

  await runTest(
    "getAccessToken: a 403 error message never leaks the email or password used to log in",
    async () => {
      mockAxios({
        post: (async () => {
          throw makeAxiosError(403, "Forbidden", { data: "blocked by policy" });
        }) as typeof axios.post,
      });

      const service = new AcledService();
      let message = "";
      try {
        await service.fetchRecentEvents();
      } catch (err) {
        message = err instanceof Error ? err.message : String(err);
      }
      assert.ok(message.includes("blocked by policy"));
      assert.ok(!message.includes(process.env.ACLED_EMAIL as string));
      assert.ok(!message.includes(process.env.ACLED_PASSWORD as string));
      restoreAxios();
    },
  );

  await runTest(
    "fetchRecentEvents: non-2xx read throws instead of returning []",
    async () => {
      mockAxios({
        post: (async () => TOKEN_RESPONSE) as typeof axios.post,
        get: (async () => {
          throw makeAxiosError(500, "Internal Server Error");
        }) as typeof axios.get,
      });

      const service = new AcledService();
      await assert.rejects(
        () => service.fetchRecentEvents(),
        /ACLED read failed: HTTP 500 Internal Server Error/,
      );
      restoreAxios();
    },
  );

  await runTest(
    "fetchRecentEvents: success with zero events returns an empty array (not an error)",
    async () => {
      mockAxios({
        post: (async () => TOKEN_RESPONSE) as typeof axios.post,
        get: (async () => ({
          data: {
            status: 200,
            success: true,
            count: 0,
            data: [],
            last_update: "1",
            messages: [],
          },
        })) as typeof axios.get,
      });

      const service = new AcledService();
      const events = await service.fetchRecentEvents();
      assert.deepEqual(events, []);
      restoreAxios();
    },
  );

  await runTest(
    "getAccessToken: missing credentials throws the recognized 'credentials missing' message",
    async () => {
      const email = process.env.ACLED_EMAIL;
      const password = process.env.ACLED_PASSWORD;
      delete process.env.ACLED_EMAIL;
      delete process.env.ACLED_PASSWORD;
      try {
        const service = new AcledService();
        await assert.rejects(
          () => service.getAccessToken(),
          /ACLED credentials missing/,
        );
      } finally {
        process.env.ACLED_EMAIL = email;
        process.env.ACLED_PASSWORD = password;
      }
    },
  );
  await runTest(
    "describeAxiosError: an object response body is logged as JSON text, never [object Object]",
    async () => {
      const text = describeAxiosError(
        makeAxiosError(403, "Forbidden", {
          data: { message: "Access denied" },
          headers: { server: "cloudflare", "cf-ray": "test-ray-id" },
        }),
      );
      assert.ok(text.includes('{"message":"Access denied"}'), text);
      assert.ok(!text.includes("[object Object]"), text);
      assert.ok(text.includes("HTTP 403 Forbidden"), text);
    },
  );

  await runTest(
    "describeAxiosError: a string body is still logged as text and capped at 200 chars",
    async () => {
      const text = describeAxiosError(
        makeAxiosError(500, "Internal Server Error", { data: "x".repeat(500) }),
      );
      const body = text.split(" | body: ")[1] ?? "";
      assert.equal(body.length, 200);
    },
  );

  await runTest(
    "fetchRecentEvents: a 403 on the read throws AcledAccessDeniedError with the JSON body in the message",
    async () => {
      mockAxios({
        post: (async () => TOKEN_RESPONSE) as typeof axios.post,
        get: (async () => {
          throw makeAxiosError(403, "Forbidden", { data: { message: "Access denied" } });
        }) as typeof axios.get,
      });

      const service = new AcledService();
      await assert.rejects(
        () => service.fetchRecentEvents(),
        (err: unknown) => {
          assert.ok(err instanceof AcledAccessDeniedError);
          assert.match((err as Error).message, /ACLED read failed: HTTP 403 Forbidden/);
          assert.match((err as Error).message, /Access denied/);
          return true;
        },
      );
      restoreAxios();
    },
  );

  await runTest(
    "fetchRecentEvents: a 500 on the read throws a plain Error, not AcledAccessDeniedError",
    async () => {
      mockAxios({
        post: (async () => TOKEN_RESPONSE) as typeof axios.post,
        get: (async () => {
          throw makeAxiosError(500, "Internal Server Error");
        }) as typeof axios.get,
      });

      const service = new AcledService();
      await assert.rejects(
        () => service.fetchRecentEvents(),
        (err: unknown) => {
          assert.ok(!(err instanceof AcledAccessDeniedError));
          return true;
        },
      );
      restoreAxios();
    },
  );

  await runTest(
    "getAccessToken: a 403 on LOGIN is not treated as a data-access denial",
    async () => {
      mockAxios({
        post: (async () => {
          throw makeAxiosError(403, "Forbidden", { data: "blocked by policy" });
        }) as typeof axios.post,
      });

      const service = new AcledService();
      await assert.rejects(
        () => service.fetchRecentEvents(),
        (err: unknown) => {
          assert.ok(!(err instanceof AcledAccessDeniedError));
          assert.match((err as Error).message, /ACLED login failed/);
          return true;
        },
      );
      restoreAxios();
    },
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => restoreAxios());
