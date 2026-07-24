import { useEffect, useRef, useState } from 'react';
import { getLatestPrices, subscribeToPrices, type Coin, type PriceMap } from '../services/pricesService';

/**
 * Read the shared live price feed. Every consumer attaches to one poll loop in
 * pricesService, so mounting more tickers never means more upstream requests.
 * The interval argument is accepted for call-site compatibility and ignored.
 */
export function usePrices(_intervalMs?: number): { prices: PriceMap; loading: boolean } {
  const [prices, setPrices] = useState<PriceMap>(getLatestPrices);
  const [loading, setLoading] = useState(() => Object.keys(getLatestPrices()).length === 0);

  useEffect(() => {
    const unsub = subscribeToPrices((next) => {
      setPrices(next);
      setLoading(false);
    });
    return unsub;
  }, []);

  return { prices, loading };
}

export type TickDirection = 'up' | 'down' | null;

/**
 * Direction of the last price change, so a number can flash green or red as it
 * moves. Resets shortly after the tick, which is what makes the value read as
 * live rather than as a static figure that quietly changes.
 */
export function usePriceTick(price?: number, holdMs = 700): TickDirection {
  const [dir, setDir] = useState<TickDirection>(null);
  const prev = useRef<number | undefined>(price);

  useEffect(() => {
    if (typeof price !== 'number' || !Number.isFinite(price)) return;
    const before = prev.current;
    prev.current = price;
    if (typeof before !== 'number' || before === price) return;
    setDir(price > before ? 'up' : 'down');
    const t = setTimeout(() => setDir(null), holdMs);
    return () => clearTimeout(t);
  }, [price, holdMs]);

  return dir;
}

export type { Coin, PriceMap };
