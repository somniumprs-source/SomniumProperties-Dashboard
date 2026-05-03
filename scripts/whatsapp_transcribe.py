#!/usr/bin/env python3
"""
Transcreve todos os audios das pastas semanais via OpenAI Whisper.

Uso:
    python scripts/whatsapp_transcribe.py 2026-W18           # semana especifica
    python scripts/whatsapp_transcribe.py 2026-W18 --model base   # forcar modelo

Para cada `inputs/whatsapp/<chat>/<YYYY-Www>/`:
    - Procura ficheiros .opus / .m4a / .mp3 / .wav
    - Corre whisper (modelo `base` por defeito) em portugues
    - Escreve `_audios.json` com [{file, duration, transcricao}, ...]

Requer ffmpeg no PATH e openai-whisper instalado:
    pip install openai-whisper
    cp /caminho/ffmpeg ~/bin/

Modelos disponiveis (qualidade vs velocidade):
    tiny    -> rapido, baixa qualidade
    base    -> equilibrio (default)
    small   -> melhor para PT, ~3x mais lento
    medium  -> excelente, mas ~10x mais lento que base
"""

from __future__ import annotations

import argparse
import json
import os
import shutil
import sys
import time
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

AUDIO_EXTS = {".opus", ".m4a", ".mp3", ".wav", ".ogg"}


def check_ffmpeg() -> str | None:
    """Verifica se ffmpeg esta acessivel. Devolve caminho ou None."""
    return shutil.which("ffmpeg")


def transcribe_chat(week_dir: Path, model) -> dict:
    """Transcreve todos os audios numa pasta semanal de chat."""
    audios = sorted(
        f for f in week_dir.iterdir()
        if f.suffix.lower() in AUDIO_EXTS and f.is_file()
    )
    if not audios:
        return {"audios": []}

    out_path = week_dir / "_audios.json"
    existing = {}
    if out_path.exists():
        try:
            existing = {a["file"]: a for a in json.loads(out_path.read_text(encoding="utf-8")).get("audios", [])}
        except Exception:
            existing = {}

    transcricoes = []
    for audio in audios:
        if audio.name in existing and existing[audio.name].get("transcricao"):
            transcricoes.append(existing[audio.name])
            print(f"    {audio.name} (cache)")
            continue
        t0 = time.time()
        try:
            res = model.transcribe(str(audio), language="pt", fp16=False, verbose=False)
            dur = time.time() - t0
            entry = {
                "file": audio.name,
                "duration_s": round(res.get("segments", [{}])[-1].get("end", 0), 1) if res.get("segments") else 0,
                "transcricao": res.get("text", "").strip(),
                "tempo_processamento_s": round(dur, 1),
            }
            transcricoes.append(entry)
            print(f"    {audio.name} ({entry['duration_s']}s audio, {dur:.1f}s para transcrever)")
        except Exception as e:
            transcricoes.append({"file": audio.name, "erro": str(e)})
            print(f"    {audio.name} ERRO: {e}")

    out_path.write_text(
        json.dumps({"audios": transcricoes}, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    return {"audios": transcricoes}


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("week_label", help="Ex: 2026-W18")
    parser.add_argument("--model", default="base", help="Modelo Whisper (tiny/base/small/medium)")
    args = parser.parse_args(argv[1:])

    ffmpeg_path = check_ffmpeg()
    if not ffmpeg_path:
        print("Erro: ffmpeg nao encontrado no PATH.", file=sys.stderr)
        print("Instala via: cp <ffmpeg> ~/bin/  e garante que ~/bin esta no PATH.", file=sys.stderr)
        return 1

    try:
        import whisper  # type: ignore
    except ImportError:
        print("Erro: openai-whisper nao instalado. Corre: pip install openai-whisper", file=sys.stderr)
        return 1

    print(f"Carregar modelo Whisper '{args.model}' (uma vez)...")
    t0 = time.time()
    model = whisper.load_model(args.model)
    print(f"Modelo carregado em {time.time() - t0:.1f}s")
    print()

    total_audios = 0
    for chat in CHATS:
        week_dir = INPUTS / chat / args.week_label
        if not week_dir.exists():
            continue
        print(f"[{chat}]  {week_dir.relative_to(ROOT)}")
        res = transcribe_chat(week_dir, model)
        total_audios += len(res.get("audios", []))

    print()
    print(f"Total de audios processados: {total_audios}")
    print(f"Cada chat tem `_audios.json` com transcricoes em portugues.")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
