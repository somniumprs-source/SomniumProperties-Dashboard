#!/usr/bin/env python3
"""
Filtra o export completo de cada chat para uma subpasta semanal (Segunda a Domingo).

Uso:
    python scripts/whatsapp_filter_week.py                   # semana que contem hoje
    python scripts/whatsapp_filter_week.py 2026-04-29        # semana que contem essa data

Para cada `inputs/whatsapp/<chat>/_export/`:
    1. Le `_chat.txt` (qualquer formato standard de export WhatsApp).
    2. Filtra mensagens cuja data caia em [Segunda, Domingo] da semana alvo.
    3. Detecta anexos referenciados (`<file> (file attached)` ou `<adjunto: file>`).
    4. Cria `<chat>/<YYYY-Www>/` com `_chat.txt` filtrado e anexos copiados.

Output: caminho absoluto da pasta semanal criada para cada chat + estatisticas.
"""

from __future__ import annotations

import re
import shutil
import sys
from datetime import date, datetime, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
INPUTS = ROOT / "inputs" / "whatsapp"

CHATS = [
    "ceo",
    "claude-code",
    "financeiro",
    "t2-condeixa",
    "predio-lajes",
    "comercial-investidores",
    "comercial-imoveis",
    "caep",
]

# Formatos comuns de WhatsApp:
#   [DD/MM/YYYY, HH:MM:SS] Nome: msg                      (iOS pt)
#   [DD/MM/YY, HH:MM:SS] Nome: msg
#   DD/MM/YYYY, HH:MM - Nome: msg                          (Android pt)
#   DD/MM/YY, HH:MM - Nome: msg
LINE_PATTERNS = [
    re.compile(r"^\[(\d{1,2})/(\d{1,2})/(\d{2,4}),\s*(\d{1,2}):(\d{2})(?::(\d{2}))?\]\s*(.*)$"),
    re.compile(r"^(\d{1,2})/(\d{1,2})/(\d{2,4}),\s*(\d{1,2}):(\d{2})(?::(\d{2}))?\s*-\s*(.*)$"),
]

# Anexos: "<anexo: 00000018-AUDIO-...opus>" (iOS pt), "<adjunto: ...>",
# "<attached: ...>" (Android en) e "AUD-20260501-WA0001.opus (file attached)".
ATTACHMENT_PATTERNS = [
    re.compile(r"<(?:anexo|attached|anexado|adjunto):\s*([^>]+)>", re.IGNORECASE),
    re.compile(r"([\w\-\.]+\.(?:opus|m4a|mp3|wav|ogg|jpg|jpeg|png|heic|webp|mp4|mov|pdf))\s*\((?:file attached|ficheiro anexado|arquivo anexado)\)", re.IGNORECASE),
]


def parse_line_date(line: str) -> tuple[date, bool] | None:
    """Devolve (data, is_message_start) ou None se nao for inicio de mensagem."""
    for pat in LINE_PATTERNS:
        m = pat.match(line)
        if m:
            d, mo, y = int(m.group(1)), int(m.group(2)), int(m.group(3))
            if y < 100:
                y += 2000
            try:
                return date(y, mo, d), True
            except ValueError:
                return None
    return None


def week_bounds(d: date) -> tuple[date, date]:
    """Devolve (segunda, domingo) da semana ISO que contem d."""
    weekday = d.weekday()  # 0=Seg, 6=Dom
    seg = d - timedelta(days=weekday)
    dom = seg + timedelta(days=6)
    return seg, dom


def iso_week_label(seg: date) -> str:
    iso_year, iso_week, _ = seg.isocalendar()
    return f"{iso_year}-W{iso_week:02d}"


def extract_attachments(line: str) -> list[str]:
    out: list[str] = []
    for pat in ATTACHMENT_PATTERNS:
        for m in pat.finditer(line):
            out.append(m.group(1).strip())
    return out


def filter_chat(chat_dir: Path, seg: date, dom: date, week_label: str) -> dict:
    """Filtra um chat. Devolve estatisticas."""
    export_dir = chat_dir / "_export"
    if not export_dir.exists():
        return {"status": "sem _export"}

    chat_txt = export_dir / "_chat.txt"
    if not chat_txt.exists():
        # Procurar variante (alguns exports usam "WhatsApp Chat with X.txt")
        candidates = sorted(export_dir.glob("*.txt"))
        if not candidates:
            return {"status": "sem _chat.txt"}
        chat_txt = candidates[0]

    week_dir = chat_dir / week_label
    week_dir.mkdir(parents=True, exist_ok=True)

    out_lines: list[str] = []
    referenced_attachments: set[str] = set()
    in_week = False
    msg_count = 0
    audio_count = 0
    image_count = 0

    raw = chat_txt.read_text(encoding="utf-8", errors="replace")
    # Remover U+200E e BOM (WhatsApp insere muitos)
    raw = raw.replace("‎", "").replace("﻿", "")

    for line in raw.splitlines():
        parsed = parse_line_date(line)
        if parsed:
            d, _ = parsed
            in_week = seg <= d <= dom
            if in_week:
                msg_count += 1
        if in_week:
            out_lines.append(line)
            for att in extract_attachments(line):
                referenced_attachments.add(att)

    # Escrever chat filtrado
    out_chat = week_dir / "_chat.txt"
    out_chat.write_text("\n".join(out_lines) + "\n", encoding="utf-8")

    # Copiar anexos (procurar com vários casings)
    for att in referenced_attachments:
        # Procurar match case-insensitive
        candidates = list(export_dir.glob(att)) + list(export_dir.glob(att.lower())) + list(export_dir.glob(att.upper()))
        if not candidates:
            for f in export_dir.iterdir():
                if f.name.lower() == att.lower():
                    candidates = [f]
                    break
        if not candidates:
            continue
        src = candidates[0]
        dst = week_dir / src.name
        if not dst.exists():
            shutil.copy2(src, dst)
        ext = src.suffix.lower()
        if ext in {".opus", ".m4a", ".mp3", ".wav"}:
            audio_count += 1
        elif ext in {".jpg", ".jpeg", ".png", ".heic", ".webp"}:
            image_count += 1

    return {
        "status": "ok",
        "mensagens": msg_count,
        "audios": audio_count,
        "imagens": image_count,
        "pasta": str(week_dir.relative_to(ROOT)),
    }


def main(argv: list[str]) -> int:
    if len(argv) > 1:
        try:
            target = datetime.strptime(argv[1], "%Y-%m-%d").date()
        except ValueError:
            print(f"Erro: data invalida '{argv[1]}'. Usa formato YYYY-MM-DD.", file=sys.stderr)
            return 1
    else:
        target = date.today()

    seg, dom = week_bounds(target)
    label = iso_week_label(seg)

    print(f"Semana: {label}  ({seg.isoformat()} a {dom.isoformat()})")
    print()

    if not INPUTS.exists():
        print(f"Erro: {INPUTS} nao existe. Corre primeiro scripts/whatsapp_setup.sh.", file=sys.stderr)
        return 2

    total_msgs = 0
    total_audios = 0
    total_imagens = 0
    rows: list[tuple[str, dict]] = []

    for chat in CHATS:
        chat_dir = INPUTS / chat
        if not chat_dir.exists():
            chat_dir.mkdir(parents=True)
            (chat_dir / "_export").mkdir()
        stats = filter_chat(chat_dir, seg, dom, label)
        rows.append((chat, stats))
        if stats.get("status") == "ok":
            total_msgs += stats.get("mensagens", 0)
            total_audios += stats.get("audios", 0)
            total_imagens += stats.get("imagens", 0)

    # Tabela de resultados
    print(f"{'Chat':<26} {'Mensagens':>10} {'Audios':>8} {'Imagens':>8}  Estado")
    print("-" * 72)
    for chat, s in rows:
        if s.get("status") == "ok":
            print(f"{chat:<26} {s['mensagens']:>10} {s['audios']:>8} {s['imagens']:>8}  ok")
        else:
            print(f"{chat:<26} {'-':>10} {'-':>8} {'-':>8}  {s['status']}")
    print("-" * 72)
    print(f"{'TOTAL':<26} {total_msgs:>10} {total_audios:>8} {total_imagens:>8}")
    print()
    print(f"Pasta semanal: inputs/whatsapp/<chat>/{label}/")
    print()
    print("Proximo passo:")
    print(f"  python scripts/whatsapp_transcribe.py {label}    # transcreve audios")
    print(f"  /administrativo/whatsapp-weekly-report           # gera o PDF")

    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
