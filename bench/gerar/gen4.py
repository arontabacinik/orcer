"""Benchmark SUJO: o que um PDF exportado de CAD real tem e os outros geradores não fazem.

O gen3 já dá bloco com CTM, rotação livre, etiqueta por cima, hachura e densidade. O que falta, e que
aparece em prancha de verdade o tempo todo:

  A) TRAÇO VIRA PREENCHIMENTO. Espessura de pena (lineweight de plotagem, polilinha com largura) sai do
     CAD como um contorno FECHADO E PREENCHIDO, não como um traço. O mesmo símbolo passa a ter outros
     operadores, outro `fill`, outra assinatura — e nada disso muda o que a pessoa vê.
  B) DUAS ESCALAS NA MESMA FOLHA. O detalhe ampliado ao lado da planta: o mesmo símbolo aparece a 1:20 e a
     1:50 na mesma página. Contar os dois é errado; contar só um exige saber qual.
  C) VIEWPORT RECORTADO. A planta é uma janela do espaço-modelo: parede e símbolo entram e saem cortados
     no meio do traço, no limite da janela.
  D) GEOMETRIA DUPLICADA. Copiar-colar em cima do próprio desenho é banal em CAD; o mesmo símbolo fica
     desenhado duas vezes, exatamente no mesmo lugar.
  E) WIPEOUT. Um retângulo branco por cima, para abrir espaço para texto, tapando parte do que está atrás.

Cada propriedade é uma chave do gabarito, para medir SEPARADAMENTE o que cada uma custa. Escrito a partir
do comportamento do CAD, não do que o motor faz — é essa a diferença entre um teste e um espelho.

  python3 gerar/gen4.py <n> <semente> <prefixo> <saida.json>
"""
import pymupdf as fitz, random, math, json, sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from gen import Sheet, legend_block, notes, titleblock, COLORS, HEADERS
from gen2 import PDESCS
from gen3 import symbol_doc, place_block, hatch_area

KINDS = ["circle", "squarex", "tri", "dot", "hex", "arrow", "panel"]


def simbolo_preenchido(page, kind, x, y, u, ang, sc, cor, lw, oc):
    """desenha o símbolo com traços-como-área (ver contorno_preenchido)"""
    sh = page.new_shape()
    w = max(0.35, lw * 1.6)
    a = math.radians(ang); ca, sa = math.cos(a), math.sin(a)
    def T(px, py):
        return (x + (px * ca - py * sa) * sc, y + (px * sa + py * ca) * sc)
    def traco(p0, p1):
        p0, p1 = T(*p0), T(*p1)
        dx, dy = p1[0] - p0[0], p1[1] - p0[1]
        L = math.hypot(dx, dy)
        if L < 1e-6: return
        nx, ny = -dy / L * w / 2, dx / L * w / 2
        sh.draw_polyline([fitz.Point(p0[0] + nx, p0[1] + ny), fitz.Point(p1[0] + nx, p1[1] + ny),
                          fitz.Point(p1[0] - nx, p1[1] - ny), fitz.Point(p0[0] - nx, p0[1] - ny),
                          fitz.Point(p0[0] + nx, p0[1] + ny)])
    def poli(ps, fecha=True):
        ps = list(ps)
        if fecha: ps = ps + [ps[0]]
        for i in range(len(ps) - 1): traco(ps[i], ps[i + 1])
    r = u * 0.62
    # SÓLIDO CONTINUA SÓLIDO. Espessura de pena engorda o CONTORNO; não transforma um triângulo cheio em
    # triângulo vazado. Desenhar assim inventava uma diferença de símbolo que o CAD não faz.
    if kind in ("dot", "tri", "arrow"):
        sh2 = page.new_shape()
        def Ts(px, py): return fitz.Point(*T(px, py))
        if kind == "dot":
            n = 20
            sh2.draw_polyline([Ts(r * .42 * math.cos(2 * math.pi * q / n), r * .42 * math.sin(2 * math.pi * q / n)) for q in range(n + 1)])
        elif kind == "tri":
            sh2.draw_polyline([Ts(-r * .8, r * .65), Ts(r * .8, r * .65), Ts(0, -r * .8), Ts(-r * .8, r * .65)])
        else:
            sh2.draw_polyline([Ts(-r * .85, -r * .28), Ts(r * .1, -r * .28), Ts(r * .1, -r * .62), Ts(r * .85, 0),
                               Ts(r * .1, r * .62), Ts(r * .1, r * .28), Ts(-r * .85, r * .28), Ts(-r * .85, -r * .28)])
        sh2.finish(color=cor, fill=cor, width=w)
        sh2.commit(overlay=True)
        return
    if kind == "circle":
        n = 24
        poli([(r * .72 * math.cos(2 * math.pi * k / n), r * .72 * math.sin(2 * math.pi * k / n)) for k in range(n)])
        traco((-r * .72, 0), (-r, 0))
    elif kind == "squarex":
        q = r * .72
        poli([(-q, -q), (q, -q), (q, q), (-q, q)])
        traco((-q, -q), (q, q)); traco((q, -q), (-q, q))
    elif kind == "tri":
        poli([(-r * .8, r * .65), (r * .8, r * .65), (0, -r * .8)])
    elif kind == "dot":
        n = 16
        poli([(r * .42 * math.cos(2 * math.pi * k / n), r * .42 * math.sin(2 * math.pi * k / n)) for k in range(n)])
    elif kind == "hex":
        poli([(r * .78 * math.cos(k * math.pi / 3), r * .78 * math.sin(k * math.pi / 3)) for k in range(6)])
    elif kind == "arrow":
        poli([(-r * .85, -r * .28), (r * .1, -r * .28), (r * .1, -r * .62), (r * .85, 0), (r * .1, r * .62), (r * .1, r * .28), (-r * .85, r * .28)])
    elif kind == "panel":
        q, qh = r * .95, r * .5
        poli([(-q, -qh), (q, -qh), (q, qh), (-q, qh)])
        traco((-q, -qh), (q, qh))
    sh.finish(color=cor, fill=cor, width=0)        # PREENCHIDO, sem traço: é isso que muda tudo
    sh.commit(overlay=True)


def make(seed, out):
    rnd = random.Random(seed)
    opts = dict(size=rnd.choice(["A1", "A3", "A3"]), stroke=False, font="futural", legend_layer=rnd.random() < 0.6,
                where="right", rot=0, wrap=0, style="list", frame=rnd.random() < 0.5, th=0)
    # as cinco sujeiras, sorteadas por folha — o gabarito registra quais entraram
    # SO=<nome> força UMA sujeira e desliga as outras: é o único jeito de saber o que cada uma custa,
    # porque sorteadas juntas elas se confundem umas com as outras na conta.
    so = os.environ.get("SO", "")
    if so:
        suja = {k: (k == so) for k in ("preenchido", "duasEscalas", "recorte", "duplicado", "wipeout")}
    else:
        suja = dict(
            preenchido=rnd.random() < 0.5,      # A
            duasEscalas=rnd.random() < 0.5,     # B
            recorte=rnd.random() < 0.5,         # C
            duplicado=rnd.random() < 0.4,       # D
            wipeout=rnd.random() < 0.4,         # E
        )
    base = {"A1": 6, "A3": 4.2}[opts["size"]]
    opts["th"] = base * rnd.uniform(0.9, 1.15)
    S = Sheet(rnd, opts); th = S.th; W, H = S.W, S.H
    u = th * rnd.uniform(1.2, 1.7)
    opts["uplan"] = u
    lw = rnd.choice([0.5, 0.7, 0.9])

    # ---- itens da legenda
    n_it = rnd.randint(4, 6)
    kinds = rnd.sample(KINDS, n_it)
    descs = rnd.sample(PDESCS, n_it)
    cores = [(0, 0, 0)] * n_it if rnd.random() < 0.4 else [COLORS[rnd.randrange(len(COLORS))] for _ in range(n_it)]
    itens = list(zip(descs, kinds, cores))

    area = [th * 5, th * 5, W * 0.72, H - th * 5]
    # (C) a janela recortada: o desenho vive dentro dela e é cortado na borda
    janela = [area[0] + th * 2, area[1] + th * 2, area[2] - th * 2, area[3] - th * 2] if suja["recorte"] else None

    # ---- paredes e hachura: a tinta em volta
    sh = S.page.new_shape()
    for _ in range(rnd.randint(6, 12)):
        y = rnd.uniform(area[1], area[3]); sh.draw_line((area[0], y), (area[2], y))
    for _ in range(rnd.randint(4, 8)):
        x = rnd.uniform(area[0], area[2]); sh.draw_line((x, area[1]), (x, area[3]))
    sh.finish(color=(0, 0, 0), width=lw * 1.4, oc=S.ocg["A-PAREDE"]); sh.commit()
    if rnd.random() < 0.6:
        hatch_area(S, area[0], area[1], area[0] + (area[2] - area[0]) * 0.3, area[1] + (area[3] - area[1]) * 0.3,
                   th * 0.55, 45, (0.62, 0.62, 0.62))

    # ---- (B) o detalhe ampliado: um pedaço da folha onde TUDO está noutra escala
    escalaDetalhe = rnd.choice([2.0, 2.5, 3.0])
    detalhe = None
    if suja["duasEscalas"]:
        dw = (area[2] - area[0]) * 0.3
        detalhe = [area[2] - dw, area[3] - dw, area[2], area[3]]
        d = S.page.new_shape(); d.draw_rect(fitz.Rect(*detalhe)); d.finish(color=(0, 0, 0), width=lw); d.commit()
        S.text(detalhe[0] + th * 0.4, detalhe[1] + th * 1.3, "DETALHE 01 - ESC 1:20", th * 0.9)

    # (A) espessura de pena vale para a FOLHA INTEIRA, inclusive a legenda: é assim que o plotter faz.
    # MISTO=1 deixa só a planta preenchida — o caso em que legenda e planta saíram com penas diferentes,
    # que também acontece (legenda no espaço do papel, planta no espaço do modelo).
    misto = os.environ.get("MISTO") == "1"
    if suja["preenchido"] and not misto:
        def icon_cheio(kind, x, y, u2, color, layer, morph=None, width=0.6):
            # desenha só o símbolo preenchido e devolve a caixa pela mesma fórmula do gen.py — nada de
            # rabisco branco auxiliar, que virava o "ícone" que o motor lia
            simbolo_preenchido(S.page, kind, x, y, u2 / 2 / 0.62, 0, 1.0, color, lw, S.ocg[layer])
            r = u2 / 2
            return {"circle": [x - r, y - r * .6, x + r * .6, y + r * .6],
                    "squarex": [x - r * .7, y - r * .7, x + r * .7, y + r * .7],
                    "tri": [x - r * .7, y - r * .7, x + r * .7, y + r * .6],
                    "dot": [x - r * .35, y - r * .35, x + r * .35, y + r * .35],
                    "hex": [x - r * .7, y - r * .61, x + r * .7, y + r * .61],
                    "arrow": [x - r * .8, y - r * .6, x + r * .8, y + r * .6],
                    "panel": [x - r * .9, y - r * .45, x + r * .9, y + r * .45]}[kind]
        S.icon = icon_cheio

    blocos = {}
    def bloco(kind, cor):
        k = (kind, cor)
        if k not in blocos: blocos[k] = symbol_doc(kind, cor, u, lw)
        return blocos[k]

    def por(kind, cor, x, y, ang, sc):
        """coloca um exemplar; devolve False se caiu fora da janela recortada"""
        if janela and not (janela[0] + u < x < janela[2] - u and janela[1] + u < y < janela[3] - u):
            # (C) fora da janela: o CAD desenha e o recorte corta. Desenha na borda, cortado.
            return False
        if suja["preenchido"]:
            simbolo_preenchido(S.page, kind, x, y, u, ang, sc, cor, lw, S.ocg["E-SIMB"])
        else:
            place_block(S.page, bloco(kind, cor), x, y, u, ang, sc, S.ocg["E-SIMB"])
        if suja["duplicado"] and rnd.random() < 0.25:
            # (D) copiar-colar em cima: o MESMO símbolo, no MESMO lugar, duas vezes
            if suja["preenchido"]: simbolo_preenchido(S.page, kind, x, y, u, ang, sc, cor, lw, S.ocg["E-SIMB"])
            else: place_block(S.page, bloco(kind, cor), x, y, u, ang, sc, S.ocg["E-SIMB"])
        return True

    # ---- a planta: contagem conhecida
    gt_itens = []
    ocupado = []
    def livre(x, y, raio):
        return all(math.hypot(x - a, y - b) > raio for a, b in ocupado)
    for (desc, kind, cor) in itens:
        alvo = rnd.randint(4, 14)
        onde = []
        tent = 0
        while len(onde) < alvo and tent < alvo * 60:
            tent += 1
            x = rnd.uniform(area[0] + u * 2, area[2] - u * 2)
            y = rnd.uniform(area[1] + u * 2, area[3] - u * 2)
            if detalhe and detalhe[0] < x < detalhe[2] and detalhe[1] < y < detalhe[3]: continue
            if not livre(x, y, u * 2.1): continue
            ang = rnd.choice([0, 0, 0, 90, 180, 270])
            if por(kind, cor, x, y, ang, 1.0):
                onde.append([round(x, 2), round(y, 2)]); ocupado.append((x, y))
        gt_itens.append({"texto": desc, "qtd": len(onde), "onde": onde})

    # (B) o detalhe: os MESMOS símbolos, ampliados — não entram na contagem
    if detalhe:
        for k in range(rnd.randint(2, 4)):
            desc, kind, cor = itens[k % len(itens)]
            x = rnd.uniform(detalhe[0] + u * escalaDetalhe, detalhe[2] - u * escalaDetalhe)
            y = rnd.uniform(detalhe[1] + u * escalaDetalhe * 1.2, detalhe[3] - u * escalaDetalhe)
            if suja["preenchido"]: simbolo_preenchido(S.page, kind, x, y, u, 0, escalaDetalhe, cor, lw, S.ocg["E-SIMB"])
            else: place_block(S.page, bloco(kind, cor), x, y, u, 0, escalaDetalhe, S.ocg["E-SIMB"])

    # (E) wipeout: retângulo branco por cima, tapando parte do desenho
    if suja["wipeout"]:
        for _ in range(rnd.randint(1, 3)):
            wx = rnd.uniform(area[0], area[2] - th * 14); wy = rnd.uniform(area[1], area[3] - th * 4)
            w = S.page.new_shape(); w.draw_rect(fitz.Rect(wx, wy, wx + th * 13, wy + th * 3.2))
            w.finish(color=None, fill=(1, 1, 1)); w.commit(overlay=True)
            S.text(wx + th * 0.4, wy + th * 2.2, "AR COND. VER PROJETO", th * 0.85)

    # ---- a legenda, com o ícone no MESMO desenho da planta
    S._legu = u * rnd.choice([1.0, 1.0, 1.4])
    lx, ly = W * 0.75, th * 8
    legend_block(S, lx, ly, itens, "list", rnd.choice(HEADERS), None)
    notes(S, lx, H * 0.62)
    titleblock(S, [lx - th, H * 0.86, lx + W * 0.2, H - th * 3])

    S.doc.save(out, deflate=True)
    S.doc.close()
    return {"arquivo": os.path.basename(out), "suja": suja, "semente": seed,
            "escala_detalhe": escalaDetalhe if detalhe else None, "itens": gt_itens}


if __name__ == "__main__":
    n, seed0, pref, saida = int(sys.argv[1]), int(sys.argv[2]), sys.argv[3], sys.argv[4]
    d = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "sujas")
    os.makedirs(d, exist_ok=True)
    gt = []
    for i in range(n):
        nome = f"{pref}{i:03d}.pdf"
        g = make(seed0 + i * 7919, os.path.join(d, nome))
        gt.append(g)
    json.dump(gt, open(saida, "w"), ensure_ascii=False, indent=1)
    tot = sum(sum(x["qtd"] for x in g["itens"]) for g in gt)
    print(f"{n} folhas sujas, {tot} instâncias")
    for k in ["preenchido", "duasEscalas", "recorte", "duplicado", "wipeout"]:
        print(f"  {k}: {sum(1 for g in gt if g['suja'][k])} folhas")
