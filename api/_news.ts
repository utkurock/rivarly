// Server-side crypto-news aggregator, shared by the Vercel function (api/news.ts)
// and the Vite dev middleware (vite.config.ts). Files prefixed with "_" are not
// treated as routes by Vercel.
//
// It pulls from several public publisher RSS feeds (which carry images and topic
// categories directly), derives coin tags (XLM, BTC, ...) from each headline, and
// returns ready-to-render JSON. No API key, no third-party proxy.

export interface PublicNewsItem {
  id: string;
  title: string;
  image: string;
  description: string;
  link: string;
  source: string;
  category: string;
  tags: string[];
  publishedAt: string;
  createdAt: string;
  createdBy: string;
}

interface Feed {
  url: string;
  source: string;
}

// General feeds for the default "All" view.
const GENERAL_FEEDS: Feed[] = [
  { url: 'https://decrypt.co/feed', source: 'Decrypt' },
  { url: 'https://cointelegraph.com/rss', source: 'Cointelegraph' },
  { url: 'https://cryptoslate.com/feed/', source: 'CryptoSlate' },
  { url: 'https://www.newsbtc.com/feed/', source: 'NewsBTC' },
  { url: 'https://bitcoinist.com/feed/', source: 'Bitcoinist' },
];

// Coin-specific tag feeds used when a currency filter is active. Multiple
// publishers per coin so coverage survives any single feed being down.
const COIN_FEEDS: Record<string, Feed[]> = {
  XLM: [
    { url: 'https://cointelegraph.com/rss/tag/stellar', source: 'Cointelegraph' },
    { url: 'https://bitcoinist.com/tag/stellar/feed/', source: 'Bitcoinist' },
    { url: 'https://www.newsbtc.com/tag/stellar/feed/', source: 'NewsBTC' },
    { url: 'https://cryptoslate.com/cryptos/stellar/feed/', source: 'CryptoSlate' },
  ],
  BTC: [
    { url: 'https://cointelegraph.com/rss/tag/bitcoin', source: 'Cointelegraph' },
    { url: 'https://bitcoinist.com/tag/bitcoin/feed/', source: 'Bitcoinist' },
  ],
  ETH: [
    { url: 'https://cointelegraph.com/rss/tag/ethereum', source: 'Cointelegraph' },
    { url: 'https://bitcoinist.com/tag/ethereum/feed/', source: 'Bitcoinist' },
  ],
  SOL: [
    { url: 'https://cointelegraph.com/rss/tag/solana', source: 'Cointelegraph' },
    { url: 'https://bitcoinist.com/tag/solana/feed/', source: 'Bitcoinist' },
  ],
};

// Coin detection for tagging. Order controls chip order.
const COINS: { code: string; re: RegExp }[] = [
  { code: 'XLM', re: /\b(xlm|stellar|lumens?)\b/i },
  { code: 'BTC', re: /\b(btc|bitcoin)\b/i },
  { code: 'ETH', re: /\b(eth|ethereum|ether)\b/i },
  { code: 'SOL', re: /\b(sol|solana)\b/i },
];

const UA = 'Mozilla/5.0 (compatible; Rivarly/1.0; +https://github.com/utkurock/rivarly)';
const MAX_ITEMS = 24;
const CACHE_TTL_MS = 5 * 60 * 1000;

const cache = new Map<string, { t: number; data: PublicNewsItem[] }>();

function decodeEntities(s: string): string {
  return s
    .replace(/<!\[CDATA\[|\]\]>/g, '')
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .trim();
}

function tagText(itemXml: string, name: string): string {
  const m = itemXml.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, 'i'));
  return m ? decodeEntities(m[1]) : '';
}

function extractImage(itemXml: string): string {
  const patterns = [
    /<media:content[^>]+url=["']([^"']+)["'][^>]*>/i,
    /<media:thumbnail[^>]+url=["']([^"']+)["']/i,
    /<enclosure[^>]+url=["']([^"']+)["'][^>]*type=["']image/i,
    /<enclosure[^>]+type=["']image[^>]*url=["']([^"']+)["']/i,
    /<img[^>]+src=["']([^"']+)["']/i, // inside content:encoded / description
  ];
  for (const re of patterns) {
    const m = itemXml.match(re);
    if (m && /^https?:\/\//.test(m[1])) return m[1].replace(/&amp;/g, '&');
  }
  return '';
}

function deriveTags(text: string, forced?: string): string[] {
  const tags: string[] = [];
  for (const c of COINS) if (c.re.test(text)) tags.push(c.code);
  if (forced && forced !== 'ALL' && !tags.includes(forced)) tags.unshift(forced);
  tags.push('Crypto'); // always keep a base tag
  return [...new Set(tags)];
}

function domainOf(url: string): string {
  const m = url.match(/^https?:\/\/([^/]+)/i);
  return m ? m[1].replace(/^www\./, '') : '';
}

async function fetchFeed(feed: Feed, forced?: string): Promise<PublicNewsItem[]> {
  let xml = '';
  try {
    const res = await fetch(feed.url, { headers: { 'User-Agent': UA } });
    if (!res.ok) return [];
    xml = await res.text();
  } catch {
    return [];
  }

  const rawItems = xml.match(/<item>[\s\S]*?<\/item>/gi) || [];
  return rawItems.map((raw, i): PublicNewsItem => {
    const title = tagText(raw, 'title');
    const link = tagText(raw, 'link') || (raw.match(/<link[^>]*>([^<]+)<\/link>/i)?.[1] ?? '');
    const guid = tagText(raw, 'guid');
    const pubDate = tagText(raw, 'pubDate') || tagText(raw, 'dc:date');
    const categories = (raw.match(/<category[^>]*>[\s\S]*?<\/category>/gi) || [])
      .map((c) => decodeEntities(c.replace(/<[^>]+>/g, '')))
      .join(' ');
    const creator = tagText(raw, 'dc:creator');
    const source = feed.source || domainOf(link) || creator || 'News';

    const t = Date.parse(pubDate);
    const iso = Number.isNaN(t) ? new Date().toISOString() : new Date(t).toISOString();
    const tags = deriveTags(`${title} ${categories}`, forced);

    return {
      id: `rss-${guid || link || `${feed.source}-${i}`}`,
      title,
      image: extractImage(raw),
      description: '',
      link: link.trim(),
      source,
      category: tags[0] || 'Crypto',
      tags,
      publishedAt: iso,
      createdAt: iso,
      createdBy: 'rss',
    };
  });
}

/**
 * Fetch, aggregate and tag public crypto news. Pass a currency code (e.g. "XLM")
 * to narrow to that asset. Returns [] on total failure. Cached per currency.
 */
export async function getNews(currency?: string): Promise<PublicNewsItem[]> {
  const code = currency && currency !== 'ALL' ? currency : undefined;
  const key = code || 'ALL';

  const cached = cache.get(key);
  if (cached && Date.now() - cached.t < CACHE_TTL_MS) return cached.data;

  // For a coin filter, pull its dedicated tag feed (whose items are about that
  // coin even if the headline omits the name, so force the tag there) AND scan
  // general feeds for items that genuinely mention the coin (no forced tag).
  const coinFeeds = code ? COIN_FEEDS[code] || [] : [];
  const results = await Promise.all([
    ...coinFeeds.map((f) => fetchFeed(f, code)),
    ...GENERAL_FEEDS.map((f) => fetchFeed(f, undefined)),
  ]);
  let items = results.flat();

  // When filtering by coin, keep only items actually tagged with that coin.
  if (code) items = items.filter((it) => it.tags.includes(code));

  // Dedupe by link, newest first.
  const seen = new Set<string>();
  const deduped: PublicNewsItem[] = [];
  for (const it of items) {
    const k = it.link || it.id;
    if (!it.title || !k || seen.has(k)) continue;
    seen.add(k);
    deduped.push(it);
  }
  deduped.sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());

  const out = deduped.slice(0, MAX_ITEMS);
  if (out.length) cache.set(key, { t: Date.now(), data: out });
  return out.length ? out : cached?.data || [];
}
