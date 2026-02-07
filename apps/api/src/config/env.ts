import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (!value) return fallback;
  const normalized = value.trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return fallback;
}

function parseTrustProxy(value: string | undefined): boolean | number | string {
  if (!value) return 1;
  const normalized = value.trim().toLowerCase();
  if (normalized === 'false' || normalized === '0') return false;
  if (normalized === 'true' || normalized === '1') return 1;
  const asNum = Number(value);
  if (Number.isInteger(asNum) && asNum >= 0) return asNum;
  return value;
}

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(8080),
  WEB_ORIGIN: z.string().url(),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  DATA_KEY: z.string().min(1),
  DATA_HASH_SALT: z.string().min(8),
  FEISHU_APP_ID: z.string().min(1),
  FEISHU_APP_SECRET: z.string().min(1),
  FEISHU_APP_TOKEN: z.string().min(1),
  FEISHU_TABLE_ID: z.string().min(1),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().default(60000),
  RATE_LIMIT_MAX: z.coerce.number().default(120),
  RATE_LIMIT_BURST: z.coerce.number().default(20),
  RATE_LIMIT_BACKEND: z.enum(['auto', 'redis', 'memory', 'off']).default('auto'),
  ALLOW_LEGACY_STATUS_QUERY: z.string().optional(),
  REDIS_REQUIRED: z.string().optional(),
  TRUST_PROXY: z.string().optional(),
  WORKER_CONCURRENCY: z.coerce.number().int().positive().default(1),
  CSRF_COOKIE_NAME: z.string().min(1).default('_fbif_csrf'),
  UPLOAD_PRESIGN_BASE_URL: z.string().url().optional(),
  SYNC_POLL_TIMEOUT_MS: z.coerce.number().default(30000)
});

const parsed = envSchema.parse({
  NODE_ENV: process.env.NODE_ENV,
  PORT: process.env.PORT,
  WEB_ORIGIN: process.env.WEB_ORIGIN,
  DATABASE_URL: process.env.DATABASE_URL,
  REDIS_URL: process.env.REDIS_URL,
  DATA_KEY: process.env.DATA_KEY,
  DATA_HASH_SALT: process.env.DATA_HASH_SALT,
  FEISHU_APP_ID: process.env.FEISHU_APP_ID,
  FEISHU_APP_SECRET: process.env.FEISHU_APP_SECRET,
  FEISHU_APP_TOKEN: process.env.FEISHU_APP_TOKEN,
  FEISHU_TABLE_ID: process.env.FEISHU_TABLE_ID,
  RATE_LIMIT_WINDOW_MS: process.env.RATE_LIMIT_WINDOW_MS,
  RATE_LIMIT_MAX: process.env.RATE_LIMIT_MAX,
  RATE_LIMIT_BURST: process.env.RATE_LIMIT_BURST,
  RATE_LIMIT_BACKEND: process.env.RATE_LIMIT_BACKEND,
  ALLOW_LEGACY_STATUS_QUERY: process.env.ALLOW_LEGACY_STATUS_QUERY,
  REDIS_REQUIRED: process.env.REDIS_REQUIRED,
  TRUST_PROXY: process.env.TRUST_PROXY,
  WORKER_CONCURRENCY: process.env.WORKER_CONCURRENCY,
  CSRF_COOKIE_NAME: process.env.CSRF_COOKIE_NAME,
  UPLOAD_PRESIGN_BASE_URL: process.env.UPLOAD_PRESIGN_BASE_URL,
  SYNC_POLL_TIMEOUT_MS: process.env.SYNC_POLL_TIMEOUT_MS
});

export const env = {
  ...parsed,
  ALLOW_LEGACY_STATUS_QUERY: parseBoolean(parsed.ALLOW_LEGACY_STATUS_QUERY, true),
  REDIS_REQUIRED: parseBoolean(parsed.REDIS_REQUIRED, false),
  TRUST_PROXY: parseTrustProxy(parsed.TRUST_PROXY)
};

export const isProd = env.NODE_ENV === 'production';
