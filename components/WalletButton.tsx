import React, { useEffect, useState } from 'react';
import { doc, setDoc } from 'firebase/firestore';
import { db, isFirebaseConfigured } from '../firebase';
import { useFirebase } from '../contexts/FirebaseContext';
import { useStellarWallet, shortenAddress } from '../contexts/StellarWalletContext';

const WalletButton: React.FC = () => {
  const { address, connecting, connect, disconnect, networkLabel, isMainnet } = useStellarWallet();
  const { user } = useFirebase();
  const [copied, setCopied] = useState(false);

  // Link the connected wallet to the signed-in Firebase profile so it can be
  // shown on profiles and used later for points/leaderboard attribution.
  useEffect(() => {
    if (!isFirebaseConfigured || !user?.uid || !address) return;
    setDoc(doc(db, 'users', user.uid), { walletAddress: address }, { merge: true }).catch(() => {
      // Non-fatal: linking is best-effort.
    });
  }, [user?.uid, address]);

  const copyAddress = async () => {
    if (!address) return;
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard blocked — ignore
    }
  };

  if (!address) {
    return (
      <button
        onClick={connect}
        disabled={connecting}
        className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-gray-900 hover:bg-black text-white text-sm font-semibold transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {connecting ? (
          <span className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
        ) : (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-2m-6-3h9m0 0l-3-3m3 3l-3 3" />
          </svg>
        )}
        {connecting ? 'Connecting…' : 'Connect Wallet'}
      </button>
    );
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-gray-50 p-2.5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="w-2 h-2 rounded-full bg-emerald-500 flex-shrink-0" />
          <button
            onClick={copyAddress}
            title="Copy address"
            className="text-sm font-semibold text-gray-900 font-mono truncate hover:text-gray-600 transition-colors"
          >
            {copied ? 'Copied!' : shortenAddress(address)}
          </button>
        </div>
        <button
          onClick={disconnect}
          title="Disconnect"
          className="text-gray-400 hover:text-rose-500 transition-colors flex-shrink-0"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
          </svg>
        </button>
      </div>
      <div className="mt-1.5 flex items-center gap-1.5 pl-4">
        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${isMainnet ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
          {networkLabel}
        </span>
        <span className="text-[10px] text-gray-400">Stellar</span>
      </div>
    </div>
  );
};

export default WalletButton;
