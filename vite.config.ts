import { defineConfig } from 'vite';
import { readFileSync } from 'node:fs';

const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

// App estático: `npm run build` gera dist/ — suba em qualquer hospedagem (Cloudflare Pages, Netlify, Vercel...).
export default defineConfig({
  base: './',
  // a versão da tela é a do package.json: uma fonte só, nunca um número solto no código
  define: { __VERSAO__: JSON.stringify(version) },
  worker: { format: 'es' },
  build: { target: 'es2022', chunkSizeWarningLimit: 3000 },
  server: { port: 5173 },
});
