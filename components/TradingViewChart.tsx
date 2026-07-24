import React, { useEffect, useRef } from 'react';
import { useTheme } from '../contexts/ThemeContext';
import type { Coin } from '../services/pricesService';

// Binance USDT pairs render on TradingView regardless of whether Binance's own
// API is reachable from the server, so this works everywhere the klines feed
// doesn't.
const TV_SYMBOL: Record<Coin, string> = {
  BTC: 'BINANCE:BTCUSDT',
  ETH: 'BINANCE:ETHUSDT',
  SOL: 'BINANCE:SOLUSDT',
  XLM: 'BINANCE:XLMUSDT',
};

let tvLoader: Promise<void> | null = null;
function loadTradingView(): Promise<void> {
  if (typeof window !== 'undefined' && (window as any).TradingView) return Promise.resolve();
  if (tvLoader) return tvLoader;
  tvLoader = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://s3.tradingview.com/tv.js';
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('TradingView failed to load'));
    document.head.appendChild(s);
  });
  return tvLoader;
}

interface Props {
  coin: Coin;
  interval?: string; // TradingView interval, e.g. '1', '5', '15'
  height?: number;
}

const TradingViewChart: React.FC<Props> = ({ coin, interval = '1', height = 340 }) => {
  const { theme } = useTheme();
  const hostRef = useRef<HTMLDivElement>(null);
  const idRef = useRef(`tv_${Math.random().toString(36).slice(2)}`);

  useEffect(() => {
    let cancelled = false;
    loadTradingView()
      .then(() => {
        if (cancelled || !hostRef.current) return;
        // Fresh mount node each render so the widget rebuilds cleanly on
        // coin/theme/interval change.
        hostRef.current.innerHTML = `<div id="${idRef.current}" style="height:100%;width:100%"></div>`;
        // eslint-disable-next-line new-cap
        new (window as any).TradingView.widget({
          symbol: TV_SYMBOL[coin],
          interval,
          container_id: idRef.current,
          autosize: true,
          theme: theme === 'dark' ? 'dark' : 'light',
          style: '1',
          locale: 'en',
          timezone: 'Etc/UTC',
          hide_side_toolbar: true,
          hide_top_toolbar: false,
          allow_symbol_change: false,
          save_image: false,
          withdateranges: false,
          details: false,
          calendar: false,
        });
      })
      .catch(() => {
        if (hostRef.current) {
          hostRef.current.innerHTML =
            '<div style="height:100%;display:flex;align-items:center;justify-content:center;color:var(--color-text-tertiary);font-size:14px">Chart unavailable</div>';
        }
      });
    return () => {
      cancelled = true;
    };
  }, [coin, theme, interval]);

  return <div ref={hostRef} style={{ height }} className="w-full overflow-hidden rounded-xl" />;
};

export default TradingViewChart;
