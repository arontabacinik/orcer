// npm run aferir -- prancha.pdf [outra.pdf ...]
//
// POR QUE ISTO EXISTE. Todo número de contagem do benchmark sai de folhas que o próprio projeto gerou
// (bench/gerar). Isso mede o motor contra o gosto de quem escreveu o gerador, não contra uma prancha de
// verdade — e as duas coisas não são a mesma. Aqui está a medida que faltava: pegue as SUAS pranchas,
// confira com os olhos o que o Orcer afirmou, e saia com um número real.
//
// PRIVACIDADE. Nada sai do computador. O PDF é lido localmente, os recortes são desenhados em SVG a partir
// dos próprios traços do PDF (sem rasterizar, sem enviar nada a lugar nenhum) e a página de conferência é
// um arquivo HTML solto que abre no navegador. O julgamento é salvo por você, num JSON, e é só ele que
// precisa ser compartilhado se você quiser me mandar o resultado.
//
//   npm run aferir -- ~/pranchas/*.pdf        gera aferir/<arquivo>.html
//   (abra, confira item por item, baixe o julgamento)
//   npm run aferir -- --resumo aferir/*.json  o número real
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { lerPdf } from '../src/ler';
import { paraVista, ROTULO, type FolhaVista, type ItemVista } from '../src/lista';
import type { Folha, Prim, Caixa } from '../src/motor/tipos';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SAIDA = process.env.AFERIR_DIR || path.join(RAIZ, 'aferir');
const require = createRequire(import.meta.url);

const uniao = (a: Caixa, b: Caixa): Caixa => [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])];
const esc = (s: string) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Um pedaço da prancha, desenhado a partir dos traços que o motor leu. É o que ELE viu, não uma foto. */
function recorte(prims: Prim[], caixa: Caixa, lado = 120, folga = 0.55): string {
  const w = caixa[2] - caixa[0], h = caixa[3] - caixa[1];
  const m = Math.max(w, h) * folga + 2;
  const v: Caixa = [caixa[0] - m, caixa[1] - m, caixa[2] + m, caixa[3] + m];
  const vw = v[2] - v[0], vh = v[3] - v[1];
  const dentro = prims.filter((p) => p.bbox[0] < v[2] && p.bbox[2] > v[0] && p.bbox[1] < v[3] && p.bbox[3] > v[1]);
  const risco = Math.max(vw, vh) / lado * 0.9;
  const partes: string[] = [];
  for (const p of dentro.slice(0, 1200)) {
    const d: string[] = [];
    for (let i = 0; i < p.segs.length; i += 4) d.push(`M${p.segs[i].toFixed(2)} ${p.segs[i + 1].toFixed(2)}L${p.segs[i + 2].toFixed(2)} ${p.segs[i + 3].toFixed(2)}`);
    if (!d.length) continue;
    partes.push(`<path d="${d.join('')}" stroke="${p.stroke || p.fill || '#111'}" stroke-width="${risco.toFixed(2)}" fill="none" stroke-linecap="round"/>`);
  }
  // a moldura mostra exatamente o que o motor marcou
  partes.push(`<rect x="${caixa[0].toFixed(2)}" y="${caixa[1].toFixed(2)}" width="${w.toFixed(2)}" height="${h.toFixed(2)}" fill="none" stroke="#e11d48" stroke-width="${(risco * 0.8).toFixed(2)}" stroke-dasharray="${(risco * 2).toFixed(2)}"/>`);
  return `<svg viewBox="${v[0].toFixed(2)} ${v[1].toFixed(2)} ${vw.toFixed(2)} ${vh.toFixed(2)}" width="${lado}" height="${lado}">${partes.join('')}</svg>`;
}

interface Linha { arquivo: string; pagina: number; idx: number; nome: string; qtd: number | null; unidade: string; situacao: string; metodo: string; }

function paginaHtml(arquivo: string, folhas: Folha[], vistas: FolhaVista[]) {
  const blocos: string[] = [];
  const linhas: Linha[] = [];
  vistas.forEach((fv, k) => {
    const prims = folhas[k].prims.filter((p) => p.segs && p.segs.length);
    for (const it of fv.itens) {
      if (it.tipo === 'nota') continue;
      linhas.push({ arquivo, pagina: fv.pagina, idx: it.idx, nome: it.nome, qtd: it.qtd, unidade: it.unidade, situacao: it.situacao, metodo: it.metodo });
      const icone = it.icone && it.icone[2] > it.icone[0] ? recorte(prims, it.icone, 96) : '<div class="vazio">sem ícone</div>';
      const marcas = (it.marcas || []).slice(0, 60);
      const grade = marcas.length
        ? marcas.map((b) => `<div class="oc">${recorte(prims, b, 96)}</div>`).join('')
        : '<p class="vazio">o motor não marcou nenhuma ocorrência</p>';
      const chave = `${fv.pagina}:${it.idx}`;
      blocos.push(`<section class="item" data-k="${esc(chave)}">
  <header>
    <div class="ic">${icone}</div>
    <div class="quem"><h3>${esc(it.nome || '(sem descrição na legenda)')}</h3>
      <p class="afirma"><b>${it.qtd == null ? '—' : String(it.qtd).replace('.', ',')}</b> ${esc(it.unidade)} · <span class="s s-${it.situacao}">${esc(ROTULO[it.situacao as keyof typeof ROTULO] || it.situacao)}</span> · folha ${fv.pagina}</p>
      <p class="metodo">${esc(it.metodo || '')}</p></div>
    <div class="voto">
      <button type="button" data-v="ok">confere</button>
      <button type="button" data-v="nao">não confere</button>
      <button type="button" data-v="pulo">não sei</button>
    </div>
  </header>
  ${marcas.length > 60 ? `<p class="corte">mostrando 60 das ${it.marcas.length} ocorrências</p>` : ''}
  <div class="grade">${grade}</div>
</section>`);
    }
  });

  // dentro de <script type="application/json"> as entidades HTML NÃO são decodificadas: escapar com esc()
  // faz o JSON.parse morrer em "&quot;". O que precisa de fuga ali é só o que fecharia a tag.
  const dados = JSON.stringify({ arquivo, linhas }).replace(/</g, '\\u003c');
  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Aferir · ${esc(arquivo)}</title>
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='9' fill='%235b5bf7'/%3E%3C/svg%3E">
<style>
:root{--bg:#f5f6fb;--panel:#fff;--ink:#0e1222;--ink-2:#4b5270;--ink-3:#8a90a8;--line:#e3e6ef;--ok:#0c9466;--nao:#e11d48;--warn:#c26a06;color-scheme:light dark;
--f:ui-sans-serif,system-ui,-apple-system,'Segoe UI',Roboto,sans-serif}
@media(prefers-color-scheme:dark){:root{--bg:#0a0c13;--panel:#11141f;--ink:#eef0f8;--ink-2:#a8aec4;--ink-3:#6c728a;--line:#232839}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font-family:var(--f);font-size:15px}
.topo{position:sticky;top:0;background:color-mix(in srgb,var(--panel) 92%,transparent);backdrop-filter:blur(8px);
border-bottom:1px solid var(--line);padding:14px 20px;display:flex;gap:16px;align-items:center;flex-wrap:wrap;z-index:2}
.topo h1{font-size:17px;margin:0;letter-spacing:-.02em}
.topo .placar{color:var(--ink-2);font-variant-numeric:tabular-nums}
.topo button{margin-left:auto;padding:9px 16px;border-radius:10px;border:0;background:var(--ink);color:var(--bg);font-weight:600;cursor:pointer}
main{max-width:1000px;margin:0 auto;padding:18px 20px 80px}
.aviso{background:var(--panel);border:1px solid var(--line);border-left:3px solid var(--warn);border-radius:12px;padding:14px 16px;margin:0 0 20px;color:var(--ink-2)}
.item{background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:14px 16px;margin:0 0 14px}
.item.ok{border-color:var(--ok)}.item.nao{border-color:var(--nao)}.item.pulo{opacity:.55}
header{display:flex;gap:14px;align-items:flex-start}
.ic svg{background:#fff;border:1px solid var(--line);border-radius:10px}
.quem{flex:1;min-width:0}.quem h3{margin:0 0 4px;font-size:16px;letter-spacing:-.01em}
.afirma{margin:0 0 4px;color:var(--ink-2)}.afirma b{font-size:19px;color:var(--ink)}
.metodo{margin:0;color:var(--ink-3);font-size:13px}
.s{font-weight:600}.s-confirmado{color:var(--ok)}.s-revisar{color:var(--warn)}.s-zero{color:var(--ink-3)}
.voto{display:flex;gap:6px;flex-wrap:wrap}
.voto button{padding:7px 12px;border-radius:9px;border:1px solid var(--line);background:transparent;color:var(--ink-2);cursor:pointer;font:inherit}
.voto button.on[data-v=ok]{background:var(--ok);color:#fff;border-color:var(--ok)}
.voto button.on[data-v=nao]{background:var(--nao);color:#fff;border-color:var(--nao)}
.voto button.on[data-v=pulo]{background:var(--ink-3);color:#fff;border-color:var(--ink-3)}
.grade{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px}
.oc svg{background:#fff;border:1px solid var(--line);border-radius:8px;display:block}
.vazio,.corte{color:var(--ink-3);font-size:13px;margin:8px 0 0}
</style></head><body>
<div class="topo"><h1>Aferir · ${esc(arquivo)}</h1><span class="placar" id="placar"></span>
<button type="button" id="baixar">Baixar julgamento</button></div>
<main>
<p class="aviso"><b>O que é isto.</b> Cada bloco mostra o ícone da legenda e um recorte de <i>cada ocorrência que o Orcer contou</i> — desenhados a partir dos traços do próprio PDF, que é o que o motor enxergou. Olhe e diga se a afirmação está certa. <b>Nada sai deste computador</b>: o julgamento é um arquivo que você baixa.</p>
${blocos.join('\n')}
</main>
<script id="dados" type="application/json">${dados}</script>
<script>
const D = JSON.parse(document.getElementById('dados').textContent);
const chave = 'aferir:' + D.arquivo;
const votos = JSON.parse(localStorage.getItem(chave) || '{}');
function pintar(){
  let ok=0,nao=0,pulo=0;
  document.querySelectorAll('.item').forEach(function(s){
    const v = votos[s.dataset.k];
    s.classList.remove('ok','nao','pulo'); if (v) s.classList.add(v);
    s.querySelectorAll('.voto button').forEach(function(b){ b.classList.toggle('on', b.dataset.v === v); });
    if (v==='ok') ok++; else if (v==='nao') nao++; else if (v==='pulo') pulo++;
  });
  const n = D.linhas.length, j = ok+nao;
  document.getElementById('placar').textContent =
    j ? (ok + ' de ' + j + ' conferem (' + Math.round(100*ok/j) + '%) · ' + (n-ok-nao-pulo) + ' por julgar') : (n + ' itens por julgar');
}
document.addEventListener('click', function(e){
  const b = e.target.closest('.voto button'); if (!b) return;
  const k = b.closest('.item').dataset.k;
  votos[k] = votos[k] === b.dataset.v ? undefined : b.dataset.v;
  if (!votos[k]) delete votos[k];
  localStorage.setItem(chave, JSON.stringify(votos)); pintar();
});
document.getElementById('baixar').addEventListener('click', function(){
  const linhas = D.linhas.map(function(l){ return Object.assign({}, l, { julgamento: votos[l.pagina + ':' + l.idx] || null }); });
  const b = new Blob([JSON.stringify({ arquivo: D.arquivo, quando: new Date().toISOString(), linhas: linhas }, null, 2)], { type: 'application/json' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(b);
  a.download = D.arquivo.replace(/\\.pdf$/i, '') + '-julgamento.json'; a.click();
});
pintar();
</script></body></html>`;
}

function resumo(arquivos: string[]) {
  let ok = 0, nao = 0, pulo = 0, semJulgar = 0;
  const porSituacao = new Map<string, { ok: number; nao: number }>();
  const erradas: string[] = [];
  for (const a of arquivos) {
    const j = JSON.parse(fs.readFileSync(a, 'utf8'));
    for (const l of j.linhas) {
      const s = porSituacao.get(l.situacao) || { ok: 0, nao: 0 };
      if (l.julgamento === 'ok') { ok++; s.ok++; }
      else if (l.julgamento === 'nao') { nao++; s.nao++; erradas.push(`${l.arquivo} · p.${l.pagina} · ${String(l.nome).slice(0, 40)} · disse ${l.qtd} ${l.unidade} (${l.situacao})`); }
      else if (l.julgamento === 'pulo') pulo++;
      else semJulgar++;
      porSituacao.set(l.situacao, s);
    }
  }
  const j = ok + nao;
  console.log(`\nAFERIÇÃO EM PRANCHA REAL — ${arquivos.length} julgamento(s)\n`);
  if (!j) { console.log('nenhum item julgado ainda.'); return; }
  console.log(`${ok} de ${j} conferem · ${(100 * ok / j).toFixed(1)}%   (${pulo} "não sei", ${semJulgar} por julgar)\n`);
  console.log('situação'.padEnd(14) + 'julgados'.padStart(10) + 'conferem'.padStart(10) + '%'.padStart(8));
  for (const [s, v] of porSituacao) {
    const t = v.ok + v.nao; if (!t) continue;
    console.log(s.padEnd(14) + String(t).padStart(10) + String(v.ok).padStart(10) + ((100 * v.ok / t).toFixed(0) + '%').padStart(8));
  }
  const conf = porSituacao.get('confirmado');
  if (conf && conf.nao) console.log(`\n⚠ ${conf.nao} linha(s) CONFIRMADAS e erradas — é o único número que o produto promete que é zero.`);
  if (erradas.length) { console.log('\nnão conferem:'); erradas.forEach((e) => console.log('  ' + e)); }
}

async function main() {
  const args = process.argv.slice(2);
  if (!args.length) { console.error('uso: npm run aferir -- prancha.pdf [...]   |   npm run aferir -- --resumo julgamento.json [...]'); process.exit(2); }
  if (args[0] === '--resumo') return resumo(args.slice(1));

  const log = console.log; console.log = () => { };
  const pdfjs = require('pdfjs-dist/legacy/build/pdf.js');
  console.log = log;
  fs.mkdirSync(SAIDA, { recursive: true });
  for (const arq of args) {
    const nome = path.basename(arq);
    const folhas = await lerPdf(pdfjs, new Uint8Array(fs.readFileSync(arq)));
    const vistas = folhas.map(paraVista);
    const n = vistas.reduce((a, f) => a + f.itens.filter((i: ItemVista) => i.tipo !== 'nota').length, 0);
    const destino = path.join(SAIDA, nome.replace(/\.pdf$/i, '') + '.html');
    fs.writeFileSync(destino, paginaHtml(nome, folhas, vistas));
    console.log(`${nome}: ${vistas.length} folha(s), ${n} item(ns) → ${path.relative(RAIZ, destino)}`);
  }
  console.log(`\nAbra os arquivos em ${path.relative(RAIZ, SAIDA)}/, julgue cada item e baixe o julgamento.`);
  console.log('Depois: npm run aferir -- --resumo <julgamentos>.json');
}
main().catch((e) => { console.error(e); process.exit(1); });
