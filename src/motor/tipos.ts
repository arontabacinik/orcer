// Tipos do motor. Toda coordenada é em pontos PDF (1/72"), no espaço de exibição da página (y para baixo).

/** [x0, y0, x1, y1] */
export type Caixa = number[];

export type Status = 'ALTA' | 'MEDIA' | 'ZERO' | 'REFERENCIA' | 'NAO_SOMAR';

/** Um caminho desenhado do PDF, já transformado para a página. */
export interface Prim {
  i: number;
  segs: number[];
  bbox: Caixa;
  ops: string;
  stroke: string | null;
  fill: string | null;
  layer: string;
  len: number;
  [k: string]: any;
}

export interface Texto { str: string; bbox: Caixa; [k: string]: any; }

/** Um item da legenda depois da contagem. */
export interface Item {
  idx: number;
  name: string;
  prims: Prim[];
  bbox: Caixa;
  qty: number | null;
  unit: string;
  conf: Status;
  /** uma caixa por ocorrência contada */
  marks: Caixa[];
  /** de onde veio o número, em português */
  note: string;
  sw: { type: 'PONTO' | 'ROTA' | 'NOTA'; [k: string]: any };
  duvidas?: { bbox: Caixa; why: string; fw: number; rv: number }[];
  molde?: Caixa;
  [k: string]: any;
}

export interface Resultado {
  items: Item[];
  scale: number;
  legendRect: Caixa | null;
  legendRects: Caixa[];
  hasLayers: boolean;
  residual: any[];
  sobras: any[];
}

/** Uma página lida do PDF. */
export interface Folha {
  pageNum: number;
  width: number;
  height: number;
  rotation: number;
  prims: Prim[];
  texts: Texto[];
  page: any;
  clipped: number;
  hidden: number;
  raster: boolean;
  imgArea: number;
  scale?: number;
  scaleAuto?: boolean;
  legend?: any;
  result?: Resultado;
  _manualItems?: any;
}

/** O que a pessoa pode responder, e que volta para o takeoff. */
export interface OpcoesContagem {
  legendRect?: Caixa;
  molde?: Record<number, Caixa>;
  aceitar?: Record<number, boolean>;
  recusar?: Record<number, boolean>;
  confirmar?: Record<number, boolean>;
  library?: any[];
  names?: Record<number, string>;
  scale?: number;
  [k: string]: any;
}
