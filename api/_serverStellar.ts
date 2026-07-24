// Server-side Stellar helpers used by the trusted reward endpoints. Verifies a
// transaction on Horizon (via REST, no SDK) so points can only be awarded for a
// genuine, recent on-chain action from the user's linked wallet.
//
// The reward memo is a sha256 HASH bound to the acting user's uid. This stops
// cross-user replay: a tx built for uid A can never satisfy verification for
// uid B, even if B has (falsely) linked A's wallet address.

import { createHash } from 'crypto';

const IS_MAINNET = (process.env.VITE_STELLAR_NETWORK || process.env.STELLAR_NETWORK || '').toLowerCase() === 'mainnet';
const HORIZON_URL = IS_MAINNET ? 'https://horizon.stellar.org' : 'https://horizon-testnet.stellar.org';

const sha256b64 = (s: string) => createHash('sha256').update(s).digest('base64');

// Expected hash-memo (base64) for each reward action, bound to the uid.
export const claimMemoHash = (uid: string) => sha256b64(`claim:${uid}`);
export const betMemoHash = (uid: string, marketId: string, side: 'yes' | 'no') =>
  sha256b64(`bet:${side}:${marketId}:${uid}`);
export const taskMemoHash = (uid: string, taskId: string) => sha256b64(`task:${taskId}:${uid}`);
export const voteMemoHash = (uid: string, launchId: string) => sha256b64(`vote:${launchId}:${uid}`);
export const perpMemoHash = (uid: string, coin: string, direction: 'long' | 'short', durationSec: number, stake: number) =>
  sha256b64(`perp:${direction}:${coin}:${durationSec}:${stake}:${uid}`);

const RECENT_MS = 15 * 60 * 1000; // a reward tx must be at most 15 minutes old

export interface VerifyResult {
  ok: boolean;
  reason?: string;
  createdAt?: string;
}

/**
 * Verify a transaction hash on-chain: successful, sourced from the expected
 * account, carrying the expected hash memo (uid-bound), and recent (anti-replay).
 */
export async function verifyAppTx(opts: {
  txHash: string;
  expectedSource: string;
  expectedMemoHash: string;
  maxAgeMs?: number;
}): Promise<VerifyResult> {
  const { txHash, expectedSource, expectedMemoHash, maxAgeMs = RECENT_MS } = opts;
  let res: Response;
  try {
    res = await fetch(`${HORIZON_URL}/transactions/${encodeURIComponent(txHash)}`, {
      headers: { accept: 'application/json' },
    });
  } catch {
    return { ok: false, reason: 'Could not reach the Stellar network to verify the transaction.' };
  }

  if (res.status === 404) return { ok: false, reason: 'Transaction not found on-chain yet.' };
  if (!res.ok) return { ok: false, reason: 'Could not verify the transaction.' };

  const tx: any = await res.json();
  if (!tx.successful) return { ok: false, reason: 'The transaction did not succeed.' };
  if (tx.source_account !== expectedSource) return { ok: false, reason: 'Transaction is not from your linked wallet.' };
  if (tx.memo_type !== 'hash' || tx.memo !== expectedMemoHash) {
    return { ok: false, reason: 'Transaction is not a valid Starcast reward action.' };
  }

  const created = Date.parse(tx.created_at);
  if (Number.isFinite(maxAgeMs) && Date.now() - created > maxAgeMs) {
    return { ok: false, reason: 'Transaction is too old; please try again.' };
  }
  return { ok: true, createdAt: tx.created_at };
}
