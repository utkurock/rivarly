// Stellar ecosystem directory, free and keyless.
//
// The browser calls our own same-origin /api/ecosystem endpoint, which pulls
// DefiLlama's public protocol list server-side, keeps only Stellar projects and
// returns compact JSON (Vercel Edge function in api/ecosystem.ts; a Vite
// middleware serves it in dev). No third-party proxy involved.

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

/**
 * Fetch Stellar ecosystem projects, ranked by TVL. Returns [] on any error so
 * the page can render an empty/unavailable state rather than crash.
 */
export const fetchEcosystemProjects = async (): Promise<EcosystemProject[]> => {
  try {
    const res = await fetch('/api/ecosystem');
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? (data as EcosystemProject[]) : [];
  } catch {
    return [];
  }
};
