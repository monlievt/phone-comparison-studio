// packages/core/src/config/loader.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadEnv, loadAiConfig, _resetConfigCache } from './loader.js';
import { tmpdir } from 'os';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

describe('loadEnv', () => {
  const original = { ...process.env };

  beforeEach(() => {
    _resetConfigCache();
  });

  afterEach(() => {
    // Restore env
    for (const key of Object.keys(process.env)) {
      if (!(key in original)) delete process.env[key];
    }
    Object.assign(process.env, original);
    _resetConfigCache();
  });

  it('throws a clear error when APP_PASSWORD is missing', () => {
    delete process.env['APP_PASSWORD'];
    expect(() => loadEnv()).toThrow(/APP_PASSWORD/);
  });

  it('throws a clear error when SESSION_SECRET is too short', () => {
    process.env['APP_PASSWORD'] = 'password123';
    process.env['SESSION_SECRET'] = 'tooshort';
    expect(() => loadEnv()).toThrow(/SESSION_SECRET/);
  });

  it('succeeds with required keys set', () => {
    process.env['APP_PASSWORD'] = 'password123';
    process.env['SESSION_SECRET'] = 'a'.repeat(32);
    const env = loadEnv();
    expect(env.APP_PASSWORD).toBe('password123');
    expect(env.RENDER_CONCURRENCY).toBe(3); // default
    expect(env.PUBLISH_MODE).toBe('manual'); // default
  });

  it('applies defaults for optional numeric fields', () => {
    process.env['APP_PASSWORD'] = 'password123';
    process.env['SESSION_SECRET'] = 'a'.repeat(32);
    const env = loadEnv();
    expect(env.LLM_CALLS_PER_VIDEO).toBe(8);
    expect(env.MAX_DISK_GB).toBe(20);
  });
});

describe('loadAiConfig', () => {
  let tmpDir: string;

  beforeEach(() => {
    _resetConfigCache();
    tmpDir = join(tmpdir(), `aicfg-${Date.now()}`);
    mkdirSync(tmpDir, { recursive: true });
  });

  afterEach(() => {
    _resetConfigCache();
  });

  it('throws when config/ai.json is missing', () => {
    expect(() => loadAiConfig(tmpDir)).toThrow(/ai\.json/);
  });

  it('throws when ai.json has invalid structure', () => {
    writeFileSync(join(tmpDir, 'ai.json'), JSON.stringify({ providers: [] }));
    expect(() => loadAiConfig(tmpDir)).toThrow();
  });

  it('loads a valid ai.json', () => {
    const cfg = {
      providers: [
        { id: 'gemini-pro', kind: 'gemini', model: 'gemini-2.5-pro' },
        { id: 'groq-free', kind: 'openai-compat', model: 'llama-3.3-70b-versatile', baseUrl: 'https://api.groq.com/openai/v1' },
      ],
      perVideoCallCap: 8,
      maxAttemptsPerProvider: 2,
    };
    writeFileSync(join(tmpDir, 'ai.json'), JSON.stringify(cfg));
    const result = loadAiConfig(tmpDir);
    expect(result.providers).toHaveLength(2);
    expect(result.perVideoCallCap).toBe(8);
  });
});
