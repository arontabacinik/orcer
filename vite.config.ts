import { defineConfig } from 'vite';

// App estático: `npm run build` gera dist/ — suba em qualquer hospedagem (Cloudflare Pages, Netlify, Vercel...).
export default defineConfig({
  base: './',
  worker: { format: 'es' },
  build: { target: 'es2022', chunkSizeWarningLimit: 3000 },
  server: { port: 5173 },
});
