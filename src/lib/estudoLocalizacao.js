/**
 * Gerador automático de Estudos de Localização para imóveis CRM.
 *
 * Pipeline:
 *  1. Distance Matrix API (Google) — distâncias e tempos a partir da morada do imóvel
 *  2. Composição de SVG branded Somnium (mapa radial + tabela + cards por secção)
 *  3. Rasterização SVG → PNG (PDFKit não aceita SVG)
 *  4. Upload para Supabase Storage (bucket Imoveis)
 *  5. UPDATE imoveis.localizacao_imagem + pois_distancias
 */

import { Resvg } from '@resvg/resvg-js'

// Largura alvo do PNG: ~4x oversample face ao espaco util da pagina A4
// (CW≈495pt @ 72dpi). Importante para a pagina LOCALIZACAO do dossier,
// onde a imagem ocupa toda a content width — texto da tabela de POIs e
// cards de highlights tem que ficar legivel sem zoom.
const PNG_TARGET_WIDTH = 2000

export function rasterizarSvgParaPng(svg, { largura = PNG_TARGET_WIDTH } = {}) {
  return new Resvg(svg, {
    fitTo: { mode: 'width', value: largura },
    font: { loadSystemFonts: true },
  }).render().asPng()
}

// ── Categorização & helpers ──────────────────────────────────────

const ICONE_PARA_SECCAO = {
  '🛣️': 'acessos', '✈️': 'acessos', '🚆': 'acessos', '🚇': 'acessos',
  '🎓': 'saude_universidade', '🏥': 'saude_universidade', '💊': 'saude_universidade', '🏫': 'saude_universidade',
  '🌳': 'lazer', '🌲': 'lazer', '🏖️': 'lazer', '🏰': 'lazer', '🏟️': 'lazer', '🎭': 'lazer',
  '🛒': 'comercio', '🛍️': 'comercio', '🚒': 'comercio', '🍽️': 'comercio', '☕': 'comercio',
}

const SECCOES = {
  acessos: { titulo: '🛣️  ACESSOS' },
  saude_universidade: { titulo: '🎓  UNIV. & SAÚDE' },
  lazer: { titulo: '🌳  LAZER & CULTURA' },
  comercio: { titulo: '🛒  COMÉRCIO & SERVIÇOS' },
}

function categorizar(r) {
  if (r.seccao && SECCOES[r.seccao]) return r.seccao
  return ICONE_PARA_SECCAO[r.icone] || 'comercio'
}

function escapeXml(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function fmtKm(metros) {
  if (metros == null) return '—'
  if (metros >= 100000) return `${Math.round(metros / 1000)} km`
  if (metros >= 10000) return `${(metros / 1000).toFixed(0)} km`
  return `${(metros / 1000).toFixed(1).replace('.', ',')} km`
}

function fmtMin(segundos) {
  if (segundos == null) return '—'
  const min = Math.round(segundos / 60)
  if (min >= 60) {
    const h = Math.floor(min / 60)
    const m = min % 60
    return m === 0 ? `${h}h` : `${h}h${String(m).padStart(2, '0')}`
  }
  return `${min} min`
}

function parseFreguesia(origemResolvida) {
  // "Estr. X, 3040-267 Santa Clara, Portugal" → { codigoPostal: "3040-267", freguesia: "Santa Clara" }
  const m = String(origemResolvida || '').match(/(\d{4}-\d{3})\s+([^,]+)/)
  return {
    codigoPostal: m?.[1] || null,
    freguesia: m?.[2]?.trim() || null,
  }
}

// ── Distance Matrix ──────────────────────────────────────────────

export async function callDistanceMatrix({ origem, destinos, mode = 'driving', apiKey }) {
  if (!apiKey) throw new Error('GOOGLE_MAPS_API_KEY não configurada')
  if (!origem?.trim()) throw new Error('Indica origem')
  const lista = (destinos || []).filter(d => d?.endereco?.trim())
  if (lista.length === 0) throw new Error('Lista de destinos vazia')
  if (lista.length > 25) throw new Error('Máximo 25 destinos por chamada')

  const url = new URL('https://maps.googleapis.com/maps/api/distancematrix/json')
  url.searchParams.set('origins', origem)
  url.searchParams.set('destinations', lista.map(d => d.endereco).join('|'))
  url.searchParams.set('mode', mode)
  url.searchParams.set('region', 'pt')
  url.searchParams.set('language', 'pt')
  url.searchParams.set('key', apiKey)

  const r = await fetch(url.toString())
  const j = await r.json()
  if (j.status !== 'OK') throw new Error(`Distance Matrix: ${j.status}${j.error_message ? ' — ' + j.error_message : ''}`)

  const linha = j.rows?.[0]?.elements || []
  const resultados = lista.map((d, i) => {
    const el = linha[i] || {}
    return {
      categoria: d.categoria || null,
      icone: d.icone || '📍',
      endereco: d.endereco,
      seccao: d.seccao || null,
      distancia_metros: el.status === 'OK' ? el.distance?.value ?? null : null,
      distancia_texto: el.status === 'OK' ? el.distance?.text ?? null : null,
      duracao_segundos: el.status === 'OK' ? el.duration?.value ?? null : null,
      duracao_texto: el.status === 'OK' ? el.duration?.text ?? null : null,
      status: el.status || 'UNKNOWN',
    }
  })
  return { origem_resolvida: j.origin_addresses?.[0] || origem, resultados }
}

// ── Static Satellite Map ─────────────────────────────────────────

export async function fetchRoutePolyline({ origem, destino, apiKey, mode = 'driving' }) {
  if (!apiKey || !origem || !destino) return null
  const url = new URL('https://maps.googleapis.com/maps/api/directions/json')
  url.searchParams.set('origin', origem)
  url.searchParams.set('destination', destino)
  url.searchParams.set('mode', mode)
  url.searchParams.set('region', 'pt')
  url.searchParams.set('language', 'pt')
  url.searchParams.set('key', apiKey)
  try {
    const r = await fetch(url.toString())
    const j = await r.json()
    if (j.status !== 'OK') return null
    return j.routes?.[0]?.overview_polyline?.points || null
  } catch { return null }
}

export async function fetchStaticSatelliteMap({ origem, destinos, paths = [], apiKey, w = 640, h = 360, scale = 2 }) {
  if (!apiKey) throw new Error('GOOGLE_MAPS_API_KEY não configurada')
  const url = new URL('https://maps.googleapis.com/maps/api/staticmap')
  url.searchParams.set('size', `${w}x${h}`)
  url.searchParams.set('scale', String(scale))
  url.searchParams.set('maptype', 'hybrid') // satélite + labels e estradas
  url.searchParams.set('language', 'pt')
  url.searchParams.set('region', 'pt')
  // Rotas (paths) — desenhadas PRIMEIRO para ficarem por baixo dos markers
  paths.forEach(p => {
    if (p) url.searchParams.append('path', `color:0xC9A84CFF|weight:4|enc:${p}`)
  })
  // Imóvel — pin gold com label "I"
  url.searchParams.append('markers', `color:0xC9A84C|size:mid|label:I|${origem}`)
  // Destinos — pretos numerados (Static Maps suporta labels A-Z, 0-9 — usamos 1..9 para os 9 mais perto)
  destinos.slice(0, 9).forEach((d, i) => {
    url.searchParams.append('markers', `color:0x111111|size:mid|label:${i + 1}|${d.endereco}`)
  })
  url.searchParams.set('key', apiKey)

  const r = await fetch(url.toString())
  if (!r.ok) {
    const txt = await r.text().catch(() => '')
    throw new Error(`Static Maps: HTTP ${r.status} — ${txt.slice(0, 240) || 'sem detalhe'}. Confirma que activaste "Maps Static API" no Google Cloud e adicionaste à API restrictions da chave.`)
  }
  const ct = r.headers.get('content-type') || ''
  if (!ct.startsWith('image/')) {
    const txt = await r.text().catch(() => '')
    throw new Error(`Static Maps devolveu não-imagem (${ct}): ${txt.slice(0, 240)}`)
  }
  return Buffer.from(await r.arrayBuffer()).toString('base64')
}

// ── Composer SVG ─────────────────────────────────────────────────

const W = 1200
const HEADER_H = 162   // header (100) + gold strip (6) + address bar (56)
const MAP_H = 640
const TABLE_BLOCK_H = 380  // tabela + cards
const FOOTER_H = 90

export function composeEstudoSvg({
  imovelNome,
  morada,
  freguesia,
  resultados = [],
  highlights = [],
  destaque = null,    // categoria/string a marcar como ★ gold
  modo = 'driving',
  mapaPngBase64 = null, // imagem satélite Google Static Maps
}) {
  const ok = resultados.filter(r => r.status === 'OK')
                       .sort((a, b) => (a.distancia_metros ?? Infinity) - (b.distancia_metros ?? Infinity))

  // top 7 para tabela
  const principais = ok.slice(0, 7)
  // agrupar todos por secção
  const grupos = { acessos: [], saude_universidade: [], lazer: [], comercio: [] }
  ok.forEach(r => { const sec = categorizar(r); if (grupos[sec]) grupos[sec].push(r) })
  Object.values(grupos).forEach(arr => arr.sort((a, b) => a.distancia_metros - b.distancia_metros))

  // ----- Mapa satélite (Google Static Maps) -----
  const mapW = 1100, mapH = MAP_H

  // Lista de pinos para legenda (1..9, matching markers no PNG)
  const pinsLegenda = ok.slice(0, 9)

  const mapaSvg = mapaPngBase64
    ? `
      <defs>
        <clipPath id="mapClip"><rect x="0" y="0" width="${mapW}" height="${mapH}" rx="8"/></clipPath>
      </defs>
      <image x="0" y="0" width="${mapW}" height="${mapH}" preserveAspectRatio="xMidYMid slice"
             clip-path="url(#mapClip)" href="data:image/png;base64,${mapaPngBase64}"/>
      <!-- Atribuição -->
      <rect x="${mapW - 150}" y="${mapH - 24}" width="138" height="18" rx="3" fill="#000000" opacity="0.5"/>
      <text x="${mapW - 12}" y="${mapH - 10}" font-size="10" fill="#FFFFFF" text-anchor="end" font-weight="600">Imagem: Google Maps</text>`
    : `
      <rect x="0" y="0" width="${mapW}" height="${mapH}" rx="8" fill="#FAEAEA" stroke="#C97070" stroke-width="2"/>
      <text x="${mapW/2}" y="${mapH/2}" text-anchor="middle" font-size="18" fill="#8B2A2A" font-weight="700">⚠️ Mapa satélite não disponível</text>
      <text x="${mapW/2}" y="${mapH/2 + 30}" text-anchor="middle" font-size="13" fill="#444">Activar "Maps Static API" no Google Cloud + adicionar à API restrictions da chave</text>`

  // Legenda dos pinos numerados 1..9 (canto superior esquerdo do mapa)
  const legendaPins = pinsLegenda.map((r, i) => {
    const y = 16 + i * 18
    const isDest = destaque && r.categoria && r.categoria.toLowerCase().includes(destaque.toLowerCase())
    return `
      <circle cx="20" cy="${y}" r="9" fill="${isDest ? '#C9A84C' : '#111111'}" stroke="#FFFFFF" stroke-width="1.2"/>
      <text x="20" y="${y + 3}" text-anchor="middle" font-size="10" fill="#FFFFFF" font-weight="800">${isDest ? '★' : (i + 1)}</text>
      <text x="36" y="${y + 4}" font-size="11" fill="#FFFFFF" font-weight="600" style="paint-order:stroke fill;stroke:#000;stroke-width:2.4">${escapeXml((r.categoria || '').slice(0, 26))}</text>
    `
  }).join('')

  // ----- Highlights row (opcional) -----
  const highlightsH = highlights.length > 0 ? 180 : 0
  const highlightsSvg = highlights.length === 0 ? '' : `
    <g transform="translate(50, ${HEADER_H + 33 + MAP_H + 20})">
      ${highlights.slice(0, 2).map((h, i) => {
        const accent = h.accent === 'red' ? '#8B2A2A' : '#C9A84C'
        const titleFill = h.accent === 'red' ? '#FFFFFF' : '#0d0d0d'
        const x = i * 560
        return `<g transform="translate(${x}, 0)">
          <rect width="540" height="140" rx="10" fill="#FFFFFF" stroke="${accent}" stroke-width="2.5" filter="url(#shadow)"/>
          <rect width="540" height="40" rx="10" fill="${accent}"/>
          <rect y="30" width="540" height="10" fill="${accent}"/>
          <text x="20" y="27" font-size="20" fill="${titleFill}" font-weight="700">${escapeXml(h.titulo || '')}</text>
          <text x="20" y="70" font-size="13" fill="#444" font-weight="500">${escapeXml(h.descricao || '')}</text>
          ${(() => {
            const badges = Array.isArray(h.badge) ? h.badge.filter(Boolean) : (h.badge ? [String(h.badge)] : [])
            if (badges.length === 0) {
              return `<text x="20" y="106" font-size="13" fill="#0d0d0d" font-weight="700">${escapeXml(h.subtitulo || '')}</text>`
            }
            const widths = badges.map(b => Math.max(46, b.length * 11 + 18))
            const totalW = widths.reduce((a, w) => a + w, 0) + (badges.length - 1) * 6
            let xOff = 0
            const boxes = badges.map((b, i) => {
              const w = widths[i]
              const fs = b.length > 4 ? 14 : 18
              const el = `<g transform="translate(${xOff}, 0)"><rect width="${w}" height="36" rx="6" fill="#0d0d0d"/><text x="${w/2}" y="${b.length > 4 ? 23 : 25}" text-anchor="middle" font-size="${fs}" fill="#C9A84C" font-weight="800">${escapeXml(b)}</text></g>`
              xOff += w + 6
              return el
            }).join('')
            return `
              <g transform="translate(20, 88)">${boxes}</g>
              <text x="${20 + totalW + 12}" y="121" font-size="11" fill="#888" font-style="italic">${escapeXml(h.subtitulo || '')}</text>`
          })()}
        </g>`
      }).join('')}
    </g>`

  // ----- Tabela principais -----
  const tableY = HEADER_H + 33 + MAP_H + 20 + highlightsH + (highlightsH > 0 ? 30 : 0)
  const tabelaSvg = `
    <g transform="translate(50, ${tableY})">
      <text x="0" y="0" font-size="18" fill="#0d0d0d" font-weight="700">Distâncias e tempos de carro</text>
      <line x1="0" y1="10" x2="540" y2="10" stroke="#C9A84C" stroke-width="2"/>
      <g transform="translate(0, 30)">
        <rect width="540" height="32" rx="4" fill="#0d0d0d"/>
        <text x="20" y="21" font-size="11" fill="#C9A84C" font-weight="700" letter-spacing="1">#</text>
        <text x="60" y="21" font-size="11" fill="#C9A84C" font-weight="700" letter-spacing="1">PONTO DE INTERESSE</text>
        <text x="400" y="21" font-size="11" fill="#C9A84C" font-weight="700" letter-spacing="1" text-anchor="end">DISTÂNCIA</text>
        <text x="510" y="21" font-size="11" fill="#C9A84C" font-weight="700" letter-spacing="1" text-anchor="end">CARRO</text>
      </g>
      <g transform="translate(0, 70)" font-size="13" fill="#0d0d0d">
        ${principais.map((r, i) => {
          const yRow = i * 34
          const fill = i % 2 === 0 ? '#F7F3E9' : '#FFFFFF'
          return `<rect x="0" y="${yRow}" width="540" height="34" fill="${fill}"/>
                  <text x="20" y="${yRow + 22}" font-weight="700">${i + 1}</text>
                  <text x="60" y="${yRow + 22}" font-weight="600">${escapeXml((r.categoria || r.endereco || '').slice(0, 35))}</text>
                  <text x="400" y="${yRow + 22}" text-anchor="end" font-weight="700">${escapeXml(r.distancia_texto || fmtKm(r.distancia_metros))}</text>
                  <text x="510" y="${yRow + 22}" text-anchor="end" font-weight="700">${escapeXml(r.duracao_texto || fmtMin(r.duracao_segundos))}</text>`
        }).join('')}
      </g>
    </g>`

  // ----- Cards por secção -----
  const cardsSvg = `
    <g transform="translate(610, ${tableY})">
      <text x="0" y="0" font-size="18" fill="#0d0d0d" font-weight="700">Pontos fortes da localização</text>
      <line x1="0" y1="10" x2="540" y2="10" stroke="#C9A84C" stroke-width="2"/>
      ${['acessos', 'saude_universidade', 'lazer', 'comercio'].map((sec, idx) => {
        const xCard = (idx % 2) * 280
        const yCard = 35 + Math.floor(idx / 2) * 180
        const items = grupos[sec].slice(0, 6)
        if (items.length === 0) return ''
        const linhas = items.map((r, i) => {
          const y = 48 + i * 20
          const isDestaque = destaque && r.categoria && r.categoria.toLowerCase().includes(destaque.toLowerCase())
          const colTxt = isDestaque ? '#B8923D' : '#333'
          const colVal = isDestaque ? '#B8923D' : '#0d0d0d'
          const w = isDestaque ? '700' : '600'
          const wVal = isDestaque ? '800' : '700'
          const prefix = isDestaque ? '★ ' : ''
          return `<text x="14" y="${y}" font-weight="${w}" fill="${colTxt}">${escapeXml(prefix + (r.categoria || '').slice(0, 28))}</text>
                  <text x="246" y="${y}" text-anchor="end" font-weight="${wVal}" fill="${colVal}">${escapeXml(r.distancia_texto || fmtKm(r.distancia_metros))} · ${escapeXml(r.duracao_texto || fmtMin(r.duracao_segundos))}</text>`
        }).join('')
        return `<g transform="translate(${xCard}, ${yCard})">
          <rect width="260" height="170" rx="8" fill="#FFFFFF" stroke="#E0D5B5" stroke-width="1.5"/>
          <rect width="260" height="28" rx="8" fill="#0d0d0d"/>
          <rect y="18" width="260" height="10" fill="#0d0d0d"/>
          <text x="14" y="20" font-size="13" fill="#C9A84C" font-weight="700">${escapeXml(SECCOES[sec].titulo)}</text>
          <g font-size="11">${linhas}</g>
        </g>`
      }).join('')}
    </g>`

  // ----- Total height & footer -----
  const totalH = tableY + TABLE_BLOCK_H + 30 + FOOTER_H
  const footerY = totalH - FOOTER_H

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${totalH}" font-family="-apple-system, 'Segoe UI', Helvetica, Arial, sans-serif">
  <defs>
    <linearGradient id="goldGrad" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#D4B560"/><stop offset="100%" stop-color="#B8923D"/>
    </linearGradient>
    <filter id="shadow" x="-10%" y="-10%" width="120%" height="120%"><feDropShadow dx="0" dy="2" stdDeviation="3" flood-opacity="0.15"/></filter>
    <filter id="shadowSm" x="-10%" y="-10%" width="120%" height="120%"><feDropShadow dx="0" dy="1" stdDeviation="1.5" flood-opacity="0.25"/></filter>
    <pattern id="mapBg" width="40" height="40" patternUnits="userSpaceOnUse"><rect width="40" height="40" fill="#F7F3E9"/><circle cx="2" cy="2" r="0.8" fill="#E5DCC3"/></pattern>
  </defs>

  <!-- Header -->
  <rect x="0" y="0" width="${W}" height="100" fill="#0d0d0d"/>
  <rect x="0" y="100" width="${W}" height="6" fill="url(#goldGrad)"/>
  <text x="50" y="48" font-size="13" letter-spacing="6" fill="#C9A84C" font-weight="600">SOMNIUM PROPERTIES</text>
  <text x="50" y="82" font-size="28" fill="#FFFFFF" font-weight="700">Estudo de Localização</text>
  <text x="${W - 50}" y="48" font-size="11" letter-spacing="2" fill="#888" font-weight="500" text-anchor="end">RELATÓRIO DE INVESTIDOR</text>
  <text x="${W - 50}" y="82" font-size="13" fill="#C9A84C" font-weight="600" text-anchor="end">${escapeXml(freguesia || imovelNome || '')}</text>
  <rect x="0" y="106" width="${W}" height="56" fill="#1a1a1a"/>
  <text x="50" y="142" font-size="18" fill="#FFFFFF" font-weight="600">📍 ${escapeXml(morada || '')}</text>

  <!-- Mapa satélite -->
  <g transform="translate(50, ${HEADER_H + 33})">
    ${mapaSvg}
    <!-- Bloco de legenda numerada (sobreposto, esquerda) -->
    <g transform="translate(14, 14)">
      <rect width="240" height="${pinsLegenda.length * 18 + 16}" rx="6" fill="#000000" opacity="0.55"/>
      ${legendaPins}
    </g>
    <!-- Marcador do imóvel na legenda (canto inferior esquerdo) -->
    <g transform="translate(14, ${mapH - 38})">
      <rect width="180" height="26" rx="4" fill="#000000" opacity="0.6"/>
      <circle cx="20" cy="13" r="9" fill="#C9A84C" stroke="#FFFFFF" stroke-width="1.5"/>
      <text x="20" y="17" text-anchor="middle" font-size="10" fill="#0d0d0d" font-weight="800">I</text>
      <text x="36" y="17" font-size="11" fill="#FFFFFF" font-weight="700">Imóvel</text>
    </g>
  </g>

  ${highlightsSvg}
  ${tabelaSvg}
  ${cardsSvg}

  <!-- Footer -->
  <g transform="translate(0, ${footerY})">
    <rect x="0" y="0" width="${W}" height="${FOOTER_H}" fill="#0d0d0d"/>
    <rect x="0" y="0" width="${W}" height="6" fill="url(#goldGrad)"/>
    <text x="50" y="36" font-size="11" fill="#C9A84C" font-weight="700" letter-spacing="3">SOMNIUM PROPERTIES</text>
    <text x="50" y="56" font-size="10" fill="#888">Estudo de localização · gerado para apresentação a investidor</text>
    <text x="50" y="74" font-size="9" fill="#666" font-style="italic">Distâncias e tempos calculados em modo de condução.</text>
    <text x="${W - 50}" y="56" font-size="10" fill="#888" text-anchor="end">Coimbra · Portugal</text>
    <text x="${W - 50}" y="74" font-size="9" fill="#666" font-style="italic" text-anchor="end">${escapeXml(imovelNome || '')}</text>
  </g>
</svg>`
}

// ── Pipeline completo ────────────────────────────────────────────

export async function runEstudoLocalizacao({ pool, supabaseStorage, imovelId, destinos, mode = 'driving', highlights = [], destaque = null, origem: origemOverride = null }) {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY
  if (!apiKey) throw new Error('GOOGLE_MAPS_API_KEY não configurada no servidor')
  if (!supabaseStorage) throw new Error('Supabase Storage não configurado (SUPABASE_SERVICE_KEY ausente)')

  const { rows: [imovel] } = await pool.query(
    'SELECT id, nome, morada, zona, pois_distancias FROM imoveis WHERE id = $1',
    [imovelId]
  )
  if (!imovel) throw new Error('Imóvel não encontrado')

  // Destinos: do request, ou recuperar do payload guardado em pois_distancias
  let destinosUsar = Array.isArray(destinos) ? destinos.filter(d => d?.endereco?.trim()) : []
  if (destinosUsar.length === 0 && imovel.pois_distancias?.resultados?.length > 0) {
    destinosUsar = imovel.pois_distancias.resultados.map(r => ({
      categoria: r.categoria, icone: r.icone, endereco: r.endereco, seccao: r.seccao
    })).filter(d => d.endereco?.trim())
  }
  if (destinosUsar.length === 0) throw new Error('Sem destinos: indica destinos ou corre "Calcular distâncias" antes')

  const origem = (origemOverride || imovel.morada || imovel.zona || '').trim()
  if (!origem) throw new Error('Imóvel sem morada — preenche o campo morada')

  // 1. Distance Matrix
  const { origem_resolvida, resultados } = await callDistanceMatrix({ origem, destinos: destinosUsar, mode, apiKey })

  // 2. Static Map satélite + rotas reais (Directions API para top 9 destinos)
  const okOrdenados = resultados.filter(r => r.status === 'OK').sort((a, b) => (a.distancia_metros ?? Infinity) - (b.distancia_metros ?? Infinity))
  const top9 = okOrdenados.slice(0, 9)
  const paths = await Promise.all(top9.map(d =>
    fetchRoutePolyline({ origem: origem_resolvida || origem, destino: d.endereco, apiKey, mode })
  ))
  const mapaPngBase64 = await fetchStaticSatelliteMap({
    origem: origem_resolvida || origem,
    destinos: okOrdenados,
    paths,
    apiKey,
  })

  // 3. Compose SVG
  const { freguesia, codigoPostal } = parseFreguesia(origem_resolvida)
  const svg = composeEstudoSvg({
    imovelNome: imovel.nome,
    morada: origem_resolvida,
    freguesia: freguesia ? `Coimbra · ${freguesia}` : null,
    resultados,
    highlights,
    destaque,
    modo: mode,
    mapaPngBase64,
  })

  // 4. Rasterizar SVG → PNG (PDFKit nao aceita SVG)
  const pngBuffer = rasterizarSvgParaPng(svg)

  // 5. Upload Supabase Storage
  const filename = `localizacao_estudo_auto_${Date.now()}.png`
  const storagePath = `imoveis/${imovelId}/${filename}`
  const { error: upErr } = await supabaseStorage.storage
    .from('Imoveis')
    .upload(storagePath, pngBuffer, { contentType: 'image/png', upsert: true })
  if (upErr) throw new Error(`Supabase Storage: ${upErr.message}`)
  const { data: urlData } = supabaseStorage.storage.from('Imoveis').getPublicUrl(storagePath)
  const publicUrl = urlData.publicUrl

  // 4. UPDATE imoveis
  const payload = {
    origem: origem_resolvida,
    mode,
    atualizado_em: new Date().toISOString(),
    resultados,
    highlights,
    destaque,
    codigo_postal: codigoPostal,
    freguesia,
  }
  await pool.query(
    `UPDATE imoveis
       SET pois_distancias = $1::jsonb,
           pois_atualizado_em = NOW(),
           localizacao_imagem = $2,
           morada = COALESCE(NULLIF($3,''), morada),
           updated_at = NOW()::text
     WHERE id = $4`,
    [JSON.stringify(payload), publicUrl, origem_resolvida, imovelId]
  )

  return {
    ok: true,
    imovel_id: imovelId,
    imovel_nome: imovel.nome,
    origem_resolvida,
    freguesia,
    codigo_postal: codigoPostal,
    localizacao_imagem: publicUrl,
    resultados,
  }
}
