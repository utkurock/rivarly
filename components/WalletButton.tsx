import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { doc, setDoc } from 'firebase/firestore';
import { db, isFirebaseConfigured } from '../firebase';
import { useFirebase } from '../contexts/FirebaseContext';
import { useStellarWallet, shortenAddress, type ISupportedWallet } from '../contexts/StellarWalletContext';

// Clean web3 wallet glyph for the connect button.
const WalletGlyph: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 12V7H5a2 2 0 0 1 0-4h14v4" />
    <path d="M3 5v14a2 2 0 0 0 2 2h16v-5" />
    <path d="M18 12a2 2 0 0 0 0 4h4v-4h-4Z" />
  </svg>
);

// Site-styled wallet picker (replaces the kit's default modal).
export const WalletPicker: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { listWallets, selectWallet, connecting, networkLabel } = useStellarWallet();
  const [wallets, setWallets] = useState<ISupportedWallet[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    listWallets()
      .then((w) => { if (!cancelled) setWallets(w); })
      .catch(() => { if (!cancelled) setWallets([]); });
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => { cancelled = true; document.removeEventListener('keydown', onKey); };
  }, [listWallets, onClose]);

  const handleSelect = async (w: ISupportedWallet) => {
    if (!w.isAvailable) { window.open(w.url, '_blank', 'noopener,noreferrer'); return; }
    setError(null);
    setPendingId(w.id);
    try {
      await selectWallet(w.id);
      onClose();
    } catch {
      setError(`Couldn't connect to ${w.name}. Make sure it's unlocked and try again.`);
    } finally {
      setPendingId(null);
    }
  };

  // Portal to body: the sidebar ancestor uses a CSS transform, which would
  // otherwise trap this fixed overlay inside the sidebar instead of the viewport.
  return createPortal(
    <div
      className="fixed inset-0 z-[9998] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm bg-background-card rounded-2xl border border-border-default shadow-2xl overflow-hidden animate-wallet-in"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border-default">
          <div className="flex items-center gap-2">
            <span className="w-8 h-8 rounded-lg bg-inverse text-inverse-ink flex items-center justify-center">
              <WalletGlyph className="w-4 h-4" />
            </span>
            <h3 className="text-base font-bold text-text-primary">Connect Wallet</h3>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full text-text-tertiary hover:bg-background-hover hover:text-text-primary transition-colors"
            aria-label="Close"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* List */}
        <div className="p-3 max-h-[60vh] overflow-y-auto">
          {wallets === null ? (
            <div className="space-y-2">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="flex items-center gap-3 p-3 rounded-xl animate-pulse">
                  <div className="w-9 h-9 rounded-lg bg-background-hover" />
                  <div className="h-3.5 w-28 bg-background-hover rounded" />
                </div>
              ))}
            </div>
          ) : wallets.length === 0 ? (
            <p className="text-center text-sm text-text-secondary py-8">No Stellar wallets detected.</p>
          ) : (
            <div className="space-y-1">
              {wallets.map((w) => (
                <button
                  key={w.id}
                  onClick={() => handleSelect(w)}
                  disabled={connecting}
                  className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-background-hover border border-transparent hover:border-border-default transition-colors text-left disabled:opacity-60 group"
                >
                  <img src={w.icon} alt="" className="w-9 h-9 rounded-lg object-contain flex-shrink-0" />
                  <span className="flex-1 text-sm font-semibold text-text-primary">{w.name}</span>
                  {pendingId === w.id ? (
                    <span className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                  ) : w.isAvailable ? (
                    <span className="text-xs font-medium text-text-tertiary group-hover:text-text-secondary">Connect</span>
                  ) : (
                    <span className="text-xs font-medium text-text-tertiary flex items-center gap-1">
                      Install
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                      </svg>
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}

          {error && <p className="mt-2 px-1 text-xs text-rose-400">{error}</p>}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-border-default flex items-center justify-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
          <span className="text-xs text-text-tertiary">Stellar {networkLabel}</span>
        </div>
      </div>

      <style>{`
        @keyframes wallet-in { from { opacity: 0; transform: translateY(8px) scale(0.98); } to { opacity: 1; transform: translateY(0) scale(1); } }
        .animate-wallet-in { animation: wallet-in 0.16s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
      `}</style>
    </div>,
    document.body
  );
};

const WalletButton: React.FC = () => {
  const { address, connecting, disconnect, networkLabel, isMainnet } = useStellarWallet();
  const { user } = useFirebase();
  const [pickerOpen, setPickerOpen] = useState(false);

  // Link the connected wallet to the signed-in Firebase profile.
  useEffect(() => {
    if (!isFirebaseConfigured || !user?.uid || !address) return;
    setDoc(doc(db, 'users', user.uid), { walletAddress: address }, { merge: true }).catch(() => {});
  }, [user?.uid, address]);

  if (!address) {
    return (
      <>
        <button
          onClick={() => setPickerOpen(true)}
          disabled={connecting}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-inverse hover:bg-inverse-hover text-inverse-ink text-sm font-semibold transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {connecting ? (
            <span className="animate-spin rounded-full h-4 w-4 border-b-2 border-background-body" />
          ) : (
            <WalletGlyph className="w-[18px] h-[18px]" />
          )}
          {connecting ? 'Connecting…' : 'Connect Wallet'}
        </button>
        {pickerOpen && <WalletPicker onClose={() => setPickerOpen(false)} />}
      </>
    );
  }

  return (
    <div className="flex items-center gap-1 rounded-xl border border-border-default bg-background-hover p-1.5 pl-2.5">
      {/* Click the chip to open your profile */}
      <Link to="/profile" className="flex-1 min-w-0 group" title="Open profile">
        <div className="text-sm font-semibold text-text-primary font-mono truncate group-hover:text-text-secondary transition-colors">
          {shortenAddress(address)}
        </div>
        <div className="mt-0.5 flex items-center gap-1.5">
          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${isMainnet ? 'bg-emerald-500/10 text-emerald-400' : 'bg-amber-500/10 text-amber-400'}`}>
            {networkLabel}
          </span>
          <span className="text-[10px] text-text-tertiary">Stellar</span>
        </div>
      </Link>
      <button
        onClick={disconnect}
        title="Disconnect"
        className="w-8 h-8 flex items-center justify-center rounded-lg text-text-tertiary hover:text-rose-400 hover:bg-background-active transition-colors flex-shrink-0"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
        </svg>
      </button>
    </div>
  );
};

export default WalletButton;
