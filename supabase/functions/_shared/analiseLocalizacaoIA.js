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
  transportes: 'Acessos e transportes',
  saude: 'Saúde',
  educacao: 'Educação',
  lazer: 'Lazer e desporto',
  comercio: 'Comércio',
}

// Lógica do estudo da Lages: poucas âncoras por secção, as que pesam para quem
// compra ou investe (estações, autoestrada, aeroportos, hospitais, universidade,
// parques, rio, centros comerciais, centro da cidade), não todo o comércio à volta.
// raio em metros; max = quantos se guardam (prefere() passa à frente, depois os mais próximos).
// osm = filtros Overpass; ok(tags) decide a categoria (a primeira que aceitar fica com o local);
// nomeDe(tags) dá o nome quando o OSM não tem um bom.
const re = (s) => new RegExp(s, 'i')
const temRede = (t, r) => re(r).test(`${t.network || ''} ${t.operator || ''} ${t.name || ''}`)
const privado = (t) => ['private', 'customers', 'no'].includes(t.access)
const SAUDE_PRIMARIA = 'centro de sa[uú]de|\\busf\\b|\\bucsp\\b|unidade de sa[uú]de|extens[aã]o de sa[uú]de'

export const CATEGORIAS = [
  // Acessos e transportes
  { id: 'autocarros', grupo: 'transportes', label: 'Paragem de autocarro', raio: 800, max: 1, semNome: 'Paragem de autocarro',
    osm: ['[highway=bus_stop]', '[amenity=bus_station]'], ok: (t) => (t.highway === 'bus_stop' || t.amenity === 'bus_station') && !temRede(t, 'metrobus|metro mondego') },
  { id: 'metro', grupo: 'transportes', label: 'Metro e Metrobus', raio: 2500, max: 1,
    osm: ['[station~"^(subway|light_rail)$"]', '[public_transport][network~"metro",i]', '[highway=bus_stop][name~"metrobus",i]'],
    ok: (t) => ['subway', 'light_rail'].includes(t.station) || (!!(t.public_transport || t.highway === 'bus_stop') && temRede(t, 'metrobus|metro mondego|metropolitano|metro do porto')) },
  { id: 'comboio', grupo: 'transportes', label: 'Estações de comboio', raio: 12000, max: 2,
    osm: ['[railway=station]'], ok: (t) => t.railway === 'station' && !['subway', 'light_rail'].includes(t.station) && !!t.name,
    nomeDe: (t) => (re('^esta[cç][aã]o').test(t.name) ? t.name : `Estação ${t.name}`) },
  { id: 'autoestradas', grupo: 'transportes', label: 'Acessos às autoestradas', raio: 30000, max: 4, fixo: true },
  { id: 'aeroportos', grupo: 'transportes', label: 'Aeroportos', raio: 400000, max: 2, fixo: true },
  // Saúde
  { id: 'centros_saude', grupo: 'saude', label: 'Centro de saúde', raio: 4000, max: 1,
    osm: ['[amenity~"^(clinic|doctors)$"][name]', '[healthcare~"^(centre|clinic)$"][name]'], ok: (t) => re(SAUDE_PRIMARIA).test(t.name || '') },
  { id: 'hospitais', grupo: 'saude', label: 'Hospitais', raio: 10000, max: 2,
    osm: ['[amenity=hospital][name]'], ok: (t) => t.amenity === 'hospital' && !re('veterin').test(t.name || ''),
    prefere: (t) => re('^(hospital|centro hospitalar|unidade local de sa)').test(t.name || '') && !re('privad|cl[ií]nica').test(t.name || '') },
  { id: 'farmacias', grupo: 'saude', label: 'Farmácia', raio: 2000, max: 1, osm: ['[amenity=pharmacy]'], ok: (t) => t.amenity === 'pharmacy' },
  // Educação
  { id: 'universidades', grupo: 'educacao', label: 'Universidade e politécnico', raio: 8000, max: 2,
    osm: ['[amenity=university][name]'], ok: (t) => t.amenity === 'university',
    prefere: (t) => re('^(universidade|instituto polit|p[oó]lo|faculdade|escola superior)').test(t.name || '') },
  { id: 'escolas_secundarias', grupo: 'educacao', label: 'Escola secundária', raio: 5000, max: 1,
    osm: ['[amenity=school][name]'], ok: (t) => t.amenity === 'school' && re('secund|liceu').test(t.name || '') },
  { id: 'escolas_basicas', grupo: 'educacao', label: 'Escola básica', raio: 3000, max: 1,
    osm: ['[amenity=school][name]'], ok: (t) => t.amenity === 'school', prefere: (t) => re('b[aá]sica|eb\\s?1|jardim de inf').test(t.name || '') },
  // Lazer e desporto
  { id: 'parques', grupo: 'lazer', label: 'Parques e jardins', raio: 4000, max: 2,
    osm: ['[leisure=park][name]'], ok: (t) => t.leisure === 'park' && !privado(t),
    prefere: (t) => re('parque|jardim|mata|quinta').test(t.name || '') && !re('infantil').test(t.name || '') },
  { id: 'rio', grupo: 'lazer', label: 'Rio, praia fluvial e zonas balneares', raio: 15000, max: 1,
    osm: ['[leisure~"^(beach_resort|swimming_area)$"]', '[natural=beach][name]'], ok: (t) => ['beach_resort', 'swimming_area'].includes(t.leisure) || (t.natural === 'beach' && !!t.name),
    semNome: 'Praia fluvial' },
  { id: 'matas', grupo: 'lazer', label: 'Matas e espaços naturais', raio: 8000, max: 1,
    osm: ['[leisure=nature_reserve][name]', '[landuse=forest][name~"mata|parque",i]', '[natural=wood][name~"mata",i]'], ok: (t) => !!t.name && (t.leisure === 'nature_reserve' || t.landuse === 'forest' || t.natural === 'wood') },
  { id: 'cultura', grupo: 'lazer', label: 'Monumentos, museus e teatros', raio: 4000, max: 1,
    osm: ['[tourism=museum][name]', '[amenity~"^(theatre|cinema)$"][name]', '[historic~"^(monument|castle|monastery)$"][name]'],
    ok: (t) => !!t.name && (t.tourism === 'museum' || ['theatre', 'cinema'].includes(t.amenity) || ['monument', 'castle', 'monastery'].includes(t.historic)) },
  { id: 'desporto', grupo: 'lazer', label: 'Estádios e pavilhões', raio: 6000, max: 1,
    osm: ['[leisure~"^(stadium|sports_centre)$"][name]'], ok: (t) => ['stadium', 'sports_centre'].includes(t.leisure) && !privado(t),
    prefere: (t) => t.leisure === 'stadium' || re('est[aá]dio|pavilh|complexo').test(t.name || '') },
  { id: 'ginasios', grupo: 'lazer', label: 'Ginásio', raio: 2500, max: 1,
    osm: ['[leisure=fitness_centre]', '[amenity=gym]'], ok: (t) => t.leisure === 'fitness_centre' || t.amenity === 'gym' },
  // Comércio
  { id: 'supermercados', grupo: 'comercio', label: 'Supermercados', raio: 3000, max: 2,
    osm: ['[shop=supermarket]'], ok: (t) => t.shop === 'supermarket',
    prefere: (t) => re('continente|pingo doce|lidl|aldi|intermarch|mercadona|auchan|minipre|el corte').test(`${t.name || ''} ${t.brand || ''}`) },
  { id: 'centros_comerciais', grupo: 'comercio', label: 'Centros comerciais', raio: 10000, max: 2,
    osm: ['[shop=mall][name]'], ok: (t) => t.shop === 'mall' },
  { id: 'centro_cidade', grupo: 'comercio', label: 'Centro da cidade', raio: 25000, max: 1,
    osm: ['node[place~"^(city|town)$"]'], ok: (t) => ['city', 'town'].includes(t.place) && !!t.name,
    nomeDe: (t) => `Centro de ${t.name}`, prefere: (t) => t.place === 'city' },
]

// Aeroportos internacionais (coordenadas fixas; ficam os 2 mais próximos).
const AEROPORTOS = [
  { id: 'aeroporto:LIS', nome: 'Aeroporto de Lisboa', lat: 38.7742, lng: -9.1342 },
  { id: 'aeroporto:OPO', nome: 'Aeroporto do Porto (Francisco Sá Carneiro)', lat: 41.2481, lng: -8.6814 },
  { id: 'aeroporto:FAO', nome: 'Aeroporto de Faro', lat: 37.0144, lng: -7.9659 },
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
  // De carro, acima de 20 km o percurso é sobretudo em autoestrada/via rápida.
  const kmh = perfil === 'carro' && linhaRetaM > 20000 ? 85 : e.kmh
  return { m, s: Math.round((m / 1000 / kmh) * 3600), estimado: true }
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
  for (const cat of CATEGORIAS) for (const f of cat.osm || []) partes.push(`${f.startsWith('[') ? 'nwr' + f : f}(${bbox(centro, cat.raio)});`)
  return consultaOverpass(`[out:json][timeout:60];(${partes.join('')});out center tags;`, aoTentar)
}

async function consultaOverpass(query, aoTentar) {
  const corpo = 'data=' + encodeURIComponent(query)
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

// Acesso mais próximo de cada autoestrada (A1, A13, A14…): para cada nó de saída
// (motorway_junction) num raio de 20 km, as vias a que pertence. No OSM as
// referências vêm como «A 1», «A 13;IC 3» ou «A 13-1»; normalizam-se para A1, A13…
async function acessosAutoestrada(centro, aoTentar) {
  const els = await consultaOverpass(`[out:json][timeout:50];node[highway=motorway_junction](${bbox(centro, 20000)})->.j;foreach.j->.n(.n out;way(bn.n)[highway=motorway];out tags;);`, aoTentar)
  const melhor = new Map() // autoestrada -> nó mais próximo
  let no = null
  for (const e of els) {
    if (e.type === 'node') { no = { n: e, d: linhaReta(centro, { lat: e.lat, lng: e.lon }) }; continue }
    if (!no) continue
    const refs = String(e.tags?.ref || '').split(/\s*;\s*/).map((r) => r.replace(/\s+/g, '')).filter((r) => /^A\d+$/.test(r)) // sem ramais (A13-1…)
    for (const r of refs) if (!melhor.has(r) || no.d < melhor.get(r).d) melhor.set(r, no)
  }
  return [...melhor.entries()].sort((a, b) => a[1].d - b[1].d).map(([ref, { n, d }]) => {
    const t = n.tags || {}
    const no = t.name ? `nó ${t.name}` : t.ref ? `saída ${t.ref}` : 'nó mais próximo'
    const destino = t.destination || t.exit_to
    return {
      id: `osm:node/${n.id}:${ref}`, nome: `Acesso à ${ref} (${no}${t.name && t.ref ? `, saída ${t.ref}` : ''})`,
      endereco: destino ? `Direção ${String(destino).replace(/;/g, ' / ')}` : '', lat: n.lat, lng: n.lon,
      tipo: 'motorway_junction', linhas: null, rede: ref, linha_reta_m: d, preferido: false,
    }
  })
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

  const avisosPesquisa = []
  // Cada local vai para a primeira categoria que o aceita.
  const candidatos = new Map(CATEGORIAS.map((c) => [c.id, []]))
  const vistos = new Set()
  for (const el of elementos) {
    const t = el.tags || {}
    const lat = el.lat ?? el.center?.lat, lng = el.lon ?? el.center?.lon
    const id = `osm:${el.type}/${el.id}`
    if (lat == null || vistos.has(id) || t.disused || t['disused:amenity']) continue
    const cat = CATEGORIAS.find((c) => c.ok?.(t))
    if (!cat) continue
    const nome = cat.nomeDe ? cat.nomeDe(t) : (t.name || t.brand || cat.semNome)
    if (!nome) continue
    const dist = linhaReta(centro, { lat, lng })
    if (dist > cat.raio) continue
    vistos.add(id)
    candidatos.get(cat.id).push({
      id, nome, endereco: moradaDe(t), lat, lng, tipo: t.amenity || t.shop || t.leisure || t.highway || t.railway || t.tourism || t.healthcare || '',
      linhas: t.route_ref ? String(t.route_ref).replace(/\s*[;,]\s*/g, ', ') : null,
      rede: t.network || t.operator || null, linha_reta_m: dist, preferido: !!cat.prefere?.(t),
    })
  }
  // Autoestradas: o acesso mais próximo de cada uma (não impede a pesquisa se falhar).
  try {
    candidatos.get('autoestradas').push(...await acessosAutoestrada(centro, (n) => progresso(1, `A procurar os acessos às autoestradas… (tentativa ${n})`)))
  } catch { avisosPesquisa.push('Não foi possível obter os acessos às autoestradas (servidores do OpenStreetMap ocupados).') }
  // Aeroportos: lista fixa, os mais próximos.
  for (const a of AEROPORTOS) candidatos.get('aeroportos').push({ ...a, endereco: '', tipo: 'aerodrome', linhas: null, rede: null, linha_reta_m: linhaReta(centro, a), preferido: false })

  // Os mais próximos de cada categoria, sem repetir o mesmo nome (ex.: paragem nos dois sentidos).
  const pois = []
  for (const cat of CATEGORIAS) {
    const nomes = new Set()
    const lista = candidatos.get(cat.id).sort((a, b) => (b.preferido - a.preferido) || (a.linha_reta_m - b.linha_reta_m))
    for (const p of lista) {
      const chave = p.nome.toLowerCase()
      if (p.nome !== cat.semNome && nomes.has(chave)) continue
      nomes.add(chave)
      const { preferido, ...semPref } = p
      pois.push({ ...semPref, grupo: cat.grupo, categoria: cat.id, categoria_label: cat.label, rating: null, avaliacoes: null, carro: null, pe: null, estado: 'proposto' })
      if (pois.filter((x) => x.categoria === cat.id).length >= cat.max) break
    }
  }

  // Tempos sempre preenchidos: rota real (OSRM) ou, se o serviço falhar, estimativa marcada.
  const avisos = [...avisosPesquisa]
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

// ── Ponto acrescentado à mão (o que o OpenStreetMap não encontrou) ──

// Procura lugares pelo nome perto do imóvel (Nominatim, com preferência pela zona).
export async function procurarLugar(texto, centro) {
  const url = new URL('https://nominatim.openstreetmap.org/search')
  url.searchParams.set('q', texto)
  url.searchParams.set('format', 'json')
  url.searchParams.set('limit', '6')
  url.searchParams.set('countrycodes', 'pt')
  url.searchParams.set('accept-language', 'pt')
  url.searchParams.set('viewbox', [centro.lng - 0.15, centro.lat + 0.1, centro.lng + 0.15, centro.lat - 0.1].join(','))
  const resp = await fetchComPrazo(url.toString(), { headers: UA }, 15000)
  const j = resp.ok ? await resp.json() : []
  return j.map((r) => ({ nome: (r.name || r.display_name.split(',')[0]).trim(), endereco: r.display_name, lat: Number(r.lat), lng: Number(r.lon) }))
    .map((r) => ({ ...r, linha_reta_m: linhaReta(centro, r) }))
    .sort((a, b) => a.linha_reta_m - b.linha_reta_m)
}

// Completa o lugar escolhido com os tempos a pé, de bicicleta e de carro.
export async function pontoManual({ centro, lugar, categoria }) {
  const p = { id: `manual:${novoId()}`, nome: lugar.nome, endereco: lugar.endereco, lat: lugar.lat, lng: lugar.lng, categoria, linha_reta_m: linhaReta(centro, lugar), manual: true }
  for (const perfil of Object.keys(MEIOS)) {
    const t = await tempos(centro, [p], perfil).catch(() => new Map())
    p[perfil] = t.get(p.id) || estimar(perfil, p.linha_reta_m)
  }
  return p
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

const CATS = new Map(CATEGORIAS.map((c) => [c.id, c]))
function limparPoi(p) {
  if (!p?.id || !CATS.has(p.categoria) || num(p.lat) == null) return null
  const cat = CATS.get(p.categoria)
  return {
    id: txt(p.id, 80), nome: txt(p.nome, 150), endereco: txt(p.endereco), lat: num(p.lat), lng: num(p.lng),
    grupo: cat.grupo, categoria: p.categoria, categoria_label: cat.label,
    tipo: txt(p.tipo, 40), linhas: txt(p.linhas, 120), rede: txt(p.rede, 80), rating: null, avaliacoes: null,
    linha_reta_m: num(p.linha_reta_m), pe: tempo(p.pe), bicicleta: tempo(p.bicicleta), carro: tempo(p.carro),
    estado: p.manual ? 'validado' : 'proposto', ...(p.manual ? { manual: true } : {}),
  }
}

export async function guardarPesquisa(pool, imovelId, r) {
  await ensureColunaAnaliseLocalizacao(pool)
  const { rows: [im] } = await pool.query('SELECT analise_localizacao_ia FROM imoveis WHERE id = $1', [imovelId])
  if (!im) throw new Error('Imóvel não encontrado')
  if (!r || !Array.isArray(r.pois) || num(r.origem?.lat) == null) throw new Error('Resultado da pesquisa inválido')
  const pois = r.pois.slice(0, 300).map(limparPoi).filter(Boolean)
  const anterior = im.analise_localizacao_ia || {}
  const decisoes = new Map((anterior.pois || []).filter((p) => p.estado !== 'proposto').map((p) => [p.id, p.estado]))
  for (const p of pois) if (decisoes.has(p.id)) p.estado = decisoes.get(p.id)
  // Pontos acrescentados à mão sobrevivem a uma nova pesquisa.
  for (const p of anterior.pois || []) if (p.manual && !pois.some((x) => x.id === p.id)) pois.push(p)
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
export async function atualizarDecisoes(pool, imovelId, { pois = {}, itens = {}, adicionar = null }) {
  const dados = await lerAnaliseLocalizacao(pool, imovelId)
  if (!dados) throw new Error('Ainda não há análise de localização para este imóvel')
  if (adicionar) {
    const p = limparPoi({ ...adicionar, manual: true })
    if (!p) throw new Error('Ponto de interesse inválido')
    dados.pois = [...(dados.pois || []).filter((x) => x.id !== p.id), p]
  }
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

// Regista a imagem do estudo gerada no browser (já no Storage) e os dados que a originaram.
export async function registarEstudo(pool, imovelId, { url, meta = {} }) {
  const resultados = (Array.isArray(meta.resultados) ? meta.resultados : []).slice(0, 60).map((r) => ({
    categoria: txt(r.categoria, 150), tipo_local: txt(r.tipo_local, 60), seccao: txt(r.seccao, 30), endereco: txt(r.endereco),
    lat: num(r.lat), lng: num(r.lng), status: 'OK', distancia_metros: num(r.distancia_metros), duracao_segundos: num(r.duracao_segundos),
    pe: r.pe ? { status: 'OK', distancia_metros: num(r.pe.distancia_metros), duracao_segundos: num(r.pe.duracao_segundos) } : null,
    bicicleta: r.bicicleta ? { distancia_metros: num(r.bicicleta.distancia_metros), duracao_segundos: num(r.bicicleta.duracao_segundos) } : null,
  }))
  const highlights = (Array.isArray(meta.highlights) ? meta.highlights : []).slice(0, 2).map((h) => ({
    titulo: txt(h.titulo, 80), descricao: txt(h.descricao, 200), subtitulo: txt(h.subtitulo, 120), accent: h.accent === 'red' ? 'red' : 'gold',
    ...(Array.isArray(h.badge) ? { badge: h.badge.slice(0, 8).map((b) => txt(b, 8)) } : {}),
  }))
  const agora = new Date().toISOString()
  const payload = { fonte: 'OpenStreetMap', origem: txt(meta.origem), mode: 'driving', atualizado_em: agora, imagem_gerada_em: agora, resultados, highlights, destaque: txt(meta.destaque, 150) || null }
  await pool.query(
    'UPDATE imoveis SET localizacao_imagem = $2, pois_distancias = $3::jsonb, pois_atualizado_em = $4, updated_at = NOW()::text WHERE id = $1',
    [imovelId, url, JSON.stringify(payload), agora])
  return { ok: true, localizacao_imagem: url }
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
