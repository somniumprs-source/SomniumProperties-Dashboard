/**
 * Gerador automático de Estudos de Localização para imóveis CRM.
 *
 * Pipeline:
 *  1. Distance Matrix API (Google) — distâncias e tempos a partir da morada do imóvel
 *  2. Composição de SVG branded Somnium (mapa radial + tabela + cards por secção)
 *  3. Upload para Supabase Storage (bucket Imoveis)
 *  4. UPDATE imoveis.localizacao_imagem + pois_distancias
 */

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
}) {
  const ok = resultados.filter(r => r.status === 'OK')
                       .sort((a, b) => (a.distancia_metros ?? Infinity) - (b.distancia_metros ?? Infinity))
  const maxKm = Math.max(...ok.map(r => (r.distancia_metros || 0) / 1000), 1)

  // top 7 para tabela
  const principais = ok.slice(0, 7)
  // agrupar todos por secção
  const grupos = { acessos: [], saude_universidade: [], lazer: [], comercio: [] }
  ok.forEach(r => { const sec = categorizar(r); if (grupos[sec]) grupos[sec].push(r) })
  // dentro de cada secção sort by distance ascending
  Object.values(grupos).forEach(arr => arr.sort((a, b) => a.distancia_metros - b.distancia_metros))

  // ----- Mapa radial -----
  // Property pin centro-baixo. Pins distribuídos por golden-angle, raio ∝ log(km).
  const mapW = 1100, mapH = MAP_H
  const cx = mapW / 2, cy = mapH / 2 + 20
  const maxR = 240
  const logMax = Math.log10(maxKm + 1)
  const pinPos = (km, idx) => {
    const rNorm = Math.log10((km || 0) + 1) / logMax
    const r = Math.max(40, rNorm * maxR)
    const angle = ((idx * 137.508) - 90) * Math.PI / 180
    return { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) }
  }

  // Anéis a desenhar: 1, 2, 5, 10, 25, 50, 100 km — só os que cabem
  const ringKm = [1, 2, 5, 10, 25, 50, 100, 200].filter(k => k <= maxKm * 1.2)
  const ringsSvg = ringKm.map(k => {
    const r = Math.log10(k + 1) / logMax * maxR
    return `<circle cx="${cx}" cy="${cy}" r="${r.toFixed(1)}" fill="none" stroke="#D9CFA7" stroke-width="1" stroke-dasharray="3 4" opacity="0.6"/>
            <text x="${cx + r}" y="${cy - 4}" font-size="9" fill="#9A8A4F" font-weight="600" text-anchor="middle">${k} km</text>`
  }).join('')

  // Pins
  const pinsSvg = ok.map((r, i) => {
    const { x, y } = pinPos((r.distancia_metros || 0) / 1000, i)
    const isDestaque = destaque && r.categoria && r.categoria.toLowerCase().includes(destaque.toLowerCase())
    const idxNum = i + 1
    const fill = isDestaque ? '#C9A84C' : '#0d0d0d'
    const stroke = isDestaque ? '#0d0d0d' : 'none'
    const strokeW = isDestaque ? 2 : 0
    const radius = isDestaque ? 16 : 13
    const labelOffsetY = -22
    return `<g>
      <line x1="${cx}" y1="${cy}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" stroke="#C9A84C" stroke-width="0.8" stroke-dasharray="2 3" opacity="0.4"/>
      <circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${radius}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeW}" filter="url(#shadowSm)"/>
      <text x="${x.toFixed(1)}" y="${(y + 4).toFixed(1)}" text-anchor="middle" font-size="${isDestaque ? 11 : 12}" fill="${isDestaque ? '#0d0d0d' : '#FFFFFF'}" font-weight="800">${isDestaque ? '★' : idxNum}</text>
      <text x="${x.toFixed(1)}" y="${(y + labelOffsetY).toFixed(1)}" text-anchor="middle" font-size="10" fill="#0d0d0d" font-weight="700">${escapeXml((r.categoria || '').slice(0, 22))}</text>
      <text x="${x.toFixed(1)}" y="${(y - labelOffsetY).toFixed(1)}" text-anchor="middle" font-size="9" fill="#555" font-weight="600">${escapeXml(r.distancia_texto || fmtKm(r.distancia_metros))} · ${escapeXml(r.duracao_texto || fmtMin(r.duracao_segundos))}</text>
    </g>`
  }).join('')

  // Property pin
  const imovelPin = `
    <g transform="translate(${cx}, ${cy})">
      <circle r="32" fill="url(#goldGrad)" stroke="#0d0d0d" stroke-width="3" filter="url(#shadow)"/>
      <path d="M0,-18 L5,-5 L19,-5 L8,3 L12,16 L0,8 L-12,16 L-8,3 L-19,-5 L-5,-5 Z" fill="#0d0d0d"/>
      <rect x="-115" y="-72" width="230" height="34" rx="4" fill="#0d0d0d" filter="url(#shadowSm)"/>
      <text y="-50" text-anchor="middle" font-size="12" fill="#C9A84C" font-weight="700">IMÓVEL · ${escapeXml((imovelNome || '').slice(0, 30))}</text>
    </g>`

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
          ${h.badge ? `
            <g transform="translate(20, 88)">
              <rect width="76" height="36" rx="6" fill="#0d0d0d"/>
              <text x="38" y="24" text-anchor="middle" font-size="20" fill="#C9A84C" font-weight="800">${escapeXml(h.badge)}</text>
            </g>
            <text x="106" y="121" font-size="11" fill="#888" font-style="italic">${escapeXml(h.subtitulo || '')}</text>
          ` : `<text x="20" y="106" font-size="13" fill="#0d0d0d" font-weight="700">${escapeXml(h.subtitulo || '')}</text>`}
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

  <!-- Mapa radial -->
  <g transform="translate(50, ${HEADER_H + 33})">
    <rect width="${mapW}" height="${mapH}" rx="8" fill="url(#mapBg)" stroke="#E0D5B5" stroke-width="1"/>
    <g transform="translate(${mapW - 70}, 50)">
      <circle r="22" fill="#FFFFFF" stroke="#C9A84C" stroke-width="1.5"/>
      <path d="M0,-16 L4,0 L0,16 L-4,0 Z" fill="#0d0d0d"/>
      <text y="-26" text-anchor="middle" font-size="10" font-weight="700" fill="#0d0d0d">N</text>
    </g>
    <g transform="translate(20, 30)">
      <rect width="280" height="36" rx="4" fill="#FFFFFF" stroke="#E0D5B5" stroke-width="1"/>
      <circle cx="22" cy="18" r="9" fill="url(#goldGrad)" stroke="#0d0d0d" stroke-width="1.5"/>
      <text x="38" y="22" font-size="11" fill="#0d0d0d" font-weight="600">Imóvel</text>
      ${destaque ? '<circle cx="100" cy="18" r="8" fill="#C9A84C" stroke="#0d0d0d" stroke-width="1.5"/><text x="113" y="22" font-size="11" fill="#0d0d0d" font-weight="600">Destaque</text>' : ''}
      <circle cx="${destaque ? 180 : 100}" cy="18" r="8" fill="#0d0d0d"/>
      <text x="${destaque ? 193 : 113}" y="22" font-size="11" fill="#0d0d0d" font-weight="600">Pontos · # = nº na tabela</text>
    </g>
    ${ringsSvg}
    ${pinsSvg}
    ${imovelPin}
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

  // 2. Compose SVG
  const { freguesia, codigoPostal } = parseFreguesia(origem_resolvida)
  const svg = composeEstudoSvg({
    imovelNome: imovel.nome,
    morada: origem_resolvida,
    freguesia: freguesia ? `Coimbra · ${freguesia}` : null,
    resultados,
    highlights,
    destaque,
    modo: mode,
  })

  // 3. Upload Supabase Storage
  const filename = `localizacao_estudo_auto_${Date.now()}.svg`
  const storagePath = `imoveis/${imovelId}/${filename}`
  const { error: upErr } = await supabaseStorage.storage
    .from('Imoveis')
    .upload(storagePath, Buffer.from(svg, 'utf8'), { contentType: 'image/svg+xml', upsert: true })
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
