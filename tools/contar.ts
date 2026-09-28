// Linha de comando: npm run contar -- prancha.pdf [outra.pdf ...] [--csv saida.csv]
// Lê cada PDF, imprime a lista de materiais e grava o CSV.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { lerPdf } from '../src/ler';
import { paraVista, gerarCsv, resumo, ROTULO, type ArquivoVista } from '../src/lista';

const require = createRequire(import.meta.url);

async function main() {
  const args = process.argv.slice(2);
  const iC = args.indexOf('--csv');
  const saida = iC >= 0 ? args[iC + 1] : null;
  const pdfs = args.filter((a, i) => /\.pdf$/i.test(a) && i !== iC + 1);
  if (!pdfs.length) { console.log('uso: npm run contar -- prancha.pdf [outra.pdf ...] [--csv lista.csv]'); process.exit(1); }
  const log = console.log; console.log = () => {};           // o pdf.js avisa de fonte e de canvas no Node: silêncio
  const pdfjs = require('pdfjs-dist/legacy/build/pdf.js');
  console.log = log;
  const arqs: ArquivoVista[] = [];
  for (const f of pdfs) {
    const t0 = Date.now();
    const folhas = await lerPdf(pdfjs, new Uint8Array(fs.readFileSync(f)), (a) => process.stderr.write(`\r  ${path.basename(f)} · folha ${a.pagina} de ${a.total}   `));
    process.stderr.write('\r' + ' '.repeat(70) + '\r');
    const vistas = folhas.map(paraVista);
    arqs.push({ arquivo: path.basename(f), folhas: vistas });
    const r = resumo(vistas);
    console.log(`\n${path.basename(f)} · ${folhas.length} folha(s) · ${((Date.now() - t0) / 1000).toFixed(1)} s · ${r.itens} itens, ${r.confirmados} confirmados, ${r.revisar} para revisar`);
    for (const v of vistas) {
      if (vistas.length > 1) console.log(`  — folha ${v.pagina}`);
      for (const a of v.avisos) console.log('  ! ' + a);
      for (const it of v.itens) {
        const q = it.qtd == null ? '—' : String(it.qtd).replace('.', ',');
        console.log(`  ${(it.nome || '(sem descrição)').slice(0, 64).padEnd(64)} ${q.padStart(9)} ${it.unidade.padEnd(2)}  ${ROTULO[it.situacao]}`);
      }
    }
  }
  const csv = saida || (pdfs.length === 1 ? pdfs[0].replace(/\.pdf$/i, '') + '_orcer.csv' : 'orcer_lista.csv');
  fs.writeFileSync(csv, gerarCsv(arqs));
  console.log(`\nCSV: ${csv}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
