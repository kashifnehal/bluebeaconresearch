import { NextResponse } from "next/server";
import { redisTokenBucketAllowLua } from "@/lib/redis-token-bucket-lua";

export async function GET() {
  const featureFlag =
    (process.env.RATE_LIMIT_FEATURE_FLAG || "false").toLowerCase() === "true";
  const redisUrl = process.env.REDIS_URL || process.env.UPSTASH_REDIS_REST_URL;

  // Basic health summary
  const result: any = { featureFlag, redis: !!redisUrl, checks: {} };

  if (featureFlag && redisUrl) {
    try {
      // run a lightweight token-bucket check with a test key
      const res = await redisTokenBucketAllowLua(
        "health-check:ratelimit",
        1000,
        1000,
      );
      result.checks.lua = { ok: !!res, result: res };
      result.ok = res?.success === true || res?.remaining >= 0;
    } catch (err: any) {
      result.checks.lua = { ok: false, error: String(err) };
      result.ok = false;
    }
  } else {
    result.ok = true;
    result.checks.lua = { ok: false, skipped: true };
  }

  return NextResponse.json(result, { status: result.ok ? 200 : 500 });
}
