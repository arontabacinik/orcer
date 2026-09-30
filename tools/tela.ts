// npm run tela — o WEBAPP de ponta a ponta, num navegador de verdade.
//
// O motor tem benchmark; a tela não tinha nada. Aqui o fluxo inteiro é exercido como uma pessoa faria:
// abre, pede o exemplo, confere a lista, baixa o CSV, anda pelo teclado, volta ao início — e nada disso
// pode deixar erro no console. Sobe o dist/ (o que vai para o ar), não o servidor de desenvolvimento.
import fs from 'node:fs';
import path from 'node:path';
import { spawn, type ChildProcess } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { chromium, type Browser, type Page } from 'playwright';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORTA = +(process.env.PORTA || 4178);
const BASE = `http://127.0.0.1:${PORTA}/`;
// o contêiner já traz o Chromium; fora dele, vale o que o playwright baixou
const CHROME = process.env.CHROME_PATH || (fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);

let falhas = 0, ok = 0;
function conferir(nome: string, cond: boolean, detalhe = '') {
  if (cond) { ok++; console.log('  ✓ ' + nome); } else { falhas++; console.log('  ✗ ' + nome + (detalhe ? ' — ' + detalhe : '')); }
}

async function servir(): Promise<ChildProcess> {
  if (!fs.existsSync(path.join(RAIZ, 'dist', 'index.html'))) {
    console.error('falta dist/ — rode `npm run build` antes'); process.exit(2);
  }
  const ch = spawn('npx', ['vite', 'preview', '--port', String(PORTA), '--strictPort'], { cwd: RAIZ, stdio: 'ignore' });
  for (let i = 0; i < 60; i++) {
    try { const r = await fetch(BASE); if (r.ok) return ch; } catch { }
    await new Promise((r) => setTimeout(r, 250));
  }
  ch.kill(); console.error(`o preview não subiu em ${BASE}`); process.exit(2);
}

/** erros e avisos do console, e requisições que falharam — qualquer um reprova a tela */
function vigiar(p: Page, saco: string[]) {
  p.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') saco.push(m.type() + ': ' + m.text().slice(0, 200)); });
  p.on('pageerror', (e) => saco.push('pageerror: ' + String(e).slice(0, 200)));
  p.on('requestfailed', (r) => saco.push('requestfailed: ' + r.url().slice(0, 120)));
}

async function main() {
  const servidor = await servir();
  let b: Browser | null = null;
  try {
    b = await chromium.launch(CHROME ? { executablePath: CHROME } : {});
    const ruido: string[] = [];

    console.log('\ntela inicial');
    const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
    vigiar(p, ruido);
    await p.goto(BASE, { waitUntil: 'networkidle' });
    conferir('o título da aba fala do produto', /Orcer/.test(await p.title()));
    conferir('a área de soltar o PDF está lá', await p.isVisible('#solte'));
    const versao = (await p.textContent('#versao')) || '';
    const { version } = JSON.parse(fs.readFileSync(path.join(RAIZ, 'package.json'), 'utf8'));
    conferir(`o rodapé mostra a versão do package.json (v${version})`, versao.trim() === 'v' + version, versao);
    const numeros = await p.$$eval('.prova b', (bs) => bs.map((x) => x.textContent!.trim()));
    conferir('os números da página inicial são os medidos', numeros[0] === '94,8%' && numeros[1] === '0', JSON.stringify(numeros));

    console.log('\nler o exemplo de ponta a ponta');
    const lendo = p.waitForSelector('#tela-lendo:not([hidden])', { timeout: 5000 }).then(() => true).catch(() => false);
    await p.click('#exemplo');
    conferir('mostra a tela de leitura enquanto trabalha', await lendo);
    conferir('a tela inicial sai da frente', await p.isHidden('#tela-inicio'));
    await p.waitForSelector('#tela-resultado:not([hidden])', { timeout: 180000 });
    await p.waitForTimeout(800);

    const linhas = await p.$$eval('#itens > li', (ls) => (ls as HTMLElement[]).map((l) => ({
      nome: (l.querySelector('.it-nome') || l).textContent!.replace(/\s+/g, ' ').trim(),
      txt: l.innerText.replace(/\s+/g, ' ').trim(),
    })));
    conferir('a lista traz os 7 itens da legenda', linhas.length === 7, String(linhas.length));
    const qtd = await p.$$eval('#itens > li', (ls) => (ls as HTMLElement[]).map((l) => (l.innerText.match(/(\d[\d.,]*)\s*(un|m)\b/) || [])[1]));
    conferir('as quantidades são 18 · 8 · 60 · 15 · 7 · 22,3 · 24,32',
      JSON.stringify(qtd) === JSON.stringify(['18', '8', '60', '15', '7', '22,3', '24,32']), JSON.stringify(qtd));
    const revisar = linhas.filter((l) => /Revisar/.test(l.txt)).length;
    conferir('nenhum item do exemplo pede revisão', revisar === 0, revisar + ' pedindo');
    const totais = (await p.textContent('#totais'))!.replace(/\s+/g, ' ');
    conferir('o resumo diz 7 confirmados', /7\s*confirmados/.test(totais), totais);
    conferir('cada ocorrência está marcada no desenho', (await p.$$('#marcas *')).length > 0);

    console.log('\nas ações da tela');
    const baixa = p.waitForEvent('download', { timeout: 30000 });
    await p.click('#baixar');
    const arq = await baixa;
    const csv = fs.readFileSync(await arq.path(), 'utf8');
    conferir('o CSV baixa com BOM, ponto e vírgula e vírgula decimal',
      csv.startsWith('﻿DESCRIÇÃO;QUANTIDADE;') && csv.includes(';22,3;m;'), csv.slice(0, 60));
    conferir('o CSV tem uma linha por material', csv.trim().split(/\r?\n/).length === 8, String(csv.trim().split(/\r?\n/).length));

    await p.click('#itens > li:first-child');
    await p.keyboard.press('ArrowDown');
    await p.waitForTimeout(250);
    const segundo = await p.getAttribute('#itens > li:nth-child(2)', 'aria-selected');
    conferir('a seta para baixo anda na lista', segundo === 'true', String(segundo));

    const antes = await p.$eval('#plano', (e) => getComputedStyle(e).transform);
    await p.click('#z-mais'); await p.waitForTimeout(250);
    conferir('o botão de aproximar muda a vista', (await p.$eval('#plano', (e) => getComputedStyle(e).transform)) !== antes);
    await p.click('#z-ajustar'); await p.waitForTimeout(250);

    await p.click('#nova');
    await p.waitForTimeout(400);
    conferir('“Nova leitura” volta para o início', await p.isVisible('#solte'));

    console.log('\nno celular');
    const m = await b.newPage({ viewport: { width: 390, height: 844 } });
    vigiar(m, ruido);
    await m.goto(BASE, { waitUntil: 'networkidle' });
    conferir('sem rolagem horizontal', !(await m.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)));
    conferir('a área de soltar o PDF cabe na tela', await m.isVisible('#solte'));
    const miudos = await m.$$eval('button, a, label, input:not([type=hidden]), [role=option]', (es) => es
      .filter((e) => (e as HTMLElement).offsetParent !== null)
      .map((e) => { const r = e.getBoundingClientRect(); return { q: (e.id && '#' + e.id) || e.className || e.tagName, h: Math.round(r.height), w: Math.round(r.width) }; })
      .filter((x) => x.h > 0 && (x.h < 24 || x.w < 24)));
    conferir('todo controle tem alvo de toque de 24px ou mais (WCAG 2.2)', miudos.length === 0,
      miudos.map((x) => `${x.q} ${x.w}×${x.h}`).join(', '));

    console.log('\nconsole limpo');
    const unicos = [...new Set(ruido)];
    conferir('nenhum erro nem aviso no console', unicos.length === 0, unicos.join(' | ').slice(0, 300));
  } finally {
    if (b) await b.close();
    servidor.kill();
  }
  console.log(`\n${ok} ok · ${falhas} falha(s)\n`);
  process.exit(falhas ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
