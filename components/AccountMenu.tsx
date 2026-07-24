import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { doc, setDoc } from 'firebase/firestore';
import { db, isFirebaseConfigured } from '../firebase';
import { useFirebase } from '../contexts/FirebaseContext';
import { useStellarWallet, shortenAddress } from '../contexts/StellarWalletContext';
import {
  subscribeToPoints,
  getClaimState,
  recordDailyClaim,
  type PointsData,
} from '../services/pointsService';
import { submitDailyClaimTx, ClaimTxError } from '../services/stellarTx';
import { WalletPicker } from './WalletButton';

const fmt = (n: number) => n.toLocaleString('en-US');

const pad = (n: number) => String(n).padStart(2, '0');
const formatCountdown = (ms: number): string => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
};

// Clean web3 wallet glyph.
const WalletGlyph: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 12V7H5a2 2 0 0 1 0-4h14v4" />
    <path d="M3 5v14a2 2 0 0 0 2 2h16v-5" />
    <path d="M18 12a2 2 0 0 0 0 4h4v-4h-4Z" />
  </svg>
);

const FlameGlyph: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z" />
  </svg>
);

interface AccountMenuProps {
  onNavigate?: () => void;
}

// The sidebar footer account block:
//  1. an always-visible daily-points card (points + streak + claim/countdown), and
//  2. an identity chip whose popover folds in the Stellar wallet + account links.
// Kept light and card-based so it matches the rest of the app's surfaces.
const AccountMenu: React.FC<AccountMenuProps> = ({ onNavigate }) => {
  const { user, userProfile } = useFirebase();
  const { address, connecting, disconnect, signTransaction, networkLabel, isMainnet } = useStellarWallet();
  const [open, setOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const handleCopyAddress = async () => {
    if (!address) return;
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* clipboard unavailable */ }
  };

  // Points / daily-claim state.
  const [points, setPoints] = useState<PointsData | null>(null);
  const [now, setNow] = useState(Date.now());
  const [claiming, setClaiming] = useState(false);
  const [claimFlash, setClaimFlash] = useState<string | null>(null);
  const [claimError, setClaimError] = useState<string | null>(null);

  // Link the connected wallet to the signed-in Firebase profile.
  useEffect(() => {
    if (!isFirebaseConfigured || !user?.uid || !address) return;
    setDoc(doc(db, 'users', user.uid), { walletAddress: address }, { merge: true }).catch(() => {});
  }, [user?.uid, address]);

  // Live points/streak/claim state.
  useEffect(() => {
    if (!user?.uid) { setPoints(null); return; }
    return subscribeToPoints(user.uid, setPoints);
  }, [user?.uid]);

  // 1s countdown tick while a wallet is connected (drives the cooldown timer).
  useEffect(() => {
    if (!address) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [address]);

  // Close the popover on outside click / Escape.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open]);

  const claimState = useMemo(
    () => getClaimState(points ?? { points: 0, streak: 0, lastClaimAt: null, claimCount: 0 }, now),
    [points, now]
  );
  const pointTotal = points?.points ?? 0;
  const streak = points?.streak ?? 0;
  const cooldownMs = claimState.nextClaimAt ? claimState.nextClaimAt - now : 0;

  if (!userProfile) return null;

  const hasCustomAvatar = userProfile.avatar &&
    userProfile.avatar.trim() !== '' &&
    !userProfile.avatar.startsWith('blob:');
  const displayName = userProfile.username || userProfile.displayName || 'Profile';

  const handleDisconnect = async () => {
    await disconnect();
    setOpen(false);
  };

  const handleClaim = async () => {
    if (!user?.uid || !address || claiming || !claimState.canClaim) return;
    setClaimError(null);
    setClaiming(true);
    try {
      const txHash = await submitDailyClaimTx(address, user.uid, signTransaction);
      const { reward } = await recordDailyClaim(txHash);
      setClaimFlash(`+${fmt(reward)} claimed!`);
      setTimeout(() => setClaimFlash(null), 3500);
    } catch (e) {
      setClaimError(e instanceof ClaimTxError ? e.message : e instanceof Error ? e.message : 'Claim failed. Please try again.');
    } finally {
      setClaiming(false);
    }
  };

  return (
    <div ref={rootRef} className="relative space-y-3">
      {/* Daily points — always visible, matches the app's dark card surfaces */}
      <div className="rounded-xl border border-border-default bg-background-card p-3">
        <div className="flex items-center justify-between">
          <div className="min-w-0">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-text-tertiary">Your points</div>
            <div className="mt-0.5 flex items-baseline gap-1.5">
              <span className="text-xl font-bold text-text-primary tabular-nums">{fmt(pointTotal)}</span>
              {streak > 0 && (
                <span className="inline-flex items-center gap-0.5 text-xs font-semibold text-amber-400">
                  <FlameGlyph className="w-3.5 h-3.5" />{streak}d
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="mt-2.5">
          {!address ? (
            <button
              onClick={() => setPickerOpen(true)}
              className="w-full py-2 rounded-lg bg-inverse hover:bg-inverse-hover text-inverse-ink text-xs font-semibold transition-colors"
            >
              Connect wallet to claim
            </button>
          ) : claimState.canClaim ? (
            <button
              onClick={handleClaim}
              disabled={claiming}
              className="w-full py-2 rounded-lg bg-inverse hover:bg-inverse-hover text-inverse-ink text-xs font-semibold transition-colors disabled:opacity-70 flex items-center justify-center gap-2"
            >
              {claiming ? (
                <>
                  <span className="animate-spin rounded-full h-3.5 w-3.5 border-b-2 border-background-body" />
                  Confirming…
                </>
              ) : (
                <>Claim daily · +{fmt(claimState.nextReward)}</>
              )}
            </button>
          ) : (
            <div className="w-full py-1.5 rounded-lg bg-background-hover text-center">
              <div className="text-[10px] text-text-tertiary">Next claim in</div>
              <div className="text-sm font-bold tabular-nums font-mono text-text-primary">{formatCountdown(cooldownMs)}</div>
            </div>
          )}
          {claimFlash && <p className="mt-2 text-center text-xs font-semibold text-emerald-400">{claimFlash}</p>}
          {claimError && <p className="mt-2 text-center text-xs text-rose-400">{claimError}</p>}
        </div>
      </div>

      {/* Identity chip → wallet + account popover */}
      <div className="relative">
        <button
          onClick={() => setOpen((v) => !v)}
          className={`w-full flex items-center gap-3 p-2 rounded-lg transition-colors ${open ? 'bg-background-card' : 'hover:bg-background-card'}`}
        >
          <div className="w-9 h-9 bg-background-active rounded-full flex items-center justify-center overflow-hidden flex-shrink-0">
            {hasCustomAvatar ? (
              <img
                src={userProfile.avatar}
                alt={displayName}
                className="w-full h-full object-cover"
                onError={(e) => { e.currentTarget.style.display = 'none'; }}
              />
            ) : (
              <span className="text-sm font-bold text-text-secondary">{displayName?.[0]?.toUpperCase() || 'U'}</span>
            )}
          </div>
          <div className="flex-1 min-w-0 text-left">
            <p className="text-sm font-semibold text-text-primary truncate">{displayName}</p>
            <p className="text-xs text-text-secondary truncate">
              {address ? (
                <span className="font-mono">{`${address.slice(0, 7)}…${address.slice(-7)}`}</span>
              ) : (
                `@${userProfile.username || 'user'}`
              )}
            </p>
          </div>
          <svg
            className={`w-4 h-4 text-text-tertiary flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
            fill="none" stroke="currentColor" viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 15l-6-6-6 6" />
          </svg>
        </button>

        {/* Popover */}
        {open && (
          <div className="absolute bottom-full left-0 right-0 mb-2 bg-background-card rounded-xl border border-border-default shadow-xl overflow-hidden animate-account-in">
            {/* Wallet section */}
            <div className="p-2">
              <p className="px-2 pt-1 pb-1.5 text-[10px] font-semibold uppercase tracking-wide text-text-tertiary">Wallet</p>
              {address ? (
                <>
                  <div className="flex items-center justify-between gap-2 px-2 py-1.5">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm font-semibold text-text-primary font-mono truncate">{shortenAddress(address)}</span>
                        <button
                          onClick={handleCopyAddress}
                          title={copied ? 'Copied!' : 'Copy address'}
                          aria-label="Copy wallet address"
                          className="flex-shrink-0 text-text-tertiary hover:text-text-primary transition-colors"
                        >
                          {copied ? (
                            <svg className="w-3.5 h-3.5 text-emerald-400" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                            </svg>
                          ) : (
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                              <rect x="9" y="9" width="11" height="11" rx="2" />
                              <path strokeLinecap="round" strokeLinejoin="round" d="M5 15V5a2 2 0 0 1 2-2h10" />
                            </svg>
                          )}
                        </button>
                      </div>
                      <div className="mt-0.5 flex items-center gap-1.5">
                        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${isMainnet ? 'bg-emerald-500/10 text-emerald-400' : 'bg-amber-500/10 text-amber-400'}`}>
                          {networkLabel}
                        </span>
                        <span className="text-[10px] text-text-tertiary">Stellar</span>
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={handleDisconnect}
                    className="w-full flex items-center gap-2 px-2 py-2 rounded-lg text-sm font-medium text-text-secondary hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                    </svg>
                    Disconnect wallet
                  </button>
                </>
              ) : (
                <button
                  onClick={() => { setPickerOpen(true); setOpen(false); }}
                  disabled={connecting}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-inverse hover:bg-inverse-hover text-inverse-ink text-sm font-semibold transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {connecting ? (
                    <span className="animate-spin rounded-full h-4 w-4 border-b-2 border-background-body" />
                  ) : (
                    <WalletGlyph className="w-[18px] h-[18px]" />
                  )}
                  {connecting ? 'Connecting…' : 'Connect Wallet'}
                </button>
              )}
            </div>

            {/* Account section */}
            <div className="p-2 border-t border-border-default">
              <Link
                to="/profile"
                onClick={() => { setOpen(false); onNavigate?.(); }}
                className="w-full flex items-center gap-2 px-2 py-2 rounded-lg text-sm font-medium text-text-secondary hover:text-white hover:bg-background-hover transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <circle cx="12" cy="8" r="4" strokeWidth={2} />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 21a8 8 0 0116 0" />
                </svg>
                View profile
              </Link>
            </div>
          </div>
        )}
      </div>

      {pickerOpen && <WalletPicker onClose={() => setPickerOpen(false)} />}

      <style>{`
        @keyframes account-in { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
        .animate-account-in { animation: account-in 0.14s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
      `}</style>
    </div>
  );
};

export default AccountMenu;
