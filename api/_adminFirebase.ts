// Firebase Admin singleton for the trusted reward endpoints. Writes bypass
// Firestore security rules, so points can only be awarded here (never from the
// client). Requires FIREBASE_SERVICE_ACCOUNT — the service-account JSON, as a
// single-line string — in the server environment.

import { initializeApp, cert, getApps, type App } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { getAuth, type Auth } from 'firebase-admin/auth';

let app: App | null = null;

function ensureApp(): App | null {
  if (app) return app;

  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) return null;

  let creds: any;
  try {
    creds = JSON.parse(raw);
    if (typeof creds.private_key === 'string') {
      creds.private_key = creds.private_key.replace(/\\n/g, '\n');
    }
  } catch {
    return null;
  }

  app = getApps().length ? getApps()[0] : initializeApp({ credential: cert(creds) });
  return app;
}

export function getAdminDb(): Firestore | null {
  const a = ensureApp();
  return a ? getFirestore(a) : null;
}

export function getAdminAuth(): Auth | null {
  const a = ensureApp();
  return a ? getAuth(a) : null;
}

/** Verify a Firebase ID token and return its uid, or null if invalid/missing. */
export async function verifyUid(idToken: unknown): Promise<string | null> {
  if (typeof idToken !== 'string' || !idToken) return null;
  const auth = getAdminAuth();
  if (!auth) return null;
  try {
    const decoded = await auth.verifyIdToken(idToken);
    return decoded.uid;
  } catch {
    return null;
  }
}
