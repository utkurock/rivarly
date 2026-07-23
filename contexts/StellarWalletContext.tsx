import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { StellarWalletsKit, Networks, KitEventType, type ISupportedWallet } from '@creit.tech/stellar-wallets-kit';
import { defaultModules } from '@creit.tech/stellar-wallets-kit/modules/utils';

export type { ISupportedWallet };

// Network is env-driven: default testnet, flip to mainnet with
// VITE_STELLAR_NETWORK=mainnet. Passphrase is what wallets sign against.
const IS_MAINNET = (import.meta.env.VITE_STELLAR_NETWORK || '').toLowerCase() === 'mainnet';
export const STELLAR_NETWORK = IS_MAINNET ? Networks.PUBLIC : Networks.TESTNET;
export const STELLAR_NETWORK_LABEL = IS_MAINNET ? 'Mainnet' : 'Testnet';
export const HORIZON_URL = IS_MAINNET
  ? 'https://horizon.stellar.org'
  : 'https://horizon-testnet.stellar.org';

// Theme the kit's wallet-selection modal to match the app: black primary,
// white surface, the site's gray scale, Poppins, and matching rounded corners.
const RIVARLY_SWK_THEME = {
  background: '#ffffff',
  'background-secondary': '#f8f9fa',
  'foreground-strong': '#111111',
  foreground: '#374151',
  'foreground-secondary': '#6b7280',
  primary: '#111111',
  'primary-foreground': '#ffffff',
  transparent: 'transparent',
  lighter: '#ffffff',
  light: '#f3f4f6',
  'light-gray': '#e5e7eb',
  gray: '#9ca3af',
  danger: '#ef4444',
  border: '#e5e7eb',
  shadow: 'rgba(17, 17, 17, 0.08)',
  'border-radius': '16px',
  'font-family': "'Poppins', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
};

// The kit is a singleton (static class). Initialize exactly once.
let initialized = false;
function ensureInit() {
  if (initialized) return;
  StellarWalletsKit.init({ modules: defaultModules(), network: STELLAR_NETWORK, theme: RIVARLY_SWK_THEME });
  initialized = true;
}

interface StellarWalletContextValue {
  address: string | null;
  connecting: boolean;
  isMainnet: boolean;
  networkLabel: string;
  listWallets: () => Promise<ISupportedWallet[]>;
  selectWallet: (id: string) => Promise<void>;
  disconnect: () => Promise<void>;
}

const StellarWalletContext = createContext<StellarWalletContextValue>({
  address: null,
  connecting: false,
  isMainnet: IS_MAINNET,
  networkLabel: STELLAR_NETWORK_LABEL,
  listWallets: async () => [],
  selectWallet: async () => {},
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

  // Supported wallets for our own site-styled picker (each has id, name, icon,
  // isAvailable, url).
  const listWallets = useCallback(() => {
    ensureInit();
    return StellarWalletsKit.refreshSupportedWallets();
  }, []);

  // Activate a wallet by id and fetch its address (prompts the wallet). Throws
  // if the user rejects, so the caller can keep the picker open.
  const selectWallet = useCallback(async (id: string) => {
    ensureInit();
    setConnecting(true);
    try {
      StellarWalletsKit.setWallet(id);
      const { address: addr } = await StellarWalletsKit.fetchAddress();
      if (addr) setAddress(addr);
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
      value={{ address, connecting, isMainnet: IS_MAINNET, networkLabel: STELLAR_NETWORK_LABEL, listWallets, selectWallet, disconnect }}
    >
      {children}
    </StellarWalletContext.Provider>
  );
};

export const useStellarWallet = () => useContext(StellarWalletContext);

// Shorten an address for display: GABC…WXYZ
export const shortenAddress = (addr: string): string =>
  addr.length > 10 ? `${addr.slice(0, 4)}…${addr.slice(-4)}` : addr;
