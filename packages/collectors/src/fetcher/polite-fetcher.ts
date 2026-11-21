// packages/collectors/src/fetcher/polite-fetcher.ts
// Polite web fetcher with per-domain rate limiting, custom user-agent, and local disk/memory cache.

export interface FetcherOptions {
  cacheDir?: string;
  userAgent?: string;
  rateLimitMsPerHost?: number;
}

export class PoliteFetcher {
  private lastRequestTimeByHost: Map<string, number> = new Map();
  private userAgent: string;
  private rateLimitMs: number;
  private memoryCache: Map<string, { body: string; fetchedAt: number }> = new Map();

  constructor(opts: FetcherOptions = {}) {
    this.userAgent = opts.userAgent ?? 'Mozilla/5.0 (compatible; PhoneStudioBot/1.0; +https://phonestudio.local)';
    this.rateLimitMs = opts.rateLimitMsPerHost ?? 1000; // 1s default
  }

  async fetch(url: string, ttlSeconds = 86400): Promise<string> {
    // Check in-memory cache
    const now = Date.now();
    const cached = this.memoryCache.get(url);
    if (cached && now - cached.fetchedAt < ttlSeconds * 1000) {
      return cached.body;
    }

    const host = new URL(url).hostname;

    // Rate limiting: sleep if requested too quickly on same host
    const lastTime = this.lastRequestTimeByHost.get(host) ?? 0;
    const timeSinceLast = now - lastTime;
    if (timeSinceLast < this.rateLimitMs) {
      const waitTime = this.rateLimitMs - timeSinceLast;
      await new Promise((resolve) => setTimeout(resolve, waitTime));
    }

    this.lastRequestTimeByHost.set(host, Date.now());

    const res = await globalThis.fetch(url, {
      headers: {
        'User-Agent': this.userAgent,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
    });

    if (!res.ok) {
      throw new Error(`Failed to fetch ${url} (HTTP ${res.status}): ${res.statusText}`);
    }

    const body = await res.text();
    this.memoryCache.set(url, { body, fetchedAt: Date.now() });

    return body;
  }
}
