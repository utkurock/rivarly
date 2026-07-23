// Trusted reward logic shared by the Vercel function (api/claim.ts) and the
// Vite dev middleware. All points writes happen here via Firebase Admin after
// on-chain verification, so the client can never grant itself points.

import { FieldValue } from 'firebase-admin/firestore';
import { getAdminDb } from './_adminFirebase';
import { verifyAppTx, CLAIM_MEMO, betMemo } from './_serverStellar';

const DAY_MS = 24 * 60 * 60 * 1000;
const DAILY_BASE = 100;
const STREAK_BONUS = 20;
const STREAK_BONUS_CAP = 6;
const BET_POINTS = 50; // awarded once per market for a user's first prediction

const rewardForStreak = (streak: number): number =>
  DAILY_BASE + Math.min(Math.max(streak - 1, 0), STREAK_BONUS_CAP) * STREAK_BONUS;

export interface HandlerResult {
  status: number;
  body: Record<string, unknown>;
}

export async function handleClaim(input: { uid?: string; txHash?: string }): Promise<HandlerResult> {
  const uid = typeof input.uid === 'string' ? input.uid : '';
  const txHash = typeof input.txHash === 'string' ? input.txHash : '';
  if (!uid || !txHash) return { status: 400, body: { error: 'Missing uid or txHash.' } };

  const db = getAdminDb();
  if (!db) return { status: 503, body: { error: 'Rewards are not available right now.' } };

  const ref = db.collection('users').doc(uid);
  const snap = await ref.get();
  const data: any = snap.exists ? snap.data() : {};

  const wallet: string | undefined = data.walletAddress;
  if (!wallet) return { status: 400, body: { error: 'Connect and link a Stellar wallet first.' } };

  // Anti-replay: a given tx can fund only one claim.
  if (data.lastClaimTxHash && data.lastClaimTxHash === txHash) {
    return { status: 409, body: { error: 'This transaction has already been used.' } };
  }

  // Server-enforced 24h cooldown.
  const lastMs = data.lastClaimAt?.toMillis ? data.lastClaimAt.toMillis() : 0;
  if (lastMs && Date.now() - lastMs < DAY_MS) {
    return { status: 429, body: { error: 'You have already claimed today.' } };
  }

  // On-chain verification.
  const verify = await verifyAppTx({ txHash, expectedSource: wallet, expectedMemo: CLAIM_MEMO });
  if (!verify.ok) return { status: 400, body: { error: verify.reason || 'Transaction could not be verified.' } };

  const continuing = lastMs > 0 && Date.now() - lastMs < 2 * DAY_MS;
  const streak = continuing ? (data.streak || 0) + 1 : 1;
  const reward = rewardForStreak(streak);

  await ref.set(
    {
      points: FieldValue.increment(reward),
      streak,
      claimCount: FieldValue.increment(1),
      lastClaimAt: FieldValue.serverTimestamp(),
      lastClaimTxHash: txHash,
    },
    { merge: true }
  );

  return { status: 200, body: { reward, streak } };
}

export async function handleBet(input: {
  uid?: string;
  txHash?: string;
  marketId?: string;
  side?: string;
}): Promise<HandlerResult> {
  const uid = typeof input.uid === 'string' ? input.uid : '';
  const txHash = typeof input.txHash === 'string' ? input.txHash : '';
  const marketId = typeof input.marketId === 'string' ? input.marketId : '';
  const side = input.side === 'yes' || input.side === 'no' ? input.side : '';
  if (!uid || !txHash || !marketId || !side) {
    return { status: 400, body: { error: 'Missing bet details.' } };
  }

  const db = getAdminDb();
  if (!db) return { status: 503, body: { error: 'Predictions are not available right now.' } };

  const userRef = db.collection('users').doc(uid);
  const userSnap = await userRef.get();
  const userData: any = userSnap.exists ? userSnap.data() : {};
  const wallet: string | undefined = userData.walletAddress;
  if (!wallet) return { status: 400, body: { error: 'Connect and link a Stellar wallet first.' } };

  const betRef = db.collection('bets').doc(`${marketId}_${uid}`);
  const betSnap = await betRef.get();
  const prev: any = betSnap.exists ? betSnap.data() : null;

  // Anti-replay: a tx can back only one prediction.
  if (prev && prev.txHash === txHash) {
    return { status: 409, body: { error: 'This transaction has already been used.' } };
  }

  // On-chain verification (memo binds the tx to this exact market + side).
  const verify = await verifyAppTx({ txHash, expectedSource: wallet, expectedMemo: betMemo(marketId, side) });
  if (!verify.ok) return { status: 400, body: { error: verify.reason || 'Transaction could not be verified.' } };

  const isNew = !betSnap.exists;
  const prevSide: string | null = prev?.side ?? null;

  await betRef.set(
    {
      uid,
      marketId,
      side,
      txHash,
      updatedAt: FieldValue.serverTimestamp(),
      ...(isNew ? { createdAt: FieldValue.serverTimestamp() } : {}),
    },
    { merge: true }
  );

  // Keep the market's YES/NO tallies in sync.
  const marketRef = db.collection('markets').doc(marketId);
  const inc: Record<string, any> = {};
  if (isNew) {
    inc[side === 'yes' ? 'yesBets' : 'noBets'] = FieldValue.increment(1);
  } else if (prevSide && prevSide !== side) {
    inc[side === 'yes' ? 'yesBets' : 'noBets'] = FieldValue.increment(1);
    inc[prevSide === 'yes' ? 'yesBets' : 'noBets'] = FieldValue.increment(-1);
  }
  if (Object.keys(inc).length) {
    await marketRef.set(inc, { merge: true }).catch(() => {});
  }

  // Award points once per market (first prediction), to bound point farming.
  let awarded = 0;
  if (isNew) {
    awarded = BET_POINTS;
    await userRef.set({ points: FieldValue.increment(BET_POINTS), betCount: FieldValue.increment(1) }, { merge: true });
  }

  return { status: 200, body: { awarded, side, isNew } };
}
