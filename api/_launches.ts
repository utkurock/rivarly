// Trusted launch-voting logic (Product Hunt-style). A vote is an on-chain
// Stellar action whose weight is the voter's *stake power* — their current
// points — captured as a snapshot at vote time. Voting never spends points;
// points only make a vote heavier. All tallies are written here via Firebase
// Admin (after on-chain verification), so a client can never inflate a launch.

import { FieldValue } from 'firebase-admin/firestore';
import { getAdminDb, verifyUid } from './_adminFirebase';
import { verifyAppTx, voteMemoHash } from './_serverStellar';
import type { HandlerResult } from './_points';

// Firestore doc-id safety: no path separators or control chars.
const isSafeId = (s: string) => /^[A-Za-z0-9_-]{1,128}$/.test(s);

// Every voter's ballot counts at least this much, so a brand-new user with zero
// points still moves the needle; points stack on top as extra stake power.
const BASE_STAKE = 1;
const stakePowerOf = (points: unknown): number =>
  BASE_STAKE + Math.max(0, Math.floor(typeof points === 'number' ? points : 0));

/**
 * Toggle a launch upvote for the acting user. The on-chain tx proves intent;
 * the server decides vote vs un-vote from current state and re-snapshots the
 * stake power on each fresh cast. Returns the new vote state + live tallies.
 */
export async function handleVote(input: {
  idToken?: string;
  txHash?: string;
  launchId?: string;
}): Promise<HandlerResult> {
  const db = getAdminDb();
  if (!db) return { status: 503, body: { error: 'Voting is not available right now.' } };

  const uid = await verifyUid(input.idToken);
  if (!uid) return { status: 401, body: { error: 'Not signed in.' } };

  const txHash = typeof input.txHash === 'string' ? input.txHash : '';
  const launchId = typeof input.launchId === 'string' ? input.launchId : '';
  if (!txHash || !isSafeId(txHash) || !launchId || !isSafeId(launchId)) {
    return { status: 400, body: { error: 'Invalid vote details.' } };
  }

  const userRef = db.collection('users').doc(uid);
  const userSnap = await userRef.get();
  const userData: any = userSnap.exists ? userSnap.data() : {};
  const wallet: string | undefined = userData.walletAddress;
  if (!wallet) return { status: 400, body: { error: 'Connect and link a Stellar wallet first.' } };

  // On-chain verification: memo is hash-bound to this uid + launch.
  const verify = await verifyAppTx({ txHash, expectedSource: wallet, expectedMemoHash: voteMemoHash(uid, launchId) });
  if (!verify.ok) return { status: 400, body: { error: verify.reason || 'Transaction could not be verified.' } };

  const launchRef = db.collection('launches').doc(launchId);
  const voteRef = db.collection('launchVotes').doc(`${launchId}__${uid}`);

  try {
    const result = await db.runTransaction(async (tx) => {
      const launchDoc = await tx.get(launchRef);
      if (!launchDoc.exists) return { error: 'This launch no longer exists.' as const };

      const voteDoc = await tx.get(voteRef);
      const prev: any = voteDoc.exists ? voteDoc.data() : null;

      // Anti-replay: a given tx can drive only one vote transition.
      if (prev && prev.lastTxHash === txHash) {
        return { error: 'This transaction has already been used.' as const };
      }

      const wasActive = !!prev?.active;
      const launch: any = launchDoc.data();

      if (wasActive) {
        // Un-vote: pull back the weight recorded when the vote was cast.
        const prevWeight = Math.max(0, Number(prev.weight) || 0);
        tx.set(voteRef, { active: false, lastTxHash: txHash, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
        tx.set(
          launchRef,
          {
            voteCount: FieldValue.increment(-1),
            voteWeight: FieldValue.increment(-prevWeight),
          },
          { merge: true }
        );
        return {
          active: false,
          weight: 0,
          voteCount: Math.max(0, (Number(launch.voteCount) || 0) - 1),
          voteWeight: Math.max(0, (Number(launch.voteWeight) || 0) - prevWeight),
        };
      }

      // Cast (or re-cast after un-voting): snapshot stake power right now.
      const weight = stakePowerOf(userData.points);
      tx.set(
        voteRef,
        {
          uid,
          launchId,
          weight,
          active: true,
          lastTxHash: txHash,
          updatedAt: FieldValue.serverTimestamp(),
          ...(voteDoc.exists ? {} : { createdAt: FieldValue.serverTimestamp() }),
        },
        { merge: true }
      );
      tx.set(
        launchRef,
        {
          voteCount: FieldValue.increment(1),
          voteWeight: FieldValue.increment(weight),
        },
        { merge: true }
      );
      return {
        active: true,
        weight,
        voteCount: (Number(launch.voteCount) || 0) + 1,
        voteWeight: (Number(launch.voteWeight) || 0) + weight,
      };
    });

    if ('error' in result) {
      const code = result.error.includes('already been used') ? 409 : 404;
      return { status: code, body: { error: result.error } };
    }
    return { status: 200, body: result };
  } catch {
    return { status: 500, body: { error: 'Could not record your vote. Please try again.' } };
  }
}
