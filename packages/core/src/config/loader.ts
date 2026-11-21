// packages/core/src/config/loader.ts
// Config loader: reads .env (via process.env), config/*.json, and DB settings table.
// T-003 implementation.

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { z } from 'zod';

// --- Env schema ---
const EnvSchema = z.object({
  APP_PASSWORD: z.string().min(8, 'APP_PASSWORD must be at least 8 chars'),
  SESSION_SECRET: z.string().min(32, 'SESSION_SECRET must be at least 32 chars'),
  DATA_DIR: z.string().default('./data'),
  BIND_HOST: z.string().default('127.0.0.1'),
  PORT: z.coerce.number().default(3000),

  GEMINI_API_KEY: z.string().optional(),
  GROQ_API_KEY: z.string().optional(),

  LLM_CALLS_PER_VIDEO: z.coerce.number().default(8),
  GEMINI_DAILY_LIMIT: z.coerce.number().optional(),
  GROQ_DAILY_LIMIT: z.coerce.number().default(1000),

  RENDER_CONCURRENCY: z.coerce.number().default(3),
  MAX_DISK_GB: z.coerce.number().default(20),

  PUBLISH_MODE: z.enum(['http', 'folder', 'manual']).default('manual'),
  YTAGENT_BASE_URL: z.string().url().optional(),
  YTAGENT_CHANNEL_NAME: z.string().optional(),
  YTAGENT_WATCH_DIR: z.string().optional(),
});

export type Env = z.infer<typeof EnvSchema>;

// --- AI provider config (config/ai.json) ---
const AiProviderSchema = z.object({
  id: z.string(),
  kind: z.enum(['gemini', 'openai-compat', 'ollama']),
  model: z.string(),
  baseUrl: z.string().url().optional(),
  supportsGrounding: z.boolean().optional(),
  note: z.string().optional(),
});

const AiConfigSchema = z.object({
  providers: z.array(AiProviderSchema).min(1),
  perVideoCallCap: z.number().default(8),
  maxAttemptsPerProvider: z.number().default(2),
});

export type AiConfig = z.infer<typeof AiConfigSchema>;
export type AiProvider = z.infer<typeof AiProviderSchema>;

// --- Loader ---

let _env: Env | null = null;
let _ai: AiConfig | null = null;

export function loadEnv(): Env {
  if (_env) return _env;

  const result = EnvSchema.safeParse(process.env);
  if (!result.success) {
    const msgs = result.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Config error — missing or invalid environment variables:\n${msgs}\n\nSee .env.example for required keys.`);
  }

  _env = result.data;
  return _env;
}

export function loadAiConfig(configDir: string): AiConfig {
  if (_ai) return _ai;

  const path = join(configDir, 'ai.json');
  if (!existsSync(path)) {
    throw new Error(
      `Missing config/ai.json. Copy config/ai.example.json → config/ai.json and fill in model names.\nExpected at: ${path}`
    );
  }

  const raw = JSON.parse(readFileSync(path, 'utf-8'));
  const result = AiConfigSchema.safeParse(raw);
  if (!result.success) {
    const msgs = result.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid config/ai.json:\n${msgs}`);
  }

  _ai = result.data;
  return _ai;
}

/** Reset cached config — for testing only */
export function _resetConfigCache(): void {
  _env = null;
  _ai = null;
}
