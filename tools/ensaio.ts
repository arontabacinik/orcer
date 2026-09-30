// O ENSAIO vira página do site: `npm run build` escreve dist/ensaio.html a partir de ENSAIO.md.
//
// Fonte única: o texto mora em ENSAIO.md, que é o que se lê no GitHub. Aqui ele só ganha tipografia, com
// os mesmos tokens de cor do app (claro e escuro). O conversor é pequeno de propósito e cobre exatamente o
// que o ensaio usa — títulos, parágrafos, listas, tabelas, bloco de código, citação, negrito, itálico,
// código, links. Não é um markdown de uso geral, e a conferência no fim reclama se o texto passar a usar
// algo que ele não sabe converter, em vez de publicar errado calado.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const escapar = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** negrito, itálico, código e links — dentro de uma linha já escapada */
function inline(t: string): string {
  const codigos: string[] = [];
  // o código primeiro: dentro dele nada mais vale
  let s = escapar(t).replace(/`([^`]+)`/g, (_, c) => `\u0000${codigos.push(`<code>${c}</code>`) - 1}\u0000`);
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, txt, url) => `<a href="${url}">${txt}</a>`);
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>');
  return s.replace(/\u0000(\d+)\u0000/g, (_, i) => codigos[+i]);
}

const celulas = (linha: string) => linha.replace(/^\||\|$/g, '').split('|').map((c) => c.trim());

export function paraHtml(md: string): { html: string; titulo: string; naoSei: string[] } {
  const linhas = md.split('\n');
  const out: string[] = [];
  const naoSei: string[] = [];
  let titulo = 'Ensaio';
  let i = 0;
  while (i < linhas.length) {
    const l = linhas[i];
    if (!l.trim()) { i++; continue; }

    if (l.startsWith('```')) {                                   // bloco de código
      const corpo: string[] = [];
      i++;
      while (i < linhas.length && !linhas[i].startsWith('```')) corpo.push(linhas[i++]);
      i++;
      out.push(`<pre><code>${escapar(corpo.join('\n'))}</code></pre>`);
      continue;
    }
    const h = l.match(/^(#{1,3}) (.+)$/);
    if (h) {
      const n = h[1].length, txt = h[2];
      if (n === 1) titulo = txt.replace(/[*`]/g, '');
      out.push(`<h${n}>${inline(txt)}</h${n}>`);
      i++; continue;
    }
    if (l.startsWith('> ')) {                                    // citação
      const corpo: string[] = [];
      while (i < linhas.length && linhas[i].startsWith('> ')) corpo.push(linhas[i++].slice(2));
      out.push(`<blockquote><p>${inline(corpo.join(' '))}</p></blockquote>`);
      continue;
    }
    if (l.startsWith('- ')) {                                    // lista
      const itens: string[] = [];
      while (i < linhas.length && linhas[i].startsWith('- ')) itens.push(linhas[i++].slice(2));
      out.push('<ul>' + itens.map((x) => `<li>${inline(x)}</li>`).join('') + '</ul>');
      continue;
    }
    if (l.startsWith('|') && (linhas[i + 1] || '').replace(/[\s|:-]/g, '') === '') {   // tabela
      const cab = celulas(l);
      const alinha = celulas(linhas[i + 1]).map((c) => (c.endsWith(':') ? ' class="dir"' : ''));
      i += 2;
      const corpo: string[][] = [];
      while (i < linhas.length && linhas[i].startsWith('|')) corpo.push(celulas(linhas[i++]));
      out.push('<table><thead><tr>' + cab.map((c, k) => `<th${alinha[k] || ''}>${inline(c)}</th>`).join('') + '</tr></thead><tbody>'
        + corpo.map((r) => '<tr>' + r.map((c, k) => `<td${alinha[k] || ''}>${inline(c)}</td>`).join('') + '</tr>').join('')
        + '</tbody></table>');
      continue;
    }
    if (/^([*_-])\1{2,}\s*$/.test(l.trim())) { out.push('<hr>'); i++; continue; }
    if (/^\d+\. /.test(l) || l.startsWith('    ')) naoSei.push(`linha ${i + 1}: ${l.slice(0, 60)}`);
    const par: string[] = [];                                    // parágrafo
    while (i < linhas.length && linhas[i].trim() && !/^([#>|`-]|```)/.test(linhas[i])) par.push(linhas[i++]);
    if (par.length) out.push(`<p>${inline(par.join(' '))}</p>`);
    else { naoSei.push(`linha ${i + 1}: ${l.slice(0, 60)}`); i++; }
  }
  return { html: out.join('\n'), titulo, naoSei };
}

const ESTILO = `
:root{--bg:#f5f6fb;--panel:#fff;--ink:#0e1222;--ink-2:#4b5270;--ink-3:#8a90a8;--line:#e3e6ef;
--a1:#7c5cff;--a2:#3b82f6;--accent:#5b5bf7;--raio:16px;color-scheme:light dark;
--f:ui-sans-serif,system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;--m:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}
@media (prefers-color-scheme:dark){:root{--bg:#0a0c13;--panel:#11141f;--ink:#eef0f8;--ink-2:#a8aec4;--ink-3:#6c728a;--line:#232839;--accent:#8e80ff}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font-family:var(--f);font-size:17px;line-height:1.65;
-webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility}
.topo{border-bottom:1px solid var(--line);background:color-mix(in srgb,var(--panel) 80%,transparent);
position:sticky;top:0;backdrop-filter:blur(10px);z-index:2}
.topo a{display:inline-flex;align-items:center;gap:9px;max-width:760px;margin:0 auto;padding:13px 20px;
color:var(--ink);text-decoration:none;font-weight:700;letter-spacing:-.02em}
.topo i{width:22px;height:22px;border-radius:7px;background:linear-gradient(135deg,var(--a1),var(--a2))}
main{max-width:760px;margin:0 auto;padding:12px 20px 96px}
h1{font-size:clamp(30px,5.4vw,46px);line-height:1.08;letter-spacing:-.04em;margin:34px 0 8px;text-wrap:balance}
h2{font-size:clamp(21px,3vw,27px);letter-spacing:-.025em;margin:52px 0 12px;text-wrap:balance}
h3{font-size:19px;letter-spacing:-.02em;margin:34px 0 8px}
p,ul,blockquote,table,pre{margin:0 0 18px}
p{text-wrap:pretty}
.sub{color:var(--ink-3);font-size:14.5px;margin-bottom:30px}
a{color:var(--accent)}
strong{font-weight:650}
ul{padding-left:22px}li{margin:0 0 7px}
code{font-family:var(--m);font-size:.875em;background:color-mix(in srgb,var(--ink) 7%,transparent);
padding:.14em .38em;border-radius:6px}
pre{background:var(--panel);border:1px solid var(--line);border-radius:var(--raio);padding:16px 18px;overflow-x:auto}
pre code{background:none;padding:0;font-size:13.5px;line-height:1.55}
blockquote{border-left:3px solid var(--accent);padding:2px 0 2px 18px;margin-left:0;color:var(--ink);font-size:1.06em}
blockquote p{margin:0}
table{width:100%;border-collapse:collapse;font-size:15px;display:block;overflow-x:auto}
th,td{border-bottom:1px solid var(--line);padding:9px 12px;text-align:left;white-space:nowrap}
th{font-weight:650;color:var(--ink-2);font-size:13.5px;letter-spacing:.01em}
.dir{text-align:right}
hr{border:0;border-top:1px solid var(--line);margin:40px 0}
.rodape{max-width:760px;margin:0 auto;padding:0 20px 60px;color:var(--ink-3);font-size:14px}
`;

function pagina(html: string, titulo: string, sub: string) {
  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapar(titulo)} — Orcer</title>
<meta name="description" content="${escapar(sub)}">
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Cdefs%3E%3ClinearGradient id='g' x1='0' y1='0' x2='1' y2='1'%3E%3Cstop offset='0' stop-color='%237C5CFF'/%3E%3Cstop offset='1' stop-color='%233B82F6'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect width='32' height='32' rx='9' fill='url(%23g)'/%3E%3Ccircle cx='16' cy='16' r='6.5' fill='none' stroke='white' stroke-width='3'/%3E%3C/svg%3E">
<style>${ESTILO}</style>
</head>
<body>
<header class="topo"><a href="./"><i></i>orcer</a></header>
<main>
${html}
</main>
<p class="rodape"><a href="./">← voltar ao Orcer</a> · o texto deste ensaio mora em <code>ENSAIO.md</code>, no repositório</p>
</body>
</html>
`;
}

const md = fs.readFileSync(path.join(RAIZ, 'ENSAIO.md'), 'utf8');
const { html, titulo, naoSei } = paraHtml(md);
if (naoSei.length) {
  console.error('ENSAIO.md usa algo que o conversor não sabe converter:');
  naoSei.forEach((x) => console.error('  ' + x));
  process.exit(1);
}
const sub = (md.match(/^O Orcer lê[^\n]*/m) || ['Como o Orcer conta símbolos de prancha elétrica sem nunca chutar.'])[0].slice(0, 180);
const destino = path.join(RAIZ, 'dist', 'ensaio.html');
fs.mkdirSync(path.dirname(destino), { recursive: true });
fs.writeFileSync(destino, pagina(html, titulo, sub));
console.log(`ensaio → dist/ensaio.html (${(fs.statSync(destino).size / 1024).toFixed(0)} kB)`);
