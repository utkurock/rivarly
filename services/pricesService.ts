// Live price feed for the Perp game, fetched from our own /api/prices endpoint.

export type Coin = 'BTC' | 'ETH' | 'SOL' | 'XLM';
export const COINS: Coin[] = ['BTC', 'ETH', 'SOL', 'XLM'];

export const COIN_META: Record<Coin, { name: string; color: string }> = {
  BTC: { name: 'Bitcoin', color: '#F7931A' },
  ETH: { name: 'Ethereum', color: '#627EEA' },
  SOL: { name: 'Solana', color: '#9945FF' },
  XLM: { name: 'Stellar', color: '#7D00FF' },
};

export interface CoinPrice {
  symbol: Coin;
  price: number;
  change24h: number;
}
export type PriceMap = Partial<Record<Coin, CoinPrice>>;

export type Interval = '1m' | '5m' | '15m';
export interface Candle { t: number; o: number; h: number; l: number; c: number }

export const fetchPrices = async (): Promise<PriceMap> => {
  return fetchPricesOnce();
};

const fetchPricesOnce = async (): Promise<PriceMap> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 9000);
  try {
    const res = await fetch('/api/prices', { signal: controller.signal });
    if (!res.ok) return {};
    const data = await res.json();
    return data && typeof data === 'object' ? (data as PriceMap) : {};
  } catch {
    return {};
  } finally {
    clearTimeout(timer);
  }
};

// ---- Shared live feed -------------------------------------------------------
// Every ticker, coin card and chart on the page reads the same poll. Without
// this each mounted component ran its own timer, multiplying identical requests
// and pushing the upstream sources into rate-limiting — which is what made
// prices intermittently vanish and jump around between refreshes.

type PriceListener = (prices: PriceMap) => void;

const POLL_MS = 3000;
const listeners = new Set<PriceListener>();
let latest: PriceMap = {};
let timer: ReturnType<typeof setTimeout> | null = null;
let inflight: Promise<PriceMap> | null = null;
let started = false;

/** The most recent prices seen this session (may be empty before the first poll). */
export const getLatestPrices = (): PriceMap => latest;

const poll = async (): Promise<void> => {
  if (!inflight) {
    inflight = fetchPricesOnce().finally(() => {
      inflight = null;
    });
  }
  const data = await inflight;
  // Keep the last good map when a poll comes back empty: a blank ticker is a
  // worse answer than a slightly old one.
  if (Object.keys(data).length) {
    latest = data;
    listeners.forEach((l) => l(latest));
  }
};

const schedule = (): void => {
  if (timer) clearTimeout(timer);
  timer = setTimeout(tick, POLL_MS);
};

const tick = async (): Promise<void> => {
  if (!listeners.size) {
    started = false;
    timer = null;
    return;
  }
  // A hidden tab doesn't need live prices; it resumes on focus.
  if (typeof document === 'undefined' || !document.hidden) await poll();
  schedule();
};

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && listeners.size) {
      poll();
      schedule();
    }
  });
}

/** Subscribe to the shared price feed. Returns an unsubscribe function. */
export const subscribeToPrices = (listener: PriceListener): (() => void) => {
  listeners.add(listener);
  if (Object.keys(latest).length) listener(latest);
  if (!started) {
    started = true;
    tick();
  }
  return () => {
    listeners.delete(listener);
  };
};

// Price history for the custom Perp chart (our own /api/prices?klines endpoint).
export const fetchKlines = async (coin: Coin, interval: Interval = '1m', limit = 90): Promise<Candle[]> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 9000);
  try {
    const res = await fetch(`/api/prices?klines=${coin}&interval=${interval}&limit=${limit}`, { signal: controller.signal });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? (data as Candle[]) : [];
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
};
