"""Counting benchmark: legend + a plan whose symbols are placed with KNOWN counts.

Realistic hardships, all with ground truth:
  - legend icon drawn at a different size than the plan instances (legratio)
  - instances rotated 0/90/180/270 (and small angles), scale jitter
  - walls/conduits drawn OVER the symbols (occlusion)
  - labels glued to symbols
  - decoy symbols that are not in the legend
  - same shape / different colour pairs (two legend rows)
  - scanned variant: the whole sheet rasterised at 150 dpi
"""
import pymupdf as fitz, random, math, json, sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from gen import Sheet, legend_block, notes, loadtable, titleblock, wrap, COLORS, DESCS, LONGDESCS, HEADERS, SECTIONS

# só descrições de ITEM DE PONTO: as de rota (eletroduto, eletrocalha, cabo) viram metros, não unidades
LINEAR = ("ELETROCALHA", "ELETRODUTO", "PERFILADO", "LEITO", "CABO", "CABLE TRAY", "CANALETA")
PDESCS = [d for d in DESCS if not any(w in d.upper() for w in LINEAR)]
PLONG = [d for d in LONGDESCS if not any(w in d.upper() for w in LINEAR)]

PKINDS = ["circle", "squarex", "tri", "dot", "hex", "arrow", "panel"]


def place(S, kind, x, y, u, color, angle=0, scale=1.0, width=0.6):
    m = fitz.Matrix(scale, scale) * fitz.Matrix(angle) if angle or scale != 1 else None
    morph = (fitz.Point(x, y), m) if m else None
    S.icon(kind, x, y, u, color, "E-SIMB", morph=morph, width=width)


def plan2(S, area, items, rnd, opts):
    """draws the plan with a known number of instances of each legend item; returns counts"""
    th = S.th
    x0, y0, x1, y1 = area
    # walls first (under)
    sh = S.page.new_shape(); sh.draw_rect(fitz.Rect(x0, y0, x1, y1))
    for i in range(rnd.randint(3, 6)):
        xx = rnd.uniform(x0, x1); sh.draw_line((xx, y0), (xx, y1))
    for i in range(rnd.randint(2, 4)):
        yy = rnd.uniform(y0, y1); sh.draw_line((x0, yy), (x1, yy))
    sh.finish(color=(0.5, 0.5, 0.5), width=0.8, oc=S.ocg["A-PAREDE"]); sh.commit()

    u = opts["uplan"]
    spots = []
    counts = []
    places = []
    for (desc, kind, color) in items:
        n = rnd.choice([0, 1, 2, 3, 3, 4, 5, 6, 8, 10, 12, 15, 21])
        placed = 0; pl = []
        for k in range(n * 3):
            if placed >= n:
                break
            x = rnd.uniform(x0 + u * 2, x1 - u * 2); y = rnd.uniform(y0 + u * 2, y1 - u * 2)
            if any((x - px) ** 2 + (y - py) ** 2 < (u * 2.2) ** 2 for px, py in spots):
                continue
            ang = rnd.choice([0, 0, 0, 90, 180, 270]) if opts["rotinst"] else 0
            sc = rnd.uniform(0.94, 1.06) if opts["scalejit"] else 1.0
            col = (0, 0, 0) if opts["blackplan"] else color
            place(S, kind, x, y, u, col, ang, sc, width=opts["lw"])
            spots.append((x, y)); placed += 1; pl.append([round(x,2), round(y,2), ang, round(sc,3)])
            if rnd.random() < 0.35:
                S.text(x + u * 0.9, y - u * 0.5, rnd.choice(["h=0,30", "QL-1", "A", "2x", "c1", "IL.03", "TUG"]), th * 0.7)
        counts.append(placed); places.append(pl)

    # decoys: shapes that are NOT in the legend
    legkinds = set(k for _, k, _ in items)
    dk = [k for k in PKINDS if k not in legkinds]
    for i in range(rnd.randint(4, 14)):
        if not dk:
            break
        x = rnd.uniform(x0 + u * 2, x1 - u * 2); y = rnd.uniform(y0 + u * 2, y1 - u * 2)
        if any((x - px) ** 2 + (y - py) ** 2 < (u * 2.2) ** 2 for px, py in spots):
            continue
        place(S, rnd.choice(dk), x, y, u * rnd.uniform(0.8, 1.3), rnd.choice(COLORS), width=opts["lw"])
        spots.append((x, y))

    # conduits drawn OVER the symbols: polylines from symbol to symbol
    if opts["occl"] and spots:
        sh = S.page.new_shape()
        for i in range(rnd.randint(4, 12)):
            a = rnd.choice(spots); b = rnd.choice(spots)
            sh.draw_line((a[0], a[1]), (a[0], b[1])); sh.draw_line((a[0], b[1]), (b[0], b[1]))
        sh.finish(color=(0.1, 0.1, 0.1), width=0.5, dashes="[4 2] 0", oc=S.ocg["E-SIMB"]); sh.commit()

    # circuit-label column trap
    cx = rnd.uniform(x0 + 40, x1 - 150); cy = rnd.uniform(y0 + 40, max(y0 + 41, y1 - th * 30))
    for k in range(rnd.randint(4, 8)):
        S.text(cx + th * 2, cy + k * th * 3 + th * 0.35, f"IL.{rnd.randint(1,12):02d}{'abcdefgh'[k%8]}", th * 0.8)
    for i in range(rnd.randint(3, 8)):
        S.text(rnd.uniform(x0 + 20, max(x0 + 21, x1 - 120)), rnd.uniform(y0 + 20, y1 - 20),
               rnd.choice(["SALA DE REUNIÃO", "COPA", "CIRCULAÇÃO", "DIRETORIA", "OPEN SPACE", "CPD", "SANITÁRIO"]), th * 1.1)
    return counts, places


def make(seed, out):
    rnd = random.Random(seed)
    opts = dict(size=rnd.choice(["A1", "A3", "A3", "A4p"]), stroke=rnd.random() < 0.35,
                font=rnd.choice(["rowmans", "futural", "futuram"]), legend_layer=rnd.random() < 0.5,
                frame=rnd.random() < 0.5, wrap=rnd.choice([0, 0, 28]),
                style=rnd.choice(["list", "list", "table", "right", "sections", "columns"]),
                where=rnd.choice(["right", "bottom", "left", "topright"]), rot=rnd.choice([0, 0, 0, 90, 270]),
                scan=rnd.random() < 0.2, legratio=rnd.choice([1.0, 1.0, 1.3, 1.6, 2.0, 0.8]),
                rotinst=rnd.random() < 0.5, scalejit=rnd.random() < 0.4, blackplan=rnd.random() < 0.25,
                occl=rnd.random() < 0.6, lw=rnd.choice([0.4, 0.6, 0.6, 0.9]))
    base = {"A1": 6, "A3": 4.2, "A4p": 3.2}[opts["size"]]
    opts["th"] = base * rnd.uniform(0.85, 1.25)
    S = Sheet(rnd, opts); th = S.th; W, H = S.W, S.H
    opts["uplan"] = th * rnd.uniform(1.3, 2.0)

    n = rnd.randint(4, 10)
    n = min(n, len(PDESCS))
    descs = rnd.sample(PDESCS, n)
    if opts["wrap"]:
        descs[0] = rnd.choice(PLONG) if PLONG else descs[0]
    used = set(); items = []
    for d in descs:
        for _ in range(60):
            k = rnd.choice(PKINDS); c = rnd.choice(COLORS)
            if opts["blackplan"] and any(kk == k for _, kk, _ in items):
                continue  # colour cannot disambiguate when the plan is monochrome
            if (k, c) not in used:
                used.add((k, c)); items.append((d, k, c)); break
    header = rnd.choice(HEADERS)
    if opts["where"] == "right":
        plan_area = [th * 6, th * 6, W * 0.74, H - th * 6]; lx, ly = W * 0.77, th * 8
    elif opts["where"] == "left":
        plan_area = [W * 0.3, th * 6, W - th * 6, H - th * 6]; lx, ly = th * 6, th * 8
    elif opts["where"] == "topright":
        plan_area = [th * 6, H * 0.35, W - th * 6, H - th * 6]; lx, ly = W * 0.55, th * 6
    else:
        plan_area = [th * 6, th * 6, W - th * 6, H * 0.6]; lx, ly = th * 8, H * 0.64

    counts, places = plan2(S, plan_area, items, rnd, opts)

    # legend, drawn with its own icon size
    S._legu = opts["uplan"] * opts["legratio"]
    style = opts["style"]; sec = None
    if style == "sections":
        sec = {0: SECTIONS[0], len(items) // 2: SECTIONS[rnd.randint(1, 4)]}
    if style == "columns" and len(items) >= 4:
        h = len(items) // 2
        # as DUAS colunas têm de caber na folha. Sem isto a segunda saía pela borda direita e o pymupdf
        # cortava o texto: o gabarito cobrava item que não estava no papel (cnt015, cnt020).
        def larg(its):
            linhas = [l for d, _, _ in its for l in (wrap(d, opts["wrap"]) if opts["wrap"] else [d])]
            return S._legu * 2.8 + th * 2 + th * 0.55 * max(len(l) for l in linhas) + th * 1.2
        lx = min(lx, max(th * 6, W - th * 3 - larg(items[:h]) - th * 3 - larg(items[h:])))
        b1 = legend_block(S, lx, ly, items[:h], "list", header, None)
        legend_block(S, b1[2] + th * 3, ly + (th * 2.6 if header else 0), items[h:], "list", None, None)
    else:
        legend_block(S, lx, ly, items, "list" if style == "columns" else style, header, sec)
    if opts["where"] in ("right", "left"):
        notes(S, lx, H * 0.62); loadtable(S, lx, H * 0.72); titleblock(S, [lx - th, H * 0.86, lx + W * 0.2, H - th * 3])
    else:
        notes(S, W * 0.62, H * 0.66) if opts["where"] == "bottom" else notes(S, th * 8, H * 0.08)
        titleblock(S, [W * 0.7, H * 0.85, W - th * 3, H - th * 3])

    gt = [{"text": g["text"], "icon": g["icon"], "kind": k, "count": c, "inst": p} for g, (_, k, _), c, p in zip(S.gt, items, counts, places)]

    tmp = out + ".tmp.pdf"
    if opts["rot"]:
        S.doc.save(tmp)
        src = fitz.open(tmp); d2 = fitz.open(); p2 = d2.new_page(width=S.H, height=S.W)
        p2.show_pdf_page(p2.rect, src, 0, rotate=opts["rot"]); p2.set_rotation(opts["rot"])
        S.doc = d2
    if opts["scan"]:
        if not opts["rot"]:
            S.doc.save(tmp)
            S.doc = fitz.open(tmp)
        pg = S.doc[0]
        pix = pg.get_pixmap(dpi=rnd.choice([150, 200]))
        d3 = fitz.open(); p3 = d3.new_page(width=pg.rect.width, height=pg.rect.height)
        p3.insert_image(p3.rect, pixmap=pix)
        S.doc = d3
    S.doc.save(out)
    if os.path.exists(tmp):
        os.remove(tmp)
    return {"file": os.path.basename(out), "opts": {k: v for k, v in opts.items()}, "items": gt}


if __name__ == "__main__":
    n = int(sys.argv[1]) if len(sys.argv) > 1 else 60
    base = int(sys.argv[2]) if len(sys.argv) > 2 else 5000
    pref = sys.argv[3] if len(sys.argv) > 3 else "cnt"
    gtf = sys.argv[4] if len(sys.argv) > 4 else "gt_count.json"
    os.makedirs("pdf2", exist_ok=True)
    allgt = []
    for i in range(n):
        allgt.append(make(base + i, f"pdf2/{pref}{i:03d}.pdf"))
    json.dump(allgt, open(gtf, "w"), ensure_ascii=False, indent=0)
    tot = sum(sum(it["count"] for it in g["items"]) for g in allgt)
    print(n, "folhas,", tot, "instâncias,", sum(1 for g in allgt if g["opts"]["scan"]), "escaneadas")
