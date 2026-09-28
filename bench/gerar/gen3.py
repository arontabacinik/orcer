"""Benchmark DURO: prancha como CAD de verdade.

Diferenças que faltavam no gen2 e que existem em planta real:
  - cada símbolo é um BLOCO (Form XObject) reinserido com CTM, não traço solto
  - rotação livre (qualquer ângulo), não só 0/90/180/270
  - etiqueta de circuito escrita POR CIMA do símbolo (atributo do bloco)
  - hachura de parede e mobiliário: muita tinta em volta
  - densidade alta e símbolos encostando uns nos outros
  - o ícone da legenda é o MESMO bloco, em escala própria
"""
import pymupdf as fitz, random, math, json, sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from gen import Sheet, COLORS, HEADERS, SECTIONS
from gen2 import PDESCS, PLONG
from hershey_draw import draw_text as hdraw

KINDS = ["circle", "squarex", "tri", "dot", "hex", "arrow", "panel", "star", "halfmoon", "bolt",
         "lumin", "tomada", "sensor", "quadro"]


def symbol_doc(kind, color, u, lw):
    """um bloco: página quadrada de lado 2u com o símbolo centrado"""
    d = fitz.open(); p = d.new_page(width=2 * u, height=2 * u)
    sh = p.new_shape(); c = fitz.Point(u, u); r = u * 0.62
    if kind == "circle":
        sh.draw_circle(c, r * 0.72); sh.finish(color=color, width=lw)
        sh.draw_line((c.x - r * 0.72, c.y), (c.x - r, c.y)); sh.finish(color=color, width=lw)
    elif kind == "squarex":
        q = fitz.Rect(c.x - r * .72, c.y - r * .72, c.x + r * .72, c.y + r * .72)
        sh.draw_rect(q); sh.draw_line(q.tl, q.br); sh.draw_line(q.tr, q.bl); sh.finish(color=color, width=lw)
    elif kind == "tri":
        sh.draw_polyline([fitz.Point(c.x - r * .8, c.y + r * .65), fitz.Point(c.x + r * .8, c.y + r * .65), fitz.Point(c.x, c.y - r * .8), fitz.Point(c.x - r * .8, c.y + r * .65)])
        sh.finish(color=color, fill=color, width=lw * 0.8)
    elif kind == "dot":
        sh.draw_circle(c, r * 0.42); sh.finish(color=color, fill=color, width=lw)
    elif kind == "hex":
        sh.draw_polyline([fitz.Point(c.x + r * .78 * math.cos(k * math.pi / 3), c.y + r * .78 * math.sin(k * math.pi / 3)) for k in range(7)])
        sh.finish(color=color, width=lw)
    elif kind == "arrow":
        sh.draw_polyline([fitz.Point(c.x - r * .85, c.y - r * .28), fitz.Point(c.x + r * .1, c.y - r * .28), fitz.Point(c.x + r * .1, c.y - r * .62),
                          fitz.Point(c.x + r * .85, c.y), fitz.Point(c.x + r * .1, c.y + r * .62), fitz.Point(c.x + r * .1, c.y + r * .28),
                          fitz.Point(c.x - r * .85, c.y + r * .28), fitz.Point(c.x - r * .85, c.y - r * .28)])
        sh.finish(color=color, fill=color, width=lw * 0.7)
    elif kind == "panel":
        q = fitz.Rect(c.x - r * .95, c.y - r * .5, c.x + r * .95, c.y + r * .5)
        sh.draw_rect(q); sh.finish(color=color, fill=(0.85, 0.85, 0.85), width=lw)
        sh.draw_line((q.x0, q.y0), (q.x1, q.y1)); sh.finish(color=color, width=lw * 0.8)
    elif kind == "star":
        pts = []
        for k in range(11):
            rr = r * (0.85 if k % 2 == 0 else 0.4); a = k * math.pi / 5 - math.pi / 2
            pts.append(fitz.Point(c.x + rr * math.cos(a), c.y + rr * math.sin(a)))
        sh.draw_polyline(pts); sh.finish(color=color, width=lw)
    elif kind == "halfmoon":
        sh.draw_circle(c, r * 0.7); sh.finish(color=color, width=lw)
        sh.draw_line((c.x - r * .7, c.y), (c.x + r * .7, c.y)); sh.finish(color=color, width=lw)
        sh.draw_sector(c, fitz.Point(c.x + r * .7, c.y), 180); sh.finish(color=color, fill=color, width=lw)
    elif kind == "bolt":
        sh.draw_polyline([fitz.Point(c.x - r * .3, c.y - r * .8), fitz.Point(c.x + r * .25, c.y - r * .1),
                          fitz.Point(c.x - r * .05, c.y - r * .1), fitz.Point(c.x + r * .3, c.y + r * .8),
                          fitz.Point(c.x - r * .25, c.y + r * .05), fitz.Point(c.x + r * .05, c.y + r * .05),
                          fitz.Point(c.x - r * .3, c.y - r * .8)])
        sh.finish(color=color, fill=color, width=lw * 0.7)
    elif kind == "lumin":                       # luminária: retângulo + eixo + dois traços
        q = fitz.Rect(c.x - r * 1.0, c.y - r * .38, c.x + r * 1.0, c.y + r * .38)
        sh.draw_rect(q); sh.finish(color=color, width=lw)
        sh.draw_line((q.x0 + r * .1, c.y), (q.x1 - r * .1, c.y)); sh.finish(color=color, width=lw * 0.7)
        sh.draw_line((c.x - r * .35, q.y0), (c.x - r * .35, q.y1)); sh.draw_line((c.x + r * .35, q.y0), (c.x + r * .35, q.y1))
        sh.finish(color=color, width=lw * 0.6)
    elif kind == "tomada":                      # tomada: meia-lua + dois pinos + haste
        sh.draw_sector(c, fitz.Point(c.x + r * .62, c.y), 180); sh.finish(color=color, width=lw)
        sh.draw_line((c.x - r * .62, c.y), (c.x + r * .62, c.y)); sh.finish(color=color, width=lw)
        sh.draw_line((c.x - r * .2, c.y - r * .3), (c.x - r * .2, c.y - r * .05))
        sh.draw_line((c.x + r * .2, c.y - r * .3), (c.x + r * .2, c.y - r * .05)); sh.finish(color=color, width=lw * 0.8)
        sh.draw_line((c.x, c.y), (c.x, c.y + r * .75)); sh.finish(color=color, width=lw)
    elif kind == "sensor":                       # sensor: círculo + arco + ponto
        sh.draw_circle(c, r * .68); sh.finish(color=color, width=lw)
        sh.draw_circle(c, r * .22); sh.finish(color=color, fill=color, width=lw * 0.6)
        sh.draw_line((c.x - r * .68, c.y - r * .68), (c.x + r * .68, c.y + r * .68)); sh.finish(color=color, width=lw * 0.6)
    elif kind == "quadro":                        # quadro: retângulo + hachura interna + seta
        q = fitz.Rect(c.x - r * .85, c.y - r * .55, c.x + r * .85, c.y + r * .55)
        sh.draw_rect(q); sh.finish(color=color, width=lw)
        for k in range(3):
            sh.draw_line((q.x0 + r * .3 * (k + 1), q.y0), (q.x0 + r * .3 * (k + 1) - r * .25, q.y1))
        sh.finish(color=color, width=lw * 0.6)
    sh.commit()
    return d


def place_block(page, src, x, y, u, ang, sc, oc):
    half = u * sc
    page.show_pdf_page(fitz.Rect(x - half, y - half, x + half, y + half), src, 0, rotate=ang, oc=oc)
    return [x - half * 0.75, y - half * 0.75, x + half * 0.75, y + half * 0.75]


def hatch_area(S, x0, y0, x1, y1, step, ang, color):
    sh = S.page.new_shape()
    n = int((x1 - x0 + y1 - y0) / step)
    for k in range(n):
        t = k * step
        if ang == 45:
            sh.draw_line((max(x0, x0 + t - (y1 - y0)), min(y1, y0 + t)), (min(x1, x0 + t), max(y0, y0 + t - (x1 - x0))))
        else:
            sh.draw_line((x0 + t if x0 + t < x1 else x1, y0), (x0 + t if x0 + t < x1 else x1, y1))
    sh.finish(color=color, width=0.3, oc=S.ocg["A-PAREDE"])
    sh.commit()


def make(seed, out):
    rnd = random.Random(seed)
    opts = dict(size=rnd.choice(["A1", "A1", "A3", "A3", "A4p"]), stroke=rnd.random() < 0.35,
                font=rnd.choice(["rowmans", "futural", "futuram"]), legend_layer=rnd.random() < 0.5,
                where=rnd.choice(["right", "bottom", "left", "topright"]), rot=rnd.choice([0, 0, 0, 90, 270]),
                scan=rnd.random() < 0.2, legratio=rnd.choice([1.0, 1.0, 1.3, 1.6, 2.0, 0.8]),
                angles=rnd.choice(["ortho", "ortho", "free"]), blackplan=rnd.random() < 0.3,
                tagInside=rnd.random() < 0.5, hatch=rnd.random() < 0.6, dense=rnd.random() < 0.5,
                legCols=rnd.random() < 0.5, wrap2=rnd.random() < 0.4,
                lw=rnd.choice([0.4, 0.6, 0.6, 0.9]), wrap=0, style="list", frame=rnd.random() < 0.5)
    base = {"A1": 6, "A3": 4.2, "A4p": 3.2}[opts["size"]]
    opts["th"] = base * rnd.uniform(0.85, 1.25)
    S = Sheet(rnd, opts); th = S.th; W, H = S.W, S.H
    u = th * rnd.uniform(1.1, 1.8)          # meio-lado do bloco no desenho
    opts["uplan"] = u

    n = rnd.randint(4, 9)
    descs = rnd.sample(PDESCS, n)
    kinds, used = [], set()
    for _ in descs:
        for _ in range(60):
            k = rnd.choice(KINDS); c = rnd.choice(COLORS)
            if opts["blackplan"] and any(kk == k for kk, _ in used):
                continue
            if (k, c) not in used: used.add((k, c)); kinds.append((k, c)); break
    items = [(d, k, c) for d, (k, c) in zip(descs, kinds)]
    srcs = [symbol_doc(k, (0, 0, 0) if opts["blackplan"] else c, u, opts["lw"]) for _, k, c in items]
    srcsLeg = [symbol_doc(k, c, u, opts["lw"]) for _, k, c in items]

    if opts["where"] == "right": area = [th * 6, th * 6, W * 0.72, H - th * 6]; lx, ly = W * 0.75, th * 8
    elif opts["where"] == "left": area = [W * 0.32, th * 6, W - th * 6, H - th * 6]; lx, ly = th * 6, th * 8
    elif opts["where"] == "topright": area = [th * 6, H * 0.36, W - th * 6, H - th * 6]; lx, ly = W * 0.55, th * 6
    else: area = [th * 6, th * 6, W - th * 6, H * 0.58]; lx, ly = th * 8, H * 0.62
    x0, y0, x1, y1 = area

    # --- fundo: paredes, hachura, mobiliário
    sh = S.page.new_shape(); sh.draw_rect(fitz.Rect(x0, y0, x1, y1))
    for i in range(rnd.randint(4, 8)):
        xx = rnd.uniform(x0, x1); sh.draw_line((xx, y0), (xx, y1))
    for i in range(rnd.randint(3, 6)):
        yy = rnd.uniform(y0, y1); sh.draw_line((x0, yy), (x1, yy))
    sh.finish(color=(0.45, 0.45, 0.45), width=0.9, oc=S.ocg["A-PAREDE"]); sh.commit()
    if opts["hatch"]:
        for i in range(rnd.randint(1, 3)):
            hx = rnd.uniform(x0, x1 - 80); hy = rnd.uniform(y0, y1 - 60)
            hatch_area(S, hx, hy, hx + rnd.uniform(40, 120), hy + rnd.uniform(30, 90), th * 0.8, 45, (0.6, 0.6, 0.6))
    sh = S.page.new_shape()
    for i in range(rnd.randint(4, 12)):
        fx = rnd.uniform(x0, x1 - 50); fy = rnd.uniform(y0, y1 - 40)
        sh.draw_rect(fitz.Rect(fx, fy, fx + rnd.uniform(15, 50), fy + rnd.uniform(12, 40)))
    sh.finish(color=(0.55, 0.55, 0.55), width=0.4, oc=S.ocg["A-PAREDE"]); sh.commit()

    # --- instâncias
    oc = S.ocg["E-SIMB"]
    spots = []; counts = []; places = []
    maxn = 40 if opts["dense"] else 18
    for i, (desc, kind, color) in enumerate(items):
        want = rnd.choice([0, 1, 2, 3, 4, 6, 8, 12, 18, 25, maxn])
        placed = 0; pl = []
        for k in range(want * 4):
            if placed >= want: break
            x = rnd.uniform(x0 + u * 2, x1 - u * 2); y = rnd.uniform(y0 + u * 2, y1 - u * 2)
            close = min([(x - px) ** 2 + (y - py) ** 2 for px, py in spots], default=1e9)
            if close < (u * 1.15) ** 2: continue                     # pode encostar, não sobrepor
            ang = rnd.uniform(0, 360) if opts["angles"] == "free" else rnd.choice([0, 0, 90, 180, 270])
            sc = rnd.uniform(0.95, 1.05)
            place_block(S.page, srcs[i], x, y, u, ang, sc, oc)
            spots.append((x, y)); placed += 1; pl.append([round(x, 2), round(y, 2), round(ang, 1), round(sc, 3)])
            if opts["tagInside"] and rnd.random() < 0.5:
                S.text(x - th * 0.5, y + th * 0.3, rnd.choice(["1", "2", "3", "A", "B", "c1"]), th * 0.75)
            elif rnd.random() < 0.3:
                S.text(x + u * 0.9, y - u * 0.5, rnd.choice(["h=0,30", "QL-1", "TUG", "IL.03"]), th * 0.7)
        counts.append(placed); places.append(pl)

    # decoys: blocos que não estão na legenda
    legk = set(k for _, k, _ in items)
    dk = [k for k in KINDS if k not in legk]
    for i in range(rnd.randint(5, 15)):
        if not dk: break
        x = rnd.uniform(x0 + u * 2, x1 - u * 2); y = rnd.uniform(y0 + u * 2, y1 - u * 2)
        if min([(x - px) ** 2 + (y - py) ** 2 for px, py in spots], default=1e9) < (u * 1.6) ** 2: continue
        d = symbol_doc(rnd.choice(dk), rnd.choice(COLORS), u, opts["lw"])
        place_block(S.page, d, x, y, u * rnd.uniform(0.85, 1.25), rnd.uniform(0, 360) if opts["angles"] == "free" else 0, 1, oc)
        spots.append((x, y))

    # eletrodutos por cima
    sh = S.page.new_shape()
    for i in range(rnd.randint(6, 16)):
        if len(spots) < 2: break
        a = rnd.choice(spots); b = rnd.choice(spots)
        sh.draw_line((a[0], a[1]), (a[0], b[1])); sh.draw_line((a[0], b[1]), (b[0], b[1]))
    sh.finish(color=(0.1, 0.1, 0.1), width=0.5, dashes="[4 2] 0", oc=oc); sh.commit()
    for i in range(rnd.randint(3, 8)):
        S.text(rnd.uniform(x0 + 20, max(x0 + 21, x1 - 120)), rnd.uniform(y0 + 20, y1 - 20),
               rnd.choice(["SALA DE REUNIÃO", "COPA", "CIRCULAÇÃO", "DIRETORIA", "OPEN SPACE", "CPD"]), th * 1.1)

    # --- legenda com o MESMO bloco, no tamanho dela
    ul = u * opts["legratio"]
    lay = "LEGENDA" if opts["legend_layer"] else "E-SIMB"
    header = rnd.choice(HEADERS)
    cy = ly
    if header:
        S.text(lx, cy + th * 1.4, header, th * 1.4, "LEGENDA" if opts["legend_layer"] else "E-TEXTO"); cy += th * 2.6
    gt = []
    pitch = max(th * 2.4, ul * 2.3)
    lay2 = "LEGENDA" if opts["legend_layer"] else "E-TEXTO"
    codes = ["EL-%02d" % (i + 1) for i in range(len(items))]
    x_icon = lx + (th * 4.5 if opts["legCols"] else 0)
    if opts["legCols"]:
        S.text(lx, cy + th, "CÓD.", th * 0.9, lay2); S.text(x_icon, cy + th, "SÍMB.", th * 0.9, lay2)
        S.text(x_icon + ul * 2 + th * 1.5, cy + th, "DESCRIÇÃO", th * 0.9, lay2)
        cy += th * 1.8
    for i, (desc, kind, color) in enumerate(items):
        lines = [desc]
        if opts["wrap2"] and len(desc) > 22:
            cut = desc.rfind(" ", 0, 22)
            lines = [desc[:cut], desc[cut + 1:]]
        rowh = max(pitch, th * 1.4 * len(lines) + th * 0.8)
        icx = x_icon + ul; icy = cy + rowh / 2
        r = place_block(S.page, srcsLeg[i], icx, icy, ul, 0, 1, S.ocg[lay])
        if opts["legCols"]:
            S.text(lx, icy + th * 0.35, codes[i], th * 0.95, lay2)
        ty = icy + th * 0.35 - (th * 0.7 if len(lines) > 1 else 0)
        for L in lines:
            S.text(x_icon + ul * 2 + th * 1.5, ty, L, th, lay2); ty += th * 1.4
        if opts["legCols"]:
            S.text(x_icon + ul * 2 + th * 1.5 + th * 0.55 * max(len(d) for d, _, _ in items) + th * 2, icy + th * 0.35, str(counts[i]) + " un", th * 0.95, lay2)
        gt.append({"text": desc, "icon": r, "kind": kind, "count": counts[i], "inst": places[i]})
        cy += rowh
    if opts["frame"]:
        sh = S.page.new_shape(); sh.draw_rect(fitz.Rect(lx - th, ly - th, lx + ul * 2 + th * 2 + th * 0.55 * max(len(d) for d, _, _ in items), cy + th))
        sh.finish(color=(0, 0, 0), width=0.7, oc=S.ocg["CARIMBO"]); sh.commit()

    # notas e carimbo
    S.text(W * 0.62 if opts["where"] != "right" else lx, H * 0.72, "NOTAS", th * 1.3)
    for k, t in enumerate(["1. COTAS EM CENTÍMETROS.", "2. ALTURAS CONFORME MEMORIAL.", "3. VER COMPATIBILIZAÇÃO."]):
        S.text(W * 0.62 if opts["where"] != "right" else lx, H * 0.72 + th * 2 + k * th * 1.6, t, th * 0.9)
    sh = S.page.new_shape(); bb = [W * 0.7, H * 0.86, W - th * 3, H - th * 3]
    sh.draw_rect(fitz.Rect(*bb))
    for k in range(1, 5): sh.draw_line((bb[0], bb[1] + k * (bb[3] - bb[1]) / 5), (bb[2], bb[1] + k * (bb[3] - bb[1]) / 5))
    sh.finish(color=(0, 0, 0), width=0.8, oc=S.ocg["CARIMBO"]); sh.commit()
    for k, t in enumerate(["PROJETO EXECUTIVO ELÉTRICO", "PLANTA BAIXA", "ESCALA 1:50", "FOLHA EL-02", "REV R00"]):
        S.text(bb[0] + th, bb[1] + k * (bb[3] - bb[1]) / 5 + th * 1.6, t, th * 0.9)

    tmp = out + ".tmp.pdf"
    if opts["rot"]:
        S.doc.save(tmp)
        src = fitz.open(tmp); d2 = fitz.open(); p2 = d2.new_page(width=S.H, height=S.W)
        p2.show_pdf_page(p2.rect, src, 0, rotate=opts["rot"]); p2.set_rotation(opts["rot"])
        S.doc = d2
    if opts["scan"]:
        if not opts["rot"]: S.doc.save(tmp); S.doc = fitz.open(tmp)
        pg = S.doc[0]; pix = pg.get_pixmap(dpi=rnd.choice([150, 200]))
        d3 = fitz.open(); p3 = d3.new_page(width=pg.rect.width, height=pg.rect.height)
        p3.insert_image(p3.rect, pixmap=pix); S.doc = d3
    S.doc.save(out)
    if os.path.exists(tmp): os.remove(tmp)
    return {"file": os.path.basename(out), "opts": opts, "items": gt}


if __name__ == "__main__":
    n = int(sys.argv[1]) if len(sys.argv) > 1 else 30
    base = int(sys.argv[2]) if len(sys.argv) > 2 else 7000
    pref = sys.argv[3] if len(sys.argv) > 3 else "hard"
    gtf = sys.argv[4] if len(sys.argv) > 4 else "gt_hard.json"
    os.makedirs("pdf2", exist_ok=True)
    allgt = [make(base + i, f"pdf2/{pref}{i:03d}.pdf") for i in range(n)]
    json.dump(allgt, open(gtf, "w"), ensure_ascii=False, indent=0)
    tot = sum(sum(it["count"] for it in g["items"]) for g in allgt)
    print(n, "folhas,", tot, "instâncias,", sum(1 for g in allgt if g["opts"]["scan"]), "escaneadas,",
          sum(1 for g in allgt if g["opts"]["angles"] == "free"), "com rotação livre")
