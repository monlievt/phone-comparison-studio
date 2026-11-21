// packages/publisher/src/publisher.test.ts
import { describe, it, expect, vi } from 'vitest';
import { HttpPublisher } from './http-publisher.js';
import { PublishRequest } from './types.js';

describe('HttpPublisher', () => {
  it('submits detect payload and returns ref', async () => {
    // Mock fs existsSync
    vi.mock('fs', () => ({
      existsSync: () => true,
      statSync: () => ({ size: 10485760 }),
    }));

    // Mock global fetch
    const mockFetch = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes('/api/v1/videos/detect')) {
        return {
          ok: true,
          json: async () => ({ id: 101, status: 'STAGING' }),
        };
      }
      return { ok: true, json: async () => ({}) };
    });
    vi.stubGlobal('fetch', mockFetch);

    const publisher = new HttpPublisher({
      baseUrl: 'http://127.0.0.1:8000',
      channelName: 'phone-studio',
    });

    const req: PublishRequest = {
      videoPath: '/data/renders/s25-vs-15.mp4',
      format: 'long',
      metadata: {
        title: 'Samsung S25 vs Xiaomi 15',
        description: 'Comparison',
        tags: ['samsung', 'xiaomi'],
      },
    };

    const res = await publisher.submit(req);
    expect(res.ref).toBe('101');
    expect(res.status).toBe('queued');
    expect(mockFetch).toHaveBeenCalledWith(
      'http://127.0.0.1:8000/api/v1/videos/detect',
      expect.objectContaining({ method: 'POST' })
    );
  });
});
