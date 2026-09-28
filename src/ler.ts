// Lê um PDF inteiro, uma folha por vez (as folhas são independentes), e resolve a folha sem legenda com a
// legenda de outra folha do mesmo arquivo (o jogo de pranchas com uma folha só de legenda).
import { analyzeDocument, takeoff, opSig, mkObj } from './motor/motor';
import type { Folha, OpcoesContagem } from './motor/tipos';

export interface Andamento { pagina: number; total: number; }

export async function lerPdf(pdfjs: any, dados: Uint8Array, aoAndar?: (a: Andamento) => void, aoFolha?: (f: Folha) => void): Promise<Folha[]> {
  const doc = await pdfjs.getDocument({ data: dados, verbosity: 0, isEvalSupported: false }).promise;
  const folhas: Folha[] = [];
  for (let n = 1; n <= doc.numPages; n++) {
    aoAndar?.({ pagina: n, total: doc.numPages });
    await new Promise((r) => setTimeout(r, 0));
    const [f] = await analyzeDocument(pdfjs, doc, undefined, [n]);
    folhas.push(f);
  }
  // biblioteca: ícones das folhas que têm legenda, para as que não têm
  const lib: any[] = [], vistos = new Set<string>();
  for (const f of folhas) for (const it of f.result!.items) {
    if (it.fromLibrary || !it.prims || !it.prims.length || it.sw.type === 'NOTA') continue;
    const k = opSig(mkObj(it.prims)) + '|' + (it.name || '').toUpperCase();
    if (vistos.has(k)) continue; vistos.add(k);
    lib.push({ prims: it.prims, name: it.name, src: 'folha ' + f.pageNum });
  }
  for (const f of folhas) {
    if (f.raster || f.result!.items.some((it) => !it.fromLibrary) || !lib.length) continue;
    const deOutras = lib.filter((L) => L.src !== 'folha ' + f.pageNum);
    f.result = takeoff(f, { library: deOutras });
    (f as any)._lib = deOutras;
  }
  for (const f of folhas) aoFolha?.(f);
  return folhas;
}

/** Recontagem de uma folha já lida, com as respostas da pessoa (o molde apontado, por exemplo). */
export function recontar(f: Folha, op: OpcoesContagem): Folha {
  f.result = takeoff(f, { ...op, library: (f as any)._lib });
  return f;
}
