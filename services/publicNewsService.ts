import type { NewsItem } from '../types';

// Public crypto news from Google News RSS — free and keyless.
//
// Google News RSS doesn't send CORS headers, so the browser can't fetch it
// directly. We route requests through a CORS proxy. The default is a public
// one; for production reliability set VITE_NEWS_CORS_PROXY to your own proxy
// (any endpoint that takes a URL-encoded target and returns the raw body).

const CORS_PROXY =
  (import.meta.env.VITE_NEWS_CORS_PROXY as string | undefined) ||
  'https://api.allorigins.win/raw?url=';

// Public news is always available (no key required).
export const hasPublicNews = true;

// Search term used for each currency filter code.
const QUERY_FOR: Record<string, string> = {
  XLM: 'Stellar Lumens XLM crypto',
  BTC: 'Bitcoin crypto',
  ETH: 'Ethereum crypto',
  SOL: 'Solana crypto',
  XRP: 'XRP Ripple crypto',
};

const googleNewsUrl = (query: string): string =>
  `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`;

const proxied = (url: string): string => `${CORS_PROXY}${encodeURIComponent(url)}`;

const toIso = (pubDate: string): string => {
  const t = Date.parse(pubDate);
  return Number.isNaN(t) ? new Date().toISOString() : new Date(t).toISOString();
};

const parseRss = (xml: string, category: string): NewsItem[] => {
  const doc = new DOMParser().parseFromString(xml, 'text/xml');
  if (doc.querySelector('parsererror')) return [];

  return Array.from(doc.querySelectorAll('item')).map((item, i) => {
    const rawTitle = item.querySelector('title')?.textContent?.trim() || '';
    const link = item.querySelector('link')?.textContent?.trim() || '';
    const guid = item.querySelector('guid')?.textContent?.trim();
    const pubDate = item.querySelector('pubDate')?.textContent?.trim() || '';
    const source = item.querySelector('source')?.textContent?.trim() || 'Google News';

    // Google News formats titles as "Headline - Source"; drop the source suffix.
    const title =
      source && rawTitle.endsWith(` - ${source}`)
        ? rawTitle.slice(0, -(source.length + 3))
        : rawTitle;

    return {
      id: `gn-${guid || link || `${category}-${i}`}`,
      title,
      image: '', // Google News RSS carries no images; the card hides the image block
      description: '',
      link,
      source,
      category,
      publishedAt: toIso(pubDate),
      createdAt: toIso(pubDate),
      createdBy: 'google-news',
    };
  });
};

/**
 * Fetch public crypto news. Pass a currency code (e.g. "XLM", "BTC") to narrow
 * results to that asset. Returns [] on any network/parse error.
 */
export const fetchPublicNews = async (currency?: string): Promise<NewsItem[]> => {
  const code = currency && currency !== 'ALL' ? currency : undefined;
  const query = code ? QUERY_FOR[code] || `${code} crypto` : 'cryptocurrency';
  const category = code || 'Crypto';

  try {
    const res = await fetch(proxied(googleNewsUrl(query)));
    if (!res.ok) return [];
    const xml = await res.text();
    return parseRss(xml, category);
  } catch {
    return [];
  }
};

/**
 * Fetch Stellar-specific news. Kept separate so XLM coverage can be merged into
 * the default feed even when the general feed surfaces little Stellar activity.
 */
export const fetchStellarNews = (): Promise<NewsItem[]> => fetchPublicNews('XLM');
