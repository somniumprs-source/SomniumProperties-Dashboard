#!/usr/bin/env python3
"""Recolhe imoveis AMP, descarrega os estudos de mercado (Report*.pdf) e extrai
um dataset estruturado: zona/freguesia, lat/long, tipologia, area, Valor de
Mercado (total e €/m²), min/max, renda e yield medios, €/m² dos comparaveis.
Saida: amp_dataset.json"""
import json, os, re, urllib.request, urllib.error
import fitz

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
REPORTS = os.path.join(HERE, "reports")
os.makedirs(REPORTS, exist_ok=True)

def env(key):
    val = ""
    with open(os.path.join(ROOT, ".env"), encoding="utf-8") as f:
        for line in f:
            if line.startswith(key + "="):
                v = line.split("=", 1)[1].strip().strip('"').strip("'")
                if v:
                    val = v
    return val

SK = env("SUPABASE_SERVICE_KEY")
BASE = env("SUPABASE_URL").rstrip("/") + "/rest/v1"

def get(url):
    req = urllib.request.Request(url, headers={"apikey": SK, "Authorization": "Bearer " + SK})
    with urllib.request.urlopen(req, timeout=40) as r:
        return json.load(r)

def num(s):
    """'283 684 €' -> 283684 ; '3.8 %' -> 3.8"""
    if s is None:
        return None
    s = s.replace(" ", "").replace(" ", "").replace(" ", "")
    s = s.replace("€/m²", "").replace("€", "").replace("%", "").replace("m²", "")
    s = s.replace(",", ".")
    m = re.search(r"-?\d+(?:\.\d+)?", s)
    return float(m.group()) if m else None

def first(pat, text, flags=0, grp=1):
    m = re.search(pat, text, flags)
    return m.group(grp).strip() if m else None

CANON_FIX = {"São": "São", "Paraíso": "Paraíso"}

def normaliza_freguesia(f):
    if not f:
        return None
    f = re.sub(r"^\s*Uni[ãa]o das freguesias de\s+", "", f, flags=re.I)
    f = f.strip().strip("×").strip(".").strip()
    f = re.sub(r"\s+", " ", f)
    return f or None

def extrai_freguesia(doc):
    """A freguesia oficial do imovel-alvo aparece na pagina 'Evolucao temporal':
    'Preço por metro quadrado (unitário) para <Tipo> ... de [União das freguesias de] X.'"""
    for i in range(doc.page_count):
        t = doc[i].get_text()
        if "Preço por metro quadrado" in t and ("Evolução temporal" in t or "Variação temporal" in t):
            blob = t.replace("\n", " ")
            m = re.search(r"Preço por metro quadrado.*?\bde\s+(?:Uni[ãa]o das freguesias de\s+)?([^.]+?)\.", blob, re.I)
            if m:
                return normaliza_freguesia(m.group(1))
    # fallback: primeira mencao 'freguesias de X' no documento
    full = "\n".join(doc[p].get_text() for p in range(doc.page_count))
    m = re.search(r"freguesias?\s+de\s+([^.\n]+)", full)
    return normaliza_freguesia(m.group(1)) if m else None

cols = "id,nome,zona,concelho,freguesia,tipologia,area_bruta,ask_price,fotos"
imoveis = get(f"{BASE}/imoveis?regiao=eq.AMP&select={cols}")

def reports_of(im):
    fotos = im.get("fotos") or "[]"
    if isinstance(fotos, str):
        try: fotos = json.loads(fotos)
        except Exception: fotos = []
    return [f for f in fotos if f and str(f.get("name", "")).lower().startswith("report")]

dataset, sem_estudo, falhados = [], [], []
for im in imoveis:
    reps = reports_of(im)
    if not reps:
        sem_estudo.append(im["nome"]); continue
    rep = reps[0]
    path = os.path.join(REPORTS, im["id"] + ".pdf")
    if not os.path.exists(path) or os.path.getsize(path) < 1000:
        try:
            urllib.request.urlretrieve(rep["path"], path)
        except Exception as e:
            falhados.append(im["nome"]); continue
    try:
        doc = fitz.open(path)
    except Exception:
        falhados.append(im["nome"]); continue

    full = "\n".join(doc[i].get_text() for i in range(doc.page_count))
    p1 = doc[0].get_text().replace("\n", " ")

    tipo = first(r"ESTUDO DE\s*MERCADO\s+([A-ZÀ-Ú]+)", p1) or first(r"Tipo de imóvel:\s*(\w+)", full)
    tip_m = re.search(r"•\s*(T\d+)\s*•\s*([\d.,]+)\s*M²", p1, re.I)
    tipologia = tip_m.group(1).upper() if tip_m else None
    area = num(tip_m.group(2)) if tip_m else num(first(r"Área bruta:\s*([\d\s.,]+)m²", full))
    lat = num(first(r"Latitude:\s*([-\d.,]+)", full))
    lng = num(first(r"Longitude:\s*([-\d.,]+)", full))
    morada = first(r"Morada:\s*\n?([^\n]+)", doc[1].get_text() if doc.page_count > 1 else full)

    # pagina Estimativa
    est = next((doc[i].get_text() for i in range(doc.page_count) if "INTERVALO DE VALORES" in doc[i].get_text()), "")
    market_total = market_m2 = vmin_m2 = vmax_m2 = vmin_total = vmax_total = None
    if est:
        head = est.split("VALOR MÍNIMO")[0]
        market_total = num(first(r"INTERVALO DE VALORES\s*\n([\d\s.,  ]+)€(?!/)", head))
        market_m2 = num(first(r"([\d\s.,  ]+)€/m²", head))
        tail = est.split("VALOR MÍNIMO", 1)[1] if "VALOR MÍNIMO" in est else ""
        tail = tail.split("Morada:")[0]
        m2s = re.findall(r"([\d\s.,  ]+)€/m²", tail)
        tots = re.findall(r"([\d\s.,  ]+)€(?!/)", tail)
        if len(m2s) >= 2:
            vmin_m2, vmax_m2 = num(m2s[0]), num(m2s[1])
        if len(tots) >= 2:
            vmin_total, vmax_total = num(tots[0]), num(tots[1])
    renda = num(first(r"Renda \(média\):\s*([\d\s.,  ]+)€", est or full))
    yld = num(first(r"Yield \(média\):\s*([\d.,]+)\s*%", est or full))
    comp_m2 = num(first(r"([\d\s.,  ]+)€/m²\s*\npreço unitário médio", est or full))
    comp_preco = num(first(r"([\d\s.,  ]+)€\s*\npreço médio dos imóveis", est or full))

    freg = extrai_freguesia(doc) or normaliza_freguesia(im.get("freguesia"))
    dataset.append({
        "id": im["id"], "nome": im["nome"], "tipo": (tipo or "").title() or None,
        "tipologia": tipologia, "area_m2": area, "morada": morada,
        "freguesia": freg, "concelho": im.get("concelho") or "Vila Nova de Gaia",
        "lat": lat, "lng": lng,
        "valor_mercado": market_total, "valor_mercado_m2": market_m2,
        "valor_min": vmin_total, "valor_min_m2": vmin_m2,
        "valor_max": vmax_total, "valor_max_m2": vmax_m2,
        "renda_media": renda, "yield_media": yld,
        "comparaveis_preco_medio": comp_preco, "comparaveis_m2_medio": comp_m2,
        "estudo_ficheiro": rep["name"],
    })

out = {"gerado_para": "AMP (Porto / Vila Nova de Gaia)", "total_imoveis": len(imoveis),
       "com_estudo": len(dataset), "sem_estudo": sem_estudo, "estudos_falhados": falhados,
       "imoveis": dataset}
with open(os.path.join(HERE, "amp_dataset.json"), "w", encoding="utf-8") as f:
    json.dump(out, f, ensure_ascii=False, indent=2)

print(f"imoveis AMP: {len(imoveis)} | com estudo extraido: {len(dataset)} | sem estudo: {len(sem_estudo)} | falhados: {falhados}")
print(f"{'NOME':35} {'FREGUESIA':38} {'TIPO':4} {'AREA':>5} {'€/m²':>6} {'VALOR':>9} {'YIELD':>5}  lat/lng")
for d in dataset:
    print(f"{(d['nome'] or '')[:34]:35} {(d['freguesia'] or '?')[:37]:38} {d['tipologia'] or '?':4} "
          f"{d['area_m2'] or 0:5.0f} {d['valor_mercado_m2'] or 0:6.0f} {d['valor_mercado'] or 0:9.0f} "
          f"{d['yield_media'] or 0:5.1f}  {d['lat']},{d['lng']}")
