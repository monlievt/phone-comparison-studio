// packages/ai/src/router.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import { z } from 'zod';
import { LlmRouter } from './router.js';
import { generateTemplateCopy, CopyAllSchema } from './prompts/index.js';

describe('LlmRouter', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
    db.exec(`
      CREATE TABLE IF NOT EXISTS llm_usage (
        provider TEXT,
        day TEXT,
        count INTEGER,
        PRIMARY KEY(provider, day)
      );

      CREATE TABLE IF NOT EXISTS llm_cache (
        key TEXT PRIMARY KEY,
        task TEXT,
        response_json TEXT,
        created_at TEXT
      );
    `);
    vi.restoreAllMocks();
  });

  it('retrieves from cache when present', async () => {
    const cachedData = { name: 'Galaxy S25', price: 799 };
    db.prepare('INSERT INTO llm_cache (key, task, response_json, created_at) VALUES (?, ?, ?, ?)').run(
      // We will compute key dynamically or skip cache test
      'test-key',
      'test_task',
      JSON.stringify(cachedData),
      new Date().toISOString()
    );

    const router = new LlmRouter({
      db,
      aiConfig: { providers: [{ id: 'gemini-pro', kind: 'gemini', model: 'gemini-2.5-pro' }] },
      apiKeys: {},
    });

    // Mock computeCacheKey private behavior by calling with identical params
    const schema = z.object({ name: z.string(), price: z.number() });
    (router as any).computeCacheKey = () => 'test-key';

    const result = await router.callJson({
      task: 'test_task',
      promptId: 'test@v1',
      systemPrompt: 'sys',
      userPrompt: 'usr',
      schema,
    });

    expect(result.fromCache).toBe(true);
    expect(result.data).toEqual(cachedData);
  });

  it('records daily usage and enforces daily limit', async () => {
    const today = new Date().toISOString().slice(0, 10);
    db.prepare('INSERT INTO llm_usage (provider, day, count) VALUES (?, ?, ?)').run('gemini-pro', today, 10);

    const router = new LlmRouter({
      db,
      aiConfig: { providers: [{ id: 'gemini-pro', kind: 'gemini', model: 'gemini-2.5-pro' }] },
      apiKeys: { gemini: 'key' },
      dailyLimits: { 'gemini-pro': 10 }, // Limit reached!
    });

    const schema = z.object({ ok: z.boolean() });
    await expect(
      router.callJson({
        task: 'test',
        promptId: 'p@v1',
        systemPrompt: 's',
        userPrompt: 'u',
        schema,
      })
    ).rejects.toThrow(/quota reached/);
  });

  it('falls back to second provider when first provider throws', async () => {
    const router = new LlmRouter({
      db,
      aiConfig: {
        providers: [
          { id: 'gemini-pro', kind: 'gemini', model: 'gemini-2.5-pro' },
          { id: 'groq-free', kind: 'openai-compat', model: 'llama-3.3-70b-versatile', baseUrl: 'https://api.groq.com/openai/v1' },
        ],
        maxAttemptsPerProvider: 1,
      },
      apiKeys: { gemini: 'key', groq: 'key' },
    });

    // Mock dispatchProvider: gemini fails, groq succeeds
    vi.spyOn(router as any, 'dispatchProvider').mockImplementation(async (provider: any) => {
      if (provider.id === 'gemini-pro') {
        throw new Error('Gemini 503 Overloaded');
      }
      return JSON.stringify({ success: true, count: 42 });
    });

    const schema = z.object({ success: z.boolean(), count: z.number() });
    const res = await router.callJson({
      task: 'test_fallback',
      promptId: 'p@v1',
      systemPrompt: 's',
      userPrompt: 'u',
      schema,
    });

    expect(res.provider).toBe('groq-free');
    expect(res.data).toEqual({ success: true, count: 42 });
  });
});

describe('generateTemplateCopy', () => {
  it('generates compliant copy without LLM', () => {
    const copy = generateTemplateCopy(
      [
        { name: 'Samsung Galaxy S25', priceUSD: 799 },
        { name: 'Xiaomi 15', priceUSD: 749 },
      ],
      'Samsung Galaxy S25'
    );

    expect(copy.titles.length).toBeGreaterThanOrEqual(1);
    expect(copy.titles[0].length).toBeLessThanOrEqual(60);
    expect(copy.hook.length).toBeLessThanOrEqual(40);
    expect(copy.description).toContain('Samsung Galaxy S25');
    expect(copy.description).toContain('Xiaomi 15');
    expect(CopyAllSchema.safeParse(copy).success).toBe(true);
  });
});
