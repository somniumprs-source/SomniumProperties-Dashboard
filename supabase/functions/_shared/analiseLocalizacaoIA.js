// @ts-nocheck
/**
 * Análise IA da localização de um imóvel (botão na aba Localização).
 *
 * 1. Procura no Google Places tudo o que existe à volta do imóvel (saúde,
 *    educação, comércio, restauração, transportes, desporto, lazer, serviços),
 *    com a distância em linha reta e os tempos de carro e a pé.
 * 2. Os pontos de interesse ficam "propostos": a equipa valida ou exclui cada um.
 * 3. Com os validados, a análise (pontos fortes e fracos, na perspetiva do
 *    comprador, como no PEV) é pedida à fila IA (Claude no Mac, plano Claude).
 * 4. Cada ponto da análise também é validado ou excluído; os validados são
 *    acrescentados aos campos Pontos fortes / Pontos fracos da ficha.
 *
 * Módulo único em JS simples, importado pela Edge Function (crm/index.ts) e
 * pelo Express de dev (src/db/routes.js). A chave do Google entra por parâmetro.
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
export const CATEGORIAS = [
  { id: 'hospitais', grupo: 'saude', label: 'Hospitais', tipos: ['hospital'], raio: 6000, max: 3 },
  { id: 'clinicas', grupo: 'saude', label: 'Centros de saúde e clínicas', tipos: ['doctor'], raio: 2500, max: 4 },
  { id: 'farmacias', grupo: 'saude', label: 'Farmácias', tipos: ['pharmacy'], raio: 2000, max: 4 },
  { id: 'dentistas', grupo: 'saude', label: 'Dentistas', tipos: ['dentist'], raio: 1500, max: 2 },
  { id: 'creches', grupo: 'educacao', label: 'Creches e pré-escolar', tipos: ['preschool'], raio: 2000, max: 3 },
  { id: 'escolas_basicas', grupo: 'educacao', label: 'Escolas básicas', tipos: ['primary_school'], raio: 2500, max: 4 },
  { id: 'escolas_secundarias', grupo: 'educacao', label: 'Escolas secundárias', tipos: ['secondary_school'], raio: 3500, max: 3 },
  { id: 'universidades', grupo: 'educacao', label: 'Universidades', tipos: ['university'], raio: 5000, max: 4 },
  { id: 'supermercados', grupo: 'comercio', label: 'Supermercados e mercearias', tipos: ['supermarket', 'grocery_store'], raio: 2500, max: 6 },
  { id: 'centros_comerciais', grupo: 'comercio', label: 'Centros comerciais', tipos: ['shopping_mall'], raio: 6000, max: 3 },
  { id: 'padarias', grupo: 'comercio', label: 'Padarias e pastelarias', tipos: ['bakery'], raio: 1000, max: 3 },
  { id: 'restaurantes', grupo: 'restauracao', label: 'Restaurantes', tipos: ['restaurant'], raio: 1200, max: 8 },
  { id: 'cafes', grupo: 'restauracao', label: 'Cafés e bares', tipos: ['cafe', 'bar'], raio: 800, max: 5 },
  { id: 'autocarros', grupo: 'transportes', label: 'Paragens de autocarro', tipos: ['bus_stop', 'bus_station'], raio: 800, max: 5 },
  { id: 'metro', grupo: 'transportes', label: 'Metro e Metrobus', tipos: ['subway_station', 'light_rail_station'], textos: ['Metrobus', 'estação de metro'], raio: 3000, max: 3 },
  { id: 'comboio', grupo: 'transportes', label: 'Comboio', tipos: ['train_station'], raio: 6000, max: 2 },
  { id: 'taxis', grupo: 'transportes', label: 'Praças de táxi', tipos: ['taxi_stand'], raio: 2000, max: 1 },
  { id: 'ginasios', grupo: 'desporto', label: 'Ginásios', tipos: ['gym', 'fitness_center'], raio: 2500, max: 4 },
  { id: 'desporto', grupo: 'desporto', label: 'Pavilhões, piscinas e estádios', tipos: ['sports_complex', 'swimming_pool', 'stadium'], raio: 4000, max: 3 },
  { id: 'parques', grupo: 'lazer', label: 'Parques, jardins e parques infantis', tipos: ['park', 'playground'], raio: 2000, max: 4 },
  { id: 'cultura', grupo: 'lazer', label: 'Museus, cinemas e bibliotecas', tipos: ['museum', 'movie_theater', 'library'], raio: 4000, max: 4 },
  { id: 'bancos', grupo: 'servicos', label: 'Bancos e multibanco', tipos: ['bank', 'atm'], raio: 1500, max: 3 },
  { id: 'correios', grupo: 'servicos', label: 'Correios', tipos: ['post_office'], raio: 2500, max: 1 },
  { id: 'seguranca', grupo: 'servicos', label: 'Polícia e bombeiros', tipos: ['police', 'fire_station'], raio: 3000, max: 2 },
  { id: 'camara', grupo: 'servicos', label: 'Câmara e juntas', tipos: ['city_hall'], raio: 5000, max: 1 },
  { id: 'combustivel', grupo: 'servicos', label: 'Postos de combustível', tipos: ['gas_station'], raio: 3000, max: 2 },
  { id: 'estacionamento', grupo: 'servicos', label: 'Parques de estacionamento', tipos: ['parking'], raio: 800, max: 3 },
]

// Places API antiga (fallback se a nova não estiver ativa na chave): um tipo por pedido.
const TIPO_LEGADO = {
  preschool: 'school', grocery_store: 'grocery_or_supermarket', bus_stop: 'transit_station',
  fitness_center: 'gym', sports_complex: 'stadium', swimming_pool: null, playground: 'park',
}

const CAMPOS_PLACES = 'places.id,places.displayName,places.formattedAddress,places.shortFormattedAddress,places.location,places.primaryType,places.rating,places.userRatingCount,places.businessStatus'

// ── Utilitários ──────────────────────────────────────────────────

export function linhaReta(a, b) {
  const R = 6371000, rad = (x) => (x * Math.PI) / 180
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2
  return Math.round(2 * R * Math.asin(Math.sqrt(h)))
}

const novoId = () => (globalThis.crypto?.randomUUID?.() || String(Date.now() + Math.random()))

function fmtDist(m) {
  if (m == null) return '—'
  return m < 1000 ? `${m} m` : `${(m / 1000).toFixed(1).replace('.', ',')} km`
}
function fmtMin(s) {
  if (s == null) return '—'
  const m = Math.max(1, Math.round(s / 60))
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}`
}

// ── Google ───────────────────────────────────────────────────────

async function geocodificar(texto, apiKey) {
  const url = new URL('https://maps.googleapis.com/maps/api/geocode/json')
  url.searchParams.set('address', texto)
  url.searchParams.set('region', 'pt')
  url.searchParams.set('language', 'pt')
  url.searchParams.set('key', apiKey)
  const j = await (await fetch(url.toString())).json()
  if (j.status === 'OK' && j.results?.[0]) {
    const r = j.results[0]
    return { lat: r.geometry.location.lat, lng: r.geometry.location.lng, resolvida: r.formatted_address, fonte: 'geocoding' }
  }
  // Sem Geocoding ativo: tenta o Places (Text Search).
  const resp = await fetch('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': apiKey, 'X-Goog-FieldMask': 'places.formattedAddress,places.location' },
    body: JSON.stringify({ textQuery: texto, languageCode: 'pt', regionCode: 'PT', maxResultCount: 1 }),
  })
  const p = await resp.json().catch(() => ({}))
  const pl = p.places?.[0]
  if (pl?.location) return { lat: pl.location.latitude, lng: pl.location.longitude, resolvida: pl.formattedAddress, fonte: 'places' }
  throw new Error(`Não foi possível localizar a morada (Geocoding: ${j.status}${j.error_message ? ' — ' + j.error_message : ''})`)
}

class PlacesNovaIndisponivel extends Error {}

async function placesNearbyNova({ centro, tipos, raio, apiKey }) {
  const resp = await fetch('https://places.googleapis.com/v1/places:searchNearby', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': apiKey, 'X-Goog-FieldMask': CAMPOS_PLACES },
    body: JSON.stringify({
      includedTypes: tipos,
      maxResultCount: 20,
      rankPreference: 'DISTANCE',
      languageCode: 'pt',
      regionCode: 'PT',
      locationRestriction: { circle: { center: { latitude: centro.lat, longitude: centro.lng }, radius: raio } },
    }),
  })
  const j = await resp.json().catch(() => ({}))
  if (!resp.ok) {
    const msg = j?.error?.message || `HTTP ${resp.status}`
    if (resp.status === 403 || j?.error?.status === 'PERMISSION_DENIED') throw new PlacesNovaIndisponivel(msg)
    // Tipo não suportado: repete tipo a tipo e ignora os inválidos.
    if (resp.status === 400 && tipos.length > 1) {
      const out = []
      for (const t of tipos) out.push(...(await placesNearbyNova({ centro, tipos: [t], raio, apiKey }).catch(() => [])))
      return out
    }
    throw new Error(`Places: ${msg}`)
  }
  return (j.places || []).map((p) => ({
    id: p.id,
    nome: p.displayName?.text || '',
    endereco: p.shortFormattedAddress || p.formattedAddress || '',
    lat: p.location?.latitude, lng: p.location?.longitude,
    tipo: p.primaryType || tipos[0],
    rating: p.rating ?? null, avaliacoes: p.userRatingCount ?? null,
    fechado: p.businessStatus && p.businessStatus !== 'OPERATIONAL',
  }))
}

async function placesTextoNova({ centro, texto, raio, apiKey }) {
  const resp = await fetch('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': apiKey, 'X-Goog-FieldMask': CAMPOS_PLACES },
    body: JSON.stringify({
      textQuery: texto, languageCode: 'pt', regionCode: 'PT', maxResultCount: 10,
      locationBias: { circle: { center: { latitude: centro.lat, longitude: centro.lng }, radius: raio } },
    }),
  })
  const j = await resp.json().catch(() => ({}))
  if (!resp.ok) return []
  return (j.places || []).map((p) => ({
    id: p.id, nome: p.displayName?.text || '', endereco: p.shortFormattedAddress || p.formattedAddress || '',
    lat: p.location?.latitude, lng: p.location?.longitude, tipo: p.primaryType || 'transit_station',
    rating: p.rating ?? null, avaliacoes: p.userRatingCount ?? null,
    fechado: p.businessStatus && p.businessStatus !== 'OPERATIONAL',
  }))
}

async function placesNearbyLegado({ centro, tipos, apiKey }) {
  const out = []
  for (const t of tipos) {
    const tipo = t in TIPO_LEGADO ? TIPO_LEGADO[t] : t
    if (!tipo) continue
    const url = new URL('https://maps.googleapis.com/maps/api/place/nearbysearch/json')
    url.searchParams.set('location', `${centro.lat},${centro.lng}`)
    url.searchParams.set('rankby', 'distance')
    url.searchParams.set('type', tipo)
    url.searchParams.set('language', 'pt')
    url.searchParams.set('key', apiKey)
    const j = await (await fetch(url.toString())).json()
    if (j.status === 'REQUEST_DENIED') throw new Error(`Places API não está ativa na chave do Google: ${j.error_message || j.status}`)
    for (const p of j.results || []) {
      out.push({
        id: p.place_id, nome: p.name || '', endereco: p.vicinity || '',
        lat: p.geometry?.location?.lat, lng: p.geometry?.location?.lng, tipo,
        rating: p.rating ?? null, avaliacoes: p.user_ratings_total ?? null,
        fechado: p.business_status && p.business_status !== 'OPERATIONAL',
      })
    }
  }
  return out
}

// Tempos de carro e a pé (Distance Matrix, 25 destinos por pedido).
async function tempos({ centro, pois, modo, apiKey }) {
  const res = new Map()
  for (let i = 0; i < pois.length; i += 25) {
    const lote = pois.slice(i, i + 25)
    const url = new URL('https://maps.googleapis.com/maps/api/distancematrix/json')
    url.searchParams.set('origins', `${centro.lat},${centro.lng}`)
    url.searchParams.set('destinations', lote.map((p) => `${p.lat},${p.lng}`).join('|'))
    url.searchParams.set('mode', modo)
    url.searchParams.set('region', 'pt')
    url.searchParams.set('key', apiKey)
    const j = await (await fetch(url.toString())).json()
    if (j.status !== 'OK') throw new Error(`Distance Matrix (${modo}): ${j.status}`)
    ;(j.rows?.[0]?.elements || []).forEach((el, k) => {
      if (el.status === 'OK') res.set(lote[k].id, { m: el.distance.value, s: el.duration.value })
    })
  }
  return res
}

// ── Pesquisa completa ────────────────────────────────────────────

export async function pesquisarPOIs({ apiKey, origemTexto, centro: centroDado }) {
  if (!apiKey) throw new Error('GOOGLE_MAPS_API_KEY não configurada no servidor')
  let origem
  if (centroDado?.lat && centroDado?.lng) origem = { lat: Number(centroDado.lat), lng: Number(centroDado.lng), resolvida: origemTexto || '', fonte: 'coordenadas' }
  else {
    if (!origemTexto?.trim()) throw new Error('Imóvel sem morada nem coordenadas')
    origem = await geocodificar(origemTexto, apiKey)
  }
  const centro = { lat: origem.lat, lng: origem.lng }

  let api = 'places_new'
  const vistos = new Set()
  const pois = []
  const avisos = []
  for (const cat of CATEGORIAS) {
    let encontrados = []
    try {
      if (api === 'places_new') {
        encontrados = await placesNearbyNova({ centro, tipos: cat.tipos, raio: cat.raio, apiKey })
        for (const t of cat.textos || []) encontrados.push(...(await placesTextoNova({ centro, texto: t, raio: cat.raio, apiKey })))
      } else {
        encontrados = await placesNearbyLegado({ centro, tipos: cat.tipos, apiKey })
      }
    } catch (e) {
      if (e instanceof PlacesNovaIndisponivel && api === 'places_new') {
        api = 'places_legacy'
        encontrados = await placesNearbyLegado({ centro, tipos: cat.tipos, apiKey })
      } else {
        avisos.push(`${cat.label}: ${e.message}`)
        continue
      }
    }
    const daCategoria = encontrados
      .filter((p) => p.id && p.lat != null && !p.fechado && !vistos.has(p.id))
      .map((p) => ({ ...p, linha_reta_m: linhaReta(centro, p) }))
      .filter((p) => p.linha_reta_m <= cat.raio)
      .sort((a, b) => a.linha_reta_m - b.linha_reta_m)
    const unicos = []
    for (const p of daCategoria) {
      if (vistos.has(p.id)) continue
      vistos.add(p.id)
      unicos.push(p)
      if (unicos.length >= cat.max) break
    }
    for (const p of unicos) {
      pois.push({
        id: p.id, nome: p.nome, endereco: p.endereco, lat: p.lat, lng: p.lng,
        grupo: cat.grupo, categoria: cat.id, categoria_label: cat.label, tipo: p.tipo,
        rating: p.rating, avaliacoes: p.avaliacoes, linha_reta_m: p.linha_reta_m,
        carro: null, pe: null, estado: 'proposto',
      })
    }
  }

  for (const [modo, campo] of [['driving', 'carro'], ['walking', 'pe']]) {
    try {
      const t = await tempos({ centro, pois, modo, apiKey })
      for (const p of pois) p[campo] = t.get(p.id) || null
    } catch (e) { avisos.push(e.message) }
  }

  return {
    origem: { texto: origemTexto || '', resolvida: origem.resolvida, lat: origem.lat, lng: origem.lng, fonte: origem.fonte },
    api, pesquisado_em: new Date().toISOString(), pois, avisos,
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

// Nova pesquisa: mantém a decisão (validado/excluído) dos pontos já revistos.
export async function correrPesquisa(pool, { imovelId, apiKey, origemTexto }) {
  await ensureColunaAnaliseLocalizacao(pool)
  const { rows: [im] } = await pool.query(
    'SELECT id, morada, zona, freguesia, concelho, coordenadas_lat, coordenadas_lng, analise_localizacao_ia FROM imoveis WHERE id = $1', [imovelId])
  if (!im) throw new Error('Imóvel não encontrado')
  const texto = (origemTexto || im.morada || [im.zona, im.freguesia, im.concelho].filter(Boolean).join(', ')).trim()
  // Com origem escrita à mão diferente da morada, ignora as coordenadas gravadas.
  const usarCoord = im.coordenadas_lat && im.coordenadas_lng && (!origemTexto || origemTexto.trim() === (im.morada || '').trim())
  const r = await pesquisarPOIs({ apiKey, origemTexto: texto, centro: usarCoord ? { lat: im.coordenadas_lat, lng: im.coordenadas_lng } : null })
  const anterior = im.analise_localizacao_ia || {}
  const decisoes = new Map((anterior.pois || []).filter((p) => p.estado !== 'proposto').map((p) => [p.id, p.estado]))
  for (const p of r.pois) if (decisoes.has(p.id)) p.estado = decisoes.get(p.id)
  return gravar(pool, imovelId, { ...anterior, ...r, versao: 1 })
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
  if (validados.length === 0) throw new Error('Valida pelo menos um ponto de interesse antes de pedir a análise')
  const { rows: [im] } = await pool.query(
    `SELECT nome, tipologia, morada, zona, freguesia, concelho, modelo_negocio, area_bruta, area_util,
            numero_pisos_predio, tem_elevador, ano_construcao, pontos_fortes, pontos_fracos
     FROM imoveis WHERE id = $1`, [imovelId])

  const porCategoria = CATEGORIAS.map((cat) => {
    const ps = validados.filter((p) => p.categoria === cat.id).sort((a, b) => a.linha_reta_m - b.linha_reta_m)
    if (ps.length === 0) return `- ${GRUPOS[cat.grupo]} / ${cat.label}: nenhum validado num raio de ${fmtDist(cat.raio)}.`
    return `- ${GRUPOS[cat.grupo]} / ${cat.label}:\n` + ps.map((p) =>
      `    • ${p.nome} (${p.endereco || 's/ morada'}): ${fmtDist(p.linha_reta_m)} em linha reta; a pé ${fmtMin(p.pe?.s)} (${fmtDist(p.pe?.m)}); de carro ${fmtMin(p.carro?.s)} (${fmtDist(p.carro?.m)})${p.rating ? `; ${String(p.rating).replace('.', ',')}★ (${p.avaliacoes || 0} avaliações)` : ''}`).join('\n')
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

PONTOS DE INTERESSE VALIDADOS PELA EQUIPA (distâncias calculadas a partir do imóvel)
${porCategoria}

O QUE PRECISO
1. Pontos fortes da localização. Para cada um, indica como se usa na venda (anúncio, vídeo, visitas).
2. Pontos fracos da localização, incluindo a falta de serviços relevantes por perto. Para cada um, indica como se responde ao comprador.
3. Um resumo de duas ou três frases sobre a localização e o perfil de comprador a que mais se adequa.

REGRAS
- Português de Portugal, com o Acordo Ortográfico de 1990 (ex.: «ótimo», «direção», «fatura»).
- Frases completas, profissionais e humanizadas. Nada de «rótulo: fragmento».
- Usa nomes e tempos concretos (ex.: «Lidl a 4 minutos a pé»). Arredonda os tempos ao minuto.
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
  if (fortes.n + fracos.n === 0) throw new Error('Não há pontos validados novos para acrescentar à ficha')
  await pool.query('UPDATE imoveis SET pontos_fortes = $2, pontos_fracos = $3 WHERE id = $1', [imovelId, fortes.texto, fracos.texto])
  dados.aplicado_em = new Date().toISOString()
  await gravar(pool, imovelId, dados)
  return { acrescentados_fortes: fortes.n, acrescentados_fracos: fracos.n }
}
