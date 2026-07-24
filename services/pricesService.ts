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

export const fetchPrices = async (): Promise<PriceMap> => {
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
