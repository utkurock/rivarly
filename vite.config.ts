import path from 'path';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { getNews } from './api/_news';

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

export default defineConfig(() => {
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      plugins: [react(), devNewsApi()],
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
