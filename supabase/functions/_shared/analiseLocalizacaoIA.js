// @ts-nocheck
/**
 * Análise IA da localização de um imóvel (botão na aba Localização).
 *
 * 1. Procura no OpenStreetMap tudo o que existe à volta do imóvel (saúde,
 *    educação, comércio, restauração, transportes, desporto, lazer, serviços),
 *    com a distância em linha reta e os tempos de carro e a pé. Tudo gratuito
 *    (decisão do João, 10/11/2026): sem Google nem outra API paga.
 * 2. Os pontos de interesse ficam "propostos": a equipa valida ou exclui cada um.
 * 3. Com os validados, a análise (pontos fortes e fracos, na perspetiva do
 *    comprador, como no PEV) é pedida à fila IA (Claude no Mac, plano Claude).
 * 4. Cada ponto da análise também é validado ou excluído; os validados são
 *    acrescentados aos campos Pontos fortes / Pontos fracos da ficha.
 *
 * Módulo único em JS simples, importado pela Edge Function (crm/index.ts) e
 * pelo Express de dev (src/db/routes.js).
 */

// Igual ao jsonDaResposta da fila IA (o Claude pode acrescentar texto à volta).
function jsonDaResposta(texto) {
  const t = String(texto || '')
  const m = t.match(/\{[\s\S]*\}/)
  return JSON.parse(m?.[0] || t)
}

export const TIPO_FILA_LOCALIZACAO = 'analise_localizacao'

export const GRUPOS = {
  saude: 'Saúde',
  educacao: 'Educação',
  comercio: 'Comércio',
  restauracao: 'Restauração',
  transportes: 'Transportes',
  desporto: 'Desporto',
  lazer: 'Lazer e cultura',
  servicos: 'Serviços',
}

// raio em metros; max = quantos se guardam por categoria (os mais próximos).
// osm = filtros Overpass; ok(tags) decide a categoria (a primeira que aceitar
// fica com o local); semNome = nome a usar quando o OSM não tem nome (senão é ignorado).
const re = (s) => new RegExp(s, 'i')
const temRede = (t, r) => re(r).test(`${t.network || ''} ${t.operator || ''} ${t.name || ''}`)
const privado = (t) => ['private', 'customers', 'no'].includes(t.access)

export const CATEGORIAS = [
  { id: 'hospitais', grupo: 'saude', label: 'Hospitais', raio: 6000, max: 3,
    osm: ['[amenity=hospital]', '[healthcare=hospital]'], ok: (t) => t.amenity === 'hospital' || t.healthcare === 'hospital' },
  { id: 'clinicas', grupo: 'saude', label: 'Centros de saúde e clínicas', raio: 2500, max: 4,
    osm: ['[amenity~"^(clinic|doctors)$"]', '[healthcare~"^(centre|clinic|doctor)$"]'],
    ok: (t) => ['clinic', 'doctors'].includes(t.amenity) || ['centre', 'clinic', 'doctor'].includes(t.healthcare) },
  { id: 'farmacias', grupo: 'saude', label: 'Farmácias', raio: 2000, max: 4, osm: ['[amenity=pharmacy]'], ok: (t) => t.amenity === 'pharmacy' },
  { id: 'dentistas', grupo: 'saude', label: 'Dentistas', raio: 1500, max: 2, osm: ['[amenity=dentist]'], ok: (t) => t.amenity === 'dentist' },
  { id: 'creches', grupo: 'educacao', label: 'Creches e pré-escolar', raio: 2000, max: 3,
    osm: ['[amenity~"^(kindergarten|childcare)$"]'], ok: (t) => ['kindergarten', 'childcare'].includes(t.amenity) },
  { id: 'escolas_secundarias', grupo: 'educacao', label: 'Escolas secundárias', raio: 3500, max: 3,
    osm: ['[amenity=school]'], ok: (t) => t.amenity === 'school' && re('secund|liceu').test(t.name || '') },
  { id: 'escolas_basicas', grupo: 'educacao', label: 'Escolas básicas', raio: 2500, max: 4,
    osm: ['[amenity=school]'], ok: (t) => t.amenity === 'school' },
  { id: 'universidades', grupo: 'educacao', label: 'Universidades e politécnicos', raio: 5000, max: 4,
    osm: ['[amenity~"^(university|college)$"]'], ok: (t) => ['university', 'college'].includes(t.amenity) },
  { id: 'supermercados', grupo: 'comercio', label: 'Supermercados e mercearias', raio: 2500, max: 6,
    osm: ['[shop~"^(supermarket|convenience|greengrocer)$"]'], ok: (t) => ['supermarket', 'convenience', 'greengrocer'].includes(t.shop) },
  { id: 'centros_comerciais', grupo: 'comercio', label: 'Centros comerciais', raio: 6000, max: 3,
    osm: ['[shop=mall]'], ok: (t) => t.shop === 'mall' },
  { id: 'padarias', grupo: 'comercio', label: 'Padarias e pastelarias', raio: 1000, max: 3,
    osm: ['[shop~"^(bakery|pastry)$"]'], ok: (t) => ['bakery', 'pastry'].includes(t.shop) },
  { id: 'restaurantes', grupo: 'restauracao', label: 'Restaurantes', raio: 1200, max: 8,
    osm: ['[amenity~"^(restaurant|fast_food)$"]'], ok: (t) => ['restaurant', 'fast_food'].includes(t.amenity) },
  { id: 'cafes', grupo: 'restauracao', label: 'Cafés e bares', raio: 800, max: 5,
    osm: ['[amenity~"^(cafe|bar|pub)$"]'], ok: (t) => ['cafe', 'bar', 'pub'].includes(t.amenity) },
  { id: 'metro', grupo: 'transportes', label: 'Metro e Metrobus', raio: 3000, max: 3,
    osm: ['[station~"^(subway|light_rail)$"]', '[public_transport][network~"metro",i]', '[public_transport][operator~"metro",i]', '[highway=bus_stop][name~"metrobus",i]'],
    ok: (t) => ['subway', 'light_rail'].includes(t.station) || (!!(t.public_transport || t.highway === 'bus_stop') && temRede(t, 'metrobus|metro mondego|metropolitano|metro do porto')) },
  { id: 'autocarros', grupo: 'transportes', label: 'Paragens de autocarro', raio: 800, max: 5, semNome: 'Paragem de autocarro',
    osm: ['[highway=bus_stop]', '[amenity=bus_station]'], ok: (t) => t.highway === 'bus_stop' || t.amenity === 'bus_station' },
  { id: 'comboio', grupo: 'transportes', label: 'Comboio', raio: 6000, max: 2,
    osm: ['[railway~"^(station|halt)$"]'], ok: (t) => ['station', 'halt'].includes(t.railway) && !['subway', 'light_rail'].includes(t.station) },
  { id: 'taxis', grupo: 'transportes', label: 'Praças de táxi', raio: 2000, max: 1, semNome: 'Praça de táxis',
    osm: ['[amenity=taxi]'], ok: (t) => t.amenity === 'taxi' },
  { id: 'ginasios', grupo: 'desporto', label: 'Ginásios', raio: 2500, max: 4,
    osm: ['[leisure=fitness_centre]', '[amenity=gym]'], ok: (t) => t.leisure === 'fitness_centre' || t.amenity === 'gym' },
  { id: 'desporto', grupo: 'desporto', label: 'Pavilhões, piscinas e estádios', raio: 4000, max: 3,
    osm: ['[leisure~"^(sports_centre|stadium|sports_hall|swimming_pool)$"][name]'],
    ok: (t) => ['sports_centre', 'stadium', 'sports_hall', 'swimming_pool'].includes(t.leisure) && !privado(t) },
  { id: 'parques', grupo: 'lazer', label: 'Parques, jardins e parques infantis', raio: 2000, max: 4, semNome: 'Parque infantil',
    osm: ['[leisure~"^(park|playground)$"]', '[leisure=garden][name]'],
    ok: (t) => ['park', 'playground', 'garden'].includes(t.leisure) && !privado(t) && (t.leisure !== 'park' || !!t.name) },
  { id: 'cultura', grupo: 'lazer', label: 'Museus, cinemas, teatros e bibliotecas', raio: 4000, max: 4,
    osm: ['[tourism=museum]', '[amenity~"^(library|cinema|theatre|arts_centre)$"]'],
    ok: (t) => t.tourism === 'museum' || ['library', 'cinema', 'theatre', 'arts_centre'].includes(t.amenity) },
  { id: 'bancos', grupo: 'servicos', label: 'Bancos e multibanco', raio: 1500, max: 3, semNome: 'Multibanco',
    osm: ['[amenity~"^(bank|atm)$"]'], ok: (t) => ['bank', 'atm'].includes(t.amenity) },
  { id: 'correios', grupo: 'servicos', label: 'Correios', raio: 2500, max: 1, osm: ['[amenity=post_office]'], ok: (t) => t.amenity === 'post_office' },
  { id: 'seguranca', grupo: 'servicos', label: 'Polícia e bombeiros', raio: 3000, max: 2,
    osm: ['[amenity~"^(police|fire_station)$"]'], ok: (t) => ['police', 'fire_station'].includes(t.amenity) },
  { id: 'camara', grupo: 'servicos', label: 'Câmara e juntas de freguesia', raio: 5000, max: 2, osm: ['[amenity=townhall]'], ok: (t) => t.amenity === 'townhall' },
  { id: 'combustivel', grupo: 'servicos', label: 'Postos de combustível', raio: 3000, max: 2, osm: ['[amenity=fuel]'], ok: (t) => t.amenity === 'fuel' },
  { id: 'estacionamento', grupo: 'servicos', label: 'Parques de estacionamento públicos', raio: 800, max: 3, semNome: 'Parque de estacionamento',
    osm: ['[amenity=parking]'], ok: (t) => t.amenity === 'parking' && !privado(t) },
]

// ── Serviços gratuitos do OpenStreetMap (sem chave nem faturação) ──
// Nominatim (moradas), Overpass (locais) e OSRM da FOSSGIS (tempos a pé e de
// carro). São servidores públicos, às vezes sobrecarregados: a pesquisa corre
// no browser (sem o limite de tempo da Edge Function) e usa vários espelhos.
// O servidor só guarda o resultado (guardarPesquisa).
const EM_BROWSER = typeof window !== 'undefined'
const UA = EM_BROWSER ? {} : { 'User-Agent': 'SomniumCRM/1.0 (analise-localizacao)' }
const OVERPASS = [
  'https://overpass-api.de/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
]
const OSRM = {
  pe: 'https://routing.openstreetmap.de/routed-foot',
  bicicleta: 'https://routing.openstreetmap.de/routed-bike',
  carro: 'https://routing.openstreetmap.de/routed-car',
}
export const MEIOS = { pe: 'a pé', bicicleta: 'de bicicleta', carro: 'de carro' }
// Estimativa quando o OSRM não responde: linha reta × desvio típico ÷ velocidade média urbana.
const ESTIMATIVA = { pe: { desvio: 1.3, kmh: 4.8 }, bicicleta: { desvio: 1.3, kmh: 14 }, carro: { desvio: 1.4, kmh: 28 } }
function estimar(perfil, linhaRetaM) {
  const e = ESTIMATIVA[perfil], m = Math.round(linhaRetaM * e.desvio)
  return { m, s: Math.round((m / 1000 / e.kmh) * 3600), estimado: true }
}

// ── Utilitários ──────────────────────────────────────────────────

export function linhaReta(a, b) {
  const R = 6371000, rad = (x) => (x * Math.PI) / 180
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2
  return Math.round(2 * R * Math.asin(Math.sqrt(h)))
}

const novoId = () => (globalThis.crypto?.randomUUID?.() || String(Date.now() + Math.random()))
const esperar = (ms) => new Promise((r) => setTimeout(r, ms))

async function fetchComPrazo(url, opts = {}, ms = 30000) {
  const ctl = new AbortController()
  const t = setTimeout(() => ctl.abort(), ms)
  try { return await fetch(url, { ...opts, signal: ctl.signal }) } finally { clearTimeout(t) }
}

function fmtDist(m) {
  if (m == null) return '—'
  return m < 1000 ? `${m} m` : `${(m / 1000).toFixed(1).replace('.', ',')} km`
}
function fmtMin(s) {
  if (s == null) return '—'
  const m = Math.max(1, Math.round(s / 60))
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}`
}

// ── Morada → coordenadas (Nominatim) ─────────────────────────────

async function geocodificar(texto) {
  // Tenta a morada completa e, se falhar, versões mais curtas (sem n.º, só código postal/localidade).
  const semNumero = texto.replace(/\(.*?\)/g, '').replace(/\b(n\.?º|nº|n\.)\s*\d+\w*/gi, '').replace(/\s\d{1,4}[A-Za-z]?(?=,|$)/g, '')
  const cp = texto.match(/\d{4}-\d{3}\s*[^,]*/)?.[0]
  const tentativas = [...new Set([texto, semNumero, cp].map((s) => s?.replace(/\s+/g, ' ').trim()).filter(Boolean))]
  for (const q of tentativas) {
    const url = new URL('https://nominatim.openstreetmap.org/search')
    url.searchParams.set('q', q)
    url.searchParams.set('format', 'json')
    url.searchParams.set('limit', '1')
    url.searchParams.set('countrycodes', 'pt')
    url.searchParams.set('accept-language', 'pt')
    const resp = await fetchComPrazo(url.toString(), { headers: UA }, 15000).catch(() => null)
    const j = resp?.ok ? await resp.json().catch(() => []) : []
    if (j[0]) return { lat: Number(j[0].lat), lng: Number(j[0].lon), resolvida: j[0].display_name, fonte: 'nominatim' }
    await esperar(1100) // política do Nominatim: 1 pedido por segundo
  }
  throw new Error('Não foi possível localizar a morada no OpenStreetMap. Escreve a rua, o código postal e a localidade.')
}

// ── Locais à volta (Overpass) ────────────────────────────────────

// Retângulo à volta do centro (o filtro por raio exato faz-se depois, em JS):
// com bbox o Overpass usa o índice espacial e responde muito mais depressa do que com `around`.
function bbox(c, raio) {
  const dLat = raio / 111320, dLng = raio / (111320 * Math.cos((c.lat * Math.PI) / 180))
  return [c.lat - dLat, c.lng - dLng, c.lat + dLat, c.lng + dLng].map((v) => v.toFixed(5)).join(',')
}

// Um só pedido, enviado a dois espelhos em paralelo; fica a primeira resposta válida.
async function overpass(centro, aoTentar) {
  const partes = []
  for (const cat of CATEGORIAS) for (const f of cat.osm) partes.push(`nwr${f}(${bbox(centro, cat.raio)});`)
  const corpo = 'data=' + encodeURIComponent(`[out:json][timeout:60];(${partes.join('')});out center tags;`)
  const erros = []
  const pedir = async (url, ctl) => {
    const t = setTimeout(() => ctl.abort(), 70000)
    try {
      const resp = await fetch(url, { method: 'POST', headers: { ...UA, 'Content-Type': 'application/x-www-form-urlencoded' }, body: corpo, signal: ctl.signal })
      const txt = await resp.text()
      if (resp.ok && txt.trim().startsWith('{')) return JSON.parse(txt).elements || []
      throw new Error(`HTTP ${resp.status}`)
    } catch (e) {
      erros.push(`${new URL(url).host}: ${e.name === 'AbortError' ? 'sem resposta' : e.message}`)
      throw e
    } finally { clearTimeout(t) }
  }
  for (let ronda = 0; ronda < 4; ronda++) {
    const urls = [OVERPASS[(ronda * 2) % OVERPASS.length], OVERPASS[(ronda * 2 + 1) % OVERPASS.length]]
    const ctls = urls.map(() => new AbortController())
    try {
      const els = await Promise.any(urls.map((u, i) => pedir(u, ctls[i])))
      ctls.forEach((c) => c.abort())
      return els
    } catch { /* os dois falharam: espera e tenta outros espelhos */ }
    aoTentar?.(ronda + 2)
    await esperar(3000 * (ronda + 1))
  }
  throw new Error(`Os servidores do OpenStreetMap estão ocupados. Tenta de novo daqui a uns minutos. (${erros.slice(-2).join('; ')})`)
}

function moradaDe(t) {
  const rua = [t['addr:street'], t['addr:housenumber']].filter(Boolean).join(' ')
  return [rua, t['addr:city'] || t['addr:place']].filter(Boolean).join(', ')
}

// ── Tempos a pé e de carro (OSRM) ────────────────────────────────

async function tempos(centro, pois, perfil) {
  const res = new Map()
  for (let i = 0; i < pois.length; i += 50) {
    const lote = pois.slice(i, i + 50)
    const coords = [centro, ...lote].map((p) => `${p.lng.toFixed(6)},${p.lat.toFixed(6)}`).join(';')
    let j = null
    for (let tentativa = 0; tentativa < 3 && j?.code !== 'Ok'; tentativa++) {
      if (tentativa) await esperar(2000 * tentativa)
      const resp = await fetchComPrazo(`${OSRM[perfil]}/table/v1/driving/${coords}?sources=0&annotations=duration,distance`, { headers: UA }, 30000).catch(() => null)
      j = resp ? await resp.json().catch(() => null) : null
    }
    if (j?.code !== 'Ok') continue // fica a estimativa para este lote
    lote.forEach((p, k) => {
      const s = j.durations?.[0]?.[k + 1], m = j.distances?.[0]?.[k + 1]
      if (s != null) res.set(p.id, { m: Math.round(m), s: Math.round(s) })
    })
  }
  return res
}

// ── Pesquisa completa ────────────────────────────────────────────

// aoProgresso({ passo, total, texto }) para a barra de progresso do painel.
export async function pesquisarPOIs({ origemTexto, centro: centroDado, aoProgresso }) {
  const total = 3
  const progresso = (passo, texto) => aoProgresso?.({ passo, total, texto })
  progresso(0, 'A localizar a morada…')
  let origem
  if (centroDado?.lat && centroDado?.lng) origem = { lat: Number(centroDado.lat), lng: Number(centroDado.lng), resolvida: origemTexto || '', fonte: 'coordenadas' }
  else {
    if (!origemTexto?.trim()) throw new Error('Imóvel sem morada nem coordenadas')
    origem = await geocodificar(origemTexto)
  }
  const centro = { lat: origem.lat, lng: origem.lng }
  progresso(1, 'A procurar saúde, educação, comércio, restauração, transportes, desporto, lazer e serviços…')
  const elementos = await overpass(centro, (n) => progresso(1, `Servidores do OpenStreetMap ocupados; tentativa ${n}…`))

  // Cada local vai para a primeira categoria que o aceita.
  const candidatos = new Map(CATEGORIAS.map((c) => [c.id, []]))
  const vistos = new Set()
  for (const el of elementos) {
    const t = el.tags || {}
    const lat = el.lat ?? el.center?.lat, lng = el.lon ?? el.center?.lon
    const id = `osm:${el.type}/${el.id}`
    if (lat == null || vistos.has(id) || t.disused || t['disused:amenity']) continue
    const cat = CATEGORIAS.find((c) => c.ok(t))
    if (!cat) continue
    const nome = t.name || t.brand || cat.semNome
    if (!nome) continue
    const dist = linhaReta(centro, { lat, lng })
    if (dist > cat.raio) continue
    vistos.add(id)
    candidatos.get(cat.id).push({
      id, nome, endereco: moradaDe(t), lat, lng, tipo: t.amenity || t.shop || t.leisure || t.highway || t.railway || t.tourism || t.healthcare || '',
      linhas: t.route_ref ? String(t.route_ref).replace(/\s*[;,]\s*/g, ', ') : null,
      rede: t.network || t.operator || null, linha_reta_m: dist,
    })
  }

  // Os mais próximos de cada categoria, sem repetir o mesmo nome (ex.: paragem nos dois sentidos).
  const pois = []
  for (const cat of CATEGORIAS) {
    const nomes = new Set()
    const lista = candidatos.get(cat.id).sort((a, b) => a.linha_reta_m - b.linha_reta_m)
    for (const p of lista) {
      const chave = p.nome.toLowerCase()
      if (p.nome !== cat.semNome && nomes.has(chave)) continue
      nomes.add(chave)
      pois.push({ ...p, grupo: cat.grupo, categoria: cat.id, categoria_label: cat.label, rating: null, avaliacoes: null, carro: null, pe: null, estado: 'proposto' })
      if (pois.filter((x) => x.categoria === cat.id).length >= cat.max) break
    }
  }

  // Tempos sempre preenchidos: rota real (OSRM) ou, se o serviço falhar, estimativa marcada.
  const avisos = []
  progresso(2, 'A calcular os tempos a pé, de bicicleta e de carro…')
  const perfis = Object.keys(MEIOS)
  const mapas = await Promise.all(perfis.map((perfil) => tempos(centro, pois, perfil).catch(() => new Map())))
  for (const [i, perfil] of perfis.entries()) {
    const t = mapas[i]
    let estimados = 0
    for (const p of pois) {
      p[perfil] = t.get(p.id) || estimar(perfil, p.linha_reta_m)
      if (p[perfil].estimado) estimados++
    }
    if (estimados) avisos.push(`${estimados} tempos ${MEIOS[perfil]} estimados pela distância (serviço de rotas indisponível).`)
  }

  // Transporte público: paragem de autocarro/Metrobus mais próxima do imóvel (não há rotas de TP gratuitas).
  const paragens = pois.filter((p) => p.categoria === 'autocarros' || p.categoria === 'metro').sort((a, b) => a.linha_reta_m - b.linha_reta_m)
  const tp = paragens[0] ? { nome: paragens[0].nome, linhas: paragens[0].linhas, rede: paragens[0].rede, categoria: paragens[0].categoria_label, pe: paragens[0].pe, linha_reta_m: paragens[0].linha_reta_m } : null

  return {
    origem: { texto: origemTexto || '', resolvida: origem.resolvida, lat: origem.lat, lng: origem.lng, fonte: origem.fonte },
    fonte_dados: 'OpenStreetMap', pesquisado_em: new Date().toISOString(), pois, avisos, transporte_publico: tp,
  }
}

// ── Persistência (coluna imoveis.analise_localizacao_ia) ─────────

let _coluna = false
export async function ensureColunaAnaliseLocalizacao(pool) {
  if (_coluna) return
  await pool.query('ALTER TABLE imoveis ADD COLUMN IF NOT EXISTS analise_localizacao_ia JSONB')
  _coluna = true
}

export async function lerAnaliseLocalizacao(pool, imovelId) {
  await ensureColunaAnaliseLocalizacao(pool)
  const { rows: [r] } = await pool.query('SELECT analise_localizacao_ia FROM imoveis WHERE id = $1', [imovelId])
  return r?.analise_localizacao_ia || null
}

async function gravar(pool, imovelId, dados) {
  await pool.query('UPDATE imoveis SET analise_localizacao_ia = $2::jsonb WHERE id = $1', [imovelId, JSON.stringify(dados)])
  return dados
}

// Guarda a pesquisa feita no browser; mantém a decisão (validado/excluído) dos pontos já revistos.
const txt = (v, n = 300) => (v == null ? null : String(v).slice(0, n))
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : null)
const tempo = (t) => (t && num(t.s) != null ? { m: num(t.m), s: num(t.s), ...(t.estimado ? { estimado: true } : {}) } : null)

export async function guardarPesquisa(pool, imovelId, r) {
  await ensureColunaAnaliseLocalizacao(pool)
  const { rows: [im] } = await pool.query('SELECT analise_localizacao_ia FROM imoveis WHERE id = $1', [imovelId])
  if (!im) throw new Error('Imóvel não encontrado')
  if (!r || !Array.isArray(r.pois) || num(r.origem?.lat) == null) throw new Error('Resultado da pesquisa inválido')
  const cats = new Map(CATEGORIAS.map((c) => [c.id, c]))
  const pois = r.pois.slice(0, 300).filter((p) => cats.has(p.categoria) && p.id).map((p) => ({
    id: txt(p.id, 80), nome: txt(p.nome, 150), endereco: txt(p.endereco), lat: num(p.lat), lng: num(p.lng),
    grupo: cats.get(p.categoria).grupo, categoria: p.categoria, categoria_label: cats.get(p.categoria).label,
    tipo: txt(p.tipo, 40), linhas: txt(p.linhas, 120), rede: txt(p.rede, 80), rating: null, avaliacoes: null,
    linha_reta_m: num(p.linha_reta_m), pe: tempo(p.pe), bicicleta: tempo(p.bicicleta), carro: tempo(p.carro), estado: 'proposto',
  }))
  const anterior = im.analise_localizacao_ia || {}
  const decisoes = new Map((anterior.pois || []).filter((p) => p.estado !== 'proposto').map((p) => [p.id, p.estado]))
  for (const p of pois) if (decisoes.has(p.id)) p.estado = decisoes.get(p.id)
  return gravar(pool, imovelId, {
    ...anterior, versao: 1, fonte_dados: 'OpenStreetMap', pesquisado_em: new Date().toISOString(), pois,
    origem: { texto: txt(r.origem.texto), resolvida: txt(r.origem.resolvida), lat: num(r.origem.lat), lng: num(r.origem.lng), fonte: txt(r.origem.fonte, 20) },
    avisos: (r.avisos || []).slice(0, 5).map((a) => txt(a)),
    transporte_publico: r.transporte_publico ? {
      nome: txt(r.transporte_publico.nome, 150), linhas: txt(r.transporte_publico.linhas, 120), rede: txt(r.transporte_publico.rede, 80),
      categoria: txt(r.transporte_publico.categoria, 60), pe: tempo(r.transporte_publico.pe), linha_reta_m: num(r.transporte_publico.linha_reta_m),
    } : null,
  })
}

// Validar/excluir pontos de interesse e itens da análise; editar o texto dos itens.
export async function atualizarDecisoes(pool, imovelId, { pois = {}, itens = {} }) {
  const dados = await lerAnaliseLocalizacao(pool, imovelId)
  if (!dados) throw new Error('Ainda não há análise de localização para este imóvel')
  const ok = new Set(['proposto', 'validado', 'excluido'])
  for (const p of dados.pois || []) if (ok.has(pois[p.id])) p.estado = pois[p.id]
  if (dados.analise) {
    for (const lista of ['pontos_fortes', 'pontos_fracos']) {
      for (const it of dados.analise[lista] || []) {
        const m = itens[it.id]
        if (!m) continue
        if (ok.has(m.estado)) it.estado = m.estado
        for (const c of ['texto', 'uso_venda', 'resposta']) if (typeof m[c] === 'string') it[c] = m[c]
      }
    }
  }
  return gravar(pool, imovelId, dados)
}

// ── Prompt e aplicador da fila IA ────────────────────────────────

export async function construirPedidoAnalise(pool, imovelId) {
  const dados = await lerAnaliseLocalizacao(pool, imovelId)
  const validados = (dados?.pois || []).filter((p) => p.estado === 'validado')
  if (validados.length === 0) throw new Error('Aprova pelo menos um ponto de interesse antes de pedir a análise')
  const { rows: [im] } = await pool.query(
    `SELECT nome, tipologia, morada, zona, freguesia, concelho, modelo_negocio, area_bruta, area_util,
            numero_pisos_predio, tem_elevador, ano_construcao, pontos_fortes, pontos_fracos
     FROM imoveis WHERE id = $1`, [imovelId])

  const porCategoria = CATEGORIAS.map((cat) => {
    const ps = validados.filter((p) => p.categoria === cat.id).sort((a, b) => a.linha_reta_m - b.linha_reta_m)
    if (ps.length === 0) return `- ${GRUPOS[cat.grupo]} / ${cat.label}: nenhum aprovado num raio de ${fmtDist(cat.raio)}.`
    return `- ${GRUPOS[cat.grupo]} / ${cat.label}:\n` + ps.map((p) =>
      `    • ${p.nome}${p.endereco ? ` (${p.endereco})` : ''}${p.linhas ? ` [linhas ${p.linhas}${p.rede ? `, ${p.rede}` : ''}]` : ''}: ${fmtDist(p.linha_reta_m)} em linha reta; ${Object.entries(MEIOS).map(([k, l]) => `${l} ${p[k]?.estimado ? '≈' : ''}${fmtMin(p[k]?.s)} (${fmtDist(p[k]?.m)})`).join('; ')}${p.rating ? `; ${String(p.rating).replace('.', ',')}★ (${p.avaliacoes || 0} avaliações)` : ''}`).join('\n')
  }).join('\n')

  const ficha = [
    ['Nome', im?.nome], ['Tipologia', im?.tipologia], ['Morada', dados.origem?.resolvida || im?.morada],
    ['Freguesia', im?.freguesia], ['Concelho', im?.concelho], ['Modelo de negócio', im?.modelo_negocio],
    ['Área bruta (m²)', im?.area_bruta], ['Área útil (m²)', im?.area_util], ['N.º de pisos do prédio', im?.numero_pisos_predio],
    ['Elevador', im?.tem_elevador], ['Ano de construção', im?.ano_construcao],
    ['Pontos fortes já registados na ficha', im?.pontos_fortes], ['Pontos fracos já registados na ficha', im?.pontos_fracos],
  ].filter(([, v]) => v != null && String(v).trim() !== '').map(([k, v]) => `${k}: ${v}`).join('\n')

  const prompt = `És analista de investimento imobiliário da Somnium Properties, em Portugal. Faz a análise da localização deste imóvel na perspetiva de quem o vai comprar para viver, no mesmo formato da secção «Pontos fortes e fracos» do Plano Estratégico de Venda (PEV).

FICHA DO IMÓVEL
${ficha}

PONTOS DE INTERESSE APROVADOS PELA EQUIPA (distâncias e tempos a pé, de bicicleta e de carro a partir do imóvel; «≈» = estimativa)
${porCategoria}
${dados.transporte_publico ? `\nTRANSPORTE PÚBLICO: a paragem mais próxima é ${dados.transporte_publico.nome} (${dados.transporte_publico.categoria}${dados.transporte_publico.linhas ? `, linhas ${dados.transporte_publico.linhas}` : ''}), a ${fmtMin(dados.transporte_publico.pe?.s)} a pé.` : ''}

O QUE PRECISO
1. Pontos fortes da localização. Para cada um, indica como se usa na venda (anúncio, vídeo, visitas).
2. Pontos fracos da localização, incluindo a falta de serviços relevantes por perto. Para cada um, indica como se responde ao comprador.
3. Um resumo de duas ou três frases sobre a localização e o perfil de comprador a que mais se adequa.

REGRAS
- Português de Portugal, com o Acordo Ortográfico de 1990 (ex.: «ótimo», «direção», «fatura»).
- Frases completas, profissionais e humanizadas. Nada de «rótulo: fragmento».
- Usa nomes e tempos concretos, escolhendo o meio que faz sentido (ex.: «Lidl a 4 minutos a pé», «hospital a 6 minutos de carro», «universidade a 8 minutos de bicicleta»). Arredonda os tempos ao minuto.
- Baseia-te apenas nos dados acima. Não inventes linhas de autocarro, obras, segurança ou valorização da zona; se algo tiver de ser confirmado no local, diz isso no próprio ponto.
- Agrupa o que for do mesmo tipo (ex.: um ponto para «comércio de proximidade») em vez de repetir um ponto por estabelecimento.
- Entre 4 e 8 pontos fortes e entre 2 e 5 pontos fracos, por ordem de importância para o comprador.

Devolve APENAS este JSON, sem texto à volta:
{
  "resumo": "…",
  "pontos_fortes": [ { "texto": "ponto forte numa frase", "uso_venda": "como se usa na venda" } ],
  "pontos_fracos": [ { "texto": "ponto fraco numa frase", "resposta": "como se responde" } ]
}`
  return { prompt, total_validados: validados.length }
}

export async function marcarAnalisePedida(pool, imovelId) {
  const dados = await lerAnaliseLocalizacao(pool, imovelId)
  dados.analise_pedida_em = new Date().toISOString()
  return gravar(pool, imovelId, dados)
}

export async function aplicarAnaliseLocalizacao(pool, pedido, texto) {
  const j = jsonDaResposta(texto)
  const dados = (await lerAnaliseLocalizacao(pool, pedido.ref_id)) || {}
  const limpar = (s) => String(s || '').trim()
  dados.analise = {
    gerado_em: new Date().toISOString(),
    modelo: pedido.modelo || null,
    resumo: limpar(j.resumo),
    pontos_fortes: (j.pontos_fortes || []).filter((p) => limpar(p.texto)).map((p) => ({ id: novoId(), texto: limpar(p.texto), uso_venda: limpar(p.uso_venda), estado: 'proposto' })),
    pontos_fracos: (j.pontos_fracos || []).filter((p) => limpar(p.texto)).map((p) => ({ id: novoId(), texto: limpar(p.texto), resposta: limpar(p.resposta), estado: 'proposto' })),
  }
  await gravar(pool, pedido.ref_id, dados)
  return { pontos_fortes: dados.analise.pontos_fortes.length, pontos_fracos: dados.analise.pontos_fracos.length }
}

// Acrescenta os pontos validados aos campos da ficha (um por linha, sem repetir).
export async function aplicarAFicha(pool, imovelId) {
  const dados = await lerAnaliseLocalizacao(pool, imovelId)
  if (!dados?.analise) throw new Error('Ainda não há análise IA para aplicar')
  const { rows: [im] } = await pool.query('SELECT pontos_fortes, pontos_fracos FROM imoveis WHERE id = $1', [imovelId])
  const juntar = (atual, novos) => {
    const linhas = String(atual || '').split('\n').map((l) => l.trim()).filter(Boolean)
    const existentes = new Set(linhas.map((l) => l.toLowerCase()))
    let n = 0
    for (const t of novos) if (!existentes.has(t.toLowerCase())) { linhas.push(t); existentes.add(t.toLowerCase()); n++ }
    return { texto: linhas.join('\n'), n }
  }
  const val = (l) => (dados.analise[l] || []).filter((p) => p.estado === 'validado').map((p) => p.texto)
  const fortes = juntar(im?.pontos_fortes, val('pontos_fortes'))
  const fracos = juntar(im?.pontos_fracos, val('pontos_fracos'))
  if (fortes.n + fracos.n === 0) throw new Error('Não há pontos aprovados novos para acrescentar à ficha')
  await pool.query('UPDATE imoveis SET pontos_fortes = $2, pontos_fracos = $3 WHERE id = $1', [imovelId, fortes.texto, fracos.texto])
  dados.aplicado_em = new Date().toISOString()
  await gravar(pool, imovelId, dados)
  return { acrescentados_fortes: fortes.n, acrescentados_fracos: fracos.n }
}
