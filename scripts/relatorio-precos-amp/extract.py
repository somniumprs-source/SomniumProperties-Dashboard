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

def extrai_zona_banda(doc):
    """Banda €/m² da zona (eixo da pagina temporal: 'Preço por metro quadrado
    (unitário) para <Tipo> de <freguesia>'). E nivel zona+tipologia, independente
    da condicao do nosso imovel — a referencia honesta de mercado da freguesia."""
    page = next((doc[i].get_text() for i in range(doc.page_count)
                 if "Preço por metro quadrado" in doc[i].get_text()), "")
    if not page:
        return None, None
    # so a partir da frase do titulo do grafico, e ate aos rotulos de data (MM/YY)
    after = page.split("Preço por metro quadrado", 1)[1]
    after = re.split(r"\d{2}/\d{2}", after, 1)[0]
    ticks = [num(x) for x in re.findall(r"([\d\s.,  ]+)€/m²", after)]
    ticks = [t for t in ticks if t]
    if len(ticks) >= 2:
        return min(ticks), max(ticks)
    return None, None

def extrai_tendencia(full):
    cres = first(r"Crescimento\s*\n([\d.,]+)\s*%", full)
    niv = first(r"Nível de crescimento\s*\n([^\n]+)", full)
    return num(cres), (niv.strip() if niv else None)

POI_CATS = [
    ("saude", ["farmác", "farmac", "hospital", "clínic", "clinic", "saúde", "saude", "veterin", "dent", "médic", "medic"]),
    ("ensino", ["escola", "colég", "coleg", "infant", "universidade", "agrupamento", "externato", "creche", "jardim de infância"]),
    ("comercio", ["continente", "pingo doce", "lidl", "mercadona", "minipreço", "minipreco", "supermercado", "mercado",
                  "centro comercial", "el corte", "intermarché", "auchan", "shopping", "talho", "padaria"]),
    ("restauracao", ["café", "cafe", "restaurante", "churrasqueira", "confeitaria", "pastelaria", "snack", "lunch",
                     "coffee", "tasca", "cervejaria", "pizz", "burger", "gelataria", "bar "]),
    ("banca", ["banco", "santander", "caixa", "millennium", "montepio", "novo banco", "bcp", "cgd", "bpi", "crédito", "ctt"]),
    ("transporte", ["metro", "estação", "estacao", "comboio", "autocarro", "paragem", "terminal", "gare", "apeadeiro"]),
    ("lazer", ["jardim", "parque", "praia", "piscina", "ginás", "ginas", "anfiteatro", "museu", "igreja", "feira", "marina", "estádio", "estadio"]),
]
def categoriza_poi(nome):
    n = nome.lower()
    for cat, kws in POI_CATS:
        if any(k in n for k in kws):
            return cat
    return "outros"

def extrai_pois(doc):
    page = next((doc[i].get_text() for i in range(doc.page_count) if "PONTOS DE INTERESSE" in doc[i].get_text()), "")
    lines = [l.strip() for l in page.split("\n") if l.strip()]
    pois, buf, started = [], [], False
    for l in lines:
        if "PONTOS DE INTERESSE" in l:
            started = True; continue
        if not started:
            continue
        m = re.match(r"^([\d.]+)\s*km$", l)
        if m:
            if buf:
                nm = " ".join(buf).strip(" .•")
                pois.append({"nome": nm, "km": float(m.group(1)), "cat": categoriza_poi(nm)}); buf = []
        elif re.match(r"^(Somnium|somnium|maio|Pontos|Tipo de|Morada|R\.)", l):
            continue
        else:
            buf.append(l)
    return pois

def extrai_mercado(full):
    nan = first(r"com os\s+(\d+)\s+an[uú]ncios", full)
    tm = first(r"(\d+)\s*meses\s*\ntempo médio no mercado", full)
    raio = first(r"(\d+)\s*km\s*\nraio de procura", full)
    ncomp = len(re.findall(r"Dias no mercado:", full))
    return (int(nan) if nan else None, int(tm) if tm else None, int(raio) if raio else None, ncomp or None)

def fotos_imovel(im):
    """URLs acessiveis das fotos (nao-Report): path http, senao source_url. Max 4."""
    fotos = im.get("fotos") or "[]"
    if isinstance(fotos, str):
        try: fotos = json.loads(fotos)
        except Exception: fotos = []
    urls = []
    for f in fotos:
        if not f or not str(f.get("type", "")).startswith("image"):
            continue
        if str(f.get("name", "")).lower().startswith("report"):
            continue
        p = f.get("path") or ""
        if p.startswith("http"):
            urls.append(p)
        elif f.get("source_url", "").startswith("http"):
            urls.append(f["source_url"])
        if len(urls) >= 12:
            break
    return urls

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
    ask = im.get("ask_price")
    ask = float(ask) if ask else None
    delta = ((ask - market_total) / market_total * 100) if (ask and market_total) else None
    cresc, nivel = extrai_tendencia(full)
    zona_m2_min, zona_m2_max = extrai_zona_banda(doc)
    zona_m2_ref = (zona_m2_min + zona_m2_max) / 2 if (zona_m2_min and zona_m2_max) else None
    pois = extrai_pois(doc)
    n_anuncios, tempo_merc, raio_km, n_comp = extrai_mercado(full)
    fotos_urls = fotos_imovel(im)
    dataset.append({
        "id": im["id"], "nome": im["nome"], "tipo": (tipo or "").title() or None,
        "tipologia": tipologia, "area_m2": area, "morada": morada,
        "freguesia": freg, "concelho": im.get("concelho") or "Vila Nova de Gaia",
        "lat": lat, "lng": lng,
        "ask_price": ask, "ask_price_m2": (ask / area) if (ask and area) else None,
        "delta_ask_mercado_pct": delta,
        "valor_mercado": market_total, "valor_mercado_m2": market_m2,
        "valor_min": vmin_total, "valor_min_m2": vmin_m2,
        "valor_max": vmax_total, "valor_max_m2": vmax_m2,
        "renda_media": renda, "yield_media": yld,
        "comparaveis_preco_medio": comp_preco, "comparaveis_m2_medio": comp_m2,
        "crescimento_pct": cresc, "nivel_crescimento": nivel,
        "zona_m2_min": zona_m2_min, "zona_m2_max": zona_m2_max, "zona_m2_ref": zona_m2_ref,
        "anuncios_area": n_anuncios, "tempo_mercado_meses": tempo_merc, "raio_km": raio_km, "n_comparaveis": n_comp,
        "pontos_interesse": pois, "fotos": fotos_urls,
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
