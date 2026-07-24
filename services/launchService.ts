import {
  addDoc,
  collection,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  where,
} from 'firebase/firestore';
import { db, auth } from '../firebase';
import { submitVoteTx, ClaimTxError } from './stellarTx';
import type { Launch, NewLaunch } from '../types';

// Launches are community products ranked by "stake power" (summed voter points).
// Submitting a launch is a plain client write (guarded by Firestore rules); the
// vote tallies are server-owned and can only change via /api/vote after an
// on-chain, uid-bound verification — so no one can inflate a ranking.

export class LaunchError extends Error {}

// --- Logo upload -----------------------------------------------------------
// Logos are stored inline as a data URL, the same approach services/feed.ts uses
// for post media: no Storage CORS setup, and a 256px square costs far less than
// the 1MB Firestore document limit.

export const LOGO_MAX_BYTES = 5 * 1024 * 1024;
const LOGO_SIZE = 256;

/**
 * Validate, centre-crop and downscale a picked image into a square data URL
 * ready to be stored on the launch document.
 */
export const processLogoFile = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) {
      reject(new LaunchError('Please choose an image file.'));
      return;
    }
    if (file.size > LOGO_MAX_BYTES) {
      reject(new LaunchError('That image is larger than 5MB.'));
      return;
    }

    const reader = new FileReader();
    reader.onerror = () => reject(new LaunchError('Could not read that file.'));
    reader.onload = (event) => {
      const img = new Image();
      img.onerror = () => reject(new LaunchError('That image could not be loaded.'));
      img.onload = () => {
        // Centre crop to a square, then paint it at LOGO_SIZE.
        const side = Math.min(img.width, img.height);
        const sx = (img.width - side) / 2;
        const sy = (img.height - side) / 2;

        const canvas = document.createElement('canvas');
        canvas.width = LOGO_SIZE;
        canvas.height = LOGO_SIZE;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new LaunchError('Could not process that image.'));
          return;
        }
        ctx.drawImage(img, sx, sy, side, side, 0, 0, LOGO_SIZE, LOGO_SIZE);

        // Keep alpha for PNG-ish sources; photos go out as JPEG to stay small.
        const keepsAlpha = /png|webp|svg|gif/i.test(file.type);
        resolve(canvas.toDataURL(keepsAlpha ? 'image/png' : 'image/jpeg', 0.9));
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  });

const parseLaunch = (id: string, data: any): Launch => ({
  id,
  name: data?.name || 'Untitled',
  tagline: data?.tagline || '',
  url: data?.url || '',
  category: data?.category || 'Other',
  network: data?.network === 'testnet' ? 'testnet' : 'mainnet',
  description: data?.description || undefined,
  logoUrl: data?.logoUrl || undefined,
  tags: Array.isArray(data?.tags) ? data.tags : undefined,
  twitter: data?.twitter || undefined,
  github: data?.github || undefined,
  submittedBy: data?.submittedBy || '',
  submitterProfile: data?.submitterProfile || undefined,
  voteCount: Number(data?.voteCount) || 0,
  voteWeight: Number(data?.voteWeight) || 0,
  status: data?.status === 'hidden' ? 'hidden' : 'live',
  createdAt: data?.createdAt,
});

/** Live-subscribe to all launches, ranked by stake power (heaviest first). */
export const subscribeToLaunches = (cb: (launches: Launch[]) => void): (() => void) => {
  const q = query(collection(db, 'launches'), orderBy('voteWeight', 'desc'));
  return onSnapshot(
    q,
    (snap) => cb(snap.docs.map((d) => parseLaunch(d.id, d.data())).filter((l) => l.status === 'live')),
    () => cb([])
  );
};

/** Live-subscribe to the set of launch ids this user is currently upvoting. */
export const subscribeToUserVotes = (uid: string, cb: (activeLaunchIds: Set<string>) => void): (() => void) => {
  const q = query(collection(db, 'launchVotes'), where('uid', '==', uid));
  return onSnapshot(
    q,
    (snap) => {
      const active = new Set<string>();
      snap.forEach((d) => {
        const data: any = d.data();
        if (data?.active && data?.launchId) active.add(data.launchId);
      });
      cb(active);
    },
    () => cb(new Set())
  );
};

/** Submit a new launch. Tallies start at zero; the server owns them thereafter. */
export const submitLaunch = async (data: NewLaunch): Promise<string> => {
  const user = auth.currentUser;
  if (!user?.uid) throw new LaunchError('Please sign in to submit a launch.');

  const ref = await addDoc(collection(db, 'launches'), {
    name: data.name.trim(),
    tagline: data.tagline.trim(),
    url: data.url.trim(),
    category: data.category,
    network: data.network === 'testnet' ? 'testnet' : 'mainnet',
    description: data.description?.trim() || null,
    logoUrl: data.logoUrl?.trim() || null,
    tags: data.tags && data.tags.length ? data.tags : null,
    twitter: data.twitter?.trim() || null,
    github: data.github?.trim() || null,
    submittedBy: user.uid,
    submitterProfile: {
      username: user.displayName || 'Anonymous',
      avatar: user.photoURL || '',
    },
    voteCount: 0,
    voteWeight: 0,
    status: 'live',
    createdAt: serverTimestamp(),
  });
  return ref.id;
};

export interface VoteResult {
  active: boolean;
  weight: number;
  voteCount: number;
  voteWeight: number;
}

/**
 * Toggle an upvote on a launch: sign+submit the on-chain vote tx (memo bound to
 * the uid + launch), then let the trusted server verify it, snapshot the voter's
 * stake power and update the tallies. Voting never spends points.
 */
export const castVote = async (
  uid: string,
  address: string,
  launchId: string,
  sign: (xdr: string) => Promise<string>
): Promise<VoteResult> => {
  const idToken = await auth.currentUser?.getIdToken();
  if (!idToken) throw new LaunchError('Please wait for your session to finish loading.');

  let txHash: string;
  try {
    txHash = await submitVoteTx(address, uid, launchId, sign);
  } catch (e) {
    throw new LaunchError(e instanceof ClaimTxError ? e.message : 'Could not submit your vote.');
  }

  let res: Response;
  try {
    res = await fetch('/api/vote', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ idToken, txHash, launchId }),
    });
  } catch {
    throw new LaunchError('Could not reach the voting server. Please try again.');
  }

  const out = await res.json().catch(() => ({}));
  if (!res.ok) throw new LaunchError(out.error || 'Vote could not be verified.');
  return {
    active: !!out.active,
    weight: Number(out.weight) || 0,
    voteCount: Number(out.voteCount) || 0,
    voteWeight: Number(out.voteWeight) || 0,
  };
};
