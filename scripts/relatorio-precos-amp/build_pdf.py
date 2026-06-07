#!/usr/bin/env python3
"""Gera o PDF 'Estudo de Precos de Mercado por Zona — AMP' com branding Somnium."""
import json, os, statistics as st
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib import colors
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.platypus import (BaseDocTemplate, PageTemplate, Frame, Paragraph, Spacer,
                                Table, TableStyle, Image, PageBreak, KeepTogether, NextPageTemplate)
from reportlab.pdfgen import canvas

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
data = json.load(open(os.path.join(HERE, "amp_dataset.json"), encoding="utf-8"))
ims = data["imoveis"]

GOLD = colors.HexColor("#C9A84C")
DARK = colors.HexColor("#0d0d0d")
GREY = colors.HexColor("#6b6b6b")
LIGHT = colors.HexColor("#f4f1ea")
LINE = colors.HexColor("#e0dccf")
WHITE = colors.white

def eur(v):
    if v is None: return "—"
    return f"{v:,.0f}".replace(",", " ") + " €"
def eurm2(v):
    if v is None: return "—"
    return f"{v:,.0f}".replace(",", " ") + " €/m²"
def pct(v):
    if v is None: return "—"
    return f"{v:.1f}".replace(".", ",") + " %"
def area(v):
    if v is None: return "—"
    return f"{v:,.0f}".replace(",", " ") + " m²"

# ---- agregacao por freguesia ----
zonas = {}
for d in ims:
    z = d.get("freguesia") or "(sem zona)"
    zonas.setdefault(z, []).append(d)

zona_rows = []
for z, arr in zonas.items():
    m2 = [d["valor_mercado_m2"] for d in arr if d.get("valor_mercado_m2")]
    yl = [d["yield_media"] for d in arr if d.get("yield_media")]
    zona_rows.append({
        "zona": z, "n": len(arr),
        "m2_med": st.mean(m2) if m2 else None,
        "m2_min": min(m2) if m2 else None, "m2_max": max(m2) if m2 else None,
        "yield_med": st.mean(yl) if yl else None,
        "tipologias": ", ".join(sorted({d["tipologia"] for d in arr if d.get("tipologia")})),
    })
zona_rows.sort(key=lambda r: (r["m2_med"] or 0), reverse=True)

todos_m2 = [d["valor_mercado_m2"] for d in ims if d.get("valor_mercado_m2")]
todos_yield = [d["yield_media"] for d in ims if d.get("yield_media")]

# ---- comparacao ask price vs valor de mercado ----
comp = [d for d in ims if d.get("ask_price") and d.get("valor_mercado")]
deltas = [d["delta_ask_mercado_pct"] for d in comp]
delta_med = st.mean(deltas) if deltas else None
n_abaixo = len([x for x in deltas if x < 0])
ask_total = sum(d["ask_price"] for d in comp)
merc_total = sum(d["valor_mercado"] for d in comp)

# ---- estilos ----
H1 = ParagraphStyle("H1", fontName="Helvetica-Bold", fontSize=17, textColor=DARK, spaceAfter=3, leading=20)
H2 = ParagraphStyle("H2", fontName="Helvetica-Bold", fontSize=12, textColor=GOLD, spaceBefore=10, spaceAfter=7, leading=15)
BODY = ParagraphStyle("BODY", fontName="Helvetica", fontSize=9.5, textColor=colors.HexColor("#333333"), leading=14)
SMALL = ParagraphStyle("SMALL", fontName="Helvetica", fontSize=7.5, textColor=GREY, leading=10)
KICK = ParagraphStyle("KICK", fontName="Helvetica-Bold", fontSize=9, textColor=GOLD, spaceAfter=2)

# ---- canvas: capa + cabecalho/rodape ----
PW, PH = A4
def cover(c, doc):
    c.setFillColor(DARK); c.rect(0, 0, PW, PH, fill=1, stroke=0)
    c.setFillColor(GOLD); c.rect(0, PH-6*mm, PW, 6*mm, fill=1, stroke=0)
    logo = os.path.join(ROOT, "public", "logo-transparent.png")
    if os.path.exists(logo):
        c.drawImage(logo, (PW-70*mm)/2, PH-70*mm, width=70*mm, height=30*mm,
                    preserveAspectRatio=True, mask="auto")
    c.setFillColor(GOLD); c.setFont("Helvetica-Bold", 11)
    c.drawCentredString(PW/2, PH-92*mm, "ESTUDO DE MERCADO")
    c.setFillColor(WHITE); c.setFont("Helvetica-Bold", 30)
    c.drawCentredString(PW/2, PH-112*mm, "Preços de Mercado")
    c.drawCentredString(PW/2, PH-126*mm, "por Zona")
    c.setStrokeColor(GOLD); c.setLineWidth(1.2)
    c.line(PW/2-30*mm, PH-134*mm, PW/2+30*mm, PH-134*mm)
    c.setFillColor(colors.HexColor("#cfcfcf")); c.setFont("Helvetica", 13)
    c.drawCentredString(PW/2, PH-146*mm, "Região AMP — Porto / Vila Nova de Gaia")
    c.setFillColor(GOLD); c.setFont("Helvetica-Bold", 12)
    c.drawCentredString(PW/2, PH-158*mm, "Junho de 2026")
    c.setFillColor(colors.HexColor("#9a9a9a")); c.setFont("Helvetica", 9)
    c.drawCentredString(PW/2, 30*mm, f"Baseado em {data['com_estudo']} estudos de mercado de imóveis em carteira")
    c.drawCentredString(PW/2, 24*mm, "Somnium Properties · Confidencial")

def later(c, doc):
    c.setFillColor(GOLD); c.rect(0, PH-4*mm, PW, 4*mm, fill=1, stroke=0)
    logo = os.path.join(ROOT, "public", "logo-dark.png")
    if os.path.exists(logo):
        c.drawImage(logo, 18*mm, PH-18*mm, width=33*mm, height=11*mm,
                    preserveAspectRatio=True, mask="auto")
    c.setFillColor(GREY); c.setFont("Helvetica", 7.5)
    c.drawRightString(PW-18*mm, PH-13*mm, "Preços de Mercado por Zona · AMP · Junho 2026")
    c.setStrokeColor(LINE); c.setLineWidth(0.5); c.line(18*mm, 15*mm, PW-18*mm, 15*mm)
    c.setFillColor(GREY); c.setFont("Helvetica", 7.5)
    c.drawString(18*mm, 11*mm, "Somnium Properties · Documento confidencial")
    c.drawRightString(PW-18*mm, 11*mm, f"{doc.page-1}")

# ---- documento ----
doc = BaseDocTemplate(os.path.join(ROOT, "Relatorio_Precos_Mercado_AMP.pdf"),
                      pagesize=A4, leftMargin=18*mm, rightMargin=18*mm,
                      topMargin=22*mm, bottomMargin=18*mm)
frame = Frame(doc.leftMargin, doc.bottomMargin, doc.width, doc.height, id="f")
doc.addPageTemplates([
    PageTemplate(id="cover", frames=[frame], onPage=cover),
    PageTemplate(id="body", frames=[frame], onPage=later),
])

def stat_card(titulo, valor, sub):
    inner = Table([[Paragraph(titulo, KICK)], [Paragraph(valor, ParagraphStyle("v", fontName="Helvetica-Bold", fontSize=17, textColor=DARK))], [Paragraph(sub, SMALL)]],
                  colWidths=[doc.width/4 - 6])
    inner.setStyle(TableStyle([("TOPPADDING",(0,0),(-1,-1),3),("BOTTOMPADDING",(0,0),(-1,-1),2),
                               ("LEFTPADDING",(0,0),(-1,-1),9),("RIGHTPADDING",(0,0),(-1,-1),6)]))
    return inner

story = [NextPageTemplate("body"), PageBreak()]  # capa na pag 1 (canvas); conteudo na pag 2+ (template body)
story.append(Paragraph("Sumário executivo", H1))
story.append(Paragraph(
    f"Este estudo consolida os preços de mercado praticados na região AMP (Porto / Vila Nova de Gaia) "
    f"a partir dos estudos de mercado individuais dos {data['com_estudo']} imóveis da carteira com avaliação automática "
    f"disponível. Os valores referem-se ao <b>Valor de Mercado estimado</b> (preço provável de transacção) e "
    f"respectivo preço unitário (€/m²), agregados por freguesia.", BODY))
story.append(Spacer(1, 8))

cards = Table([[
    stat_card("PREÇO MÉDIO", eurm2(st.mean(todos_m2)), "valor unitário de mercado"),
    stat_card("INTERVALO", f"{min(todos_m2):,.0f}–{max(todos_m2):,.0f}".replace(",", " "), "€/m² (mín. – máx.)"),
    stat_card("ZONAS", str(len(zona_rows)), "freguesias analisadas"),
    stat_card("YIELD MÉDIA", pct(st.mean(todos_yield)), "rendimento bruto estimado"),
]], colWidths=[doc.width/4]*4)
cards.setStyle(TableStyle([("BACKGROUND",(0,0),(-1,-1),LIGHT),("BOX",(0,0),(-1,-1),0.5,LINE),
                           ("LINEAFTER",(0,0),(-2,-1),0.5,LINE),("VALIGN",(0,0),(-1,-1),"TOP"),
                           ("TOPPADDING",(0,0),(-1,-1),8),("BOTTOMPADDING",(0,0),(-1,-1),8)]))
story.append(cards)
story.append(Spacer(1, 8))

# ---- callout: oportunidade ask vs mercado ----
co_style = ParagraphStyle("co", fontName="Helvetica", fontSize=9.5, textColor=DARK, leading=14)
callout = Table([[Paragraph(
    f"<b>Preço pedido vs. valor de mercado.</b> Em média, o preço pedido dos imóveis em carteira está "
    f"<b>{abs(delta_med):.0f}% abaixo</b> do valor de mercado estimado pelos estudos. "
    f"<b>{n_abaixo} de {len(comp)}</b> imóveis estão abaixo do valor de mercado — margem potencial agregada de "
    f"<b>{eur(merc_total - ask_total)}</b> ({eur(ask_total)} pedido vs. {eur(merc_total)} de mercado).", co_style)]],
    colWidths=[doc.width])
callout.setStyle(TableStyle([("BACKGROUND",(0,0),(-1,-1),colors.HexColor("#faf6ea")),
                             ("LINEBEFORE",(0,0),(0,-1),3,GOLD),("BOX",(0,0),(-1,-1),0.5,LINE),
                             ("LEFTPADDING",(0,0),(-1,-1),12),("RIGHTPADDING",(0,0),(-1,-1),12),
                             ("TOPPADDING",(0,0),(-1,-1),9),("BOTTOMPADDING",(0,0),(-1,-1),9)]))
story.append(callout)

# ---- mapa ----
story.append(Paragraph("Mapa de preços por zona", H2))
story.append(Paragraph("Cada marcador representa um imóvel da carteira, posicionado pela localização real do estudo "
                       "e colorido pelo preço de mercado (€/m²): verde = mais baixo, vermelho = mais alto.", BODY))
story.append(Spacer(1, 5))
mp = os.path.join(HERE, "map.png")
if os.path.exists(mp):
    from PIL import Image as PILImage
    iw, ih = PILImage.open(mp).size
    w = doc.width; h = w * ih / iw
    img = Image(mp, width=w, height=h)
    img.hAlign = "CENTER"
    story.append(img)

story.append(PageBreak())

# ---- tabela por zona ----
story.append(Paragraph("Preços de mercado por freguesia", H1))
story.append(Paragraph("Ordenado por preço unitário médio (€/m²), do mais alto para o mais baixo.", BODY))
story.append(Spacer(1, 6))
head = ["Freguesia (zona)", "Imóveis", "Tipologias", "€/m² médio", "€/m² mín.–máx.", "Yield média"]
rows = [head]
for r in zona_rows:
    rng = "—" if r["m2_min"] is None else f"{r['m2_min']:,.0f}–{r['m2_max']:,.0f}".replace(",", " ")
    rows.append([r["zona"], str(r["n"]), r["tipologias"] or "—",
                 eurm2(r["m2_med"]), rng, pct(r["yield_med"])])
t = Table(rows, colWidths=[58*mm, 16*mm, 22*mm, 26*mm, 30*mm, 22*mm], repeatRows=1)
t.setStyle(TableStyle([
    ("BACKGROUND",(0,0),(-1,0),DARK),("TEXTCOLOR",(0,0),(-1,0),GOLD),
    ("FONTNAME",(0,0),(-1,0),"Helvetica-Bold"),("FONTSIZE",(0,0),(-1,0),8.5),
    ("FONTNAME",(0,1),(-1,-1),"Helvetica"),("FONTSIZE",(0,1),(-1,-1),8.5),
    ("TEXTCOLOR",(0,1),(-1,-1),colors.HexColor("#333333")),
    ("FONTNAME",(3,1),(3,-1),"Helvetica-Bold"),("TEXTCOLOR",(3,1),(3,-1),DARK),
    ("ROWBACKGROUNDS",(0,1),(-1,-1),[WHITE, LIGHT]),
    ("ALIGN",(1,0),(-1,-1),"CENTER"),("ALIGN",(0,0),(0,-1),"LEFT"),
    ("VALIGN",(0,0),(-1,-1),"MIDDLE"),("GRID",(0,0),(-1,-1),0.4,LINE),
    ("LINEBELOW",(0,0),(-1,0),1,GOLD),
    ("TOPPADDING",(0,0),(-1,-1),6),("BOTTOMPADDING",(0,0),(-1,-1),6),
    ("LEFTPADDING",(0,0),(0,-1),8),
]))
story.append(t)
story.append(Spacer(1, 14))

# ---- detalhe por imovel: ask price vs valor de mercado ----
story.append(Paragraph("Preço pedido vs. valor de mercado, por imóvel", H1))
story.append(Paragraph("Ordenado pelo maior desconto face ao mercado. Δ negativo (verde) = preço pedido abaixo do "
                       "valor de mercado estimado pelo estudo (margem potencial).", BODY))
story.append(Spacer(1, 6))
head2 = ["Imóvel / Morada", "Freguesia", "Tip.", "Área", "Preço pedido", "Valor mercado", "Δ vs merc.", "Yield"]
rows2 = [head2]
GREEN = colors.HexColor("#2e7d32"); RED = colors.HexColor("#c62828")
delta_cmds = []
det = sorted(comp, key=lambda d: (d.get("delta_ask_mercado_pct") if d.get("delta_ask_mercado_pct") is not None else 0))
cellstyle = ParagraphStyle("c", fontName="Helvetica", fontSize=7.6, leading=9.5, textColor=colors.HexColor("#333"))
for i, d in enumerate(det, start=1):
    nome = d.get("nome") or "—"
    mor = (d.get("morada") or "").split(",")[0]
    label = f"<b>{nome}</b><br/><font size=6.5 color='#888'>{mor}</font>"
    dl = d.get("delta_ask_mercado_pct")
    dl_txt = "—" if dl is None else f"{dl:+.0f}%".replace("+", "+").replace("-", "−")
    rows2.append([Paragraph(label, cellstyle), Paragraph(d.get("freguesia") or "—", cellstyle),
                  d.get("tipologia") or "—", area(d.get("area_m2")),
                  eur(d.get("ask_price")), eur(d.get("valor_mercado")), dl_txt, pct(d.get("yield_media"))])
    if dl is not None:
        delta_cmds.append(("TEXTCOLOR", (6, i), (6, i), GREEN if dl < 0 else RED))
t2 = Table(rows2, colWidths=[43*mm, 31*mm, 10*mm, 15*mm, 23*mm, 24*mm, 16*mm, 12*mm], repeatRows=1)
t2.setStyle(TableStyle([
    ("BACKGROUND",(0,0),(-1,0),DARK),("TEXTCOLOR",(0,0),(-1,0),GOLD),
    ("FONTNAME",(0,0),(-1,0),"Helvetica-Bold"),("FONTSIZE",(0,0),(-1,0),7.6),
    ("FONTNAME",(0,1),(-1,-1),"Helvetica"),("FONTSIZE",(0,1),(-1,-1),7.6),
    ("TEXTCOLOR",(0,1),(-1,-1),colors.HexColor("#333333")),
    ("FONTNAME",(5,1),(5,-1),"Helvetica-Bold"),("TEXTCOLOR",(5,1),(5,-1),DARK),
    ("FONTNAME",(6,1),(6,-1),"Helvetica-Bold"),
    ("ROWBACKGROUNDS",(0,1),(-1,-1),[WHITE, LIGHT]),
    ("ALIGN",(2,0),(-1,-1),"CENTER"),("VALIGN",(0,0),(-1,-1),"MIDDLE"),
    ("GRID",(0,0),(-1,-1),0.4,LINE),("LINEBELOW",(0,0),(-1,0),1,GOLD),
    ("TOPPADDING",(0,0),(-1,-1),4),("BOTTOMPADDING",(0,0),(-1,-1),4),
    ("LEFTPADDING",(0,0),(0,-1),6),
] + delta_cmds))
story.append(t2)
story.append(Spacer(1, 14))

# ---- metodologia ----
story.append(Paragraph("Nota metodológica", H2))
sem = data.get("sem_estudo", [])
falh = data.get("estudos_falhados", [])
nota = (f"Os valores resultam dos estudos de mercado automáticos (ferramenta Alfredo AI — Real Estate Analytics) "
        f"anexados a cada imóvel na aba de documentação do CRM. Para cada imóvel extraiu-se o Valor de Mercado estimado, "
        f"o preço unitário (€/m²), o intervalo mínimo–máximo, a renda e a yield média. A agregação por zona usa a "
        f"freguesia oficial identificada em cada estudo (não a designação livre do CRM). "
        f"Foram analisados {data['com_estudo']} de {data['total_imoveis']} imóveis da região AMP.")
if sem:
    nota += f" Sem estudo de mercado anexado ({len(sem)}): " + ", ".join(sem) + "."
if falh:
    nota += f" Estudo inacessível no armazenamento ({len(falh)}): " + ", ".join(falh) + "."
story.append(Paragraph(nota, SMALL))

doc.build(story)
print("PDF gerado:", os.path.join(ROOT, "Relatorio_Precos_Mercado_AMP.pdf"))
