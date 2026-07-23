import { submitBetTx, ClaimTxError, type BetSide } from './stellarTx';
import { auth } from '../firebase';

export class BetError extends Error {}

export interface BetResult {
  awarded: number;
  side: BetSide;
  isNew: boolean;
}

/**
 * Place a market prediction: sign+submit the on-chain bet tx (memo bound to the
 * uid), then ask the trusted server to verify it, record the position and award
 * points. Identity is proven with a Firebase ID token.
 */
export const placeBet = async (
  uid: string,
  address: string,
  marketId: string,
  side: BetSide,
  sign: (xdr: string) => Promise<string>
): Promise<BetResult> => {
  const idToken = await auth.currentUser?.getIdToken();
  if (!idToken) throw new BetError('Please wait for your session to finish loading.');

  let txHash: string;
  try {
    txHash = await submitBetTx(address, uid, marketId, side, sign);
  } catch (e) {
    throw new BetError(e instanceof ClaimTxError ? e.message : 'Could not submit your prediction.');
  }

  let res: Response;
  try {
    res = await fetch('/api/bet', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ idToken, txHash, marketId, side }),
    });
  } catch {
    throw new BetError('Could not reach the prediction server. Please try again.');
  }

  const out = await res.json().catch(() => ({}));
  if (!res.ok) throw new BetError(out.error || 'Prediction could not be verified.');
  return { awarded: out.awarded || 0, side: out.side, isNew: !!out.isNew };
};
