#!/usr/bin/env python3
"""Gera o 'Guia de Zonas — Região AMP' (PDF) com branding Somnium:
Parte A comparativo (mapa, grafico, ranking) + Parte B ficha por zona + metodologia."""
import json, os, re, unicodedata, statistics as st
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib import colors
from reportlab.lib.styles import ParagraphStyle
from reportlab.platypus import (BaseDocTemplate, PageTemplate, Frame, Paragraph, Spacer,
                                Table, TableStyle, Image, PageBreak, KeepTogether, NextPageTemplate)
from reportlab.graphics.shapes import Drawing
from reportlab.graphics.charts.barcharts import VerticalBarChart
import zonas_contexto as ZC

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
data = json.load(open(os.path.join(HERE, "amp_dataset.json"), encoding="utf-8"))
ims = data["imoveis"]
fotos_local = {}
fl = os.path.join(HERE, "fotos_local.json")
if os.path.exists(fl):
    fotos_local = json.load(open(fl))

GOLD = colors.HexColor("#C9A84C"); DARK = colors.HexColor("#0d0d0d")
GREY = colors.HexColor("#6b6b6b"); LIGHT = colors.HexColor("#f4f1ea")
LINE = colors.HexColor("#e0dccf"); WHITE = colors.white
GREEN = colors.HexColor("#2e7d32"); RED = colors.HexColor("#c62828")

def eur(v): return "—" if v is None else f"{v:,.0f}".replace(",", " ") + " €"
def eurm2(v): return "—" if v is None else f"{v:,.0f}".replace(",", " ") + " €/m²"
def pct(v): return "—" if v is None else f"{v:.1f}".replace(".", ",") + " %"
def area(v): return "—" if v is None else f"{v:,.0f}".replace(",", " ") + " m²"
def slug(s):
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")

SHORT = {
    "Santa Marinha e São Pedro da Afurada": "Afurada / St.ª Marinha",
    "Mafamude e Vilar do Paraíso": "Mafamude",
    "Oliveira do Douro": "Oliveira do Douro",
    "Canidelo": "Canidelo", "Pedroso e Seixezelo": "Pedroso",
    "Serzedo e Perosinho": "Serzedo", "Sandim, Olival, Lever e Crestuma": "Sandim",
}
def short(z): return SHORT.get(z, z)

def col_m2(v, vmin, vmax):
    t = (v - vmin) / ((vmax - vmin) or 1)
    if t < 0.5:
        k = t / 0.5; r, g, b = 46 + (249-46)*k, 125 + (168-125)*k, 50 + (37-50)*k
    else:
        k = (t-0.5)/0.5; r, g, b = 249 + (198-249)*k, 168 + (40-168)*k, 37 + (40-37)*k
    return colors.Color(r/255, g/255, b/255)

# ---- agregacao por zona ----
zonas = {}
for d in ims:
    zonas.setdefault(d.get("freguesia") or "(sem zona)", []).append(d)

def agg(arr):
    m2 = [d["valor_mercado_m2"] for d in arr if d.get("valor_mercado_m2")]
    yl = [d["yield_media"] for d in arr if d.get("yield_media")]
    dl = [d["delta_ask_mercado_pct"] for d in arr if d.get("delta_ask_mercado_pct") is not None]
    cr = [d["crescimento_pct"] for d in arr if d.get("crescimento_pct") is not None]
    pois = []
    seen = set()
    for d in arr:
        for p in (d.get("pontos_interesse") or []):
            nm = p["nome"]
            if nm.lower() not in seen and len(nm) > 2:
                seen.add(nm.lower()); pois.append(p)
    pois.sort(key=lambda p: p.get("km", 99))
    fotos = []
    for d in arr:
        fotos += fotos_local.get(d["id"], [])
    return {
        "n": len(arr), "m2_med": st.mean(m2) if m2 else None,
        "m2_min": min(m2) if m2 else None, "m2_max": max(m2) if m2 else None,
        "yield_med": st.mean(yl) if yl else None, "delta_med": st.mean(dl) if dl else None,
        "cresc_med": st.mean(cr) if cr else None, "pois": pois, "fotos": fotos,
        "tipologias": ", ".join(sorted({d["tipologia"] for d in arr if d.get("tipologia")})),
    }

zona_rows = [{"zona": z, "imoveis": arr, **agg(arr)} for z, arr in zonas.items()]
zona_rows.sort(key=lambda r: (r["m2_med"] or 0), reverse=True)
todos_m2 = [d["valor_mercado_m2"] for d in ims if d.get("valor_mercado_m2")]
media_amp = st.mean(todos_m2)
todos_yield = [d["yield_media"] for d in ims if d.get("yield_media")]
comp = [d for d in ims if d.get("ask_price") and d.get("valor_mercado")]
deltas = [d["delta_ask_mercado_pct"] for d in comp]
delta_med = st.mean(deltas); n_abaixo = len([x for x in deltas if x < 0])
ask_total = sum(d["ask_price"] for d in comp); merc_total = sum(d["valor_mercado"] for d in comp)
VMIN, VMAX = min(todos_m2), max(todos_m2)

# ---- estilos ----
H1 = ParagraphStyle("H1", fontName="Helvetica-Bold", fontSize=17, textColor=DARK, spaceAfter=3, leading=20)
H2 = ParagraphStyle("H2", fontName="Helvetica-Bold", fontSize=12, textColor=GOLD, spaceBefore=10, spaceAfter=7, leading=15)
ZTAG = ParagraphStyle("ZTAG", fontName="Helvetica-Bold", fontSize=10, textColor=GOLD, spaceAfter=6)
BODY = ParagraphStyle("BODY", fontName="Helvetica", fontSize=9.5, textColor=colors.HexColor("#333333"), leading=14)
SMALL = ParagraphStyle("SMALL", fontName="Helvetica", fontSize=7.5, textColor=GREY, leading=10)
KICK = ParagraphStyle("KICK", fontName="Helvetica-Bold", fontSize=8, textColor=GOLD, spaceAfter=2)
POIST = ParagraphStyle("POI", fontName="Helvetica", fontSize=8, textColor=colors.HexColor("#444"), leading=12)

PW, PH = A4
def cover(c, doc):
    c.setFillColor(DARK); c.rect(0, 0, PW, PH, fill=1, stroke=0)
    c.setFillColor(GOLD); c.rect(0, PH-6*mm, PW, 6*mm, fill=1, stroke=0)
    logo = os.path.join(ROOT, "public", "logo-transparent.png")
    if os.path.exists(logo):
        c.drawImage(logo, (PW-70*mm)/2, PH-70*mm, width=70*mm, height=30*mm, preserveAspectRatio=True, mask="auto")
    c.setFillColor(GOLD); c.setFont("Helvetica-Bold", 11)
    c.drawCentredString(PW/2, PH-92*mm, "GUIA DE ZONAS")
    c.setFillColor(WHITE); c.setFont("Helvetica-Bold", 30)
    c.drawCentredString(PW/2, PH-112*mm, "Preços de Mercado")
    c.drawCentredString(PW/2, PH-126*mm, "por Zona")
    c.setStrokeColor(GOLD); c.setLineWidth(1.2); c.line(PW/2-30*mm, PH-134*mm, PW/2+30*mm, PH-134*mm)
    c.setFillColor(colors.HexColor("#cfcfcf")); c.setFont("Helvetica", 13)
    c.drawCentredString(PW/2, PH-146*mm, "Região AMP — Vila Nova de Gaia")
    c.setFillColor(GOLD); c.setFont("Helvetica-Bold", 12)
    c.drawCentredString(PW/2, PH-158*mm, "Junho de 2026")
    c.setFillColor(colors.HexColor("#9a9a9a")); c.setFont("Helvetica", 9)
    c.drawCentredString(PW/2, 30*mm, f"Baseado em {data['com_estudo']} estudos de mercado de imóveis em carteira")
    c.drawCentredString(PW/2, 24*mm, "Somnium Properties · Confidencial")

def later(c, doc):
    c.setFillColor(GOLD); c.rect(0, PH-4*mm, PW, 4*mm, fill=1, stroke=0)
    logo = os.path.join(ROOT, "public", "logo-dark.png")
    if os.path.exists(logo):
        c.drawImage(logo, 18*mm, PH-18*mm, width=33*mm, height=11*mm, preserveAspectRatio=True, mask="auto")
    c.setFillColor(GREY); c.setFont("Helvetica", 7.5)
    c.drawRightString(PW-18*mm, PH-13*mm, "Guia de Zonas · AMP · Junho 2026")
    c.setStrokeColor(LINE); c.setLineWidth(0.5); c.line(18*mm, 15*mm, PW-18*mm, 15*mm)
    c.setFillColor(GREY); c.setFont("Helvetica", 7.5)
    c.drawString(18*mm, 11*mm, "Somnium Properties · Documento confidencial")
    c.drawRightString(PW-18*mm, 11*mm, f"{doc.page-1}")

doc = BaseDocTemplate(os.path.join(ROOT, "Relatorio_Precos_Mercado_AMP.pdf"), pagesize=A4,
                      leftMargin=18*mm, rightMargin=18*mm, topMargin=22*mm, bottomMargin=18*mm)
frame = Frame(doc.leftMargin, doc.bottomMargin, doc.width, doc.height, id="f")
doc.addPageTemplates([PageTemplate(id="cover", frames=[frame], onPage=cover),
                      PageTemplate(id="body", frames=[frame], onPage=later)])

def fit_image(path, maxw, maxh):
    from PIL import Image as PILImage
    iw, ih = PILImage.open(path).size
    r = min(maxw/iw, maxh/ih)
    return Image(path, width=iw*r, height=ih*r)

def grafico_barras():
    d = Drawing(doc.width, 215)
    bc = VerticalBarChart()
    bc.x = 28; bc.y = 38; bc.width = doc.width - 50; bc.height = 150
    vals = [r["m2_med"] for r in zona_rows]
    bc.data = [vals]
    bc.categoryAxis.categoryNames = [short(r["zona"]) for r in zona_rows]
    bc.categoryAxis.labels.fontSize = 7; bc.categoryAxis.labels.angle = 18
    bc.categoryAxis.labels.boxAnchor = "ne"; bc.categoryAxis.labels.dy = -2
    bc.valueAxis.valueMin = 0; bc.valueAxis.valueMax = (max(vals)//500 + 1)*500
    bc.valueAxis.valueStep = 500; bc.valueAxis.labels.fontSize = 7
    bc.barWidth = 9; bc.groupSpacing = 8
    for i, v in enumerate(vals):
        bc.bars[(0, i)].fillColor = col_m2(v, VMIN, VMAX)
        bc.bars[(0, i)].strokeColor = DARK; bc.bars[(0, i)].strokeWidth = 0.5
    bc.barLabels.fontName = "Helvetica-Bold"; bc.barLabels.fontSize = 7; bc.barLabels.dy = 6
    bc.barLabelFormat = lambda v: f"{v:,.0f}".replace(",", " ")
    bc.barLabelArray = None
    d.add(bc)
    return d

# ===================== conteudo =====================
story = [NextPageTemplate("body"), PageBreak()]

# ---- PARTE A ----
story.append(Paragraph("Onde fica e como se lê a região", H1))
story.append(Paragraph(ZC.INTRO_AMP, BODY))
story.append(Spacer(1, 8))
story.append(Paragraph("Mapa da carteira — preço de mercado por imóvel", H2))
mp = os.path.join(HERE, "map.png")
if os.path.exists(mp):
    img = fit_image(mp, doc.width, 360); img.hAlign = "CENTER"; story.append(img)
story.append(PageBreak())

story.append(Paragraph("Comparação entre zonas", H1))
story.append(Paragraph("Preço de mercado médio por freguesia (€/m²). A cor acompanha o nível de preço, do verde "
                       "(mais acessível) ao vermelho (mais caro).", BODY))
story.append(grafico_barras())
story.append(Spacer(1, 6))

# tabela ranking
head = ["Zona", "Posição", "€/m² médio", "vs média AMP", "Ask vs mercado", "Tendência", "Imóveis"]
rrows = [head]; rank_cmds = []
for i, r in enumerate(zona_rows, start=1):
    vsamp = (r["m2_med"] - media_amp) / media_amp * 100 if r["m2_med"] else None
    vs_txt = "—" if vsamp is None else f"{vsamp:+.0f}%".replace("-", "−")
    dl = r["delta_med"]; dl_txt = "—" if dl is None else f"{dl:+.0f}%".replace("-", "−")
    cr = r["cresc_med"]; cr_txt = "—" if cr is None else f"+{cr:.0f}%/ano"
    rrows.append([short(r["zona"]), ZC.get(r["zona"])["etiqueta"].split()[0], eurm2(r["m2_med"]),
                  vs_txt, dl_txt, cr_txt, str(r["n"])])
    if dl is not None:
        rank_cmds.append(("TEXTCOLOR", (4, i), (4, i), GREEN if dl < 0 else RED))
rt = Table(rrows, colWidths=[34*mm, 22*mm, 24*mm, 24*mm, 26*mm, 26*mm, 18*mm], repeatRows=1)
rt.setStyle(TableStyle([
    ("BACKGROUND",(0,0),(-1,0),DARK),("TEXTCOLOR",(0,0),(-1,0),GOLD),
    ("FONTNAME",(0,0),(-1,0),"Helvetica-Bold"),("FONTSIZE",(0,0),(-1,0),8),
    ("FONTNAME",(0,1),(-1,-1),"Helvetica"),("FONTSIZE",(0,1),(-1,-1),8),
    ("FONTNAME",(2,1),(2,-1),"Helvetica-Bold"),("TEXTCOLOR",(2,1),(2,-1),DARK),
    ("FONTNAME",(4,1),(4,-1),"Helvetica-Bold"),
    ("ROWBACKGROUNDS",(0,1),(-1,-1),[WHITE, LIGHT]),
    ("ALIGN",(1,0),(-1,-1),"CENTER"),("VALIGN",(0,0),(-1,-1),"MIDDLE"),
    ("GRID",(0,0),(-1,-1),0.4,LINE),("LINEBELOW",(0,0),(-1,0),1,GOLD),
    ("TOPPADDING",(0,0),(-1,-1),5),("BOTTOMPADDING",(0,0),(-1,-1),5),("LEFTPADDING",(0,0),(0,-1),7),
] + rank_cmds))
story.append(rt)
story.append(Spacer(1, 8))
co_style = ParagraphStyle("co", fontName="Helvetica", fontSize=9.5, textColor=DARK, leading=14)
callout = Table([[Paragraph(
    f"<b>Leitura de oportunidade.</b> Em média, o preço pedido dos imóveis em carteira está "
    f"<b>{abs(delta_med):.0f}% abaixo</b> do valor de mercado estimado pelos estudos. <b>{n_abaixo} de {len(comp)}</b> "
    f"estão abaixo do mercado — margem potencial agregada de <b>{eur(merc_total - ask_total)}</b>.", co_style)]],
    colWidths=[doc.width])
callout.setStyle(TableStyle([("BACKGROUND",(0,0),(-1,-1),colors.HexColor("#faf6ea")),
                             ("LINEBEFORE",(0,0),(0,-1),3,GOLD),("BOX",(0,0),(-1,-1),0.5,LINE),
                             ("LEFTPADDING",(0,0),(-1,-1),12),("RIGHTPADDING",(0,0),(-1,-1),12),
                             ("TOPPADDING",(0,0),(-1,-1),9),("BOTTOMPADDING",(0,0),(-1,-1),9)]))
story.append(callout)

# ---- PARTE B: ficha por zona ----
for r in zona_rows:
    z = r["zona"]; ctx = ZC.get(z)
    story.append(PageBreak())
    vsamp = (r["m2_med"] - media_amp) / media_amp * 100 if r["m2_med"] else 0
    # cabecalho
    badge = Table([[Paragraph(eurm2(r["m2_med"]), ParagraphStyle("b", fontName="Helvetica-Bold", fontSize=14, textColor=WHITE, alignment=1))]],
                  colWidths=[34*mm])
    badge.setStyle(TableStyle([("BACKGROUND",(0,0),(-1,-1),col_m2(r["m2_med"], VMIN, VMAX)),
                               ("TOPPADDING",(0,0),(-1,-1),7),("BOTTOMPADDING",(0,0),(-1,-1),7),("BOX",(0,0),(-1,-1),1,DARK)]))
    titcol = [Paragraph(z, H1), Paragraph(ctx["etiqueta"], ZTAG)]
    header = Table([[titcol, badge]], colWidths=[doc.width-38*mm, 38*mm])
    header.setStyle(TableStyle([("VALIGN",(0,0),(-1,-1),"MIDDLE"),("ALIGN",(1,0),(1,0),"RIGHT")]))
    story.append(header)
    story.append(Paragraph(ctx["descricao"], BODY))
    story.append(Spacer(1, 7))

    # indicadores
    def card(t, v, s):
        return Table([[Paragraph(t, KICK)],
                      [Paragraph(v, ParagraphStyle("v", fontName="Helvetica-Bold", fontSize=14, textColor=DARK))],
                      [Paragraph(s, SMALL)]], colWidths=[doc.width/4 - 6])
    vs_txt = f"{vsamp:+.0f}%".replace("-", "−")
    cr_txt = "—" if r["cresc_med"] is None else f"+{r['cresc_med']:.0f}%/ano"
    if r["n"] == 1:
        rng_sub = "1 imóvel avaliado"
    elif r["m2_min"] is None:
        rng_sub = "—"
    else:
        rng_sub = f"{r['m2_min']:,.0f}–{r['m2_max']:,.0f}".replace(",", " ") + " (min–máx)"
    cards = Table([[card("€/M² MÉDIO", eurm2(r["m2_med"]), rng_sub),
                    card("VS MÉDIA AMP", vs_txt, "face às 7 zonas"),
                    card("TENDÊNCIA", cr_txt, "crescimento estimado"),
                    card("IMÓVEIS NOSSOS", str(r["n"]), r["tipologias"] or "—")]],
                  colWidths=[doc.width/4]*4)
    cards.setStyle(TableStyle([("BACKGROUND",(0,0),(-1,-1),LIGHT),("BOX",(0,0),(-1,-1),0.5,LINE),
                               ("LINEAFTER",(0,0),(-2,-1),0.5,LINE),("VALIGN",(0,0),(-1,-1),"TOP"),
                               ("TOPPADDING",(0,0),(-1,-1),7),("BOTTOMPADDING",(0,0),(-1,-1),7),
                               ("LEFTPADDING",(0,0),(-1,-1),8)]))
    story.append(cards)
    story.append(Spacer(1, 8))

    # mini-mapa
    zmap = os.path.join(HERE, f"map_{slug(z)}.png")
    if os.path.exists(zmap):
        img = fit_image(zmap, doc.width, 165); img.hAlign = "CENTER"; story.append(img)
        story.append(Spacer(1, 8))

    # tabela imoveis da zona
    story.append(Paragraph("Os nossos imóveis nesta zona", H2))
    th = ["Imóvel", "Tip.", "Área", "Preço pedido", "Valor mercado", "Δ", "Yield"]
    trows = [th]; dcmds = []
    for j, d in enumerate(sorted(r["imoveis"], key=lambda x: x.get("delta_ask_mercado_pct") or 0), start=1):
        dl = d.get("delta_ask_mercado_pct")
        dl_txt = "—" if dl is None else f"{dl:+.0f}%".replace("-", "−")
        trows.append([(d.get("nome") or "—")[:34], d.get("tipologia") or "—", area(d.get("area_m2")),
                      eur(d.get("ask_price")), eur(d.get("valor_mercado")), dl_txt, pct(d.get("yield_media"))])
        if dl is not None:
            dcmds.append(("TEXTCOLOR", (5, j), (5, j), GREEN if dl < 0 else RED))
    it = Table(trows, colWidths=[52*mm, 12*mm, 18*mm, 26*mm, 27*mm, 17*mm, 16*mm], repeatRows=1)
    it.setStyle(TableStyle([
        ("BACKGROUND",(0,0),(-1,0),DARK),("TEXTCOLOR",(0,0),(-1,0),GOLD),
        ("FONTNAME",(0,0),(-1,0),"Helvetica-Bold"),("FONTSIZE",(0,0),(-1,0),7.8),
        ("FONTNAME",(0,1),(-1,-1),"Helvetica"),("FONTSIZE",(0,1),(-1,-1),7.8),
        ("FONTNAME",(4,1),(4,-1),"Helvetica-Bold"),("TEXTCOLOR",(4,1),(4,-1),DARK),
        ("FONTNAME",(5,1),(5,-1),"Helvetica-Bold"),
        ("ROWBACKGROUNDS",(0,1),(-1,-1),[WHITE, LIGHT]),
        ("ALIGN",(1,0),(-1,-1),"CENTER"),("VALIGN",(0,0),(-1,-1),"MIDDLE"),
        ("GRID",(0,0),(-1,-1),0.4,LINE),("LINEBELOW",(0,0),(-1,0),1,GOLD),
        ("TOPPADDING",(0,0),(-1,-1),4),("BOTTOMPADDING",(0,0),(-1,-1),4),("LEFTPADDING",(0,0),(0,-1),6),
    ] + dcmds))
    story.append(it)
    story.append(Spacer(1, 8))

    # POIs + fotos lado a lado
    blocos = []
    if r["pois"]:
        top = r["pois"][:8]
        txt = "<br/>".join(f"• {p['nome']} <font color='#999'>({str(round(p['km'],2)).replace('.', ',')} km)</font>" for p in top)
        blocos.append([Paragraph("Pontos de interesse próximos", H2), Paragraph(txt, POIST)])
    if r["fotos"]:
        thumbs = []
        for fp in r["fotos"][:3]:
            if os.path.exists(fp):
                thumbs.append(fit_image(fp, 52*mm, 36*mm))
        if thumbs:
            ph = Table([thumbs], colWidths=[doc.width/2/max(len(thumbs),1)]*len(thumbs))
            ph.setStyle(TableStyle([("ALIGN",(0,0),(-1,-1),"CENTER"),("LEFTPADDING",(0,0),(-1,-1),2),("RIGHTPADDING",(0,0),(-1,-1),2)]))
            blocos.append([Paragraph("Imóveis na zona", H2), ph])
    if blocos:
        if len(blocos) == 2:
            row = Table([[blocos[0][0], blocos[1][0]], [blocos[0][1], blocos[1][1]]], colWidths=[doc.width/2]*2)
            row.setStyle(TableStyle([("VALIGN",(0,0),(-1,-1),"TOP"),("LEFTPADDING",(0,0),(0,-1),0),("LEFTPADDING",(1,0),(1,-1),8)]))
            story.append(row)
        else:
            for b in blocos[0]:
                story.append(b)

# ---- metodologia ----
story.append(PageBreak())
story.append(Paragraph("Nota metodológica", H2))
sem = data.get("sem_estudo", []); falh = data.get("estudos_falhados", [])
nota = (f"Os valores resultam dos estudos de mercado automáticos (Alfredo AI — Real Estate Analytics) anexados a "
        f"cada imóvel na aba de documentação do CRM. Por imóvel extraiu-se o Valor de Mercado estimado, o preço "
        f"unitário (€/m²), o intervalo mínimo–máximo, a renda/yield, a tendência de preço e os pontos de interesse. "
        f"A agregação por zona usa a freguesia oficial identificada em cada estudo (não a designação livre do CRM). "
        f"O contexto descritivo de cada zona combina dados dos estudos com informação geográfica de referência sobre "
        f"Vila Nova de Gaia. Foram analisados {data['com_estudo']} de {data['total_imoveis']} imóveis da região AMP. "
        f"As fotografias provêm dos anúncios de origem e servem apenas de ilustração.")
if sem: nota += f" Sem estudo de mercado anexado ({len(sem)}): " + "; ".join(sem) + "."
if falh: nota += f" Estudo inacessível no armazenamento ({len(falh)}): " + "; ".join(falh) + "."
story.append(Paragraph(nota, SMALL))

doc.build(story)
print("PDF gerado:", os.path.join(ROOT, "Relatorio_Precos_Mercado_AMP.pdf"))
