import './estilo.css';
import * as pdfjs from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.js?url';
import { gerarCsv, resumo, ROTULO, EXPLICA, numero, type FolhaVista, type ItemVista } from '../lista';
import type { Caixa, OpcoesContagem } from '../motor/tipos';

(pdfjs as any).GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

// ---------------------------------------------------------------- estado
interface Leitura { id: string; arquivo: string; doc: any; folhas: FolhaVista[]; opcoes: Map<number, OpcoesContagem>; }
const S = {
  leituras: [] as Leitura[],
  atual: { l: 0, f: 0 },
  sel: -1,
  oc: -1,
  filtro: 'todos' as 'todos' | 'revisar',
  todos: false,
  mira: false,
  vista: { x: 0, y: 0, k: 1 },
  render: null as null | { chave: string; canvas: HTMLCanvasElement; escala: number },
  miniaturas: new Map<string, string[]>(),
};
const $ = <T extends HTMLElement = HTMLElement>(s: string) => document.querySelector(s) as T;
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
const CORES = ['#e23d6d', '#3b82f6', '#f08a24', '#10a37f', '#8b5cf6', '#0ea5c6', '#d946ef', '#84a31a', '#ef4444', '#6366f1', '#b7791f', '#14b8a6'];
const cor = (i: number) => CORES[i % CORES.length];
const fmt = (q: number | null) => (q == null ? '—' : numero(q));
let avisoT = 0;
function aviso(msg: string, ms = 3800) { const a = $('#aviso'); a.textContent = msg; a.hidden = false; clearTimeout(avisoT); avisoT = window.setTimeout(() => (a.hidden = true), ms); }

// ---------------------------------------------------------------- telas
function tela(qual: 'inicio' | 'lendo' | 'resultado') {
  $('#tela-inicio').hidden = qual !== 'inicio';
  $('#tela-lendo').hidden = qual !== 'lendo';
  $('#tela-resultado').hidden = qual !== 'resultado';
  $('#topo-acoes').hidden = qual !== 'resultado';
  if (qual !== 'resultado') $('#topo-meio').innerHTML = '';
}

// ---------------------------------------------------------------- motor (Web Worker, com plano B na própria página)
type Resp = { tipo: string; id: string; [k: string]: any };
const espera = new Map<string, (r: Resp) => void>();
const andando = new Map<string, (r: Resp) => void>();
let worker: Worker | null = null;
function motor(): Worker | null {
  if (worker) return worker;
  try {
    worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e: MessageEvent<Resp>) => {
      const r = e.data;
      if (r.tipo === 'andamento') { andando.get(r.id)?.(r); return; }
      const f = espera.get(r.id); if (f) { espera.delete(r.id); f(r); }
    };
    worker.onerror = () => { worker = null; };
  } catch { worker = null; }
  return worker;
}
let local: null | { lerPdf: any; recontar: any; paraVista: any; folhas: Map<string, any[]> } = null;
async function motorLocal() {
  if (!local) {
    const [{ lerPdf, recontar }, { paraVista }] = await Promise.all([import('../ler'), import('../lista')]);
    local = { lerPdf, recontar, paraVista, folhas: new Map() };
  }
  return local;
}
async function ler(id: string, dados: ArrayBuffer, aoAndar: (r: any) => void): Promise<FolhaVista[]> {
  const w = motor();
  if (w) {
    const r = await new Promise<Resp>((ok) => { espera.set(id, ok); andando.set(id, aoAndar); w.postMessage({ tipo: 'ler', id, dados }, [dados]); });
    andando.delete(id);
    if (r.tipo === 'erro') throw new Error(r.msg);
    return r.folhas;
  }
  const L = await motorLocal();
  const folhas = await L.lerPdf(pdfjs, new Uint8Array(dados), aoAndar);
  L.folhas.set(id, folhas);
  return folhas.map(L.paraVista);
}
async function recontar(id: string, pagina: number, opcoes: OpcoesContagem): Promise<FolhaVista> {
  const w = motor();
  if (w && !local?.folhas.has(id)) {
    const r = await new Promise<Resp>((ok) => { espera.set(id, ok); w.postMessage({ tipo: 'recontar', id, pagina, opcoes }); });
    if (r.tipo === 'erro') throw new Error(r.msg);
    return r.folha;
  }
  const L = await motorLocal(); const f = L.folhas.get(id)!.find((x: any) => x.pageNum === pagina);
  L.recontar(f, opcoes); return L.paraVista(f);
}

// ---------------------------------------------------------------- abrir arquivos
let etapaT = 0;
function andamento(arquivo: string, pagina: number, total: number, iArq: number, nArq: number) {
  $('#lendo-tit').textContent = nArq > 1 ? `Lendo ${iArq + 1} de ${nArq}` : 'Lendo a prancha';
  $('#lendo-sub').textContent = `${arquivo}${total > 1 ? ` · folha ${pagina} de ${total}` : ''}`;
  const frac = (iArq + (pagina - 1) / total) / nArq;
  $('#lendo-barra').style.width = Math.max(4, Math.round(frac * 100)) + '%';
  const lis = [...document.querySelectorAll('#etapas li')];
  let k = 0;
  const marca = () => { lis.forEach((li, i) => { li.classList.toggle('feita', i < k); li.classList.toggle('agora', i === k); }); };
  clearInterval(etapaT); marca();
  etapaT = window.setInterval(() => { if (k < lis.length - 1) { k++; marca(); } }, 900);
}
async function abrir(arquivos: { nome: string; dados: ArrayBuffer }[]) {
  const pdfs = arquivos.filter((a) => /\.pdf$/i.test(a.nome));
  if (!pdfs.length) { aviso('Só leio PDF — exporte a prancha do CAD em PDF.'); return; }
  tela('lendo');
  const novas: Leitura[] = [];
  for (let i = 0; i < pdfs.length; i++) {
    const { nome, dados } = pdfs[i];
    try {
      andamento(nome, 1, 1, i, pdfs.length);
      const doc = await (pdfjs as any).getDocument({ data: new Uint8Array(dados.slice(0)), isEvalSupported: false }).promise;
      const id = Math.random().toString(36).slice(2);
      const folhas = await ler(id, dados, (a: any) => andamento(nome, a.pagina, a.total, i, pdfs.length));
      novas.push({ id, arquivo: nome, doc, folhas, opcoes: new Map() });
    } catch (e: any) {
      console.error(e); aviso(`Não consegui ler ${nome}: ${e?.message || e}`, 6000);
    }
  }
  clearInterval(etapaT);
  document.querySelectorAll('#etapas li').forEach((li) => { li.classList.add('feita'); li.classList.remove('agora'); });
  $('#lendo-barra').style.width = '100%';
  if (!novas.length) { tela('inicio'); return; }
  S.leituras = novas; S.atual = { l: 0, f: 0 }; S.miniaturas.clear(); S.render = null;
  await new Promise((r) => setTimeout(r, 350));
  tela('resultado');
  await mostrarFolha(0, 0);
}

// ---------------------------------------------------------------- resultado
const folhaAtual = () => S.leituras[S.atual.l]?.folhas[S.atual.f];
const leituraAtual = () => S.leituras[S.atual.l];
const visiveis = (f: FolhaVista) => f.itens.map((it, i) => ({ it, i })).filter(({ it }) => S.filtro === 'todos' || it.situacao === 'revisar');

function abas() {
  const tabs: string[] = [];
  S.leituras.forEach((l, li) => l.folhas.forEach((f, fi) => {
    const nome = S.leituras.length > 1 || l.folhas.length > 1 ? `${S.leituras.length > 1 ? l.arquivo.replace(/\.pdf$/i, '') : 'Folha'}${l.folhas.length > 1 ? ' · ' + f.pagina : ''}` : '';
    if (nome) tabs.push(`<button class="folha-tab" type="button" data-l="${li}" data-f="${fi}" aria-current="${li === S.atual.l && fi === S.atual.f}">${esc(nome)}</button>`);
  }));
  $('#topo-meio').innerHTML = tabs.length ? tabs.join('') : `<span class="arq">${esc(leituraAtual().arquivo)}</span>`;
}

async function mostrarFolha(l: number, f: number) {
  S.atual = { l, f }; S.sel = -1; S.oc = -1; sairMira();
  abas();
  const fv = folhaAtual();
  listar();
  const desenho = desenharPagina();
  ajustar();
  desenharMarcas();
  if (fv.itens.length) selecionar(0, false);
  await desenho;
}

function listar() {
  const fv = folhaAtual();
  const r = resumo([fv]);
  $('#totais').innerHTML = `<div><b>${r.itens}</b><span>itens</span></div><div class="ok"><b>${r.confirmados}</b><span>confirmados</span></div><div class="rv"><b>${r.revisar}</b><span>para revisar</span></div>`;
  $('#avisos').innerHTML = fv.avisos.map((a) => `<p>${esc(a)}</p>`).join('');
  const mini = S.miniaturas.get(chaveFolha()) || [];
  const linhas = visiveis(fv).map(({ it, i }) => {
    const acoes: string[] = [];
    if (it.marcas.length) acoes.push(`<button class="mini" type="button" data-ver="${i}">Ver na planta (${it.marcas.length})</button>`);
    if (it.tipo === 'peca' && it.situacao !== 'confirmado') acoes.push(`<button class="mini" type="button" data-apontar="${i}">Apontar um na planta</button>`);
    if (it.molde && !it.moldeAutomatico) acoes.push(`<button class="mini" type="button" data-desfazer="${i}">Voltar ao automático</button>`);
    return `<li class="item" role="option" tabindex="-1" data-i="${i}" aria-selected="${i === S.sel}">
      <span class="cor" style="background:${cor(i)}"></span>
      <span class="sim" style="${mini[i] ? `background-image:url(${mini[i]})` : ''}"></span>
      <span class="txt"><span class="nome${it.nome ? '' : ' vazio'}">${esc(it.nome || 'símbolo sem descrição na legenda')}</span>
        <span class="selo ${it.situacao}" title="${esc(EXPLICA[it.situacao])}">${ROTULO[it.situacao]}</span></span>
      <span class="qtd"><b>${fmt(it.qtd)}</b><small>${it.situacao === 'nota' ? '' : esc(it.unidade)}</small></span>
      <div class="mais"><p>${esc(it.metodo)}</p><div class="acoes">${acoes.join('')}</div></div>
    </li>`;
  });
  $('#itens').innerHTML = linhas.join('') || `<li class="vazio" style="padding:18px;color:var(--ink-3)">${S.filtro === 'revisar' ? 'Nada para revisar nesta folha.' : 'Nenhum item.'}</li>`;
}

function selecionar(i: number, focar = true) {
  S.sel = i; S.oc = -1;
  document.querySelectorAll<HTMLElement>('#itens .item').forEach((el) => el.setAttribute('aria-selected', String(+el.dataset.i! === i)));
  const el = document.querySelector<HTMLElement>(`#itens .item[data-i="${i}"]`); el?.scrollIntoView({ block: 'nearest' });
  const it = folhaAtual().itens[i];
  $('#navega').hidden = !it || !it.marcas.length;
  atualizarNavega();
  desenharMarcas(true);
  if (focar && it) enquadrar(caixasDo(it));
}
const caixasDo = (it: ItemVista): Caixa[] => it.marcas.length ? it.marcas : it.trechos.length ? segCaixas(it.trechos) : [it.icone];
function segCaixas(t: number[]): Caixa[] { const out: Caixa[] = []; for (let i = 0; i < t.length; i += 4) out.push([Math.min(t[i], t[i + 2]), Math.min(t[i + 1], t[i + 3]), Math.max(t[i], t[i + 2]), Math.max(t[i + 1], t[i + 3])]); return out; }
function atualizarNavega() {
  const it = folhaAtual().itens[S.sel]; if (!it) return;
  $('#oc-txt').textContent = S.oc < 0 ? `${it.marcas.length} ocorrência${it.marcas.length > 1 ? 's' : ''}` : `${S.oc + 1} de ${it.marcas.length}`;
}
function passo(d: number) {
  const it = folhaAtual().itens[S.sel]; if (!it || !it.marcas.length) return;
  S.oc = S.oc < 0 ? (d > 0 ? 0 : it.marcas.length - 1) : (S.oc + d + it.marcas.length) % it.marcas.length;
  atualizarNavega(); desenharMarcas();
  const b = it.marcas[S.oc], m = Math.max(90, (b[2] - b[0]) * 10);
  enquadrar([[b[0] - m, b[1] - m, b[2] + m, b[3] + m]]);
}

// ---------------------------------------------------------------- a prancha: render, zoom, marcas
const chaveFolha = () => `${leituraAtual().id}:${folhaAtual().pagina}`;
let renderTarefa: any = null;
async function desenharPagina() {
  const l = leituraAtual(), fv = folhaAtual(), chave = chaveFolha();
  // tamanho e marcas já valem antes do desenho chegar: a lista e o enquadramento não esperam o render
  const canvas = $<HTMLCanvasElement>('#tela');
  canvas.style.width = fv.largura + 'px'; canvas.style.height = fv.altura + 'px';
  const svg = $<HTMLElement>('#marcas') as unknown as SVGSVGElement;
  svg.setAttribute('width', String(fv.largura)); svg.setAttribute('height', String(fv.altura));
  svg.setAttribute('viewBox', `0 0 ${fv.largura} ${fv.altura}`);
  if (S.render?.chave === chave) return;
  try { renderTarefa?.cancel(); } catch {}
  const visor = $('#visor'); visor.classList.add('desenhando');
  const g0 = canvas.getContext('2d')!; canvas.width = 2; canvas.height = 2; g0.fillStyle = '#fff'; g0.fillRect(0, 0, 2, 2);
  try {
    const page = await l.doc.getPage(fv.pagina);
    if (chaveFolha() !== chave) return;
    const vp1 = page.getViewport({ scale: 1 });
    const escala = Math.min(4096 / Math.max(vp1.width, vp1.height), Math.sqrt(16e6 / (vp1.width * vp1.height)), 6);
    const vp = page.getViewport({ scale: escala });
    const fora = document.createElement('canvas');
    fora.width = Math.floor(vp.width); fora.height = Math.floor(vp.height);
    const ctx = fora.getContext('2d')!;
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, fora.width, fora.height);
    renderTarefa = page.render({ canvasContext: ctx, viewport: vp });
    await renderTarefa.promise;
    if (chaveFolha() !== chave) return;
    canvas.width = fora.width; canvas.height = fora.height; canvas.getContext('2d')!.drawImage(fora, 0, 0);
    S.render = { chave, canvas, escala };
    if (!S.miniaturas.has(chave)) { S.miniaturas.set(chave, fv.itens.map((it) => miniatura(canvas, escala, it.icone))); listar(); }
  } catch (e: any) {
    if (e?.name !== 'RenderingCancelledException') console.error(e);
  } finally {
    if (chaveFolha() === chave) visor.classList.remove('desenhando');
  }
}
function miniatura(c: HTMLCanvasElement, k: number, b: Caixa): string {
  const p = Math.max(b[2] - b[0], b[3] - b[1]) * 0.18 + 1.5;
  const x = Math.max(0, (b[0] - p) * k), y = Math.max(0, (b[1] - p) * k), w = Math.min(c.width - x, (b[2] - b[0] + 2 * p) * k), h = Math.min(c.height - y, (b[3] - b[1] + 2 * p) * k);
  if (w < 2 || h < 2) return '';
  const t = document.createElement('canvas'), z = Math.min(1, 120 / Math.max(w, h));
  t.width = Math.max(1, Math.round(w * z)); t.height = Math.max(1, Math.round(h * z));
  const g = t.getContext('2d')!; g.fillStyle = '#fff'; g.fillRect(0, 0, t.width, t.height);
  g.drawImage(c, x, y, w, h, 0, 0, t.width, t.height);
  return t.toDataURL('image/png');
}
function aplicar() { $('#plano').style.transform = `translate(${S.vista.x}px,${S.vista.y}px) scale(${S.vista.k})`; }
function ajustar() {
  const fv = folhaAtual(); if (!fv) return;
  const r = $('#visor').getBoundingClientRect();
  const k = Math.min((r.width - 40) / fv.largura, (r.height - 40) / fv.altura);
  S.vista = { k, x: (r.width - fv.largura * k) / 2, y: (r.height - fv.altura * k) / 2 }; aplicar();
}
function enquadrar(bs: Caixa[]) {
  if (!bs.length) return;
  const b = bs.reduce((a, c) => [Math.min(a[0], c[0]), Math.min(a[1], c[1]), Math.max(a[2], c[2]), Math.max(a[3], c[3])], [Infinity, Infinity, -Infinity, -Infinity]);
  const r = $('#visor').getBoundingClientRect(), pad = 60;
  const k = Math.min((r.width - pad * 2) / Math.max(20, b[2] - b[0]), (r.height - pad * 2) / Math.max(20, b[3] - b[1]), 14);
  S.vista = { k, x: r.width / 2 - ((b[0] + b[2]) / 2) * k, y: r.height / 2 - ((b[1] + b[3]) / 2) * k };
  const p = $('#plano'); p.style.transition = 'transform .35s cubic-bezier(.2,.8,.2,1)'; aplicar();
  setTimeout(() => (p.style.transition = ''), 380);
}
function zoom(f: number, cx: number, cy: number) {
  const k = Math.max(0.05, Math.min(60, S.vista.k * f)), g = k / S.vista.k;
  S.vista = { k, x: cx - (cx - S.vista.x) * g, y: cy - (cy - S.vista.y) * g }; aplicar();
}
function ret(b: Caixa, classe: string, c: string, pad = 0.8, fundo = false) {
  const x = b[0] - pad, y = b[1] - pad, w = b[2] - b[0] + 2 * pad, h = b[3] - b[1] + 2 * pad;
  return (fundo ? `<rect class="oc-f" x="${x}" y="${y}" width="${w}" height="${h}" rx="1.5" fill="${c}"/>` : '') +
    `<rect class="oc ${classe}" x="${x}" y="${y}" width="${w}" height="${h}" rx="1.5" stroke="${c}"/>`;
}
function desenharMarcas(novo = false) {
  const fv = folhaAtual(); if (!fv) return;
  let h = fv.legendas.map((r) => `<rect class="leg-reg" x="${r[0]}" y="${r[1]}" width="${r[2] - r[0]}" height="${r[3] - r[1]}" rx="4"/>`).join('');
  fv.itens.forEach((it, i) => {
    const sel = i === S.sel;
    if (!sel && !S.todos) return;
    const c = cor(i), cls = sel && novo ? 'nova' : '';
    for (let k = 0; k < it.trechos.length; k += 4) h += `<line class="rota" x1="${it.trechos[k]}" y1="${it.trechos[k + 1]}" x2="${it.trechos[k + 2]}" y2="${it.trechos[k + 3]}" stroke="${c}"${sel ? '' : ' opacity=".45"'}/>`;
    for (const b of it.marcas) h += ret(b, cls, c, 0.8, sel);
    if (sel) for (const d of it.duvidas) h += ret(d, 'duv', c, 0.8);
    if (sel && it.molde) h += ret(it.molde, 'duv', 'var(--accent)', 0);
  });
  const it = fv.itens[S.sel];
  if (it && S.oc >= 0 && it.marcas[S.oc]) { const b = it.marcas[S.oc], m = Math.max(3, (b[2] - b[0]) * 0.6); h += ret([b[0] - m, b[1] - m, b[2] + m, b[3] + m], 'foco', cor(S.sel), 0); }
  (document.querySelector('#marcas') as SVGElement).innerHTML = h;
}

// ---------------------------------------------------------------- apontar um exemplar (o molde)
function entrarMira(i: number) { S.sel = i; S.mira = true; $('#modo').hidden = false; $('#visor').classList.add('mira'); }
function sairMira() { S.mira = false; $('#modo').hidden = true; $('#visor').classList.remove('mira'); }
async function aplicarOpcoes(mudar: (o: OpcoesContagem, it: ItemVista) => void, i: number) {
  const l = leituraAtual(), fv = folhaAtual(), it = fv.itens[i];
  const op: OpcoesContagem = structuredClone(l.opcoes.get(fv.pagina) || {});
  mudar(op, it);
  const nova = await recontar(l.id, fv.pagina, op);
  const novoIt = nova.itens.find((x) => x.idx === it.idx);
  if (novoIt?.recusaMolde) { aviso(novoIt.recusaMolde, 5200); return; }
  l.opcoes.set(fv.pagina, op);
  l.folhas[S.atual.f] = nova;
  listar(); const j = nova.itens.findIndex((x) => x.idx === it.idx); selecionar(j, true);
  if (novoIt) aviso(`${novoIt.nome ? novoIt.nome.slice(0, 40) + ': ' : ''}${fmt(novoIt.qtd)} ${novoIt.unidade} · ${ROTULO[novoIt.situacao]}`);
}

// ---------------------------------------------------------------- CSV
function baixarCsv() {
  const csv = gerarCsv(S.leituras.map((l) => ({ arquivo: l.arquivo, folhas: l.folhas })));
  const base = S.leituras.length === 1 ? S.leituras[0].arquivo.replace(/\.pdf$/i, '') : 'lista-de-materiais';
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  a.download = `orcer_${base.replace(/[^\w\-]+/g, '_').slice(0, 60)}.csv`;
  document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  aviso('CSV baixado — abre direto no Excel.');
}

// ---------------------------------------------------------------- ligações
$('#versao').textContent = 'v' + (import.meta.env.VITE_VERSAO || '1.0');
const input = $<HTMLInputElement>('#arquivo');
input.onchange = async () => { const fs = [...(input.files || [])]; input.value = ''; await abrir(await Promise.all(fs.map(async (f) => ({ nome: f.name, dados: await f.arrayBuffer() })))); };
$('#solte').addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); } });
$('#exemplo').onclick = async () => {
  const r = await fetch('exemplos/exemplo.pdf'); if (!r.ok) { aviso('Exemplo indisponível.'); return; }
  await abrir([{ nome: 'exemplo.pdf', dados: await r.arrayBuffer() }]);
};
$('#ir-inicio').onclick = (e) => { e.preventDefault(); if (!$('#tela-resultado').hidden || !$('#tela-lendo').hidden) return; tela('inicio'); };
$('#nova').onclick = () => { tela('inicio'); };
$('#baixar').onclick = baixarCsv;
$('#topo-meio').addEventListener('click', (e) => { const b = (e.target as HTMLElement).closest<HTMLElement>('.folha-tab'); if (b) mostrarFolha(+b.dataset.l!, +b.dataset.f!); });
document.querySelectorAll<HTMLElement>('.filtro').forEach((b) => (b.onclick = () => {
  S.filtro = b.dataset.filtro as any; document.querySelectorAll('.filtro').forEach((x) => x.classList.toggle('on', x === b)); listar();
}));
$('#itens').addEventListener('click', (e) => {
  const t = e.target as HTMLElement;
  const ver = t.closest<HTMLElement>('[data-ver]'); if (ver) { selecionar(+ver.dataset.ver!); passo(1); return; }
  const ap = t.closest<HTMLElement>('[data-apontar]'); if (ap) { entrarMira(+ap.dataset.apontar!); aviso('Aproxime a vista e arraste em volta de UM exemplar na planta.'); return; }
  const dz = t.closest<HTMLElement>('[data-desfazer]'); if (dz) { aplicarOpcoes((o, it) => { if (o.molde) delete o.molde[it.idx]; }, +dz.dataset.desfazer!); return; }
  const li = t.closest<HTMLElement>('.item'); if (li && +li.dataset.i! !== S.sel) selecionar(+li.dataset.i!);
});
$<HTMLInputElement>('#todos').onchange = (e) => { S.todos = (e.target as HTMLInputElement).checked; desenharMarcas(true); };
$('#z-mais').onclick = () => { const r = $('#visor').getBoundingClientRect(); zoom(1.5, r.width / 2, r.height / 2); };
$('#z-menos').onclick = () => { const r = $('#visor').getBoundingClientRect(); zoom(1 / 1.5, r.width / 2, r.height / 2); };
$('#z-ajustar').onclick = () => { S.oc = -1; atualizarNavega(); desenharMarcas(); ajustar(); };
$('#oc-ant').onclick = () => passo(-1);
$('#oc-prox').onclick = () => passo(1);
$('#modo-sair').onclick = sairMira;
window.addEventListener('resize', () => { if (!$('#tela-resultado').hidden) ajustar(); });
document.addEventListener('keydown', (e) => {
  if ($('#tela-resultado').hidden || (e.target as HTMLElement).tagName === 'INPUT') return;
  const fv = folhaAtual(); if (!fv) return;
  const ordem = visiveis(fv).map((x) => x.i), pos = ordem.indexOf(S.sel);
  if (e.key === 'ArrowDown') { e.preventDefault(); if (ordem.length) selecionar(ordem[Math.min(ordem.length - 1, pos + 1)]); }
  else if (e.key === 'ArrowUp') { e.preventDefault(); if (ordem.length) selecionar(ordem[Math.max(0, pos - 1)]); }
  else if (e.key === 'ArrowRight') { e.preventDefault(); passo(1); }
  else if (e.key === 'ArrowLeft') { e.preventDefault(); passo(-1); }
  else if (e.key === 'Escape') { if (S.mira) sairMira(); else { S.oc = -1; atualizarNavega(); desenharMarcas(); ajustar(); } }
});

// visor: arrastar move; roda aproxima; dois dedos aproximam; na mira, arrastar desenha o retângulo
(() => {
  const V = $('#visor');
  const ptrs = new Map<number, { x: number; y: number }>();
  let arr: null | { x: number; y: number; vx: number; vy: number } = null, pinca: null | { d: number; k: number; cx: number; cy: number } = null;
  let mira: null | { a: [number, number]; b: [number, number] } = null;
  const pagina = (ev: PointerEvent): [number, number] => { const r = V.getBoundingClientRect(); return [(ev.clientX - r.left - S.vista.x) / S.vista.k, (ev.clientY - r.top - S.vista.y) / S.vista.k]; };
  V.addEventListener('pointerdown', (ev) => {
    if ((ev.target as HTMLElement).closest('.visor-barra,.navega,.modo')) return;
    V.setPointerCapture(ev.pointerId); ptrs.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
    if (S.mira) { const p = pagina(ev); mira = { a: p, b: p }; return; }
    if (ptrs.size === 2) { const [p, q] = [...ptrs.values()]; const r = V.getBoundingClientRect(); pinca = { d: Math.hypot(p.x - q.x, p.y - q.y), k: S.vista.k, cx: (p.x + q.x) / 2 - r.left, cy: (p.y + q.y) / 2 - r.top }; arr = null; return; }
    arr = { x: ev.clientX, y: ev.clientY, vx: S.vista.x, vy: S.vista.y }; V.classList.add('arrasta');
  });
  V.addEventListener('pointermove', (ev) => {
    if (!ptrs.has(ev.pointerId)) return; ptrs.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
    if (mira) { mira.b = pagina(ev); const [a, b] = [mira.a, mira.b]; desenharMarcas(); (document.querySelector('#marcas') as SVGElement).insertAdjacentHTML('beforeend', ret([Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[0], b[0]), Math.max(a[1], b[1])], 'duv', 'var(--accent)', 0)); return; }
    if (pinca && ptrs.size === 2) { const [p, q] = [...ptrs.values()]; const d = Math.hypot(p.x - q.x, p.y - q.y); zoom((pinca.k * d) / pinca.d / S.vista.k, pinca.cx, pinca.cy); return; }
    if (arr) { S.vista.x = arr.vx + ev.clientX - arr.x; S.vista.y = arr.vy + ev.clientY - arr.y; aplicar(); }
  });
  const fim = (ev: PointerEvent) => {
    ptrs.delete(ev.pointerId); if (ptrs.size < 2) pinca = null;
    V.classList.remove('arrasta'); arr = null;
    if (mira) {
      const [a, b] = [mira.a, mira.b]; mira = null;
      const r: Caixa = [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[0], b[0]), Math.max(a[1], b[1])];
      if ((r[2] - r[0]) * S.vista.k < 6 || (r[3] - r[1]) * S.vista.k < 6) { desenharMarcas(); return; }
      const i = S.sel; sairMira();
      aplicarOpcoes((o, it) => { o.molde = { ...(o.molde || {}), [it.idx]: r }; }, i).catch((e) => aviso(String(e.message || e)));
    }
  };
  V.addEventListener('pointerup', fim); V.addEventListener('pointercancel', fim);
  V.addEventListener('wheel', (ev) => { ev.preventDefault(); const r = V.getBoundingClientRect(); zoom(Math.exp(-ev.deltaY * 0.0016), ev.clientX - r.left, ev.clientY - r.top); }, { passive: false });
  V.addEventListener('dblclick', (ev) => { const r = V.getBoundingClientRect(); zoom(2, ev.clientX - r.left, ev.clientY - r.top); });
})();

// soltar PDFs em qualquer lugar
(() => {
  let n = 0; const alvo = $('#solte-tudo');
  const liga = (on: boolean) => { alvo.hidden = !on; $('#solte').classList.toggle('sobre-arq', on); };
  addEventListener('dragenter', (e) => { if (e.dataTransfer?.types.includes('Files')) { n++; liga(true); } });
  addEventListener('dragleave', () => { n = Math.max(0, n - 1); if (!n) liga(false); });
  addEventListener('dragover', (e) => e.preventDefault());
  addEventListener('drop', async (e) => {
    e.preventDefault(); n = 0; liga(false);
    const fs = [...(e.dataTransfer?.files || [])];
    if (fs.length) await abrir(await Promise.all(fs.map(async (f) => ({ nome: f.name, dados: await f.arrayBuffer() }))));
  });
})();

(window as any).__orcer = S;
