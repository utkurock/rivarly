// Trusted admin-news endpoint logic. News mutations run here, behind a
// SERVER-ONLY password (ADMIN_PASSWORD, never VITE_), and write via Admin so the
// `news` collection can be locked to server-only in the rules — closing the hole
// where any signed-in user could inject (phishing) news items.

import { getAdminDb } from './_adminFirebase';

const isSafeId = (s: unknown) => typeof s === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(s);
const str = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : '');
const httpUrl = (v: unknown) => {
  const s = typeof v === 'string' ? v.trim() : '';
  return /^https?:\/\//i.test(s) ? s.slice(0, 2000) : '';
};

// Whitelist + sanitize the fields a news item may carry.
function sanitizeItem(raw: any): Record<string, unknown> {
  const tags = Array.isArray(raw?.tags) ? raw.tags.filter((t: any) => typeof t === 'string').slice(0, 12).map((t: string) => t.slice(0, 40)) : [];
  return {
    title: str(raw?.title, 300),
    description: str(raw?.description, 2000),
    link: httpUrl(raw?.link),
    image: httpUrl(raw?.image),
    source: str(raw?.source, 120),
    category: str(raw?.category, 40) || 'Crypto',
    tags,
    publishedAt: str(raw?.publishedAt, 40) || new Date().toISOString(),
  };
}

export interface AdminNewsResult {
  status: number;
  body: Record<string, unknown>;
}

export async function handleAdminNews(input: any): Promise<AdminNewsResult> {
  const db = getAdminDb();
  if (!db) return { status: 503, body: { error: 'Admin server is not configured.' } };

  const pw = process.env.ADMIN_PASSWORD;
  if (!pw) return { status: 503, body: { error: 'Admin password is not configured on the server.' } };
  if (typeof input?.password !== 'string' || input.password !== pw) {
    return { status: 401, body: { error: 'Incorrect admin password.' } };
  }

  const action = input?.action;
  if (action === 'ping') return { status: 200, body: { ok: true } };

  const col = db.collection('news');

  if (action === 'create') {
    const item = sanitizeItem(input?.item);
    if (!item.title) return { status: 400, body: { error: 'Title is required.' } };
    const ref = await col.add({ ...item, createdAt: new Date().toISOString(), createdBy: 'admin' });
    return { status: 200, body: { id: ref.id } };
  }

  if (action === 'update') {
    if (!isSafeId(input?.id)) return { status: 400, body: { error: 'Invalid id.' } };
    await col.doc(input.id).set(sanitizeItem(input?.item), { merge: true });
    return { status: 200, body: { ok: true } };
  }

  if (action === 'delete') {
    if (!isSafeId(input?.id)) return { status: 400, body: { error: 'Invalid id.' } };
    await col.doc(input.id).delete();
    return { status: 200, body: { ok: true } };
  }

  return { status: 400, body: { error: 'Unknown action.' } };
}
