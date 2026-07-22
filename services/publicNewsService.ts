import type { NewsItem } from '../types';

// Public crypto news via CryptoPanic (https://cryptopanic.com/developers/api/).
// The free "Developer" tier needs a token; grab one at cryptopanic.com and set
// VITE_CRYPTOPANIC_TOKEN. Without it we simply return no public news and the
// Hot News page falls back to admin-curated items.

const CRYPTOPANIC_TOKEN = import.meta.env.VITE_CRYPTOPANIC_TOKEN as string | undefined;

export const hasPublicNews = Boolean(CRYPTOPANIC_TOKEN);

interface CryptoPanicResult {
  id: number;
  title: string;
  url: string;
  published_at: string;
  domain?: string;
  source?: { title?: string; domain?: string };
  currencies?: { code: string; title: string }[];
}

const mapResult = (r: CryptoPanicResult, fallbackCategory?: string): NewsItem => {
  const category = r.currencies?.[0]?.code || fallbackCategory || 'Crypto';
  return {
    id: `cp-${r.id}`,
    title: r.title,
    image: '', // free tier has no images; the card hides the image block
    description: '',
    link: r.url,
    source: r.source?.title || r.source?.domain || r.domain || 'CryptoPanic',
    category,
    publishedAt: r.published_at,
    createdAt: r.published_at,
    createdBy: 'cryptopanic',
  };
};

/**
 * Fetch public crypto news. Pass a currency code (e.g. "XLM", "BTC") to narrow
 * results to that asset. Returns [] when no token is configured or on error.
 */
export const fetchPublicNews = async (currency?: string): Promise<NewsItem[]> => {
  if (!CRYPTOPANIC_TOKEN) return [];

  const params = new URLSearchParams({
    auth_token: CRYPTOPANIC_TOKEN,
    public: 'true',
    kind: 'news',
  });
  if (currency && currency !== 'ALL') params.set('currencies', currency);

  try {
    const res = await fetch(`https://cryptopanic.com/api/v1/posts/?${params.toString()}`);
    if (!res.ok) return [];
    const data = await res.json();
    const results: CryptoPanicResult[] = Array.isArray(data?.results) ? data.results : [];
    return results.map((r) => mapResult(r, currency));
  } catch {
    return [];
  }
};

/**
 * Fetch Stellar-specific news. Kept separate so XLM coverage can be merged into
 * the default feed even when the general feed surfaces little Stellar activity.
 */
export const fetchStellarNews = (): Promise<NewsItem[]> => fetchPublicNews('XLM');
