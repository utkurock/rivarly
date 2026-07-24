// Readable URLs for markets: /market/lusty-finance-500-users instead of a
// Firestore document id. Slugs are stored on the market document, so a link
// keeps working even if the title is later edited.

const TURKISH: Record<string, string> = {
  ç: 'c', Ç: 'c', ğ: 'g', Ğ: 'g', ı: 'i', İ: 'i', ö: 'o', Ö: 'o', ş: 's', Ş: 's', ü: 'u', Ü: 'u',
};

// A whole title makes for a long, ugly link. Filler words carry no meaning in a
// URL, so they go first; what is left is the part someone would actually read.
const FILLER = new Set([
  'a', 'an', 'the', 'will', 'is', 'are', 'am', 'be', 'been', 'was', 'were', 'do', 'does', 'did',
  'can', 'could', 'shall', 'should', 'would', 'may', 'might', 'must', 'have', 'has', 'had',
  'of', 'to', 'in', 'on', 'at', 'by', 'for', 'from', 'with', 'into', 'over', 'than', 'then',
  'this', 'that', 'these', 'those', 'it', 'its', 'and', 'or', 'but', 'if', 'as', 'up', 'out',
  'we', 'you', 'they', 'he', 'she', 'his', 'her', 'their', 'our', 'my',
  've', 'veya', 'ile', 'icin', 'mi', 'mu', 'mus', 'bir', 'bu', 'su', 'da', 'de', 'daha', 'olur',
]);

export const MAX_SLUG_WORDS = 6;
export const MAX_SLUG_LENGTH = 45;

/** Fold a string down to plain lowercase ASCII words. */
const words = (text: string): string[] =>
  (text || '')
    .replace(/[çÇğĞıİöÖşŞüÜ]/g, (c) => TURKISH[c] || c)
    // Strip accents that survive normalisation (é → e, ñ → n).
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/['’]/g, '')
    .split(/[^a-z0-9]+/)
    .filter(Boolean);

/**
 * A short, readable slug: filler words dropped, then capped at a handful of
 * words and a sane length, always cut on a word boundary. Falls back to the
 * unfiltered words when a title is nothing but filler.
 */
export const slugify = (text: string): string => {
  const all = words(text);
  if (!all.length) return '';

  const meaningful = all.filter((w) => !FILLER.has(w));
  const source = meaningful.length ? meaningful : all;

  const picked: string[] = [];
  let length = 0;
  for (const word of source) {
    if (picked.length >= MAX_SLUG_WORDS) break;
    // Keep the first word even if it is long on its own, so nothing returns ''.
    if (picked.length && length + 1 + word.length > MAX_SLUG_LENGTH) break;
    picked.push(word);
    length += (picked.length > 1 ? 1 : 0) + word.length;
  }

  return picked.join('-').slice(0, MAX_SLUG_LENGTH).replace(/-+$/g, '');
};

/** True when a path segment looks like a Firestore auto id rather than a slug. */
export const looksLikeDocId = (value: string): boolean => /^[A-Za-z0-9]{16,}$/.test(value);

/** The canonical link for a market — its slug when it has one, its id otherwise. */
export const marketPath = (market: { id: string; slug?: string }): string =>
  `/market/${market.slug || market.id}`;
