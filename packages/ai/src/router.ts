// packages/ai/src/router.ts
// LLM Router: handles caching, rate-limit counting, provider fallback, and schema validation retry.

import { createHash } from 'crypto';
import { readFileSync } from 'fs';
import { join } from 'path';
import { Database, AiConfig, AiProvider } from '@phone-studio/core';
import { CallJsonOptions, LlmCallResult, ProviderCallParams } from './types.js';
import { callGemini } from './providers/gemini.js';
import { callOpenAiCompat } from './providers/openai-compat.js';

function readLiveEnvKey(keyName: string): string | undefined {
  if (process.env[keyName]) return process.env[keyName];
  try {
    const envPath = join(process.cwd(), '.env');
    const content = readFileSync(envPath, 'utf-8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const idx = trimmed.indexOf('=');
      if (idx !== -1) {
        const k = trimmed.slice(0, idx).trim();
        if (k === keyName) {
          let val = trimmed.slice(idx + 1).trim();
          const commentIdx = val.indexOf('#');
          if (commentIdx !== -1) val = val.slice(0, commentIdx).trim();
          return val || undefined;
        }
      }
    }
  } catch {
    // Ignore error reading file
  }
  return undefined;
}

export interface LlmRouterOptions {
  db?: Database.Database;
  aiConfig: AiConfig;
  apiKeys: {
    gemini?: string;
    groq?: string;
    [key: string]: string | undefined;
  };
  dailyLimits?: {
    [providerId: string]: number;
  };
}

export class LlmRouter {
  private db?: Database.Database;
  private config: AiConfig;
  private apiKeys: Record<string, string | undefined>;
  private dailyLimits: Record<string, number>;
  private perComparisonCalls: Map<string, number> = new Map();

  constructor(opts: LlmRouterOptions) {
    this.db = opts.db;
    this.config = opts.aiConfig;
    this.apiKeys = opts.apiKeys;
    this.dailyLimits = opts.dailyLimits ?? {
      'groq-free': 1000,
      'gemini-pro': 1500,
      'gemini-flash': 1500,
    };
  }

  /**
   * Generates a stable sha256 cache key.
   */
  private computeCacheKey(task: string, promptId: string, system: string, user: string): string {
    return createHash('sha256')
      .update(`${task}:${promptId}:${system}:${user}`)
      .digest('hex');
  }

  /**
   * Checks current daily usage from DB.
   */
  getDailyUsage(providerId: string, day = new Date().toISOString().slice(0, 10)): number {
    if (!this.db) return 0;
    const row = this.db
      .prepare('SELECT count FROM llm_usage WHERE provider = ? AND day = ?')
      .get(providerId, day) as { count: number } | undefined;
    return row?.count ?? 0;
  }

  /**
   * Increments daily usage count in DB.
   */
  private recordUsage(providerId: string, day = new Date().toISOString().slice(0, 10)): void {
    if (!this.db) return;
    this.db
      .prepare(
        `INSERT INTO llm_usage (provider, day, count)
         VALUES (?, ?, 1)
         ON CONFLICT(provider, day) DO UPDATE SET count = count + 1`
      )
      .run(providerId, day);
  }

  /**
   * Main entry point to call an LLM and get validated structured JSON output.
   */
  async callJson<T>(opts: CallJsonOptions<T>): Promise<LlmCallResult<T>> {
    const cacheKey = this.computeCacheKey(opts.task, opts.promptId, opts.systemPrompt, opts.userPrompt);

    // 1. Check cache unless skipCache is set (respect TTL, default 30 days)
    if (!opts.skipCache && this.db) {
      const cached = this.db
        .prepare('SELECT response_json, created_at FROM llm_cache WHERE key = ?')
        .get(cacheKey) as { response_json: string; created_at: string } | undefined;

      if (cached) {
        const ttlDays = opts.cacheTtlDays ?? 30;
        const ageMs = cached.created_at ? Date.now() - new Date(cached.created_at).getTime() : 0;
        const isFresh = ageMs <= ttlDays * 24 * 60 * 60 * 1000;
        if (isFresh) {
          try {
            const parsedJson = JSON.parse(cached.response_json);
            const validated = opts.schema.parse(parsedJson);
            return {
              data: validated,
              rawJson: cached.response_json,
              provider: 'cache',
              model: 'cache',
              fromCache: true,
              attempts: 0,
            };
          } catch {
            // If cached content fails current schema, proceed to call fresh
          }
        }
      }
    }

    // Enforce per-video LLM call cap (Hard Rule #9: <= 8 calls per video)
    if (opts.comparisonId) {
      const used = this.perComparisonCalls.get(opts.comparisonId) ?? 0;
      const cap = this.config.perVideoCallCap ?? 8;
      if (used >= cap) {
        throw new Error(`Per-video LLM call cap reached (${used}/${cap}) for comparison ${opts.comparisonId}`);
      }
    }

    const today = new Date().toISOString().slice(0, 10);
    const errors: string[] = [];

    // 2. Loop through configured providers in priority order (prefer grounding providers when requested)
    const providers = opts.requireGrounding
      ? [
          ...this.config.providers.filter((p) => p.supportsGrounding),
          ...this.config.providers.filter((p) => !p.supportsGrounding),
        ]
      : this.config.providers;

    for (const provider of providers) {
      // Check quota cap (protect against zero/empty limit)
      const usage = this.getDailyUsage(provider.id, today);
      const configuredLimit = this.dailyLimits[provider.id];
      const limit = (configuredLimit && configuredLimit > 0) ? configuredLimit : 1500;
      if (usage >= limit) {
        errors.push(`Provider ${provider.id} quota reached (${usage}/${limit})`);
        continue;
      }

      // Max 2 attempts per provider
      for (let attempt = 1; attempt <= (this.config.maxAttemptsPerProvider ?? 2); attempt++) {
        try {
          let userPrompt = opts.userPrompt;
          if (attempt > 1 && errors.length > 0) {
            // Append validation error feedback on retry
            userPrompt += `\n\nPREVIOUS ERROR: Your previous response was invalid: ${errors[errors.length - 1]}. Please output strictly valid JSON conforming to the schema.`;
          }

          const rawText = await this.dispatchProvider(provider, {
            systemPrompt: opts.systemPrompt,
            userPrompt,
            temperature: opts.temperature ?? 0.1,
            model: provider.model,
            supportsGrounding: provider.supportsGrounding,
          });

          // Record provider quota usage on every dispatched call
          this.recordUsage(provider.id, today);
          if (opts.comparisonId) {
            this.perComparisonCalls.set(
              opts.comparisonId,
              (this.perComparisonCalls.get(opts.comparisonId) ?? 0) + 1
            );
          }

          // Clean up JSON text if markdown code fences or surrounding text exist
          let jsonText = rawText.trim();
          if (jsonText.startsWith('```')) {
            jsonText = jsonText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
          }
          const firstBrace = jsonText.indexOf('{');
          const lastBrace = jsonText.lastIndexOf('}');
          if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
            jsonText = jsonText.substring(firstBrace, lastBrace + 1);
          }

          // Parse JSON and validate against Zod schema
          const parsed = JSON.parse(jsonText);
          const validated = opts.schema.parse(parsed);

          // Save to cache
          if (this.db) {
            const now = new Date().toISOString();
            this.db
              .prepare(
                `INSERT OR REPLACE INTO llm_cache (key, task, response_json, created_at)
                 VALUES (?, ?, ?, ?)`
              )
              .run(cacheKey, opts.task, JSON.stringify(validated), now);
          }

          return {
            data: validated,
            rawJson: rawText,
            provider: provider.id,
            model: provider.model,
            fromCache: false,
            attempts: attempt,
          };
        } catch (err: unknown) {
          const msg = `[${provider.id} attempt ${attempt}] ${err instanceof Error ? err.message : String(err)}`;
          errors.push(msg);
        }
      }
    }

    throw new Error(`All LLM providers failed for task "${opts.task}":\n${errors.join('\n')}`);
  }

  private async dispatchProvider(provider: AiProvider, params: Omit<ProviderCallParams, 'apiKey' | 'baseUrl'>): Promise<string> {
    if (provider.kind === 'gemini') {
      const apiKey = this.apiKeys.gemini || readLiveEnvKey('GEMINI_API_KEY');
      return callGemini({ ...params, apiKey });
    } else if (provider.kind === 'openai-compat') {
      const apiKey = (provider.id.includes('groq') ? this.apiKeys.groq : this.apiKeys[provider.id])
        || readLiveEnvKey('GROQ_API_KEY');
      return callOpenAiCompat({ ...params, apiKey, baseUrl: provider.baseUrl });
    } else {
      throw new Error(`Unsupported provider kind: ${provider.kind}`);
    }
  }
}
