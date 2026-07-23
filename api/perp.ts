import { handlePerpOpen, handlePerpSettle } from './_perp';

// Trusted Perp endpoint (Node serverless). One route, two actions:
//   { action: 'open',   coin, direction, durationSec, stake }
//   { action: 'settle', id }
// The server fetches entry/exit prices itself and escrows/pays points, so the
// client can never grant itself points.
export default async function handler(req: any, res: any): Promise<void> {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
  const { status, body: out } = body.action === 'settle'
    ? await handlePerpSettle(body)
    : await handlePerpOpen(body);
  res.status(status).json(out);
}
