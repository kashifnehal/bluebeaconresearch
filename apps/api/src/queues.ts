import { Queue } from "bullmq";
import { getRedis } from "./clients/redis";

export const QUEUE_NAMES = {
  aiClassification: "ai-classification",
  signalGeneration: "signal-generation",
  alertDispatcher: "alert-dispatcher",
  priceSync: "price-sync",
} as const;

export function buildQueues() {
  const connection = getRedis();
  return {
    aiClassification: new Queue(QUEUE_NAMES.aiClassification, { connection }),
    signalGeneration: new Queue(QUEUE_NAMES.signalGeneration, { connection }),
    alertDispatcher: new Queue(QUEUE_NAMES.alertDispatcher, { connection }),
    priceSync: new Queue(QUEUE_NAMES.priceSync, { connection }),
  };
}

