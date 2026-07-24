import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useFirebase } from '../contexts/FirebaseContext';
import { useStellarWallet, stellarExpertTxUrl } from '../contexts/StellarWalletContext';
import { usePrices, usePriceTick } from '../hooks/usePrices';
import { useCountdown } from '../hooks/useCountdown';
import { subscribeToPoints } from '../services/pointsService';
import {
  openPerp,
  settlePerp,
  subscribeToMyPositions,
  PerpError,
  type PerpDirection,
  type PerpPosition,
} from '../services/perpService';
import { COINS, COIN_META, type Coin, type Interval } from '../services/pricesService';
import CoinIcon from './CoinIcon';
import PerpChart from './PerpChart';

const DURATIONS: { sec: number; label: string }[] = [
  { sec: 60, label: '1m' },
  { sec: 300, label: '5m' },
  { sec: 900, label: '15m' },
];

const fmtPrice = (n: number): string => {
  if (!Number.isFinite(n)) return '—';
  if (n >= 100) return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (n >= 1) return n.toFixed(3);
  return n.toFixed(5);
};
const fmtPts = (n: number): string => Math.round(n).toLocaleString();
const mmss = (total: number): string => {
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
};

const CHART_INTERVAL: Record<number, Interval> = { 60: '1m', 300: '5m', 900: '15m' };

// The headline spot price, tinted for a beat whenever it ticks so the number
// reads as live instead of silently changing.
const LivePrice: React.FC<{ price?: number }> = ({ price }) => {
  const dir = usePriceTick(price);
  return (
    <div
      className={`text-2xl font-bold tabular-nums transition-colors duration-300 ${
        dir === 'up' ? 'text-emerald-400' : dir === 'down' ? 'text-rose-400' : 'text-text-primary'
      }`}
    >
      {typeof price === 'number' ? `$${fmtPrice(price)}` : '—'}
    </div>
  );
};

// ---- A single position row (live countdown + auto-settle) -------------------
const PositionRow: React.FC<{ pos: PerpPosition; livePrice?: number }> = ({ pos, livePrice }) => {
  const { totalSeconds, isExpired } = useCountdown(pos.status === 'open' ? pos.expiresAt : null);
  const [settling, setSettling] = useState(false);
  const tried = useRef(false);

  // Auto-settle once the moment it expires.
  useEffect(() => {
    if (pos.status === 'open' && isExpired && !tried.current) {
      tried.current = true;
      setSettling(true);
      settlePerp(pos.id).catch(() => {}).finally(() => setSettling(false));
    }
  }, [pos.status, isExpired, pos.id]);

  const isLong = pos.direction === 'long';
  const meta = COIN_META[pos.coin];

  // Live (unrealized) result while open.
  const liveWinning = livePrice
    ? isLong
      ? livePrice > pos.entryPrice
      : livePrice < pos.entryPrice
    : undefined;

  return (
    <div className="flex items-center gap-3 px-4 py-3 border-b border-border-default">
      <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: `${meta.color}1a` }}>
        <CoinIcon code={pos.coin} className="w-4 h-4" />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 text-sm">
          <span className="font-semibold text-text-primary">{pos.coin}</span>
          <span className={`text-xs font-bold ${isLong ? 'text-emerald-400' : 'text-rose-400'}`}>
            {isLong ? 'LONG' : 'SHORT'}
          </span>
          <span className="text-xs text-text-tertiary">· {fmtPts(pos.stake)} pts</span>
        </div>
        <div className="text-xs text-text-tertiary mt-0.5 flex items-center gap-1.5 flex-wrap">
          <span>
            Entry {fmtPrice(pos.entryPrice)}
            {pos.status === 'settled' && pos.exitPrice !== undefined && <> · Exit {fmtPrice(pos.exitPrice)}</>}
          </span>
          {pos.txHash && (
            <a
              href={stellarExpertTxUrl(pos.txHash)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-0.5 text-text-tertiary hover:text-text-primary underline decoration-dotted"
            >
              tx ↗
            </a>
          )}
        </div>
      </div>

      <div className="text-right flex-shrink-0">
        {pos.status === 'open' ? (
          isExpired || settling ? (
            <span className="text-xs text-text-tertiary">Settling…</span>
          ) : (
            <>
              <div className="text-sm font-mono font-semibold text-text-primary">{mmss(totalSeconds)}</div>
              {liveWinning !== undefined && (
                <div className={`text-xs font-medium ${liveWinning ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {liveWinning ? 'Winning' : 'Losing'}
                </div>
              )}
            </>
          )
        ) : (
          <div
            className={`text-sm font-bold ${
              pos.outcome === 'win' ? 'text-emerald-400' : pos.outcome === 'lose' ? 'text-rose-400' : 'text-text-secondary'
            }`}
          >
            {pos.outcome === 'win' ? `+${fmtPts(pos.pnl || 0)}` : pos.outcome === 'lose' ? `${fmtPts(pos.pnl || 0)}` : 'Refund'}
            <span className="block text-[10px] font-medium text-text-tertiary uppercase">{pos.outcome}</span>
          </div>
        )}
      </div>
    </div>
  );
};

// ---- Main -------------------------------------------------------------------
interface PerpMarketsProps {
  initialCoin?: Coin;
  initialDirection?: PerpDirection;
  /** Reports coin switches so the route can follow (/perp/stellar, …). */
  onCoinChange?: (coin: Coin) => void;
}

const PerpMarkets: React.FC<PerpMarketsProps> = ({ initialCoin, initialDirection, onCoinChange }) => {
  const { userProfile, user } = useFirebase();
  const { address, signTransaction } = useStellarWallet();
  const uid = userProfile?.uid || user?.uid || null;
  const { prices } = usePrices(3000);

  const [coin, setCoin] = useState<Coin>(initialCoin || 'BTC');
  const [direction, setDirection] = useState<PerpDirection>(initialDirection || 'long');
  const [durationSec, setDurationSec] = useState(60);
  const [stake, setStake] = useState('');
  const [points, setPoints] = useState(0);
  const [positions, setPositions] = useState<PerpPosition[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [posTab, setPosTab] = useState<'open' | 'activity'>('open');

  // Follow the address: /perp/solana while sitting on BTC (back button, a
  // pasted link) has to move the view, not just the URL.
  useEffect(() => {
    if (initialCoin && initialCoin !== coin) setCoin(initialCoin);
  }, [initialCoin]);

  useEffect(() => {
    if (initialDirection && initialDirection !== direction) setDirection(initialDirection);
  }, [initialDirection]);

  const selectCoin = (next: Coin) => {
    setCoin(next);
    onCoinChange?.(next);
  };

  useEffect(() => {
    if (!uid) return;
    const un1 = subscribeToPoints(uid, (d) => setPoints(d.points));
    const un2 = subscribeToMyPositions(uid, setPositions);
    return () => { un1 && un1(); un2 && un2(); };
  }, [uid]);

  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(() => setMsg(null), 4000);
    return () => clearTimeout(t);
  }, [msg]);

  const live = prices[coin];
  const stakeNum = Math.floor(Number(stake)) || 0;
  const canSubmit = uid && address && stakeNum >= 1 && stakeNum <= points && !submitting;

  const setPct = (pct: number) => setStake(String(Math.floor((points * pct) / 100)));

  const handleOpen = useCallback(async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setMsg(null);
    try {
      await openPerp({ uid: uid!, address: address!, coin, direction, durationSec, stake: stakeNum, sign: signTransaction });
      setStake('');
      setMsg({ kind: 'ok', text: `${direction === 'long' ? 'Long' : 'Short'} opened on ${coin} for ${fmtPts(stakeNum)} pts.` });
    } catch (e) {
      setMsg({ kind: 'err', text: e instanceof PerpError ? e.message : 'Could not open position.' });
    } finally {
      setSubmitting(false);
    }
  }, [canSubmit, uid, address, signTransaction, coin, direction, durationSec, stakeNum]);

  const openPositions = positions.filter((p) => p.status === 'open');
  const history = positions.filter((p) => p.status === 'settled').slice(0, 20);

  return (
    <div className="max-w-6xl mx-auto px-3 md:px-6 py-4 md:py-6">
      {/* Coin selector */}
      <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1 mb-4">
        {COINS.map((c) => {
          const p = prices[c];
          const active = c === coin;
          return (
            <button
              key={c}
              onClick={() => selectCoin(c)}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-xl border whitespace-nowrap transition-all ${
                active
                  ? 'bg-background-card border-border-strong'
                  : 'bg-transparent border-border-default hover:bg-background-card'
              }`}
            >
              <CoinIcon code={c} className="w-4 h-4" />
              <span className="text-sm font-semibold text-text-primary">{c}</span>
              {p && (
                <span className={`text-xs font-medium ${p.change24h >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {p.change24h >= 0 ? '+' : ''}{p.change24h.toFixed(1)}%
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Chart + price */}
        <div className="lg:col-span-2 bg-background-card border border-border-default rounded-2xl p-4 md:p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ backgroundColor: `${COIN_META[coin].color}1a` }}>
                <CoinIcon code={coin} className="w-5 h-5" />
              </div>
              <div>
                <div className="text-sm font-bold text-text-primary leading-tight">{coin}</div>
                <div className="text-xs text-text-tertiary leading-tight">{COIN_META[coin].name}</div>
              </div>
            </div>
            <div className="text-right">
              <LivePrice price={live?.price} />
              {live && (
                <div className={`text-xs font-semibold ${live.change24h >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {live.change24h >= 0 ? '+' : ''}{live.change24h.toFixed(2)}% · 24h
                </div>
              )}
            </div>
          </div>
          <PerpChart coin={coin} interval={CHART_INTERVAL[durationSec] || '1m'} height={340} livePrice={live?.price} />
        </div>

        {/* Trade panel */}
        <div className="bg-background-card border border-border-default rounded-2xl p-4 md:p-5 flex flex-col">
          {/* Long / Short */}
          <div className="grid grid-cols-2 gap-2 mb-4">
            <button
              onClick={() => setDirection('long')}
              className={`py-2.5 rounded-xl font-bold text-sm transition-all ${
                direction === 'long'
                  ? 'bg-emerald-500 text-white'
                  : 'bg-background-hover text-text-secondary hover:text-text-primary'
              }`}
            >
              ▲ LONG
            </button>
            <button
              onClick={() => setDirection('short')}
              className={`py-2.5 rounded-xl font-bold text-sm transition-all ${
                direction === 'short'
                  ? 'bg-rose-500 text-white'
                  : 'bg-background-hover text-text-secondary hover:text-text-primary'
              }`}
            >
              ▼ SHORT
            </button>
          </div>

          {/* Duration */}
          <label className="text-xs font-medium text-text-secondary mb-1.5 block">Timeframe</label>
          <div className="grid grid-cols-3 gap-2 mb-4">
            {DURATIONS.map((d) => (
              <button
                key={d.sec}
                onClick={() => setDurationSec(d.sec)}
                className={`py-2 rounded-lg text-sm font-semibold transition-all ${
                  durationSec === d.sec
                    ? 'bg-inverse text-inverse-ink'
                    : 'bg-background-hover text-text-secondary hover:text-text-primary'
                }`}
              >
                {d.label}
              </button>
            ))}
          </div>

          {/* Stake */}
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-xs font-medium text-text-secondary">Stake (points)</label>
            <span className="text-xs text-text-tertiary">Balance: {fmtPts(points)}</span>
          </div>
          <div className="relative mb-2">
            <input
              type="number"
              inputMode="numeric"
              value={stake}
              onChange={(e) => setStake(e.target.value)}
              placeholder="0"
              min={1}
              className="w-full px-3 py-2.5 bg-background-hover border border-border-default rounded-lg text-text-primary focus:outline-none focus:border-border-strong transition-colors tabular-nums"
            />
          </div>
          <div className="grid grid-cols-4 gap-1.5 mb-4">
            {[25, 50, 75, 100].map((pct) => (
              <button
                key={pct}
                onClick={() => setPct(pct)}
                disabled={!points}
                className="py-1.5 rounded-md bg-background-hover text-text-secondary hover:text-text-primary text-xs font-medium disabled:opacity-40 transition-colors"
              >
                {pct === 100 ? 'MAX' : `${pct}%`}
              </button>
            ))}
          </div>

          {/* Payout hint */}
          <div className="text-xs text-text-tertiary mb-3 text-center">
            Win → <span className="text-emerald-400 font-semibold">+{fmtPts(stakeNum)}</span> · Lose →{' '}
            <span className="text-rose-400 font-semibold">-{fmtPts(stakeNum)}</span>
          </div>

          {/* Submit */}
          <button
            onClick={handleOpen}
            disabled={!canSubmit}
            className={`w-full py-3 rounded-xl font-bold text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
              direction === 'long' ? 'bg-emerald-500 text-white hover:bg-emerald-600' : 'bg-rose-500 text-white hover:bg-rose-600'
            }`}
          >
            {!uid
              ? 'Sign in to trade'
              : !address
              ? 'Connect a Stellar wallet'
              : submitting
              ? 'Confirm in wallet…'
              : stakeNum < 1
              ? 'Min stake 1 pt'
              : stakeNum > points
              ? 'Not enough points'
              : `${direction === 'long' ? 'Go Long' : 'Go Short'} · ${durationSec / 60}m`}
          </button>

          {msg && (
            <div className={`mt-3 text-xs rounded-lg px-3 py-2 ${msg.kind === 'ok' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'}`}>
              {msg.text}
            </div>
          )}
        </div>
      </div>

      {/* Open positions / Activity — switchable tabs */}
      <div className="mt-6 bg-background-card border border-border-default rounded-2xl overflow-hidden">
        <div className="flex items-center gap-1 px-2 py-2 border-b border-border-default">
          <button
            onClick={() => setPosTab('open')}
            className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors ${
              posTab === 'open' ? 'bg-background-hover text-text-primary' : 'text-text-secondary hover:text-text-primary'
            }`}
          >
            Open positions
            <span className="ml-1.5 text-xs text-text-tertiary">{openPositions.length}</span>
          </button>
          <button
            onClick={() => setPosTab('activity')}
            className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors ${
              posTab === 'activity' ? 'bg-background-hover text-text-primary' : 'text-text-secondary hover:text-text-primary'
            }`}
          >
            Activity
            <span className="ml-1.5 text-xs text-text-tertiary">{history.length}</span>
          </button>
        </div>

        {posTab === 'open' ? (
          openPositions.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-text-secondary">No open positions. Pick a side above.</div>
          ) : (
            openPositions.map((p) => <PositionRow key={p.id} pos={p} livePrice={prices[p.coin]?.price} />)
          )
        ) : history.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-text-secondary">No activity yet. Your settled trades show up here.</div>
        ) : (
          history.map((p) => <PositionRow key={p.id} pos={p} />)
        )}
      </div>
    </div>
  );
};

export default PerpMarkets;
