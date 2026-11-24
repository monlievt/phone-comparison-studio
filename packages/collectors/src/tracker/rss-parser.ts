// packages/collectors/src/tracker/rss-parser.ts
// Lightweight RSS 2.0 + Atom XML parser with zero external dependencies.

export interface RssItem {
  title: string;
  link: string;
  pubDate?: string;
  description?: string;
}

function decodeXmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;|&#8217;|&#8216;/g, "'")
    .replace(/&#8220;|&#8221;/g, '"')
    .replace(/&#8211;|&#8212;/g, '-')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)));
}

function extractTag(block: string, tagName: string): string | undefined {
  const re = new RegExp(`<${tagName}(?:\\s[^>]*)?>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?<\\/${tagName}>`, 'i');
  const match = block.match(re);
  if (!match) return undefined;
  return decodeXmlEntities(match[1].replace(/<[^>]+>/g, '').trim());
}

function extractAtomLink(entryXml: string): string {
  const alternate = entryXml.match(/<link[^>]*rel=["']alternate["'][^>]*href=["']([^"']+)["'][^>]*\/?>/i)
    ?? entryXml.match(/<link[^>]*href=["']([^"']+)["'][^>]*rel=["']alternate["'][^>]*\/?>/i);
  if (alternate) return decodeXmlEntities(alternate[1].trim());

  const anyHref = entryXml.match(/<link[^>]*href=["']([^"']+)["'][^>]*\/?>/i);
  if (anyHref) return decodeXmlEntities(anyHref[1].trim());

  return extractTag(entryXml, 'link') ?? '';
}

export function parseRssFeed(xml: string): RssItem[] {
  const items: RssItem[] = [];

  // 1. RSS 2.0 <item> blocks
  const itemMatches = xml.match(/<item\b[\s\S]*?<\/item>/gi) ?? [];
  for (const itemXml of itemMatches) {
    const title = extractTag(itemXml, 'title') ?? '';
    const link = extractTag(itemXml, 'link') ?? '';
    const pubDate = extractTag(itemXml, 'pubDate') ?? extractTag(itemXml, 'dc:date');
    const description = extractTag(itemXml, 'description');

    if (title && link) {
      items.push({ title, link, pubDate, description });
    }
  }

  if (items.length > 0) {
    return items;
  }

  // 2. Atom <entry> blocks (e.g. Apple Newsroom, Google blogs)
  const entryMatches = xml.match(/<entry\b[\s\S]*?<\/entry>/gi) ?? [];
  for (const entryXml of entryMatches) {
    const title = extractTag(entryXml, 'title') ?? '';
    const link = extractAtomLink(entryXml);
    const pubDate = extractTag(entryXml, 'published') ?? extractTag(entryXml, 'updated');
    const description = extractTag(entryXml, 'summary') ?? extractTag(entryXml, 'content');

    if (title && link) {
      items.push({ title, link, pubDate, description });
    }
  }

  return items;
}
