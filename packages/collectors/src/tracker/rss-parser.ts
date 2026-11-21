// packages/collectors/src/tracker/rss-parser.ts
// Lightweight RSS XML parser using regex to avoid external dependency

export interface RssItem {
  title: string;
  link: string;
  pubDate?: string;
  description?: string;
}

export function parseRssFeed(xml: string): RssItem[] {
  const items: RssItem[] = [];
  const itemMatches = xml.match(/<item[\s\S]*?<\/item>/gi) ?? [];

  for (const itemXml of itemMatches) {
    const titleMatch = itemXml.match(/<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/i);
    const linkMatch = itemXml.match(/<link>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/link>/i);
    const pubDateMatch = itemXml.match(/<pubDate>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/pubDate>/i);
    const descMatch = itemXml.match(/<description>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/description>/i);

    const title = titleMatch ? titleMatch[1].trim() : '';
    const link = linkMatch ? linkMatch[1].trim() : '';
    const pubDate = pubDateMatch ? pubDateMatch[1].trim() : undefined;
    const description = descMatch ? descMatch[1].trim() : undefined;

    if (title && link) {
      items.push({ title, link, pubDate, description });
    }
  }

  return items;
}
