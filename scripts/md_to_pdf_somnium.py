#!/usr/bin/env python3
"""
Renderizador Markdown -> PDF com a identidade visual Somnium.

Reutiliza os helpers de whatsapp_weekly_report.py (paleta gold/preto, capa
empresarial, footer confidencial, headers com letter-spacing) para transformar
um ficheiro markdown estruturado num PDF empresarial. Reutilizavel em qualquer
documento (relatorios semanais, auditorias, etc.).

Markdown suportado:
    # Titulo        -> seccao de topo (nova pagina, header gold/preto)
    ## Subtitulo    -> seccao secundaria (underline gold)
    ### Sub-sub     -> rotulo a negrito
    - item          -> bullet (triangulo gold)
      - item        -> bullet indentado
    1. item         -> lista numerada
    texto livre     -> paragrafo
    (linha vazia)   -> espacamento

Uso:
    python scripts/md_to_pdf_somnium.py <input.md> <output.pdf> \
        --eyebrow "AUDITORIA" --titulo "Semana W23" \
        --subtitulo "1 a 7 Junho 2026" --stats "3 conversas · 532 mensagens" \
        --ref "WSP-AUD-2026-W23"
"""

from __future__ import annotations

import argparse
import re
from datetime import datetime
from pathlib import Path

from reportlab.lib.pagesizes import A4
from reportlab.lib.colors import HexColor
from reportlab.pdfgen import canvas

from whatsapp_weekly_report import (
    GOLD, BLACK, DARK, WHITE, MUTED, BODY, LIGHT, BORDER,
    PW, PH, ML, PT, PB, CW, LOGO_PATH,
    page_break, render_footer, hdr, sec, wrap_text, _logo_fallback,
)


def render_capa(c, eyebrow, titulo, subtitulo, stats, ref, data_geracao):
    c.setFillColor(BLACK)
    c.rect(0, 0, PW, PH, stroke=0, fill=1)
    c.setFillColor(GOLD)
    c.rect(0, PH - 5, PW, 5, stroke=0, fill=1)
    c.saveState()
    c.setFillAlpha(0.3)
    c.setFillColor(GOLD)
    c.rect(35, 80, 2, PH - 160, stroke=0, fill=1)
    c.restoreState()

    logo_x = (PW - 200) / 2
    logo_y = PH - 100 - 200
    if LOGO_PATH.exists():
        try:
            c.drawImage(str(LOGO_PATH), logo_x, logo_y, width=200, height=200,
                        preserveAspectRatio=True, mask="auto")
        except Exception:
            _logo_fallback(c)
    else:
        _logo_fallback(c)

    c.setFillColor(GOLD)
    c.rect(PW / 2 - 30, PH - 270 - 1, 60, 1, stroke=0, fill=1)
    c.setFillColor(GOLD)
    c.setFont("Helvetica-Bold", 9)
    c.drawCentredString(PW / 2, PH - 295, " ".join(eyebrow.upper()))
    c.setFillColor(WHITE)
    c.setFont("Helvetica-Bold", 28)
    c.drawCentredString(PW / 2, PH - 350, titulo)
    c.setFillColor(MUTED)
    c.setFont("Helvetica", 11)
    c.drawCentredString(PW / 2, PH - 380, subtitulo)
    if stats:
        c.setFillColor(HexColor("#888888"))
        c.setFont("Helvetica", 9)
        c.drawCentredString(PW / 2, PH - 405, stats)

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
    c.drawCentredString(PW / 2, 20, f"Ref. {ref} · {data_geracao}")


def _strip_md(text: str) -> str:
    """Remove marcadores de enfase markdown (**, *, `)."""
    text = re.sub(r"\*\*(.+?)\*\*", r"\1", text)
    text = re.sub(r"\*(.+?)\*", r"\1", text)
    text = text.replace("`", "")
    return text


def h3(c, y, text):
    y = page_break(c, y, 26)
    c.setFillColor(BLACK)
    c.setFont("Helvetica-Bold", 9.5)
    c.drawString(ML, y - 10, _strip_md(text)[:95])
    return y - 18


def md_bullet(c, y, text, indent=0):
    y = page_break(c, y, 24)
    x = ML + indent
    c.setFillColor(GOLD)
    p = c.beginPath()
    p.moveTo(x, y - 4)
    p.lineTo(x, y - 11)
    p.lineTo(x + 6, y - 7.5)
    p.close()
    c.drawPath(p, stroke=0, fill=1)
    new_y = wrap_text(c, x + 13, y, CW - 17 - indent, _strip_md(text), 9, leading=12.5)
    return new_y - 5


def md_numbered(c, y, n, text):
    y = page_break(c, y, 24)
    c.setFillColor(GOLD)
    c.setFont("Helvetica-Bold", 10)
    c.drawString(ML, y - 9, f"{n}.")
    new_y = wrap_text(c, ML + 20, y, CW - 24, _strip_md(text), 9, leading=12.5)
    return new_y - 6


def md_paragraph(c, y, text):
    y = page_break(c, y, 28)
    return wrap_text(c, ML, y, CW, _strip_md(text), 9, leading=12.5, color=BODY) - 5


def render_markdown(c, md_text):
    y = None  # forca abertura de pagina no primeiro "# "
    num_re = re.compile(r"^(\d+)\.\s+(.*)$")
    for raw in md_text.splitlines():
        line = raw.rstrip()
        stripped = line.strip()
        if not stripped:
            if y is not None:
                y -= 6
            continue
        if line.startswith("# "):
            render_footer(c) if y is not None else None
            c.showPage()
            y = PH - PT
            y = hdr(c, line[2:].strip(), y) - 8
        elif line.startswith("## "):
            if y is None:
                c.showPage(); y = PH - PT
            y = page_break(c, y, 42)
            y = sec(c, line[3:].strip(), y) - 2
        elif line.startswith("### "):
            if y is None:
                c.showPage(); y = PH - PT
            y = h3(c, y, line[4:].strip())
        elif re.match(r"^\s+- ", line):
            indent = 16 if line.startswith("  ") else 0
            y = md_bullet(c, y, stripped[2:], indent=indent)
        elif line.startswith("- "):
            y = md_bullet(c, y, line[2:].strip())
        elif num_re.match(stripped):
            m = num_re.match(stripped)
            y = md_numbered(c, y, m.group(1), m.group(2))
        else:
            if y is None:
                c.showPage(); y = PH - PT
            y = md_paragraph(c, y, stripped)
    render_footer(c)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("input")
    ap.add_argument("output")
    ap.add_argument("--eyebrow", default="RELATORIO")
    ap.add_argument("--titulo", default="")
    ap.add_argument("--subtitulo", default="")
    ap.add_argument("--stats", default="")
    ap.add_argument("--ref", default="SOMNIUM")
    ap.add_argument("--data", default=datetime.now().strftime("%Y-%m-%d"))
    args = ap.parse_args()

    md_text = Path(args.input).read_text(encoding="utf-8")
    out = Path(args.output)
    out.parent.mkdir(parents=True, exist_ok=True)
    c = canvas.Canvas(str(out), pagesize=A4)
    render_capa(c, args.eyebrow, args.titulo, args.subtitulo, args.stats, args.ref, args.data)
    render_markdown(c, md_text)
    c.save()
    print(f"OK · PDF gerado: {out}")


if __name__ == "__main__":
    main()
