// packages/collectors/src/fetcher/html-extractor.ts
// Extracts clean, readable text from HTML by stripping scripts, styles, and navigational junk.

export function extractReadableText(html: string): string {
  if (!html) return '';

  let text = html;

  // 1. Remove script, style, head, svg, noscript, and iframe tags
  text = text.replace(/<(script|style|head|svg|noscript|iframe)[^>]*>[\s\S]*?<\/\1>/gi, ' ');

  // 2. Remove HTML comments
  text = text.replace(/<!--[\s\S]*?-->/g, ' ');

  // 3. Replace common block elements with newlines for readable structure
  text = text.replace(/<\/(p|div|tr|h1|h2|h3|h4|h5|h6|li|table|section|article)>/gi, '\n');
  text = text.replace(/<br\s*[\/]?>/gi, '\n');

  // 4. Strip remaining HTML tags
  text = text.replace(/<[^>]+>/g, ' ');

  // 5. Decode common HTML entities
  text = text
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&times;/gi, '×');

  // 6. Normalize whitespace: reduce multiple blank lines and spaces
  text = text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .join('\n');

  return text;
}
