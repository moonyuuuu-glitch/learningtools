import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Readability } from '@mozilla/readability';
import { parseHTML } from 'linkedom';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).end();

  const url = (req.query.url as string) ?? '';
  if (!url) return res.status(400).json({ error: 'Missing ?url= parameter' });

  try {
    new URL(url); // validate
  } catch {
    return res.status(400).json({ error: 'Invalid URL' });
  }

  try {
    const html = await fetch(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml',
      },
      signal: AbortSignal.timeout(10_000),
    }).then((r) => r.text());

    const { document } = parseHTML(html);

    // Extract with Readability
    const reader = new Readability(document as unknown as Document);
    const article = reader.parse();

    // Fallback title from <title> tag
    const titleEl = document.querySelector('title');
    const fallbackTitle = titleEl?.textContent?.trim() ?? '';

    // Try to extract publish date from common meta tags
    const dateMeta =
      document.querySelector('meta[property="article:published_time"]')?.getAttribute('content') ??
      document.querySelector('meta[name="publish_date"]')?.getAttribute('content') ??
      document.querySelector('meta[name="date"]')?.getAttribute('content') ??
      document.querySelector('time')?.getAttribute('datetime') ??
      '';

    const publishDate = dateMeta ? dateMeta.slice(0, 10) : ''; // YYYY-MM-DD

    if (!article) {
      return res.status(200).json({
        title: fallbackTitle,
        content: '',
        excerpt: '',
        publishDate,
        sourceUrl: url,
        warning: 'Readability could not extract main content',
      });
    }

    return res.status(200).json({
      title: article.title || fallbackTitle,
      content: article.textContent?.trim() ?? '',
      excerpt: article.excerpt?.trim() ?? '',
      publishDate,
      sourceUrl: url,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return res.status(502).json({ error: `Failed to fetch article: ${message}` });
  }
}
