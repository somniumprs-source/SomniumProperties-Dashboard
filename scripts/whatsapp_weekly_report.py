#!/usr/bin/env python3
"""
Relatorio Semanal de Comunicacoes WhatsApp — Somnium Properties.

Le um ficheiro JSON estruturado (gerado pelo Claude apos sintese dos exports .txt)
e renderiza um PDF empresarial com layout identico ao dos restantes relatorios
do dashboard (pdfMeetingReport.js, pdfImovelDocs.js).

Uso:
    python scripts/whatsapp_weekly_report.py inputs/whatsapp/2026-05-03/

Espera encontrar `.summary.json` na pasta indicada.
Output: scripts/output/relatorio-whatsapp-semanal-YYYY-MM-DD.pdf
"""

from __future__ import annotations

import json
import os
import sys
from datetime import datetime
from pathlib import Path

from reportlab.lib.colors import HexColor, white
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas

# Paleta Somnium (clone de src/db/pdfMeetingReport.js:13-20)
GOLD = HexColor("#C9A84C")
BLACK = HexColor("#0d0d0d")
DARK = HexColor("#1a1a1a")
WHITE = white
LIGHT = HexColor("#f7f6f2")
LIGHT_GRAY = HexColor("#f0efe9")
BODY = HexColor("#333333")
MUTED = HexColor("#888888")
BORDER = HexColor("#e0ddd5")
GREEN = HexColor("#22c55e")
RED = HexColor("#ef4444")

# Pagina
PW, PH = A4  # 595.28 x 841.89
ML = 55      # left/right margin
PT = 50      # top margin
PB = 60      # bottom margin
CW = PW - 2 * ML

LOGO_PATH = Path(__file__).resolve().parent.parent / "public" / "logo-transparent.png"

CONVERSA_LABELS = {
    "ceo": "CEO",
    "claude-code": "IMPLEMENTACAO CLAUDE CODE",
    "financeiro": "DEPARTAMENTO FINANCEIRO",
    "t2-condeixa": "T2 CONDEIXA",
    "predio-lajes": "PREDIO LAJES",
    "comercial-investidores": "COMERCIAL — INVESTIDORES",
    "comercial-imoveis": "COMERCIAL — IMOVEIS",
    "caep": "CAEP",
}
CONVERSA_ORDER = list(CONVERSA_LABELS.keys())


# ── Helpers de baixo nivel ────────────────────────────────────────────────


def page_break(c: canvas.Canvas, y: float, needed: float) -> float:
    """Se nao ha espaco suficiente, fecha pagina e abre nova. Devolve novo y."""
    if y - needed < PB:
        render_footer(c)
        c.showPage()
        return PH - PT
    return y


def render_footer(c: canvas.Canvas) -> None:
    """Footer escuro com confidencial + data, igual em todas as paginas internas."""
    c.setFillColor(DARK)
    c.rect(0, 0, PW, 60, stroke=0, fill=1)
    c.setFillColor(GOLD)
    c.rect(0, 60, PW, 0.5, stroke=0, fill=1)
    c.setFillColor(GOLD)
    c.setFont("Helvetica-Bold", 7)
    c.drawCentredString(PW / 2, 35, "SOMNIUM PROPERTIES · CONFIDENCIAL")
    c.setFillColor(HexColor("#666666"))
    c.setFont("Helvetica", 7)
    c.drawCentredString(
        PW / 2,
        20,
        f"Pagina {c.getPageNumber()} · Gerado em {datetime.now().strftime('%d/%m/%Y %H:%M')}",
    )


def hdr(c: canvas.Canvas, title: str, y: float) -> float:
    """Header de seccao gold/preto (replica de hdr() em pdfMeetingReport.js:239-244)."""
    c.setFillColor(BLACK)
    c.rect(ML, y - 28, CW, 28, stroke=0, fill=1)
    c.setFillColor(GOLD)
    c.rect(ML, y - 28, 4, 28, stroke=0, fill=1)
    c.setFillColor(GOLD)
    c.setFont("Helvetica-Bold", 9)
    # Letter-spacing manual
    spaced = " ".join(list(title))
    c.drawString(ML + 12, y - 18, spaced[:80])
    return y - 34


def sec(c: canvas.Canvas, title: str, y: float) -> float:
    """Seccao secundaria com underline gold (replica de sec() em pdfMeetingReport.js:246-252)."""
    c.setFillColor(BLACK)
    c.setFont("Helvetica-Bold", 11)
    c.drawString(ML, y - 11, title)
    y -= 14
    c.setFillColor(GOLD)
    c.rect(ML, y - 2, 40, 2, stroke=0, fill=1)
    c.setFillColor(BORDER)
    c.rect(ML + 42, y - 1.5, CW - 42, 0.5, stroke=0, fill=1)
    return y - 12


def two_col_field(c: canvas.Canvas, y: float, label: str, value: str, idx: int) -> float:
    """Linha 2 col (label muted maiusculo / valor escuro) com bg alternado."""
    h = 26
    if idx % 2 == 0:
        c.setFillColor(LIGHT)
        c.rect(ML, y - h, CW, h, stroke=0, fill=1)
    c.setFillColor(MUTED)
    c.setFont("Helvetica-Bold", 7)
    c.drawString(ML + 10, y - 11, label.upper()[:30])
    c.setFillColor(BODY)
    c.setFont("Helvetica", 9)
    c.drawString(ML + 160, y - 11, str(value)[:90])
    return y - h


def bullet(c: canvas.Canvas, y: float, text: str, marker: str = "tri") -> float:
    """Bullet com marcador gold vetorial (replica de pontos_chave em pdfMeetingReport.js:155-159).

    marker: "tri" para triangulo cheio gold (topicos), "check" para checkmark (decisoes).
    """
    if marker == "check":
        # Checkmark vetorial gold (2 linhas)
        c.saveState()
        c.setStrokeColor(GOLD)
        c.setLineWidth(1.5)
        c.setLineCap(1)
        p = c.beginPath()
        p.moveTo(ML, y - 8)
        p.lineTo(ML + 3, y - 11)
        p.lineTo(ML + 8, y - 5)
        c.drawPath(p, stroke=1, fill=0)
        c.restoreState()
    else:
        # Triangulo cheio gold apontado para a direita
        c.setFillColor(GOLD)
        p = c.beginPath()
        p.moveTo(ML, y - 4)
        p.lineTo(ML, y - 12)
        p.lineTo(ML + 6, y - 8)
        p.close()
        c.drawPath(p, stroke=0, fill=1)
    return wrap_text(c, ML + 14, y, CW - 18, text, 9, leading=12)


def wrap_text(
    c: canvas.Canvas,
    x: float,
    y: float,
    width: float,
    text: str,
    size: int,
    leading: float = 12,
    color: HexColor = BODY,
) -> float:
    """Word wrap manual. Devolve y final apos render."""
    c.setFillColor(color)
    c.setFont("Helvetica", size)
    words = (text or "").split()
    line: list[str] = []
    cy = y - size + 1
    for w in words:
        test = " ".join(line + [w])
        if c.stringWidth(test, "Helvetica", size) <= width:
            line.append(w)
        else:
            if line:
                c.drawString(x, cy, " ".join(line))
                cy -= leading
            line = [w]
    if line:
        c.drawString(x, cy, " ".join(line))
        cy -= leading
    return cy + (leading - size) - 2


def kpi_card(c: canvas.Canvas, x: float, y: float, w: float, h: float, label: str, value: str) -> None:
    """Card KPI: bg LIGHT, label muted, valor grande gold."""
    c.setFillColor(LIGHT)
    c.rect(x, y - h, w, h, stroke=0, fill=1)
    c.setFillColor(GOLD)
    c.rect(x, y - h, 3, h, stroke=0, fill=1)
    c.setFillColor(MUTED)
    c.setFont("Helvetica-Bold", 7)
    c.drawString(x + 12, y - 14, label.upper()[:36])
    c.setFillColor(BLACK)
    c.setFont("Helvetica-Bold", 22)
    c.drawString(x + 12, y - 42, str(value))


def action_table(c: canvas.Canvas, y: float, rows: list[dict]) -> float:
    """Tabela 3 col: responsavel | prazo | accao. Header gold/preto + linhas alternadas."""
    if not rows:
        c.setFillColor(MUTED)
        c.setFont("Helvetica-Oblique", 9)
        c.drawString(ML, y - 10, "Sem accoes pendentes registadas.")
        return y - 18

    col_resp = 100
    col_prazo = 80
    col_accao = CW - col_resp - col_prazo
    header_h = 20
    # Header
    c.setFillColor(BLACK)
    c.rect(ML, y - header_h, CW, header_h, stroke=0, fill=1)
    c.setFillColor(GOLD)
    c.setFont("Helvetica-Bold", 7)
    c.drawString(ML + 8, y - 13, "RESPONSAVEL")
    c.drawString(ML + 8 + col_resp, y - 13, "PRAZO")
    c.drawString(ML + 8 + col_resp + col_prazo, y - 13, "ACCAO")
    y -= header_h
    # Linhas
    for i, row in enumerate(rows):
        row_h = 22
        if i % 2 == 0:
            c.setFillColor(LIGHT)
            c.rect(ML, y - row_h, CW, row_h, stroke=0, fill=1)
        c.setFillColor(BODY)
        c.setFont("Helvetica", 8)
        c.drawString(ML + 8, y - 14, str(row.get("responsavel", "—"))[:18])
        c.drawString(ML + 8 + col_resp, y - 14, str(row.get("prazo", "—"))[:14])
        c.drawString(ML + 8 + col_resp + col_prazo, y - 14, str(row.get("accao", ""))[:75])
        y -= row_h
    return y - 4


# ── Paginas ────────────────────────────────────────────────────────────────


def render_capa(c: canvas.Canvas, data: dict) -> None:
    """Capa empresarial replica de pdfMeetingReport.js:47-91."""
    c.setFillColor(BLACK)
    c.rect(0, 0, PW, PH, stroke=0, fill=1)
    # Faixa gold topo
    c.setFillColor(GOLD)
    c.rect(0, PH - 5, PW, 5, stroke=0, fill=1)
    # Linha gold lateral 75% altura
    c.saveState()
    c.setFillAlpha(0.3)
    c.setFillColor(GOLD)
    c.rect(35, 80, 2, PH - 160, stroke=0, fill=1)
    c.restoreState()

    # Logo
    logo_x = (PW - 200) / 2
    logo_y = PH - 100 - 200
    if LOGO_PATH.exists():
        try:
            c.drawImage(
                str(LOGO_PATH),
                logo_x,
                logo_y,
                width=200,
                height=200,
                preserveAspectRatio=True,
                mask="auto",
            )
        except Exception:
            _logo_fallback(c)
    else:
        _logo_fallback(c)

    # Linha decorativa curta
    c.setFillColor(GOLD)
    c.rect(PW / 2 - 30, PH - 270 - 1, 60, 1, stroke=0, fill=1)

    # Eyebrow
    c.setFillColor(GOLD)
    c.setFont("Helvetica-Bold", 9)
    eyebrow = "R E L A T O R I O   S E M A N A L   D E   C O M U N I C A C O E S"
    c.drawCentredString(PW / 2, PH - 295, eyebrow)

    # Titulo (periodo)
    periodo = data.get("periodo", {})
    titulo = f"Semana {data.get('semana_num', '—')}"
    c.setFillColor(WHITE)
    c.setFont("Helvetica-Bold", 28)
    c.drawCentredString(PW / 2, PH - 350, titulo)

    # Subtitulo: datas
    subt = f"{periodo.get('inicio', '—')}  a  {periodo.get('fim', '—')}"
    c.setFillColor(MUTED)
    c.setFont("Helvetica", 11)
    c.drawCentredString(PW / 2, PH - 380, subt)

    # Stats curtas
    totais = data.get("totais", {})
    stats = (
        f"{totais.get('conversas_activas', 0)} conversas activas · "
        f"{totais.get('mensagens', 0)} mensagens analisadas"
    )
    c.setFillColor(HexColor("#888888"))
    c.setFont("Helvetica", 9)
    c.drawCentredString(PW / 2, PH - 405, stats)

    # Footer da capa
    c.setFillColor(DARK)
    c.rect(0, 0, PW, 60, stroke=0, fill=1)
    c.saveState()
    c.setFillAlpha(0.5)
    c.setFillColor(GOLD)
    c.rect(0, 60, PW, 1, stroke=0, fill=1)
    c.restoreState()
    c.setFillColor(GOLD)
    c.setFont("Helvetica-Bold", 7)
    c.drawCentredString(PW / 2, 35, "SOMNIUM PROPERTIES · CONFIDENCIAL")
    c.setFillColor(HexColor("#666666"))
    c.setFont("Helvetica", 7)
    ano = data.get("data_geracao", "")[:4] or datetime.now().strftime("%Y")
    semana = str(data.get("semana_num", "00")).zfill(2)
    ref = f"Ref. WSP-RPT-{ano}-W{semana} · {data.get('data_geracao', datetime.now().strftime('%Y-%m-%d'))}"
    c.drawCentredString(PW / 2, 20, ref)


def _logo_fallback(c: canvas.Canvas) -> None:
    c.setFillColor(GOLD)
    c.setFont("Helvetica-Bold", 30)
    c.drawCentredString(PW / 2, PH - 230, "SOMNIUM PROPERTIES")


def render_sumario(c: canvas.Canvas, data: dict) -> None:
    """Pagina 2: Sumario Executivo + KPIs + Top topicos."""
    c.showPage()
    y = PH - PT
    y = hdr(c, "SUMARIO EXECUTIVO", y) - 4

    totais = data.get("totais", {})
    # 4 KPIs em grid 2x2
    card_w = (CW - 12) / 2
    card_h = 60
    kpi_card(c, ML, y, card_w, card_h, "Mensagens analisadas", totais.get("mensagens", 0))
    kpi_card(c, ML + card_w + 12, y, card_w, card_h, "Conversas activas", totais.get("conversas_activas", 0))
    y -= card_h + 12
    kpi_card(c, ML, y, card_w, card_h, "Decisoes tomadas", totais.get("decisoes", 0))
    kpi_card(c, ML + card_w + 12, y, card_w, card_h, "Accoes pendentes", totais.get("accoes_pendentes", 0))
    y -= card_h + 18

    # Paragrafo executivo
    sumario = data.get("sumario_executivo", "")
    if sumario:
        y = sec(c, "Visao geral da semana", y)
        y = wrap_text(c, ML, y, CW, sumario, 10, leading=14, color=BODY) - 6

    # Top topicos
    topicos = data.get("top_topicos", [])
    if topicos:
        y = page_break(c, y, 60)
        y = sec(c, "Top topicos da semana", y)
        for i, t in enumerate(topicos[:5], 1):
            y = page_break(c, y, 18)
            c.setFillColor(GOLD)
            c.circle(ML + 7, y - 7, 7, stroke=0, fill=1)
            c.setFillColor(WHITE)
            c.setFont("Helvetica-Bold", 7)
            c.drawCentredString(ML + 7, y - 9, str(i))
            y = wrap_text(c, ML + 22, y, CW - 26, t, 9, leading=12) - 4

    render_footer(c)


def render_indice(c: canvas.Canvas, data: dict, page_map: dict[str, int]) -> None:
    """Pagina 3: Indice de conversas com paginacao."""
    c.showPage()
    y = PH - PT
    y = hdr(c, "INDICE DE CONVERSAS", y) - 4

    conversas = {x["id"]: x for x in data.get("conversas", [])}
    for i, conv_id in enumerate(CONVERSA_ORDER):
        label = CONVERSA_LABELS[conv_id]
        conv = conversas.get(conv_id, {})
        n_msgs = conv.get("mensagens", 0)
        page = page_map.get(conv_id, "—")
        # Linha alternada
        h = 26
        if i % 2 == 0:
            c.setFillColor(LIGHT)
            c.rect(ML, y - h, CW, h, stroke=0, fill=1)
        c.setFillColor(BLACK)
        c.setFont("Helvetica-Bold", 10)
        c.drawString(ML + 10, y - 16, label)
        c.setFillColor(MUTED)
        c.setFont("Helvetica", 9)
        c.drawString(ML + 320, y - 16, f"{n_msgs} mensagens")
        c.setFillColor(GOLD)
        c.setFont("Helvetica-Bold", 9)
        c.drawRightString(ML + CW - 10, y - 16, f"pag. {page}")
        y -= h

    render_footer(c)


def render_conversa(c: canvas.Canvas, conv_id: str, conv: dict | None) -> None:
    """Pagina(s) por conversa."""
    c.showPage()
    label = CONVERSA_LABELS[conv_id]
    y = PH - PT
    y = hdr(c, label, y) - 4

    if not conv or not conv.get("mensagens"):
        c.setFillColor(MUTED)
        c.setFont("Helvetica-Oblique", 10)
        c.drawString(ML, y - 12, "Sem mensagens neste periodo (export em falta ou conversa vazia).")
        render_footer(c)
        return

    # Bloco metadata 2 col
    meta = [
        ("Periodo", conv.get("periodo", "—")),
        ("Mensagens trocadas", str(conv.get("mensagens", 0))),
        ("Participantes", ", ".join(conv.get("participantes", [])[:6]) or "—"),
        ("Sentimento dominante", conv.get("sentimento", "—")),
        ("Ratio de resposta", conv.get("ratio_resposta", "—")),
    ]
    for i, (lab, val) in enumerate(meta):
        y = page_break(c, y, 30)
        y = two_col_field(c, y, lab, val, i)
    y -= 8

    # Cross-ref CRM (so para imoveis especificos)
    cr = conv.get("cross_ref_crm")
    if cr:
        y = page_break(c, y, 80)
        y = sec(c, "Dados do Imovel (CRM)", y)
        cr_fields = [
            ("Estado", cr.get("estado", "—")),
            ("Tipologia", cr.get("tipologia", "—")),
            ("VVR estimado", cr.get("vvr", "—")),
            ("Valor de aquisicao", cr.get("valor_aquisicao", "—")),
            ("Investidor associado", cr.get("investidor", "—")),
        ]
        for i, (lab, val) in enumerate(cr_fields):
            y = page_break(c, y, 30)
            y = two_col_field(c, y, lab, val, i)
        y -= 8

    # Topicos
    topicos = conv.get("topicos", [])
    if topicos:
        y = page_break(c, y, 60)
        y = sec(c, "Topicos discutidos", y)
        for t in topicos[:8]:
            y = page_break(c, y, 18)
            y = bullet(c, y, t) - 2

    # Decisoes
    decisoes = conv.get("decisoes", [])
    if decisoes:
        y = page_break(c, y, 60)
        y = sec(c, "Decisoes tomadas", y)
        for d in decisoes[:6]:
            y = page_break(c, y, 18)
            y = bullet(c, y, d, marker="check") - 2

    # Accoes pendentes
    accoes = conv.get("accoes", [])
    y = page_break(c, y, 80)
    y = sec(c, "Accoes pendentes", y)
    y = action_table(c, y, accoes)

    # Proximos passos
    prox = conv.get("proximos_passos")
    if prox:
        y = page_break(c, y, 60)
        y = sec(c, "Proximos passos", y)
        # Bloco com barra gold a esquerda
        c.setFillColor(GOLD)
        c.rect(ML, y - 50, 3, 50, stroke=0, fill=1)
        wrap_text(c, ML + 14, y, CW - 20, prox, 9, leading=13, color=BODY)

    render_footer(c)


def render_anexo(c: canvas.Canvas, data: dict) -> None:
    """Anexo: mensagens criticas (data | conversa | excerto)."""
    criticas = data.get("mensagens_criticas", [])
    if not criticas:
        return
    c.showPage()
    y = PH - PT
    y = hdr(c, "ANEXO — MENSAGENS CRITICAS", y) - 4

    c.setFillColor(MUTED)
    c.setFont("Helvetica-Oblique", 9)
    c.drawString(
        ML,
        y - 10,
        "Mensagens identificadas como criticas (montantes, prazos, decisoes, acordos).",
    )
    y -= 24

    # Header tabela
    col_data = 70
    col_conv = 130
    col_excerto = CW - col_data - col_conv
    c.setFillColor(BLACK)
    c.rect(ML, y - 20, CW, 20, stroke=0, fill=1)
    c.setFillColor(GOLD)
    c.setFont("Helvetica-Bold", 7)
    c.drawString(ML + 8, y - 13, "DATA")
    c.drawString(ML + 8 + col_data, y - 13, "CONVERSA")
    c.drawString(ML + 8 + col_data + col_conv, y - 13, "EXCERTO")
    y -= 20

    for i, msg in enumerate(criticas[:25]):
        row_h = 32
        y = page_break(c, y, row_h + 4)
        if i % 2 == 0:
            c.setFillColor(LIGHT)
            c.rect(ML, y - row_h, CW, row_h, stroke=0, fill=1)
        c.setFillColor(BODY)
        c.setFont("Helvetica", 8)
        c.drawString(ML + 8, y - 14, str(msg.get("data", "—"))[:14])
        c.setFillColor(GOLD)
        c.setFont("Helvetica-Bold", 8)
        c.drawString(ML + 8 + col_data, y - 14, str(msg.get("conversa", "—"))[:24])
        c.setFillColor(BODY)
        c.setFont("Helvetica", 8)
        excerto = str(msg.get("excerto", ""))[:130]
        wrap_text(
            c,
            ML + 8 + col_data + col_conv,
            y - 4,
            col_excerto - 12,
            excerto,
            8,
            leading=10,
        )
        y -= row_h

    render_footer(c)


# ── Main ───────────────────────────────────────────────────────────────────


def main(argv: list[str]) -> int:
    if len(argv) < 2:
        print("Uso: python whatsapp_weekly_report.py <pasta_inputs>", file=sys.stderr)
        return 1

    inputs_dir = Path(argv[1]).resolve()
    summary_path = inputs_dir / ".summary.json"
    if not summary_path.exists():
        print(f"Erro: nao encontrei {summary_path}", file=sys.stderr)
        return 2

    data = json.loads(summary_path.read_text(encoding="utf-8"))
    data_geracao = data.get("data_geracao") or datetime.now().strftime("%Y-%m-%d")

    output_dir = Path(__file__).resolve().parent / "output"
    output_dir.mkdir(parents=True, exist_ok=True)
    output_path = output_dir / f"relatorio-whatsapp-semanal-{data_geracao}.pdf"

    c = canvas.Canvas(str(output_path), pagesize=A4)
    c.setTitle(f"Relatorio Semanal Comunicacoes — Semana {data.get('semana_num', '—')}")
    c.setAuthor("Somnium Properties")
    c.setSubject("Relatorio Semanal de Comunicacoes WhatsApp")

    # Paginas: 1) capa, 2) sumario, 3) indice, 4..N) conversas, N+1) anexo
    # Para o indice precisamos dos numeros de pagina das conversas — fazemos pre-calculo
    # simples: cada conversa comeca numa pagina nova; assumir media de 2 paginas por
    # conversa pode falhar. Solucao: passagem dupla. Primeiro calcular paginas reais.
    page_map = _precompute_pages(data)

    render_capa(c, data)
    render_sumario(c, data)
    render_indice(c, data, page_map)

    conversas = {x["id"]: x for x in data.get("conversas", [])}
    for conv_id in CONVERSA_ORDER:
        render_conversa(c, conv_id, conversas.get(conv_id))

    render_anexo(c, data)
    c.save()

    print(f"OK · PDF gerado: {output_path}")
    return 0


def _precompute_pages(data: dict) -> dict[str, int]:
    """Estimativa simples de pagina de inicio de cada conversa.

    Capa=1, Sumario=2, Indice=3. Cada conversa comeca pelo menos 1 pagina.
    Se a conversa tem >5 accoes ou >6 topicos, assume 2 paginas.
    """
    page = 4  # primeira conversa
    out: dict[str, int] = {}
    conversas = {x["id"]: x for x in data.get("conversas", [])}
    for cid in CONVERSA_ORDER:
        out[cid] = page
        conv = conversas.get(cid, {}) or {}
        accoes = len(conv.get("accoes", []))
        topicos = len(conv.get("topicos", []))
        decisoes = len(conv.get("decisoes", []))
        # Heuristica
        if accoes > 5 or topicos > 6 or decisoes > 5 or conv.get("cross_ref_crm"):
            page += 2
        else:
            page += 1
    return out


if __name__ == "__main__":
    sys.exit(main(sys.argv))
