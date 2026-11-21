// packages/ai/src/router.ts
// LLM Router: handles caching, rate-limit counting, provider fallback, and schema validation retry.

import { createHash } from 'crypto';
import Database from 'better-sqlite3';
import { AiConfig, AiProvider } from '@phone-studio/core';
import { CallJsonOptions, LlmCallResult, ProviderCallParams } from './types.js';
import { callGemini } from './providers/gemini.js';
import { callOpenAiCompat } from './providers/openai-compat.js';

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

    // 1. Check cache unless skipCache is set
    if (!opts.skipCache && this.db) {
      const cached = this.db
        .prepare('SELECT response_json FROM llm_cache WHERE key = ?')
        .get(cacheKey) as { response_json: string } | undefined;

      if (cached) {
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

    const today = new Date().toISOString().slice(0, 10);
    const errors: string[] = [];

    // 2. Loop through configured providers in priority order
    for (const provider of this.config.providers) {
      // Check quota cap
      const usage = this.getDailyUsage(provider.id, today);
      const limit = this.dailyLimits[provider.id] ?? 1000;
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

          // Parse JSON and validate against Zod schema
          const parsed = JSON.parse(rawText);
          const validated = opts.schema.parse(parsed);

          // Success: record usage
          this.recordUsage(provider.id, today);

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
        } catch (err: any) {
          const msg = `[${provider.id} attempt ${attempt}] ${err?.message ?? String(err)}`;
          errors.push(msg);
        }
      }
    }

    throw new Error(`All LLM providers failed for task "${opts.task}":\n${errors.join('\n')}`);
  }

  private async dispatchProvider(provider: AiProvider, params: Omit<ProviderCallParams, 'apiKey' | 'baseUrl'>): Promise<string> {
    if (provider.kind === 'gemini') {
      const apiKey = this.apiKeys.gemini;
      return callGemini({ ...params, apiKey });
    } else if (provider.kind === 'openai-compat') {
      const apiKey = provider.id.includes('groq') ? this.apiKeys.groq : this.apiKeys[provider.id];
      return callOpenAiCompat({ ...params, apiKey, baseUrl: provider.baseUrl });
    } else {
      throw new Error(`Unsupported provider kind: ${provider.kind}`);
    }
  }
}
