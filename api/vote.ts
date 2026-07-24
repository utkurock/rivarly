import { handleVote } from './_launches';

// Trusted launch-voting endpoint (Node serverless). Verifies the on-chain vote
// tx, snapshots the voter's stake power and toggles the vote + launch tallies.
export default async function handler(req: any, res: any): Promise<void> {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
  const { status, body: out } = await handleVote(body);
  res.status(status).json(out);
}
