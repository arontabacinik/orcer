// A LEGENDA pela forma: um conjunto de linhas de descrição, cada uma com um desenho pequeno na mesma altura,
// os desenhos alinhados numa coluna, as descrições longas e distintas.

/* Orcer — legend detection by FORM (no title needed).
   A legend is a set of description lines, each with a small drawing on the same row, the drawings
   aligned in a column, the descriptions long and distinct. Local look-alikes (a symbol with a circuit
   label) fail the set tests: short, repeated labels. Tables, right-hand icons, columns, several blocks,
   section sub-headers and wrapped descriptions are all the same pattern read the same way. */

  const med = a => { if (!a.length) return 0; const s = a.slice().sort((x, y) => x - y); return s[s.length >> 1]; };
  const union = (a, b) => [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])];
  const diag = b => Math.hypot(b[2] - b[0], b[3] - b[1]);
  const TITLE = /\b(LEGENDAS?|SIMBOLOGIA|SIMBOLOG[IÍ]A|CONVEN[CÇ][OÕ]ES|LEGENDS?|SYMBOLS?|NOTATION|KEY)\b/i;
  const STOP = /^\s*(NOTAS?|OBSERVA[CÇ][OÕ]ES|OBS\.?|QUADRO DE CARGAS|CARIMBO|PROJETO|REVIS[AÃ]O|FOLHA|ESCALA|DATA|CLIENTE|OBRA|DESENHO)\b/i;
  const LEGEND_LAYER = /(^|[^A-Z])(LEGEND|LEGENDA|SIMBOLOG|SYMBOL|CONVEN)/i;
  const neutral = c => !c || /^#(([0-9a-f]{2})\2\2)$/i.test(c);
  const alnum = t => t.replace(/[^0-9A-Za-zÀ-ÿ]/g, "");

  // ---------- text lines (real text, or stroke text read by the vector OCR) ----------
  function textLines(sheet, VO, cluster) {
    let words = sheet.texts.map(t => ({ str: t.str, bbox: t.bbox, h: Math.max(0.5, t.bbox[3] - t.bbox[1]) }));
    const usedPrims = new Set();
    if (words.length < 5 && VO) {
      const cand = sheet.prims.filter(p => p.stroke && !p.fill && neutral(p.stroke) && p.len > 0 && diag(p.bbox) < sheet.height * 0.02);
      if (cand.length && cand.length < 120000) {
        const hs = cand.map(p => p.bbox[3] - p.bbox[1]).filter(h => h > 0).sort((a, b) => a - b);
        const cap = hs.length ? hs[Math.floor(hs.length * 0.8)] : 4;
        let n = 0;
        for (const o of cluster(cand, Math.max(0.3, cap * 0.45))) {
          const w = o.bbox[2] - o.bbox[0], h = o.bbox[3] - o.bbox[1];
          if (o.prims.length < 1 || h > cap * 3 || (h < cap * 0.5 && w < cap * 1.5)) continue;
          if (++n > 6000) break;
          const r = VO.readBlock(o.prims, { angles: [0] });
          const clean = r && r.text ? alnum(r.text) : "";
          const okWord = r && clean.length >= 1 && r.score < (clean.length >= 2 ? 0.1 : 0.04) && (r.plausible || (clean.length <= 5 && r.score < 0.06));
          if (okWord) {
            words.push({ str: r.text.replace(/\?/g, "").trim(), bbox: o.bbox, h, vector: true, prims: o.prims });
            for (const p of o.prims) usedPrims.add(p);
          }
        }
        // hyphens / dots inside rows are text too
        const rows = words.filter(w => w.vector);
        for (const p of cand) if (!usedPrims.has(p) && diag(p.bbox) < cap * 1.3) {
          const cy = (p.bbox[1] + p.bbox[3]) / 2;
          if (rows.some(w => cy >= w.bbox[1] - cap * 0.3 && cy <= w.bbox[3] + cap * 0.3 && p.bbox[0] >= w.bbox[0] - cap * 3 && p.bbox[2] <= w.bbox[2] + cap * 3)) usedPrims.add(p);
        }
      }
    }
    // words -> lines (same baseline, small gap, no drawing in between)
    const inkIdx = sheet.prims.filter(p => !usedPrims.has(p) && !(p.stroke && neutral(p.stroke) && !p.fill && diag(p.bbox) < 8));
    const gapInk = (x0, x1, cy, h) => x1 - x0 > h * 1.2 && inkIdx.some(p => p.bbox[0] > x0 + 0.3 && p.bbox[2] < x1 - 0.3 && p.bbox[1] < cy + h * 0.6 && p.bbox[3] > cy - h * 0.6);
    words.sort((a, b) => a.bbox[0] - b.bbox[0]);
    const lines = [];
    for (const w of words) {
      const cy = (w.bbox[1] + w.bbox[3]) / 2;
      const L = lines.find(l => Math.abs(l.cy - cy) < Math.min(l.h, w.h) * 0.45 && w.bbox[0] - l.bbox[2] < Math.max(l.h, w.h) * (w.vector ? 2.6 : 1.0) && w.bbox[0] >= l.bbox[0] - 1 && Math.abs(l.h - w.h) < Math.max(l.h, w.h) * (w.vector ? 0.5 : 0.2) && !(gapInk && gapInk(l.bbox[2], w.bbox[0], cy, Math.max(l.h, w.h))));
      if (L) { L.str += (w.bbox[0] - L.bbox[2] < L.h * 0.25 && w.vector ? "" : " ") + w.str; L.bbox = union(L.bbox, w.bbox); L.words.push(w); }
      else lines.push({ str: w.str, bbox: w.bbox.slice(), cy, h: w.h, words: [w] });
    }
    for (const L of lines) L.str = L.str.replace(/\s+/g, " ").trim();
    return { lines, usedPrims };
  }

  function detect(sheet, deps) {
    const { cluster, VO, isTextPrim, opSig, mkObj } = deps;
    const { lines, usedPrims } = textLines(sheet, VO, cluster);
    const good = lines.filter(l => alnum(l.str).length >= 2);
    if (good.length < 2) return null;
    const lh = med(good.map(l => l.h)) || 6;
    // optional fence: a layer named like a legend
    let fence = null;
    const legPrims = sheet.prims.filter(p => LEGEND_LAYER.test(p.layer || ""));
    if (legPrims.length >= 3) { fence = legPrims[0].bbox.slice(); for (const p of legPrims) fence = union(fence, p.bbox); }

    // ---------- icon candidates: filter BY SIZE before clustering (frames and grids would glue a table into one blob) ----------
    const teto = Math.max(6 * lh, 12);
    const textBoxes = lines.map(l => l.bbox);
    const inText = b => textBoxes.some(t => b[0] >= t[0] - 0.3 && b[2] <= t[2] + 0.3 && b[1] >= t[1] - 0.3 && b[3] <= t[3] + 0.3);
    // frames and table cells ENCLOSE text; icons never do
    const enclosesText = b => textBoxes.some(t => t[0] >= b[0] - 0.5 && t[2] <= b[2] + 0.5 && t[1] >= b[1] - 0.5 && t[3] <= b[3] + 0.5);
    const small = sheet.prims.filter(p => !usedPrims.has(p) && !isTextPrim(p) && p.len >= 0 && (p.bbox[3] - p.bbox[1]) <= teto && (p.bbox[2] - p.bbox[0]) <= 3 * teto && !inText(p.bbox) && !(p.closed && enclosesText(p.bbox)));
    // leftovers of text the OCR did not read (°, ², commas, parentheses) sit glued to a line: they are not icons
    const glyphResidue = o => o.prims.every(p => !p.fill && neutral(p.stroke)) && diag(o.bbox) < 1.6 * lh &&
      lines.some(l => { const cy = (o.bbox[1] + o.bbox[3]) / 2; return Math.abs(cy - l.cy) < l.h * 0.8 && o.bbox[0] < l.bbox[2] + 1.2 * l.h && o.bbox[2] > l.bbox[0] - 1.2 * l.h; });
    let icons = cluster(small, Math.max(0.4, lh * 0.25)).filter(o => { const w = o.bbox[2] - o.bbox[0], h = o.bbox[3] - o.bbox[1]; return h <= teto && w <= 3 * teto && diag(o.bbox) > lh * 0.25 && !glyphResidue(o); });

    // uma fileira de legenda é uma unidade fechada; começando em minúscula, com parêntese que fecha sem abrir,
    // ou sem letra nenhuma no começo, ela é o rabo de uma nota — ou da descrição de cima — que continuou
    const comecaNoMeio = t => { const c = (t || "").trim().replace(/^[-–—·•*\s]+/, ""); if (!c) return true; const p = c[0];
      if (/[a-zà-ÿ]/.test(p)) return true;
      if (!/[A-Za-zÀ-ÿ0-9]/.test(p)) return true;
      const ab = (c.match(/\(/g) || []).length, fe = (c.match(/\)/g) || []).length; if (fe > ab) return true;
      if (/:\s*$/.test(c)) return true;                       // "NOTAS:" é título, não item
      const L = (c.match(/[A-Za-zÀ-ÿ]/g) || []).length; if (L / c.length < 0.30) return true;   // fonte sem mapa Unicode: sai símbolo
      return false; };

    // ---------- each line looks for its drawing on the same row, on each side ----------
    function anchor(side) {
      const cand = [];
      good.forEach((L, li) => {
        let best = null, bd = Infinity;
        for (const [oi, o] of icons.entries()) {
          const ocy = (o.bbox[1] + o.bbox[3]) / 2, oh = o.bbox[3] - o.bbox[1];
          // o ícone de uma fileira de DUAS LINHAS fica centrado entre elas, e a janela por CENTRO deixava a
          // linha de cima de fora — ela saía procurando ícone na planta. Vale também a SOBREPOSIÇÃO das faixas.
          // o ícone fica centrado na FILEIRA, e numa descrição de DUAS LINHAS isso deixava a linha de cima
          // fora da janela por centro — ela ia então procurar ícone na planta. Vale também a SOBREPOSIÇÃO das
          // faixas, que é o que diz "esta linha está na altura deste ícone" sem alcançar a fileira vizinha:
          // alargar a janela por centro para uma linha inteira fazia o ícone ser capturado pela linha de CIMA
          // e a legenda da cnt002 inteira (10 fileiras) desaparecia.
          const sobrepoe = Math.min(o.bbox[3], L.bbox[3]) > Math.max(o.bbox[1], L.bbox[1]);
          if (!sobrepoe && Math.abs(ocy - L.cy) > Math.max(L.h * 0.75, oh / 2 + L.h * 0.25)) continue;
          const gap = side === "L" ? L.bbox[0] - o.bbox[2] : o.bbox[0] - L.bbox[2];
          // o teto de distância fica em 90 alturas de linha: uma legenda em TABELA põe a coluna de símbolos
          // longe do texto (70 pt, 17,7 alturas, na cnt002), e um teto apertado apaga a legenda inteira. Quem
          // recusa o desenho do outro lado da folha é a exigência de mesma COLUNA DE ÍCONES no resgate.
          if (gap < -0.4 * lh || gap > 90 * lh) continue;
          if (gap < bd) { bd = gap; best = oi; }
        }
        if (best != null) cand.push({ li, oi: best, gap: bd });
        if (typeof process !== "undefined" && process.env && process.env.DBGA) console.log("ANC", side, JSON.stringify(L.str.slice(0,24)), "cy", L.cy.toFixed(1), "h", L.h.toFixed(1), "-> ícone", best, best!=null?JSON.stringify(icons[best].bbox.map(v=>+v.toFixed(0))):"-", "gap", bd.toFixed(1));
      });
      // one drawing belongs to one line: the vertically closest
      const owner = new Map();
      // a descrição que QUEBRA em duas linhas deixa as duas igualmente perto do centro do ícone, e o desempate
      // era arbitrário. A fileira COMEÇA na linha de cima: ancorando a de baixo, a de cima fica órfã e vai
      // procurar ícone na planta — no hard005 isso criava dois itens fantasmas, um deles ALTA · 7 un.
      for (const c of cand) {
        const o = icons[c.oi], ocy = (o.bbox[1] + o.bbox[3]) / 2, L = good[c.li];
        const d = Math.abs(ocy - L.cy) + c.gap * 0.001;
        const cur = owner.get(c.oi);
        if (!cur) { owner.set(c.oi, { c, d }); continue; }
        // EMPATE (as duas linhas à mesma altura do ícone) tem dois casos, e a MARGEM separa um do outro:
        //   mesma margem ..... são as linhas de UMA descrição quebrada: a fileira começa na de cima (hard005);
        //   margens diferentes  são textos distintos na mesma fileira: o ícone é de quem está AO LADO dele.
        //   margens diferentes  são textos distintos na mesma fileira: o ícone é de quem o DESCREVE — a linha com
        //                       mais texto. Rótulo, quantidade e anotação são curtos; descrição de material não é.
        // A primeira versão só tinha o primeiro caso e o aplicava a qualquer texto da folha na altura do ícone.
        // Medido nas públicas: na gov-piscina, "QD" escrito a 480 pt dali e 3 pt acima roubava o ícone da
        // luminária por estar EM CIMA, e "Luminária p/ lâmp. mista" e "Ponto 3P+T" sumiam; o mesmo apagava
        // "Entrada de serviço aérea" (pub32) e "Ponto de luz" (pub5). O segundo caso é o que a hard006 precisava:
        // a coluna de quantidades ("4 un", a 109 pt) ficava 0,1 pt mais perto na vertical que a descrição e levava
        // o ícone — a regra "de cima" só acertava ali por acaso, por 0,2 pt. E "o mais perto na horizontal" também
        // não serve: na gov-piscina, "750" é uma anotação colada no símbolo, a 0,5 pt, e ganharia do "Ponto 3P+T".
        const empate = Math.abs(d - cur.d) <= lh * 0.5;
        const mesmaMargem = Math.abs(c.gap - cur.c.gap) <= 1.5 * lh;
        const colado = x => x.gap < 0.5 * lh;           // texto encostado no desenho é anotação DO símbolo
        const perto = () => colado(c) !== colado(cur.c) ? !colado(c) : c.gap < cur.c.gap;
        // na descrição quebrada vale a linha de cima — a não ser que ela seja o RABO da descrição anterior. Um
        // ícone alto (26 pt na tabela da pub1, três linhas e meia) empata com "alvenaria.", fim de "…abrigado em
        // parede de / alvenaria.", e a regra "a de cima vence" entregava o ícone do eletroduto ao fim de outra
        // frase: "Eletroduto rígido roscável…" e "Caixa enterrada…" sumiam da lista de compra.
        const meio = x => comecaNoMeio(good[x.li].str);
        const deCima = () => meio(c) !== meio(cur.c) ? !meio(c) : L.cy < good[cur.c.li].cy;
        const ganha = !empate ? d < cur.d : mesmaMargem ? deCima() : perto();
        if (ganha) owner.set(c.oi, { c, d });
      }
      return [...owner.values()].map(v => v.c);
    }

    // ---------- columns: anchored lines sharing a text margin AND an icon column, with a regular pitch ----------
    function columns(pairs, side) {
      const cols = [];
      const sorted = pairs.slice().sort((a, b) => good[a.li].cy - good[b.li].cy);
      for (const p of sorted) {
        const L = good[p.li], o = icons[p.oi];
        const ixl = o.bbox[0], ixc = (o.bbox[0] + o.bbox[2]) / 2, ixr = o.bbox[2];
        const col = cols.find(c => Math.abs(c.tx - L.bbox[0]) <= 2 * lh && (Math.abs(c.ixl - ixl) <= 2.5 * lh || Math.abs(c.ixc - ixc) <= 2.5 * lh || Math.abs(c.ixr - ixr) <= 2.5 * lh) && L.cy - c.lastY <= 6 * Math.max(c.pitch || 3 * lh, 1.5 * lh));
        if (col) { col.pitch = col.items.length === 1 ? L.cy - col.lastY : Math.min(col.pitch, L.cy - col.lastY) || col.pitch; col.items.push(p); col.lastY = L.cy; }
        else cols.push({ tx: L.bbox[0], ixl, ixc, ixr, items: [p], lastY: L.cy, pitch: 0, side });
      }
      return cols;
    }
    const titles = lines.filter(l => TITLE.test(l.str) && alnum(l.str).length <= 30);
    function score(col) {
      const n = col.items.length;
      const texts = col.items.map(p => good[p.li].str);
      const lens = texts.map(t => alnum(t).length);
      const distinct = new Set(texts.map(t => t.toUpperCase())).size / n;
      const shapes = new Set(col.items.map(p => opSig(icons[p.oi]))).size / n;
      const titled = titles.some(t => { const top = Math.min(...col.items.map(p => good[p.li].bbox[1])); return t.bbox[3] <= top + lh && top - t.bbox[3] < 8 * lh && t.bbox[0] < col.tx + 30 * lh && t.bbox[2] > col.tx - 30 * lh; });
      const inFence = !fence || col.items.every(p => { const b = icons[p.oi].bbox; return b[0] >= fence[0] - lh && b[2] <= fence[2] + lh && b[1] >= fence[1] - lh && b[3] <= fence[3] + lh; });
      // a layer named LEGEND/LEGENDA/SIMBOLOGIA is the designer's own verdict on where the legend is
      const onLegendLayer = col.items.every(p => icons[p.oi].prims.some(q => LEGEND_LAYER.test(q.layer || "")));
      // símbolos DISTINTOS entre si também na coluna curta: o carimbo da pub5 passava com 3 linhas e a mesma
      // caixinha da grade como "ícone" das três. Medido nas 9 pranchas públicas com lixo: -52 lixo, 0 material perdido.
      const distintos = shapes >= 0.5;
      const ok = inFence && distinct >= 0.8 && ((deps.manual && n >= 1 && med(lens) >= 2) || (n >= 3 && med(lens) >= 10) || (titled && n >= 2 && med(lens) >= 6) || (onLegendLayer && n >= 1 && med(lens) >= 6)) && distintos;
      return { ok, n, titled, s: n * (titled ? 2 : 1) * Math.min(1, med(lens) / 12) * shapes };
    }
    let best = null;
    const DBG = typeof process !== "undefined" && process.env.DBGL;
    // QUAL LADO É A LEGENDA. A prancha tem uma convenção só (ícone à esquerda OU à direita do texto) e o lado
    // vencedor leva todas as suas colunas. O critério antigo era a SOMA das colunas aceitas de cada lado — e a
    // soma deixava três colunas de lixo passarem uma legenda de verdade. Medido na ind41 (pública): a legenda
    // titulada com os 6 materiais do lado esquerdo perdia para uma tabela de cabos (5+3) e um bloco de notas
    // numeradas (5) do lado direito, e sumia INTEIRA da lista de compra. Bastava uma ancoragem mudar para a
    // balança virar — foi o que a regra do desempate pela linha de cima (fase C) fez.
    // Agora o lado que tem coluna com TÍTULO de legenda ganha do que não tem; empate cai na soma.
    const melhorLado = (a, b) => a.titulada !== b.titulada ? a.titulada : a.tot > b.tot;
    for (const side of ["L", "R"]) {
      const all = columns(anchor(side), side).map(c => Object.assign(c, score(c)));
      if (DBG) for (const c of all) console.log(side, "col n", c.n, "ok", c.ok, "titled", c.titled, c.items.map(p => good[p.li].str.slice(0, 18)).join(" | "));
      const cols = all.filter(c => c.ok);
      // small blocks (2 items) that continue an accepted block's alignment are part of the legend too
      // o bloco pequeno só é resgatado se os ÍCONES estiverem na mesma coluna do bloco aceito: a margem do
      // TEXTO em comum não basta, e era por ela que uma dupla de linhas ancorada em desenho da PLANTA, a 170 pt
      // da legenda, entrava como legenda (hard005)
      for (const c of all) if (!c.ok && c.n >= 2 && cols.some(a => a.side === c.side && (Math.abs(a.ixc - c.ixc) <= 2.5 * lh || Math.abs(a.ixl - c.ixl) <= 2.5 * lh || Math.abs(a.ixr - c.ixr) <= 2.5 * lh))) {
        const texts = c.items.map(p => good[p.li].str); const lens = texts.map(t => alnum(t).length);
        if (med(lens) >= 8 && new Set(texts).size === texts.length) { c.ok = true; c.s = c.n * 0.5; cols.push(c); }
      }
      const tot = cols.reduce((a, c) => a + c.s, 0);
      const top = cols.reduce((a, c) => Math.max(a, c.s), 0);
      const titulada = cols.some(c => c.titled);
      const cand = { side, cols, tot, top, titulada };
      if (!best || melhorLado(cand, best)) best = cand;
    }
    if (!best || !best.cols.length) return null;

    // ---------- assemble items: anchored line opens an item; unanchored lines continue it (or are section titles) ----------
    const items = [], rects = [];
    const takenLine = new Set(best.cols.flatMap(c => c.items.map(p => p.li)));
    for (const col of best.cols) {
      const anchored = col.items.slice().sort((a, b) => good[a.li].cy - good[b.li].cy);
      const top = good[anchored[0].li].bbox[1] - lh * 0.5, bottom = good[anchored[anchored.length - 1].li].bbox[3] + 4 * lh;
      const margin = med(anchored.map(p => good[p.li].bbox[0]));
      const free = good.map((L, li) => ({ L, li })).filter(({ L, li }) => !takenLine.has(li) && L.cy > top && L.cy < bottom && Math.abs(L.bbox[0] - margin) <= 1.6 * lh);
      let colBox = null;
      const colItems = [];
      for (const p of anchored) {
        const L = good[p.li], o = icons[p.oi];
        colItems.push({ name: L.str, icon: o, lines: [L], last: L });
      }
      // gather continuation lines under each item (until the next anchored line)
      // row gap between single-line items vs leading inside a wrapped description
      const gaps = []; for (let k = 1; k < colItems.length; k++) gaps.push(colItems[k].lines[0].bbox[1] - colItems[k - 1].lines[0].bbox[3]);
      const rowGap = gaps.length ? med(gaps) : 2 * lh;
      const contMax = Math.max(0.5 * lh, Math.min(1.25 * lh, rowGap * 0.6));
      for (let k = 0; k < colItems.length; k++) {
        const it = colItems[k], next = colItems[k + 1];
        const limit = next ? next.lines[0].bbox[1] : bottom;
        for (const { L } of free.filter(f => f.L.cy > it.last.cy && f.L.bbox[1] < limit).sort((a, b) => a.L.cy - b.L.cy)) {
          const gapUp = L.bbox[1] - it.last.bbox[3];
          // wrapped descriptions are set with tight leading; anything further away is a section title or another block
          if (gapUp > contMax || STOP.test(L.str) || TITLE.test(L.str) || Math.abs(L.h - it.last.h) > 0.25 * Math.max(L.h, it.last.h)) break;
          it.name += " " + L.str; it.lines.push(L); it.last = L;
        }
      }
      for (const it of colItems) {
        if (comecaNoMeio(it.name)) { it.name = ""; it.meio = true; }
        let band = it.icon.bbox.slice(); for (const L of it.lines) band = union(band, L.bbox);
        colBox = colBox ? union(colBox, band) : band.slice();
        let nm = it.name.replace(/\s+/g, " ").trim();
        if (VO && it.lines.some(L => L.words.some(w => w.vector)) && !VO.plausible(nm)) nm = "";
        items.push({ name: nm, meio: !!it.meio, prims: it.icon.prims, bbox: it.icon.bbox, band: [band[0] - 2, band[1] - lh * 0.4, band[2] + 2, band[3] + lh * 0.4] });
      }
      // the title above belongs to the block
      const t = titles.find(t => t.bbox[3] <= colBox[1] + lh && colBox[1] - t.bbox[3] < 8 * lh && t.bbox[0] < colBox[2] && t.bbox[2] > colBox[0] - 30 * lh);
      if (t) colBox = union(colBox, t.bbox);
      rects.push([colBox[0] - lh * 0.5, colBox[1] - lh * 0.5, colBox[2] + lh * 0.5, colBox[3] + lh * 0.5]);
    }
    // glue multi-cluster icons (band = two parallel lines, icon with a separate dot…) that sit in the same cell
    const usedIcons = new Set(items.map(it => it.prims));
    const rest = icons.filter(o => !usedIcons.has(o.prims));
    for (const it of items) {
      for (const o of rest) {
        if (o._taken) continue;
        const b = it.bbox, dx = Math.max(o.bbox[0] - b[2], b[0] - o.bbox[2], 0), dy = Math.max(o.bbox[1] - b[3], b[1] - o.bbox[3], 0);
        const ocy = (o.bbox[1] + o.bbox[3]) / 2;
        if (dx < lh * 0.8 && dy < lh * 1.25 && ocy > it.band[1] - 0.6 * lh && ocy < it.band[3] + 0.6 * lh && !textBoxes.some(tb => o.bbox[0] >= tb[0] - 0.3 && o.bbox[2] <= tb[2] + 0.3 && o.bbox[1] >= tb[1] - 0.3 && o.bbox[3] <= tb[3] + 0.3)) { it.prims = it.prims.concat(o.prims); it.bbox = union(it.bbox, o.bbox); o._taken = true; }
      }
    }
    // a fileira que PERDEU o texto e cujo "ícone" é só um TRAÇO (a linha de chamada de uma nota) sai: linha em
    // branco com quantidade é pior que lixo com nome. Se o desenho ao lado é um SÍMBOLO, o item fica para
    // renomear — nas pranchas do benchmark a fileira ancorada é o rabo da descrição, e o símbolo é real.
    const soTraco = it => { let segs = 0; for (const q of it.prims) segs += q.segs.length / 4; const w = it.bbox[2] - it.bbox[0], h = it.bbox[3] - it.bbox[1];
      return it.prims.length <= 1 && segs <= 2 && (w < lh * 0.3 || h < lh * 0.3); };
    const vivos = items.filter(it => !(it.meio && !it.name && soTraco(it)));
    vivos.forEach((it, i) => { it.idx = i; it.nameAuto = !!it.name; });
    return { items: vivos, rects, side: best.side, method: best.cols.some(c => c.titled) ? "forma+título" : "forma", lh };
  }
  export { detect };
