// Server-side Stellar tweet feed, shared by the Vercel function (api/tweets.ts)
// and the Vite dev middleware (vite.config.ts). Files prefixed with "_" are not
// treated as routes by Vercel.
//
// It calls the Xquik X/Twitter scraper API (https://xquik.com) server-side with
// a secret key, so the key is never shipped to the browser and there is no CORS
// problem. Returns a compact, ready-to-render list of Stellar-related tweets.

export interface Tweet {
  id: string;
  text: string;
  createdAt: string; // ISO date
  url: string; // https://x.com/<user>/status/<id>
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
  media: string[]; // image URLs
}

const API = 'https://xquik.com/api/v1/x/tweets/search';
const FETCH_TIMEOUT_MS = 9000;

// Default search: Stellar-related chatter, weighted to signal over noise.
// Overridable via ?q= on the endpoint.
const DEFAULT_QUERY = '(Stellar OR $XLM OR #Stellar OR Soroban OR "Stellar Network")';

const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
const str = (v: unknown): string => (typeof v === 'string' ? v : '');

// The wrapper key and some field names vary between API versions, so read
// defensively with a few known aliases.
function pick<T = unknown>(obj: any, ...keys: string[]): T | undefined {
  for (const k of keys) {
    if (obj && obj[k] !== undefined && obj[k] !== null) return obj[k] as T;
  }
  return undefined;
}

function mapTweet(raw: any): Tweet | null {
  const id = str(pick(raw, 'id', 'id_str', 'tweetId', 'rest_id'));
  if (!id) return null;

  const authorRaw = pick<any>(raw, 'author', 'user', 'account') || {};
  const username = str(pick(authorRaw, 'username', 'screen_name', 'handle')).replace(/^@/, '');
  const name = str(pick(authorRaw, 'name', 'displayName', 'fullName')) || username;
  const avatar = str(pick(authorRaw, 'profilePicture', 'profile_image_url', 'avatar', 'profileImageUrl'));
  const verified = Boolean(pick(authorRaw, 'verified', 'isVerified', 'isBlueVerified'));

  const mediaRaw = pick<any[]>(raw, 'mediaUrls', 'media', 'photos', 'images') || [];
  const media = Array.isArray(mediaRaw)
    ? mediaRaw
        .map((m) => (typeof m === 'string' ? m : str(pick(m, 'url', 'media_url_https', 'src'))))
        .filter((u) => u && /^https?:\/\//.test(u) && !/\.mp4|video/i.test(u))
    : [];

  return {
    id,
    text: str(pick(raw, 'text', 'full_text', 'fullText', 'content')),
    createdAt: str(pick(raw, 'createdAt', 'created_at', 'date', 'time')) || new Date().toISOString(),
    url: username ? `https://x.com/${username}/status/${id}` : `https://x.com/i/status/${id}`,
    likeCount: num(pick(raw, 'likeCount', 'favoriteCount', 'favorite_count', 'likes')),
    retweetCount: num(pick(raw, 'retweetCount', 'retweet_count', 'retweets')),
    replyCount: num(pick(raw, 'replyCount', 'reply_count', 'replies')),
    viewCount: num(pick(raw, 'viewCount', 'view_count', 'views')) || undefined,
    author: { username, name, verified, avatar },
    media,
  };
}

async function fetchTweets(query: string, attempt = 0): Promise<any[] | null> {
  const key = process.env.XQUIK_API_KEY;
  if (!key) return null; // no key configured — caller renders an empty state

  const url = `${API}?q=${encodeURIComponent(query)}&queryType=Top&limit=30&language=en`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: { accept: 'application/json', 'x-api-key': key },
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    // Accept a few common wrapper shapes.
    const list = Array.isArray(data)
      ? data
      : pick<any[]>(data, 'tweets', 'data', 'results', 'items') || [];
    return Array.isArray(list) ? list : null;
  } catch {
    if (attempt < 1) return fetchTweets(query, attempt + 1);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Fetch Stellar-related tweets, newest-first. Returns [] on any error or when no
 * API key is configured, so the Social page can show an empty state.
 */
export async function getStellarTweets(query?: string): Promise<Tweet[]> {
  const raw = await fetchTweets(query?.trim() || DEFAULT_QUERY);
  if (!raw) return [];
  const tweets = raw.map(mapTweet).filter((t): t is Tweet => t !== null);
  tweets.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  return tweets;
}
