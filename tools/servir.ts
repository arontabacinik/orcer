// Serve dist/ COMO A CLOUDFLARE SERVE: os cabeçalhos de public/_headers aplicados aos arquivos publicados.
//
// O `vite preview` não conhece esse arquivo, então testar por ele é testar outra coisa: a CSP mais apertada
// do mundo passa num servidor que não a envia. Aqui ela é enviada, e o `npm run tela` roda contra isto —
// se a política quebrar o app, o teste acusa antes do deploy, não depois.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';

const TIPOS: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.pdf': 'application/pdf',
  '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8',
};

/** o _headers da Cloudflare: uma linha de caminho, depois as linhas "Nome: valor" indentadas */
export function lerHeaders(arquivo: string): { re: RegExp; hs: [string, string][] }[] {
  if (!fs.existsSync(arquivo)) return [];
  const regras: { re: RegExp; hs: [string, string][] }[] = [];
  let atual: { re: RegExp; hs: [string, string][] } | null = null;
  for (const linha of fs.readFileSync(arquivo, 'utf8').split('\n')) {
    if (!linha.trim() || linha.trim().startsWith('#')) continue;
    if (!/^\s/.test(linha)) {
      const glob = linha.trim();
      atual = { re: new RegExp('^' + glob.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$'), hs: [] };
      regras.push(atual);
    } else if (atual) {
      const k = linha.indexOf(':');
      if (k > 0) atual.hs.push([linha.slice(0, k).trim(), linha.slice(k + 1).trim()]);
    }
  }
  return regras;
}

export function servir(raiz: string, porta: number): Promise<http.Server> {
  const regras = lerHeaders(path.join(raiz, '_headers'));
  const s = http.createServer((req, res) => {
    const url = decodeURIComponent((req.url || '/').split('?')[0]);
    let rel = url.endsWith('/') ? url + 'index.html' : url;
    // nada de sair da pasta publicada
    const alvo = path.resolve(raiz, '.' + rel);
    if (!alvo.startsWith(path.resolve(raiz))) { res.writeHead(403).end(); return; }
    if (!fs.existsSync(alvo) || fs.statSync(alvo).isDirectory()) { res.writeHead(404, { 'content-type': 'text/plain' }).end('404'); return; }
    const cab: Record<string, string> = { 'content-type': TIPOS[path.extname(alvo)] || 'application/octet-stream' };
    for (const r of regras) if (r.re.test(rel)) for (const [k, v] of r.hs) cab[k] = v;
    res.writeHead(200, cab);
    fs.createReadStream(alvo).pipe(res);
  });
  return new Promise((ok) => s.listen(porta, '127.0.0.1', () => ok(s)));
}

// `tsx tools/servir.ts [porta]` — para olhar o site com os cabeçalhos de produção
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  const raiz = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', 'dist');
  const porta = +(process.argv[2] || 4174);
  servir(raiz, porta).then(() => console.log(`dist/ com os cabeçalhos de produção em http://127.0.0.1:${porta}/`));
}
