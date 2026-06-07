#!/usr/bin/env python3
"""Descarrega fotos reais dos imoveis para fotos_cache/, filtrando logotipos/
placeholders de agencia (baixo numero de cores) e duplicados.
Escreve fotos_local.json: { imovel_id: [caminhos_locais] }. Tolera falhas."""
import json, os, urllib.request
from io import BytesIO
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
CACHE = os.path.join(HERE, "fotos_cache")
os.makedirs(CACHE, exist_ok=True)
data = json.load(open(os.path.join(HERE, "amp_dataset.json"), encoding="utf-8"))

UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36"
MIN_CORES = 800   # logotipos de agencia ~429 cores; fotos reais > 1000
MAX_KEEP = 3
MAX_TRY = 9

def carregar(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=25) as r:
        return Image.open(BytesIO(r.read())).convert("RGB")

def assinatura(img):
    small = img.resize((80, 80))
    cols = small.getcolors(80 * 80) or []
    return len(cols)

manifest, ok, skip, fail = {}, 0, 0, 0
for d in data["imoveis"]:
    locais, sigs = [], set()
    for i, url in enumerate((d.get("fotos") or [])[:MAX_TRY]):
        if len(locais) >= MAX_KEEP:
            break
        try:
            img = carregar(url)
        except Exception:
            fail += 1; continue
        nc = assinatura(img)
        if nc < MIN_CORES:        # logotipo / placeholder
            skip += 1; continue
        if nc in sigs:            # duplicado (mesmo logo/imagem repetida)
            skip += 1; continue
        sigs.add(nc)
        if img.width > 900:
            img = img.resize((900, int(img.height * 900 / img.width)))
        dest = os.path.join(CACHE, f"{d['id']}_{len(locais)}.jpg")
        img.save(dest, "JPEG", quality=82)
        locais.append(dest); ok += 1
    if locais:
        manifest[d["id"]] = locais

# limpar ficheiros antigos que ja nao constam do manifesto
keep = {os.path.basename(p) for ps in manifest.values() for p in ps}
for f in os.listdir(CACHE):
    if f not in keep:
        os.remove(os.path.join(CACHE, f))

json.dump(manifest, open(os.path.join(HERE, "fotos_local.json"), "w"), indent=2)
print(f"fotos guardadas: {ok} | descartadas(logo/dup): {skip} | falhas: {fail} | imoveis com foto: {len(manifest)}/{len(data['imoveis'])}")
