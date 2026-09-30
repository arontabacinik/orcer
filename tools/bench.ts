// OS PORTÕES DO ORCER — o número que diz se ele funciona, medido contra gabarito.
//
//   npm run bench                 contagem + clique + legenda + lista de compra real (se houver as públicas)
//   npm run bench -- contagem     só a contagem         env: SET=normal,dificil,lote,sinteticas  PAR=4  V=1
//   npm run bench -- firmeza      quanto de uma prancha desconhecida sai sem pedir revisão
//   npm run bench -- clique       o que ficou em Revisar: apontar UM exemplar na planta resolve?
//   npm run bench -- legenda      80 folhas inéditas: a legenda foi lida inteira, com o texto certo?
//   npm run bench -- lista        21 pranchas públicas reais: nenhum lixo sai como "confirmado"
//
// A CONTAGEM é o número do produto: de cada item do gabarito, o motor entregou a quantidade EXATA, com cada marca
// sobre uma ocorrência real? E nenhuma quantidade "confirmada" (ALTA) pode estar errada — teto 0.
// As folhas de bench/pdf2 são geradas (746 MB): veja bench/README.md.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { analyzeDocument, takeoff } from '../src/motor/motor';

const aqui = fileURLToPath(import.meta.url);
const RAIZ = path.resolve(path.dirname(aqui), '..');
const B = path.join(RAIZ, 'bench');
const require = createRequire(import.meta.url);
const PAR = Math.max(1, +(process.env.PAR || 4));

// META: o que foi medido na versão final (29/09/2026) e não pode cair
const META = { pecas: 0.94, altaErrada: 0, confirmados: 405, firmes: 0.94, piorFolha: 2, zeroErrado: 0, legendaPerfeitas: 66, lixoAlta: 0, semSaida: 0 };

const norm = (s: string) => (s || '').toUpperCase().normalize('NFD').replace(/[^A-Z0-9]/g, '');
const iou = (a: number[], b: number[]) => { const x0 = Math.max(a[0], b[0]), y0 = Math.max(a[1], b[1]), x1 = Math.min(a[2], b[2]), y1 = Math.min(a[3], b[3]); const i = Math.max(0, x1 - x0) * Math.max(0, y1 - y0); const u = (a[2] - a[0]) * (a[3] - a[1]) + (b[2] - b[0]) * (b[3] - b[1]) - i; return u > 0 ? i / u : 0; };
const perto = (a: number[], b: number[], m = 3) => { const cx = (b[0] + b[2]) / 2, cy = (b[1] + b[3]) / 2; return cx >= a[0] - m && cx <= a[2] + m && cy >= a[1] - m && cy <= a[3] + m; };

// ---------------- filho: uma folha, um processo (as páginas são independentes) ----------------
async function filho(pdf: string, pag?: string) {
  const pdfjs = require('pdfjs-dist/legacy/build/pdf.js');
  const doc = await pdfjs.getDocument({ data: new Uint8Array(fs.readFileSync(pdf)), verbosity: 0, isEvalSupported: false }).promise;
  const folhas = await analyzeDocument(pdfjs, doc, undefined, pag ? [+pag] : null);
  const out = folhas.map((f) => ({
    pagina: f.pageNum, raster: !!f.raster, prims: f.prims.length,
    itens: f.result!.items.map((it) => ({
      idx: it.idx, nome: (it.name || '').replace(/\s+/g, ' ').trim(), bbox: it.bbox, qtd: typeof it.qty === 'number' ? +it.qty.toFixed(2) : null,
      unidade: it.unit, conf: it.conf, tipo: it.sw && it.sw.type, nota: it.note,
      recusadas: (it.duvidas || []).map((d) => [+(d.fw || 0).toFixed(3), +(d.rv || 0).toFixed(3)]),
      marcas: (it.marks || []).map((b) => [+((b[0] + b[2]) / 2).toFixed(1), +((b[1] + b[3]) / 2).toFixed(1), +Math.max(b[2] - b[0], b[3] - b[1]).toFixed(1)]),
      camadas: it.foundLayers || (it.sw && it.sw.routeLayers) || [],
    })),
  }));
  process.stdout.write('\n@@ORCER@@' + JSON.stringify(out));
}

// ---------------- filho do CLIQUE: a saída de emergência do produto, medida ----------------
// A pessoa desenha um retângulo em volta de UM exemplar e o Orcer reconta por aquele desenho. Aqui o
// retângulo é desenhado por um clicador de mentira: quadrado centrado numa ocorrência do gabarito, do
// tamanho do ícone. Quando o motor recusa ("cortou", "pegou só um traço", "só achei o que você apontou")
// ele abre um pouco e tenta de novo — é o que a tela manda a pessoa fazer, e é o que ela faz.
// O clicador NÃO escolhe pelo resultado: fica com o PRIMEIRO retângulo que o motor aceita sem reclamar.
async function filhoClique(pdf: string, gtPath: string, pag: string) {
  const pdfjs = require('pdfjs-dist/legacy/build/pdf.js');
  const G = JSON.parse(fs.readFileSync(gtPath, 'utf8'));
  const doc = await pdfjs.getDocument({ data: new Uint8Array(fs.readFileSync(pdf)), verbosity: 0, isEvalSupported: false }).promise;
  const folhas = await analyzeDocument(pdfjs, doc, undefined, [+pag]);
  const sheet = folhas[0];
  const out: any[] = [];
  for (const g of G) {
    const it = (sheet.result!.items as any[]).find((i) => i.idx === g.idx);
    if (!it) continue;
    let escolhido: any = null;
    for (const k of [1, 1.3, 1.7, 2.2, 2.8]) {
      const z = Math.hypot(it.bbox[2] - it.bbox[0], it.bbox[3] - it.bbox[1]) || 12, s = (z * k) / 2;
      const R2 = takeoff(sheet, { molde: { [it.idx]: [g.onde[0] - s, g.onde[1] - s, g.onde[0] + s, g.onde[1] + s] } } as any);
      const b: any = (R2.items as any[]).find((i) => i.idx === it.idx);
      if (!b || !b.molde || !b.moldeProprio) continue;     // "não deu: desenhe de novo, justo em volta de um"
      if (b.qty === 1 && g.n > 1) continue;                // "só achei o exemplar que você apontou"
      escolhido = b; break;
    }
    out.push({
      idx: g.idx, qtd: escolhido ? escolhido.qty : null,
      marcas: escolhido ? (escolhido.marks || []).map((b: number[]) => [+((b[0] + b[2]) / 2).toFixed(1), +((b[1] + b[3]) / 2).toFixed(1), +Math.max(b[2] - b[0], b[3] - b[1]).toFixed(1)]) : [],
    });
  }
  process.stdout.write('\n@@ORCER@@' + JSON.stringify(out));
}

function rodar(args: string[], modo = '--um'): Promise<any> {
  return new Promise((res) => {
    const ch = spawn(process.execPath, [...process.execArgv, '--max-old-space-size=3072', aqui, modo, ...args], { env: { ...process.env, DBGL: '' } });
    let out = '', err = '';
    ch.stdout.on('data', (d) => (out += d)); ch.stderr.on('data', (d) => (err += d));
    ch.on('close', (c) => {
      if (c !== 0) return res({ erro: (err.split('\n').find((l) => /Error/.test(l)) || 'saída ' + c).trim().slice(0, 120) });
      try { res({ folhas: JSON.parse(out.slice(out.lastIndexOf('@@ORCER@@') + 9)) }); } catch { res({ erro: 'saída ilegível' }); }
    });
  });
}
async function emParalelo<T>(lista: T[], f: (x: T) => Promise<void>) {
  let i = 0;
  await Promise.all(Array.from({ length: PAR }, async () => { while (i < lista.length) await f(lista[i++]); }));
}

// ---------------- CONTAGEM ----------------
interface Alvo { set: string; nome: string; pdf: string; modo: 'icone' | 'nome' | 'camada'; itens?: any[]; contagens?: any; metros?: any; escaneada?: boolean; }
function alvos(quais: string[]): Alvo[] {
  const L: Alvo[] = [];
  for (const [set, gt] of [['normal', 'gt_count.json'], ['dificil', 'gt_hard.json']]) {
    if (!quais.includes(set)) continue;
    for (const g of JSON.parse(fs.readFileSync(path.join(B, gt), 'utf8'))) {
      if (g.opts && g.opts.scan) continue;           // escaneada: fora do produto (o motor lê o traço do CAD)
      const pdf = path.join(B, 'pdf2', g.file);
      if (!fs.existsSync(pdf)) { console.error(`falta ${pdf} — gere as folhas: veja bench/README.md`); process.exit(2); }
      L.push({ set, nome: g.file.replace('.pdf', ''), pdf, modo: 'icone', itens: g.items.map((x: any) => ({ texto: x.text, icone: x.icon, n: x.count, pontos: x.inst.map((p: number[]) => [p[0], p[1]]) })) });
    }
  }
  if (quais.includes('lote')) for (const f of fs.readdirSync(path.join(B, 'lote')).filter((f) => f.endsWith('.json')).sort()) {
    const G = JSON.parse(fs.readFileSync(path.join(B, 'lote', f), 'utf8'));
    L.push({ set: 'lote', nome: f.slice(0, -5), pdf: path.join(B, 'lote', f.replace('.json', '.pdf')), modo: 'nome', itens: G.itens.map((g: any) => ({ texto: g.texto, n: g.qtd, pontos: g.onde.map((p: number[]) => [p[0], p[1]]) })) });
  }
  if (quais.includes('sinteticas')) for (const f of fs.readdirSync(path.join(B, 'sinteticas')).filter((f) => f.endsWith('.json')).sort()) {
    const G = JSON.parse(fs.readFileSync(path.join(B, 'sinteticas', f), 'utf8'));
    L.push({ set: 'sinteticas', nome: f.slice(0, -5), pdf: path.join(B, 'sinteticas', f.replace('.json', '.pdf')), modo: 'camada', contagens: G.contagens || {}, metros: G.comprimentos_m || {} });
  }
  return L;
}

function julgar(S: Alvo, folhas: any[]) {
  const r = { itens: 0, exatos: 0, alta: 0, altaErrada: 0, metros: 0, metrosExatos: 0, erradas: [] as string[], detalhe: [] as string[], falhos: [] as any[] };
  const pred = folhas.flatMap((f) => f.itens).filter((it: any) => it.tipo !== 'NOTA');
  if (S.modo === 'camada') {
    const daCamada = (L: string) => pred.filter((i: any) => (i.camadas || []).slice(0, 1).includes(L));
    for (const [L, esp] of Object.entries<number>(S.contagens)) {
      r.itens++; const soma = daCamada(L).reduce((a: number, i: any) => a + (i.qtd || 0), 0);
      if (Math.round(soma) === esp) r.exatos++; else r.detalhe.push(`${S.nome} · camada ${L} · gabarito ${esp} · motor ${soma}`);
      const alta = daCamada(L).filter((i: any) => i.conf === 'ALTA');
      if (alta.length) { r.alta++; if (Math.round(alta.reduce((a: number, i: any) => a + (i.qtd || 0), 0)) !== esp) { r.altaErrada++; r.erradas.push(`${S.nome} · camada ${L}`); } }
    }
    for (const [L, esp] of Object.entries<number>(S.metros)) {
      r.metros++; const its = daCamada(L).filter((i: any) => i.tipo === 'ROTA'); const soma = its.reduce((a: number, i: any) => a + (i.qtd || 0), 0);
      if (Math.abs(soma - esp) <= 0.02 * esp) r.metrosExatos++; else r.detalhe.push(`${S.nome} · camada ${L} · gabarito ${esp} m · motor ${soma.toFixed(2)} m`);
      const alta = its.filter((i: any) => i.conf === 'ALTA');
      if (alta.length && Math.abs(alta.reduce((a: number, i: any) => a + (i.qtd || 0), 0) - esp) > 0.02 * esp) { r.altaErrada++; r.erradas.push(`${S.nome} · camada ${L} (m)`); }
    }
    return r;
  }
  const usados = new Set<number>();
  for (const g of S.itens!) {
    r.itens++;
    let k = -1;
    if (S.modo === 'nome') k = pred.findIndex((p: any, i: number) => !usados.has(i) && norm(p.nome).slice(0, 24) === norm(g.texto).slice(0, 24));
    else { let melhor = 0; pred.forEach((p: any, i: number) => { if (usados.has(i) || !p.bbox) return; const v = Math.max(iou(g.icone, p.bbox), perto(g.icone, p.bbox) && perto(p.bbox, g.icone) ? 0.5 : 0); if (v > melhor) { melhor = v; k = i; } }); if (melhor < 0.3) k = -1; }
    const it = k >= 0 ? pred[k] : null; if (it) usados.add(k);
    const pego = new Set<string>(); let fp = 0;
    for (const m of it ? it.marcas : []) {
      let d0 = Infinity, chave = '', dono: any = null;
      S.itens!.forEach((gg: any, gi: number) => gg.pontos.forEach((p: number[], pi: number) => { const d = Math.hypot(p[0] - m[0], p[1] - m[1]); if (d < d0) { d0 = d; chave = gi + ':' + pi; dono = gg; } }));
      if (d0 <= Math.max(6, 0.75 * m[2]) && dono === g && !pego.has(chave)) pego.add(chave); else fp++;
    }
    const q = it ? it.qtd : null, certo = q === g.n && fp === 0;
    if (!certo) r.falhos.push({ idx: it ? it.idx : null, texto: g.texto, n: g.n, onde: g.pontos[0], qtd: q });
    if (certo) r.exatos++; else r.detalhe.push(`${S.nome} · ${g.texto.slice(0, 36)} · gabarito ${g.n} · motor ${q == null ? (it ? '—' : 'SUMIU') : q}${fp ? ` · ${fp} marca(s) fora do lugar` : ''}`);
    if (it && it.conf === 'ALTA') { r.alta++; if (!certo) { r.altaErrada++; r.erradas.push(`${S.nome} · ${g.texto.slice(0, 36)} · gabarito ${g.n} · motor ${q}`); } }
  }
  return r;
}

/** as marcas deste item caem todas sobre ocorrências dele, e nenhuma duas vezes? */
function marcasOk(S: Alvo, g: any, marcas: number[][]) {
  const pego = new Set<string>();
  for (const m of marcas) {
    let d0 = Infinity, chave = '', dono: any = null;
    S.itens!.forEach((gg: any, gi: number) => gg.pontos.forEach((p: number[], pi: number) => { const d = Math.hypot(p[0] - m[0], p[1] - m[1]); if (d < d0) { d0 = d; chave = gi + ':' + pi; dono = gg; } }));
    if (!(d0 <= Math.max(6, 0.75 * m[2]) && dono === g && !pego.has(chave))) return false;
    pego.add(chave);
  }
  return true;
}

async function contagem(): Promise<boolean> {
  const quais = (process.env.SET || 'normal,dificil,lote,sinteticas').split(',');
  const L = alvos(quais), t0 = Date.now();
  const T: Record<string, any> = {}, erradas: string[] = [], detalhes: string[] = [], quebradas: string[] = [];
  await emParalelo(L, async (S) => {
    const out = await rodar([S.pdf]);
    if (out.erro) { quebradas.push(`${S.nome}: ${out.erro}`); return; }
    const r = julgar(S, out.folhas);
    const a = (T[S.set] = T[S.set] || { folhas: 0, itens: 0, exatos: 0, alta: 0, altaErrada: 0, metros: 0, metrosExatos: 0 });
    a.folhas++; for (const c of ['itens', 'exatos', 'alta', 'altaErrada', 'metros', 'metrosExatos']) a[c] += (r as any)[c];
    erradas.push(...r.erradas); detalhes.push(...r.detalhe);
  });
  const pct = (a: number, b: number) => (b ? ((100 * a) / b).toFixed(1) + '%' : '—');
  console.log('\nCONTAGEM — itens com a quantidade exata, cada marca sobre uma ocorrência real');
  // A PROCEDÊNCIA FAZ PARTE DO NÚMERO. Toda folha aqui foi GERADA por bench/gerar: o gabarito é exato
  // porque quem desenhou a folha escreveu o gabarito. Isso mede o motor contra as convenções do gerador,
  // não contra uma prancha de verdade — e as duas coisas não são a mesma. Nenhum número desta tabela foi
  // medido em prancha real, e o rodapé existe para que ninguém cite a porcentagem sem essa frase junto.
  console.log('(folhas geradas por bench/gerar — não é medida em prancha real: `npm run aferir`)\n');
  console.log('conjunto'.padEnd(14) + ['folhas', 'itens', 'exatos', '%', 'confirmados', 'confirm. errados'].map((c) => c.padStart(17)).join(''));
  const tot = { folhas: 0, itens: 0, exatos: 0, alta: 0, altaErrada: 0, metros: 0, metrosExatos: 0 };
  for (const k of ['normal', 'dificil', 'lote', 'sinteticas']) {
    const a = T[k]; if (!a) continue;
    console.log(k.padEnd(14) + [a.folhas, a.itens, a.exatos, pct(a.exatos, a.itens), a.alta, a.altaErrada].map((c) => String(c).padStart(17)).join(''));
    for (const c of Object.keys(tot)) (tot as any)[c] += a[c];
  }
  console.log('TODOS'.padEnd(14) + [tot.folhas, tot.itens, tot.exatos, pct(tot.exatos, tot.itens), tot.alta, tot.altaErrada].map((c) => String(c).padStart(17)).join(''));
  if (tot.metros) console.log(`\nmetros de rota (a até 2%): ${tot.metrosExatos}/${tot.metros}`);
  if (process.env.V && detalhes.length) { console.log(`\nnão exatos (${detalhes.length}):`); detalhes.sort().forEach((d) => console.log('  ' + d)); }
  if (quebradas.length) { console.log('\nquebraram o motor:'); quebradas.forEach((q) => console.log('  ' + q)); }
  console.log(`\n(${((Date.now() - t0) / 1000).toFixed(0)} s)`);
  let ok = true;
  const cheio = quais.length === 4;
  if (erradas.length > META.altaErrada) { ok = false; console.log(`\nFALHOU: ${erradas.length} quantidade(s) CONFIRMADA(S) errada(s) — o teto é 0:`); erradas.forEach((e) => console.log('  ' + e)); }
  if (cheio && tot.exatos / tot.itens < META.pecas) { ok = false; console.log(`\nFALHOU: ${pct(tot.exatos, tot.itens)} de itens exatos — a meta é ${META.pecas * 100}%`); }
  // o que o Orcer afirma sem pedir revisão também não pode cair: um motor que passa a duvidar de tudo
  // fica "certo" e inútil
  if (cheio && tot.alta < META.confirmados) { ok = false; console.log(`\nFALHOU: ${tot.alta} itens confirmados — o piso é ${META.confirmados}`); }
  if (quebradas.length) ok = false;
  return ok;
}

// ---------------- CLIQUE: a saída de emergência tem saída? ----------------
// O Orcer nunca chuta: quando o desenho da planta não é o ícone da legenda, o item vai para Revisar e a tela
// pede "Aponte um na planta". Esse pedido só é honesto se apontar RESOLVER. Aqui todo item que o motor não
// acertou sozinho recebe um clique de mentira — um retângulo em volta de UMA ocorrência do gabarito — e é
// julgado pela mesma régua da contagem: quantidade exata E cada marca sobre uma ocorrência real.
async function clique(): Promise<boolean> {
  const quais = (process.env.SET || 'normal,dificil,lote').split(',').filter((q) => q !== 'sinteticas');
  const L = alvos(quais).filter((S) => S.modo !== 'camada'), t0 = Date.now();
  let naoAcertou = 0, resolvidos = 0, semLinha = 0;
  const restam: string[] = [], quebradas: string[] = [], faltando: string[] = [];
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'orcer-clique-'));
  await emParalelo(L, async (S) => {
    const out = await rodar([S.pdf]);
    if (out.erro) { quebradas.push(`${S.nome}: ${out.erro}`); return; }
    const todos = julgar(S, out.folhas).falhos;
    // item que nem apareceu na lista não tem onde clicar: é falha da LEITURA DA LEGENDA, não do clique
    for (const f of todos) if (f.idx == null) { semLinha++; faltando.push(`${S.nome} · ${String(f.texto).slice(0, 36)} · gabarito ${f.n} · o item nem saiu na lista`); }
    const falhos = todos.filter((f: any) => f.idx != null && f.onde);
    if (!falhos.length) return;
    naoAcertou += falhos.length;
    const gt = path.join(tmp, S.nome.replace(/[^\w.-]/g, '_') + '.json');
    fs.writeFileSync(gt, JSON.stringify(falhos));
    const r2 = await rodar([S.pdf, gt, String(out.folhas[0].pagina)], '--clique');
    if (r2.erro) { quebradas.push(`${S.nome} (clique): ${r2.erro}`); return; }
    for (const f of falhos) {
      const d = (r2.folhas as any[]).find((x) => x.idx === f.idx);
      const g = S.itens!.find((x: any) => x.texto === f.texto);
      if (d && g && d.qtd === f.n && marcasOk(S, g, d.marcas)) resolvidos++;
      else restam.push(`${S.nome} · ${String(f.texto).slice(0, 36)} · gabarito ${f.n} · sozinho ${f.qtd} · com um clique ${d && d.qtd != null ? d.qtd : '—'}`);
    }
  });
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(`\nCLIQUE — ${L.length} folhas: o que o motor deixou em Revisar, um clique resolve?`);
  console.log(`${naoAcertou} item(ns) o motor não acertou sozinho · ${resolvidos} resolvido(s) apontando UM exemplar` +
    (naoAcertou ? ` · ${((100 * resolvidos) / naoAcertou).toFixed(0)}%` : '') + `  (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
  if (semLinha) {
    console.log(`+ ${semLinha} item(ns) do gabarito que o Orcer não leu na legenda: não têm linha para apontar — é a leitura da legenda, medida em \`npm run bench -- legenda\`.`);
    if (process.env.V) faltando.sort().forEach((x) => console.log('  ' + x));
  }
  if (process.env.V && restam.length) { console.log(`\nnem com o clique (${restam.length}):`); restam.sort().forEach((x) => console.log('  ' + x)); }
  if (quebradas.length) { console.log('\nquebraram o motor:'); quebradas.forEach((q) => console.log('  ' + q)); }
  if (naoAcertou - resolvidos > META.semSaida) {
    console.log(`\nFALHOU: ${naoAcertou - resolvidos} item(ns) que nem apontando na planta se resolvem — o teto é ${META.semSaida}`);
    if (!process.env.V) restam.sort().forEach((x) => console.log('  ' + x));
    return false;
  }
  return true;
}

// ---------------- FIRMEZA: quanto de uma prancha desconhecida sai sem pedir revisão ----------------
// A contagem mede se o número está CERTO. Isto mede quanto o Orcer se compromete: uma lista em que um
// terço das linhas diz "confira" custa quase o trabalho que ela deveria poupar. Resposta FIRME = a linha
// que a pessoa não precisa conferir: **Confirmado** (com quantidade) ou **Zero** (não tem na planta).
// Fora daqui fica o conjunto `lote`, feito de propósito para que o desenho da planta NÃO seja o ícone da
// legenda: ali "Revisar" é a resposta certa, e confirmar seria mentir.
// Como as folhas têm de 3 a 10 itens, um único "Revisar" já derruba a folha de 100% para 75-88%: a
// porcentagem por folha não tem granularidade para servir de portão. O que o portão cobra é o trabalho
// que sobra — quantos itens uma folha deixa para conferir — e isso não depende do tamanho dela.
async function firmeza(): Promise<boolean> {
  const quais = (process.env.SET || 'normal,dificil').split(',').filter((q) => q !== 'lote' && q !== 'sinteticas');
  const L = alvos(quais).filter((S) => S.modo !== 'camada'), t0 = Date.now();
  let itens = 0, firmes = 0, zeroErrado = 0;
  const porRev = new Map<number, number>(), sobrando: string[] = [], mentiras: string[] = [];
  await emParalelo(L, async (S) => {
    const out = await rodar([S.pdf]);
    if (out.erro) return;
    const pred = out.folhas.flatMap((f: any) => f.itens).filter((it: any) => it.tipo !== 'NOTA');
    const usados = new Set<number>();
    let n = 0, rev = 0;
    for (const g of S.itens!) {
      let k = -1;
      if (S.modo === 'nome') k = pred.findIndex((p: any, i: number) => !usados.has(i) && norm(p.nome).slice(0, 24) === norm(g.texto).slice(0, 24));
      else { let melhor = 0; pred.forEach((p: any, i: number) => { if (usados.has(i) || !p.bbox) return; const v = Math.max(iou(g.icone, p.bbox), perto(g.icone, p.bbox) && perto(p.bbox, g.icone) ? 0.5 : 0); if (v > melhor) { melhor = v; k = i; } }); if (melhor < 0.3) k = -1; }
      if (k < 0) continue; usados.add(k);
      const p = pred[k]; itens++; n++;
      // um ZERO sobre item que EXISTE é a mesma mentira que uma quantidade confirmada errada
      if (p.conf === 'ZERO' && g.n > 0) { zeroErrado++; mentiras.push(`${S.nome} · ${String(g.texto).slice(0, 34)} · gabarito ${g.n} · o motor disse ZERO`); }
      if (p.conf === 'ALTA' || p.conf === 'ZERO') firmes++;
      else { rev++; if (process.env.V) sobrando.push(`${S.nome} · ${String(g.texto).slice(0, 34)} · ${(p.nota || '').slice(0, 90)}`); }
    }
    if (n) porRev.set(rev, (porRev.get(rev) || 0) + 1);
  });
  const pior = Math.max(0, ...porRev.keys());
  const folhas = [...porRev.values()].reduce((a, b) => a + b, 0);
  console.log(`\nFIRMEZA — ${folhas} folhas GERADAS: quanto sai sem pedir revisão?`);
  console.log(`${firmes} de ${itens} itens com resposta firme (${((100 * firmes) / itens).toFixed(1)}%) · ${porRev.get(0) || 0} folhas não deixam nada para conferir · a pior deixa ${pior}  (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
  console.log('folhas por itens deixados em Revisar: ' + [...porRev.entries()].sort((a, b) => a[0] - b[0]).map(([k, v]) => `${k}: ${v}`).join(' · '));
  if (process.env.V && sobrando.length) { console.log(`\no que sobrou para conferir (${sobrando.length}):`); sobrando.sort().forEach((x) => console.log('  ' + x)); }
  let ok = true;
  if (zeroErrado > META.zeroErrado) { ok = false; console.log(`\nFALHOU: ${zeroErrado} ZERO(s) sobre item que existe — o teto é ${META.zeroErrado}:`); mentiras.forEach((m) => console.log('  ' + m)); }
  if (firmes / itens < META.firmes) { ok = false; console.log(`\nFALHOU: ${((100 * firmes) / itens).toFixed(1)}% de respostas firmes — o piso é ${META.firmes * 100}%`); }
  if (pior > META.piorFolha) { ok = false; console.log(`\nFALHOU: uma folha deixou ${pior} itens para conferir — o teto é ${META.piorFolha}`); }
  return ok;
}

// ---------------- LEGENDA (80 folhas inéditas) ----------------
function lev(a: string, b: string) { const m = a.length, n = b.length; if (!m) return n; if (!n) return m; let p = Array.from({ length: n + 1 }, (_, j) => j); for (let i = 1; i <= m; i++) { const c = [i]; for (let j = 1; j <= n; j++) c[j] = Math.min(p[j] + 1, c[j - 1] + 1, p[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); p = c; } return p[n]; }
const normT = (t: string) => (t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();
const sim = (a: string, b: string) => { a = normT(a); b = normT(b); return 1 - lev(a, b) / Math.max(1, a.length, b.length); };
async function legenda(): Promise<boolean> {
  const GT = JSON.parse(fs.readFileSync(path.join(B, 'legenda', 'gt.json'), 'utf8'));
  let gt = 0, predN = 0, hit = 0, txt = 0, perfeitas = 0, n = 0; const t0 = Date.now();
  await emParalelo(GT, async (g: any) => {
    const out = await rodar([path.join(B, 'legenda', g.file)]);
    n++; gt += g.items.length; if (out.erro) return;
    const pred = out.folhas[0].itens.map((it: any) => ({ name: it.nome, b: it.bbox }));
    const usados = new Set<number>(); let h = 0, t = 0;
    for (const gi of g.items) {
      let best = -1, bs = 0;
      pred.forEach((p: any, k: number) => { if (usados.has(k)) return; const v = Math.max(iou(gi.icon, p.b), perto(gi.icon, p.b, 2) && perto(p.b, gi.icon, 2) ? 0.5 : 0); if (v > bs) { bs = v; best = k; } });
      if (best >= 0 && bs >= 0.3) { usados.add(best); h++; if (sim(gi.text, pred[best].name) >= 0.9) t++; }
    }
    predN += pred.length; hit += h; txt += t; if (h === g.items.length && pred.length === g.items.length && t === g.items.length) perfeitas++;
  });
  console.log(`\nLEGENDA — ${n} folhas que o motor nunca viu`);
  console.log(`achou ${((100 * hit) / gt).toFixed(0)}% dos itens · ${predN ? ((100 * hit) / predN).toFixed(0) : 0}% do que entregou é item de verdade · texto certo ${((100 * txt) / gt).toFixed(0)}% · folhas perfeitas ${perfeitas}/${n}  (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
  if (perfeitas < META.legendaPerfeitas) { console.log(`FALHOU: ${perfeitas} folhas perfeitas — o piso é ${META.legendaPerfeitas}`); return false; }
  return true;
}

// ---------------- LISTA DE COMPRA em pranchas públicas reais ----------------
async function lista(): Promise<boolean | null> {
  const DIR = process.env.PLANS_EXT || path.join(RAIZ, 'plans-externas');
  if (!fs.existsSync(DIR)) { console.log(`\nLISTA — pulada: não achei as pranchas públicas em ${DIR} (descompacte plans-externas.zip na raiz)`); return null; }
  const F = JSON.parse(fs.readFileSync(path.join(B, 'legenda-publicas.json'), 'utf8'));
  const fora = F.erros_conhecidos.concat(F.pesadas_fora || []);
  const log = console.log; console.log = () => {}; const pdfjs = require('pdfjs-dist/legacy/build/pdf.js'); console.log = log;
  const tarefas: { f: string; p: number }[] = [];
  for (const f of fs.readdirSync(DIR).filter((f) => f.endsWith('.pdf')).sort()) {
    if (fora.includes(f.replace('.pdf', ''))) continue;
    const d = await pdfjs.getDocument({ data: new Uint8Array(fs.readFileSync(path.join(DIR, f))), verbosity: 0 }).promise;
    for (let p = 1; p <= d.numPages; p++) tarefas.push({ f, p });
    await d.destroy();
  }
  const entregue: any[] = [], erros: string[] = []; const t0 = Date.now();
  await emParalelo(tarefas, async (t) => {
    const out = await rodar([path.join(DIR, t.f), String(t.p)]);
    if (out.erro) { erros.push(`${t.f} p.${t.p}: ${out.erro}`); return; }
    let vazias = 0;
    for (const fo of out.folhas) for (const it of fo.itens) entregue.push({ arquivo: t.f.replace('.pdf', ''), pagina: fo.pagina, texto: it.nome || '(sem descrição #' + ++vazias + ')', status: it.conf, qtd: it.qtd });
  });
  const chave = (x: any) => `${x.arquivo} · p.${x.pagina} · ${x.texto}`;
  const julgado = new Map<string, any>(F.entregas.map((x: any) => [chave(x), x]));
  let mat = 0, lixo = 0; const lixoAlta: string[] = [];
  for (const x of entregue) { const j = julgado.get(chave(x)); if (!j) continue; if (j.material) mat++; else { lixo++; if (x.status === 'ALTA' && !/^\(sem descrição/.test(x.texto)) lixoAlta.push(`${chave(x)} · ${x.qtd}`); } }
  console.log(`\nLISTA DE COMPRA — ${tarefas.length} folhas de pranchas públicas reais`);
  console.log(`${mat} descrições de material · ${lixo} de lixo (texto que não é material) · lixo CONFIRMADO: ${lixoAlta.length}  (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
  if (erros.length) { console.log('quebraram:'); erros.forEach((e) => console.log('  ' + e)); }
  if (lixoAlta.length > META.lixoAlta) { console.log('FALHOU: lixo saindo como confirmado:'); lixoAlta.forEach((l) => console.log('  ' + l)); return false; }
  return !erros.length;
}

// ---------------- principal ----------------
async function main() {
  if (process.argv[2] === '--um') return filho(process.argv[3], process.argv[4]);
  if (process.argv[2] === '--clique') return filhoClique(process.argv[3], process.argv[4], process.argv[5]);
  const qual = process.argv[2] || 'tudo';
  const r: (boolean | null)[] = [];
  if (qual === 'tudo' || qual === 'contagem') r.push(await contagem());
  if (qual === 'tudo' || qual === 'firmeza') r.push(await firmeza());
  if (qual === 'tudo' || qual === 'clique') r.push(await clique());
  if (qual === 'tudo' || qual === 'legenda') r.push(await legenda());
  if (qual === 'tudo' || qual === 'lista') r.push(await lista());
  if (r.some((x) => x === false)) { console.log('\n✗ algum portão falhou'); process.exit(1); }
  console.log('\n✓ portões verdes');
}
main().catch((e) => { console.error(e); process.exit(3); });
