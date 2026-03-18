// Legacy combined entrypoint. For production, prefer:
// - `src/server.ts` for the HTTP API
// - `src/workers.ts` for BullMQ + cron jobs
import "./server";

