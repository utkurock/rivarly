// Server-side live price feed for the Perp game, shared by the Vercel function
// (api/prices.ts) and the Vite dev middleware. Files prefixed with "_" are not
// treated as routes by Vercel.
//
// Spot prices for the four supported coins, pulled from Binance (fast, keyless)
// with a CoinGecko fallback. Also exposes 1-minute klines for the mini chart.
// No API key, no third-party proxy.

export type Coin = 'BTC' | 'ETH' | 'SOL' | 'XLM';
export const COINS: Coin[] = ['BTC', 'ETH', 'SOL', 'XLM'];

export interface CoinPrice {
  symbol: Coin;
  price: number;
  change24h: number; // percent
}
export type PriceMap = Record<Coin, CoinPrice>;

const BINANCE_SYMBOL: Record<Coin, string> = {
  BTC: 'BTCUSDT',
  ETH: 'ETHUSDT',
  SOL: 'SOLUSDT',
  XLM: 'XLMUSDT',
};
const COINGECKO_ID: Record<Coin, string> = {
  BTC: 'bitcoin',
  ETH: 'ethereum',
  SOL: 'solana',
  XLM: 'stellar',
};

// Kept short so that when Binance is unreachable (some regions block it) we fall
// through to CoinGecko fast instead of stalling the live ticker.
const TIMEOUT_MS = 2500;

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

async function fromBinance(): Promise<PriceMap | null> {
  try {
    const symbols = JSON.stringify(COINS.map((c) => BINANCE_SYMBOL[c]));
    const res = await timedFetch(`https://api.binance.com/api/v3/ticker/24hr?symbols=${encodeURIComponent(symbols)}`);
    if (!res.ok) return null;
    const arr = await res.json();
    if (!Array.isArray(arr)) return null;
    const bySymbol = new Map<string, any>(arr.map((t: any) => [t.symbol, t]));
    const out = {} as PriceMap;
    for (const c of COINS) {
      const t = bySymbol.get(BINANCE_SYMBOL[c]);
      if (!t) return null;
      out[c] = { symbol: c, price: Number(t.lastPrice), change24h: Number(t.priceChangePercent) };
    }
    return out;
  } catch {
    return null;
  }
}

async function fromCoinGecko(): Promise<PriceMap | null> {
  try {
    const ids = COINS.map((c) => COINGECKO_ID[c]).join(',');
    const res = await timedFetch(
      `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd&include_24hr_change=true`
    );
    if (!res.ok) return null;
    const data = await res.json();
    const out = {} as PriceMap;
    for (const c of COINS) {
      const row = data?.[COINGECKO_ID[c]];
      if (!row || typeof row.usd !== 'number') return null;
      out[c] = { symbol: c, price: row.usd, change24h: Number(row.usd_24h_change) || 0 };
    }
    return out;
  } catch {
    return null;
  }
}

/** All four spot prices. Returns null only if every source fails. */
export async function getPrices(): Promise<PriceMap | null> {
  return (await fromBinance()) || (await fromCoinGecko());
}

/**
 * A single coin's spot price, used server-side to open/settle perp positions.
 * Returns null if unavailable (caller must refuse to settle on a null price).
 */
export async function getSpotPrice(coin: Coin): Promise<number | null> {
  const map = await getPrices();
  const p = map?.[coin]?.price;
  return typeof p === 'number' && Number.isFinite(p) && p > 0 ? p : null;
}

export interface Candle { t: number; o: number; h: number; l: number; c: number }

/** Recent 1-minute klines for the mini chart (Binance only; [] if unavailable). */
export async function getKlines(coin: Coin, limit = 60): Promise<Candle[]> {
  try {
    const res = await timedFetch(
      `https://api.binance.com/api/v3/klines?symbol=${BINANCE_SYMBOL[coin]}&interval=1m&limit=${Math.min(Math.max(limit, 1), 200)}`
    );
    if (!res.ok) return [];
    const arr = await res.json();
    if (!Array.isArray(arr)) return [];
    return arr.map((k: any[]) => ({
      t: Number(k[0]),
      o: Number(k[1]),
      h: Number(k[2]),
      l: Number(k[3]),
      c: Number(k[4]),
    }));
  } catch {
    return [];
  }
}
