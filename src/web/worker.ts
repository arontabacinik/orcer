// O motor roda aqui, num Web Worker: a tela não trava enquanto a prancha é lida, e o PDF não sai do navegador.
import * as pdfjs from 'pdfjs-dist';
// Já estamos num Worker: o "worker" do pdf.js roda aqui mesmo, na mesma thread (sem worker aninhado)
import * as pdfjsWorker from 'pdfjs-dist/build/pdf.worker.js';
import { lerPdf, recontar } from '../ler';
import { paraVista } from '../lista';
import type { Folha, OpcoesContagem } from '../motor/tipos';

(globalThis as any).pdfjsWorker = (pdfjsWorker as any).WorkerMessageHandler ? pdfjsWorker : (pdfjsWorker as any).default;

export type Pedido =
  | { tipo: 'ler'; id: string; dados: ArrayBuffer }
  | { tipo: 'recontar'; id: string; pagina: number; opcoes: OpcoesContagem }
  | { tipo: 'esquecer'; id: string };

const lidos = new Map<string, Folha[]>();
const enviar = (m: any) => (self as any).postMessage(m);

self.onmessage = async (e: MessageEvent<Pedido>) => {
  const m = e.data;
  try {
    if (m.tipo === 'ler') {
      const folhas = await lerPdf(pdfjs, new Uint8Array(m.dados), (a) => enviar({ tipo: 'andamento', id: m.id, ...a }));
      lidos.set(m.id, folhas);
      enviar({ tipo: 'lido', id: m.id, folhas: folhas.map(paraVista) });
    } else if (m.tipo === 'recontar') {
      const folhas = lidos.get(m.id); const f = folhas?.find((x) => x.pageNum === m.pagina);
      if (!f) throw new Error('folha não encontrada');
      recontar(f, m.opcoes);
      enviar({ tipo: 'recontado', id: m.id, folha: paraVista(f) });
    } else if (m.tipo === 'esquecer') lidos.delete(m.id);
  } catch (err: any) {
    enviar({ tipo: 'erro', id: (m as any).id, msg: String(err?.message || err) });
  }
};
