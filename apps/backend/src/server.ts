import * as Sentry from "@sentry/node";

import { buildApp } from "./app.js";
import { getEnv } from "./env.js";

async function main() {
  const env = getEnv();

  if (process.env.SENTRY_DSN) {
    Sentry.init({ dsn: process.env.SENTRY_DSN });
  }

  const app = buildApp();
  const address = await app.listen({ port: env.PORT, host: "0.0.0.0" });
  app.log.info(`API listening on ${address}`);
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e);
  process.exit(1);
});

