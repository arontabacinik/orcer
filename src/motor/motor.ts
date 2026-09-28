// O MOTOR DO ORCER: lê o PDF (traços, camadas, cores, texto), acha a legenda, conta cada símbolo na planta e
// mede as rotas. Entrada: pdf.js + o documento. Saída: uma Folha por página, com os itens contados.
import type { Folha, Resultado, OpcoesContagem } from "./tipos";
import * as VOCR from "./vocr";
import * as LEGENDX from "./legendx";
import * as IDENTIDADE from "./identidade";
/* Orcer engine — vector takeoff from CAD-exported PDFs (runs in browser or node). */

  const PT_TO_MM = 25.4 / 72;
  const TEXT_LAYER_RE = /(TEXT|TEXTO|TXT|DTEXT|MTEXT|ANNO|COTA|DIM|TITULO|CARIMBO|TITLE|SELO|NOTA)/i;
  const GENERIC_LAYER_RE = /^(0|DEFPOINTS|DEFAULT|LAYER\s?0|)$/i;
  const HEADER_RE = /^\s*(LEGENDAS?|SIMBOLOGIA|SIMBOLOG[IÍ]A|CONVEN[CÇ][OÕ]ES|S[IÍ]MBOLOS|LEGENDS?|SYMBOLS?|SYMBOL LEGEND|KEY|LEYENDA)\b/i;
  const STOP_RE = /^\s*(NOTAS?|OBSERVA[CÇ][OÕ]ES|OBS\.?|CARIMBO|PROJETO|REVIS[AÃ]O|PROPRIET|RESPONS|DESENHO|FOLHA|ESCALA|DATA|CLIENTE|OBRA)\b/i;
  // vocabulary measured on real sheets (Orcer study): what the legend text says an item is
  const V_BAND = /ELETROCALHA|PERFILADO|\bLEITO\b|CANALETA|CABLE TRAY|\bTRAY\b|TRUNKING|WIREWAY|BUSWAY|LADDER RACK/;
  const V_LINE = /ELETRODUTO|E\.?\s?DUTO|EDUTO|SEAL\s?TUBO|SEALTUBE|\bCABO\b|RABICHO|BACKBONE|ALIMENTADOR|BARRAMENTO|CONDUIT|RACEWAY|\bFLEX\b|\bPIPE\b/;
  const V_POINT_FIRST = /^(CAIXA|CONDULETE|TOMADA|QUADRO|PAINEL|BOTOEIRA|LEITORA|INTERRUPTOR|BLOCO|LUMIN|PONTO DE|SENSOR|DETECTOR|RACK|NOBREAK|DISJUNTOR|DISPOSITIVO|RECEPTACLE|OUTLET|SWITCH|SOCKET|LIGHT|FIXTURE|LUMINAIRE|PANEL|JUNCTION|BREAKER|DISTRIBUTION)/;
  const V_NOTATION = /^(INDICA[CÇ][AÃ]O|N[º°O]?\s*DE PONTOS|CIRCUITOS EXISTENTES|LISTA DE ALIMENTADORES|(INS)?TALA[CÇ][AÃ]O DE TOMADAS|[A-Z]* ?PONTOS EL[EÉ]TRICOS|SOBE\b|DESCE\b|NOTA\b)/;
  const V_XREF = /J[AÁ] PREVISTA NO DESENHO|INFRAESTRUTURA ORIENTATIVA|VER (DESENHO|PROJETO) EL[- ]?\d|REPRESENTAD[AO] (NO|NA) (DESENHO|PRANCHA)/;
  // o símbolo de SUBIDA/DESCIDA da NBR 5444 também vem escrito no meio da frase: "Eletroduto que desce",
  // "…que passa subindo". É convenção de desenho — o eletroduto se compra pelo trecho, não pela seta. Medido nas
  // 253 descrições julgadas das pranchas públicas: pega 16, todas não-material, e nenhum material. (Esta régua
  // tinha sido recusada por "derrubar 4 materiais": eram os 4 "Eletroduto que sobe" julgados material enquanto
  // "que desce" estava julgado lixo — o gabarito se contradizia; re-julgado em 26/09/2026.)
  const V_NOTATION_MEIO = /\bQUE (SOBE|DESCE)\b|\bQUE PASSA (SUBINDO|DESCENDO)\b/;
  // NOTA NUMERADA ("3. Todos os quadros…", "8. As emendas…", "3- O PADRÃO REPRESENTADO…"): número, pontuação e
  // frase. Legenda nomeia material, não começa por ordinal. Medido nas 253 julgadas das públicas: pega 1, lixo, e
  // nenhum material; na v3 pega também as notas da pub11 e da ind41 que a legenda nova passou a enxergar.
  const V_NOTA_NUMERADA = /^\d{1,2} ?[.\-\u2013)] +[A-Z]/;
  const normTxt = t => (t || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().trim();
  function textKind(name) {
    const t = normTxt(name); if (!t) return null;
    if (V_NOTATION.test(t) || V_NOTATION_MEIO.test(t) || V_NOTA_NUMERADA.test(t)) return "NOTACAO";
    if (V_POINT_FIRST.test(t)) return "PONTO";
    if (V_BAND.test(t) || V_LINE.test(t)) return "ROTA";
    return null;
  }

  // ---------- small geometry helpers ----------
  function mul(m1, m2) { // same as pdf.js Util.transform
    return [m1[0] * m2[0] + m1[2] * m2[1], m1[1] * m2[0] + m1[3] * m2[1],
      m1[0] * m2[2] + m1[2] * m2[3], m1[1] * m2[2] + m1[3] * m2[3],
      m1[0] * m2[4] + m1[2] * m2[5] + m1[4], m1[1] * m2[4] + m1[3] * m2[5] + m1[5]];
  }
  function ap(m, x, y) { return [x * m[0] + y * m[2] + m[4], x * m[1] + y * m[3] + m[5]]; }
  function hex(c) {
    if (c == null) return null;
    if (typeof c === "string") return c.toLowerCase();
    const h = v => ("0" + Math.max(0, Math.min(255, Math.round(v))).toString(16)).slice(-2);
    return "#" + h(c[0]) + h(c[1]) + h(c[2]);
  }
  function inPoly(pts, x, y) {
    let c = false;
    for (let i = 0, j = pts.length - 2; i < pts.length; j = i, i += 2) {
      const xi = pts[i], yi = pts[i + 1], xj = pts[j], yj = pts[j + 1];
      if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi + 1e-12) + xi)) c = !c;
    }
    // points on the boundary count as inside
    return c || pts.some((v, k) => k % 2 === 0 && Math.abs(v - x) < 0.05 && Math.abs(pts[k + 1] - y) < 0.05);
  }
  function clipSeg(x0, y0, x1, y1, r) { // Liang–Barsky
    let t0 = 0, t1 = 1; const dx = x1 - x0, dy = y1 - y0;
    const P = [-dx, dx, -dy, dy], Q = [x0 - r[0], r[2] - x0, y0 - r[1], r[3] - y0];
    for (let k = 0; k < 4; k++) {
      if (P[k] === 0) { if (Q[k] < 0) return null; continue; }
      const t = Q[k] / P[k];
      if (P[k] < 0) { if (t > t1) return null; if (t > t0) t0 = t; } else { if (t < t0) return null; if (t < t1) t1 = t; }
    }
    return [x0 + t0 * dx, y0 + t0 * dy, x0 + t1 * dx, y0 + t1 * dy];
  }
  function inRect(b, r) { return b[0] >= r[0] && b[2] <= r[2] && b[1] >= r[1] && b[3] <= r[3]; }
  function centerIn(b, r) { const cx = (b[0] + b[2]) / 2, cy = (b[1] + b[3]) / 2; return cx >= r[0] && cx <= r[2] && cy >= r[1] && cy <= r[3]; }
  function union(a, b) { return [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])]; }
  function median(a) { if (!a.length) return 0; const s = a.slice().sort((x, y) => x - y); return s[s.length >> 1]; }

  // ---------- 1. parse a page into vector primitives + text ----------
  async function parsePage(pdfjsLib, doc, pageNum, ocGroups): Promise<Folha> {
    const page = await doc.getPage(pageNum);
    const vp = page.getViewport({ scale: 1 });
    const OPS = pdfjsLib.OPS;
    const ol = await page.getOperatorList();
    const prims = [];
    let st = { ctm: vp.transform.slice(), stroke: "#000000", fill: "#000000", lw: 1, dash: 0, clip: null };
    let pendingClip = false; let clipped = 0; let imgArea = 0; const textRuns = []; let tm = [1, 0, 0, 1, 0, 0], lm = tm.slice(), leading = 0;
    const stack = [];
    const ocStack = [];
    let pending = null; // {ops:[], pts:[] in device coords}

    const layerName = () => {
      for (let i = ocStack.length - 1; i >= 0; i--) if (ocStack[i] != null) return ocStack[i];
      return "";
    };
    const ocName = (oc) => {
      if (!oc) return null;
      let id = oc.id || (oc.ids && oc.ids[0]) || null;
      if (!id && oc.expression) { const f = JSON.stringify(oc.expression).match(/"(\d+R)"/); id = f && f[1]; }
      if (!id) return null;
      const g = ocGroups && ocGroups[id];
      let n = g ? g.name : id;
      if (n && n.indexOf("$0$") >= 0) n = n.split("$0$").pop(); // xref layers: a$0$b$0$REAL
      return n || id;
    };

    function emit(paintStroke, paintFill) {
      if (!pending || !pending.sub.length) { pending = null; return; }
      for (const sp of pending.sub) {
        if (sp.pts.length < 2 && !sp.rect) continue;
        const segs = [];
        let ops = "";
        let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, len = 0;
        const P = sp.pts;
        for (let i = 0; i < P.length; i++) {
          const p = P[i];
          if (p[0] < x0) x0 = p[0]; if (p[0] > x1) x1 = p[0];
          if (p[1] < y0) y0 = p[1]; if (p[1] > y1) y1 = p[1];
        }
        const C = st.clip;
        if (C && (x1 < C[0] || x0 > C[2] || y1 < C[1] || y0 > C[3])) { clipped++; continue; } // wholly outside the viewport
        const partial = C && (x0 < C[0] - 0.01 || x1 > C[2] + 0.01 || y0 < C[1] - 0.01 || y1 > C[3] + 0.01);
        for (let i = 1; i < P.length; i++) {
          let a = P[i - 1], b = P[i];
          if (partial) { const r = clipSeg(a[0], a[1], b[0], b[1], C); if (!r) continue; a = [r[0], r[1]]; b = [r[2], r[3]]; }
          const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
          if (l > 1e-6) { segs.push(a[0], a[1], b[0], b[1]); len += l; }
        }
        if (partial) {
          if (!segs.length) { clipped++; continue; }
          x0 = Infinity; y0 = Infinity; x1 = -Infinity; y1 = -Infinity;
          for (let i = 0; i < segs.length; i += 2) { const x = segs[i], y = segs[i + 1]; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
        }
        ops = sp.ops;
        prims.push({
          i: prims.length, layer: pending.layer, stroke: paintStroke ? st.stroke : null,
          fill: paintFill ? st.fill : null, lw: st.lw, dash: st.dash,
          ops: partial ? sp.ops + "~" : sp.ops, segs, len, arcExtra: partial ? 0 : (sp.arcExtra || 0), bbox: [x0, y0, x1, y1], closed: sp.closed, pts: [].concat(...P)
        });
      }
      pending = null;
    }

    const fn = ol.fnArray, args = ol.argsArray;
    for (let k = 0; k < fn.length; k++) {
      const f = fn[k], a = args[k];
      switch (f) {
        case OPS.save: stack.push(Object.assign({}, st)); break;
        case OPS.restore: if (stack.length) st = stack.pop(); break;
        case OPS.transform: st.ctm = mul(st.ctm, a); break;
        case OPS.paintFormXObjectBegin:
          stack.push(Object.assign({}, st));
          if (a && a[0]) st.ctm = mul(st.ctm, a[0]);
          if (a && a[1] && a[1].length === 4) { // form BBox clips its content
            const bb = a[1], q = [ap(st.ctm, bb[0], bb[1]), ap(st.ctm, bb[2], bb[1]), ap(st.ctm, bb[2], bb[3]), ap(st.ctm, bb[0], bb[3])];
            const b = [Math.min(...q.map(v => v[0])), Math.min(...q.map(v => v[1])), Math.max(...q.map(v => v[0])), Math.max(...q.map(v => v[1]))];
            st.clip = st.clip ? [Math.max(st.clip[0], b[0]), Math.max(st.clip[1], b[1]), Math.min(st.clip[2], b[2]), Math.min(st.clip[3], b[3])] : b;
          }
          break;
        case OPS.paintFormXObjectEnd: if (stack.length) st = stack.pop(); break;
        case OPS.setStrokeRGBColor: st.stroke = hex(a[0] != null && typeof a[0] === "string" ? a[0] : a); break;
        case OPS.setFillRGBColor: st.fill = hex(a[0] != null && typeof a[0] === "string" ? a[0] : a); break;
        case OPS.setLineWidth: st.lw = a[0]; break;
        case OPS.beginText: tm = [1, 0, 0, 1, 0, 0]; lm = tm.slice(); break;
        case OPS.setTextMatrix: tm = (a.length === 1 ? a[0] : a).slice(0, 6); lm = tm.slice(); break;
        case OPS.moveText: lm = mul(lm, [1, 0, 0, 1, a[0], a[1]]); tm = lm.slice(); break;
        case OPS.setLeadingMoveText: leading = -a[1]; lm = mul(lm, [1, 0, 0, 1, a[0], a[1]]); tm = lm.slice(); break;
        case OPS.setLeading: leading = a[0]; break;
        case OPS.nextLine: lm = mul(lm, [1, 0, 0, 1, 0, -leading]); tm = lm.slice(); break;
        case OPS.nextLineShowText: case OPS.nextLineSetSpacingShowText: lm = mul(lm, [1, 0, 0, 1, 0, -leading]); tm = lm.slice(); // fallthrough
        case OPS.showText: case OPS.showSpacedText: {
          const o = ap(mul(st.ctm, tm), 0, 0); textRuns.push({ x: o[0], y: o[1], clip: st.clip }); break;
        }
        case OPS.setFillColorN: st.fill = "#pattern"; break;   // remaining N-colours are patterns / hatches
        case OPS.setStrokeColorN: st.stroke = "#pattern"; break;
        case OPS.paintImageXObject: case OPS.paintInlineImageXObject: case OPS.paintImageMaskXObject: case OPS.paintJpegXObject: {
          const q = [ap(st.ctm, 0, 0), ap(st.ctm, 1, 0), ap(st.ctm, 1, 1), ap(st.ctm, 0, 1)];
          const w = Math.max(...q.map(v => v[0])) - Math.min(...q.map(v => v[0])), h = Math.max(...q.map(v => v[1])) - Math.min(...q.map(v => v[1]));
          imgArea += w * h; break;
        }
        case OPS.setDash: st.dash = (a[0] && a[0].length) ? 1 : 0; break;
        case OPS.setGState:
          if (a && a[0]) for (const kv of a[0]) {
            if (kv[0] === "LW") st.lw = kv[1];
            if (kv[0] === "D") st.dash = (kv[1] && kv[1][0] && kv[1][0].length) ? 1 : 0;
          }
          break;
        case OPS.beginMarkedContentProps:
          ocStack.push(a && a[0] === "OC" ? ocName(a[1]) : null); break;
        case OPS.beginMarkedContent: ocStack.push(null); break;
        case OPS.endMarkedContent: ocStack.pop(); break;
        case OPS.constructPath: {
          if (!pending) pending = { sub: [], layer: layerName(), stroke: st.stroke, fill: st.fill, lw: st.lw, dash: st.dash };
          const pops = a[0], pa = a[1];
          let j = 0, cur = null, cx = 0, cy = 0, sx = 0, sy = 0;
          const m = st.ctm;
          const push = (x, y) => { cur.pts.push(ap(m, x, y)); };
          for (const op of pops) {
            if (op === OPS.moveTo) {
              cx = pa[j++]; cy = pa[j++]; sx = cx; sy = cy;
              cur = { ops: "M", pts: [], closed: false }; pending.sub.push(cur); push(cx, cy);
            } else if (op === OPS.lineTo) {
              if (!cur) { cur = { ops: "M", pts: [], closed: false }; pending.sub.push(cur); push(cx, cy); }
              cx = pa[j++]; cy = pa[j++]; cur.ops += "L"; push(cx, cy);
            } else if (op === OPS.curveTo || op === OPS.curveTo2 || op === OPS.curveTo3) {
              let x1, y1, x2, y2, x3, y3;
              if (op === OPS.curveTo) { x1 = pa[j++]; y1 = pa[j++]; x2 = pa[j++]; y2 = pa[j++]; x3 = pa[j++]; y3 = pa[j++]; }
              else if (op === OPS.curveTo2) { x1 = cx; y1 = cy; x2 = pa[j++]; y2 = pa[j++]; x3 = pa[j++]; y3 = pa[j++]; }
              else { x1 = pa[j++]; y1 = pa[j++]; x2 = pa[j++]; y2 = pa[j++]; x3 = x2; y3 = y2; }
              if (!cur) { cur = { ops: "M", pts: [], closed: false }; pending.sub.push(cur); push(cx, cy); }
              { // 4 vertices keep the shape signature scale-invariant; true arc length is tracked separately
                let px = cx, py = cy, fine = 0, coarse = 0, qx = cx, qy = cy;
                for (let t = 1; t <= 16; t++) {
                  const u = t / 16, v = 1 - u;
                  const X = v * v * v * cx + 3 * v * v * u * x1 + 3 * v * u * u * x2 + u * u * u * x3, Y = v * v * v * cy + 3 * v * v * u * y1 + 3 * v * u * u * y2 + u * u * u * y3;
                  const a1 = ap(m, px, py), a2 = ap(m, X, Y); fine += Math.hypot(a2[0] - a1[0], a2[1] - a1[1]); px = X; py = Y;
                  if (t % 4 === 0) { const b1 = ap(m, qx, qy); push(X, Y); const b2 = cur.pts[cur.pts.length - 1]; coarse += Math.hypot(b2[0] - b1[0], b2[1] - b1[1]); qx = X; qy = Y; }
                }
                cur.arcExtra = (cur.arcExtra || 0) + (fine - coarse);
              }
              cur.ops += "C"; cx = x3; cy = y3;
            } else if (op === OPS.closePath) {
              if (cur) { cur.ops += "Z"; cur.closed = true; push(sx, sy); cx = sx; cy = sy; }
            } else if (op === OPS.rectangle) {
              const x = pa[j++], y = pa[j++], w = pa[j++], h = pa[j++];
              cur = { ops: "R", pts: [], closed: true, rect: true }; pending.sub.push(cur);
              push(x, y); push(x + w, y); push(x + w, y + h); push(x, y + h); push(x, y);
              cur = null; cx = x; cy = y;
            }
          }
          break;
        }
        case OPS.stroke: case OPS.closeStroke: emit(true, false); break;
        case OPS.fill: case OPS.eoFill: emit(false, true); break;
        case OPS.fillStroke: case OPS.eoFillStroke: case OPS.closeFillStroke: case OPS.closeEOFillStroke: emit(true, true); break;
        case OPS.clip: case OPS.eoClip: pendingClip = true; break;
        case OPS.endPath:
          if (pendingClip && pending && pending.sub.length) {
            let b = null;
            for (const sp of pending.sub) for (const p of sp.pts) { if (!b) b = [p[0], p[1], p[0], p[1]]; else { if (p[0] < b[0]) b[0] = p[0]; if (p[0] > b[2]) b[2] = p[0]; if (p[1] < b[1]) b[1] = p[1]; if (p[1] > b[3]) b[3] = p[1]; } }
            if (b) st.clip = st.clip ? [Math.max(st.clip[0], b[0]), Math.max(st.clip[1], b[1]), Math.min(st.clip[2], b[2]), Math.min(st.clip[3], b[3])] : b;
          }
          pendingClip = false; pending = null; break;
        default: break;
      }
    }

    // text
    const texts = [], seenTxt = new Set();
    try {
      const tc = await page.getTextContent();
      for (const it of tc.items) {
        if (!it.str || !it.str.trim()) continue;
        const t = mul(vp.transform, it.transform);
        const h = Math.hypot(t[2], t[3]) || 1;
        const ang = Math.atan2(t[1], t[0]);
        const w = (it.width || it.str.length * h * 0.5);
        const x = t[4], y = t[5];
        const ex = x + Math.cos(ang) * w, ey = y + Math.sin(ang) * w;
        // text grows "up" from baseline: approx bbox
        const ux = Math.sin(ang) * h, uy = -Math.cos(ang) * h;
        const xs = [x, ex, x + ux, ex + ux], ys = [y, ey, y + uy, ey + uy];
        const key = it.str + "|" + Math.round(x * 4) + "|" + Math.round(y * 4);
        if (seenTxt.has(key)) continue; seenTxt.add(key);
        texts.push({ str: it.str, h, ang, ox: x, oy: y, bbox: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)] });
      }
    } catch (e) { /* no text layer */ }

    // text drawn inside clipped views: getTextContent ignores clipping — match each text to the run that drew it
    if (textRuns.some(r => r.clip)) {
      const keep = texts.filter(t => {
        const ox = t.ox, oy = t.oy; let bd = Infinity;
        const same = textRuns.filter(r => Math.abs(r.y - oy) <= Math.max(1, t.h * 0.3) && ox - r.x >= -1);
        for (const r of same) bd = Math.min(bd, ox - r.x);
        const cands = same.filter(r => ox - r.x <= bd + 0.5);
        if (!cands.length) return true;
        const cx = (t.bbox[0] + t.bbox[2]) / 2, cy = (t.bbox[1] + t.bbox[3]) / 2;
        // the same text can be drawn twice (two views of one sheet): visible if ANY of its runs shows it
        return cands.some(r => { const c = r.clip; return !c || (cx >= c[0] - 1 && cx <= c[2] + 1 && cy >= c[1] - 1 && cy <= c[3] + 1); });
      });
      texts.length = 0; texts.push(...keep);
    }
    // wipeouts: a white fill drawn later hides what is fully under it
    const masks = prims.filter(p => p.fill === "#ffffff" && p.closed && (p.bbox[2] - p.bbox[0]) * (p.bbox[3] - p.bbox[1]) > 4);
    let hidden = 0;
    if (masks.length && masks.length < 20000) {
      const g = new Map(), cs = 40;
      for (const p of prims) { const k = Math.floor(p.bbox[0] / cs) * 100003 + Math.floor(p.bbox[1] / cs); let a = g.get(k); if (!a) { a = []; g.set(k, a); } a.push(p); }
      for (const m of masks) {
        const poly = m.pts, B = m.bbox;
        for (let gx = Math.floor(B[0] / cs); gx <= Math.floor(B[2] / cs); gx++) for (let gy = Math.floor(B[1] / cs); gy <= Math.floor(B[3] / cs); gy++) {
          const a = g.get(gx * 100003 + gy); if (!a) continue;
          for (const p of a) {
            if (p.i >= m.i || p.hidden || p === m) continue;
            const b = p.bbox; if (b[0] < B[0] || b[2] > B[2] || b[1] < B[1] || b[3] > B[3]) continue;
            if (inPoly(poly, b[0], b[1]) && inPoly(poly, b[2], b[3]) && inPoly(poly, b[0], b[3]) && inPoly(poly, b[2], b[1])) { p.hidden = true; hidden++; }
          }
        }
      }
    }
    const visible = hidden ? prims.filter(p => !p.hidden) : prims;
    visible.forEach((p, k) => p.i = k);
    const raster = imgArea > vp.width * vp.height * 0.3 && visible.length < 400;
    return { pageNum, width: vp.width, height: vp.height, rotation: vp.rotation, prims: visible, texts, page, clipped, hidden, raster, imgArea };
  }

  // ---------- spatial clustering (union-find with grid) ----------
  function cluster(items, tol) {
    const n = items.length, par = new Int32Array(n);
    for (let i = 0; i < n; i++) par[i] = i;
    const find = i => { while (par[i] !== i) { par[i] = par[par[i]]; i = par[i]; } return i; };
    const cell = Math.max(tol * 4, 4);
    const grid = new Map();
    for (let i = 0; i < n; i++) {
      const b = items[i].bbox;
      const gx0 = Math.floor((b[0] - tol) / cell), gx1 = Math.floor((b[2] + tol) / cell);
      const gy0 = Math.floor((b[1] - tol) / cell), gy1 = Math.floor((b[3] + tol) / cell);
      if ((gx1 - gx0 + 1) * (gy1 - gy0 + 1) > 400) continue; // huge prims (frames) never merge
      for (let gx = gx0; gx <= gx1; gx++) for (let gy = gy0; gy <= gy1; gy++) {
        const key = gx * 100003 + gy;
        let arr = grid.get(key);
        if (!arr) { arr = []; grid.set(key, arr); }
        for (const j of arr) {
          const c = items[j].bbox;
          if (b[0] - tol <= c[2] && c[0] - tol <= b[2] && b[1] - tol <= c[3] && c[1] - tol <= b[3]) {
            const ri = find(i), rj = find(j); if (ri !== rj) par[ri] = rj;
          }
        }
        arr.push(i);
      }
    }
    const groups = new Map();
    for (let i = 0; i < n; i++) { const r = find(i); let g = groups.get(r); if (!g) { g = []; groups.set(r, g); } g.push(items[i]); }
    return [...groups.values()].map(mkObj);
  }
  function mkObj(ps) {
    let b = ps[0].bbox.slice();
    for (const p of ps) b = union(b, p.bbox);
    return { prims: ps, bbox: b };
  }

  // Affine-invariant signature: multiset of (op-string, stroke, fill) per primitive.
  function opSig(obj) {
    return obj.prims.map(p => p.ops + "|" + (p.stroke || "-") + "|" + (p.fill || "-")).sort().join(";");
  }
  function colorSig(obj) {
    const s = new Set(); for (const p of obj.prims) { if (p.stroke) s.add("s" + p.stroke); if (p.fill) s.add("f" + p.fill); }
    return [...s].sort().join(",");
  }
  // shape descriptor (similarity-invariant): sorted normalised radii of primitive centres
  function shapeDesc(obj) {
    const cs = obj.prims.map(p => [(p.bbox[0] + p.bbox[2]) / 2, (p.bbox[1] + p.bbox[3]) / 2, p.len]);
    const cx = cs.reduce((s, c) => s + c[0], 0) / cs.length, cy = cs.reduce((s, c) => s + c[1], 0) / cs.length;
    const r = cs.map(c => Math.hypot(c[0] - cx, c[1] - cy));
    const tl = cs.reduce((s, c) => s + c[2], 0) || 1;
    const rm = Math.max(...r) || 1;
    return { r: r.map(v => v / rm).sort((a, b) => a - b), l: cs.map(c => c[2] / tl).sort((a, b) => a - b) };
  }
  function descDist(a, b) {
    if (a.r.length !== b.r.length) return 9;
    let d = 0; for (let i = 0; i < a.r.length; i++) d += Math.abs(a.r[i] - b.r[i]) + Math.abs(a.l[i] - b.l[i]);
    return d / a.r.length;
  }
  function objSize(o) { return Math.hypot(o.bbox[2] - o.bbox[0], o.bbox[3] - o.bbox[1]); }

  // ---------- 2. legend detection ----------
  function isTextPrim(p) { return TEXT_LAYER_RE.test(p.layer || ""); }

  function detectLegend(sheet) {
    const W = sheet.width, H = sheet.height;
    const isHeader = t => t.h < H * 0.05 && (HEADER_RE.test(t.str) || (/\b(LEGENDAS?|LEGENDS?|SIMBOLOGIA|SYMBOLS)\b/i.test(t.str) && t.str.trim().split(/\s+/).length <= 4));
    let headers = sheet.texts.filter(isHeader);
    const VO = VOCR;
    let strokeHeader = false;
    if (!headers.length && VO) {
      // header drawn as strokes (SHX): look for word-shaped stroke clusters that read LEGENDA / SIMBOLOGIA
      const cand = sheet.prims.filter(p => p.stroke && !p.fill && p.len > 0 && pdiag(p) < H * 0.03);
      if (cand.length < 150000) {
        const words = cluster(cand, Math.max(0.6, Math.min(W, H) * 0.004)).filter(o => { const w = o.bbox[2] - o.bbox[0], h = o.bbox[3] - o.bbox[1]; return o.prims.length >= 6 && o.prims.length <= 60 && ((w > h * 3 && h < H * 0.03) || (h > w * 3 && w < W * 0.03)); });
        for (const o of words.slice(0, 4000)) {
          const r = VO.readBlock(o.prims);
          if (r && r.plausible && r.score < 0.1 && HEADER_RE.test(r.text)) { const h = Math.min(o.bbox[2] - o.bbox[0], o.bbox[3] - o.bbox[1]); headers.push({ str: r.text, h, bbox: o.bbox }); }
        }
        strokeHeader = headers.length > 0;
      }
    }
    if (headers.length) {
      headers.sort((a, b) => b.h - a.h);
      const hmax = headers[0].h;
      headers = headers.filter(h => h.h >= hmax * 0.6);
      const regions = [];
      for (const hd of headers) {
        if (regions.some(r => centerIn(hd.bbox, r.rect))) continue;
        const others = headers.filter(o => o !== hd);
        const r = regionFor(hd, others);
        if (r) regions.push({ rect: r, header: hd.str.trim() });
      }
      if (regions.length) {
        let u = regions[0].rect.slice(); for (const r of regions) u = union(u, r.rect);
        return { rect: regions[0].rect, rects: regions.map(r => r.rect), header: regions.map(r => r.header).join(" · "), method: strokeHeader ? "traço" : "texto" };
      }
    }
    function regionFor(hd, others) {
      // candidate frames: rectangles (or big closed polys) containing the header
      let best = null;
      for (const p of sheet.prims) {
        if (!p.closed || p.ops.replace(/[MZ]/g, "").length > 5) continue;
        const b = p.bbox, area = (b[2] - b[0]) * (b[3] - b[1]);
        if (area < 100 || area > W * H * 0.4) continue;
        if (b[0] <= hd.bbox[0] + 1 && b[2] >= hd.bbox[2] - 1 && b[1] <= hd.bbox[1] + 1 && b[3] >= hd.bbox[3] - 1) {
          if (!best || area < best.area) best = { area, b };
        }
      }
      let region;
      const lh = hd.h;
      // another legend header to the right bounds this one
      let xLim = Infinity;
      for (const o of others) if (o.bbox[0] > hd.bbox[2] + lh && Math.abs((o.bbox[1] + o.bbox[3]) / 2 - (hd.bbox[1] + hd.bbox[3]) / 2) < H * 0.35) xLim = Math.min(xLim, o.bbox[0] - lh * 0.5);
      if (best && best.b[2] > xLim + lh) best = null; // a frame spanning two legends is not this legend's frame
      if (best) region = best.b.slice();
      else {
        // grow from the text lines under the header
        region = [hd.bbox[0] - lh * 8, hd.bbox[1], Math.min(hd.bbox[2] + lh * 40, xLim), hd.bbox[3]];
      }
      // lines of text below header inside region, stop at next section title or big gap
      const below = sheet.texts.filter(t => t !== hd && t.bbox[1] >= hd.bbox[1] && t.bbox[0] >= region[0] - 1 && t.bbox[2] <= Math.min(region[2] + lh * 40, xLim) && t.bbox[0] <= region[2])
        .sort((a, b) => a.bbox[1] - b.bbox[1]);
      let bottom = hd.bbox[3], right = hd.bbox[2];
      const gapMax = best ? Infinity : lh * 6;
      for (const t of below) {
        if (STOP_RE.test(t.str) && t.bbox[1] > hd.bbox[3]) break;
        if (others.includes(t) && t.bbox[1] > hd.bbox[3] + lh) break; // the next legend starts here
        if (t.bbox[1] - bottom > gapMax) break;
        if (best && t.bbox[3] > region[3]) break;
        bottom = Math.max(bottom, t.bbox[3]); right = Math.max(right, t.bbox[2]);
      }
      if (strokeHeader) {
        // no frame and no text: follow the ink below the header until a big gap
        const below2 = sheet.prims.filter(p => p.bbox[1] >= hd.bbox[3] && p.bbox[0] >= region[0] && p.bbox[2] <= region[2] && pdiag(p) < H * 0.05 && (!best || p.bbox[3] <= region[3] + 0.5)).sort((a, b) => a.bbox[1] - b.bbox[1]);
        for (const p of below2) { if (p.bbox[1] - bottom > lh * 6) break; bottom = Math.max(bottom, p.bbox[3]); right = Math.max(right, p.bbox[2]); }
      }
      region[1] = hd.bbox[1] - lh * 0.5;
      region[3] = Math.min(best ? region[3] : Infinity, bottom + lh * 1.2);
      if (!best) {
        region[2] = Math.min(right + lh, xLim);
        // icons aligned at the far right of the text (right-hand legends): take them in if they sit on the text rows
        const rows = below.filter(t => t.bbox[3] <= region[3]).map(t => (t.bbox[1] + t.bbox[3]) / 2);
        let r2 = region[2];
        for (const p of sheet.prims) {
          const cx = (p.bbox[0] + p.bbox[2]) / 2, cy = (p.bbox[1] + p.bbox[3]) / 2;
          if (cx <= region[2] || cx > Math.min(region[2] + lh * 40, xLim) || cy < region[1] || cy > region[3]) continue;
          if (pdiag(p) > lh * 4 || !rows.some(y => Math.abs(y - cy) < lh * 0.9)) continue;
          r2 = Math.max(r2, p.bbox[2] + lh * 0.5);
        }
        region[2] = r2;
      }
      return region;
    }
    // Geometric fallback: a vertical column of small, distinct, coloured symbols.
    const cand = sheet.prims.filter(p => !isTextPrim(p) && (p.bbox[2] - p.bbox[0]) < W * 0.05 && (p.bbox[3] - p.bbox[1]) < H * 0.05);
    const objs = cluster(cand, 0.8).filter(o => objSize(o) > 5 && objSize(o) < W * 0.05 && o.prims.length < 60);
    const cols = new Map();
    const addCol = (key, o) => { let a = cols.get(key); if (!a) { a = []; cols.set(key, a); } if (!a.includes(o)) a.push(o); };
    for (const o of objs) {
      const kl = Math.round(o.bbox[0] / 4), kc = Math.round((o.bbox[0] + o.bbox[2]) / 8);
      for (const d of [-1, 0, 1]) { addCol("l" + (kl + d), o); addCol("c" + (kc + d), o); }
    }
    const coloured = o => o.prims.some(p => (p.stroke && !/^#(0{6}|([0-9a-f])\2{5}|(\w\w)\3\3)$/i.test(p.stroke)) || (p.fill && !/^#(0{6}|(\w\w)\2\2)$/i.test(p.fill)));
    let bestCol = null;
    for (const [, all] of cols) {
      if (all.length < 4) continue;
      all.sort((a, b) => (a.bbox[1] + a.bbox[3]) - (b.bbox[1] + b.bbox[3]));
      const cy = o => (o.bbox[1] + o.bbox[3]) / 2;
      const g0 = []; for (let i = 1; i < all.length; i++) g0.push(cy(all[i]) - cy(all[i - 1]));
      const mg0 = median(g0.filter(g => g > 1));
      if (!(mg0 > 0)) continue;
      // longest contiguous run with legend rhythm
      let runs = [[all[0]]];
      for (let i = 1; i < all.length; i++) { if (cy(all[i]) - cy(all[i - 1]) <= mg0 * 1.9) runs[runs.length - 1].push(all[i]); else runs.push([all[i]]); }
      for (const arr of runs) {
        if (arr.length < 4) continue;
        const sigs = new Set(arr.map(o => opSig(o)));
        if (sigs.size < 4) continue;
        const gaps = []; for (let i = 1; i < arr.length; i++) gaps.push(cy(arr[i]) - cy(arr[i - 1]));
        const mg = median(gaps);
        if (mg <= 0) continue;
        const reg = gaps.filter(g => Math.abs(g - mg) < mg * 0.5).length / gaps.length;
        const col = arr.filter(coloured).length / arr.length;
        if (col < 0.5) continue;
        const csigs = new Set(arr.filter(coloured).map(o => opSig(o))).size;
        // legend icons sit in clear space: count clutter just left of and between the icons
        let bx = arr[0].bbox.slice(); for (const o of arr) bx = union(bx, o.bbox);
        const pad = Math.max(8, median(arr.map(objSize)) * 1.5);
        const zone = [bx[0] - pad * 2, bx[1], bx[2] + pad * 0.3, bx[3]];
        const mine = new Set(); for (const o of arr) for (const p of o.prims) mine.add(p);
        let clutter = 0;
        for (const p of cand) { if (mine.has(p)) continue; const cx = (p.bbox[0] + p.bbox[2]) / 2, cy = (p.bbox[1] + p.bbox[3]) / 2; if (cx >= zone[0] && cx <= zone[2] && cy >= zone[1] && cy <= zone[3]) clutter++; }
        const score = csigs * reg * (1 + 2 * col) / (1 + clutter / arr.length);
        if (!bestCol || score > bestCol.score) bestCol = { score, arr, mg };
      }
    }
    if (bestCol && bestCol.score >= 3) {
      let b = bestCol.arr[0].bbox.slice(); for (const o of bestCol.arr) b = union(b, o.bbox);
      // extend along the column: rows of other widths (route swatches) continue the rhythm
      const cx0 = b[0] - bestCol.mg, cx1 = b[2] + bestCol.mg;
      const medSz = median(bestCol.arr.map(objSize));
      let added = 0;
      for (let grew = true; grew && added < bestCol.arr.length;) {
        grew = false;
        for (const o of objs) {
          if (o.bbox[0] < cx0 || o.bbox[2] > cx1 + bestCol.mg * 2 || objSize(o) < medSz * 0.6 || !coloured(o)) continue;
          if (added >= bestCol.arr.length) break;
          if ((o.bbox[1] > b[3] && o.bbox[1] - b[3] < bestCol.mg * 1.3) || (o.bbox[3] < b[1] && b[1] - o.bbox[3] < bestCol.mg * 1.3)) { b = union(b, o.bbox); grew = true; added++; }
        }
      }
      const w = b[2] - b[0];
      return { rect: [b[0] - 4, b[1] - bestCol.mg * 0.5, b[2] + Math.max(w * 8, 160), b[3] + bestCol.mg * 0.5], header: null, method: "geometria" };
    }
    return null;
  }

  // ---------- 3. legend items ----------
  function readLegend(sheet, rect): any[] {
    const rw = rect[2] - rect[0], rh = rect[3] - rect[1];
    const inside = sheet.prims.filter(p => inRect(p.bbox, [rect[0] - 1, rect[1] - 1, rect[2] + 1, rect[3] + 1]));
    // drop frame / grid lines
    let body = inside.filter(p => (p.bbox[2] - p.bbox[0]) < rw * 0.55 && (p.bbox[3] - p.bbox[1]) < rh * 0.5 && !isTextPrim(p));
    let texts = sheet.texts.filter(t => centerIn(t.bbox, rect));
    const VOr = VOCR;
    if (!texts.length && VOr) {
      // stroke text (SHX): neutral-coloured strokes that read as words become text lines
      const neutralP = p => !p.fill && p.stroke && /^#(([0-9a-f]{2})\2\2)$/i.test(p.stroke);
      const strokes = body.filter(neutralP);
      const vt = [], used = new Set();
      if (strokes.length && strokes.length < 20000) {
        const hs = strokes.map(p => p.bbox[3] - p.bbox[1]).filter(h => h > 0).sort((a, b) => a - b);
        const capGuess = hs.length ? hs[Math.floor(hs.length * 0.8)] : 4;
        for (const o of cluster(strokes, Math.max(0.3, capGuess * 0.45))) {
          const w = o.bbox[2] - o.bbox[0], h = o.bbox[3] - o.bbox[1];
          if (h < capGuess * 0.5 && w < capGuess * 1.5) continue; // hyphens, dots: handled with their line
          const r = VOr.readBlock(o.prims, { angles: [0] });
          const clean = r && r.text ? r.text.replace(/[?\s]/g, "") : "";
          if (r && r.plausible && clean.length >= 1 && (r.score < (clean.length >= 2 ? 0.1 : 0.04))) { vt.push({ str: r.text.replace(/\?/g, "").trim(), bbox: o.bbox, h, vector: true }); for (const p of o.prims) used.add(p); }
        }
        // small marks sitting inside a text row (hyphens, dots) are text too
        for (const p of strokes) if (!used.has(p) && pdiag(p) < capGuess * 1.3 && vt.some(t => { const cy = (p.bbox[1] + p.bbox[3]) / 2; return cy >= t.bbox[1] - capGuess * 0.3 && cy <= t.bbox[3] + capGuess * 0.3 && p.bbox[0] >= t.bbox[0] - capGuess * 3 && p.bbox[2] <= t.bbox[2] + capGuess * 3; })) used.add(p);
      }
      if (vt.length) { texts = vt; body = body.filter(p => !used.has(p)); }
    }
    const th = median(texts.map(t => t.h)) || 6;
    // text-left edge per line: swatches live left of the description text
    let objs = cluster(body, Math.max(0.6, th * 0.12));
    if (texts.length) {
      const anchored = textAnchoredLegend(texts, objs, th, rect);
      if (anchored && anchored.length) return anchored;
    }
    // ignore objects that are just vectorised glyphs of real text (overlap text boxes)
    objs = objs.filter(o => !texts.some(t => t.bbox[0] - 1 <= o.bbox[0] && t.bbox[2] + 1 >= o.bbox[2] && t.bbox[1] - 1 <= o.bbox[1] && t.bbox[3] + 1 >= o.bbox[3]));
    if (!objs.length) return [];
    // swatch column: objects whose left edge is in the leftmost band
    const lefts = objs.map(o => o.bbox[0]);
    const minL = Math.min(...lefts);
    const textLeft = texts.length ? median(texts.filter(t => !HEADER_RE.test(t.str)).map(t => t.bbox[0])) : Infinity;
    let colLimit = Math.min(textLeft - 0.5, minL + Math.max(th * 10, rw * 0.35));
    if (!isFinite(textLeft)) {
      // icons | gap | description (curves): the column ends at the first clear vertical gap
      const iv = objs.map(o => [o.bbox[0], o.bbox[2]]).sort((a, b) => a[0] - b[0]);
      let reach = iv[0][1];
      const gapMin = Math.max(2, rw * 0.015);
      for (const [a, b] of iv) { if (a - reach > gapMin && reach - minL > 3) { colLimit = reach + 0.1; break; } reach = Math.max(reach, b); }
    }
    let sw = objs.filter(o => o.bbox[0] <= colLimit && o.bbox[2] <= (isFinite(textLeft) ? textLeft + th : Infinity));
    // merge objects on the same row (a swatch can be several clusters)
    sw.sort((a, b) => (a.bbox[1] + a.bbox[3]) - (b.bbox[1] + b.bbox[3]));
    const rows = [];
    for (const o of sw) {
      const cy = (o.bbox[1] + o.bbox[3]) / 2;
      const r = rows.find(r => cy >= r.bbox[1] - th * 0.3 && cy <= r.bbox[3] + th * 0.3);
      if (r) { r.objs.push(o); r.bbox = union(r.bbox, o.bbox); } else rows.push({ objs: [o], bbox: o.bbox.slice() });
    }
    rows.sort((a, b) => a.bbox[1] - b.bbox[1]);
    // merge rows that have no description of their own into a close neighbour (multi-part swatches)
    if (!texts.length && rows.length > 2) {
      const cs = rows.map(r => (r.bbox[1] + r.bbox[3]) / 2);
      const pitch = median(cs.slice(1).map((c, i) => c - cs[i]).filter(d => d > th * 0.5)) || th * 3;
      for (let i = 0; i < rows.length - 1; i++) {
        const ca = (rows[i].bbox[1] + rows[i].bbox[3]) / 2, cb = (rows[i + 1].bbox[1] + rows[i + 1].bbox[3]) / 2;
        if (cb - ca < pitch * 0.5) { rows[i].objs.push(...rows[i + 1].objs); rows[i].bbox = union(rows[i].bbox, rows[i + 1].bbox); rows.splice(i + 1, 1); i--; }
      }
    }
    const descTexts = texts.filter(t => !HEADER_RE.test(t.str));
    const hasOwnText = r => descTexts.some(t => {
      const ty = (t.bbox[1] + t.bbox[3]) / 2;
      let bestR = null, bd = Infinity;
      for (const q of rows) { const d = Math.abs(ty - (q.bbox[1] + q.bbox[3]) / 2); if (d < bd) { bd = d; bestR = q; } }
      return bestR === r;
    });
    for (let changed = true; changed;) {
      changed = false;
      for (let i = 0; i < rows.length - 1; i++) {
        const a = rows[i], b = rows[i + 1];
        const gap = b.bbox[1] - a.bbox[3];
        const hov = Math.min(a.bbox[2], b.bbox[2]) - Math.max(a.bbox[0], b.bbox[0]) > -th * 0.5;
        const lim = texts.length ? th * 1.2 : th * 0.6;
        if (hov && gap < lim && (!texts.length || !hasOwnText(a) || !hasOwnText(b))) {
          a.objs.push(...b.objs); a.bbox = union(a.bbox, b.bbox); rows.splice(i + 1, 1); changed = true; break;
        }
      }
    }
    // band = between midpoints of consecutive swatches
    const items = rows.map((r, i) => {
      const cy = (r.bbox[1] + r.bbox[3]) / 2;
      const prev = i ? (rows[i - 1].bbox[1] + rows[i - 1].bbox[3]) / 2 : rect[1];
      const next = i < rows.length - 1 ? (rows[i + 1].bbox[1] + rows[i + 1].bbox[3]) / 2 : rect[3];
      const top = i ? (prev + cy) / 2 : Math.max(rect[1], r.bbox[1] - th * 1.2);
      const bot = i < rows.length - 1 ? (cy + next) / 2 : Math.min(rect[3], r.bbox[3] + th * 1.6);
      let desc = texts.filter(t => { const ty = (t.bbox[1] + t.bbox[3]) / 2; return ty >= top && ty < bot && t.bbox[0] >= r.bbox[2] - th && !HEADER_RE.test(t.str); })
        .sort((a, b) => { const ya = (a.bbox[1] + a.bbox[3]) / 2, yb = (b.bbox[1] + b.bbox[3]) / 2; return Math.abs(ya - yb) > Math.max(1, th * 0.5) ? ya - yb : a.bbox[0] - b.bbox[0]; }).reduce((acc, t, k, arr) => { const prev = arr[k - 1]; const tight = prev && t.vector && Math.abs((prev.bbox[1] + prev.bbox[3]) - (t.bbox[1] + t.bbox[3])) < th && t.bbox[0] - prev.bbox[2] < th * 0.45; return acc + (k && !tight ? " " : "") + t.str.trim(); }, "").replace(/\s+/g, " ").trim();
      const prims = [].concat(...r.objs.map(o => o.prims));
      if (desc && VOr && texts.length && texts[0].vector && !VOr.plausible(desc)) desc = "";
      return { idx: i, name: desc, nameAuto: !!desc, prims, bbox: r.bbox, band: [rect[0], top, rect[2], bot] } as any;
    });
    // descriptions drawn as strokes (SHX fonts): read them with the vector OCR
    const VO = VOCR;
    if (VO) for (const it of items) {
      if (it.name) continue;
      const mine = new Set(it.prims);
      const x0 = it.bbox[2] + Math.max(1, th * 0.3);
      const txt = inside.filter(p => !mine.has(p) && p.bbox[0] >= x0 - 0.5 && (p.bbox[1] + p.bbox[3]) / 2 >= it.band[1] && (p.bbox[1] + p.bbox[3]) / 2 < it.band[3] && pdiag(p) < rh * 0.3 && !p.fill);
      if (!txt.length || txt.length > 1500) continue;
      const r = VO.readBlock(txt, { angles: [0] });
      if (r && r.text && r.plausible && r.score < 0.1) { it.name = r.text.replace(/\?+/g, "").replace(/\s+/g, " ").trim(); it.nameSource = "vetor"; it.nameScore = r.score; }
    }
    return items.filter(it => it.prims.length > 0);
  }

  // Legend by description lines: every line looks for its icon on its own row, left OR right,
  // icons belong to one line only, lines without icon continue the line above (same column).
  function textAnchoredLegend(texts, objs, th, rect) {
    // cabeçalho de COLUNA de tabela de legenda ("SÍMBOLO | DESCRIÇÃO") também não é descrição: na hard016 ele virava
    // um item "DESCRICÃO", ancorado no desenho das próprias letras
    const COL_HEADER = /^\s*(DESCRI[CÇ][AÃ]O|DESCRIPTION|S[IÍ]MBOLOS?|SYMBOLS?|QUANT(IDADE)?\.?|QTDE?\.?)\s*$/i;
    const desc = texts.filter(t => !HEADER_RE.test(t.str) && !COL_HEADER.test(t.str) && !/\b(LEGENDAS?|LEGENDS?|SIMBOLOGIA)\b/i.test(t.str) && !STOP_RE.test(t.str)).sort((a, b) => (a.bbox[1] - b.bbox[1]) || (a.bbox[0] - b.bbox[0]));
    // text runs on one baseline, close together, form a line
    const lines = [];
    const tBoxes = desc.map(t => t.bbox);
    const iconLike = objs.filter(o => !tBoxes.some(b => o.bbox[0] >= b[0] - 0.5 && o.bbox[2] <= b[2] + 0.5 && o.bbox[1] >= b[1] - 0.5 && o.bbox[3] <= b[3] + 0.5) && objSize(o) > th * 0.3);
    const iconBetween = (x0, x1, cy) => iconLike.some(o => o.bbox[0] >= x0 - 0.5 && o.bbox[2] <= x1 + 0.5 && Math.abs((o.bbox[1] + o.bbox[3]) / 2 - cy) < th);
    for (const t of desc.slice().sort((a, b) => a.bbox[0] - b.bbox[0])) {
      const cy = (t.bbox[1] + t.bbox[3]) / 2;
      const L = lines.find(l => Math.abs(l.cy - cy) < th * 0.5 && t.bbox[0] - l.bbox[2] < th * 4.5 && t.bbox[0] >= l.bbox[0] - th && !iconBetween(l.bbox[2], t.bbox[0], cy));
      if (L) { L.parts.push(t); L.bbox = union(L.bbox, t.bbox); } else lines.push({ parts: [t], bbox: t.bbox.slice(), cy });
    }
    for (const L of lines) L.str = L.parts.sort((a, b) => a.bbox[0] - b.bbox[0]).map(p => p.str.trim()).join(" ").replace(/\s+/g, " ");
    const textBoxes = lines.map(l => l.bbox);
    const icons = objs.filter(o => !textBoxes.some(b => o.bbox[0] >= b[0] - 0.5 && o.bbox[2] <= b[2] + 0.5 && o.bbox[1] >= b[1] - 0.5 && o.bbox[3] <= b[3] + 0.5) && objSize(o) > th * 0.3);
    // candidate pairs (line, icon) on the same row
    const pairs = [];
    for (const [li, L] of lines.entries()) for (const [oi, o] of icons.entries()) {
      const ocy = (o.bbox[1] + o.bbox[3]) / 2;
      if (Math.abs(ocy - L.cy) > Math.max(th * 0.9, (o.bbox[3] - o.bbox[1]) / 2 + th * 0.3)) continue;
      let gap;
      if (o.bbox[2] <= L.bbox[0] + 1) gap = L.bbox[0] - o.bbox[2];          // icon on the left
      else if (o.bbox[0] >= L.bbox[2] - 1) gap = o.bbox[0] - L.bbox[2];     // icon on the right
      else continue;
      if (gap > Math.max(th * 25, (rect[2] - rect[0]) * 0.9)) continue;
      pairs.push({ li, oi, gap, side: o.bbox[2] <= L.bbox[0] + 1 ? "L" : "R" });
    }
    // the dominant side decides (legends are consistent); then nearest first, one icon per line
    const nL = pairs.filter(p => p.side === "L").length, nR = pairs.length - nL;
    const side = nL >= nR ? "L" : "R";
    const P = pairs.filter(p => p.side === side).sort((a, b) => a.gap - b.gap);
    const lineIcon = new Map(), iconUsed = new Set();
    for (const p of P) { if (lineIcon.has(p.li) || iconUsed.has(p.oi)) continue; lineIcon.set(p.li, [p.oi]); iconUsed.add(p.oi); }
    if (!lineIcon.size) return null;
    // O ÍCONE MORA FORA DA COLUNA DE TEXTO. Numa legenda de texto vetorizado (fonte SHX), a palavra que o OCR não leu
    // sobra como "desenho" colado no começo da própria linha — e a linha a toma como ícone. Medido na hard016: a
    // segunda linha de "RECEPTACLE 2P+E 20A WALL / MOUNTED" virava o item "MOUNTED", com o desenho de "WALL" como
    // ícone, a 12 pt da coluna de símbolos de verdade. A margem é a mediana das linhas ancoradas; exige-se ao menos
    // três, para que ela seja uma coluna e não um acaso.
    if (lineIcon.size >= 3) {
      const margem = median([...lineIcon.keys()].map(li => side === "L" ? lines[li].bbox[0] : lines[li].bbox[2]));
      for (const [li, arr] of [...lineIcon]) {
        const o = icons[arr[0]];
        const dentro = side === "L" ? o.bbox[0] >= margem - 0.5 * th : o.bbox[2] <= margem + 0.5 * th;
        if (dentro) { lineIcon.delete(li); iconUsed.delete(arr[0]); }
      }
      if (!lineIcon.size) return null;
    }
    // icons made of several clusters: glue unused clusters on the same row, next to the chosen icon
    for (const [li, arr] of lineIcon) {
      const L = lines[li];
      let b = icons[arr[0]].bbox.slice();
      for (let grew = true; grew;) {
        grew = false;
        for (const [oi, o] of icons.entries()) {
          if (iconUsed.has(oi)) continue;
          const ocy = (o.bbox[1] + o.bbox[3]) / 2;
          if (Math.abs(ocy - L.cy) > th * 1.2) continue;
          const dx = Math.max(o.bbox[0] - b[2], b[0] - o.bbox[2], 0), dy = Math.max(o.bbox[1] - b[3], b[1] - o.bbox[3], 0);
          if (dx < th * 0.8 && dy < th * 1.0) { arr.push(oi); iconUsed.add(oi); b = union(b, o.bbox); grew = true; }
        }
      }
    }
    // continuation lines (no icon) join the item above in the same column
    const items = [];
    const order = [...lines.keys()].sort((a, b) => lines[a].bbox[1] - lines[b].bbox[1]);
    const itemOfLine = new Map();
    for (const li of order) {
      const L = lines[li];
      if (lineIcon.has(li)) {
        const oi = lineIcon.get(li), prims = [].concat(...oi.map(k => icons[k].prims));
        let b = icons[oi[0]].bbox.slice(); for (const k of oi) b = union(b, icons[k].bbox);
        const it = { name: L.str, nameAuto: true, prims, bbox: b, band: union(b, L.bbox), _col: L.bbox[0], _bottom: L.bbox[3] };
        items.push(it); itemOfLine.set(li, it);
      } else {
        const up = items.filter(it => Math.abs(it._col - L.bbox[0]) < th * 1.5 && L.bbox[1] - it._bottom < th * 1.4 && L.bbox[1] >= it._bottom - th * 0.3).sort((a, b) => b._bottom - a._bottom)[0];
        if (up) { up.name += " " + L.str; up._bottom = L.bbox[3]; up.band = union(up.band, L.bbox); }
      }
    }
    items.sort((a, b) => (a.bbox[0] > b.bbox[0] + 80 ? 1 : 0) - (b.bbox[0] > a.bbox[0] + 80 ? 1 : 0) || a.bbox[1] - b.bbox[1]);
    return items.map((it, i) => ({ idx: i, name: it.name.trim(), nameAuto: true, prims: it.prims, bbox: it.bbox, band: [it.band[0] - 2, it.band[1] - th * 0.4, it.band[2] + 2, it.band[3] + th * 0.4] }));
  }

  // describe a legend swatch
  function describeSwatch(it) {
    const b = it.bbox, w = b[2] - b[0], h = b[3] - b[1];
    const long = Math.max(w, h), short = Math.min(w, h);
    const horiz = w >= h;
    const layers = {};
    for (const p of it.prims) layers[p.layer] = (layers[p.layer] || 0) + 1;
    const layerList = Object.keys(layers).sort((a, b) => layers[b] - layers[a]);
    const mainLayer = layerList.find(l => !GENERIC_LAYER_RE.test(l) && !TEXT_LAYER_RE.test(l)) || layerList[0] || "";
    // straight strokes spanning most of the swatch along its long axis
    const spans = [];
    for (const p of it.prims) {
      if (!p.stroke) continue;
      for (let i = 0; i < p.segs.length; i += 4) {
        const dx = p.segs[i + 2] - p.segs[i], dy = p.segs[i + 3] - p.segs[i + 1];
        const along = horiz ? Math.abs(dx) : Math.abs(dy), across = horiz ? Math.abs(dy) : Math.abs(dx);
        if (along >= long * 0.6 && across <= along * 0.08) spans.push({ p, off: horiz ? (p.segs[i + 1] + p.segs[i + 3]) / 2 : (p.segs[i] + p.segs[i + 2]) / 2 });
      }
    }
    const offs = [...new Set(spans.map(s => Math.round(s.off * 4) / 4))].sort((a, b) => a - b);
    const isRoute = long >= short * 3.2 && long >= 14 && spans.length > 0;
    const main = it.prims.filter(p => p.layer === mainLayer);
    const mainObj = mkObj(main.length ? main : it.prims);
    const routeColor = spans.length ? (spans[0].p.stroke) : null;
    const routeDash = spans.length ? spans[0].p.dash : 0;
    return {
      type: isRoute ? "ROTA" : "PONTO", mainLayer, layers: layerList,
      mult: Math.max(1, offs.length), bandWidth: offs.length > 1 ? offs[offs.length - 1] - offs[0] : 0,
      routeColor, routeDash, routeLayers: [...new Set(spans.map(s => s.p.layer))],
      sig: opSig(mainObj), colors: colorSig(mainObj), desc: shapeDesc(mainObj), size: objSize(mainObj),
      nPrims: mainObj.prims.length
    };
  }

  // ---------- symbol matcher ----------
  function pcentroid(p) { const a = p.pts; let x = 0, y = 0; const n = a.length / 2; for (let i = 0; i < a.length; i += 2) { x += a[i]; y += a[i + 1]; } return [x / n, y / n]; }
  function pdiag(p) { return Math.hypot(p.bbox[2] - p.bbox[0], p.bbox[3] - p.bbox[1]); }
  function buildIndex(prims) {
    const byOps = new Map(), cell = 6, grid = new Map();
    for (const p of prims) {
      if (!p.pts || p.pts.length < 2) continue;
      let a = byOps.get(p.ops); if (!a) { a = []; byOps.set(p.ops, a); } a.push(p);
      const c = pcentroid(p); p._c = c;
      const k = Math.floor(c[0] / cell) * 100003 + Math.floor(c[1] / cell);
      let g = grid.get(k); if (!g) { g = []; grid.set(k, g); } g.push(p);
    }
    return { byOps, grid, cell };
  }
  function near(idx, x, y, r, fn) {
    const c = idx.cell, x0 = Math.floor((x - r) / c), x1 = Math.floor((x + r) / c), y0 = Math.floor((y - r) / c), y1 = Math.floor((y + r) / c);
    for (let gx = x0; gx <= x1; gx++) for (let gy = y0; gy <= y1; gy++) { const g = idx.grid.get(gx * 100003 + gy); if (g) for (const p of g) fn(p); }
  }
  // least-squares affine dst ~ A*src + t ; falls back to similarity (+mirror) for collinear points
  function fitAffine(src, dst) {
    const n = src.length / 2; let sx = 0, sy = 0, dx = 0, dy = 0;
    for (let i = 0; i < src.length; i += 2) { sx += src[i]; sy += src[i + 1]; dx += dst[i]; dy += dst[i + 1]; }
    sx /= n; sy /= n; dx /= n; dy /= n;
    let Sxx = 0, Sxy = 0, Syy = 0, Bxx = 0, Bxy = 0, Byx = 0, Byy = 0;
    for (let i = 0; i < src.length; i += 2) {
      const x = src[i] - sx, y = src[i + 1] - sy, u = dst[i] - dx, v = dst[i + 1] - dy;
      Sxx += x * x; Sxy += x * y; Syy += y * y; Bxx += u * x; Bxy += u * y; Byx += v * x; Byy += v * y;
    }
    const det = Sxx * Syy - Sxy * Sxy;
    const out = [];
    if (det > 1e-4 * (Sxx + Syy) * (Sxx + Syy) && n >= 3) {
      const i00 = Syy / det, i01 = -Sxy / det, i11 = Sxx / det;
      const a = Bxx * i00 + Bxy * i01, c = Bxx * i01 + Bxy * i11, b = Byx * i00 + Byy * i01, d = Byx * i01 + Byy * i11;
      out.push([a, b, c, d, dx - a * sx - c * sy, dy - b * sx - d * sy]);
    } else {
      // collinear: rotation + uniform scale, both handednesses
      let k = 0, best = 0;
      for (let i = 0; i < src.length; i += 2) { const d2 = (src[i] - sx) ** 2 + (src[i + 1] - sy) ** 2; if (d2 > best) { best = d2; k = i; } }
      const ux = src[k] - sx, uy = src[k + 1] - sy, vx = dst[k] - dx, vy = dst[k + 1] - dy;
      const lu = Math.hypot(ux, uy); if (lu < 1e-6) return out;
      const sc = Math.hypot(vx, vy) / lu, th = Math.atan2(vy, vx) - Math.atan2(uy, ux);
      const cs = Math.cos(th) * sc, sn = Math.sin(th) * sc;
      const R = [cs, sn, -sn, cs];
      const al = Math.atan2(uy, ux), c2 = Math.cos(2 * al), s2 = Math.sin(2 * al); // reflection across u
      const F = [c2, s2, s2, -c2];
      const M = [R[0] * F[0] + R[2] * F[1], R[1] * F[0] + R[3] * F[1], R[0] * F[2] + R[2] * F[3], R[1] * F[2] + R[3] * F[3]];
      for (const A of [R, M]) out.push([A[0], A[1], A[2], A[3], dx - A[0] * sx - A[2] * sy, dy - A[1] * sx - A[3] * sy]);
    }
    return out;
  }
  function tf(T, x, y) { return [T[0] * x + T[2] * y + T[4], T[1] * x + T[3] * y + T[5]]; }
  function tfOk(T) {
    const a = T[0], b = T[1], c = T[2], d = T[3];
    const det = Math.abs(a * d - b * c); if (det < 1e-9) return false;
    const n1 = Math.hypot(a, b), n2 = Math.hypot(c, d);
    const s = Math.sqrt(det);
    if (s < 0.12 || s > 10) return false;
    if (Math.max(n1, n2) / Math.min(n1, n2) > 4.5) return false;
    if (Math.abs(a * c + b * d) / (n1 * n2) > 0.3) return false;
    return true;
  }
  function residual(T, src, dst) {
    let e = 0; const n = src.length / 2;
    for (let i = 0; i < src.length; i += 2) { const q = tf(T, src[i], src[i + 1]); e += Math.hypot(q[0] - dst[i], q[1] - dst[i + 1]); }
    return e / n;
  }
  function orders(p) {
    const n = p.pts.length / 2, out = [p.pts];
    const rev = []; for (let i = n - 1; i >= 0; i--) rev.push(p.pts[2 * i], p.pts[2 * i + 1]);
    out.push(rev);
    if (p.closed && n <= 64) {
      const m = n - 1; // last vertex repeats the first
      for (const base of [p.pts, rev]) for (let s = 1; s < m; s++) {
        const o = []; for (let i = 0; i < m; i++) { const j = (i + s) % m; o.push(base[2 * j], base[2 * j + 1]); }
        o.push(o[0], o[1]); out.push(o);
      }
    }
    return out;
  }
  function matchSymbol(it, idx, claimed) {
    const sw = it.prims.filter(p => p.pts && p.pts.length >= 4);
    const empty = { accepted: [], relaxed: false, rejectedScale: 0, partial: [] };
    if (!sw.length) return empty;
    const swSize = objSize(mkObj(sw)) || 1;
    // anchors: most distinctive primitives first (many vertices, filled/closed, rare in the drawing)
    const rank = p => (p.pts.length / 2) * (p.fill ? 1.6 : 1) * (p.closed ? 1.3 : 1) / Math.log(2 + ((idx.byOps.get(p.ops) || []).length));
    const anchors = sw.slice().sort((a, b) => rank(b) - rank(a)).slice(0, 3);
    let best = empty;
    (runAnchor as any)._nome = (it.name || "").slice(0, 18);
    for (const relaxed of (it._relaxedOnly ? [true] : [false])) {
      // a âncora é a mais DISTINTIVA que acha alguma coisa, não a que acha MAIS. Um segmento de dois pontos
      // não fixa a pose: ele casa o mesmo símbolo em três giros diferentes, e "mais marcas" o fazia ganhar da
      // curva de nove pontos. Medido no hard011: a luminária casava 12 pela curva e 36 pelo segmento, ficava
      // com as 36, o juiz derrubava todas e o item saía ZERO num desenho com 12 luminárias.
      for (const an of anchors) {
        const r = runAnchor(an, sw, swSize, idx, claimed, relaxed, !!it._strict);
        if (r.accepted.length > best.accepted.length) best = r;
      }
      if (best.accepted.length) { best.relaxed = relaxed; break; }
    }
    return best;
  }
  function sameColor(a, b) { return (a.stroke || "") === (b.stroke || "") && (a.fill || "") === (b.fill || ""); }
  function runAnchor(an, sw, swSize, idx, claimed, relaxed, strict): any {
    const cands = (idx.byOps.get(an.ops) || []).filter(p => p.pts.length === an.pts.length && (relaxed || sameColor(p, an)));
    const DB = typeof process !== "undefined" && process.env && process.env.DBGM ? { cands: cands.length, claimed: 0, semT: 0, poucas: 0, ok: 0 } : null;
    const others = sw.filter(p => p !== an).map(p => ({ p, c: pcentroid(p), d: pdiag(p) }));
    const ords = orders(an);
    const found = [];
    const partial = [];
    for (const cp of cands) {
      if (claimed.has(cp.i)) { if (DB) DB.claimed++; continue; }
      const pd = pdiag(cp), ad = pdiag(an);
      if (ad > 0.5 && (pd / ad < 0.1 || pd / ad > 10)) continue;
      let T = null, tol = 0;
      for (const o of ords) {
        for (const cand of fitAffine(o, cp.pts)) {
          if (!tfOk(cand)) continue;
          const sc = Math.sqrt(Math.abs(cand[0] * cand[3] - cand[1] * cand[2]));
          const lim = Math.max(0.35, 0.035 * swSize * sc);
          if (residual(cand, o, cp.pts) <= lim) { T = cand; tol = sc; break; }
        }
        if (T) break;
      }
      if (!T) { if (DB) DB.semT++; continue; }
      // verify the rest of the icon around the predicted positions
      const used = [cp]; let ok = 0;
      const r = Math.max(0.6, 0.08 * swSize * tol);
      for (const o of others) {
        const q = tf(T, o.c[0], o.c[1]); let hit = null;
        near(idx, q[0], q[1], r, p => {
          if (hit || p === cp || p.ops !== o.p.ops || claimed.has(p.i) || used.includes(p)) return;
          if (!relaxed && !sameColor(p, o.p)) return;
          if (Math.hypot(p._c[0] - q[0], p._c[1] - q[1]) > r) return;
          const dd = pdiag(p), exp = o.d * tol;
          if (exp > 0.5 && (dd < exp * 0.55 || dd > exp * 1.8)) return;
          hit = p;
        });
        if (hit) { ok++; used.push(hit); }
      }
      const need = strict || others.length <= 2 ? others.length : Math.ceil(others.length * 0.75);
      if (ok < need && others.length && !relaxed && !strict) {
        // pieces drawn differently (split arcs/lines): check the transformed outline lies on ink
        const v = outlineCheck(T, sw, tol, swSize, idx, claimed, relaxed, cp);
        if (v) { used.length = 0; used.push(...v); ok = need; }
      }
      if (ok < need) { if (DB) DB.poucas++; if (others.length && ok >= Math.ceil(others.length * 0.5)) partial.push(cp); continue; }
      let b = null;
      for (const p of used) b = b ? union(b, p.bbox) : p.bbox.slice();
      if (DB) DB.ok++;
      found.push({ anchor: cp, T, scale: tol, used, bbox: b, score: others.length ? ok / others.length : 1 });
    }
    // one symbol per place
    found.sort((a, b) => b.score - a.score);
    const acc = [];
    for (const f of found) {
      const cx = (f.bbox[0] + f.bbox[2]) / 2, cy = (f.bbox[1] + f.bbox[3]) / 2, rr = 0.3 * swSize * f.scale;
      // duas marcas que se SOBREPÕEM são o mesmo símbolo: uma âncora de dois pontos casa o mesmo desenho em
      // poses diferentes, cada uma ancorada num pedaço, e a régua de CENTRO não alcançava (hard011: 36 marcas
      // em 12 luminárias, todas derrubadas pelo juiz e o item saindo ZERO)
      const cobre = a => {
        const x0 = Math.max(a.bbox[0], f.bbox[0]), y0 = Math.max(a.bbox[1], f.bbox[1]);
        const x1 = Math.min(a.bbox[2], f.bbox[2]), y1 = Math.min(a.bbox[3], f.bbox[3]);
        const i = Math.max(0, x1 - x0) * Math.max(0, y1 - y0);
        const me = Math.max(1e-6, (f.bbox[2] - f.bbox[0]) * (f.bbox[3] - f.bbox[1]));
        const ele = Math.max(1e-6, (a.bbox[2] - a.bbox[0]) * (a.bbox[3] - a.bbox[1]));
        return i / Math.min(me, ele) >= 0.5;
      };
      if (acc.some(a => Math.hypot((a.bbox[0] + a.bbox[2]) / 2 - cx, (a.bbox[1] + a.bbox[3]) / 2 - cy) < rr || cobre(a))) continue;
      acc.push(f);
    }
    if (DB) console.log("ANCORA", ((runAnchor as any)._nome || "?"), "ops", an.ops, "relax", relaxed, JSON.stringify(DB), "aceitos", acc.length);
    // instances of one block share one insertion scale: drop outliers
    let rejectedScale = 0, accepted = acc;
    if (acc.length >= 3) {
      const m = median(acc.map(a => a.scale));
      accepted = acc.filter(a => Math.abs(Math.log(a.scale / m)) < Math.log(1.6));
      rejectedScale = acc.length - accepted.length;
    }
    return { accepted, rejectedScale, partial, relaxed };
  }

  function outlineCheck(T, sw, sc, swSize, idx, claimed, relaxed, anchor?, cov?): any {
    if (!sw._cloud) sw._cloud = sampleCloud(sw, 72) || [];
    const tp = sw._cloud; if (tp.length < 8) return null;
    const cols = new Set(sw.map(colorKey));
    const pts = []; for (let i = 0; i < tp.length; i += 2) pts.push(tf(T, tp[i], tp[i + 1]));
    let cx = 0, cy = 0; for (const q of pts) { cx += q[0]; cy += q[1]; } cx /= pts.length; cy /= pts.length;
    const R = swSize * sc * 0.9, local = [];
    near(idx, cx, cy, R + 8, p => { if (!claimed.has(p.i) && (relaxed || cols.has(colorKey(p)))) local.push(p); });
    if (!local.length) return null;
    const tolD = Math.max(0.35, 0.045 * swSize * sc);
    let within = 0; const hit = new Set();
    for (const q of pts) {
      let best = Infinity, bp = null;
      for (const p of local) {
        const s = p.segs;
        for (let i = 0; i < s.length; i += 4) {
          const ax = s[i], ay = s[i + 1], dx = s[i + 2] - ax, dy = s[i + 3] - ay, L2 = dx * dx + dy * dy;
          let t = L2 ? ((q[0] - ax) * dx + (q[1] - ay) * dy) / L2 : 0; t = t < 0 ? 0 : t > 1 ? 1 : t;
          const d = Math.hypot(ax + t * dx - q[0], ay + t * dy - q[1]);
          if (d < best) { best = d; bp = p; }
        }
      }
      if (best <= tolD) { within++; hit.add(bp); }
    }
    if (within < pts.length * (cov || 0.93)) return null;
    const used = [...hit].filter(p => pdiag(p) <= swSize * sc * 1.3);
    if (!used.includes(anchor)) used.push(anchor);
    return used;
  }

  // ---------- part-pose matcher: one distinctive part fixes the pose, the whole icon is verified on ink ----------
  function whitenP(c) {
    const n = c.length / 2; let mx = 0, my = 0;
    for (let i = 0; i < c.length; i += 2) { mx += c[i]; my += c[i + 1]; }
    mx /= n; my /= n;
    let a = 0, b = 0, d = 0;
    for (let i = 0; i < c.length; i += 2) { const x = c[i] - mx, y = c[i + 1] - my; a += x * x; b += x * y; d += y * y; }
    a /= n; b /= n; d /= n;
    const tr = a + d, det = a * d - b * b, disc = Math.sqrt(Math.max(0, tr * tr / 4 - det));
    const l1 = tr / 2 + disc, l2 = tr / 2 - disc;
    if (l1 <= 0 || l2 <= l1 * 4e-3) return null;
    let vx = b, vy = l1 - a; if (Math.hypot(vx, vy) < 1e-12) { vx = 1; vy = 0; }
    const vn = Math.hypot(vx, vy); vx /= vn; vy /= vn;
    const s1 = 1 / Math.sqrt(l1), s2 = 1 / Math.sqrt(l2);
    const pts = new Float64Array(c.length);
    for (let i = 0; i < c.length; i += 2) {
      const x = c[i] - mx, y = c[i + 1] - my;
      pts[i] = (x * vx + y * vy) * s1; pts[i + 1] = (-x * vy + y * vx) * s2;
    }
    return { pts, ratio: l2 / l1, m: [mx, my], e: [vx, vy], s1, s2 };
  }
  // affine mapping template-space -> drawing-space from both whitenings and a rotation/mirror in whitened space
  function poseFrom(wt, wc, th, mir) {
    // w = D_t R_t^T (p - m_t); q = Q w; p' = m_c + R_c D_c^-1 q
    const [ex, ey] = wt.e, Rt = [ex, ey, -ey, ex]; // columns e1=(ex,ey), e2=(-ey,ex) -> R_t = [[ex,-ey],[ey,ex]]
    const c = Math.cos(th), s = Math.sin(th);
    // M1 = D_t R_t^T : rows [ex*s1, ey*s1], [-ey*s2, ex*s2]
    const M1 = [ex * wt.s1, ey * wt.s1, -ey * wt.s2, ex * wt.s2]; // row-major a,b,c,d
    // Q = R(th) * diag(mir,1): [[c*mir, -s],[s*mir, c]]
    const Q = [c * mir, -s, s * mir, c];
    const [fx, fy] = wc.e;
    const M3 = [fx / wc.s1, -fy / wc.s2, fy / wc.s1, fx / wc.s2]; // R_c D_c^-1
    const mm = (A, B) => [A[0] * B[0] + A[1] * B[2], A[0] * B[1] + A[1] * B[3], A[2] * B[0] + A[3] * B[2], A[2] * B[1] + A[3] * B[3]];
    const A = mm(M3, mm(Q, M1)); // row-major [a b; c d]
    const tx = wc.m[0] - (A[0] * wt.m[0] + A[1] * wt.m[1]), ty = wc.m[1] - (A[2] * wt.m[0] + A[3] * wt.m[1]);
    // convert to our [a b c d e f] where x' = a x + c y + e ; y' = b x + d y + f
    return [A[0], A[2], A[1], A[3], tx, ty];
  }
  function rotSearch(tpl, cand, keep) {
    const R = new Float64Array(tpl.length), res = [];
    const at = (mir, th) => {
      const c = Math.cos(th), s = Math.sin(th);
      for (let i = 0; i < tpl.length; i += 2) { const x = tpl[i] * mir, y = tpl[i + 1]; R[i] = c * x - s * y; R[i + 1] = s * x + c * y; }
      return Math.max(chamfer(R, cand), chamfer(cand, R));
    };
    for (const mir of [1, -1]) for (let k = 0; k < 36; k++) { const th = k * Math.PI / 18; res.push([at(mir, th), th, mir]); }
    res.sort((a, b) => a[0] - b[0]);
    const out = [];
    for (const r of res) {
      if (r[0] > 0.3 || out.length >= keep) break;
      let best = r;
      for (let j = -2; j <= 2; j++) { const th = r[1] + j * Math.PI / 90, d = at(r[2], th); if (d < best[0]) best = [d, th, r[2]]; }
      if (!out.some(o => o[2] === best[2] && Math.abs(Math.atan2(Math.sin(o[1] - best[1]), Math.cos(o[1] - best[1]))) < 0.12)) out.push(best);
    }
    return out;
  }
  function partPoseMatch(it, drawPrims, idx, claimed, taken) {
    const sw = it.prims.filter(p => p.len > 0 && p.pts && !(p.fill === "#ffffff" && !p.stroke));
    if (!sw.length) return { found: [], tried: false };
    const swSize = objSize(mkObj(sw)) || 1;
    const parts = [];
    for (const p of sw) { const c = sampleCloud([p], 40); if (!c || c.length < 12) continue; const w = whitenP(c); if (w) parts.push({ p, w, hist: radialHist(w.pts) }); }
    if (!parts.length) return { found: [], tried: false };
    parts.sort((a, b) => b.p.len - a.p.len);
    const part = parts[0];
    const pd = pdiag(part.p);
    const found = [];
    const cands = drawPrims.filter(p => !claimed.has(p.i) && p.len > 0 && colorKey(p) === colorKey(part.p));
    for (const cp of cands) {
      const d = pdiag(cp); if (d < pd * 0.2 || d > pd * 6) continue;
      const cx = (cp.bbox[0] + cp.bbox[2]) / 2, cy = (cp.bbox[1] + cp.bbox[3]) / 2;
      if (taken.some(b => cx >= b[0] && cx <= b[2] && cy >= b[1] && cy <= b[3])) continue;
      const cc = sampleCloud([cp], 40); if (!cc || cc.length < 12) continue;
      const wc = whitenP(cc); if (!wc) continue;
      if (Math.abs(Math.log(wc.ratio / part.w.ratio)) > 0.9) continue;
      if (histDist(radialHist(wc.pts), part.hist) > 0.5) continue;
      const poses = rotSearch(part.w.pts, wc.pts, 6);
      for (const [dist, th, mir] of poses) {
        const T = poseFrom(part.w, wc, th, mir);
        if (!tfOk(T)) continue;
        const sc = Math.sqrt(Math.abs(T[0] * T[3] - T[1] * T[2]));
        const used = outlineCheck(T, sw, sc, swSize, idx, claimed, false, cp, it._strict ? 0.97 : 0.95);
        if (used) {
          let b = null; for (const p of used) b = b ? union(b, p.bbox) : p.bbox.slice();
          found.push({ bbox: b, used, scale: sc, anchor: cp, dist });
          taken.push([b[0] - 1, b[1] - 1, b[2] + 1, b[3] + 1]);
          for (const p of used) claimed.add(p.i);
          break;
        }
      }
    }
    return { found, tried: true };
  }

  // ---------- tessellation-independent shape matcher (affine-normalised chamfer) ----------
  function sampleCloud(prims, n) {
    let L = 0; for (const p of prims) L += p.len;
    if (L <= 0) return null;
    const step = L / n, out = [];
    let carry = 0;
    for (const p of prims) {
      const s = p.segs;
      for (let i = 0; i < s.length; i += 4) {
        const dx = s[i + 2] - s[i], dy = s[i + 3] - s[i + 1], l = Math.hypot(dx, dy);
        let t = carry;
        while (t <= l) { out.push(s[i] + dx * t / l, s[i + 1] + dy * t / l); t += step; }
        carry = t - l;
      }
    }
    return out;
  }
  function chamfer(A, B) { // mean nearest distance A->B
    let s = 0;
    for (let i = 0; i < A.length; i += 2) {
      let m = Infinity; const x = A[i], y = A[i + 1];
      for (let j = 0; j < B.length; j += 2) { const dx = B[j] - x, dy = B[j + 1] - y, d = dx * dx + dy * dy; if (d < m) m = d; }
      s += Math.sqrt(m);
    }
    return s / (A.length / 2);
  }
  function radialHist(p) {
    const h = new Float64Array(12); const n = p.length / 2;
    for (let i = 0; i < p.length; i += 2) { const r = Math.hypot(p[i], p[i + 1]); h[Math.min(11, Math.floor(r / 0.3))] += 1 / n; }
    return h;
  }
  function histDist(a, b) { let d = 0; for (let i = 0; i < a.length; i++) d += Math.abs(a[i] - b[i]); return d; }
  function colorKey(p) { return (p.stroke ? "s" + p.stroke : "") + (p.fill ? "f" + p.fill : ""); }
  // ---------- 4. counting ----------
  function takeoff(sheet: Folha, opts?: OpcoesContagem): Resultado {
    opts = opts || {};
    const scale = opts.scale || sheet.scale || 50;
    const legendRect = opts.legendRect || (sheet.legend && sheet.legend.rect);
    const legendRects = opts.legendRect ? [opts.legendRect] : (sheet.legend ? (sheet.legend.rects || [sheet.legend.rect]) : []);
    let items = [];
    const tightRects = [];
    let pre = !opts.legendRect && sheet.legend && sheet.legend.items;
    if (opts.legendRect) {
      // manual box: read it with the same form-based reader, restricted to the box
      const LX = LEGENDX;
      const VOx = VOCR;
      const R = opts.legendRect, inR = b => b[0] >= R[0] - 1 && b[2] <= R[2] + 1 && b[1] >= R[1] - 1 && b[3] <= R[3] + 1;
      const sub = Object.assign({}, sheet, { prims: sheet.prims.filter(p => inR(p.bbox)), texts: sheet.texts.filter(t => inR(t.bbox)) });
      const fx = LX ? LX.detect(sub, { cluster, VO: VOx, isTextPrim, opSig, mkObj, manual: true }) : null;
      if (fx && fx.items.length) pre = true, sheet._manualItems = fx.items; else sheet._manualItems = null;
    }
    const preItems = opts.legendRect ? sheet._manualItems : (sheet.legend && sheet.legend.items);
    if (pre) {
      preItems.forEach((it, i) => items.push({ idx: i, name: it.name, nameAuto: true, prims: it.prims, bbox: it.bbox.slice(), band: it.band.slice() }));
      for (const r of legendRects) tightRects.push(r);
    }
    if (!pre) legendRects.forEach((r, k) => {
      const got = readLegend(sheet, r);
      for (const it of got) { it.idx += k * 100; items.push(it); }
      // the legend occupies what its items occupy (plus the header band) — never the plan around it
      if (got.length) { let b = null; for (const it of got) { const q = it.band || it.bbox; b = b ? union(b, q) : q.slice(); } tightRects.push([Math.max(r[0], b[0] - 4), r[1], Math.min(r[2], b[2] + 4), Math.min(r[3], b[3] + 4)]); }
      else tightRects.push(r);
    });
    const userExcl = opts.exclude || [];
    const outside = p => !userExcl.some(r => centerIn(p.bbox, r)) && !tightRects.some(r => inRect(p.bbox, [r[0] - 1, r[1] - 1, r[2] + 1, r[3] + 1]));
    // no legend on this sheet: use the batch's legend library (e.g. a legend-only "LD" sheet)
    if (!items.length && opts.library && opts.library.length) {
      items = opts.library.map((L, k) => {
        let b = L.prims[0].bbox.slice(); for (const p of L.prims) b = union(b, p.bbox);
        return { idx: 2000 + k, name: L.name || "", nameAuto: !!L.name, prims: L.prims, bbox: b, band: null, fromLibrary: L.src || true, libThumb: L.thumb || "" };
      });
    }
    const ign = new Set(opts.ignore || []);
    items = items.filter(it => !ign.has(it.idx));
    (opts.custom || []).forEach((c, k) => {
      const r = c.rect;
      const prims = sheet.prims.filter(p => inRect(p.bbox, r) && !isTextPrim(p));
      if (!prims.length) return;
      let b = prims[0].bbox.slice(); for (const p of prims) b = union(b, p.bbox);
      const src = !(legendRect && centerIn(b, legendRect));
      items.push({ idx: 1000 + k, name: c.name || "", nameAuto: false, prims, bbox: b, band: [b[0] - 4, b[1] - 4, b[2] + 4, b[3] + 4], custom: true, fromDrawing: src });
    });
    // o MOLDE apontado pela pessoa (PLANO-ALTA, F3): um exemplar desenhado na planta passa a ser o ícone do item.
    // A legenda continua sendo de onde o item veio; só o desenho que se procura muda.
    for (const it of items) {
      const r = opts.molde && opts.molde[it.idx]; if (!r) continue;
      const ps = sheet.prims.filter(p => inRect(p.bbox, r) && !isTextPrim(p) && p.segs && p.segs.length);
      if (!ps.length) continue;
      // o retângulo CORTOU um desenho? traço do tamanho de símbolo que atravessa a borda é o resto dele
      // (fio e parede atravessam também, mas são longos). Meio símbolo casaria com tudo que tem aquela metade.
      let b = null; for (const p of ps) b = b ? union(b, p.bbox) : p.bbox.slice();
      const z = Math.hypot(b[2] - b[0], b[3] - b[1]);
      // só é "o resto dele" se ENCOSTA no que ficou dentro — um móvel ou texto vizinho na borda não é corte
      const encosta = p => ps.some(q => Math.max(p.bbox[0] - q.bbox[2], q.bbox[0] - p.bbox[2], p.bbox[1] - q.bbox[3], q.bbox[1] - p.bbox[3]) <= 0.25);
      const cortou = sheet.prims.some(p => !isTextPrim(p) && p.segs && p.segs.length && !inRect(p.bbox, r) && p.bbox[0] < r[2] && p.bbox[2] > r[0] && p.bbox[1] < r[3] && p.bbox[3] > r[1] && pdiag(p) <= z * 1.5 && encosta(p));
      if (cortou) { it.moldeCortado = true; continue; }
      // um traço reto sozinho não é símbolo: é pedaço de parede ou de fio, e casa com a planta inteira
      // (bench/clique.js: um retângulo pequeno demais em volta do quadro pegou 6 pt de parede e contou 298)
      const lisos = ps.filter(p => !isTextPrim(p) && p.segs && p.segs.length);
      if (lisos.length === 1 && /^M(L{1,2})$/.test(lisos[0].ops) && !lisos[0].fill) { it.moldePobre = true; continue; }
      it.prims = ps; it.molde = r;
    }
    for (const it of items) {
      it.sw = describeSwatch(it);
      const nm = (opts.names && opts.names[it.idx] != null) ? opts.names[it.idx] : it.name;
      const k = textKind(nm);
      it.textKind = k;
      if (k === "ROTA" && it.sw.type !== "ROTA" && it.sw.routeColor) it.sw.type = "ROTA";
      if (k === "PONTO" && it.sw.type === "ROTA") it.sw.type = "PONTO";
      it.xref = V_XREF.test(normTxt(nm));
    }
    for (const it of items) if (opts.typeOverride && opts.typeOverride[it.idx]) it.sw.type = opts.typeOverride[it.idx];

    const drawPrims = sheet.prims.filter(p => outside(p) && !isTextPrim(p));
    const byLayer = new Map();
    for (const p of drawPrims) { let a = byLayer.get(p.layer); if (!a) { a = []; byLayer.set(p.layer, a); } a.push(p); }
    const hasLayers = byLayer.size > 1;

    // ---- points: anchor + affine verification (rotation, mirror, non-uniform scale, glued wires, any layer) ----
    for (const it of items) if (it.textKind === "NOTACAO") { it.sw.type = "NOTA"; it.qty = 0; it.unit = "-"; }
    const pointItems = items.filter(it => it.sw.type === "PONTO");
    const idx = buildIndex(drawPrims);
    const claimed = new Set();
    // identical legend symbols (sub-variants that differ only by a tag next to them)
    // ícones IGUAIS da mesma legenda têm o mesmo TAMANHO: a assinatura não enxerga escala, e dois fragmentos
    // parecidos de tamanhos diferentes (lote "parcial") viravam gêmeos e saíam sem número
    const mesmoTamanho = (p, q) => { const dp = Math.hypot(p[2] - p[0], p[3] - p[1]), dq = Math.hypot(q[2] - q[0], q[3] - q[1]); return dp > 0 && dq > 0 && Math.max(dp, dq) / Math.min(dp, dq) <= 1.25; };
    for (const a of pointItems) for (const b of pointItems) if (a !== b && !a.custom && !b.custom && !a.molde && !b.molde && a.idx < b.idx && !b.twinOf && a.sw.sig === b.sw.sig && descDist(a.sw.desc, b.sw.desc) < 0.06 && mesmoTamanho(a.bbox, b.bbox)) { b.twinOf = a.twinOf != null ? a.twinOf : a.idx; }
    const order = pointItems.slice().sort((a, b) => ((a.custom ? 1 : 0) - (b.custom ? 1 : 0)) || (b.prims.length - a.prims.length) || (a.idx - b.idx));
    for (const it of order) {
      it.unit = "un"; it.matches = []; it.marks = [];
      if (it.twinOf != null) continue;
      let cl = claimed;
      if (it.custom) { cl = new Set(); for (const o of pointItems) if (o !== it && !o.custom && o.claimSet && o.prims.length > it.prims.length) for (const i of o.claimSet) cl.add(i); }
      const res = matchSymbol(it, idx, cl);
      it.claimSet = []; for (const m of res.accepted) for (const p of m.used) it.claimSet.push(p.i);
      it.qty = res.accepted.length; it.relaxed = res.relaxed; it.rejectedScale = res.rejectedScale; it.partialFit = res.partial;
      it.marks = res.accepted.map(m => m.bbox); it.scales = res.accepted.map(m => m.scale); it.inst = res.accepted.map(m => ({ used: m.used, how: "exact" }));
      it.onLayer = res.accepted.length ? res.accepted.filter(m => m.anchor.layer === it.sw.mainLayer).length / res.accepted.length : 0;
      if (!it.custom) for (const m of res.accepted) for (const p of m.used) claimed.add(p.i);
    }
    // second pass: one part fixes the pose, the whole icon must lie on ink (clutter / tessellation / glued wires)
    const taken = []; for (const it of pointItems) if (it.marks) taken.push(...it.marks.map(b => [b[0] - 1, b[1] - 1, b[2] + 1, b[3] + 1]));
    for (const it of order) {
      if (it.twinOf != null) continue;
      const cl = it.custom ? new Set(claimed) : claimed;
      const r = partPoseMatch(it, drawPrims, idx, cl, it.custom ? taken.slice() : taken);
      if (!r.found.length) continue;
      it.posed = r.found.length; it.qty += r.found.length; it.inst = (it.inst || []).concat(r.found.map(m => ({ used: m.used, how: "posed" })));
      it.marks = it.marks.concat(r.found.map(m => m.bbox));
      it.scales = (it.scales || []).concat(r.found.map(m => m.scale));
    }
    // As passadas "por contorno" e "molde do próprio desenho" SAÍRAM (25/09/2026). Medido em 122 folhas com
    // gabarito (`npm run assertividade`): as duas não acrescentavam UM acerto sequer — 475 itens exatos com e
    // sem elas — e a do contorno ainda custava 6 ALTAs, porque tudo que ela levantava e o juiz recusava virava
    // dúvida e bloqueava o status. Eram elas que faziam o ícone do quadro contar as luminárias da planta.
    // last resort for items still at zero: same shape in another colour (pieces must all match)
    for (const it of order) {
      if (it.twinOf != null || it.qty) continue;
      it._relaxedOnly = true;
      const res = matchSymbol(it, idx, it.custom ? new Set() : claimed);
      it._relaxedOnly = false;
      if (res.accepted.length) {
        it.qty = res.accepted.length; it.relaxed = true; it.marks = res.accepted.map(m => m.bbox);
        if (!it.custom) for (const m of res.accepted) for (const p of m.used) claimed.add(p.i);
      }
    }
    // ---- o JUIZ: toda marca de toda passada tem de SER o ícone, nos dois sentidos (PLANO-ALTA.md, F1) ----
    // As passadas acima só PROPÕEM. Marca reprovada não some calada: vira dúvida, com o motivo.
    const IDm = IDENTIDADE;
    if (IDm && !opts.semJuiz) {
      const ix = IDm.index(drawPrims);
      // molde apontado: além do que as passadas propuseram, varre todo lugar da planta do tamanho do molde
      for (const it of pointItems) {
        if (!it.molde || it.twinOf != null) continue;
        let b = null; for (const p of it.prims) b = b ? union(b, p.bbox) : p.bbox.slice();
        const z = Math.hypot(b[2] - b[0], b[3] - b[1]) || 1;
        const small = drawPrims.filter(p => pdiag(p) <= z * 1.3);
        if (small.length > 80000) continue;
        it.marks = it.marks || [];
        const has = q => it.marks.some(m => Math.abs((m[0] + m[2]) / 2 - (q[0] + q[2]) / 2) < z * 0.3 && Math.abs((m[1] + m[3]) / 2 - (q[1] + q[3]) / 2) < z * 0.3);
        it._varridas = new Set();
        for (const o of cluster(small, Math.max(0.3, z * 0.05))) { const d = objSize(o); if (d >= z * 0.8 && d <= z * 1.25 && !has(o.bbox)) { it.marks.push(o.bbox); it._varridas.add(o.bbox); } }
        it.qty = it.marks.length;
      }
      for (const it of pointItems) {
        if (it.twinOf != null || !it.marks || !it.marks.length) continue;
        const ic = IDm.icon(it.prims); if (!ic) continue;
        it._ic = ic; it._jv = it.marks.map(b => IDm.verify(ic, b, ix, null, { mesmaCor: !!it.molde }));
      }
      // 2ª volta: tinta já explicada por OUTRA ocorrência aprovada (a tomada encostada na vizinha, o triângulo
      // de outro item desenhado por cima da luminária) não é tinta a mais — julga de novo sem ela
      const explicado = new Map();
      for (const it of pointItems) if (it._jv) it._jv.forEach((v, k) => { if (v.ok) for (const p of v.usados) explicado.set(p, it.marks[k]); });
      for (const it of pointItems) if (it._jv) it._jv.forEach((v, k) => {
        if (v.ok) return;
        const b = it.marks[k], outros = new Set(); for (const [p, dono] of explicado) if (dono !== b) outros.add(p);
        const v2 = IDm.verify(it._ic, b, ix, outros, { mesmaCor: !!it.molde }); if (v2.ok) it._jv[k] = v2;
      });
      for (const it of pointItems) {
        if (!it._jv) continue;
        const nInst = (it.inst || []).length, keep = [], keepIdx = [], scales = [], duv = [];
        const comoVeio = k => k < nInst ? (it.inst[k].how || "?") : (it._varridas && it._varridas.has(it.marks[k]) ? "molde" : "relax");
        it._jv.forEach((v, k) => {
          const b = it.marks[k];
          // da varredura do molde, só vira dúvida quem chegou PERTO de ser ele; o resto é outro desenho qualquer
          if (!v.ok) { if (!(it._varridas && it._varridas.has(b)) || Math.min(v.fw || 0, v.rv || 0) >= 0.75) duv.push({ bbox: b, why: v.why, fw: v.fw || 0, rv: v.rv || 0, how: comoVeio(k) }); return; }
          // um símbolo por lugar: duas marcas aprovadas no mesmo lugar são a mesma ocorrência
          const cx = (b[0] + b[2]) / 2, cy = (b[1] + b[3]) / 2, r = 0.3 * Math.hypot(b[2] - b[0], b[3] - b[1]);
          if (keep.some(a => Math.hypot((a[0] + a[2]) / 2 - cx, (a[1] + a[3]) / 2 - cy) < r)) return;
          keep.push(b); keepIdx.push(k); scales.push(v.s); (it._cores = it._cores || new Set()); for (const c of v.cores || []) it._cores.add(c);
        });
        // a resposta da pessoa às dúvidas: "são este material" inclui todas; "não são" tira as dúvidas do caminho
        if (duv.length && opts.aceitar && opts.aceitar[it.idx]) { for (const d of duv) keep.push(d.bbox); it.aceitou = duv.length; duv.length = 0; }
        if (duv.length && opts.recusar && opts.recusar[it.idx]) { it.recusou = duv.length; duv.length = 0; }
        it.inst = keepIdx.filter(k => k < nInst).map(k => it.inst[k]);
        it.marks = keep; it.qty = keep.length; it.scales = scales; it.duvidas = duv;
        // o exemplar apontado tem de passar como ele mesmo — senão o retângulo pegou meio símbolo ou símbolo e mais coisa
        if (it.molde) { const m = it.molde; it.moldeProprio = keep.some(b => { const cx = (b[0] + b[2]) / 2, cy = (b[1] + b[3]) / 2; return cx >= m[0] && cx <= m[2] && cy >= m[1] && cy <= m[3]; }); }
        it.ident = { ok: keep.length, rej: duv.length, pobre: it._ic.pobre, neutro: it._ic.neutro };
      }
      // GÊMEOS: o ícone de um item também É o desenho que outro item contou, na mesma cor. A forma não tem como
      // dizer qual é qual — um ponto preto numa planta preta pode ser a tomada média ou o ponto de dados.
      const julgados = pointItems.filter(it => it._ic && it.marks && it.marks.length);
      for (const A of julgados) for (const B of julgados) {
        if (A === B || (A.gemeos && A.gemeos.has(B.idx))) continue;
        const v = IDm.verify(A._ic, B.marks[0], ix);
        if (!v.ok || !(v.cores || []).some(c => A._cores && A._cores.has(c))) continue;
        (A.gemeos = A.gemeos || new Map()).set(B.idx, B); (B.gemeos = B.gemeos || new Map()).set(A.idx, A);
      }
      // ÚLTIMO RECURSO, DEPOIS DO JUIZ: a passada "mesma forma em outra cor" só roda para item que está em
      // ZERO, e quem zera de verdade é o juiz — antes dele, uma marca proposta e depois recusada bloqueava a
      // passada. Medido no hard020: a luminária é um hexágono VERDE na legenda e PRETO na planta, tinha duas
      // marcas propostas pela pose (as duas recusadas) e saía 0 num desenho com quatro hexágonos.
      for (const it of pointItems) {
        if (it.twinOf != null || it.qty || it.relaxed || it.molde || !it.prims || !it.prims.length) continue;
        it._relaxedOnly = true;
        const res = matchSymbol(it, idx, it.custom ? new Set() : claimed);
        it._relaxedOnly = false;
        if (!res.accepted.length) continue;
        const ic = IDm.icon(it.prims); if (!ic) continue;
        const ok = [], duv = it.duvidas || [];
        for (const m of res.accepted) {
          const v = IDm.verify(ic, m.bbox, ix, null, {});
          if (v.ok) ok.push(m); else duv.push({ bbox: m.bbox, why: v.why, fw: v.fw || 0, rv: v.rv || 0, how: "relax" });
        }
        it.duvidas = duv;
        if (!ok.length) continue;
        it.marks = ok.map(m => m.bbox); it.qty = ok.length; it.relaxed = true;
        it.inst = ok.map(m => ({ used: m.used, how: "relax" }));
        it.ident = { ok: ok.length, rej: duv.length, pobre: ic.pobre, neutro: ic.neutro };
        if (!it.custom) for (const m of ok) for (const p of m.used) claimed.add(p.i);
      }
      for (const it of pointItems) { delete it._ic; delete it._jv; delete it._varridas; delete it._cores; }
    }
    for (const it of pointItems) {
      const cnt = {}; for (const ins of it.inst || []) for (const p of ins.used || []) cnt[p.layer] = (cnt[p.layer] || 0) + 1;
      it.foundLayers = Object.keys(cnt).filter(l => l).sort((a, b) => cnt[b] - cnt[a]);
    }
    for (const it of pointItems) if (it.partialFit) { const n = it.partialFit.filter(p => !claimed.has(p.i)).length; it.partialFit = n; }
    // twins: identical icons separated by the text tags drawn next to each instance
    const nameOf = it => ((opts.names && opts.names[it.idx] != null) ? opts.names[it.idx] : it.name) || "";
    const norm = t => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
    // canonical tokens: O/0 and I/L/1 look alike in stroke fonts, compare them as the same glyph
    const toks = t => (norm(t).match(/[A-Z0-9][A-Z0-9.,\/]*/g) || []).map(x => x.replace(/[.,]$/, ""));
    const canon = x => x.replace(/O/g, "0").replace(/[IL]/g, "1");
    // tag text next to each instance: real PDF text, or strokes read by the vector OCR
    const VO = VOCR;
    function tagsFor(marks) {
      if (!marks.length) return [];
      const szs = marks.map(b => Math.max(b[2] - b[0], b[3] - b[1], 4));
      const msz = median(szs), R = msz * 2.8;
      let texts = sheet.texts.filter(t => marks.some(b => t.bbox[0] < b[2] + R && t.bbox[2] > b[0] - R && t.bbox[1] < b[3] + R && t.bbox[3] > b[1] - R));
      if (VO) {
        const inMark = p => marks.some(b => { const cx = (p.bbox[0] + p.bbox[2]) / 2, cy = (p.bbox[1] + p.bbox[3]) / 2; return cx >= b[0] - 0.3 && cx <= b[2] + 0.3 && cy >= b[1] - 0.3 && cy <= b[3] + 0.3; });
        const small = sheet.prims.filter(p => !claimed.has(p.i) && p.stroke && !p.fill && pdiag(p) <= msz * 0.9 && p.len > 0 &&
          marks.some(b => p.bbox[0] < b[2] + R && p.bbox[2] > b[0] - R && p.bbox[1] < b[3] + R && p.bbox[3] > b[1] - R) && !inMark(p) &&
          !(legendRect && centerIn(p.bbox, legendRect)));
        if (small.length && small.length < 20000) {
          for (const o of cluster(small, Math.max(0.2, msz * 0.3))) {
            if (o.prims.length > 60) continue;
            const r = VO.readBlock(o.prims);
            if (r && r.text && r.score < 0.1 && !/\?/.test(r.text)) texts.push({ str: r.text, bbox: o.bbox, vector: true });
          }
        }
      }
      const bdist = (t, b) => Math.hypot(Math.max(t.bbox[0] - b[2], b[0] - t.bbox[2], 0), Math.max(t.bbox[1] - b[3], b[1] - t.bbox[3], 0));
      const owner = new Map();
      for (const t of texts) { let bi = -1, bd = Infinity; marks.forEach((b, i) => { const d = bdist(t, b); if (d < bd) { bd = d; bi = i; } }); owner.set(t, bi); }
      return marks.map((b, mi) => {
        const sz = szs[mi], cand = [];
        for (const t of texts) { if (owner.get(t) !== mi) continue; const d = bdist(t, b); if (d < sz * 2.8) cand.push([d, t]); }
        cand.sort((p, q) => p[0] - q[0]);
        if (!cand.length) return null;
        const d0 = cand[0][0];
        return cand.filter(([d]) => d <= d0 * 1.4 + sz * 0.15).map(([, t]) => t.str).join(" ");
      });
    }
    for (const a of pointItems) {
      if (a.twinOf != null) continue;
      const group = [a].concat(pointItems.filter(x => x.twinOf === a.idx));
      if (group.length < 2 || !a.marks || !a.marks.length) continue;
      const T = group.map(g => new Set(toks(nameOf(g))));
      const common = new Set([...T[0]].filter(t => T.every(S => S.has(t))));
      const D = T.map(S => [...S].filter(t => !common.has(t)));
      if (D.some(d => !d.length)) continue;
      const hit = (d, near) => d.filter(t => near.some(n => n === t || canon(n) === canon(t) || (/^\d/.test(t) && n.replace(/[^0-9]/g, "") && t.replace(/[^0-9.,]/g, "").replace(",", ".") === n.replace(/[^0-9.,]/g, "").replace(",", ".") && /^\d+[A-Z]*$/.test(n)) || (/^[A-Z]{3,}$/.test(t) && n.length === 1 && t[0] === n))).length;
      const per = group.map(() => []), un = [];
      const tags = tagsFor(a.marks);
      a.marks.forEach((b, mi) => {
        const near = tags[mi] ? toks(tags[mi]) : [];
        const sc = D.map(d => hit(d, near)); const mx = Math.max(...sc);
        const win = sc.map((v, i) => v === mx ? i : -1).filter(i => i >= 0);
        if (mx > 0 && win.length === 1) per[win[0]].push(b); else un.push(b);
      });
      const assigned = per.reduce((n, p) => n + p.length, 0);
      if (!assigned) continue;
      group.forEach((g, i) => { g.twinSplit = { n: per[i].length, un: un.length, total: a.marks.length }; g.qty = per[i].length; g.marks = per[i]; g.unMarks = un; g.twinOfSaved = g.twinOf; g.twinOf = null; g.twins = null; });
    }
    // A SOMA DAS ETIQUETAS ("4 0 2" ao lado do símbolo = 6 pontos) saiu na v3: é convenção de um escritório só,
    // e ler um número ao lado e supor que é quantidade já deu "Prancha:" com 30.081 numa prancha pública. A
    // separação de ícones IGUAIS pela etiqueta (acima) fica: lê o texto do próprio PDF e não soma nada.
    for (const it of pointItems) if (it.twinOf != null) {
      const a = pointItems.find(x => x.idx === it.twinOf);
      it.qty = null; it.marks = a ? a.marks : []; it.twinName = a ? (a.name || "item " + (a.idx + 1)) : "";
      if (a) { a.twins = (a.twins || []).concat(it.idx); }
    }

    // ---- material LINEAR (eletroduto, eletrocalha, cabo): metros pela camada/cor/tracejado do ícone ----
    // Volta na versão final, com uma diferença medida: o traçado da rota NÃO é mais retirado da sobra. Na v2 a rota
    // "relaxada" (camada da legenda ausente do desenho) pegava toda a tinta da sua cor — as tomadas azuis sob o
    // eletroduto azul — e as escondia da alavanca camada × cor (+11 itens no lote quando isso saiu).
    const routeUsed = new Set();
    const routeItems = items.filter(it => it.sw.type === "ROTA");
    const routeKeys = new Map();
    for (const it of routeItems) {
      const lays = it.sw.routeLayers.filter(l => !GENERIC_LAYER_RE.test(l));
      const key = (lays.length ? "L:" + lays.join("+") : "C") + "|" + (it.sw.routeColor || "") + "|" + it.sw.routeDash;
      it.routeKey = key;
      let a = routeKeys.get(key); if (!a) { a = []; routeKeys.set(key, a); } a.push(it);
    }
    for (const [key, its] of routeKeys) {
      const it0 = its[0];
      const lays = new Set(it0.sw.routeLayers.filter(l => !GENERIC_LAYER_RE.test(l)));
      let pool = drawPrims.filter(p => !claimed.has(p.i) && p.stroke && (lays.size ? lays.has(p.layer) : true) && p.stroke === it0.sw.routeColor && p.dash === it0.sw.routeDash);
      let relaxedLayer = false;
      if (lays.size && !pool.some(p => p.len > it0.sw.mult * 20)) { pool = drawPrims.filter(p => !claimed.has(p.i) && p.stroke && p.stroke === it0.sw.routeColor && p.dash === it0.sw.routeDash && p.len > 3); relaxedLayer = true; }
      for (const it of its) it.relaxedLayer = relaxedLayer;
      const seen = new Set();
      let total = 0; const polys = [];
      for (const p of pool) routeUsed.add(p.i);
      const minSeg = it0.sw.mult > 1 ? Math.max(1.5, it0.sw.bandWidth * 1.6) : 0.5;
      for (const p of pool) {
        for (let i = 0; i < p.segs.length; i += 4) {
          let x1 = p.segs[i], y1 = p.segs[i + 1], x2 = p.segs[i + 2], y2 = p.segs[i + 3];
          const l = Math.hypot(x2 - x1, y2 - y1);
          if (l < minSeg) continue;
          if (x1 > x2 || (x1 === x2 && y1 > y2)) { [x1, x2] = [x2, x1];[y1, y2] = [y2, y1]; }
          const k = [x1, y1, x2, y2].map(v => Math.round(v * 5)).join(",");
          if (seen.has(k)) continue; seen.add(k);
          total += l; polys.push([x1, y1, x2, y2]);
        }
      }
      // band routes: every drawn segment should have a parallel partner at the band width
      let paired = null;
      if (it0.sw.mult > 1 && it0.sw.bandWidth > 0 && polys.length) {
        const bw = it0.sw.bandWidth; let ok = 0;
        for (const a of polys) {
          const dx = a[2] - a[0], dy = a[3] - a[1], L = Math.hypot(dx, dy); if (!L) continue;
          const nx = -dy / L, ny = dx / L, mx = (a[0] + a[2]) / 2, my = (a[1] + a[3]) / 2;
          if (polys.some(b => { if (b === a) return false; const ex = b[2] - b[0], ey = b[3] - b[1], M = Math.hypot(ex, ey); if (!M || Math.abs(dx * ey - dy * ex) / (L * M) > 0.03) return false;
            const d = Math.abs((b[0] - mx) * nx + (b[1] - my) * ny); if (Math.abs(d - bw) > Math.max(0.6, bw * 0.25)) return false;
            const t = ((mx - b[0]) * ex + (my - b[1]) * ey) / (M * M); return t > -0.02 && t < 1.02; })) ok += L;
        }
        paired = ok / total;
      }
      // a banda pode estar só no DESENHO: numa prancha 1:25 o ícone da legenda saiu com uma linha só, e as duas
      // linhas da eletrocalha eram somadas — 16,23 m onde há 8,11. Procura o parceiro paralelo no traçado.
      let multDesenho = it0.sw.mult;
      if (it0.sw.mult === 1 && polys.length > 2) {
        const dists = []; let comPar = 0, somaL = 0;
        for (const a of polys) {
          const dx = a[2] - a[0], dy = a[3] - a[1], L = Math.hypot(dx, dy); if (L < 1) continue;
          somaL += L;
          const nx = -dy / L, ny = dx / L, mx = (a[0] + a[2]) / 2, my = (a[1] + a[3]) / 2;
          let melhor = 0;
          for (const b of polys) {
            if (b === a) continue;
            const ex = b[2] - b[0], ey = b[3] - b[1], M = Math.hypot(ex, ey); if (!M || Math.abs(dx * ey - dy * ex) / (L * M) > 0.03) continue;
            const d = Math.abs((b[0] - mx) * nx + (b[1] - my) * ny);
            if (d < 0.2 || d > Math.min(20, L)) continue;
            const t = ((mx - b[0]) * ex + (my - b[1]) * ey) / (M * M); if (t <= -0.02 || t >= 1.02) continue;
            if (!melhor || d < melhor) melhor = d;
          }
          if (melhor) { comPar += L; dists.push(melhor); }
        }
        if (dists.length >= 3 && comPar >= somaL * 0.9) {
          const m = median(dists), fora = dists.filter(d => Math.abs(d - m) > m * 0.2).length;
          if (fora <= dists.length * 0.1) { multDesenho = 2; it0.bandaDoDesenho = +m.toFixed(2); }
        }
      }
      const lenBy: Record<string, number> = {}; for (const p of pool) lenBy[p.layer] = (lenBy[p.layer] || 0) + p.len;
      const layTot = Object.values(lenBy).reduce((a, b) => a + b, 0) || 1;
      const foundLayers = Object.keys(lenBy).filter(l => l).sort((a, b) => lenBy[b] - lenBy[a]);
      const domShare = foundLayers.length ? lenBy[foundLayers[0]] / layTot : 0;
      for (const it of its) { it.foundLayers = foundLayers; it.domShare = domShare; }
      let arc = 0; for (const p of pool) if (p.arcExtra && routeUsed.has(p.i)) arc += p.arcExtra;
      total += arc;
      const fit = null;
      const meters = total / multDesenho * PT_TO_MM * scale / 1000;
      for (const it of its) {
        it.qty = its.length > 1 ? null : Math.round(meters * 100) / 100;
        it.qtyGroup = Math.round(meters * 100) / 100;
        it.unit = "m"; it.shared = its.length > 1; it.segs = polys; it.matches = []; it.paired = paired; it.fittings = fit;
      }
    }


    const residual = [], sobras = [], porCamadaCor = new Map();   // residual: o que a tela oferece (colorido); sobras: TUDO que sobrou, para julgar o zero
    try {
      const neutral = c => !c || /^#(([0-9a-f]{2})\2\2)$/i.test(c);
      const refs = pointItems.map(i => i.sw && i.sw.size).filter(v => v > 0);
      const ref = refs.length ? median(refs) : 14;
      const rest = drawPrims.filter(p => !claimed.has(p.i) && p.len > 0 && pdiag(p) <= ref * 3 && (p.closed || p.fill || p.len <= ref * 2.2));
      if (rest.length < 80000) {
        const objs = cluster(rest, Math.max(0.3, ref * 0.06)).filter(o => { const z = objSize(o); return z >= ref * 0.45 && z <= ref * 3.2; });
        const groups = new Map();
        for (const o of objs) {
          const k = opSig(o); let g = groups.get(k);
          if (!g) { g = { sig: k, colors: colorSig(o), marks: [], prims: o.prims.length }; groups.set(k, g); }
          g.marks.push(o.bbox);
        }
        for (const g of groups.values()) if (g.marks.length >= 2) sobras.push(g);
        // CAMADA x COR: o desenho repetido da planta, separado pelo par que o CAD declara. É o canal que liga
        // um item ao desenho quando a FORMA não liga (ícone esquemático) — a cor do ícone aponta a camada.
        for (const o of objs) {
          const cnt = new Map();
          for (const p of o.prims) { const k = (p.layer || "") + "|" + (p.stroke || p.fill || ""); cnt.set(k, (cnt.get(k) || 0) + 1); }
          const k = [...cnt.entries()].sort((x, y) => y[1] - x[1])[0][0];
          const l = porCamadaCor.get(k) || []; l.push(o.bbox); porCamadaCor.set(k, l);
        }
        // a lista da TELA continua só com desenho colorido: preto e cinza estão em toda prancha e virariam ruído
        for (const g of sobras) if (!/^,?#?(([0-9a-f]{2})\2\2)?$/i.test((g.colors || "").split(",")[0].slice(1) || "")) residual.push(g);
        residual.sort((a, b) => b.marks.length - a.marks.length);
        residual.splice(12);
        for (const g of residual) { const c = g.colors.split(",")[0] || ""; g.color = c.slice(1); }
      }
    } catch (e) { }
    // ---- quando o ícone da legenda NÃO é o símbolo da planta ----
    // Duas alavancas, e as duas entregam a quantidade em MEDIA, com o método escrito. Nenhuma vira ALTA:
    // ALTA é identidade, e aqui a identidade não foi provada — o que se afirma é de onde o número veio.
    //
    // Medido no lote (30 folhas, 5 degraus de fidelidade x planta cega/vendo) antes de escrever:
    //   * ATRIBUIR POR FORMA foi RECUSADO: no degrau esquemático o grupo certo fica em 1º lugar pela nota do
    //     juiz em 3 de 18, e a atribuição exclusiva gulosa acerta 6 de 18 — inventaria número em dois terços;
    //   * a PROCEDÊNCIA da marca recusada não separa: `exact` e `relax` aparecem nos certos e nos errados;
    //   * `fw` separa: conjunto recusado com fw = 1,00 (todo traço do ícone ESTÁ ali, difere o preenchimento
    //     ou a planta tem detalhe a mais) acerta quantidade e posição em 10 de 10; fw 0,87 acerta 1 de 2 e
    //     fw 0,54 erra sempre.
    const assinaDe = (b, todos) => {
      const dentro = drawPrims.filter(p => (todos || !claimed.has(p.i)) && centerIn(p.bbox, b));
      return dentro.length ? opSig({ prims: dentro }) : null;
    };
    if (IDm && !opts.semJuiz) {
      // (a) a CONVENÇÃO DE LEGENDA: o desenho da planta é o do ícone, com preenchimento ou detalhe a mais.
      // Exige que TODO traço do ícone esteja ali (fw), que as recusadas sejam o MESMO desenho, e exclusividade.
      const contadas = new Map();
      for (const it of pointItems) if (it.qty && it.marks && it.marks.length) { const g = assinaDe(it.marks[0], true); if (g) contadas.set(g, it); }
      for (const it of pointItems) {
        if (it.sw.type !== "PONTO" || it.twinOf != null || !it.duvidas || it.duvidas.length < 2) continue;
        // com MOLDE apontado a convenção não se aplica: o desenho procurado já veio da PLANTA, não da legenda. O
        // parecido com "todo traço dele e mais alguma coisa" é outro símbolo que o contém (bench/clique.js: o
        // interruptor apontado somava 4 desenhos de uma fileira de outro material).
        if (it.molde) continue;
        if (!it.duvidas.every(d => (d.fw || 0) >= 0.95)) continue;
        // e o lugar tem o TAMANHO do ícone, num tamanho só: na hard011 as 24 recusadas eram fragmentos de
        // 0,2 pt de um ícone de 8 pt — dois por luminária, e o item saía com o dobro da quantidade
        const zi = it.bbox ? Math.hypot(it.bbox[2] - it.bbox[0], it.bbox[3] - it.bbox[1]) : 0;
        if (!zi) continue;
        const dz = it.duvidas.map(d => Math.hypot(d.bbox[2] - d.bbox[0], d.bbox[3] - d.bbox[1]));
        if (Math.min.apply(null, dz) < zi * 0.5 || Math.max.apply(null, dz) > zi * 2) continue;
        if (Math.max.apply(null, dz) > Math.min.apply(null, dz) * 1.1) continue;
        const sigs = it.duvidas.map(d => assinaDe(d.bbox, true));
        if (sigs.some(g => !g) || new Set(sigs).size !== 1) continue;
        const dono = contadas.get(sigs[0]);
        if (dono && dono !== it) continue;                       // este desenho já é de outro item
        it.convencao = { n: it.duvidas.length, sig: sigs[0], why: it.duvidas[0].why };
      }
      for (const a of pointItems) if (a.convencao) for (const b of pointItems) if (b !== a && b.convencao && b.convencao.sig === a.convencao.sig) a.convencao = null;

      // (b) a CAMADA APONTADA PELA COR do ícone. Cor não neutra, camada nomeada, e uma só de cada lado:
      // preto é a AUSÊNCIA de declaração de cor e não aponta nada (doutrina do v1), e cor que dois itens
      // usam não escolhe entre eles.
      const corDe = it => [...new Set((it.prims || []).map(p => p.stroke || p.fill).filter(c => c && !IDm.isNeutral(c)))];
      for (const it of pointItems) if (it.convencao) contadas.set(it.convencao.sig, it);
      const zerados = pointItems.filter(it => it.sw.type === "PONTO" && it.twinOf == null && !it.qty && !it.convencao);
      for (const it of zerados) {
        const cores = corDe(it);
        if (cores.length !== 1) continue;
        if (pointItems.some(o => o !== it && o.twinOf == null && corDe(o).includes(cores[0]))) continue;
        const z = it.bbox ? Math.hypot(it.bbox[2] - it.bbox[0], it.bbox[3] - it.bbox[1]) : 0;
        if (!z) continue;
        const doTam = l => l.filter(b => { const d = Math.hypot(b[2] - b[0], b[3] - b[1]); return d >= z * 0.4 && d <= z * 2.5; });
        const umDesenho = l => {                                  // o mesmo desenho, repetido
          const por = new Map();
          for (const b of l) { const g = assinaDe(b, true); if (!g) continue; (por.get(g) || por.set(g, []).get(g)).push(b); }
          const ord = [...por.values()].sort((a, b) => b.length - a.length);
          if (ord.length !== 1) return null;
          // e inserido numa ESCALA SÓ: bloco repetido tem um tamanho. Dois tamanhos com a mesma assinatura
          // são dois desenhos parecidos, não o mesmo bloco — é o que separava a cnt022 (0,94 e 1,11) das
          // folhas do lote (0,87 em todas as oito).
          const ds = ord[0].map(b => Math.hypot(b[2] - b[0], b[3] - b[1]));
          if (Math.max.apply(null, ds) > Math.min.apply(null, ds) * 1.1) return null;
          return ord[0];
        };
        const cands = [];
        for (const [k, l] of porCamadaCor) {
          if (k.split("|")[1] !== cores[0] || GENERIC_LAYER_RE.test(k.split("|")[0])) continue;
          const m = umDesenho(doTam(l));
          if (m && m.length >= 2 && !contadas.get(assinaDe(m[0], true))) cands.push([k.split("|")[0], m]);
        }
        if (cands.length !== 1) continue;
        if (typeof process !== "undefined" && process.env && process.env.TRACECOR) { const m = cands[0][1]; const r = m.map(b => Math.hypot(b[2]-b[0], b[3]-b[1]) / z).sort((x,y)=>x-y); console.log("COR", (it.name||"").slice(0,22), "camada", cands[0][0], "n", m.length, "razão de tamanho", r[0].toFixed(2), r[r.length>>1].toFixed(2), r[r.length-1].toFixed(2)); }
        it.porCor = { camada: cands[0][0], cor: cores[0], marks: cands[0][1] };
      }
    }

    // ---- o MESMO desenho em DOIS TAMANHOS na legenda ----
    // Não são gêmeos (gêmeo tem o mesmo tamanho), mas a busca não enxerga escala: o primeiro da lista levava todas
    // as ocorrências. Cada ocorrência vai para o item cujo ícone tem o tamanho mais parecido com o dela.
    // (pub11: o símbolo repetido num aviso, maior, roubava as 7 ocorrências do item de verdade da legenda.)
    const diagB = b => Math.hypot(b[2] - b[0], b[3] - b[1]) || 1;
    for (const a of pointItems) for (const b of pointItems) {
      if (a.idx >= b.idx || a.twinOf != null || b.twinOf != null || a.molde || b.molde) continue;
      if (a.sw.sig !== b.sw.sig || descDist(a.sw.desc, b.sw.desc) >= 0.06 || mesmoTamanho(a.bbox, b.bbox)) continue;
      const todas = [], visto = new Set();
      for (const m of (a.marks || []).concat(b.marks || [])) { const k = Math.round((m[0] + m[2]) * 2) + ":" + Math.round((m[1] + m[3]) * 2); if (!visto.has(k)) { visto.add(k); todas.push(m); } }
      if (!todas.length) continue;
      const da = diagB(a.bbox), db = diagB(b.bbox), ma = [], mb = [];
      for (const m of todas) (Math.abs(Math.log(diagB(m) / da)) <= Math.abs(Math.log(diagB(m) / db)) ? ma : mb).push(m);
      a.marks = ma; a.qty = ma.length; b.marks = mb; b.qty = mb.length;
      a.porTamanho = b.porTamanho = true;
    }
    // ---- confidence ----
    for (const it of items) {
      const notes = [];
      let conf, semMarca = false;
      if (it.sw.type === "NOTA") { conf = "REFERENCIA"; notes.push("Notação da simbologia — não é material."); }
      else if (it.sw.type === "PONTO") {
        if (it.twinSplit) {
          const t = it.twinSplit;
          conf = t.un === 0 ? (t.n ? "ALTA" : "ZERO") : "MEDIA";
          if (conf === "ALTA" && it.ident && it.ident.rej) { conf = "MEDIA"; notes.push(it.ident.rej + " desenho(s) parecido(s) ficaram de fora — confira."); }
          notes.push("Ícone idêntico a outro(s) item(ns): separado pela etiqueta de texto ao lado de cada símbolo." + (t.un ? " " + t.un + " ocorrência(s) sem etiqueta legível — confira." : ""));
        }
        else if (it.twinOf != null) { conf = "MEDIA"; notes.push("Mesmo desenho de “" + it.twinName + "”: a contagem está somada naquele item. Separe pelas tags ao lado de cada símbolo."); }
        else if (it.qty === 0 && it.ambiguous) { conf = "MEDIA"; notes.push("O contorno do ícone lembra mais de um desenho da planta (" + it.ambiguous + " candidatos) e nenhum é inequívoco: conte à mão — isto não é zero."); }
        else if (it.convencao) {
          // um símbolo por LUGAR: a recusada que cai em cima de uma marca já contada é a MESMA ocorrência,
          // e somá-la contava a luminária duas vezes (medido na hard011: 24 marcas em 12 posições)
          // o MESMO LUGAR é sobreposição, e não distância entre centros: a recusada pode ser o símbolo
          // inteiro e a contada um pedaço dele, com centros afastados (medido na hard011: 24 marcas em 12
          // posições, porque a régua de centro não alcançava)
          const mesmoLugar = (a, b) => {
            const cx = (a[0] + a[2]) / 2, cy = (a[1] + a[3]) / 2, dx = (b[0] + b[2]) / 2, dy = (b[1] + b[3]) / 2;
            return (cx >= b[0] && cx <= b[2] && cy >= b[1] && cy <= b[3]) || (dx >= a[0] && dx <= a[2] && dy >= a[1] && dy <= a[3]);
          };
          const antes = it.marks || [], novas = [];
          for (const d of it.duvidas) {
            if (antes.concat(novas).some(b => mesmoLugar(b, d.bbox))) continue;
            novas.push(d.bbox);
          }
          if (!novas.length) { conf = "MEDIA"; notes.push("As " + it.duvidas.length + " ocorrência(s) recusadas são as mesmas já contadas."); }
          else {
            it.marks = antes.concat(novas); it.qty = it.marks.length; conf = "MEDIA";
            notes.push((antes.length ? antes.length + " ocorrência(s) conferida(s) e mais " : "") + novas.length + " ocorrência(s) do MESMO desenho, que tem todo traço do ícone e mais alguma coisa (" + it.convencao.why + ") — é a convenção de legenda, em que o símbolo aparece em contorno na legenda e preenchido na planta. Confira antes de comprar: isto não é medida.");
          }
        }
        else if (it.qty === 0 && it.porCor) {
          it.qty = it.porCor.marks.length; it.marks = it.porCor.marks; conf = "MEDIA";
          notes.push("O desenho da planta não é o ícone da legenda. Mas a camada " + it.porCor.camada + " tem " + it.porCor.marks.length + " desenho(s) repetido(s) na MESMA COR do ícone, e nenhum outro item da legenda usa essa cor. Número DECLARADO pela camada, não medido pelo símbolo — confira antes de comprar.");
        }
        else if (it.qty === 0 && it.duvidas && it.duvidas.length) { conf = "MEDIA"; notes.push("Achei " + it.duvidas.length + " desenho(s) parecido(s) com o ícone, e nenhum é ele (" + it.duvidas[0].why + "). Se existir, aponte um na planta — isto não é zero."); }
        else if (it.qty === 0) {
          // "não compre" exige que houvesse ONDE procurar: se sobrou na planta desenho repetido do tamanho deste
          // ícone e sem dono, o zero não está verificado — é "não achei". (Doutrina do Orcer v1: o sósia derruba o zero.)
          const z = it.bbox ? Math.hypot(it.bbox[2] - it.bbox[0], it.bbox[3] - it.bbox[1]) : 0;
          const sosias = z ? sobras.filter(g => { const b = g.marks[0], d = Math.hypot(b[2] - b[0], b[3] - b[1]); return d >= z * 0.5 && d <= z * 2; }) : [];
          if (sosias.length) { conf = "MEDIA"; notes.push("Não achei este símbolo, mas sobraram " + sosias.reduce((a, g) => a + g.marks.length, 0) + " desenho(s) repetido(s) sem dono, do tamanho dele. Aponte um na planta se for este material — isto não é zero."); }
          else { conf = "ZERO"; notes.push("Nenhuma ocorrência deste símbolo fora da legenda, e nenhum desenho repetido sem dono que pudesse ser ele."); }
        }
        else {
          notes.push(it.qty + " ocorrência(s) encontrada(s)" + (it.onLayer > 0.99 && it.sw.mainLayer && !/^\d+R$/.test(it.sw.mainLayer) ? " · camada " + it.sw.mainLayer : ""));
          if (it.ident) {
            // ALTA é IDENTIDADE: toda ocorrência contada é o ícone nos dois sentidos, nenhuma parecida foi recusada,
            // e um ícone de forma pobre (um primitivo só) precisa da COR como segunda testemunha.
            const J = it.ident, corOk = !it.relaxed && !J.neutro;
            // a pessoa é testemunha: apontou o molde, ou olhou e confirmou
            const pessoa = !!(it.molde || (opts.confirmar && opts.confirmar[it.idx]));
            conf = "ALTA";
            if (J.rej) { conf = "MEDIA"; notes.push(J.rej + " desenho(s) parecido(s) ficaram de fora (" + it.duvidas[0].why + "): confira se algum é este material."); }
            if (J.pobre && !corOk && !pessoa) { conf = "MEDIA"; notes.push("O ícone é uma forma simples e " + (it.relaxed ? "a cor da planta difere da legenda" : "não tem cor própria") + ": outra coisa da planta pode ter o mesmo desenho. Confira."); }
            if (it.gemeos && it.gemeos.size && !(opts.confirmar && opts.confirmar[it.idx])) { conf = "MEDIA"; notes.push("Mesmo desenho de “" + [...it.gemeos.values()].map(g => (opts.names && opts.names[g.idx]) || g.name || "outro item").join("”, “") + "”, na mesma cor: não sei separar qual é qual. Confira."); }
            const auto = !!(it.molde && opts.moldeAuto && opts.moldeAuto[it.idx]);
            if (it.molde && !auto) notes.push("Contado pelo desenho que você apontou na planta.");
            // O MOLDE AUTOMÁTICO: o ícone da legenda não aparece igual na planta, e o motor escolheu sozinho o desenho
            // repetido da planta que mais se parece com ele. Identidade não provada contra uma PESSOA: fica MEDIA.
            if (auto) { conf = "MEDIA"; notes.push("O ícone da legenda não aparece igual na planta: contei pelo desenho repetido que mais se parece com ele (" + opts.moldeAuto[it.idx] + "). Confira."); }
            // o molde que só acha A SI MESMO não provou nada: o exemplar apontado sempre casa com ele mesmo. Medido
            // (bench/clique.js): o retângulo em volta do quadro pegou dois traços da PAREDE onde ele está preso, e o
            // molde "quadro + parede" só existia ali — saía ALTA 1 onde havia 4. A prova é achar OUTRO igual.
            if (it.molde && !auto && it.qty === 1 && !(opts.confirmar && opts.confirmar[it.idx])) { conf = "MEDIA"; notes.push("Só achei o exemplar que você apontou. Se há outros na planta, o retângulo pegou mais que o símbolo (parede, fio, texto): aponte de novo, justo em volta dele. Se ele é único, confira e confirme."); }
            if (it.aceitou) notes.push(it.aceitou + " parecida(s) incluída(s) por você.");
            if (it.recusou) notes.push(it.recusou + " parecida(s) descartada(s) por você.");
            if (opts.confirmar && opts.confirmar[it.idx]) notes.push("Conferido por você.");
            if (it.relaxed && conf === "ALTA") notes.push("Cor diferente da legenda; o desenho é idêntico ao ícone.");
          } else {
            conf = "ALTA";
            if (it.relaxed) { conf = "MEDIA"; notes.push("Cor diferente da legenda — casado só pela forma."); }
          }
          if (it.posed) notes.push(it.posed + " confirmada(s) pelo contorno completo do ícone (traço diferente ou colado).");
          if (it.twins) { conf = "MEDIA"; notes.push("Inclui itens com ícone idêntico na legenda."); }
          if (it.porTamanho) { conf = "MEDIA"; notes.push("A legenda tem este mesmo desenho em outro tamanho, noutro item: separei as ocorrências pelo tamanho na planta. Confira."); }
          if (it.partialFit) { conf = "MEDIA"; notes.push(it.partialFit + " ocorrência(s) com partes faltando — confira."); }
          if (it.rejectedScale) notes.push(it.rejectedScale + " forma(s) parecida(s) em outra escala ignorada(s).");
        }
      } else {
        // ROTA de ícone sem marca própria (linha preta lisa) casa com qualquer linha: na pub1 o motor mediu
        // 387 m da camada A-WALL, que é parede de arquitetura, e deu ALTA. Mesma doutrina do ícone de forma
        // pobre nos pontos: sem cor própria nem tracejado, falta testemunha.
        semMarca = it.sw.type === "ROTA" && !it.sw.routeDash && IDm && IDm.isNeutral(it.sw.routeColor);
        if (it.shared) { conf = "MEDIA"; it.qty = it.qtyGroup; notes.push("Mesma camada/cor de outra rota da legenda: total do grupo."); }
        else if (!it.qty) { conf = "ZERO"; notes.push("Nenhum trecho desta rota no desenho."); }
        else if (it.relaxedLayer && it.domShare >= 0.97 && !items.some(o => o !== it && o.sw.type === "ROTA" && o.sw.routeColor === it.sw.routeColor && o.sw.routeDash === it.sw.routeDash)) { conf = "ALTA"; notes.push("Ícone da legenda em camada de legenda; no desenho a cor e o traço exclusivos caem numa camada só (" + it.foundLayers[0] + ")."); }
        else if (it.relaxedLayer) { conf = "MEDIA"; notes.push("Camada da legenda não aparece no desenho — medido por cor e tipo de traço."); }
        else if (it.sw.routeLayers.some(l => !GENERIC_LAYER_RE.test(l))) { conf = "ALTA"; notes.push((it.sw.routeLayers.some(l => /^\d+R$/.test(l)) ? "Camada própria" : "Camada " + it.sw.routeLayers.join("+")) + (it.sw.mult > 1 ? " · banda de " + it.sw.mult + " linhas" : it.bandaDoDesenho ? " · banda de 2 linhas achada no desenho (" + it.bandaDoDesenho + " pt)" : "")); }
        else {
          const sameKey = items.filter(o => o !== it && o.sw.type === "ROTA" && o.sw.routeColor === it.sw.routeColor && o.sw.routeDash === it.sw.routeDash).length;
          if (false) {}
          else if (!sameKey && it.paired != null && it.paired >= 0.95) { conf = "ALTA"; notes.push("Cor exclusiva da legenda · " + Math.round(it.paired * 100) + "% do traçado confirmado como banda de " + it.sw.mult + " linhas."); }
          else if (!sameKey && it.sw.routeDash) { conf = "ALTA"; notes.push("Cor e tracejado exclusivos deste item."); }
          else { conf = "MEDIA"; notes.push("Sem camada própria — medido por cor/traço" + (it.paired != null ? " (" + Math.round(it.paired * 100) + "% em banda dupla)" : "") + "."); }
        }
      }
      if (it.sw.type === "ROTA" && conf === "ALTA" && semMarca) { conf = "MEDIA"; notes.push("O traço da legenda é uma linha preta lisa, sem cor nem tracejado próprios: casa com qualquer linha do desenho. Confira antes de comprar."); }

      if (it.sw.type === "PONTO" && conf === "ALTA" && it.prims && it.prims.length === 1 && /^M(L{1,2})$/.test(it.prims[0].ops) && !it.prims[0].fill) { conf = "MEDIA"; notes.push("Ícone de um só traço reto: simples demais para servir de prova — confira."); }
      if (it.xref && it.sw.type !== "NOTA") { notes.push("A legenda diz que este material já está em outro desenho: não some com a outra prancha."); conf = "NAO_SOMAR"; }
      if (it.fromLibrary) notes.push("Ícone da legenda de " + (typeof it.fromLibrary === "string" ? it.fromLibrary : "outra prancha") + ".");
      it.conf = conf; it.note = notes.join(" ");
      if (!it.name) it.name = "";
    }
    // ---- ink nobody explains: repeated coloured shapes no item claimed ----
    // library icons that do not occur on this sheet are noise here
    if (items.some(it => it.fromLibrary)) items = items.filter(it => !it.fromLibrary || (it.qty != null && it.qty > 0) || it.qty == null);
    // ---- o CLIQUE AUTOMÁTICO ----
    // Item que saiu zerado com desenho repetido SEM DONO na planta: o motor faz sozinho o que a pessoa faria —
    // escolhe o grupo que mais se parece com o ícone e aponta um exemplar dele como molde. "Parece" é CONTENÇÃO:
    // o desenho da planta cabe no ícone ou o ícone cabe no desenho (a planta simplifica ou detalha o símbolo),
    // num tamanho parecido, e cada grupo vai para um item só. Medido no lote: +14 itens exatos em 120, 0 piora;
    // estável de 0,80 a 0,90 no limiar. Grupo de 3 ou mais desenhos. Sai sempre MEDIA, com o método escrito.
    if (IDm && !opts.semJuiz && !opts.semAuto && sobras.length) {
      const zer = pointItems.filter(it => !it.qty && it.twinOf == null && !it.molde && !it.convencao && !it.porCor && it.prims && it.prims.length && !(opts.molde && opts.molde[it.idx]));
      if (zer.length) {
        const ix = IDm.index(drawPrims);
        const contadas = items.filter(it => it.qty).flatMap(it => it.marks || []);
        const perto = (a, b) => Math.abs((a[0] + a[2]) / 2 - (b[0] + b[2]) / 2) < 2 && Math.abs((a[1] + a[3]) / 2 - (b[1] + b[3]) / 2) < 2;
        const livres = sobras.filter(g => !g.marks.some(b => contadas.some(u => perto(u, b))));
        const pares = [];
        for (const it of zer) {
          const ic = IDm.icon(it.prims); if (!ic) continue;
          const zi = Math.hypot(ic.box[2] - ic.box[0], ic.box[3] - ic.box[1]) || 1;
          const cands = livres.map(g => { const b = g.marks[0]; return { g, z: Math.hypot(b[2] - b[0], b[3] - b[1]) / zi }; })
            .filter(c => c.z >= 0.5 && c.z <= 2).sort((a, b) => Math.abs(Math.log(a.z)) - Math.abs(Math.log(b.z))).slice(0, 40);
          for (const { g, z } of cands) {
            // dois desenhos iguais sem dono podem ser coincidência (hard017, hard023: zero verdadeiro que virava 2);
            // três já é padrão repetido
            if (g.marks.length < 3) continue;
            const v = IDm.verify(ic, g.marks[0], ix);
            const mx = Math.max(v.fw, v.rv), mn = Math.min(v.fw, v.rv);
            if (mx < 0.85 || mn < 0.5) continue;
            pares.push({ it, g, nota: (mx + mn) / 2 - 0.3 * Math.abs(Math.log(z)) + 0.02 * Math.log(g.marks.length), fw: v.fw, rv: v.rv });
          }
        }
        pares.sort((a, b) => b.nota - a.nota);
        const molde = Object.assign({}, opts.molde || {}), auto = {}, ja = new Set(), jaG = new Set();
        for (const p of pares) {
          if (ja.has(p.it) || jaG.has(p.g)) continue;
          ja.add(p.it); jaG.add(p.g);
          const b = p.g.marks[0]; molde[p.it.idx] = [b[0] - 1.5, b[1] - 1.5, b[2] + 1.5, b[3] + 1.5];
          if (typeof process !== "undefined" && process.env && process.env.DBGAUTO) console.log("AUTO", (p.it.name || "").slice(0, 30), "fw", p.fw.toFixed(2), "rv", p.rv.toFixed(2), "n", p.g.marks.length, "nota", p.nota.toFixed(3), "caixa", b.map(v => v.toFixed(1)).join(","));
          auto[p.it.idx] = p.fw >= p.rv ? "o desenho tem todo traço do ícone e mais detalhe" : "o desenho é uma versão simplificada do ícone";
        }
        if (Object.keys(auto).length) {
          const R2 = takeoff(sheet, Object.assign({}, opts, { molde, moldeAuto: Object.assign({}, opts.moldeAuto || {}, auto), semAuto: true }));
          // o molde que não passou como ele mesmo, ou que só achou a si mesmo, não vale: volta o zero
          R2.items = R2.items.map(x => (auto[x.idx] && (!x.molde || !x.moldeProprio || !(x.qty >= 3))) ? (items.find(v => v.idx === x.idx) || x) : x);
          return R2;
        }
      }
    }
    return { items, scale, legendRect, legendRects: tightRects, hasLayers, residual, sobras };
  }


  function detectScale(sheet) {
    const counts = {};
    for (const t of sheet.texts) {
      const m = t.str.match(/(?:^|[^\d])1\s*[:\/]\s*(\d{1,4})(?!\d)/);
      if (m) { const d = +m[1]; if ([10, 20, 25, 50, 75, 100, 125, 200, 250, 500, 1000].includes(d)) counts[d] = (counts[d] || 0) + (/ESC/i.test(t.str) ? 3 : 1); }
    }
    const best = Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0];
    return best ? { value: +best, auto: true } : { value: 50, auto: false };
  }

  // apenas: lista de páginas a analisar (1-based). As páginas são independentes entre si — nada é levado de
  // uma para a outra —, então dá para medir/ler em paralelo, uma por processo.
  async function analyzeDocument(pdfjsLib: any, doc: any, onProgress?: (n: number, total: number, etapa: string) => void, apenas?: number[] | null): Promise<Folha[]> {
    let ocGroups = {};
    try {
      const cfg = await doc.getOptionalContentConfig();
      if (cfg) {
        const g = cfg.getGroups ? cfg.getGroups() : null;
        if (g) for (const id of Object.keys(g)) ocGroups[id] = { name: g[id].name };
        else if (cfg[Symbol.iterator]) for (const [id, grp] of cfg) ocGroups[id] = { name: grp.name };
      }
    } catch (e) { }
    const sheets = [];
    for (let n = 1; n <= doc.numPages; n++) {
      if (apenas && apenas.indexOf(n) < 0) continue;
      onProgress && onProgress(n, doc.numPages, "vetores");
      const s = await parsePage(pdfjsLib, doc, n, ocGroups);
      const sc = detectScale(s);
      s.scale = sc.value; s.scaleAuto = sc.auto;
      const LX = LEGENDX;
      const VOx = VOCR;
      const fx = LX ? LX.detect(s, { cluster, VO: VOx, isTextPrim, opSig, mkObj }) : null;
      if (fx && fx.items.length) s.legend = { rect: fx.rects[0], rects: fx.rects, items: fx.items, method: fx.method, header: "" };
      else {
        s.legend = detectLegend(s);
        // the geometric fallback is for sheets WITHOUT readable text; with text around, a column of short labels is not a legend
        if (s.legend && s.legend.method === "geometria" && s.texts.length >= 5) {
          const probe = readLegend(s, s.legend.rect);
          const lens = probe.map(it => (it.name || "").replace(/[^0-9A-Za-zÀ-ÿ]/g, "").length).sort((a, b) => a - b);
          if (!probe.length || lens[lens.length >> 1] < 8) s.legend = null;
        }
      }
      s.result = takeoff(s, {});
      sheets.push(s);
    }
    return sheets;
  }

  export { parsePage, detectLegend, readLegend, takeoff, detectScale, analyzeDocument, cluster, opSig, mkObj };
