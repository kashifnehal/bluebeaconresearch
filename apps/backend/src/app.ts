import Fastify from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";

import { getEnv } from "./env.js";
import { signalsRoutes } from "./routes/signals.js";
import { registerAuth } from "./middleware/auth.middleware.js";
import { usersRoutes } from "./routes/users.js";
import { commoditiesRoutes } from "./routes/commodities.js";
import { apiKeysRoutes } from "./routes/api-keys.js";
import { alertsRoutes } from "./routes/alerts.js";
import { webhooksRoutes } from "./routes/webhooks.js";
import { pricesRoutes } from "./routes/prices.js";
import { eventsRoutes } from "./routes/events.js";
import { telegramRoutes } from "./routes/telegram.js";
import { backtestingRoutes } from "./routes/backtesting.js";
import { adminRoutes } from "./routes/admin.js";

export function buildApp() {
  const env = getEnv();
  const app = Fastify({ logger: { level: "info" } });

  app.register(helmet);
  // Fail closed, not open: if NEXT_PUBLIC_APP_URL is ever unset, `origin: true` would
  // reflect back *any* request's Origin header — combined with credentials: true,
  // that's an open CORS misconfiguration (mitigated today by this API using
  // token-based, not cookie-based, auth, but not something to rely on staying true).
  // `origin: false` rejects cross-origin requests outright instead.
  app.register(cors, {
    origin: env.NEXT_PUBLIC_APP_URL ? [env.NEXT_PUBLIC_APP_URL] : false,
    credentials: true,
  });

  // In-memory store, not Redis-backed. This previously passed the shared ioredis
  // client as the rate-limit store, which meant EVERY incoming request — including
  // Railway's own /health probe (registered below, with no rate-limit exemption) —
  // ran a Lua eval/evalsha against Redis before reaching any route handler. That's a
  // Redis command on every single request regardless of user count, and worse: when
  // Redis errors (e.g. quota exhaustion), @fastify/rate-limit propagates the failure
  // rather than failing open, so the entire API 500s on every request until Redis
  // recovers — a rate limiter taking down the whole service is the opposite of what
  // it's for. Railway runs this service at numReplicas: 1 today (railway.json has no
  // replica count set, defaulting to 1), so a single in-memory bucket enforces
  // correctly; if this service is ever scaled to multiple replicas, per-instance
  // in-memory limits will under-count a single client's true request rate across
  // instances — revisit then (same trade-off as apps/web/lib/ratelimit.ts).
  app.register(rateLimit, {
    max: 60,
    timeWindow: "1 minute",
  });

  app.register(swagger, {
    openapi: {
      info: { title: "Blue Beacon API", version: "1.0.0" },
    },
  });
  app.register(swaggerUi, { routePrefix: "/docs" });

  app.get("/", async () => ({ message: "Blue Beacon API is live", status: "ok" }));
  app.get("/health", async () => ({ status: "ok", uptime: process.uptime() }));

  registerAuth(app);

  app.register(signalsRoutes, { prefix: "/v1/signals" });
  app.register(usersRoutes, { prefix: "/v1/users" });
  app.register(commoditiesRoutes, { prefix: "/v1/commodities" });
  app.register(apiKeysRoutes, { prefix: "/v1/api-keys" });
  app.register(alertsRoutes, { prefix: "/v1/alerts" });
  app.register(webhooksRoutes, { prefix: "/v1/webhooks" });
  app.register(pricesRoutes, { prefix: "/v1/prices" });
  app.register(eventsRoutes, { prefix: "/v1/events" });
  app.register(telegramRoutes, { prefix: "/v1/telegram" });
  app.register(backtestingRoutes, { prefix: "/v1/backtesting" });
  app.register(adminRoutes, { prefix: "/v1/admin" });

  return app;
}

