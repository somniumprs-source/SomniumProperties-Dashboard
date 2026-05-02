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
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Largura alvo do PNG: ~4x oversample face ao espaco util da pagina A4
// (CW≈495pt @ 72dpi). Importante para a pagina LOCALIZACAO do dossier,
// onde a imagem ocupa toda a content width — texto da tabela de POIs e
// cards de highlights tem que ficar legivel sem zoom.
const PNG_TARGET_WIDTH = 2000

// Fontes Inter empacotadas no repo (public/fonts/*.ttf). Garantem render
// consistente em qualquer plataforma — em particular no Render (Linux,
// sem fontes sans-serif por defeito) onde de outra forma o Resvg cai
// num monospace courier-like que destoa do tema do dossier.
const FONTS_DIR = path.resolve(__dirname, '../../public/fonts')
const INTER_FILES = [
  path.join(FONTS_DIR, 'Inter-Regular.ttf'),
  path.join(FONTS_DIR, 'Inter-SemiBold.ttf'),
  path.join(FONTS_DIR, 'Inter-Bold.ttf'),
]

export function rasterizarSvgParaPng(svg, { largura = PNG_TARGET_WIDTH } = {}) {
  return new Resvg(svg, {
    fitTo: { mode: 'width', value: largura },
    font: {
      fontFiles: INTER_FILES,
      loadSystemFonts: false,
      defaultFontFamily: 'Inter',
    },
  }).render().asPng()
}

// ── Categorização & helpers ──────────────────────────────────────

const ICONE_PARA_SECCAO = {
  '🛣️': 'acessos', '✈️': 'acessos', '🚆': 'acessos', '🚇': 'acessos',
  '🎓': 'saude_universidade', '🏥': 'saude_universidade', '💊': 'saude_universidade', '🏫': 'saude_universidade',
  '🌳': 'lazer', '🌲': 'lazer', '🏖️': 'lazer', '🏰': 'lazer', '🏟️': 'lazer', '🎭': 'lazer',
  '🛒': 'comercio', '🛍️': 'comercio', '🚒': 'comercio', '🍽️': 'comercio', '☕': 'comercio',
}

// Cor por categoria — usado no badge antes do nome (substitui emojis
// que o Resvg nao consegue rasterizar sem a fonte de emojis do sistema).
const SECCOES = {
  acessos:            { titulo: 'ACESSOS',              cor: '#3B6EA8' },
  saude_universidade: { titulo: 'UNIV. & SAÚDE',        cor: '#2D6A2D' },
  lazer:              { titulo: 'LAZER & CULTURA',      cor: '#8B5A2B' },
  comercio:           { titulo: 'COMÉRCIO & SERVIÇOS',  cor: '#C9A84C' },
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
// Tema Somnium "light": fundo cream, accents gold, texto preto. Em linha
// com o resto do dossier de investidor (DocBuilder em pdfImovelDocs.js).

const W = 1200
const HEADER_H = 156   // header (96) + gold strip (4) + address bar (56)
const MAP_H = 640
const TABLE_BLOCK_H = 460  // tabela + cards (cards alargados)
const FOOTER_H = 80

// Tokens de cor alinhados com pdfImovelDocs.js (DocBuilder)
const T = {
  bg: '#f7f6f2', body: '#0d0d0d', muted: '#888888',
  border: '#e0ddd5', light: '#f0efe9', gold: '#C9A84C', goldDark: '#B8923D',
  green: '#2d6a2d', red: '#8b2020', white: '#FFFFFF',
}

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

  // Legenda dos pinos numerados 1..9 (canto superior esquerdo do mapa).
  // Bloco com fundo branco semi-opaco em vez do preto antigo, alinhado
  // com o tema light do dossier.
  const legendaPins = pinsLegenda.map((r, i) => {
    const y = 16 + i * 18
    const isDest = destaque && r.categoria && r.categoria.toLowerCase().includes(destaque.toLowerCase())
    return `
      <circle cx="20" cy="${y}" r="9" fill="${isDest ? T.gold : '#1a1a1a'}" stroke="${T.white}" stroke-width="1.2"/>
      <text x="20" y="${y + 3.5}" text-anchor="middle" font-size="10" fill="${T.white}" font-weight="800">${isDest ? '*' : (i + 1)}</text>
      <text x="36" y="${y + 4}" font-size="11" fill="${T.body}" font-weight="600">${escapeXml((r.categoria || '').slice(0, 26))}</text>
    `
  }).join('')

  // ----- Highlights row (opcional) — cards light com gold accent -----
  const highlightsH = highlights.length > 0 ? 160 : 0
  const highlightsSvg = highlights.length === 0 ? '' : `
    <g transform="translate(50, ${HEADER_H + 33 + MAP_H + 20})">
      ${highlights.slice(0, 2).map((h, i) => {
        const accent = h.accent === 'red' ? T.red : T.gold
        const x = i * 560
        return `<g transform="translate(${x}, 0)">
          <rect width="540" height="130" rx="6" fill="${T.white}" stroke="${T.border}" stroke-width="1"/>
          <rect width="6" height="130" rx="3" fill="${accent}"/>
          <text x="22" y="32" font-size="18" fill="${T.body}" font-weight="700">${escapeXml(h.titulo || '')}</text>
          <line x1="22" y1="42" x2="80" y2="42" stroke="${T.gold}" stroke-width="2"/>
          <text x="22" y="64" font-size="13" fill="#444" font-weight="500">${escapeXml(h.descricao || '')}</text>
          ${(() => {
            const badges = Array.isArray(h.badge) ? h.badge.filter(Boolean) : (h.badge ? [String(h.badge)] : [])
            if (badges.length === 0) {
              return `<text x="22" y="100" font-size="13" fill="${T.body}" font-weight="700">${escapeXml(h.subtitulo || '')}</text>`
            }
            const widths = badges.map(b => Math.max(46, b.length * 11 + 18))
            const totalW = widths.reduce((a, w) => a + w, 0) + (badges.length - 1) * 6
            let xOff = 0
            const boxes = badges.map((b, i) => {
              const w = widths[i]
              const fs = b.length > 4 ? 14 : 18
              const el = `<g transform="translate(${xOff}, 0)"><rect width="${w}" height="32" rx="4" fill="${T.body}"/><text x="${w/2}" y="${b.length > 4 ? 21 : 22}" text-anchor="middle" font-size="${fs}" fill="${T.gold}" font-weight="800">${escapeXml(b)}</text></g>`
              xOff += w + 6
              return el
            }).join('')
            return `
              <g transform="translate(22, 82)">${boxes}</g>
              <text x="${22 + totalW + 12}" y="103" font-size="11" fill="${T.muted}" font-style="italic">${escapeXml(h.subtitulo || '')}</text>`
          })()}
        </g>`
      }).join('')}
    </g>`

  // ----- Tabela principais — cabecalho dark, body light alternado -----
  const tableY = HEADER_H + 33 + MAP_H + 20 + highlightsH + (highlightsH > 0 ? 30 : 0)
  const tabelaSvg = `
    <g transform="translate(50, ${tableY})">
      <text x="0" y="0" font-size="18" fill="${T.body}" font-weight="700">Distâncias e tempos de carro</text>
      <line x1="0" y1="10" x2="540" y2="10" stroke="${T.gold}" stroke-width="2"/>
      <g transform="translate(0, 30)">
        <rect width="540" height="32" rx="4" fill="${T.body}"/>
        <text x="20" y="21" font-size="11" fill="${T.gold}" font-weight="700" letter-spacing="1">#</text>
        <text x="60" y="21" font-size="11" fill="${T.gold}" font-weight="700" letter-spacing="1">PONTO DE INTERESSE</text>
        <text x="400" y="21" font-size="11" fill="${T.gold}" font-weight="700" letter-spacing="1" text-anchor="end">DISTÂNCIA</text>
        <text x="510" y="21" font-size="11" fill="${T.gold}" font-weight="700" letter-spacing="1" text-anchor="end">CARRO</text>
      </g>
      <g transform="translate(0, 70)" font-size="13" fill="${T.body}">
        ${principais.map((r, i) => {
          const yRow = i * 34
          const fill = i % 2 === 0 ? T.light : T.white
          return `<rect x="0" y="${yRow}" width="540" height="34" fill="${fill}"/>
                  <text x="20" y="${yRow + 22}" font-weight="700">${i + 1}</text>
                  <text x="60" y="${yRow + 22}" font-weight="600">${escapeXml((r.categoria || r.endereco || '').slice(0, 35))}</text>
                  <text x="400" y="${yRow + 22}" text-anchor="end" font-weight="700">${escapeXml(r.distancia_texto || fmtKm(r.distancia_metros))}</text>
                  <text x="510" y="${yRow + 22}" text-anchor="end" font-weight="700">${escapeXml(r.duracao_texto || fmtMin(r.duracao_segundos))}</text>`
        }).join('')}
      </g>
    </g>`

  // ----- Cards por secção — 2x2, header gold light, sem overlap -----
  // Largura/altura calibradas para cabidos: card 260x210, nome ate 22
  // chars, valor compacto (km · h/min) alinhado a direita com folga de
  // 110px reservados para a coluna de valores.
  const CARD_W = 260
  const CARD_H = 210
  const CARD_GAP_X = 20
  const CARD_GAP_Y = 18
  const NOME_MAX = 22
  const cardsSvg = `
    <g transform="translate(610, ${tableY})">
      <text x="0" y="0" font-size="18" fill="${T.body}" font-weight="700">Pontos fortes da localização</text>
      <line x1="0" y1="10" x2="540" y2="10" stroke="${T.gold}" stroke-width="2"/>
      ${['acessos', 'saude_universidade', 'lazer', 'comercio'].map((sec, idx) => {
        const xCard = (idx % 2) * (CARD_W + CARD_GAP_X)
        const yCard = 30 + Math.floor(idx / 2) * (CARD_H + CARD_GAP_Y)
        const items = grupos[sec].slice(0, 6)
        if (items.length === 0) return ''
        const colorBar = SECCOES[sec].cor
        const linhas = items.map((r, i) => {
          const y = 50 + i * 24
          const isDestaque = destaque && r.categoria && r.categoria.toLowerCase().includes(destaque.toLowerCase())
          const colTxt = isDestaque ? T.goldDark : T.body
          const colVal = isDestaque ? T.goldDark : T.body
          const wTxt = isDestaque ? '700' : '500'
          const wVal = isDestaque ? '800' : '700'
          const nome = (r.categoria || '').slice(0, NOME_MAX)
          // Valor compacto: prefere fmtMin (curto: "1h50") ao texto Google
          // ("1 hora 50 minutos") para evitar overflow no card de 260px.
          const distancia = r.distancia_texto || fmtKm(r.distancia_metros)
          const duracao = fmtMin(r.duracao_segundos)
          const valor = `${distancia} · ${duracao}`
          return `
            ${isDestaque ? `<polygon points="6,${y - 8} 10,${y - 5} 6,${y - 2}" fill="${T.gold}"/>` : ''}
            <text x="14" y="${y}" font-weight="${wTxt}" fill="${colTxt}">${escapeXml(nome)}</text>
            <text x="${CARD_W - 14}" y="${y}" text-anchor="end" font-weight="${wVal}" fill="${colVal}">${escapeXml(valor)}</text>`
        }).join('')
        return `<g transform="translate(${xCard}, ${yCard})">
          <rect width="${CARD_W}" height="${CARD_H}" rx="6" fill="${T.white}" stroke="${T.border}" stroke-width="1"/>
          <!-- Header light com barra colorida e label dark -->
          <rect width="${CARD_W}" height="32" rx="6" fill="${T.light}"/>
          <rect y="20" width="${CARD_W}" height="12" fill="${T.light}"/>
          <rect width="4" height="32" fill="${colorBar}"/>
          <text x="14" y="21" font-size="12" fill="${T.body}" font-weight="700" letter-spacing="1.2">${escapeXml(SECCOES[sec].titulo)}</text>
          <line x1="0" y1="32" x2="${CARD_W}" y2="32" stroke="${T.border}" stroke-width="1"/>
          <g font-size="11">${linhas}</g>
        </g>`
      }).join('')}
    </g>`

  // ----- Total height & footer -----
  const totalH = tableY + TABLE_BLOCK_H + 30 + FOOTER_H
  const footerY = totalH - FOOTER_H

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${totalH}" font-family="Inter, sans-serif">
  <defs>
    <linearGradient id="goldGrad" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#D4B560"/><stop offset="100%" stop-color="#B8923D"/>
    </linearGradient>
    <filter id="shadow" x="-10%" y="-10%" width="120%" height="120%"><feDropShadow dx="0" dy="2" stdDeviation="3" flood-opacity="0.10"/></filter>
  </defs>

  <!-- Fundo geral cream (alinhado com C.bg do dossier) -->
  <rect x="0" y="0" width="${W}" height="${totalH}" fill="${T.bg}"/>

  <!-- Header light: linha gold no topo + bloco com titulo -->
  <rect x="0" y="0" width="${W}" height="4" fill="url(#goldGrad)"/>
  <rect x="0" y="4" width="${W}" height="92" fill="${T.bg}"/>
  <text x="50" y="40" font-size="11" letter-spacing="5" fill="${T.muted}" font-weight="600">SOMNIUM PROPERTIES</text>
  <text x="50" y="74" font-size="28" fill="${T.body}" font-weight="700">Estudo de Localização</text>
  <text x="${W - 50}" y="40" font-size="10" letter-spacing="2" fill="${T.muted}" font-weight="500" text-anchor="end">RELATÓRIO DE INVESTIDOR</text>
  <text x="${W - 50}" y="74" font-size="13" fill="${T.gold}" font-weight="600" text-anchor="end">${escapeXml(freguesia || imovelNome || '')}</text>
  <line x1="50" y1="92" x2="${W - 50}" y2="92" stroke="${T.gold}" stroke-width="1"/>

  <!-- Address bar light com pin vectorial -->
  <rect x="50" y="100" width="${W - 100}" height="48" rx="4" fill="${T.light}" stroke="${T.border}" stroke-width="1"/>
  <!-- Pin (gota): drop shape + circle interior -->
  <g transform="translate(72, 113)">
    <path d="M 0 8 C 0 3.6 3.6 0 8 0 C 12.4 0 16 3.6 16 8 C 16 14 8 22 8 22 C 8 22 0 14 0 8 Z" fill="${T.gold}"/>
    <circle cx="8" cy="8" r="3" fill="${T.white}"/>
  </g>
  <text x="98" y="130" font-size="15" fill="${T.body}" font-weight="600">${escapeXml(morada || '')}</text>

  <!-- Mapa satélite -->
  <g transform="translate(50, ${HEADER_H + 33})">
    ${mapaSvg}
    <!-- Bloco de legenda numerada: fundo branco semi-opaco + sombra -->
    <g transform="translate(14, 14)">
      <rect width="240" height="${pinsLegenda.length * 18 + 16}" rx="6" fill="${T.white}" opacity="0.94" stroke="${T.border}" stroke-width="0.5"/>
      ${legendaPins}
    </g>
    <!-- Marcador do imóvel: pill branca com pin gold -->
    <g transform="translate(14, ${mapH - 38})">
      <rect width="180" height="26" rx="13" fill="${T.white}" opacity="0.94" stroke="${T.border}" stroke-width="0.5"/>
      <circle cx="20" cy="13" r="9" fill="${T.gold}" stroke="${T.white}" stroke-width="1.5"/>
      <text x="20" y="17" text-anchor="middle" font-size="10" fill="${T.body}" font-weight="800">I</text>
      <text x="36" y="17.5" font-size="11" fill="${T.body}" font-weight="700">Imóvel</text>
    </g>
  </g>

  ${highlightsSvg}
  ${tabelaSvg}
  ${cardsSvg}

  <!-- Footer light -->
  <g transform="translate(0, ${footerY})">
    <line x1="50" y1="0" x2="${W - 50}" y2="0" stroke="${T.gold}" stroke-width="1"/>
    <text x="50" y="32" font-size="10" fill="${T.muted}" font-weight="700" letter-spacing="2.5">SOMNIUM PROPERTIES</text>
    <text x="50" y="50" font-size="9" fill="${T.muted}">Estudo de localização · gerado para apresentação a investidor</text>
    <text x="50" y="66" font-size="9" fill="${T.muted}" font-style="italic">Distâncias e tempos calculados em modo de condução.</text>
    <text x="${W - 50}" y="32" font-size="9" fill="${T.muted}" text-anchor="end">Coimbra · Portugal</text>
    <text x="${W - 50}" y="50" font-size="9" fill="${T.muted}" font-style="italic" text-anchor="end">${escapeXml(imovelNome || '')}</text>
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
