import React, { useEffect, useMemo, useState } from 'react';
import { useFirebase } from '../contexts/FirebaseContext';
import { useStellarWallet } from '../contexts/StellarWalletContext';
import {
  subscribeToPoints,
  getClaimState,
  recordDailyClaim,
  rewardForStreak,
  type PointsData,
} from '../services/pointsService';
import { submitDailyClaimTx, ClaimTxError } from '../services/stellarTx';
import { WalletPicker } from './WalletButton';

const fmt = (n: number) => n.toLocaleString('en-US');

const pad = (n: number) => String(n).padStart(2, '0');
const formatCountdown = (ms: number): string => {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${pad(h)}:${pad(m)}:${pad(s % 60)}`;
};

const DailyClaimCard: React.FC = () => {
  const { user } = useFirebase();
  const { address, signTransaction } = useStellarWallet();

  const [data, setData] = useState<PointsData | null>(null);
  const [now, setNow] = useState(Date.now());
  const [claiming, setClaiming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  // Live points/streak/claim state.
  useEffect(() => {
    if (!user?.uid) { setData(null); return; }
    return subscribeToPoints(user.uid, setData);
  }, [user?.uid]);

  // 1s tick to drive the cooldown countdown.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const state = useMemo(
    () => getClaimState(data ?? { points: 0, streak: 0, lastClaimAt: null, claimCount: 0 }, now),
    [data, now]
  );

  const points = data?.points ?? 0;
  const streak = data?.streak ?? 0;
  const cooldownMs = state.nextClaimAt ? state.nextClaimAt - now : 0;

  const handleClaim = async () => {
    if (!user?.uid || !address || claiming || !state.canClaim) return;
    setError(null);
    setClaiming(true);
    try {
      const txHash = await submitDailyClaimTx(address, user.uid, signTransaction);
      const { reward } = await recordDailyClaim(txHash);
      setFlash(`+${fmt(reward)} points claimed!`);
      setTimeout(() => setFlash(null), 3500);
    } catch (e) {
      setError(e instanceof ClaimTxError ? e.message : e instanceof Error ? e.message : 'Claim failed. Please try again.');
    } finally {
      setClaiming(false);
    }
  };

  return (
    <div className="relative overflow-hidden rounded-2xl border border-gray-200 bg-gradient-to-br from-gray-900 via-gray-800 to-black text-white shadow-sm">
      {/* subtle dotted texture */}
      <div className="absolute inset-0 opacity-[0.07]" style={{
        backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)',
        backgroundSize: '22px 22px',
      }} />

      <div className="relative p-5 md:p-6">
        <div className="flex items-start justify-between">
          <div>
            <div className="text-xs font-medium text-white/50 uppercase tracking-wide">Your points</div>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-3xl md:text-4xl font-bold tabular-nums">{fmt(points)}</span>
              {streak > 0 && (
                <span className="inline-flex items-center gap-1 text-sm font-semibold text-amber-400">
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z" />
                  </svg>
                  {streak}d
                </span>
              )}
            </div>
          </div>
          <div className="w-11 h-11 rounded-xl bg-white/10 flex items-center justify-center">
            <svg className="w-6 h-6 text-amber-400" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 2l2.4 7.4H22l-6 4.6 2.3 7.4L12 16.9 5.7 21.4 8 14 2 9.4h7.6z" />
            </svg>
          </div>
        </div>

        {/* Action */}
        <div className="mt-5">
          {!address ? (
            <>
              <button
                onClick={() => setPickerOpen(true)}
                className="w-full py-3 rounded-xl bg-white text-gray-900 text-sm font-semibold hover:bg-gray-100 transition-colors"
              >
                Connect wallet to claim
              </button>
              {pickerOpen && <WalletPicker onClose={() => setPickerOpen(false)} />}
            </>
          ) : state.canClaim ? (
            <button
              onClick={handleClaim}
              disabled={claiming}
              className="w-full py-3 rounded-xl bg-white text-gray-900 text-sm font-semibold hover:bg-gray-100 transition-colors disabled:opacity-70 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {claiming ? (
                <>
                  <span className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-900" />
                  Confirming on Stellar…
                </>
              ) : (
                <>Claim daily reward · +{fmt(state.nextReward)}</>
              )}
            </button>
          ) : (
            <div className="w-full py-3 rounded-xl bg-white/10 text-center">
              <div className="text-xs text-white/50">Next claim in</div>
              <div className="text-lg font-bold tabular-nums font-mono">{formatCountdown(cooldownMs)}</div>
            </div>
          )}

          {/* Streak hint */}
          {address && state.canClaim && (
            <p className="mt-2 text-center text-xs text-white/40">
              Day {state.nextStreak} streak · tomorrow's reward: +{fmt(rewardForStreak(state.nextStreak + 1))}
            </p>
          )}

          {flash && <p className="mt-3 text-center text-sm font-semibold text-emerald-400">{flash}</p>}
          {error && <p className="mt-3 text-center text-sm text-rose-400">{error}</p>}
        </div>
      </div>
    </div>
  );
};

export default DailyClaimCard;
