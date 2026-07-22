import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db, isFirebaseConfigured } from '../firebase';
import type { NewsItem } from '../types';

// Public crypto news, free and keyless.
//
// The browser calls our own same-origin /api/news endpoint, which aggregates
// public crypto RSS feeds server-side, adds an image and coin tags to each item,
// and returns JSON (Vercel Edge function in api/news.ts; a Vite middleware serves
// it in dev). No third-party proxy involved.

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

/** Write-through: store the freshest news for a view. Fire-and-forget. */
export const writeNewsCache = async (currency: string | undefined, items: NewsItem[]): Promise<void> => {
  if (!isFirebaseConfigured || !items.length) return;
  try {
    await setDoc(doc(db, 'newsCache', cacheKey(currency)), {
      items,
      updatedAt: serverTimestamp(),
    });
  } catch {
    // Non-fatal: caching is a best-effort optimization.
  }
};
