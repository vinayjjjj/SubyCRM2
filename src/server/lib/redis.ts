import IORedis from "ioredis";

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";

declare const globalThis: { __redis?: IORedis };

export const redis: IORedis =
  globalThis.__redis ??
  (globalThis.__redis = new IORedis(REDIS_URL, { maxRetriesPerRequest: null }));

export const redisConnection = { connection: redis };
