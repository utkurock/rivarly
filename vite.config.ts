import path from 'path';
import type { IncomingMessage } from 'http';
import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { getNews } from './api/_news';
import { getEcosystemProjects } from './api/_ecosystem';

// Serve /api/news during `vite dev` so local development matches the deployed
// Vercel Edge function without needing `vercel dev` or a CORS proxy.
function devNewsApi(): Plugin {
  return {
    name: 'dev-news-api',
    configureServer(server) {
      server.middlewares.use('/api/news', async (req, res) => {
        const url = new URL(req.originalUrl || req.url || '', 'http://localhost');
        const currency = url.searchParams.get('currency') || undefined;
        const items = await getNews(currency);
        res.setHeader('content-type', 'application/json; charset=utf-8');
        res.end(JSON.stringify(items));
      });
    },
  };
}

// Serve /api/ecosystem during `vite dev` so local development matches the
// deployed Vercel Edge function.
function devEcosystemApi(): Plugin {
  return {
    name: 'dev-ecosystem-api',
    configureServer(server) {
      server.middlewares.use('/api/ecosystem', async (_req, res) => {
        const projects = await getEcosystemProjects();
        res.setHeader('content-type', 'application/json; charset=utf-8');
        res.end(JSON.stringify(projects));
      });
    },
  };
}

const readJsonBody = (req: IncomingMessage): Promise<any> =>
  new Promise((resolve) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      try { resolve(raw ? JSON.parse(raw) : {}); } catch { resolve({}); }
    });
  });

// Serve the trusted reward endpoints during dev (mirrors the Vercel Node
// functions). handleClaim is imported lazily so firebase-admin only loads when
// an endpoint is actually hit.
function devRewardApi(): Plugin {
  return {
    name: 'dev-reward-api',
    configureServer(server) {
      const handle = (name: 'handleClaim' | 'handleBet') => async (req: IncomingMessage, res: any) => {
        res.setHeader('content-type', 'application/json; charset=utf-8');
        if (req.method !== 'POST') { res.statusCode = 405; res.end(JSON.stringify({ error: 'Method not allowed' })); return; }
        try {
          const body = await readJsonBody(req);
          const mod = await import('./api/_points');
          const { status, body: out } = await mod[name](body);
          res.statusCode = status;
          res.end(JSON.stringify(out));
        } catch {
          res.statusCode = 500;
          res.end(JSON.stringify({ error: 'Server error' }));
        }
      };
      server.middlewares.use('/api/claim', handle('handleClaim'));
      server.middlewares.use('/api/bet', handle('handleBet'));
      server.middlewares.use('/api/admin-news', async (req: IncomingMessage, res: any) => {
        res.setHeader('content-type', 'application/json; charset=utf-8');
        if (req.method !== 'POST') { res.statusCode = 405; res.end(JSON.stringify({ error: 'Method not allowed' })); return; }
        try {
          const body = await readJsonBody(req);
          const { handleAdminNews } = await import('./api/_adminNews');
          const { status, body: out } = await handleAdminNews(body);
          res.statusCode = status;
          res.end(JSON.stringify(out));
        } catch {
          res.statusCode = 500;
          res.end(JSON.stringify({ error: 'Server error' }));
        }
      });
    },
  };
}

export default defineConfig(({ mode }) => {
    // Expose the vars the dev reward endpoints need (server-side, non-VITE too).
    const env = loadEnv(mode, process.cwd(), '');
    for (const key of ['FIREBASE_SERVICE_ACCOUNT', 'VITE_STELLAR_NETWORK', 'STELLAR_NETWORK', 'ADMIN_PASSWORD']) {
      if (env[key]) process.env[key] = env[key];
    }

    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      plugins: [react(), devNewsApi(), devEcosystemApi(), devRewardApi()],
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        },
      },
      optimizeDeps: {
        include: ['react-is', 'recharts'],
        esbuildOptions: {
          target: 'es2020',
        },
      },
    };
});
