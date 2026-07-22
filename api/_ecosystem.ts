// Server-side Stellar ecosystem directory, shared by the Vercel function
// (api/ecosystem.ts) and the Vite dev middleware (vite.config.ts). Files
// prefixed with "_" are not treated as routes by Vercel.
//
// It pulls the full protocol list from DefiLlama's free, keyless public API and
// keeps only protocols that operate on the Stellar chain, returning a compact,
// ready-to-render, TVL-ranked list. No API key, no third-party proxy.

export interface EcosystemProject {
  id: string;
  name: string;
  symbol?: string;
  category: string;
  description: string;
  logo: string;
  url: string;
  twitter?: string;
  chains: string[];
  tvl: number;
  change1d?: number;
  change7d?: number;
}

const CHAIN = 'Stellar';
const SOURCE = 'https://api.llama.fi/protocols';

// Categories that are not Stellar-native ecosystem projects — centralized
// exchanges merely list XLM and would otherwise dominate the TVL ranking.
const EXCLUDED_CATEGORIES = new Set(['CEX']);

const slugify = (s: string) =>
  s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

const clean = (s: unknown): string => (typeof s === 'string' ? s.trim() : '');

/**
 * Fetch Stellar ecosystem projects, ranked by TVL (highest first).
 * Returns [] on any network/parse error so the caller can hide the section.
 */
export async function getEcosystemProjects(): Promise<EcosystemProject[]> {
  try {
    const res = await fetch(SOURCE, {
      headers: { accept: 'application/json' },
    });
    if (!res.ok) return [];

    const all = await res.json();
    if (!Array.isArray(all)) return [];

    const projects: EcosystemProject[] = all
      .filter((p: any) => Array.isArray(p?.chains) && p.chains.includes(CHAIN))
      .filter((p: any) => !EXCLUDED_CATEGORIES.has(clean(p?.category)))
      .map((p: any): EcosystemProject => {
        const name = clean(p.name) || 'Unknown';
        const symbol = clean(p.symbol);
        return {
          id: clean(p.slug) || slugify(name),
          name,
          symbol: symbol && symbol !== '-' ? symbol : undefined,
          category: clean(p.category) || 'Other',
          description: clean(p.description),
          logo: clean(p.logo),
          url: clean(p.url),
          twitter: clean(p.twitter) || undefined,
          chains: Array.isArray(p.chains) ? p.chains : [CHAIN],
          tvl: typeof p.tvl === 'number' ? p.tvl : 0,
          change1d: typeof p.change_1d === 'number' ? p.change_1d : undefined,
          change7d: typeof p.change_7d === 'number' ? p.change_7d : undefined,
        };
      });

    projects.sort((a, b) => b.tvl - a.tvl);
    return projects;
  } catch {
    return [];
  }
}
