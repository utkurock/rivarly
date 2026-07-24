import { doc, getDoc } from 'firebase/firestore';
import { db, isFirebaseConfigured } from '../firebase';
import type { NewsItem } from '../types';

// Public crypto news, free and keyless.
//
// The browser calls our own same-origin /api/news endpoint, which aggregates
// public crypto RSS feeds server-side, adds an image and coin tags to each item,
// and returns JSON (Vercel Edge function in api/news.ts; a Vite middleware serves
// it in dev). No third-party proxy involved.

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

// ---- Firestore write-through cache -----------------------------------------
// The edge aggregation is slow on a cold cache (~several seconds fetching many
// RSS feeds). We mirror the latest result per view into Firestore so returning
// visitors paint instantly from a single ~10 KB document, then refresh in the
// background. Storage is tiny: ~20 items × ~0.5 KB ≈ 10 KB per view doc.

const cacheKey = (currency?: string) => (currency && currency !== 'ALL' ? currency : 'ALL');

/** Read the cached news for a view from Firestore. Returns [] if none/error. */
export const readNewsCache = async (currency?: string): Promise<NewsItem[]> => {
  if (!isFirebaseConfigured) return [];
  try {
    const snap = await getDoc(doc(db, 'newsCache', cacheKey(currency)));
    const items = snap.exists() ? (snap.data().items as NewsItem[]) : [];
    return Array.isArray(items) ? items : [];
  } catch {
    return [];
  }
};

/**
 * Ask the trusted server to refresh a view's cache. The server writes its own
 * aggregated feed (not client content), so the cache can't be poisoned.
 * Fire-and-forget.
 */
export const writeNewsCache = async (currency?: string): Promise<void> => {
  try {
    await fetch('/api/news-cache', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ view: cacheKey(currency) }),
    });
  } catch {
    // Non-fatal: caching is a best-effort optimization.
  }
};
