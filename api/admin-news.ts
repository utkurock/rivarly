import { handleAdminNews } from './_adminNews';

// Trusted admin-news endpoint (Node serverless). Gated by the server-only
// ADMIN_PASSWORD; writes news via the Admin SDK.
export default async function handler(req: any, res: any): Promise<void> {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
  const { status, body: out } = await handleAdminNews(body);
  res.status(status).json(out);
}
