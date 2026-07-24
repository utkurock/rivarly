import { getPrices } from './_prices';

// Same-origin live price feed for the Perp game. Public, no key.
//   /api/prices  -> { BTC, ETH, SOL, XLM } spot + 24h change
export const config = { runtime: 'edge' };

export default async function handler(_req: Request): Promise<Response> {
  const prices = await getPrices();
  return new Response(JSON.stringify(prices || {}), {
    status: 200,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      // Very short cache — this drives a live ticker.
      'cache-control': 's-maxage=2, stale-while-revalidate=10',
    },
  });
}
