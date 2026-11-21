// packages/collectors/src/fetcher/fetcher.test.ts
import { describe, it, expect } from 'vitest';
import { extractReadableText } from './html-extractor.js';
import { PoliteFetcher } from './polite-fetcher.js';

describe('extractReadableText', () => {
  it('strips scripts and styles', () => {
    const html = `
      <html>
        <head><style>body { color: red; }</style></head>
        <body>
          <script>console.log("bad");</script>
          <h1>Samsung Galaxy S25 Ultra</h1>
          <p>Battery: 5000 mAh</p>
        </body>
      </html>
    `;
    const text = extractReadableText(html);
    expect(text).not.toContain('color: red');
    expect(text).not.toContain('console.log');
    expect(text).toContain('Samsung Galaxy S25 Ultra');
    expect(text).toContain('Battery: 5000 mAh');
  });

  it('decodes HTML entities and normalizes newlines', () => {
    const html = `<p>Screen &amp; Display: 120&nbsp;Hz &times; 4K</p>`;
    const text = extractReadableText(html);
    expect(text).toBe('Screen & Display: 120 Hz × 4K');
  });
});

describe('PoliteFetcher', () => {
  it('instantiates with polite settings', () => {
    const fetcher = new PoliteFetcher({ rateLimitMsPerHost: 500 });
    expect(fetcher).toBeDefined();
  });
});
