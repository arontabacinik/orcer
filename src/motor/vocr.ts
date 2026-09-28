// Leitor de texto em TRAÇO (fontes SHX/Hershey do CAD), sem OCR de imagem: cada letra é comparada com o
// desenho das letras das fontes de CAD.
import HERSHEY from "./hershey.json";
/* Orcer vector OCR — reads text drawn as strokes (SHX / Hershey-like CAD fonts) with no image OCR. */

  const DATA = HERSHEY;
  const N = 28;
  function sampleStrokes(strokes, n) { // strokes: [[ [x,y],... ]]
    let L = 0; const segs = [];
    // comprimento NÃO FINITO existe: um grupo de glifos de altura zero normaliza dividindo por zero, e daí
    // sai Infinity. Com step infinito o laço abaixo nunca termina e o array estoura — era o RangeError que
    // derrubava o Node na gov-joinville e, depois da frente da legenda, também na pub1.
    for (const s of strokes) for (let i = 1; i < s.length; i++) {
      const l = Math.hypot(s[i][0] - s[i - 1][0], s[i][1] - s[i - 1][1]);
      if (!isFinite(l)) continue;
      segs.push([s[i - 1], s[i], l]); L += l;
    }
    const out = [];
    if (!isFinite(L) || L < 1e-9) { for (const s of strokes) for (const p of s) if (isFinite(p[0]) && isFinite(p[1])) out.push(p[0], p[1]); return out; } // dots
    const step = L / n; let carry = 0;
    const teto = Math.max(16, n * 4);                   // amostras de sobra; nenhum glifo precisa de mais
    for (const [a, b, l] of segs) {
      let t = carry;
      while (t <= l && out.length < teto * 2) { out.push(a[0] + (b[0] - a[0]) * t / (l || 1), a[1] + (b[1] - a[1]) * t / (l || 1)); t += step; }
      carry = t - l;
    }
    return out;
  }
  const TPL = [];
  for (const font of Object.keys(DATA || {})) for (const ch of Object.keys(DATA[font])) {
    const st = DATA[font][ch];
    let w = 0, y0 = Infinity, y1 = -Infinity; for (const s of st) for (const p of s) { if (p[0] > w) w = p[0]; if (p[1] < y0) y0 = p[1]; if (p[1] > y1) y1 = p[1]; }
    TPL.push({ ch, font, w, y0, y1, pts: sampleStrokes(st, N), ns: st.length });
  }
  function cham(A, B) { let s = 0; for (let i = 0; i < A.length; i += 2) { let m = Infinity; for (let j = 0; j < B.length; j += 2) { const dx = A[i] - B[j], dy = A[i + 1] - B[j + 1], d = dx * dx + dy * dy; if (d < m) m = d; } s += Math.sqrt(m); } return s / (A.length / 2); }
  function classify(pts, w, y0, y1) {
    let best = null, bd = Infinity, second = Infinity;
    for (const t of TPL) {
      if (Math.abs(t.y0 - y0) > 0.45 || Math.abs(t.y1 - y1) > 0.45) continue;
      const d = Math.max(cham(pts, t.pts), cham(t.pts, pts)) + 0.35 * Math.abs(t.w - w);
      if (d < bd) { if (!best || best.ch !== t.ch) second = bd; bd = d; best = t; } else if (d < second && t.ch !== (best && best.ch)) second = d;
    }
    return best ? { ch: best.ch, d: bd, margin: second - bd } : null;
  }
  const LEX = ("TOMADA TOMADAS ELETROCALHA ELETRODUTO ELETRODUTOS PERFILADO LUMINÁRIA LUMINÁRIAS INTERRUPTOR INTERRUPTORES SIMPLES PARALELO QUADRO QUADROS DISTRIBUIÇÃO PONTO PONTOS DADOS VOZ FORÇA REDE COMUM ESTABILIZADA EMBUTIR SOBREPOR PISO PAREDE TETO FORRO BAIXA MÉDIA ALTA ALTURA NOVO NOVA NOVOS EXISTENTE EXISTENTES REMANEJAR REMANEJADO CONDULETE CAIXA CAIXAS SENSOR PRESENÇA CÂMERA ACESSO CONTROLE LEITORA WIRELESS CABO CABOS CABEAMENTO INFRAESTRUTURA SAÍDA DISJUNTOR TERMINAL BARRAMENTO ATERRAMENTO EMERGÊNCIA LISA PERFURADA TAMPA VERTICAL HORIZONTAL DESCIDA SUBIDA ESPERA INTERLIGAÇÃO LUZ ILUMINAÇÃO ARANDELA PENDENTE PLAFON TUBULAR TRILHO MONOFÁSICO BIFÁSICO TRIFÁSICO CIRCUITO CONDUTOR COBRE AÇO GALVANIZADO FLEXÍVEL RÍGIDO CORRUGADO MOBILIÁRIO ORIENTATIVA PREVISTA DESENHO LEGENDA SIMBOLOGIA NOTAS ENERGIA ELÉTRICA ELÉTRICO TELEFONIA LÓGICA INFORMÁTICA SEGURANÇA ALARME INCÊNDIO DETECTOR FUMAÇA ACIONADOR SIRENE").split(" ");
  const strip = w => w.normalize("NFD").replace(/[̀-ͯ]/g, "");
  const LEXN = LEX.map(w => [strip(w), w]);
  function lev(a, b) { const m = a.length, n = b.length; const d = Array.from({ length: m + 1 }, (_, i) => [i]); for (let j = 1; j <= n; j++) d[0][j] = j; for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); return d[m][n]; }
  function fixWord(w) {
    if (!/^[A-ZÀ-Ú]{4,}$/i.test(w) || w !== w.toUpperCase()) return w;
    const s = strip(w); let best = null, bd = 9;
    for (const [n, orig] of LEXN) { if (Math.abs(n.length - s.length) > 1) continue; const d = lev(s, n); if (d < bd) { bd = d; best = orig; } }
    return best && bd <= (s.length >= 7 ? 2 : 1) ? best : w;
  }
  const ACC = { "A~": "Ã", "O~": "Õ", "A´": "Á", "E´": "É", "I´": "Í", "O´": "Ó", "U´": "Ú", "A^": "Â", "E^": "Ê", "O^": "Ô", "A`": "À" };
  // prims: engine primitives ({segs, pts, bbox}); returns {text, lines, score}
  function readBlock(prims: any[], opts?: any): any {
    opts = opts || {};
    const strokes = [];
    for (const p of prims) { const s = p.segs; if (!s || !s.length) continue; const poly = [[s[0], s[1]]]; for (let i = 0; i < s.length; i += 4) poly.push([s[i + 2], s[i + 3]]); strokes.push(poly); }
    if (!strokes.length) return null;
    let best = null;
    const angles = opts.angles || [0, Math.PI / 2, -Math.PI / 2, Math.PI];
    for (const a of angles) {
      const c = Math.cos(-a), s = Math.sin(-a);
      const rs = strokes.map(st => st.map(([x, y]) => [x * c - y * s, x * s + y * c]));
      const r = readOriented(rs);
      if (!r) continue;
      r.angle = a;
      // upright reading wins unless a rotation is clearly better (rotated letters often mimic other letters)
      const sc = a === 0 ? r.score : r.score / 0.7;
      if (!best || sc < best._s) { best = r; best._s = sc; }
      if (a === 0 && r.score < 0.06) break;
    }
    return best;
  }
  function bboxOf(st) { let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity; for (const p of st) { if (p[0] < x0) x0 = p[0]; if (p[0] > x1) x1 = p[0]; if (p[1] < y0) y0 = p[1]; if (p[1] > y1) y1 = p[1]; } return [x0, y0, x1, y1]; }
  function readOriented(strokes): any {
    const items = strokes.map(st => ({ st, b: bboxOf(st) }));
    // lines: group by vertical overlap of stroke boxes
    const hs = items.map(i => i.b[3] - i.b[1]).filter(h => h > 0).sort((a, b) => a - b);
    const hRef = hs.length ? hs[Math.floor(hs.length * 0.8)] : 1;
    if (!(hRef > 0)) return null;
    // text lines = runs of overlapping vertical extents
    items.sort((p, q) => p.b[1] - q.b[1]);
    const lines = [];
    for (const it of items) {
      const L = lines[lines.length - 1];
      if (L && it.b[1] <= L.y1 + hRef * 0.12) { L.items.push(it); L.y1 = Math.max(L.y1, it.b[3]); continue; }
      lines.push({ y0: it.b[1], y1: it.b[3], items: [it] });
    }
    // accents sit just above their line: glue a thin line to the next one
    for (let i = 0; i < lines.length - 1; i++) if (lines[i].y1 - lines[i].y0 < hRef * 0.4 && lines[i + 1].y0 - lines[i].y1 < hRef * 0.35) { lines[i + 1].items.push(...lines[i].items); lines[i + 1].y0 = lines[i].y0; lines.splice(i, 1); i--; }
    lines.sort((a, b) => a.y0 - b.y0);
    let total = 0, count = 0; const outLines = [];
    for (const L of lines) {
      // glyphs: merge strokes whose x-extents overlap
      const its = L.items.sort((p, q) => p.b[0] - q.b[0]);
      const glyphs = [];
      for (const it of its) {
        const g = glyphs[glyphs.length - 1];
        if (g) {
          const ov = Math.min(g.b[2], it.b[2]) - Math.max(g.b[0], it.b[0]);
          const wmin = Math.max(Math.min(g.b[2] - g.b[0], it.b[2] - it.b[0]), hRef * 0.05);
          const e = hRef * 0.03;
          const contain = (it.b[0] >= g.b[0] - e && it.b[2] <= g.b[2] + e) || (g.b[0] >= it.b[0] - e && g.b[2] <= it.b[2] + e);
          const ends = [it.st[0], it.st[it.st.length - 1]];
          const touch = ov > -e && g.st.some(s2 => s2.some(p => ends.some(q => Math.hypot(p[0] - q[0], p[1] - q[1]) < e)) || ends.some(q => [s2[0], s2[s2.length - 1]].some(p => Math.hypot(p[0] - q[0], p[1] - q[1]) < e)));
          const twin = -ov < hRef * 0.07 && ((it.b[2] - it.b[0]) < hRef * 0.12 || (g.b[2] - g.b[0]) < hRef * 0.12) && Math.min(g.b[3], it.b[3]) - Math.max(g.b[1], it.b[1]) > 0.6 * Math.min(g.b[3] - g.b[1], it.b[3] - it.b[1]); // duplex fonts: doubled strokes
          if ((ov > -hRef * 0.02 && (contain || touch || ov >= wmin * 0.3)) || twin) { g.st.push(it.st); g.b = [Math.min(g.b[0], it.b[0]), Math.min(g.b[1], it.b[1]), Math.max(g.b[2], it.b[2]), Math.max(g.b[3], it.b[3])]; continue; }
          if (ov > -hRef * 0.02 && it.b[2] - it.b[0] < hRef * 0.05 && g.b[2] - g.b[0] < hRef * 0.05) { g.st.push(it.st); g.b = [Math.min(g.b[0], it.b[0]), Math.min(g.b[1], it.b[1]), Math.max(g.b[2], it.b[2]), Math.max(g.b[3], it.b[3])]; continue; }
        }
        glyphs.push({ st: [it.st], b: it.b.slice() });
      }
      const tall = glyphs.map(g => g.b[3] - g.b[1]).sort((a, b) => b - a);
      const capH = tall.length ? tall[Math.min(tall.length - 1, Math.floor(tall.length * 0.3))] : hRef;
      const bottoms = glyphs.filter(g => g.b[3] - g.b[1] > capH * 0.8).map(g => g.b[3]).sort((a, b) => a - b);
      const base = bottoms.length ? bottoms[bottoms.length >> 1] : L.y1;
      const top = base - capH;
      let text = "", prevR = null;
      for (const g of glyphs) {
        let accent = null, main = g.st;
        const above = g.st.filter(s => bboxOf(s)[3] < top - capH * 0.04);
        if (above.length && above.length < g.st.length) {
          main = g.st.filter(s => !above.includes(s));
          const ab = bboxOf([].concat(...above)); const w = ab[2] - ab[0], h = ab[3] - ab[1];
          const pts = [].concat(...above); let turns = 0; for (let i = 2; i < pts.length; i++) { const d1 = pts[i - 1][1] - pts[i - 2][1], d2 = pts[i][1] - pts[i - 1][1]; if (d1 * d2 < 0) turns++; }
          accent = turns >= 2 || (w > h * 2.2 && pts.length > 3) ? "~" : above.length >= 2 || turns === 1 ? "^" : (pts[pts.length - 1][0] - pts[0][0]) * (pts[pts.length - 1][1] - pts[0][1]) < 0 ? "´" : "`";
        }
        const cedil = main.filter(s => bboxOf(s)[1] > base + capH * 0.05);
        if (cedil.length && cedil.length < main.length) main = main.filter(s => !cedil.includes(s));
        const mb = bboxOf([].concat(...main));
        if (prevR != null && mb[0] - prevR > capH * 0.42) text += " ";
        prevR = mb[2];
        const norm = main.map(s => s.map(([x, y]) => [(x - mb[0]) / capH, (y - top) / capH]));
        const pts = sampleStrokes(norm, N);
        const r = classify(pts, (mb[2] - mb[0]) / capH, (mb[1] - top) / capH, (mb[3] - top) / capH);
        if (!r) { text += "?"; total += 1; count++; continue; }
        let ch = r.ch;
        if (accent && ACC[ch.toUpperCase() + accent]) ch = ACC[ch.toUpperCase() + accent];
        if (cedil.length && /c/i.test(ch)) ch = ch === "c" ? "ç" : "Ç";
        text += r.d < 0.3 ? ch : "?";
        total += Math.min(r.d, 1); count++;
      }
      outLines.push(text);
    }
    if (!count) return null;
    let txt = outLines.join(" ").replace(/''/g, '"').replace(/\s+/g, " ").trim();
    // uppercase context: isolated lowercase confusables inside uppercase words
    txt = txt.split(" ").map(w => { const up = (w.match(/[A-ZÀ-Ú]/g) || []).length, lo = (w.match(/[a-zà-ú]/g) || []).length; if (up >= 2 && lo && lo <= 2 && !/\d/.test(w)) w = w.toUpperCase(); return fixWord(w); }).join(" ");
    return { text: txt, lines: outLines, score: total / count, n: count, plausible: plausible(txt) };
  }
  function plausible(txt) {
    // measurements ("20x20x10cm", "2P+T", "Ø3/4") are judged elsewhere: only digit-free words must look like language
    const letters = txt.split(/\s+/).filter(w => !/\d/.test(w)).join(" ").replace(/[^A-Za-zÀ-ú]/g, "");
    if (letters.length < 4) return true;
    const vow = (letters.match(/[AEIOUaeiouÀ-ú]/g) || []).length;
    const words = txt.split(" ").filter(w => /[A-Za-zÀ-ú]{3,}/.test(w));
    const known = words.filter(w => LEXN.some(([n]) => n === strip(w.toUpperCase()).replace(/[^A-Z]/g, ""))).length;
    if (known >= Math.max(1, words.length * 0.5)) return true;
    // Portuguese text: vowels are ~45% of letters; runs of 4+ consonants are rare
    return vow / letters.length >= 0.28 && !/[^AEIOUÀ-Ú\W\d]{5,}/i.test(letters) && new Set(letters.toUpperCase()).size >= Math.min(5, letters.length * 0.4);
  }
  export { readBlock, plausible };
  export const templates = TPL.length;
