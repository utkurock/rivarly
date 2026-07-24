import React from 'react';
import { usePriceTick } from '../hooks/usePrices';
import CoinIcon from './CoinIcon';
import { COIN_META, type Coin, type CoinPrice } from '../services/pricesService';
import type { PerpDirection } from '../services/perpService';

const fmtPrice = (n: number): string => {
  if (!Number.isFinite(n)) return '—';
  if (n >= 100) return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (n >= 1) return n.toFixed(3);
  return n.toFixed(5);
};

interface Props {
  coin: Coin;
  price?: CoinPrice;
  onTrade: (coin: Coin, direction: PerpDirection) => void;
}

// A square, prediction-market-style card for a coin's up/down (long/short) game.
const PerpCoinCard: React.FC<Props> = ({ coin, price, onTrade }) => {
  const meta = COIN_META[coin];
  const up = (price?.change24h ?? 0) >= 0;
  const tick = usePriceTick(price?.price);

  return (
    <div className="group bg-background-card border border-border-default rounded-2xl p-4 flex flex-col hover:border-border-strong transition-colors">
      {/* Header */}
      <div className="flex items-center gap-2.5">
        <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ backgroundColor: `${meta.color}1a` }}>
          <CoinIcon code={coin} className="w-5 h-5" />
        </div>
        <div>
          <div className="text-sm font-bold text-text-primary leading-tight">{coin}</div>
          <div className="text-xs text-text-tertiary leading-tight">{meta.name}</div>
        </div>
      </div>

      {/* Live price — centered to fill the card */}
      <button
        onClick={() => onTrade(coin, up ? 'long' : 'short')}
        className="flex-1 flex flex-col items-center justify-center py-5"
      >
        <div
          className={`text-2xl md:text-3xl font-extrabold tabular-nums transition-colors duration-300 ${
            tick === 'up' ? 'text-emerald-400' : tick === 'down' ? 'text-rose-400' : 'text-text-primary'
          }`}
        >
          {price ? `$${fmtPrice(price.price)}` : '—'}
        </div>
        {price && (
          <div className={`mt-1 text-xs font-semibold ${up ? 'text-emerald-400' : 'text-rose-400'}`}>
            {up ? '+' : ''}{price.change24h.toFixed(2)}%
          </div>
        )}
      </button>

      {/* Prompt */}
      <div className="text-xs text-text-secondary mb-2 text-center">Will {coin} go up or down?</div>

      {/* Long / Short */}
      <div className="grid grid-cols-2 gap-2 mt-auto">
        <button
          onClick={() => onTrade(coin, 'long')}
          className="py-2.5 rounded-xl bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500 hover:text-white font-bold text-sm transition-all"
        >
          ▲ Long
        </button>
        <button
          onClick={() => onTrade(coin, 'short')}
          className="py-2.5 rounded-xl bg-rose-500/10 text-rose-400 hover:bg-rose-500 hover:text-white font-bold text-sm transition-all"
        >
          ▼ Short
        </button>
      </div>
    </div>
  );
};

export default PerpCoinCard;
