// Ajuda dos testes: ler uma folha e recontar UM item pelo retângulo que a pessoa desenharia na planta.
import fs from 'node:fs';
import { analyzeDocument, takeoff } from '../src/motor/motor';
import { paraVista } from '../src/lista';
import type { Caixa } from '../src/motor/tipos';

export async function lerPdfComMolde(pdfjs: any, arquivo: string, qual: RegExp, retangulo: Caixa) {
  const doc = await pdfjs.getDocument({ data: new Uint8Array(fs.readFileSync(arquivo)), verbosity: 0, isEvalSupported: false }).promise;
  const folha = (await analyzeDocument(pdfjs, doc, undefined, [1]))[0];
  const alvo = folha.result!.items.find((it) => qual.test(it.name || ''));
  if (!alvo) return { qtd: null, recusa: 'item não achado na legenda' };
  folha.result = takeoff(folha, { molde: { [alvo.idx]: retangulo } });
  const v = paraVista(folha).itens.find((i) => qual.test(i.nome));
  return { qtd: v ? v.qtd : null, situacao: v?.situacao, recusa: v?.recusaMolde || null };
}
