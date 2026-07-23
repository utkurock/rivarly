// Stellar tweet feed, fetched from our own same-origin /api/tweets endpoint,
// which proxies the Xquik X/Twitter API server-side (keeps the key secret).

export interface Tweet {
  id: string;
  text: string;
  createdAt: string;
  url: string;
  likeCount: number;
  retweetCount: number;
  replyCount: number;
  viewCount?: number;
  author: {
    username: string;
    name: string;
    verified: boolean;
    avatar: string;
  };
  media: string[];
}

/**
 * Fetch Stellar-related tweets. Returns [] on any error (or when the endpoint
 * has no API key configured) so the Social page can show an empty state.
 */
export const fetchStellarTweets = async (query?: string): Promise<Tweet[]> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const qs = query ? `?q=${encodeURIComponent(query)}` : '';
    const res = await fetch(`/api/tweets${qs}`, { signal: controller.signal });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? (data as Tweet[]) : [];
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
};
