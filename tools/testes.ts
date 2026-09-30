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
  // as duas tomadas têm o MESMO círculo; o que as separa é a marca preenchida dentro da de 20A. O juiz
  // enxerga isso pela volta — e por isso as duas saem confirmadas, cada uma com o seu número.
  conferir('as duas tomadas, que só diferem pela marca preenchida, saem confirmadas e separadas',
    ex[0].itens[0].situacao === 'confirmado' && ex[0].itens[1].situacao === 'confirmado',
    ex[0].itens.slice(0, 2).map((i) => `${i.qtd}=${i.situacao}`).join(' '));
  const csv = gerarCsv([{ arquivo: 'exemplo.pdf', folhas: ex }]);
  conferir('CSV com BOM, ponto e vírgula e vírgula decimal', csv.startsWith('﻿DESCRIÇÃO;QUANTIDADE;UNIDADE;') && csv.includes(';22,3;m;'));
  conferir('CSV com uma linha por material', csv.trim().split(/\r?\n/).length === 1 + ex[0].itens.length);
  const r = resumo(ex);
  conferir('resumo: 7 itens, 7 confirmados, 0 para revisar', r.itens === 7 && r.confirmados === 7 && r.revisar === 0, JSON.stringify(r));

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


  console.log('\nlote — quando o desenho da planta não é o ícone da legenda');
  const lote = path.join(raiz, 'bench/lote');
  // a RECUSA REPETIDA: o juiz recusa as 27 luminárias pela mesma margem, e a margem constante é a convenção
  // de desenho da prancha. Sai como Revisar, com o número — nunca como Confirmado.
  const pc = await ler(path.join(lote, 'parcial-cega-0.pdf'));
  const lum = pc[0].itens.find((i) => /LIGHT FIXTURE/.test(i.nome));
  conferir('parcial-cega-0: 27 luminárias pela recusa repetida, em Revisar', lum?.qtd === 27 && lum?.situacao === 'revisar', JSON.stringify([lum?.qtd, lum?.situacao]));
  conferir('nada confirmado errado nesta folha', pc[0].itens.filter((i) => i.situacao === 'confirmado').length === 0);

  // APONTAR UM NA PLANTA tem de ter saída: o quadro de distribuição não é achado sozinho, e um retângulo
  // em volta de um exemplar tem de contar os quatro — mesmo com a marcação de parede colada nele.
  const { lerPdfComMolde } = await import('./molde-teste');
  const quadro = await lerPdfComMolde(pdfjs, path.join(lote, 'esquematico-cega-0.pdf'), /PANEL/, [431.5, 130.5, 453.1, 152.1]);
  conferir('esquematico-cega-0: apontando um quadro, conta os 4', quadro.qtd === 4, JSON.stringify(quadro));
  const pequeno = await lerPdfComMolde(pdfjs, path.join(lote, 'esquematico-cega-0.pdf'), /PANEL/, [440, 139, 444, 143]);
  conferir('retângulo menor que o símbolo avisa em vez de não fazer nada', /menor que o símbolo/.test(pequeno.recusa || ''), JSON.stringify(pequeno));

  console.log(`\n${ok} ok · ${falhas} falha(s)\n`);
  process.exit(falhas ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
