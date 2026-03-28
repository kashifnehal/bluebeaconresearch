import Fastify from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";

import { getEnv } from "./env.js";
import { getRedis } from "./clients/redis.js";
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

export function buildApp() {
  const env = getEnv();
  const app = Fastify({ logger: { level: "info" } });

  app.register(helmet);
  app.register(cors, {
    origin: env.NEXT_PUBLIC_APP_URL ? [env.NEXT_PUBLIC_APP_URL] : true,
    credentials: true,
  });

  // Use Redis-backed rate limit if available
  const redis = getRedis();
  app.register(rateLimit, {
    ...(redis ? { redis } : {}),
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

  return app;
}

