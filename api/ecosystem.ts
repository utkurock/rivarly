import { getEcosystemProjects } from './_ecosystem';

// Same-origin Stellar ecosystem endpoint. Fetches DefiLlama's public protocol
// list server-side, keeps only Stellar projects, and returns compact JSON.
// No API key, no third-party proxy.
export const config = { runtime: 'edge' };

export default async function handler(_req: Request): Promise<Response> {
  const projects = await getEcosystemProjects();

  return new Response(JSON.stringify(projects), {
    status: 200,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      // Cache at the edge for 30 min, serve stale for 1h while revalidating.
      'cache-control': 's-maxage=1800, stale-while-revalidate=3600',
    },
  });
}
