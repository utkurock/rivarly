import type { NewsItem } from '../types';

// Public crypto news from Google News — free and keyless.
//
// The browser calls our own same-origin /api/news endpoint, which fetches Google
// News RSS server-side, adds an image and coin tags to each item, and returns JSON
// (Vercel Edge function in api/news.ts; a Vite middleware serves it in dev). No
// third-party proxy involved.

// Public news is always available.
export const hasPublicNews = true;

/**
 * Fetch public crypto news. Pass a currency code (e.g. "XLM", "BTC") to narrow
 * results to that asset. Returns [] on any network error.
 */
export const fetchPublicNews = async (currency?: string): Promise<NewsItem[]> => {
  const code = currency && currency !== 'ALL' ? currency : undefined;
  try {
    const qs = code ? `?currency=${encodeURIComponent(code)}` : '';
    const res = await fetch(`/api/news${qs}`);
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? (data as NewsItem[]) : [];
  } catch {
    return [];
  }
};

/**
 * Fetch Stellar-specific news. Kept separate so XLM coverage can be merged into
 * the default feed even when the general feed surfaces little Stellar activity.
 */
export const fetchStellarNews = (): Promise<NewsItem[]> => fetchPublicNews('XLM');
