import React from 'react';
import CoinIcon from './CoinIcon';
import TradingViewMini from './TradingViewMini';
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

  return (
    <div className="group bg-background-card border border-border-default rounded-2xl p-4 flex flex-col hover:border-border-strong transition-colors">
      {/* Header */}
      <div className="flex items-center justify-between">
        <button onClick={() => onTrade(coin, 'long')} className="flex items-center gap-2.5 text-left">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ backgroundColor: `${meta.color}1a` }}>
            <CoinIcon code={coin} className="w-5 h-5" />
          </div>
          <div>
            <div className="text-sm font-bold text-text-primary leading-tight">{coin}</div>
            <div className="text-xs text-text-tertiary leading-tight">{meta.name}</div>
          </div>
        </button>
        <div className="text-right">
          <div className="text-sm font-bold text-text-primary tabular-nums">
            {price ? `$${fmtPrice(price.price)}` : '—'}
          </div>
          {price && (
            <div className={`text-xs font-semibold ${up ? 'text-emerald-400' : 'text-rose-400'}`}>
              {up ? '+' : ''}{price.change24h.toFixed(2)}%
            </div>
          )}
        </div>
      </div>

      {/* Mini chart */}
      <button onClick={() => onTrade(coin, up ? 'long' : 'short')} className="my-3 -mx-1">
        <TradingViewMini coin={coin} height={92} />
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
