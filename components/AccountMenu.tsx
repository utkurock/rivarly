import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { doc, setDoc } from 'firebase/firestore';
import { db, isFirebaseConfigured } from '../firebase';
import { useFirebase } from '../contexts/FirebaseContext';
import { useStellarWallet, shortenAddress } from '../contexts/StellarWalletContext';
import { WalletPicker } from './WalletButton';

// Clean web3 wallet glyph.
const WalletGlyph: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 12V7H5a2 2 0 0 1 0-4h14v4" />
    <path d="M3 5v14a2 2 0 0 0 2 2h16v-5" />
    <path d="M18 12a2 2 0 0 0 0 4h4v-4h-4Z" />
  </svg>
);

interface AccountMenuProps {
  onNavigate?: () => void;
}

// A single account card at the bottom of the sidebar. The avatar/username chip
// (the "anon" identity) doubles as the trigger for a popover that folds in the
// Stellar wallet connect/address and its disconnect — one control instead of two.
const AccountMenu: React.FC<AccountMenuProps> = ({ onNavigate }) => {
  const { userProfile } = useFirebase();
  const { address, connecting, disconnect, networkLabel, isMainnet } = useStellarWallet();
  const [open, setOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // Link the connected wallet to the signed-in Firebase profile.
  useEffect(() => {
    const uid = userProfile?.uid;
    if (!isFirebaseConfigured || !uid || !address) return;
    setDoc(doc(db, 'users', uid), { walletAddress: address }, { merge: true }).catch(() => {});
  }, [userProfile?.uid, address]);

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

  if (!userProfile) return null;

  const hasCustomAvatar = userProfile.avatar &&
    userProfile.avatar.trim() !== '' &&
    !userProfile.avatar.startsWith('blob:');
  const displayName = userProfile.username || userProfile.displayName || 'Profile';

  const Avatar = (
    <div className="w-9 h-9 bg-gray-200 rounded-full flex items-center justify-center overflow-hidden flex-shrink-0">
      {hasCustomAvatar ? (
        <img
          src={userProfile.avatar}
          alt={displayName}
          className="w-full h-full object-cover"
          onError={(e) => { e.currentTarget.style.display = 'none'; }}
        />
      ) : (
        <span className="text-sm font-bold text-gray-600">
          {displayName?.[0]?.toUpperCase() || 'U'}
        </span>
      )}
    </div>
  );

  const handleDisconnect = async () => {
    await disconnect();
    setOpen(false);
  };

  return (
    <div ref={rootRef} className="relative">
      {/* Trigger: the "anon" identity chip */}
      <button
        onClick={() => setOpen((v) => !v)}
        className={`w-full flex items-center gap-3 p-2 rounded-lg transition-colors ${open ? 'bg-gray-100' : 'hover:bg-gray-100'}`}
      >
        {Avatar}
        <div className="flex-1 min-w-0 text-left">
          <p className="text-sm font-semibold text-gray-900 truncate">{displayName}</p>
          <p className="text-xs text-gray-500 truncate flex items-center gap-1">
            {address ? (
              <>
                <span className={`inline-block w-1.5 h-1.5 rounded-full ${isMainnet ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                <span className="font-mono">{shortenAddress(address)}</span>
              </>
            ) : (
              `@${userProfile.username || 'user'}`
            )}
          </p>
        </div>
        <svg
          className={`w-4 h-4 text-gray-400 flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none" stroke="currentColor" viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 15l-6-6-6 6" />
        </svg>
      </button>

      {/* Popover */}
      {open && (
        <div className="absolute bottom-full left-0 right-0 mb-2 bg-white rounded-xl border border-gray-200 shadow-xl overflow-hidden animate-account-in">
          {/* Wallet section */}
          <div className="p-2">
            <p className="px-2 pt-1 pb-1.5 text-[10px] font-semibold uppercase tracking-wide text-gray-400">Wallet</p>
            {address ? (
              <>
                <div className="flex items-center justify-between px-2 py-1.5">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-gray-900 font-mono truncate">{shortenAddress(address)}</div>
                    <div className="mt-0.5 flex items-center gap-1.5">
                      <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${isMainnet ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                        {networkLabel}
                      </span>
                      <span className="text-[10px] text-gray-400">Stellar</span>
                    </div>
                  </div>
                </div>
                <button
                  onClick={handleDisconnect}
                  className="w-full flex items-center gap-2 px-2 py-2 rounded-lg text-sm font-medium text-gray-600 hover:text-rose-600 hover:bg-rose-50 transition-colors"
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
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-gray-900 hover:bg-black text-white text-sm font-semibold transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {connecting ? (
                  <span className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                ) : (
                  <WalletGlyph className="w-[18px] h-[18px]" />
                )}
                {connecting ? 'Connecting…' : 'Connect Wallet'}
              </button>
            )}
          </div>

          {/* Account section */}
          <div className="p-2 border-t border-gray-100">
            <Link
              to="/profile"
              onClick={() => { setOpen(false); onNavigate?.(); }}
              className="w-full flex items-center gap-2 px-2 py-2 rounded-lg text-sm font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-50 transition-colors"
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

      {pickerOpen && <WalletPicker onClose={() => setPickerOpen(false)} />}

      <style>{`
        @keyframes account-in { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
        .animate-account-in { animation: account-in 0.14s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
      `}</style>
    </div>
  );
};

export default AccountMenu;
