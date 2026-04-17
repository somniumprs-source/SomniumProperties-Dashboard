#!/usr/bin/env python3
"""
Modifica a Proposta de Investimento (Rua do Clube) para novo destinatario
e prazo de retencao de 12 meses, recalculando todos os valores financeiros.

Abordagem: reportlab overlay + pypdf merge (sem redactions visiveis).
"""
import fitz  # PyMuPDF — para analise de cores e remoção de texto
from pypdf import PdfReader, PdfWriter
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import A4
from io import BytesIO
import os
import math

SOURCE = os.path.expanduser("~/Downloads/Investimento Rua do Clube Coimbra.pdf")
OUTPUT_DIR = os.path.join(os.path.dirname(__file__), "output")
os.makedirs(OUTPUT_DIR, exist_ok=True)

PH = A4[1]  # 841.89

# ── Cores ─────────────────────────────────────────────────────
# Cores de fundo extraidas dos retangulos do PDF original
COVER_BG   = (0.976, 0.976, 0.973)  # #f9f9f8
WHITE_BG   = (1, 1, 1)              # #ffffff
LIGHT_BG   = (0.957, 0.957, 0.949)  # #f4f4f2
GOLD_BG    = (0.957, 0.929, 0.847)  # #f4edd8
CREAM_BG   = (0.992, 0.973, 0.922)  # #fdf8eb
DARK_BG    = (0.227, 0.227, 0.227)  # #3a3a3a

BODY_COLOR = (0.165, 0.165, 0.165)  # #2a2a2a
WHITE_TXT  = (1, 1, 1)
MUTED      = (0.533, 0.533, 0.533)

# ── Dados financeiros ────────────────────────────────────────
TOTAL_AQUISICAO = 191234
OBRA_COM_IVA = 143518
COMISSAO_PERC = 2.5
VVR_BASE = 500000
CPCV_VENDA = 100
MANUT_MENSAL = 190
IRC_RATE = 0.20

def calc(vvr, obra, meses):
    manutencao = MANUT_MENSAL * meses
    comissao = round(vvr * (COMISSAO_PERC / 100) * 1.23)
    custo_total = TOTAL_AQUISICAO + obra + manutencao + comissao + CPCV_VENDA
    capital_proprio = TOTAL_AQUISICAO + obra + manutencao
    lucro_bruto = vvr - custo_total
    irc = round(lucro_bruto * IRC_RATE)
    lucro_liquido = lucro_bruto - irc
    rt = round(lucro_bruto / custo_total * 100, 1) if custo_total > 0 else 0
    coc = round(lucro_bruto / capital_proprio * 100, 1) if capital_proprio > 0 else 0
    ra = round((math.pow(1 + lucro_bruto / custo_total, 12 / meses) - 1) * 100, 1) if custo_total > 0 and meses > 0 else 0
    return dict(manutencao=manutencao, comissao=comissao, custo_total=custo_total,
                capital_proprio=capital_proprio, lucro_bruto=lucro_bruto, irc=irc,
                lucro_liquido=lucro_liquido, rt=rt, coc=coc, ra=ra)

def eur(v):
    if v is None or v == 0: return '—'
    s = f"{abs(v):,.0f}".replace(",", ".")
    return f"{'-' if v < 0 else ''}{s} €"

def pct(v):
    return f"{v}%"


# ── Overlay helper ────────────────────────────────────────────
def ry(y):
    """Converte coordenada Y de PyMuPDF (top-down) para reportlab (bottom-up)."""
    return PH - y

def cover_and_write(c, x, y, w, h, text, bg, fontname="Helvetica", fontsize=10, color=BODY_COLOR, align="left"):
    """Desenha rect de fundo + texto no canvas reportlab."""
    c.saveState()
    c.setFillColorRGB(*bg)
    c.setStrokeColorRGB(*bg)
    c.rect(x, ry(y + h), w, h, fill=1, stroke=1)
    c.setFillColorRGB(*color)
    c.setFont(fontname, fontsize)
    text_y = ry(y) - fontsize * 0.15  # ajuste para alinhar com baseline
    if align == "right":
        c.drawRightString(x + w - 2, text_y, text)
    elif align == "center":
        c.drawCentredString(x + w / 2, text_y, text)
    else:
        c.drawString(x + 1, text_y, text)
    c.restoreState()


def make_overlay(page_edits):
    """Cria um PDF de overlay com as edicoes especificadas."""
    buf = BytesIO()
    c = canvas.Canvas(buf, pagesize=A4)
    for edit in page_edits:
        cover_and_write(c, **edit)
    c.save()
    buf.seek(0)
    return PdfReader(buf).pages[0]


# ══════════════════════════════════════════════════════════════
# GERADOR PRINCIPAL
# ══════════════════════════════════════════════════════════════
def generate(dest_name, meses):
    base = calc(VVR_BASE, OBRA_COM_IVA, meses)
    mod_vvr10 = calc(450000, OBRA_COM_IVA, meses)
    mod_obra10 = calc(VVR_BASE, round(OBRA_COM_IVA * 1.10), meses)
    mod_ret3 = calc(VVR_BASE, OBRA_COM_IVA, meses + 3)
    sev_vvr20 = calc(400000, OBRA_COM_IVA, meses)
    sev_obra20 = calc(VVR_BASE, round(OBRA_COM_IVA * 1.20), meses)
    sev_ret6 = calc(VVR_BASE, OBRA_COM_IVA, meses + 6)
    comb_mod = calc(450000, round(OBRA_COM_IVA * 1.10), meses + 3)
    comb_sev = calc(400000, round(OBRA_COM_IVA * 1.20), meses + 6)

    # Usar fitz para remover texto antigo via redactions
    fitz_doc = fitz.open(SOURCE)
    bg_map = build_bg_map(fitz_doc)

    # ── Remover texto antigo de TODAS as paginas ──
    nome_antigo = "Luís Gouveia"
    footer_antigo = "Somnium Properties  \u00b7  Proposta de Investimento  \u00b7  Rua do Clube, Coimbra  \u00b7  Abril 2026  \u00b7  Lu\u00eds Gouveia"
    for pn in range(len(fitz_doc)):
        page = fitz_doc[pn]
        # 1. Remover footer INTEIRO
        footer_areas = page.search_for(footer_antigo)
        for area in footer_areas:
            bg = get_bg_at(bg_map, pn, area.y0 + 5)
            page.add_redact_annot(area, text="", fill=bg)
        # 2. Remover TODAS as ocorrencias restantes do nome (Preparado para, capa, etc.)
        name_areas = page.search_for(nome_antigo)
        for area in name_areas:
            bg = get_bg_at(bg_map, pn, area.y0 + 5)
            page.add_redact_annot(area, text="", fill=bg)
        page.apply_redactions()

    # ── Pagina 1: remover "Preparado para" + nome (ja removido acima, mas tb o label) ──
    p = fitz_doc[0]
    for old_text in ["Preparado para"]:
        areas = p.search_for(old_text)
        for a in areas:
            p.add_redact_annot(a, text="", fill=COVER_BG)
    p.apply_redactions()

    # ── Pagina 2: remover valores antigos ──
    p = fitz_doc[1]
    removals_p2 = [
        ("Preparado para:", WHITE_BG),  # o main loop ja removeu o nome, limpar o label restante
        ("42.1%", COVER_BG), ("59.7%", COVER_BG), ("base 9 meses", COVER_BG),
        ("148.063 \u20ac", COVER_BG), ("118.451 \u20ac", COVER_BG), ("351.937 \u20ac", COVER_BG),
        ("9 meses", COVER_BG),  # Prazo de Retencao
    ]
    for text, bg in removals_p2:
        areas = p.search_for(text)
        for a in areas:
            p.add_redact_annot(a, text="", fill=bg)
    p.apply_redactions()

    # ── Pagina 9: remover valores antigos ──
    p = fitz_doc[8]
    removals_p9 = [
        # Coluna esquerda
        ("Manutenção (9 meses)", LIGHT_BG),
        ("1.710 €", LIGHT_BG),
        # Coluna direita — retornos (posicoes especificas)
        ("148.063 €", LIGHT_BG),  # Lucro Bruto (fundo #f4f4f2)
        ("29.613 €", WHITE_BG),   # IRC
        ("118.451 €", LIGHT_BG),  # Lucro Liquido
        # "Prazo: 9 meses" removido via redaccao integral das linhas de pressupostos
    ]
    for text, bg in removals_p9:
        areas = p.search_for(text)
        for a in areas:
            p.add_redact_annot(a, text="", fill=bg)
    # Retornos no lado direito (valores bold)
    for text in ["42.1%", "44.0%", "59.7%"]:
        areas = p.search_for(text)
        for a in areas:
            if a.x0 > 400:  # so os da coluna direita
                p.add_redact_annot(a, text="", fill=get_bg_at(bg_map, 8, a.y0 + 5))
    # Total investido (coluna esquerda, bold row)
    areas = p.search_for("351.937 €")
    for a in areas:
        if a.x0 < 300:
            p.add_redact_annot(a, text="", fill=GOLD_BG)
    # Pressupostos: redactar linhas 2 e 3 inteiras (evitar sobreposicao)
    p.add_redact_annot(fitz.Rect(55, 436, 540, 460), text="", fill=WHITE_BG)
    p.apply_redactions()

    # ── Pagina 10: remover valores stress tests ──
    p = fitz_doc[9]
    # Box resumo topo
    for text in ["9 meses", "42.1%", "59.7%", "118.451 €"]:
        areas = p.search_for(text)
        for a in areas:
            if a.y0 < 240:  # so o box do topo
                p.add_redact_annot(a, text="", fill=GOLD_BG)

    # Tabelas: limpar todas as celulas de dados (meses, LB, LL, RT, CoC, RA, variacoes)
    # Moderado Base: y=324-360, fundo=#f4edd8
    # VVR-10%: y=362-398, fundo=#ffffff
    # Obra+10%: y=400-436, fundo=#f4f4f2
    # Ret+3: y=438-488, fundo=#ffffff
    table_rows_mod = [
        (323, 361, GOLD_BG),   # Base
        (361, 399, WHITE_BG),  # VVR-10%
        (399, 437, LIGHT_BG),  # Obra+10%
        (437, 489, WHITE_BG),  # Ret+3
    ]
    table_rows_sev = [
        (570, 608, GOLD_BG),   # Base
        (608, 646, WHITE_BG),  # VVR-20%
        (646, 684, LIGHT_BG),  # Obra+20%
        (684, 736, WHITE_BG),  # Ret+6
    ]
    for rows in [table_rows_mod, table_rows_sev]:
        for y_top, y_bot, bg in rows:
            # Limpar celulas de dados (colunas meses ate variacoes: x=219 a x=540)
            p.add_redact_annot(fitz.Rect(219, y_top, 542, y_bot), text="", fill=bg)

    # Limpar descricoes de retencao
    p.add_redact_annot(fitz.Rect(56, 438, 132, 489), text="", fill=WHITE_BG)
    p.add_redact_annot(fitz.Rect(56, 684, 132, 736), text="", fill=WHITE_BG)

    # Nota no fundo
    p.add_redact_annot(fitz.Rect(55, 742, 540, 772), text="", fill=WHITE_BG)

    p.apply_redactions()

    # ── Pagina 11: remover valores combinado moderado ──
    p = fitz_doc[10]
    # Box resumo
    for text in ["9 meses", "42.1%", "59.7%", "118.451 €"]:
        areas = p.search_for(text)
        for a in areas:
            if a.y0 < 244:
                p.add_redact_annot(a, text="", fill=GOLD_BG)
    # Descricao
    areas = p.search_for("meses (9 \u2192 12 meses)")
    for a in areas:
        p.add_redact_annot(a, text="", fill=CREAM_BG)
    # Boxes descricao
    areas = p.search_for("12 meses")
    for a in areas:
        if 340 < a.y0 < 380:
            p.add_redact_annot(a, text="", fill=CREAM_BG)
    areas = p.search_for("67.743 €")
    for a in areas:
        if 340 < a.y0 < 380:
            p.add_redact_annot(a, text="", fill=CREAM_BG)
    # Tabela (colunas de dados: x=208 a 520)
    table_rows_p11 = [
        (414, 438, WHITE_BG), (438, 462, LIGHT_BG), (462, 486, WHITE_BG),
        (486, 510, LIGHT_BG), (510, 534, WHITE_BG), (534, 558, LIGHT_BG),
    ]
    for y_top, y_bot, bg in table_rows_p11:
        p.add_redact_annot(fitz.Rect(208, y_top, 530, y_bot), text="", fill=bg)
    p.apply_redactions()

    # ── Pagina 12: remover valores combinado severo + conclusao ──
    p = fitz_doc[11]
    # Descricao
    areas = p.search_for("meses (9 \u2192 15 meses)")
    for a in areas:
        p.add_redact_annot(a, text="", fill=CREAM_BG)
    # Boxes
    areas = p.search_for("15 meses")
    for a in areas:
        if 130 < a.y0 < 170:
            p.add_redact_annot(a, text="", fill=get_bg_at(bg_map, 11, a.y0 + 3))
    areas = p.search_for("17.036 €")
    for a in areas:
        if 130 < a.y0 < 170:
            p.add_redact_annot(a, text="", fill=get_bg_at(bg_map, 11, a.y0 + 3))
    # Tabela
    table_rows_p12 = [
        (204, 228, WHITE_BG), (228, 252, LIGHT_BG), (252, 276, WHITE_BG),
        (276, 300, LIGHT_BG), (300, 324, WHITE_BG), (324, 348, LIGHT_BG),
    ]
    for y_top, y_bot, bg in table_rows_p12:
        p.add_redact_annot(fitz.Rect(208, y_top, 530, y_bot), text="", fill=bg)
    # Conclusao
    p.add_redact_annot(fitz.Rect(55, 381, 540, 485), text="", fill=WHITE_BG)
    p.apply_redactions()

    # ── Guardar PDF limpo (sem texto antigo) como temp ──
    temp_buf = BytesIO()
    fitz_doc.save(temp_buf, deflate=True, garbage=4)
    fitz_doc.close()
    temp_buf.seek(0)

    # ═══════════════════════════════════════════════════════════
    # FASE 2: Criar overlays com reportlab e fundir com pypdf
    # ═══════════════════════════════════════════════════════════
    reader = PdfReader(temp_buf)
    writer = PdfWriter()

    for pn in range(len(reader.pages)):
        page = reader.pages[pn]

        if pn == 0:
            overlay = make_page0_overlay(dest_name)
            page.merge_page(overlay)
        elif pn == 1:
            overlay = make_page2_overlay(dest_name, base, meses)
            page.merge_page(overlay)
        elif pn == 8:
            overlay = make_page9_overlay(base, meses)
            page.merge_page(overlay)
        elif pn == 9:
            overlay = make_page10_overlay(base, meses, mod_vvr10, mod_obra10, mod_ret3,
                                          sev_vvr20, sev_obra20, sev_ret6)
            page.merge_page(overlay)
        elif pn == 10:
            overlay = make_page11_overlay(base, meses, comb_mod)
            page.merge_page(overlay)
        elif pn == 11:
            overlay = make_page12_overlay(base, meses, comb_mod, comb_sev)
            page.merge_page(overlay)
        else:
            # Paginas sem alteracoes de dados, so nome no header
            pass

        # Adicionar nome no header de todas as paginas (excepto capa)
        if pn > 0:
            overlay = make_name_header_overlay(dest_name, pn)
            if overlay:
                page.merge_page(overlay)

        writer.add_page(page)

    nome_ficheiro = dest_name.replace(" ", "_")
    output_path = os.path.join(OUTPUT_DIR, f"Investimento_Rua_do_Clube_{nome_ficheiro}.pdf")
    with open(output_path, "wb") as f:
        writer.write(f)
    print(f"  Gerado: {output_path}")
    return output_path


# ══════════════════════════════════════════════════════════════
# MAPA DE CORES DE FUNDO
# ══════════════════════════════════════════════════════════════
def build_bg_map(doc):
    """Constroi um mapa de cores de fundo por pagina e posicao Y."""
    bg_map = {}
    for pn in range(len(doc)):
        page = doc[pn]
        drawings = page.get_drawings()
        rects = []
        for d in drawings:
            fill = d.get("fill")
            if fill and d["items"] and d["items"][0][0] == "re":
                r = d["rect"]
                if r.height > 5 and r.width > 50:
                    rects.append((r, fill))
        bg_map[pn] = rects
    return bg_map


def get_bg_at(bg_map, pn, y):
    """Retorna a cor de fundo mais especifica na posicao Y da pagina."""
    rects = bg_map.get(pn, [])
    best = WHITE_BG
    best_area = float('inf')
    for r, fill in rects:
        if r.y0 <= y <= r.y1:
            area = r.width * r.height
            if area < best_area:
                best_area = area
                best = fill
    return best


# ══════════════════════════════════════════════════════════════
# OVERLAYS POR PAGINA (reportlab)
# ══════════════════════════════════════════════════════════════

def make_name_header_overlay(name, pn):
    """Overlay para o nome no footer de cada pagina."""
    buf = BytesIO()
    c = canvas.Canvas(buf, pagesize=A4)
    # Footer: "Somnium Properties · Proposta de Investimento · Rua do Clube, Coimbra · Abril 2026 · <NOME>"
    footer_text = f"Somnium Properties  ·  Proposta de Investimento  ·  Rua do Clube, Coimbra  ·  Abril 2026  ·  {name}"
    c.setFont("Helvetica", 8)
    c.setFillColorRGB(*MUTED)
    # Footer fica em y≈820 (PyMuPDF) → ry(820) em reportlab
    c.drawCentredString(A4[0] / 2, ry(820), footer_text)
    c.save()
    buf.seek(0)
    return PdfReader(buf).pages[0]


def make_page0_overlay(name):
    """Overlay para a capa."""
    buf = BytesIO()
    c = canvas.Canvas(buf, pagesize=A4)
    # "Preparado para" + nome
    c.setFont("Helvetica", 7.5)
    c.setFillColorRGB(*MUTED)
    c.drawCentredString(A4[0] / 2, ry(486), "Preparado para")
    c.setFont("Helvetica-Bold", 14)
    c.setFillColorRGB(*BODY_COLOR)
    c.drawCentredString(A4[0] / 2, ry(502), name)
    c.save()
    buf.seek(0)
    return PdfReader(buf).pages[0]


def make_page2_overlay(name, base, meses):
    """Overlay para a pagina 2 — Sumario Executivo."""
    buf = BytesIO()
    c = canvas.Canvas(buf, pagesize=A4)

    # "Preparado para: <nome>"
    c.setFont("Helvetica", 11)
    c.setFillColorRGB(*BODY_COLOR)
    c.drawString(57, ry(203), f"Preparado para: {name}")

    # BigNumbers row 1: Retorno Total + Ret Anualizado
    # Retorno Total: x=310, y≈465
    c.setFont("Helvetica-Bold", 16)
    c.setFillColorRGB(*BODY_COLOR)
    c.drawString(310, ry(475), pct(base['rt']))
    # Ret Anualizado: x=433
    c.drawString(433, ry(475), pct(base['ra']))

    # "base X meses"
    c.setFont("Helvetica", 8.5)
    c.setFillColorRGB(*MUTED)
    c.drawString(433, ry(488), f"base {meses} meses")

    # BigNumbers row 2
    c.setFont("Helvetica-Bold", 16)
    c.setFillColorRGB(*BODY_COLOR)
    # Lucro Bruto
    c.drawString(63, ry(559), eur(base['lucro_bruto']))
    # Lucro Liquido
    c.drawString(186, ry(559), eur(base['lucro_liquido']))
    # Total Investido
    c.drawString(310, ry(559), eur(base['custo_total']))
    # Prazo
    c.drawString(433, ry(559), f"{meses} meses")

    c.save()
    buf.seek(0)
    return PdfReader(buf).pages[0]


def make_page9_overlay(base, meses):
    """Overlay para a pagina 9 — Analise Financeira."""
    buf = BytesIO()
    c = canvas.Canvas(buf, pagesize=A4)

    # Manutencao label + valor
    c.setFont("Helvetica", 10)
    c.setFillColorRGB(*BODY_COLOR)
    c.drawString(69, ry(333), f"Manutenção ({meses} meses)")
    c.drawString(217, ry(333), eur(base['manutencao']))

    # Total Investido (coluna esquerda, bold, y=400)
    c.setFont("Helvetica-Bold", 10)
    c.drawString(217, ry(405), eur(base['custo_total']))

    # Coluna direita — Retornos
    c.setFont("Helvetica-Bold", 10)
    c.drawString(454, ry(271), eur(base['lucro_bruto']))  # Lucro Bruto
    c.setFont("Helvetica", 10)
    c.drawString(454, ry(309), eur(base['irc']))  # IRC
    c.setFont("Helvetica-Bold", 11)
    c.drawString(454, ry(334), eur(base['lucro_liquido']))  # Lucro Liquido
    c.drawString(454, ry(358), pct(base['rt']))  # Retorno Total
    c.drawString(454, ry(382), pct(base['coc']))  # Cash-on-Cash
    c.drawString(454, ry(406), pct(base['ra']))  # Ret Anualizado

    # Pressupostos (linhas 2+3 redactadas inteiras, reescrever)
    c.setFont("Helvetica-Oblique", 9)
    c.setFillColorRGB(*BODY_COLOR)
    c.drawString(57, ry(443), f"electricidade 50 \u20ac + \u00e1gua 50 \u20ac) \u00b7 Regime fiscal: Empresa \u00b7 IRC 20% \u00b7 Prazo: {meses} meses desde a aquisi\u00e7\u00e3o at\u00e9 \u00e0 escritura")
    c.drawString(57, ry(455), "de venda")

    c.save()
    buf.seek(0)
    return PdfReader(buf).pages[0]


def make_page10_overlay(base, meses, mod_vvr10, mod_obra10, mod_ret3,
                         sev_vvr20, sev_obra20, sev_ret6):
    """Overlay para a pagina 10 — Stress Tests Individuais."""
    buf = BytesIO()
    c = canvas.Canvas(buf, pagesize=A4)

    # Box resumo topo
    c.setFont("Helvetica-Bold", 10)
    c.setFillColorRGB(*BODY_COLOR)
    c.drawString(223, ry(219), f"{meses} meses")
    c.setFont("Helvetica-Bold", 11)
    c.drawString(306, ry(220), pct(base['rt']))
    c.drawString(388, ry(220), pct(base['ra']))
    c.drawString(470, ry(220), eur(base['lucro_liquido']))

    # Tabela MODERADO
    scenarios_mod = [
        (338, base, meses, None),           # Base
        (376, mod_vvr10, meses, base),      # VVR-10%
        (414, mod_obra10, meses, base),     # Obra+10%
        (462, mod_ret3, meses + 3, base),   # Ret+3
    ]
    for y, sc, m, base_ref in scenarios_mod:
        write_stress_row(c, y, sc, m, base_ref)

    # Descricao retencao +3m
    c.setFont("Helvetica", 10)
    c.setFillColorRGB(*BODY_COLOR)
    c.drawString(58, ry(453), "Retenção +3")
    c.drawString(58, ry(467), f"meses ({meses+3}")
    c.drawString(58, ry(481), "meses)")

    # Tabela SEVERO
    scenarios_sev = [
        (585, base, meses, None),           # Base
        (623, sev_vvr20, meses, base),      # VVR-20%
        (661, sev_obra20, meses, base),     # Obra+20%
        (709, sev_ret6, meses + 6, base),   # Ret+6
    ]
    for y, sc, m, base_ref in scenarios_sev:
        write_stress_row(c, y, sc, m, base_ref)

    # Descricao retencao +6m
    c.setFont("Helvetica", 10)
    c.setFillColorRGB(*BODY_COLOR)
    c.drawString(58, ry(700), "Retenção +6")
    c.drawString(58, ry(714), f"meses ({meses+6}")
    c.drawString(58, ry(728), "meses)")

    # Nota
    c.setFont("Helvetica-BoldOblique", 9)
    c.setFillColorRGB(*BODY_COLOR)
    c.drawString(57, ry(755),
        f"Nota: O impacto individual mais crítico é a queda do VVR em −20%, que reduz o lucro líquido para {eur(sev_vvr20['lucro_liquido'])} e o retorno")
    c.setFont("Helvetica-Oblique", 9)
    c.drawString(57, ry(767),
        f"total para {pct(sev_vvr20['rt'])}. O aumento de 20% no custo de obra e o prolongamento da retenção têm um impacto mais moderado.")

    c.save()
    buf.seek(0)
    return PdfReader(buf).pages[0]


def write_stress_row(c, y, sc, meses, base_ref):
    """Escreve uma linha de dados na tabela de stress tests."""
    # Meses
    c.setFont("Helvetica", 10)
    c.setFillColorRGB(*BODY_COLOR)
    c.drawString(221, ry(y), str(meses))
    c.drawString(221, ry(y + 14), "m")
    # Lucro Bruto
    lb_parts = eur(sc['lucro_bruto']).replace(' €', '').strip()
    c.setFont("Helvetica-Bold", 11)
    c.drawString(245, ry(y), lb_parts)
    c.drawString(245, ry(y + 14), "€")
    # Lucro Liq
    ll_parts = eur(sc['lucro_liquido']).replace(' €', '').strip()
    c.setFont("Helvetica", 10)
    c.drawString(296, ry(y + 6), f"{ll_parts} €")
    # RT
    c.setFont("Helvetica-Bold", 11)
    c.drawString(348, ry(y), str(sc['rt']))
    c.drawString(348, ry(y + 14), "%")
    # CoC
    c.setFont("Helvetica", 10)
    c.drawString(384, ry(y), str(sc['coc']))
    c.drawString(384, ry(y + 14), "%")
    # RA
    c.setFont("Helvetica-Bold", 11)
    c.drawString(419, ry(y), str(sc['ra']))
    c.drawString(419, ry(y + 14), "%")
    # Variacoes
    if base_ref:
        var_rt = round(sc['rt'] - base_ref['rt'], 1)
        var_ra = round(sc['ra'] - base_ref['ra'], 1)
        c.setFont("Helvetica-Bold", 9.5)
        c.drawString(459, ry(y + 2), "↓")
        c.drawString(459, ry(y + 14), f"{var_rt}%")
        c.drawString(502, ry(y + 2), "↓")
        c.drawString(502, ry(y + 14), f"{var_ra}%")
    else:
        c.setFont("Helvetica", 9)
        c.drawString(459, ry(y + 7), "—")
        c.drawString(502, ry(y + 7), "—")


def make_page11_overlay(base, meses, comb_mod):
    """Overlay para a pagina 11 — Stress Test Combinado Moderado."""
    buf = BytesIO()
    c = canvas.Canvas(buf, pagesize=A4)

    # Box resumo
    c.setFont("Helvetica-Bold", 10)
    c.setFillColorRGB(*BODY_COLOR)
    c.drawString(223, ry(233), f"{meses} meses")
    c.setFont("Helvetica-Bold", 11)
    c.drawString(306, ry(234), pct(base['rt']))
    c.drawString(388, ry(234), pct(base['ra']))
    c.drawString(470, ry(234), eur(base['lucro_liquido']))

    # Descricao: "(12 → 15 meses)"
    c.setFont("Helvetica-Oblique", 9)
    c.drawString(59, ry(333), f"meses ({meses} \u2192 {meses+3} meses)")

    # Boxes descricao
    c.setFont("Helvetica-Bold", 10)
    c.drawString(308, ry(371), f"{meses+3} meses")
    c.drawString(431, ry(371), eur(comb_mod['lucro_liquido']))

    # Tabela
    write_combined_table(c, base, comb_mod, start_y=426)

    c.save()
    buf.seek(0)
    return PdfReader(buf).pages[0]


def make_page12_overlay(base, meses, comb_mod, comb_sev):
    """Overlay para a pagina 12 — Stress Test Combinado Severo + Conclusao."""
    buf = BytesIO()
    c = canvas.Canvas(buf, pagesize=A4)

    # Descricao
    c.setFont("Helvetica-Oblique", 9)
    c.setFillColorRGB(*BODY_COLOR)
    c.drawString(59, ry(122), f"meses ({meses} \u2192 {meses+6} meses)")

    # Boxes
    c.setFont("Helvetica-Bold", 10)
    c.drawString(308, ry(160), f"{meses+6} meses")
    c.drawString(431, ry(160), eur(comb_sev['lucro_liquido']))

    # Tabela
    write_combined_table(c, base, comb_sev, start_y=215)

    # Conclusao
    c.setFont("Helvetica", 10)
    c.setFillColorRGB(*BODY_COLOR)
    lines = [
        f"O projecto apresenta um perfil de risco-retorno atractivo: no cenário base conservador, o investimento gera",
        f"um retorno total de {pct(base['rt'])} e anualizado de {pct(base['ra'])} num prazo de {meses} meses. No cenário moderado combinado,",
        f"o lucro líquido é de {eur(comb_mod['lucro_liquido'])} com retorno de {pct(comb_mod['rt'])}. No cenário severo combinado — o pior caso possível",
        f"com todas as adversidades em simultâneo — o lucro líquido cai para {eur(comb_sev['lucro_liquido'])} e o retorno para apenas",
    ]
    y = 395
    for line in lines:
        c.setFont("Helvetica", 10)
        c.drawString(57, ry(y), line)
        y += 14

    # Linha bold
    c.setFont("Helvetica-Bold", 10)
    c.drawString(57, ry(y), f"{pct(comb_sev['rt'])}. O investimento mantém lucro positivo mesmo no pior cenário, o que valida a solidez estrutural do")
    y += 14

    c.setFont("Helvetica", 10)
    c.drawString(57, ry(y), "projecto. A localização em Santa Clara, Coimbra, com forte procura de arrendamento universitário e")
    y += 14
    c.drawString(57, ry(y), "crescente interesse de compra, sustenta os valores de venda projectados.")

    c.save()
    buf.seek(0)
    return PdfReader(buf).pages[0]


def write_combined_table(c, base, combined, start_y):
    """Escreve dados da tabela de stress tests combinados."""
    rows = [
        ("Cap. Próprios", combined['capital_proprio'], base['capital_proprio'], True),
        ("Lucro Bruto", combined['lucro_bruto'], base['lucro_bruto'], False),
        ("Lucro Líquido", combined['lucro_liquido'], base['lucro_liquido'], False),
        ("Retorno Total", combined['rt'], base['rt'], False),
        ("Cash-on-Cash", combined['coc'], base['coc'], False),
        ("Ret. Anualizado", combined['ra'], base['ra'], False),
    ]

    y = start_y
    for label_unused, comb_val, base_val, is_up in rows:
        c.setFillColorRGB(*BODY_COLOR)

        # Cenario combinado
        c.setFont("Helvetica-Bold", 11)
        if isinstance(comb_val, float):
            c.drawString(210, ry(y), pct(comb_val))
        else:
            c.drawString(210, ry(y), eur(comb_val))

        # Base
        c.setFont("Helvetica", 10)
        if isinstance(base_val, float):
            c.drawString(286, ry(y), pct(base_val))
        else:
            c.drawString(286, ry(y), eur(base_val))

        # Variacoes
        if isinstance(comb_val, float):
            diff = round(comb_val - base_val, 1)
            arrow = "↓" if diff < 0 else "↑"
            # So mostrar variacao % para retornos
            c.setFont("Helvetica", 9)
            c.drawString(363, ry(y), "—")
            c.drawString(457, ry(y), f"{arrow} {diff}%")
        else:
            diff = comb_val - base_val
            arrow = "↑" if diff > 0 else "↓"
            c.setFont("Helvetica", 9.5)
            c.drawString(363, ry(y), f"{arrow} {'+' if diff > 0 else ''}{eur(diff)}")
            c.drawString(457, ry(y), f"{arrow} {'+' if diff > 0 else ''}{eur(diff)}")

        y += 24


# ══════════════════════════════════════════════════════════════
# MAIN
# ══════════════════════════════════════════════════════════════
if __name__ == "__main__":
    print("Proposta de Investimento — Rua do Clube, Coimbra")
    print(f"Fonte: {SOURCE}\nRetencao: 12 meses\n")

    base = calc(VVR_BASE, OBRA_COM_IVA, 12)
    print(f"  Total Investido: {eur(base['custo_total'])}")
    print(f"  Lucro Bruto:     {eur(base['lucro_bruto'])}")
    print(f"  Lucro Liquido:   {eur(base['lucro_liquido'])}")
    print(f"  Retorno Total:   {pct(base['rt'])}")
    print(f"  Cash-on-Cash:    {pct(base['coc'])}")
    print(f"  Ret. Anualizado: {pct(base['ra'])}\n")

    generate("Miguel Rodrigues", 12)
    generate("Pedro Sousa", 12)
    print("\nConcluido.")
