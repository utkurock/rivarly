import { getStoredAdminPassword } from './newsService';

// Market maintenance that only the trusted server can perform. Firestore rules
// let a client write only its own markets, so slugs for everyone else's have to
// be generated with the Admin SDK behind the admin password.

const adminMarkets = async (payload: Record<string, unknown>): Promise<any> => {
  const res = await fetch('/api/admin-markets', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ password: getStoredAdminPassword(), ...payload }),
  });
  const out = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(out.error || 'Request failed.');
  return out;
};

export interface SlugStatus {
  total: number;
  withSlug: number;
  missing: number;
}

export interface SlugBackfillResult {
  scanned: number;
  updated: number;
  skipped: number;
  samples: { id: string; slug: string }[];
}

/** How many markets already have a readable link. */
export const fetchSlugStatus = (): Promise<SlugStatus> => adminMarkets({ action: 'slug-status' });

/**
 * Generate links for markets that don't have one. With `regenerate` every
 * market is rewritten from its current title — old links stop resolving, so it
 * is deliberately not the default.
 */
export const backfillMarketSlugs = (regenerate = false): Promise<SlugBackfillResult> =>
  adminMarkets({ action: 'backfill-slugs', regenerate });

export interface ResolveResult {
  id: string;
  status: 'resolved_yes' | 'resolved_no';
  overridden: boolean;
}

/**
 * Settle a market. Clients cannot write `status` at all — resolution decides
 * who was right, so it only happens on the trusted server. An already resolved
 * market comes back as an error unless `force` is passed.
 */
export const resolveMarket = (
  marketId: string,
  outcome: 'yes' | 'no',
  force = false
): Promise<ResolveResult> => adminMarkets({ action: 'resolve', marketId, outcome, force });
