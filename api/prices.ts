import { getPrices, getKlines, COINS, type Coin } from './_prices';

// Same-origin live price feed for the Perp game. Public, no key.
//   /api/prices                      -> { BTC, ETH, SOL, XLM } spot + 24h change
//   /api/prices?klines=BTC&limit=60  -> recent 1m candles for the mini chart
export const config = { runtime: 'edge' };

export default async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const klines = url.searchParams.get('klines') as Coin | null;

  if (klines && COINS.includes(klines)) {
    const limit = Number(url.searchParams.get('limit')) || 60;
    const candles = await getKlines(klines, limit);
    return new Response(JSON.stringify(candles), {
      status: 200,
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 's-maxage=5, stale-while-revalidate=30',
      },
    });
  }

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
