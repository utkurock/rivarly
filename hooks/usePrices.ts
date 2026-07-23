import { useEffect, useRef, useState } from 'react';
import { fetchPrices, type PriceMap } from '../services/pricesService';

/**
 * Poll the live price feed on an interval. Returns the latest price map plus a
 * loading flag for the first fetch. Keeps polling while mounted.
 */
export function usePrices(intervalMs = 4000): { prices: PriceMap; loading: boolean } {
  const [prices, setPrices] = useState<PriceMap>({});
  const [loading, setLoading] = useState(true);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    let timer: ReturnType<typeof setTimeout>;

    const tick = async () => {
      const data = await fetchPrices();
      if (!alive.current) return;
      if (Object.keys(data).length) setPrices(data);
      setLoading(false);
      timer = setTimeout(tick, intervalMs);
    };
    tick();

    return () => {
      alive.current = false;
      clearTimeout(timer);
    };
  }, [intervalMs]);

  return { prices, loading };
}
