// npm test — conferência rápida (segundos): o motor, a lista e o CSV numa prancha de exemplo e em folhas
// sintéticas do bench com gabarito. A medição completa é `npm run bench`.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { lerPdf } from '../src/ler';
import { paraVista, gerarCsv, resumo } from '../src/lista';

const require = createRequire(import.meta.url);
const log = console.log; console.log = () => {};
const pdfjs = require('pdfjs-dist/legacy/build/pdf.js');
console.log = log;

let falhas = 0, ok = 0;
function conferir(nome: string, cond: boolean, detalhe = '') {
  if (cond) { ok++; console.log('  ✓ ' + nome); } else { falhas++; console.log('  ✗ ' + nome + (detalhe ? ' — ' + detalhe : '')); }
}
const ler = async (f: string) => (await lerPdf(pdfjs, new Uint8Array(fs.readFileSync(f)))).map(paraVista);
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/\s+/g, ' ').trim();

async function main() {
  const raiz = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');

  console.log('\nexemplo.pdf — a prancha da página inicial');
  const ex = await ler(path.join(raiz, 'public/exemplos/exemplo.pdf'));
  const q = ex[0].itens.map((i) => i.qtd);
  conferir('quantidades 18 · 8 · 60 · 15 · 7 · 22,3 m · 24,32 m', JSON.stringify(q) === JSON.stringify([18, 8, 60, 15, 7, 22.3, 24.32]), JSON.stringify(q));
  conferir('unidades un/m', ex[0].itens.map((i) => i.unidade).join() === 'un,un,un,un,un,m,m');
  conferir('nada confirmado errado (as tomadas vêm em "Revisar")', ex[0].itens.slice(0, 2).every((i) => i.situacao === 'revisar'));
  const csv = gerarCsv([{ arquivo: 'exemplo.pdf', folhas: ex }]);
  conferir('CSV com BOM, ponto e vírgula e vírgula decimal', csv.startsWith('﻿DESCRIÇÃO;QUANTIDADE;UNIDADE;') && csv.includes(';22,3;m;'));
  conferir('CSV com uma linha por material', csv.trim().split(/\r?\n/).length === 1 + ex[0].itens.length);
  const r = resumo(ex);
  conferir('resumo', r.itens === 7 && r.confirmados === 5 && r.revisar === 2, JSON.stringify(r));

  console.log('\nsintéticas do bench — gabarito por camada');
  const dir = path.join(raiz, 'bench/sinteticas');
  const js = fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort().slice(0, 4);
  for (const j of js) {
    const G = JSON.parse(fs.readFileSync(path.join(dir, j), 'utf8'));
    const v = await ler(path.join(dir, j.replace('.json', '.pdf')));
    const itens = v.flatMap((f) => f.itens);
    const esperado: [string, string, number][] = (G.esperado || []).filter((e: any) => typeof e[2] === 'number');
    let batem = 0;
    const confirmadoErrado = itens.filter((it) => {
      const n = norm(it.nome), e = esperado.find((x) => norm(x[0]) === n || (n.length >= 12 && norm(x[0]).startsWith(n)));
      if (!e || it.unidade !== 'un') return false;
      if (it.qtd === e[2]) batem++;
      return it.situacao === 'confirmado' && it.qtd !== e[2];
    });
    conferir(`${j.replace('.json', '')}: ${batem}/${esperado.length * v.length} quantidades exatas, nenhum confirmado errado`, esperado.length > 0 && batem / (esperado.length * v.length) >= 0.9 && !confirmadoErrado.length,
      confirmadoErrado.map((i) => `${i.nome}=${i.qtd}`).join(', '));
  }

  console.log(`\n${ok} ok · ${falhas} falha(s)\n`);
  process.exit(falhas ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
