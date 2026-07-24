// Readable URLs for markets: /market/will-lusty-finance-reach-500-users instead
// of a Firestore document id. Slugs are stored on the market document, so a
// link keeps working even if the title is later edited.

const TURKISH: Record<string, string> = {
  ç: 'c', Ç: 'c', ğ: 'g', Ğ: 'g', ı: 'i', İ: 'i', ö: 'o', Ö: 'o', ş: 's', Ş: 's', ü: 'u', Ü: 'u',
};

export const MAX_SLUG_LENGTH = 70;

/** Turn a title into a lowercase, dash-separated, URL-safe slug. */
export const slugify = (text: string): string => {
  const folded = (text || '')
    .replace(/[çÇğĞıİöÖşŞüÜ]/g, (c) => TURKISH[c] || c)
    // Strip accents that survive normalisation (é → e, ñ → n).
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');

  const slug = folded
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_SLUG_LENGTH)
    .replace(/-+$/g, '');

  return slug;
};

/** True when a path segment looks like a Firestore auto id rather than a slug. */
export const looksLikeDocId = (value: string): boolean => /^[A-Za-z0-9]{16,}$/.test(value);

/** The canonical link for a market — its slug when it has one, its id otherwise. */
export const marketPath = (market: { id: string; slug?: string }): string =>
  `/market/${market.slug || market.id}`;
