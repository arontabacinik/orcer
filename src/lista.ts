// A ENTREGA: o que sai do motor vira uma lista de materiais simples — para a tela, para o CSV e para a linha de
// comando. Tudo aqui é serializável (atravessa o Web Worker).
import type { Folha, Item, Caixa, Status } from './motor/tipos';

export type Situacao = 'confirmado' | 'revisar' | 'zero' | 'nota' | 'outra-folha';

export const SITUACAO: Record<Status, Situacao> = {
  ALTA: 'confirmado', MEDIA: 'revisar', ZERO: 'zero', REFERENCIA: 'nota', NAO_SOMAR: 'outra-folha',
};
export const ROTULO: Record<Situacao, string> = {
  confirmado: 'Confirmado', revisar: 'Revisar', zero: 'Zero', nota: 'Nota', 'outra-folha': 'Outra folha',
};
export const EXPLICA: Record<Situacao, string> = {
  confirmado: 'cada ocorrência contada é o símbolo da legenda, conferido nos dois sentidos',
  revisar: 'o número é a melhor leitura, mas falta prova — vale uma olhada nas marcas',
  zero: 'o símbolo está na legenda e não aparece na planta',
  nota: 'notação da simbologia, não é material',
  'outra-folha': 'a legenda diz que este material está em outro desenho',
};

export interface ItemVista {
  idx: number;
  nome: string;
  qtd: number | null;
  unidade: string;
  situacao: Situacao;
  tipo: 'peca' | 'linear' | 'nota';
  icone: Caixa;
  marcas: Caixa[];
  duvidas: Caixa[];
  /** trechos medidos de rota: segmentos [x0,y0,x1,y1,...] */
  trechos: number[];
  metodo: string;
  molde: Caixa | null;
  moldeAutomatico: boolean;
  /** o retângulo apontado não serviu: por quê */
  recusaMolde: string | null;
}

export interface FolhaVista {
  pagina: number;
  largura: number;
  altura: number;
  escala: number | null;
  escaneada: boolean;
  legendas: Caixa[];
  itens: ItemVista[];
  avisos: string[];
}

const r1 = (c: Caixa) => c.map((v) => Math.round(v * 10) / 10);

export function paraVista(f: Folha): FolhaVista {
  const R = f.result!;
  const itens: ItemVista[] = R.items.filter((it) => !it.custom).map((it: Item) => ({
    idx: it.idx,
    nome: (it.name || '').replace(/\s+/g, ' ').trim(),
    qtd: typeof it.qty === 'number' ? Math.round(it.qty * 100) / 100 : null,
    unidade: it.unit || 'un',
    situacao: SITUACAO[it.conf] || 'revisar',
    tipo: it.sw?.type === 'ROTA' ? 'linear' : it.sw?.type === 'NOTA' ? 'nota' : 'peca',
    icone: r1(it.bbox || [0, 0, 0, 0]),
    marcas: (it.marks || []).map(r1),
    duvidas: (it.duvidas || []).map((d) => r1(d.bbox)),
    trechos: it.sw?.type === 'ROTA' && Array.isArray(it.segs) ? it.segs.flat().map((v: number) => Math.round(v * 10) / 10) : [],
    metodo: it.note || '',
    molde: it.molde ? r1(it.molde) : null,
    moldeAutomatico: /mais se parece com ele/.test(it.note || ''),
    recusaMolde: it.moldeVazio ? 'O retângulo é menor que o símbolo: nenhum desenho coube inteiro dentro dele. Abra um pouco mais, folgado em volta de UM símbolo.'
      : it.moldePobre ? 'O retângulo pegou só um traço reto — pedaço de parede ou de fio. Envolva o símbolo inteiro.'
      : it.moldeCortado ? 'O retângulo cortou o desenho. Aproxime a vista e envolva UM símbolo inteiro.'
      : it.molde && !it.moldeProprio ? 'O retângulo não pegou um símbolo inteiro e só ele. Tente de novo, justo em volta de um.' : null,
  }));
  const avisos: string[] = [];
  if (f.raster) avisos.push('Esta folha é uma imagem escaneada. O Orcer lê o traço que o CAD grava no PDF — peça o PDF exportado direto do CAD.');
  else if (!itens.length) avisos.push('Não achei legenda nesta folha.');
  const semNome = itens.filter((i) => !i.nome && i.tipo !== 'nota').length;
  if (semNome) avisos.push(`${semNome} símbolo(s) da legenda sem descrição legível.`);
  return {
    pagina: f.pageNum, largura: f.width, altura: f.height, escala: f.scaleAuto ? f.scale ?? null : null, escaneada: !!f.raster,
    legendas: (R.legendRects || []).map(r1), itens, avisos,
  };
}

// ---------- CSV (Excel em português: ";" e vírgula decimal, UTF-8 com BOM) ----------
export interface ArquivoVista { arquivo: string; folhas: FolhaVista[]; }

const campo = (v: unknown) => {
  const s = String(v ?? '').replace(/\s+/g, ' ').trim();
  return /[;"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
};
export const numero = (q: number | null) => (q == null ? '' : String(q).replace('.', ','));

/** Uma linha por item de legenda. Notação da simbologia fica fora: não é material. */
export function gerarCsv(arqs: ArquivoVista[]): string {
  const L = ['DESCRIÇÃO;QUANTIDADE;UNIDADE;SITUAÇÃO;COMO FOI CONTADO;FOLHA;ARQUIVO'];
  for (const a of arqs) for (const f of a.folhas) for (const it of f.itens) {
    if (it.situacao === 'nota') continue;
    L.push([it.nome || '(sem descrição na legenda)', numero(it.qtd), it.unidade, ROTULO[it.situacao], it.metodo, f.pagina, a.arquivo].map(campo).join(';'));
  }
  return '﻿' + L.join('\r\n') + '\r\n';
}

/** Resumo de uma leitura, para a tela e para a linha de comando. */
export function resumo(fs: FolhaVista[]) {
  const it = fs.flatMap((f) => f.itens).filter((i) => i.situacao !== 'nota');
  return {
    itens: it.length,
    confirmados: it.filter((i) => i.situacao === 'confirmado').length,
    revisar: it.filter((i) => i.situacao === 'revisar').length,
    pecas: it.filter((i) => i.tipo === 'peca').reduce((a, i) => a + (i.qtd || 0), 0),
    metros: it.filter((i) => i.tipo === 'linear').reduce((a, i) => a + (i.qtd || 0), 0),
  };
}
