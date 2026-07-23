import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { StellarWalletsKit, Networks, KitEventType } from '@creit.tech/stellar-wallets-kit';
import { defaultModules } from '@creit.tech/stellar-wallets-kit/modules/utils';

// Network is env-driven: default testnet, flip to mainnet with
// VITE_STELLAR_NETWORK=mainnet. Passphrase is what wallets sign against.
const IS_MAINNET = (import.meta.env.VITE_STELLAR_NETWORK || '').toLowerCase() === 'mainnet';
export const STELLAR_NETWORK = IS_MAINNET ? Networks.PUBLIC : Networks.TESTNET;
export const STELLAR_NETWORK_LABEL = IS_MAINNET ? 'Mainnet' : 'Testnet';
export const HORIZON_URL = IS_MAINNET
  ? 'https://horizon.stellar.org'
  : 'https://horizon-testnet.stellar.org';

// The kit is a singleton (static class). Initialize exactly once.
let initialized = false;
function ensureInit() {
  if (initialized) return;
  StellarWalletsKit.init({ modules: defaultModules(), network: STELLAR_NETWORK });
  initialized = true;
}

interface StellarWalletContextValue {
  address: string | null;
  connecting: boolean;
  isMainnet: boolean;
  networkLabel: string;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
}

const StellarWalletContext = createContext<StellarWalletContextValue>({
  address: null,
  connecting: false,
  isMainnet: IS_MAINNET,
  networkLabel: STELLAR_NETWORK_LABEL,
  connect: async () => {},
  disconnect: async () => {},
});

export const StellarWalletProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [address, setAddress] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);

  // Restore a persisted session and track wallet state changes. STATE_UPDATED
  // also fires once at launch with the current (restored) address, if any.
  useEffect(() => {
    ensureInit();
    const offState = StellarWalletsKit.on(KitEventType.STATE_UPDATED, (e) => {
      setAddress(e.payload.address ?? null);
    });
    const offDisconnect = StellarWalletsKit.on(KitEventType.DISCONNECT, () => setAddress(null));
    return () => {
      offState?.();
      offDisconnect?.();
    };
  }, []);

  const connect = useCallback(async () => {
    ensureInit();
    setConnecting(true);
    try {
      const { address: addr } = await StellarWalletsKit.authModal();
      if (addr) setAddress(addr);
    } catch {
      // User closed the modal or a wallet error occurred — leave state as-is.
    } finally {
      setConnecting(false);
    }
  }, []);

  const disconnect = useCallback(async () => {
    try {
      await StellarWalletsKit.disconnect();
    } catch {
      // ignore
    }
    setAddress(null);
  }, []);

  return (
    <StellarWalletContext.Provider
      value={{ address, connecting, isMainnet: IS_MAINNET, networkLabel: STELLAR_NETWORK_LABEL, connect, disconnect }}
    >
      {children}
    </StellarWalletContext.Provider>
  );
};

export const useStellarWallet = () => useContext(StellarWalletContext);

// Shorten an address for display: GABC…WXYZ
export const shortenAddress = (addr: string): string =>
  addr.length > 10 ? `${addr.slice(0, 4)}…${addr.slice(-4)}` : addr;
