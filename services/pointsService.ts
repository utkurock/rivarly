import { doc, onSnapshot, type Timestamp } from 'firebase/firestore';
import { db, auth } from '../firebase';

// Points are awarded ONLY by the trusted server endpoint (/api/claim), which
// verifies the on-chain claim tx and writes via Firebase Admin. The client just
// reads points for display and triggers the claim — it can't grant itself any.

const DAY_MS = 24 * 60 * 60 * 1000;
export const DAILY_BASE = 100;
export const STREAK_BONUS = 20;      // per consecutive day
export const STREAK_BONUS_CAP = 6;   // bonus stops growing after day 7

export interface PointsData {
  points: number;
  streak: number;
  lastClaimAt: Timestamp | null;
  claimCount: number;
}

const empty: PointsData = { points: 0, streak: 0, lastClaimAt: null, claimCount: 0 };

const parse = (data: any): PointsData => ({
  points: data?.points || 0,
  streak: data?.streak || 0,
  lastClaimAt: data?.lastClaimAt || null,
  claimCount: data?.claimCount || 0,
});

/** Live-subscribe to a user's points/streak/claim state. */
export const subscribeToPoints = (uid: string, cb: (data: PointsData) => void): (() => void) =>
  onSnapshot(
    doc(db, 'users', uid),
    (snap) => cb(snap.exists() ? parse(snap.data()) : empty),
    () => cb(empty)
  );

/** Reward for a claim given the streak it would produce. */
export const rewardForStreak = (streak: number): number =>
  DAILY_BASE + Math.min(Math.max(streak - 1, 0), STREAK_BONUS_CAP) * STREAK_BONUS;

export interface ClaimState {
  canClaim: boolean;
  nextClaimAt: number | null; // epoch ms, when the next claim unlocks
  nextStreak: number;         // streak this claim would set
  nextReward: number;         // points this claim would grant
}

/** Derive whether a claim is available right now and what it would yield. */
export const getClaimState = (data: PointsData, now: number = Date.now()): ClaimState => {
  const last = data.lastClaimAt ? data.lastClaimAt.toMillis() : 0;
  const sinceLast = last ? now - last : Infinity;

  const canClaim = sinceLast >= DAY_MS;
  // Claimed within the 24–48h grace window → streak continues; otherwise resets.
  const continuing = last > 0 && sinceLast < 2 * DAY_MS;
  const nextStreak = continuing ? data.streak + 1 : 1;

  return {
    canClaim,
    nextClaimAt: last ? last + DAY_MS : null,
    nextStreak,
    nextReward: rewardForStreak(nextStreak),
  };
};

export class ClaimError extends Error {}

/**
 * Ask the trusted server to award the daily claim for a verified on-chain tx.
 * The server re-verifies the tx, enforces the cooldown and writes the points.
 * Identity is proven with a Firebase ID token (not a client-supplied uid).
 */
export const recordDailyClaim = async (txHash: string): Promise<{ reward: number; streak: number }> => {
  const idToken = await auth.currentUser?.getIdToken();
  if (!idToken) throw new ClaimError('Please wait for your session to finish loading.');

  let res: Response;
  try {
    res = await fetch('/api/claim', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ idToken, txHash }),
    });
  } catch {
    throw new ClaimError('Could not reach the rewards server. Please try again.');
  }

  const out = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ClaimError(out.error || 'Claim could not be verified.');
  }
  return { reward: out.reward, streak: out.streak };
};
