import Fastify from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";

import { getEnv } from "./env";
import { getRedis } from "./clients/redis";
import { signalsRoutes } from "./routes/signals";

export function buildApp() {
  const env = getEnv();
  const app = Fastify({ logger: { level: "info" } });

  app.register(helmet);
  app.register(cors, {
    origin: env.NEXT_PUBLIC_APP_URL ? [env.NEXT_PUBLIC_APP_URL] : true,
    credentials: true,
  });

  // Use Redis-backed rate limit (safe default for shared instances).
  // If Redis is not configured, Fastify will throw at startup (intentionally).
  const redis = getRedis();
  app.register(rateLimit, {
    redis,
    max: 100,
    timeWindow: "1 minute",
  });

  app.register(swagger, {
    openapi: {
      info: { title: "GeoSignal API", version: "1.0.0" },
    },
  });
  app.register(swaggerUi, { routePrefix: "/docs" });

  app.get("/health", async () => ({ status: "ok", uptime: process.uptime() }));

  app.register(signalsRoutes, { prefix: "/v1/signals" });

  return app;
}

