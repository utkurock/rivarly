import { handleBet } from './_points';

// Trusted market-prediction endpoint (Node serverless). Verifies the on-chain
// bet tx, records the position, syncs the market tallies and awards points.
export default async function handler(req: any, res: any): Promise<void> {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
  const { status, body: out } = await handleBet(body);
  res.status(status).json(out);
}
