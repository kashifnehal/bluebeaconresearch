#!/usr/bin/env node
// Simple integration tester for the Redis Lua token-bucket.
// Usage: REDIS_URL=redis://localhost:6379 node apps/web/scripts/test_redis_rate_limiter.js

import { redisTokenBucketAllowLua } from "@/lib/redis-token-bucket-lua";

async function run() {
  const key = `itest:${Date.now()}`;
  console.log("Testing redis token-bucket (Lua) for key:", key);

  const results = [];
  for (let i = 0; i < 10; i++) {
    const r = await redisTokenBucketAllowLua(key, 5, 10); // limit 5 per 10s
    console.log(i + 1, r);
    results.push(r);
  }

  const allowed = results.filter((r) => r.success).length;
  console.log(`allowed ${allowed} / ${results.length}`);
  process.exit(0);
}

run().catch((err) => {
  console.error(err);
  process.exit(2);
});
