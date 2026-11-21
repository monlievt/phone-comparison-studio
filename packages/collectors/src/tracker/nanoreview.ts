// packages/collectors/src/tracker/nanoreview.ts
// Scrapes newly listed smartphones from Nanoreview

import { DiscoveredPhone } from './gsmarena.js';

export async function fetchNanoreviewCandidates(): Promise<DiscoveredPhone[]> {
  const url = 'https://nanoreview.net/en/phone-list/recent-smartphones';
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) PhoneStudio/1.0',
      },
    });

    if (!res.ok) {
      return [];
    }

    const html = await res.text();
    const discovered: DiscoveredPhone[] = [];

    // Simple HTML match for phone links like <a href="/en/phone/samsung-galaxy-s25-ultra">Samsung Galaxy S25 Ultra</a>
    const regex = /<a\s+href="\/en\/phone\/([a-z0-9\-]+)"[^>]*>([^<]+)<\/a>/gi;
    let match: RegExpExecArray | null;

    const seen = new Set<string>();

    while ((match = regex.exec(html)) !== null) {
      const slug = match[1];
      const fullName = match[2].trim();

      if (seen.has(slug) || fullName.length < 5) continue;
      seen.add(slug);

      // Split brand and model
      const parts = fullName.split(' ');
      const brand = parts[0];
      const model = parts.slice(1).join(' ');

      if (brand && model) {
        discovered.push({
          brand,
          model,
          sourceUrl: `https://nanoreview.net/en/phone/${slug}`,
          status: 'released',
        });
      }
    }

    return discovered;
  } catch (err) {
    console.warn('[tracker:nanoreview] Scrape error:', err);
    return [];
  }
}
