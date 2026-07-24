// Trusted admin market maintenance, behind the SERVER-ONLY password
// (ADMIN_PASSWORD, never VITE_). Writes go through the Admin SDK, which is the
// only way to touch markets a visitor does not own: Firestore rules restrict
// market writes to the creator, so slugs for existing markets cannot be
// backfilled from the client.

import { getAdminDb } from './_adminFirebase';
import { slugify } from '../utils/slug';

export interface AdminMarketsResult {
  status: number;
  body: Record<string, unknown>;
}

interface MarketRow {
  id: string;
  title: string;
  slug: string;
}

const readMarkets = async (db: FirebaseFirestore.Firestore): Promise<MarketRow[]> => {
  const snap = await db.collection('markets').get();
  return snap.docs.map((d) => {
    const data = d.data() as any;
    return {
      id: d.id,
      title: typeof data?.title === 'string' && data.title ? data.title : String(data?.question || ''),
      slug: typeof data?.slug === 'string' ? data.slug : '',
    };
  });
};

/**
 * Give every market a readable slug. Slugs already in use are reserved first,
 * so a rerun is a no-op and collisions get a -2, -3… suffix. Existing slugs are
 * left alone unless `regenerate` is set, since links already point at them.
 */
async function backfillSlugs(
  db: FirebaseFirestore.Firestore,
  regenerate: boolean
): Promise<AdminMarketsResult> {
  const markets = await readMarkets(db);
  const taken = new Set<string>(regenerate ? [] : markets.map((m) => m.slug).filter(Boolean));

  const pending = markets.filter((m) => (regenerate || !m.slug) && m.title.trim());
  const skipped = markets.length - pending.length;

  const updates: { id: string; slug: string }[] = [];
  for (const market of pending) {
    const base = slugify(market.title);
    if (!base) continue;

    let slug = base;
    for (let n = 2; taken.has(slug); n++) slug = `${base}-${n}`;
    taken.add(slug);
    if (slug !== market.slug) updates.push({ id: market.id, slug });
  }

  // Firestore caps a batch at 500 writes.
  for (let i = 0; i < updates.length; i += 400) {
    const batch = db.batch();
    for (const u of updates.slice(i, i + 400)) {
      batch.set(db.collection('markets').doc(u.id), { slug: u.slug }, { merge: true });
    }
    await batch.commit();
  }

  return {
    status: 200,
    body: {
      scanned: markets.length,
      updated: updates.length,
      skipped,
      samples: updates.slice(0, 5),
    },
  };
}

export async function handleAdminMarkets(input: any): Promise<AdminMarketsResult> {
  const db = getAdminDb();
  if (!db) return { status: 503, body: { error: 'Admin server is not configured.' } };

  const pw = process.env.ADMIN_PASSWORD;
  if (!pw) return { status: 503, body: { error: 'Admin password is not configured on the server.' } };
  if (typeof input?.password !== 'string' || input.password !== pw) {
    return { status: 401, body: { error: 'Incorrect admin password.' } };
  }

  const action = input?.action;

  if (action === 'slug-status') {
    const markets = await readMarkets(db);
    return {
      status: 200,
      body: {
        total: markets.length,
        withSlug: markets.filter((m) => m.slug).length,
        missing: markets.filter((m) => !m.slug).length,
      },
    };
  }

  if (action === 'backfill-slugs') return backfillSlugs(db, input?.regenerate === true);

  return { status: 400, body: { error: 'Unknown action.' } };
}
