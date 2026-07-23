import { getStellarTweets } from './_tweets';

// Same-origin Stellar tweet feed. Calls the Xquik X/Twitter API server-side with
// a secret key (XQUIK_API_KEY) so the key never reaches the browser and there is
// no CORS problem. Returns a compact, ready-to-render list of tweets.
export const config = { runtime: 'edge' };

export default async function handler(req: Request): Promise<Response> {
  const q = new URL(req.url).searchParams.get('q') || undefined;
  const tweets = await getStellarTweets(q);

  return new Response(JSON.stringify(tweets), {
    status: 200,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      // Cache at the edge for 3 min, serve stale for 10 min while revalidating —
      // keeps the feed fresh without hammering the (metered) scraper API.
      'cache-control': 's-maxage=180, stale-while-revalidate=600',
    },
  });
}
