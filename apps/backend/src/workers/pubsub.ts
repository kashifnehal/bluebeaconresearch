import { getRedis } from "../clients/redis.js";

export const REDIS_CHANNELS = {
  newSignal: "new_signal",
} as const;

export async function publishNewSignal(payload: { signalId: string }) {
  const redis = getRedis();
  if (!redis) return;
  await redis.publish(REDIS_CHANNELS.newSignal, JSON.stringify(payload));
}

