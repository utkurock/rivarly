import { getNews } from './_news';

// Same-origin public news endpoint. Aggregates public crypto RSS feeds server-side,
// tags each item and returns JSON. No API key, no third-party proxy.
export const config = { runtime: 'edge' };

export default async function handler(req: Request): Promise<Response> {
  const currency = new URL(req.url).searchParams.get('currency') || undefined;
  const items = await getNews(currency);

  return new Response(JSON.stringify(items), {
    status: 200,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      // Cache at the edge for 5 min, serve stale for 10 min while revalidating.
      'cache-control': 's-maxage=300, stale-while-revalidate=600',
    },
  });
}
