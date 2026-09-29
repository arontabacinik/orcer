"""Legend benchmark: randomized sheets with known legend items (icon bbox + text) and realistic traps."""
import pymupdf as fitz, random, math, json, sys, os
from hershey_draw import draw_text as hdraw

COLORS=[(0.85,0.1,0.1),(0.1,0.35,0.85),(0.95,0.55,0),(0,0.6,0.3),(0.7,0.1,0.7),(0,0.6,0.7),(0.5,0.3,0.1)]
DESCS=["TOMADA BAIXA 2P+T 10A - 127V","TOMADA MÉDIA 2P+T 20A - 220V","LUMINÁRIA DE EMBUTIR LED 60x60cm","PONTO DE DADOS/VOZ RJ45 CAT6",
 "INTERRUPTOR SIMPLES 10A","INTERRUPTOR PARALELO 10A","QUADRO DE DISTRIBUIÇÃO DE LUZ - NOVO","ELETROCALHA LISA 100x50mm","ELETRODUTO PVC Ø3/4\" EMBUTIDO NO PISO",
 "PERFILADO 38x38mm PERFURADO","SENSOR DE PRESENÇA DE TETO 360°","CÂMERA CFTV TIPO DOME","LEITORA DE CONTROLE DE ACESSO","CAIXA DE PASSAGEM 20x20x10cm",
 "ARANDELA LED 12W SOBREPOR","BLOCO AUTÔNOMO DE EMERGÊNCIA 30 LEDs","TOMADA DE PISO 4 POSTOS (2 ELÉTRICA + 2 DADOS)","PONTO DE FORÇA PARA AR CONDICIONADO",
 "ACCESS POINT WIRELESS TETO","DETECTOR DE FUMAÇA ÓPTICO","CONDULETE DE ALUMÍNIO 3/4\"","LEITO PARA CABOS 300mm","CABO PP 3x2,5mm²",
 "RECEPTACLE 2P+E 20A WALL MOUNTED","LIGHT FIXTURE LED 2X18W SURFACE","CABLE TRAY 100X50MM CEILING"]
LONGDESCS=["TOMADA DE USO GERAL 2P+T 10A, H=0,30m DO PISO ACABADO, COM ESPELHO BRANCO","ELETROCALHA PERFURADA 200x50mm COM TAMPA, FIXADA NA LAJE COM VERGALHÃO ROSCADO",
 "LUMINÁRIA LINEAR DE SOBREPOR LED 36W 4000K COM DIFUSOR LEITOSO, VER DETALHE 03"]
HEADERS=["LEGENDA","SIMBOLOGIA","LEGENDA - ELÉTRICA","CONVENÇÕES","LEGEND","SIMBOLOGIA ELÉTRICA",None]
SECTIONS=["ILUMINAÇÃO","TOMADAS","INFRAESTRUTURA","SISTEMAS","DADOS E VOZ"]

class Sheet:
    def __init__(s, rnd, opts):
        s.r=rnd; s.o=opts
        W,H={"A1":(2384,1684),"A3":(1191,842),"A4p":(595,842)}[opts["size"]]
        s.doc=fitz.open(); s.page=s.doc.new_page(width=W,height=H); s.W,s.H=W,H
        s.ocg={n:s.doc.add_ocg(n,on=True) for n in ["A-PAREDE","E-SIMB","E-TEXTO","LEGENDA","CARIMBO"]}
        s.gt=[]; s.th=opts["th"]
    def text(s,x,y,t,sz,layer="E-TEXTO",color=(0,0,0)):
        """x,y baseline-left; returns bbox"""
        if s.o["stroke"]:
            w=hdraw(s.page,x,y,t,sz*0.72,s.o["font"],color=color,oc=s.ocg[layer])
            return [x,y-sz*0.72,x+w,y]
        s.page.insert_text((x,y),t,fontsize=sz,fontname="helv",color=color,oc=s.ocg[layer])
        w=fitz.get_text_length(t,fontname="helv",fontsize=sz)
        return [x,y-sz*0.72,x+w,y+sz*0.2]
    # ---- icons: all drawn in a box of size u centered at (x,y); return bbox
    def icon(s,kind,x,y,u,color,layer,morph=None,width=0.6):
        sh=s.page.new_shape(); oc=s.ocg[layer]; r=u/2
        if kind=="circle": sh.draw_circle((x,y),r*0.6); sh.finish(color=color,width=width,oc=oc,morph=morph); sh.draw_line((x-r*0.6,y),(x-r,y)); sh.finish(color=color,width=width,oc=oc,morph=morph)
        elif kind=="squarex": q=fitz.Rect(x-r*.7,y-r*.7,x+r*.7,y+r*.7); sh.draw_rect(q); sh.draw_line(q.tl,q.br); sh.draw_line(q.tr,q.bl); sh.finish(color=color,width=width,oc=oc,morph=morph)
        elif kind=="tri": sh.draw_polyline([fitz.Point(x-r*.7,y+r*.6),fitz.Point(x+r*.7,y+r*.6),fitz.Point(x,y-r*.7),fitz.Point(x-r*.7,y+r*.6)]); sh.finish(color=color,fill=color,width=width*0.7,oc=oc,morph=morph)
        elif kind=="dot": sh.draw_circle((x,y),r*0.35); sh.finish(color=color,fill=color,oc=oc,morph=morph)
        elif kind=="hex": pts=[fitz.Point(x+r*.7*math.cos(k*math.pi/3),y+r*.7*math.sin(k*math.pi/3)) for k in range(7)]; sh.draw_polyline(pts); sh.finish(color=color,width=width,oc=oc,morph=morph)
        elif kind=="arrow": sh.draw_polyline([fitz.Point(x-r*.8,y-r*.25),fitz.Point(x+r*.1,y-r*.25),fitz.Point(x+r*.1,y-r*.6),fitz.Point(x+r*.8,y),fitz.Point(x+r*.1,y+r*.6),fitz.Point(x+r*.1,y+r*.25),fitz.Point(x-r*.8,y+r*.25),fitz.Point(x-r*.8,y-r*.25)]); sh.finish(color=color,fill=color,oc=oc,morph=morph)
        elif kind=="line": sh.draw_line((x-u*1.3,y),(x+u*1.3,y)); sh.finish(color=color,width=width*1.3,oc=oc,morph=morph); sh.commit(); return [x-u*1.3,y-0.4,x+u*1.3,y+0.4]
        elif kind=="dash": sh.draw_line((x-u*1.3,y),(x+u*1.3,y)); sh.finish(color=color,width=width*1.3,dashes="[3 2] 0",oc=oc,morph=morph); sh.commit(); return [x-u*1.3,y-0.4,x+u*1.3,y+0.4]
        elif kind=="band": sh.draw_line((x-u*1.3,y-r*.35),(x+u*1.3,y-r*.35)); sh.draw_line((x-u*1.3,y+r*.35),(x+u*1.3,y+r*.35)); sh.finish(color=color,width=width,oc=oc,morph=morph); sh.commit(); return [x-u*1.3,y-r*.35-0.3,x+u*1.3,y+r*.35+0.3]
        elif kind=="panel": q=fitz.Rect(x-r*.9,y-r*.45,x+r*.9,y+r*.45); sh.draw_rect(q); sh.finish(color=color,fill=(0.85,0.85,0.85),width=width,oc=oc,morph=morph); sh.draw_line((q.x0,q.y0),(q.x1,q.y1)); sh.finish(color=color,width=width*0.7,oc=oc,morph=morph)
        sh.commit()
        return {"circle":[x-r,y-r*.6,x+r*.6,y+r*.6],"squarex":[x-r*.7,y-r*.7,x+r*.7,y+r*.7],"tri":[x-r*.7,y-r*.7,x+r*.7,y+r*.6],"dot":[x-r*.35,y-r*.35,x+r*.35,y+r*.35],
                "hex":[x-r*.7,y-r*.61,x+r*.7,y+r*.61],"arrow":[x-r*.8,y-r*.6,x+r*.8,y+r*.6],"panel":[x-r*.9,y-r*.45,x+r*.9,y+r*.45]}[kind]

KINDS=["circle","squarex","tri","dot","hex","arrow","panel","line","dash","band"]

def wrap(t,n):
    words=t.split(); lines=[]; cur=""
    for w in words:
        if len(cur)+len(w)+1>n and cur: lines.append(cur); cur=w
        else: cur=(cur+" "+w).strip()
    lines.append(cur); return lines

def legend_block(S, x, y, items, style, header, sections):
    """draws one legend block with top-left at (x,y); returns bbox of block"""
    rnd=S.r; th=S.th; lay="LEGENDA" if S.o["legend_layer"] else "E-SIMB"
    u=getattr(S,'_legu',0) or th*rnd.uniform(1.2,2.4); pitch=max(th*rnd.uniform(2.0,3.0), u*1.35)
    x0,y0=x,y; cy=y
    if header:
        S.text(x,cy+th*1.4,header,th*1.4,"LEGENDA" if S.o["legend_layer"] else "E-TEXTO"); cy+=th*2.6
    colgap = th*2
    icon_w = u*2.8
    # a LARGURA DO BLOCO é a da linha mais comprida DEPOIS de quebrar. Medindo pela descrição inteira, o
    # bloco se declarava muito mais largo do que desenhava: na legenda em duas colunas a segunda era
    # empurrada para fora da folha e o pymupdf cortava o texto, deixando só a primeira letra de cada linha
    # (cnt015 e cnt020: 7 itens de gabarito que não estavam no papel — nenhum leitor podia achá-los).
    _linhas = [l for d,_,_ in items for l in (wrap(d, S.o["wrap"]) if S.o["wrap"] else [d])]
    width_text = th*0.55*max(len(l) for l in _linhas)
    rows=[]
    if style=="table":
        # header row
        S.text(x+th*0.5,cy+th*1.2,"SÍMBOLO",th*0.9); S.text(x+icon_w+th*1.5,cy+th*1.2,"DESCRIÇÃO",th*0.9); hy=cy; cy+=th*2.0
    sec_i=0
    for k,(desc,kind,color) in enumerate(items):
        if sections and k in sections:
            S.text(x+(icon_w+colgap if style!="right" else 0),cy+th*1.1,sections[k],th); cy+=pitch*0.9
        lines = wrap(desc, S.o["wrap"]) if S.o["wrap"] else [desc]
        rowh = max(pitch, th*1.35*len(lines)+th*0.9)
        icy = cy + rowh/2 - (th*0.2 if len(lines)>1 else 0)
        icy = cy + th*0.9 if len(lines)>1 else cy+rowh/2
        if style in ("list","table","sections"):
            ib=S.icon(kind, x+icon_w/2, icy, u, color, lay); tx=x+icon_w+colgap
            tb=None
            for j,l in enumerate(lines):
                b=S.text(tx, icy+th*0.35+j*th*1.35, l, th); tb=b if tb is None else [min(tb[0],b[0]),min(tb[1],b[1]),max(tb[2],b[2]),max(tb[3],b[3])]
        else: # right: text left, icon at fixed column on the right
            tx=x; tb=None
            for j,l in enumerate(lines):
                b=S.text(tx, icy+th*0.35+j*th*1.35, l, th); tb=b if tb is None else [min(tb[0],b[0]),min(tb[1],b[1]),max(tb[2],b[2]),max(tb[3],b[3])]
            ib=S.icon(kind, x+width_text+colgap+icon_w/2, icy, u, color, lay)
        S.gt.append({"text":desc,"icon":ib})
        rows.append((cy,cy+rowh)); cy+=rowh
    x1 = x + icon_w + colgap + width_text if style!="right" else x+width_text+colgap+icon_w
    bb=[x0-th*0.6,y0-th*0.3,x1+th*0.6,cy+th*0.4]
    if style=="table":
        sh=S.page.new_shape(); sh.draw_rect(fitz.Rect(*bb)); sh.draw_line((x+icon_w+th*0.6,hy),(x+icon_w+th*0.6,cy));
        for (a,b) in rows: sh.draw_line((bb[0],a),(bb[2],a))
        sh.draw_line((bb[0],hy),(bb[2],hy))
        sh.finish(color=(0,0,0),width=0.5,oc=S.ocg["LEGENDA" if S.o["legend_layer"] else "CARIMBO"]); sh.commit()
    elif S.o["frame"]:
        sh=S.page.new_shape(); sh.draw_rect(fitz.Rect(*bb)); sh.finish(color=(0,0,0),width=0.7,oc=S.ocg["CARIMBO"]); sh.commit()
    return bb

def plan(S, area):
    """architecture + symbols + TRAPS: circuit labels next to symbols aligned in columns, notes, load table"""
    rnd=S.r; th=S.th; x0,y0,x1,y1=area
    sh=S.page.new_shape(); sh.draw_rect(fitz.Rect(x0,y0,x1,y1))
    for i in range(rnd.randint(3,6)): xx=rnd.uniform(x0,x1); sh.draw_line((xx,y0),(xx,y1))
    for i in range(rnd.randint(2,4)): yy=rnd.uniform(y0,y1); sh.draw_line((x0,yy),(x1,yy))
    sh.finish(color=(0.5,0.5,0.5),width=0.8,oc=S.ocg["A-PAREDE"]); sh.commit()
    # trap 1: a column of symbols each with a circuit label to its right ("IL.05c") — looks like a legend locally
    cx=rnd.uniform(x0+40,x1-150); cy=rnd.uniform(y0+40,y1-th*30)
    for k in range(rnd.randint(4,8)):
        S.icon(rnd.choice(["circle","squarex","tri"]), cx, cy+k*th*3, th*1.6, rnd.choice(COLORS), "E-SIMB")
        S.text(cx+th*2, cy+k*th*3+th*0.35, f"IL.{rnd.randint(1,12):02d}{'abcdefgh'[k%8]}", th*0.8)
    # scattered symbols with labels
    for i in range(rnd.randint(20,50)):
        x=rnd.uniform(x0+20,x1-20); y=rnd.uniform(y0+20,y1-20)
        S.icon(rnd.choice(KINDS[:7]), x, y, th*1.6, rnd.choice(COLORS), "E-SIMB")
        if rnd.random()<0.4: S.text(x+th*1.4,y-th*0.6,rnd.choice(["h=0,30","QL-1","A","2x","c1","IL.03"]),th*0.7)
    # room names
    for i in range(rnd.randint(3,8)): S.text(rnd.uniform(x0+20,x1-120), rnd.uniform(y0+20,y1-20), rnd.choice(["SALA DE REUNIÃO","COPA","CIRCULAÇÃO","DIRETORIA","OPEN SPACE","CPD","SANITÁRIO"]), th*1.1)

def notes(S,x,y):
    th=S.th; S.text(x,y,"NOTAS",th*1.3)
    for k,t in enumerate(["1. TODAS AS COTAS EM CENTÍMETROS, SALVO INDICAÇÃO.","2. ALTURAS CONFORME MEMORIAL DESCRITIVO.","3. VERIFICAR COMPATIBILIZAÇÃO COM AR CONDICIONADO.","4. ELETRODUTOS NÃO COTADOS: Ø3/4\"."]):
        S.text(x,y+th*2+k*th*1.6,t,th*0.9)

def loadtable(S,x,y):
    th=S.th; sh=S.page.new_shape()
    S.text(x,y-th*0.5,"QUADRO DE CARGAS - QL-1",th*1.1)
    for r in range(6):
        sh.draw_line((x,y+r*th*1.8),(x+th*28,y+r*th*1.8))
        for c,t in enumerate(["C"+str(r+1),str(100*(r+3))+"W","127V","10A"]): S.text(x+th*0.5+c*th*7,y+r*th*1.8+th*1.3,t,th*0.8)
    for c in range(5): sh.draw_line((x+c*th*7,y),(x+c*th*7,y+5*th*1.8))
    sh.finish(color=(0,0,0),width=0.4,oc=S.ocg["CARIMBO"]); sh.commit()

def titleblock(S, bb):
    th=S.th; sh=S.page.new_shape(); sh.draw_rect(fitz.Rect(*bb))
    for k in range(1,5): sh.draw_line((bb[0],bb[1]+k*(bb[3]-bb[1])/5),(bb[2],bb[1]+k*(bb[3]-bb[1])/5))
    sh.finish(color=(0,0,0),width=0.8,oc=S.ocg["CARIMBO"]); sh.commit()
    for k,t in enumerate(["PROJETO EXECUTIVO DE INSTALAÇÕES ELÉTRICAS","PLANTA BAIXA - PAVIMENTO TIPO","ESCALA 1:50","FOLHA EL-02","REVISÃO R00"]):
        S.text(bb[0]+th,bb[1]+k*(bb[3]-bb[1])/5+th*1.6,t,th*0.9)

def make(seed, out):
    rnd=random.Random(seed)
    opts=dict(size=rnd.choice(["A1","A3","A3","A4p"]), stroke=rnd.random()<0.35, font=rnd.choice(["rowmans","futural","futuram"]),
              legend_layer=rnd.random()<0.5, frame=rnd.random()<0.5, wrap=rnd.choice([0,0,28,34]),
              style=rnd.choice(["list","list","table","right","sections","columns","blocks"]), where=rnd.choice(["right","bottom","left","topright"]),
              rot=rnd.choice([0,0,0,90,270]))
    base={"A1":6,"A3":4.2,"A4p":3.2}[opts["size"]]; opts["th"]=base*rnd.uniform(0.8,1.3)
    S=Sheet(rnd,opts); th=S.th; W,H=S.W,S.H
    n=rnd.randint(4,12); descs=rnd.sample(DESCS,min(n,len(DESCS)))
    if opts["wrap"]: descs[0]=rnd.choice(LONGDESCS)
    kinds=[rnd.choice(KINDS) for _ in descs]
    # icons must be distinct (kind,color) per item
    used=set(); items=[]
    for d,k in zip(descs,kinds):
        for _ in range(50):
            c=rnd.choice(COLORS); k2=k if (k,c) not in used else rnd.choice(KINDS)
            if (k2,c) not in used: used.add((k2,c)); items.append((d,k2,c)); break
    header=rnd.choice(HEADERS)
    # layout zones
    if opts["where"]=="right": plan_area=[th*6,th*6,W*0.74,H-th*6]; lx,ly=W*0.77,th*8
    elif opts["where"]=="left": plan_area=[W*0.3,th*6,W-th*6,H-th*6]; lx,ly=th*6,th*8
    elif opts["where"]=="topright": plan_area=[th*6,H*0.35,W-th*6,H-th*6]; lx,ly=W*0.55,th*6
    else: plan_area=[th*6,th*6,W-th*6,H*0.6]; lx,ly=th*8,H*0.64
    plan(S, plan_area)
    style=opts["style"]; sec=None
    if style=="sections": sec={0:SECTIONS[0], len(items)//2: SECTIONS[rnd.randint(1,4)]}
    if style in ("columns","blocks") and len(items)>=4:
        h=len(items)//2
        b1=legend_block(S,lx,ly,items[:h],"list",header,None)
        if style=="columns": bx,by=b1[2]+th*3,ly+(th*2.6 if header else 0); hdr2=None
        else: bx,by=(b1[2]+th*6, ly+th*rnd.uniform(0,25)) if opts["where"] in ("bottom","topright") else (lx, b1[3]+th*8); hdr2=rnd.choice(["LEGENDA - SISTEMAS","SIMBOLOGIA - DADOS","LEGEND - LIGHTING"]) if header else None
        legend_block(S,bx,by,items[h:],"list",hdr2,None)
    else:
        legend_block(S,lx,ly,items,"list" if style=="columns" or style=="blocks" else style,header,sec)
    # other text blocks near the legend: notes + load table + title block
    if opts["where"] in ("right","left"):
        notes(S,lx,H*0.62); loadtable(S,lx,H*0.72); titleblock(S,[lx-th,H*0.86,lx+W*0.2,H-th*3])
    else:
        notes(S,W*0.62,H*0.66) if opts["where"]=="bottom" else notes(S,th*8,H*0.08); titleblock(S,[W*0.7,H*0.85,W-th*3,H-th*3])
    if opts["rot"]:
        # like CAD exports: content stored rotated, /Rotate makes it upright on screen (GT stays in display space)
        tmp=out+".tmp.pdf"; S.doc.save(tmp)
        src=fitz.open(tmp); d2=fitz.open(); p2=d2.new_page(width=S.H,height=S.W)
        p2.show_pdf_page(p2.rect,src,0,rotate=opts["rot"]); p2.set_rotation(opts["rot"])
        d2.save(out); os.remove(tmp); return {"file":os.path.basename(out),"opts":opts,"items":S.gt}
    S.doc.save(out)
    return {"file":os.path.basename(out),"opts":opts,"items":S.gt}

if __name__=="__main__":
    n=int(sys.argv[1]) if len(sys.argv)>1 else 60
    base=int(sys.argv[2]) if len(sys.argv)>2 else 1000
    pref=sys.argv[3] if len(sys.argv)>3 else "leg"
    gtf=sys.argv[4] if len(sys.argv)>4 else "gt.json"
    os.makedirs("pdf",exist_ok=True); allgt=[]
    for i in range(n):
        allgt.append(make(base+i, f"pdf/{pref}{i:03d}.pdf"))
    json.dump(allgt,open(gtf,"w"),ensure_ascii=False,indent=0)
    from collections import Counter
    print(n, "folhas", Counter(g["opts"]["style"] for g in allgt), Counter(g["opts"]["stroke"] for g in allgt), Counter(g["opts"]["rot"] for g in allgt))
