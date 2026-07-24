import React, { useEffect, useRef } from 'react';
import { useTheme } from '../contexts/ThemeContext';
import type { Coin } from '../services/pricesService';

const TV_SYMBOL: Record<Coin, string> = {
  BTC: 'BINANCE:BTCUSDT',
  ETH: 'BINANCE:ETHUSDT',
  SOL: 'BINANCE:SOLUSDT',
  XLM: 'BINANCE:XLMUSDT',
};

// Lightweight TradingView "mini symbol overview" — a self-contained sparkline
// used inside the square coin cards. Rebuilds on coin/theme change.
const TradingViewMini: React.FC<{ coin: Coin; height?: number }> = ({ coin, height = 96 }) => {
  const { theme } = useTheme();
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    host.innerHTML = '';
    const inner = document.createElement('div');
    inner.className = 'tradingview-widget-container__widget';
    inner.style.height = '100%';
    host.appendChild(inner);

    const script = document.createElement('script');
    script.src = 'https://s3.tradingview.com/external-embedding/embed-widget-mini-symbol-overview.js';
    script.async = true;
    script.innerHTML = JSON.stringify({
      symbol: TV_SYMBOL[coin],
      width: '100%',
      height: '100%',
      locale: 'en',
      dateRange: '1D',
      colorTheme: theme === 'dark' ? 'dark' : 'light',
      isTransparent: true,
      autosize: true,
      noTimeScale: true,
      chartOnly: true,
    });
    host.appendChild(script);
  }, [coin, theme]);

  return <div ref={hostRef} style={{ height }} className="w-full overflow-hidden" />;
};

export default TradingViewMini;
