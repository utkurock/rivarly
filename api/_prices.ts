// Server-side live price feed for the Perp game, shared by the Vercel function
// (api/prices.ts) and the Vite dev middleware. Files prefixed with "_" are not
// treated as routes by Vercel.
//
// Spot prices and candles for the four supported coins. Several public,
// keyless sources are queried IN PARALLEL and the first complete answer wins,
// because no single exchange is reachable everywhere: Binance is blocked in a
// number of regions, Coinbase in others, and CoinGecko's free tier rate-limits
// hard. Results are cached, and the last good answer is kept as a fallback so a
// transient upstream failure never blanks the ticker or the chart.

export type Coin = 'BTC' | 'ETH' | 'SOL' | 'XLM';
export const COINS: Coin[] = ['BTC', 'ETH', 'SOL', 'XLM'];

export interface CoinPrice {
  symbol: Coin;
  price: number;
  change24h: number; // percent
}
export type PriceMap = Record<Coin, CoinPrice>;

export type Interval = '1m' | '5m' | '15m';
export interface Candle { t: number; o: number; h: number; l: number; c: number }

const BINANCE_SYMBOL: Record<Coin, string> = { BTC: 'BTCUSDT', ETH: 'ETHUSDT', SOL: 'SOLUSDT', XLM: 'XLMUSDT' };
const OKX_INST: Record<Coin, string> = { BTC: 'BTC-USDT', ETH: 'ETH-USDT', SOL: 'SOL-USDT', XLM: 'XLM-USDT' };
const COINBASE_PRODUCT: Record<Coin, string> = { BTC: 'BTC-USD', ETH: 'ETH-USD', SOL: 'SOL-USD', XLM: 'XLM-USD' };
const COINGECKO_ID: Record<Coin, string> = { BTC: 'bitcoin', ETH: 'ethereum', SOL: 'solana', XLM: 'stellar' };

// Sources run concurrently, so this is the worst case for the whole lookup.
const TIMEOUT_MS = 3500;

async function timedFetch(url: string): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, {
      headers: { accept: 'application/json', 'user-agent': 'Starcast/1.0' },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

const json = async (url: string): Promise<any | null> => {
  try {
    const res = await timedFetch(url);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
};

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
};

/**
 * Resolve with the first task that produces a usable value; resolve with null
 * only once every task has failed. Unlike a sequential chain this costs one
 * timeout total instead of one per source.
 */
function firstGood<T>(tasks: Promise<T | null>[]): Promise<T | null> {
  return new Promise((resolve) => {
    let pending = tasks.length;
    if (!pending) return resolve(null);
    for (const task of tasks) {
      task.then(
        (value) => {
          if (value) resolve(value);
          else if (--pending === 0) resolve(null);
        },
        () => {
          if (--pending === 0) resolve(null);
        }
      );
    }
  });
}

// ---- Spot prices ------------------------------------------------------------

async function fromBinance(): Promise<PriceMap | null> {
  const symbols = JSON.stringify(COINS.map((c) => BINANCE_SYMBOL[c]));
  const arr = await json(`https://api.binance.com/api/v3/ticker/24hr?symbols=${encodeURIComponent(symbols)}`);
  if (!Array.isArray(arr)) return null;
  const bySymbol = new Map<string, any>(arr.map((t: any) => [t.symbol, t]));
  const out = {} as PriceMap;
  for (const c of COINS) {
    const t = bySymbol.get(BINANCE_SYMBOL[c]);
    const price = num(t?.lastPrice);
    if (!price) return null;
    out[c] = { symbol: c, price, change24h: num(t?.priceChangePercent) || 0 };
  }
  return out;
}

async function fromOkx(): Promise<PriceMap | null> {
  const rows = await Promise.all(
    COINS.map((c) => json(`https://www.okx.com/api/v5/market/ticker?instId=${OKX_INST[c]}`))
  );
  const out = {} as PriceMap;
  for (let i = 0; i < COINS.length; i++) {
    const t = rows[i]?.data?.[0];
    const price = num(t?.last);
    const open = num(t?.open24h);
    if (!price) return null;
    out[COINS[i]] = { symbol: COINS[i], price, change24h: open ? ((price - open) / open) * 100 : 0 };
  }
  return out;
}

async function fromCoinbase(): Promise<PriceMap | null> {
  const rows = await Promise.all(
    COINS.map((c) => json(`https://api.exchange.coinbase.com/products/${COINBASE_PRODUCT[c]}/stats`))
  );
  const out = {} as PriceMap;
  for (let i = 0; i < COINS.length; i++) {
    const price = num(rows[i]?.last);
    const open = num(rows[i]?.open);
    if (!price) return null;
    out[COINS[i]] = { symbol: COINS[i], price, change24h: open ? ((price - open) / open) * 100 : 0 };
  }
  return out;
}

// Last resort only: the free tier rate-limits aggressively, so it is never part
// of the parallel race — a 429 there would otherwise be self-inflicted.
async function fromCoinGecko(): Promise<PriceMap | null> {
  const ids = COINS.map((c) => COINGECKO_ID[c]).join(',');
  const data = await json(
    `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd&include_24hr_change=true`
  );
  const out = {} as PriceMap;
  for (const c of COINS) {
    const price = num(data?.[COINGECKO_ID[c]]?.usd);
    if (!price) return null;
    out[c] = { symbol: c, price, change24h: num(data?.[COINGECKO_ID[c]]?.usd_24h_change) || 0 };
  }
  return out;
}

// Fresh window for a shared answer, plus the last good map kept indefinitely as
// a safety net. Frequent polling from many clients collapses onto one upstream
// call per window.
const SPOT_FRESH_MS = 2000;
let spotCache: { at: number; map: PriceMap } | null = null;
let spotInflight: Promise<PriceMap | null> | null = null;

// One exchange serves both the spot ticker and the chart history. Mixing them
// would put the chart on one venue's candles and the live tail on another's
// last trade, and the two disagree by a few basis points — enough to show as a
// step at the end of the line and as a different number after a reload.
interface Source {
  name: string;
  spot: () => Promise<PriceMap | null>;
  klines: (coin: Coin, interval: Interval, limit: number) => Promise<Candle[] | null>;
}

const SOURCES: Source[] = [
  { name: 'binance', spot: fromBinance, klines: klinesFromBinance },
  { name: 'okx', spot: fromOkx, klines: klinesFromOkx },
  { name: 'coinbase', spot: fromCoinbase, klines: klinesFromCoinbase },
];

// Whichever exchange answered last is asked again first, so a session stays on
// a single venue instead of hopping between them. It is only re-elected when
// the current one actually fails, and both the ticker and the chart follow the
// same choice — they switch together or not at all.
let preferredSource: string | null = null;

async function fromPreferredSource<T>(run: (s: Source) => Promise<T | null>): Promise<T | null> {
  if (!preferredSource) return null;
  const source = SOURCES.find((s) => s.name === preferredSource);
  return source ? run(source) : null;
}

/** Ask every exchange at once, keep the first usable answer, and stick to it. */
async function raceSources<T>(run: (s: Source) => Promise<T | null>, lastResort: () => Promise<T | null>): Promise<T | null> {
  const winner = await firstGood<{ name: string; value: T }>(
    SOURCES.map((s) => run(s).then((value) => (value ? { name: s.name, value } : null)))
  );
  if (winner) {
    preferredSource = winner.name;
    return winner.value;
  }
  preferredSource = null;
  return lastResort();
}

async function loadSpot(): Promise<PriceMap | null> {
  const map =
    (await fromPreferredSource((s) => s.spot())) ||
    (await raceSources(
      (s) => s.spot(),
      () => fromCoinGecko()
    ));
  if (map) spotCache = { at: Date.now(), map };
  return map;
}

/**
 * All four spot prices. Serves the cached map inside the fresh window, keeps a
 * single upstream request in flight at a time, and falls back to the last known
 * map when every source is down. Returns null only if nothing was ever fetched.
 */
export async function getPrices(): Promise<PriceMap | null> {
  if (spotCache && Date.now() - spotCache.at < SPOT_FRESH_MS) return spotCache.map;
  if (!spotInflight) {
    spotInflight = loadSpot().finally(() => {
      spotInflight = null;
    });
  }
  const map = await spotInflight;
  return map || spotCache?.map || null;
}

/**
 * A single coin's spot price, used server-side to open/settle perp positions.
 * Money moves on this number, so a stale cache is not good enough: it demands a
 * price fetched within the last few seconds and returns null otherwise (the
 * caller must refuse to open or settle on a null price).
 */
export async function getSpotPrice(coin: Coin): Promise<number | null> {
  await getPrices();
  if (!spotCache || Date.now() - spotCache.at > 15_000) return null;
  const p = spotCache.map[coin]?.price;
  return typeof p === 'number' && Number.isFinite(p) && p > 0 ? p : null;
}

// ---- Klines (price history for the custom Perp chart) -----------------------

const OKX_BAR: Record<Interval, string> = { '1m': '1m', '5m': '5m', '15m': '15m' };
const COINBASE_GRANULARITY: Record<Interval, number> = { '1m': 60, '5m': 300, '15m': 900 };

const clampLimit = (limit: number) => Math.min(Math.max(Math.floor(limit) || 90, 1), 300);

async function klinesFromBinance(coin: Coin, interval: Interval, limit: number): Promise<Candle[] | null> {
  const arr = await json(
    `https://api.binance.com/api/v3/klines?symbol=${BINANCE_SYMBOL[coin]}&interval=${interval}&limit=${clampLimit(limit)}`
  );
  if (!Array.isArray(arr) || !arr.length) return null;
  return arr.map((k: any[]) => ({ t: num(k[0]), o: num(k[1]), h: num(k[2]), l: num(k[3]), c: num(k[4]) }));
}

// OKX returns newest-first arrays: [ts, o, h, l, c, vol, ...].
async function klinesFromOkx(coin: Coin, interval: Interval, limit: number): Promise<Candle[] | null> {
  const data = await json(
    `https://www.okx.com/api/v5/market/candles?instId=${OKX_INST[coin]}&bar=${OKX_BAR[interval]}&limit=${clampLimit(limit)}`
  );
  const rows = data?.data;
  if (!Array.isArray(rows) || !rows.length) return null;
  return rows
    .map((k: any[]) => ({ t: num(k[0]), o: num(k[1]), h: num(k[2]), l: num(k[3]), c: num(k[4]) }))
    .reverse();
}

// Coinbase returns newest-first arrays: [time(s), low, high, open, close, vol].
async function klinesFromCoinbase(coin: Coin, interval: Interval, limit: number): Promise<Candle[] | null> {
  const rows = await json(
    `https://api.exchange.coinbase.com/products/${COINBASE_PRODUCT[coin]}/candles?granularity=${COINBASE_GRANULARITY[interval]}`
  );
  if (!Array.isArray(rows) || !rows.length) return null;
  return rows
    .slice(0, clampLimit(limit))
    .map((k: any[]) => ({ t: num(k[0]) * 1000, o: num(k[3]), h: num(k[2]), l: num(k[1]), c: num(k[4]) }))
    .reverse();
}

// Free-tier fallback: [ts, price] points (≈5-min granularity for one day),
// flattened into close-only candles. Enough for a line chart.
async function klinesFromCoinGecko(coin: Coin, limit: number): Promise<Candle[] | null> {
  const data = await json(
    `https://api.coingecko.com/api/v3/coins/${COINGECKO_ID[coin]}/market_chart?vs_currency=usd&days=1`
  );
  const prices: [number, number][] = Array.isArray(data?.prices) ? data.prices : [];
  if (!prices.length) return null;
  return prices.slice(-clampLimit(limit)).map(([t, p]) => ({ t: num(t), o: num(p), h: num(p), l: num(p), c: num(p) }));
}

// One cache entry per coin+interval. The chart polls on a timer and every
// client shares the same series, so without this the upstreams (especially
// CoinGecko) get hammered into rate-limiting — which is exactly what made the
// chart intermittently fail to load.
const KLINE_FRESH_MS: Record<Interval, number> = { '1m': 15_000, '5m': 60_000, '15m': 120_000 };
const klineCache = new Map<string, { at: number; candles: Candle[] }>();
const klineInflight = new Map<string, Promise<Candle[] | null>>();

/** Recent price history for the perp chart, cached and multi-source. */
export async function getKlines(coin: Coin, interval: Interval = '1m', limit = 90): Promise<Candle[]> {
  const key = `${coin}:${interval}`;
  const cached = klineCache.get(key);
  if (cached && Date.now() - cached.at < KLINE_FRESH_MS[interval]) return cached.candles.slice(-clampLimit(limit));

  let inflight = klineInflight.get(key);
  if (!inflight) {
    inflight = (async () => {
      // Same venue as the ticker whenever possible, so the line and the live
      // price it ends on are quoted by one exchange.
      const candles =
        (await fromPreferredSource((s) => s.klines(coin, interval, limit))) ||
        (await raceSources(
          (s) => s.klines(coin, interval, limit),
          () => klinesFromCoinGecko(coin, limit)
        ));
      if (candles?.length) klineCache.set(key, { at: Date.now(), candles });
      return candles;
    })().finally(() => klineInflight.delete(key));
    klineInflight.set(key, inflight);
  }

  const fresh = await inflight;
  // Stale beats empty: a chart that keeps its last known series is far better
  // than one that collapses to "unavailable" on a single failed poll.
  const candles = fresh?.length ? fresh : cached?.candles || [];
  return candles.slice(-clampLimit(limit));
}
