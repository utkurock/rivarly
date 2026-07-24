// Market volume is staked points, not money. Rendering it with a dollar sign
// read as USD and made people think they were risking cash, so every volume
// figure goes through here and carries the points unit instead.

/** A rounded points figure with thousands separators, e.g. "1,240". */
export const formatPoints = (n: unknown): string => {
  const value = Number(n);
  if (!Number.isFinite(value)) return '0';
  return Math.round(value).toLocaleString('en-US');
};

/** Points with their unit, e.g. "1,240 pts". */
export const formatPointsWithUnit = (n: unknown): string => `${formatPoints(n)} pts`;
