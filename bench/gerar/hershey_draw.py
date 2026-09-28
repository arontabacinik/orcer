from HersheyFonts import HersheyFonts
import math
_F={}
def font(fn):
    if fn not in _F:
        f=HersheyFonts(); f.load_default_font(fn)
        Hs=[p for s in f.strokes_for_text("H") for p in s]; ys=[p[1] for p in Hs]
        _F[fn]=(f,min(ys),max(ys)-min(ys))
    return _F[fn]
ACC={'Ã':('A','~'),'Õ':('O','~'),'Á':('A','´'),'É':('E','´'),'Í':('I','´'),'Ó':('O','´'),'Ú':('U','´'),'Â':('A','^'),'Ê':('E','^'),'Ô':('O','^'),'Ç':('C',',')}
def draw_text(page, x, y, text, size, fn="rowmans", color=(0,0,0), angle=0.0, width=0.35, oc=0, spacing=0.28):
    """x,y = baseline-left; size = cap height (pt)"""
    import pymupdf as fitz
    f,top,cap=font(fn); k=size/cap
    ca,sa=math.cos(angle),math.sin(angle)
    def T(px,py): # px,py in cap units, y from top (0) to baseline(1)
        X=px*size; Y=(py-1)*size
        return fitz.Point(x+X*ca-Y*sa, y+X*sa+Y*ca)
    cx=0.0; sh=page.new_shape()
    for ch in text:
        base,acc=ACC.get(ch,(ch,None))
        if base==' ': cx+=0.55; continue
        strokes=[[((px)/cap,(py-top)/cap) for px,py in s] for s in f.strokes_for_text(base)]
        if not strokes: cx+=0.5; continue
        minx=min(p[0] for s in strokes for p in s); maxx=max(p[0] for s in strokes for p in s)
        for s in strokes:
            pts=[T(cx+px-minx,py) for px,py in s]
            if len(pts)>=2: sh.draw_polyline(pts)
        w=maxx-minx
        if acc=='~': sh.draw_polyline([T(cx+w*0.15,-0.12),T(cx+w*0.35,-0.22),T(cx+w*0.6,-0.12),T(cx+w*0.85,-0.22)])
        elif acc=='´': sh.draw_line(T(cx+w*0.4,-0.1),T(cx+w*0.65,-0.28))
        elif acc=='^': sh.draw_polyline([T(cx+w*0.25,-0.1),T(cx+w*0.5,-0.28),T(cx+w*0.75,-0.1)])
        elif acc==',': sh.draw_polyline([T(cx+w*0.5,1.0),T(cx+w*0.5,1.12),T(cx+w*0.3,1.25)])
        cx+=w+spacing
    sh.finish(color=color,width=width,oc=oc); sh.commit()
    return cx*size
