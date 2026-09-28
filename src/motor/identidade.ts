// O JUIZ DE IDENTIDADE: uma ocorrência só conta como o símbolo se for ele nos dois sentidos — todo traço do
// ícone está ali (ida) e toda tinta dali está no ícone (volta) —, por semelhança pura (giro, espelho, escala).

/* Orcer — o juiz de IDENTIDADE: este lugar da planta É o ícone da legenda? (PLANO-ALTA.md, F1)
   Só SEMELHANÇA: girar, espelhar, escala UNIFORME — nunca esticar nem entortar (um quadrado com diagonal
   "esticado" vira qualquer tabela). E nos DOIS sentidos:
     ida   — o traço do ícone cai sobre tinta da planta naquele lugar;
     volta — a tinta da planta ali, DA COR que o próprio símbolo usa, cai sobre o traço do ícone.
   Sem a volta, o hexágono da legenda "é" o círculo com uma letra dentro, e o círculo vazio "é" o meio
   preenchido. A cor restringe a volta porque hachura ou móvel de outra cor passando por baixo não é do símbolo.
   Medido (tools/sonda-identidade): no benchmark, nenhuma marca errada aprovada; a tolerância de 2% do
   tamanho separa o hexágono do círculo (verdadeiros 100/100, falsos ~80/80). */

  const TOL = 0.02, PISO = 0.06, PRECISA = 0.95;

  function cloud(prims, step) {
    const out = [];
    for (const p of prims) {
      const s = p.segs;
      for (let i = 0; i < s.length; i += 4) {
        const dx = s[i + 2] - s[i], dy = s[i + 3] - s[i + 1], l = Math.hypot(dx, dy);
        const n = Math.max(1, Math.ceil(l / step));
        for (let k = 0; k <= n; k++) out.push(s[i] + dx * k / n, s[i + 1] + dy * k / n);
      }
    }
    return out;
  }
  function segsOf(prims) { const a = []; for (const p of prims) { const s = p.segs; for (let i = 0; i < s.length; i += 4) a.push(s[i], s[i + 1], s[i + 2], s[i + 3]); } return a; }
  function nearest(S, x, y) {
    let best = Infinity, bx = x, by = y;
    for (let i = 0; i < S.length; i += 4) {
      const ax = S[i], ay = S[i + 1], dx = S[i + 2] - ax, dy = S[i + 3] - ay, L2 = dx * dx + dy * dy;
      let t = L2 ? ((x - ax) * dx + (y - ay) * dy) / L2 : 0; t = t < 0 ? 0 : t > 1 ? 1 : t;
      const qx = ax + t * dx, qy = ay + t * dy, d = Math.hypot(qx - x, qy - y);
      if (d < best) { best = d; bx = qx; by = qy; }
    }
    return [bx, by, best];
  }
  const dSeg = (S, x, y) => nearest(S, x, y)[2];

  // MALHA de segmentos: a mesma resposta de nearest/dSeg, sem varrer o que está longe. O perfil da pub21
  // (A0, 38 mil traços) apontou 71% do tempo do juiz em varredura linear, ponto a ponto.
  function malha(S: number[], dono?: any[]): any {
    const n = S.length / 4;
    if (n < 24) return { S, dono, linear: true };
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, soma = 0;
    for (let i = 0; i < S.length; i += 4) {
      x0 = Math.min(x0, S[i], S[i + 2]); x1 = Math.max(x1, S[i], S[i + 2]);
      y0 = Math.min(y0, S[i + 1], S[i + 3]); y1 = Math.max(y1, S[i + 1], S[i + 3]);
      soma += Math.abs(S[i + 2] - S[i]) + Math.abs(S[i + 3] - S[i + 1]);
    }
    const cel = Math.max(1e-6, Math.max(soma / n, Math.max(x1 - x0, y1 - y0) / 64));
    const nx = Math.max(1, Math.ceil((x1 - x0) / cel) + 1), ny = Math.max(1, Math.ceil((y1 - y0) / cel) + 1);
    if (nx * ny > 250000) return { S, dono, linear: true };
    const balde = new Map();
    for (let i = 0; i < S.length; i += 4) {
      const ax = Math.floor((Math.min(S[i], S[i + 2]) - x0) / cel), bx = Math.floor((Math.max(S[i], S[i + 2]) - x0) / cel);
      const ay = Math.floor((Math.min(S[i + 1], S[i + 3]) - y0) / cel), by = Math.floor((Math.max(S[i + 1], S[i + 3]) - y0) / cel);
      for (let gx = ax; gx <= bx; gx++) for (let gy = ay; gy <= by; gy++) { const k = gx * 100003 + gy; let a = balde.get(k); if (!a) balde.set(k, a = []); a.push(i); }
    }
    return { S, dono, balde, cel, x0, y0, nx, ny };
  }
  function perto(M, x, y) {
    if (M.linear || !M.balde) { const r = nearest(M.S, x, y); return { d: r[2], px: r[0], py: r[1], dono: M.dono ? donoDe(M, x, y) : null }; }
    const S = M.S, gx = Math.floor((x - M.x0) / M.cel), gy = Math.floor((y - M.y0) / M.cel);
    let best = Infinity, bx = x, by = y, bi = -1;
    for (let r = 0; r < Math.max(M.nx, M.ny) + 1; r++) {
      if (best < (r - 1) * M.cel) break;                       // o anel seguinte não pode melhorar
      for (let ix = gx - r; ix <= gx + r; ix++) for (let iy = gy - r; iy <= gy + r; iy++) {
        if (r && Math.max(Math.abs(ix - gx), Math.abs(iy - gy)) !== r) continue;   // só a borda do anel
        const a = M.balde.get(ix * 100003 + iy); if (!a) continue;
        for (const i of a) {
          const ax = S[i], ay = S[i + 1], dx = S[i + 2] - ax, dy = S[i + 3] - ay, L2 = dx * dx + dy * dy;
          let t = L2 ? ((x - ax) * dx + (y - ay) * dy) / L2 : 0; t = t < 0 ? 0 : t > 1 ? 1 : t;
          const qx = ax + t * dx, qy = ay + t * dy, d = Math.hypot(qx - x, qy - y);
          if (d < best) { best = d; bx = qx; by = qy; bi = i; }
        }
      }
    }
    return { d: best, px: bx, py: by, dono: M.dono && bi >= 0 ? M.dono[bi >> 2] : null };
  }
  function donoDe(M, x, y) { let best = Infinity, bi = -1; const S = M.S;
    for (let i = 0; i < S.length; i += 4) { const ax = S[i], ay = S[i + 1], dx = S[i + 2] - ax, dy = S[i + 3] - ay, L2 = dx * dx + dy * dy;
      let t = L2 ? ((x - ax) * dx + (y - ay) * dy) / L2 : 0; t = t < 0 ? 0 : t > 1 ? 1 : t;
      const d = Math.hypot(ax + t * dx - x, ay + t * dy - y); if (d < best) { best = d; bi = i; } }
    return bi >= 0 ? M.dono[bi >> 2] : null; }
  // segmentos de vários primitivos, guardando de quem é cada um
  function segsComDono(prims) { const S = [], dono = []; for (const p of prims) { const q = p.segs; for (let i = 0; i < q.length; i += 4) { S.push(q[i], q[i + 1], q[i + 2], q[i + 3]); dono.push(p); } } return { S, dono }; }
  function moments(c) {
    const n = c.length / 2; let mx = 0, my = 0;
    for (let i = 0; i < c.length; i += 2) { mx += c[i]; my += c[i + 1]; }
    mx /= n; my /= n; let r2 = 0;
    for (let i = 0; i < c.length; i += 2) r2 += (c[i] - mx) ** 2 + (c[i + 1] - my) ** 2;
    return { mx, my, rms: Math.sqrt(r2 / n) };
  }
  const colorKey = p => (p.stroke || "") + "|" + (p.fill || "");
  const isNeutral = c => !c || /^#(([0-9a-f]{2})\2\2)$/i.test(c);

  // índice espacial dos primitivos da planta, construído uma vez por folha
  function index(prims) {
    let tot = 0; for (const p of prims) tot += Math.max(p.bbox[2] - p.bbox[0], p.bbox[3] - p.bbox[1]);
    const cs = Math.max(4, (tot / Math.max(1, prims.length)) * 4);
    const grid = new Map();
    prims.forEach((p, k) => {
      const x0 = Math.floor(p.bbox[0] / cs), x1 = Math.floor(p.bbox[2] / cs), y0 = Math.floor(p.bbox[1] / cs), y1 = Math.floor(p.bbox[3] / cs);
      if ((x1 - x0 + 1) * (y1 - y0 + 1) > 400) { (grid.get("big") || grid.set("big", []).get("big")).push(k); return; }
      for (let gx = x0; gx <= x1; gx++) for (let gy = y0; gy <= y1; gy++) { const key = gx + ":" + gy; (grid.get(key) || grid.set(key, []).get(key)).push(k); }
    });
    return {
      prims, query(r) {
        const seen = new Set(), out = [];
        const take = k => { if (seen.has(k)) return; seen.add(k); const b = prims[k].bbox; if (b[0] < r[2] && b[2] > r[0] && b[1] < r[3] && b[3] > r[1]) out.push(prims[k]); };
        for (let gx = Math.floor(r[0] / cs); gx <= Math.floor(r[2] / cs); gx++) for (let gy = Math.floor(r[1] / cs); gy <= Math.floor(r[3] / cs); gy++) { const a = grid.get(gx + ":" + gy); if (a) a.forEach(take); }
        (grid.get("big") || []).forEach(take);
        return out;
      }
    };
  }

  // o ícone, preparado uma vez
  function icon(prims) {
    const P = prims.filter(p => p.segs && p.segs.length >= 4 && !(p.fill === "#ffffff" && !p.stroke));
    if (!P.length) return null;
    let b = P[0].bbox.slice(); for (const p of P) b = [Math.min(b[0], p.bbox[0]), Math.min(b[1], p.bbox[1]), Math.max(b[2], p.bbox[2]), Math.max(b[3], p.bbox[3])];
    const S = Math.hypot(b[2] - b[0], b[3] - b[1]) || 1;
    const c = cloud(P, S / 60);
    const L = P.reduce((a, p) => a + p.len, 0) || 1;
    const cores = [...new Set(P.map(p => p.stroke || p.fill).filter(Boolean))];
    return {
      P, S, c, box: b, m: moments(c), segs: segsOf(P), filled: P.filter(p => p.fill).reduce((a, p) => a + p.len, 0) / L, cores: new Set(cores),
      pobre: P.length <= 1,                                   // um primitivo só: triângulo, círculo, retângulo
      neutro: cores.every(isNeutral)                          // preto/cinza/branco não testemunha nada
    };
  }

  // place: [x0,y0,x1,y1] na planta; ix: index() dos primitivos da planta (fora da legenda, sem texto)
  // outros: Set de primitivos já explicados por OUTRA ocorrência aprovada — não são tinta a mais aqui
  // opt.mesmaCor: a tinta tem de ser da cor do molde (molde tirado da PLANTA: a cor dele é a cor real, e o mesmo
  // desenho em outra cor é outro material — três itens da mesma prancha podem ser o mesmo quadrado em três cores)
  function verify(ic: any, place: number[], ix: any, outros?: Set<any> | null, opt?: any): any {
    const w = place[2] - place[0], h = place[3] - place[1], sz = Math.hypot(w, h) || 1;
    const pad = sz * 0.12;
    const F = [place[0] - pad, place[1] - pad, place[2] + pad, place[3] + pad];
    const mesmaCor = opt && opt.mesmaCor && ic.cores.size;
    // de cada traço, só os segmentos que tocam a moldura: uma parede ou hachura que atravessa a folha tem dezenas
    // de milhares, e medir distância a todos, ponto a ponto, travava a prancha (pub21: horas)
    const M = pad * 2, G = [F[0] - M, F[1] - M, F[2] + M, F[3] + M];
    const local = p => {
      const q = p.segs; if (q.length <= 64) return p;
      const out = [];
      for (let i = 0; i < q.length; i += 4) { const x0 = Math.min(q[i], q[i + 2]), x1 = Math.max(q[i], q[i + 2]), y0 = Math.min(q[i + 1], q[i + 3]), y1 = Math.max(q[i + 1], q[i + 3]); if (x1 >= G[0] && x0 <= G[2] && y1 >= G[1] && y0 <= G[3]) out.push(q[i], q[i + 1], q[i + 2], q[i + 3]); }
      return out.length === q.length ? p : Object.assign(Object.create(p), { segs: out, _orig: p });
    };
    const touching = ix.query(F).filter(p => p.segs && p.segs.length && !(outros && outros.has(p)) && (!mesmaCor || ic.cores.has(p.stroke || p.fill))).map(local).filter(p => p.segs.length);
    // MEMÓRIA: o mesmo bloco, no mesmo giro, com a mesma vizinhança dá o mesmo veredito. A chave é a geometria
    // local EXATA (relativa ao canto do lugar, arredondada a 0,01 pt) de tudo que toca a moldura; os traços que o
    // ícone explicou são remapeados para os deste lugar pela posição na lista ordenada.
    const memo = ic._memo || (ic._memo = new Map());
    const chaveDe = p => { const q = p.segs; let k = (p.stroke || "") + "|" + (p.fill || "") + (p.bbox[0] >= F[0] && p.bbox[2] <= F[2] && p.bbox[1] >= F[1] && p.bbox[3] <= F[3] ? "i" : "o") + ":"; for (let i = 0; i < q.length; i++) k += Math.round((q[i] - (i % 2 ? place[1] : place[0])) * 100) + ","; return k; };
    const ordem = touching.map(p => [chaveDe(p), p]).sort((x, y) => x[0] < y[0] ? -1 : x[0] > y[0] ? 1 : 0);
    const chave = (mesmaCor ? "c" : "") + Math.round(w * 100) + "x" + Math.round(h * 100) + "#" + ordem.map(x => x[0]).join(";");
    const visto = memo.get(chave);
    if (visto) { const r = Object.assign({}, visto.r); r.usados = new Set(visto.idx.map(i => ordem[i][1]._orig || ordem[i][1])); return r; }
    const guarda = r => { if (memo.size < 20000) { const pos = new Map(ordem.map((x, i) => [x[1]._orig || x[1], i])); memo.set(chave, { r: Object.assign({}, r, { usados: null }), idx: [...(r.usados || [])].map(p => pos.get(p)).filter(i => i != null) }); } return r; };
    // o que está inteiro DENTRO é o candidato; o que cruza a moldura é fio ou parede
    let inside = touching.filter(p => p.bbox[0] >= F[0] && p.bbox[2] <= F[2] && p.bbox[1] >= F[1] && p.bbox[3] <= F[3]);
    let alheio = new Set();
    // traço de dentro LIGADO a um traço que sai da moldura é pedaço do objeto de fora (a ponta de uma cota,
    // o dente de um fio): não é tinta do candidato. Propaga pela ligação, sem olhar nome de camada.
    {
      const fora = touching.filter(p => !inside.includes(p)), alheio_ = new Set();
      const ends = p => { const q = p.segs; return [[q[0], q[1]], [q[q.length - 2], q[q.length - 1]]]; };
      const liga = (p, grupo) => ends(p).some(([x, y]) => grupo.some(o => dSeg(o.segs, x, y) <= 0.15)) || grupo.some(o => ends(o).some(([x, y]) => dSeg(p.segs, x, y) <= 0.15));
      let novos = fora;
      for (let volta = 0; volta < 3 && novos.length; volta++) {
        const agora = inside.filter(p => !alheio_.has(p) && liga(p, novos));
        agora.forEach(p => alheio_.add(p)); novos = agora;
      }
      alheio = alheio_;
    }
    // alinha pela tinta da COR do ícone quando ela existe ali (texto preto ao lado de um símbolo vermelho puxava o centro);
    // sem nenhuma, a cor da planta é outra e vale a tinta toda
    const daCor = inside.filter(p => ic.cores.has(p.stroke || p.fill));
    if (daCor.length) inside = daCor;
    if (!inside.length) return guarda({ ok: false, why: "vazio" });
    const ci = cloud(inside, sz / 60), mi = moments(ci);
    const Sin = segsOf(inside), Min = malha(Sin);
    const tc = segsComDono(touching), Mtoca = malha(tc.S, tc.dono);
    if (!ic.malha) ic.malha = malha(ic.segs);
    const stepI = Math.max(1, Math.floor(ic.c.length / 2 / 40)) * 2, stepC = Math.max(1, Math.floor(ci.length / 2 / 40)) * 2;
    // pose de semelhança ancorada: ponto A do ícone vai para o ponto B da planta, mais (tx, ty)
    const pose = (A, B, th, mir, s, tx, ty) => {
      const cs = Math.cos(th), sn = Math.sin(th);
      return {
        A, B, th, mir, s, tx, ty,
        map: (x, y) => { const X = (x - A[0]) * mir, Y = y - A[1]; return [B[0] + tx + s * (cs * X - sn * Y), B[1] + ty + s * (sn * X + cs * Y)]; },
        inv: (x, y) => { const X = (x - B[0] - tx) / s, Y = (y - B[1] - ty) / s; const u = cs * X + sn * Y, v = -sn * X + cs * Y; return [u * mir + A[0], v + A[1]]; }
      };
    };
    // o custo de um giro é uma média: 12 amostras já ordenam os candidatos, e só os melhores merecem as 40.
    // (perfil da pub21: 3.109 julgamentos × 72 giros × 80 amostras — o que pesa é o NÚMERO de poses provadas)
    const custo = (P, passoI, passoC) => {
      let a = 0, n = 0; for (let i = 0; i < ic.c.length; i += passoI) { const q = P.map(ic.c[i], ic.c[i + 1]); a += Math.min(perto(Min, q[0], q[1]).d, sz); n++; }
      let b = 0, m = 0; for (let i = 0; i < ci.length; i += passoC) { const q = P.inv(ci[i], ci[i + 1]); b += Math.min(perto(ic.malha, q[0], q[1]).d * P.s, sz); m++; }
      return a / n + b / m;
    };
    const ralo = [Math.max(stepI, Math.floor(ic.c.length / 2 / 12) * 2 || 2), Math.max(stepC, Math.floor(ci.length / 2 / 12) * 2 || 2)];
    const cost = P => custo(P, stepI, stepC);
    const solve = (A, B, s0) => {
      // 1) giro e espelho por custo CONTÍNUO (limiar satura em símbolo pequeno e escolhe o ângulo errado)
      // grosso de 10 em 10 graus, depois fino em volta dos dois melhores (cada lado do espelho)
      let best = null, bc = Infinity; const topo = [];
      const grossos = [];
      for (const mir of [1, -1]) for (let k = 0; k < 36; k++) { const P = pose(A, B, k * Math.PI / 18, mir, s0, 0, 0); grossos.push([custo(P, ralo[0], ralo[1]), P]); }
      grossos.sort((x, y) => x[0] - y[0]);
      for (const [, P] of grossos.slice(0, 6)) { const c = cost(P); topo.push([c, P]); if (c < bc) { bc = c; best = P; } }
      topo.sort((x, y) => x[0] - y[0]);
      for (const [, T] of topo.slice(0, 2)) for (let j = -10; j <= 10; j++) { if (!j) continue; const P = pose(A, B, T.th + j * Math.PI / 360, T.mir, s0, 0, 0), c = cost(P); if (c < bc) { bc = c; best = P; } }
      if (bc > 0.3 * s0 * ic.S) return { rejeitado: true };      // nenhum giro chegou perto: outro desenho
      // 2) refino por Procrustes de semelhança sobre os pares ícone -> tinta mais próxima
      const tol0 = Math.max(0.25, TOL * ic.S * s0);
      for (let it = 0; it < 6; it++) {
        const src = [], dst = [];
        for (let i = 0; i < ic.c.length; i += 2) {
          const q = best.map(ic.c[i], ic.c[i + 1]), n = perto(Min, q[0], q[1]);
          if (n.d < tol0 * 3) { src.push((ic.c[i] - A[0]) * best.mir, ic.c[i + 1] - A[1]); dst.push(n.px - B[0], n.py - B[1]); }
        }
        if (src.length < 12) break;
        const n = src.length / 2; let ax = 0, ay = 0, bx = 0, by = 0;
        for (let k = 0; k < src.length; k += 2) { ax += src[k]; ay += src[k + 1]; bx += dst[k]; by += dst[k + 1]; }
        ax /= n; ay /= n; bx /= n; by /= n;
        let sxx = 0, sxy = 0, n2 = 0;
        for (let k = 0; k < src.length; k += 2) { const x = src[k] - ax, y = src[k + 1] - ay, u = dst[k] - bx, v = dst[k + 1] - by; sxx += x * u + y * v; sxy += x * v - y * u; n2 += x * x + y * y; }
        const th = Math.atan2(sxy, sxx), sc = Math.hypot(sxx, sxy) / (n2 || 1), cs = Math.cos(th), sn = Math.sin(th);
        best = pose(A, B, th, best.mir, sc, bx - sc * (cs * ax - sn * ay), by - sc * (sn * ax + cs * ay));
      }
      return best;
    };
    // 3) a medida: ida e volta, densas
    const measure = P => {
      const s = P.s, tol = Math.max(PISO, TOL * ic.S * s);
      let fw = 0; const cores = new Set(), usados = new Set();
      for (let i = 0; i < ic.c.length; i += 2) {
        const q = P.map(ic.c[i], ic.c[i + 1]);
        const r = perto(Mtoca, q[0], q[1]), bp = r.dono;
        if (r.d <= tol && bp) { fw++; cores.add(colorKey(bp)); usados.add(bp._orig || bp); }
      }
      fw /= ic.c.length / 2;
      const meu = (cores.size ? inside.filter(p => cores.has(colorKey(p))) : inside).filter(p => !alheio.has(p) || usados.has(p._orig || p));
      const cm = cloud(meu, sz / 60);
      let rv = 0; for (let i = 0; i < cm.length; i += 2) { const q = P.inv(cm[i], cm[i + 1]); if (perto(ic.malha, q[0], q[1]).d <= tol / s) rv++; }
      rv = cm.length ? rv / (cm.length / 2) : 0;
      return { fw, rv, s, th: P.th, mir: P.mir, cores: [...cores], usados };
    };
    // dois pontos de partida: o centro da tinta ali (traço vizinho da mesma cor o desloca) e o centro da
    // própria marca, na escala da marca. Fica o que casar melhor.
    const starts = [];
    const s0 = mi.rms / ic.m.rms;
    if (s0 > 0.05 && s0 < 20) starts.push([[ic.m.mx, ic.m.my], [mi.mx, mi.my], s0]);
    const sb = sz / ic.S, icb = ic.box;
    if (sb > 0.05 && sb < 20) starts.push([[(icb[0] + icb[2]) / 2, (icb[1] + icb[3]) / 2], [(place[0] + place[2]) / 2, (place[1] + place[3]) / 2], sb]);
    if (!starts.length) return guarda({ ok: false, why: "escala" });
    let r = null;
    for (const [A, B, s0] of starts) {
      const P = solve(A, B, s0);
      // recusa rápida: se nenhum giro chegou perto, é outro desenho — não vale o refino nem a medida densa
      if (P.rejeitado) { if (!r) r = { fw: 0, rv: 0, s: s0, th: 0, mir: 1, cores: [], usados: new Set() }; continue; }
      const m = measure(P); if (!r || Math.min(m.fw, m.rv) > Math.min(r.fw, r.rv)) r = m; if (r.fw >= PRECISA && r.rv >= PRECISA) break;
    }
    const L = inside.reduce((a, p) => a + p.len, 0) || 1, filled = inside.filter(p => p.fill).reduce((a, p) => a + p.len, 0) / L;
    r.ok = r.fw >= PRECISA && r.rv >= PRECISA && Math.abs(filled - ic.filled) < 0.35;
    r.why = r.ok ? "ok" : r.fw < PRECISA ? "falta traço do ícone (" + Math.round(r.fw * 100) + "%)" : r.rv < PRECISA ? "tem traço que o ícone não tem (" + Math.round(r.rv * 100) + "%)" : "preenchimento diferente";
    return guarda(r);
  }

  export { index, icon, verify, isNeutral };
