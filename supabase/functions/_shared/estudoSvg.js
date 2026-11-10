// @ts-nocheck
/**
 * Composição da imagem do Estudo de Localização (SVG no layout Somnium:
 * cabeçalho, mapa com legenda numerada, destaques, tabela de tempos e cartões
 * por secção). JS simples, sem dependências: corre no browser (a imagem é
 * gerada e rasterizada no browser, porque a Edge Function não tem CPU para
 * isso) e no Node.
 */

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
  acessos:            { titulo: 'TRANSPORTES',          cor: '#3B6EA8' },
  saude_universidade: { titulo: 'SAÚDE & EDUCAÇÃO',     cor: '#2D6A2D' },
  lazer:              { titulo: 'LAZER & DESPORTO',      cor: '#8B5A2B' },
  comercio:           { titulo: 'COMÉRCIO & SERVIÇOS',  cor: '#C9A84C' },
}

function categorizar(r) {
  if (r.seccao && SECCOES[r.seccao]) return r.seccao
  return ICONE_PARA_SECCAO[r.icone] || 'comercio'
}

function escapeXml(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

// Remove emojis e variation selectors no inicio (e.g. "🚌 SMTUC" → "SMTUC").
// Inter nao tem glifos para emojis, deixariam caixas de fallback.
function stripLeadingEmoji(s) {
  if (!s) return ''
  return String(s).replace(/^(?:\p{Extended_Pictographic}|️|‍|\s)+/u, '').trim()
}

// Trunca por numero de chars com ellipsis.
function ellide(s, max) {
  const t = String(s ?? '')
  return t.length > max ? t.slice(0, max - 1).trim() + '…' : t
}

// Quebra texto em linhas pelo numero maximo de chars por linha
// (palavra-aware). Devolve array com no maximo `maxLinhas` linhas
// — se ultrapassar, ultima linha e ellided.
function quebrarLinhas(text, maxChars, maxLinhas = 2) {
  const t = String(text ?? '').trim()
  if (!t) return []
  if (t.length <= maxChars) return [t]
  const palavras = t.split(/\s+/)
  const linhas = []
  let cur = ''
  for (const w of palavras) {
    const tentativa = cur ? `${cur} ${w}` : w
    if (tentativa.length > maxChars) {
      if (cur) linhas.push(cur)
      cur = w
      if (linhas.length >= maxLinhas) break
    } else {
      cur = tentativa
    }
  }
  if (cur && linhas.length < maxLinhas) linhas.push(cur)
  if (linhas.length === maxLinhas && palavras.length > linhas.join(' ').split(/\s+/).length) {
    linhas[maxLinhas - 1] = ellide(linhas[maxLinhas - 1], maxChars)
  }
  return linhas
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
  if (min < 1) return '< 1 min'
  if (min >= 60) {
    const h = Math.floor(min / 60)
    const m = min % 60
    return m === 0 ? `${h}h` : `${h}h${String(m).padStart(2, '0')}`
  }
  return `${min} min`
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
  green: '#16a34a', red: '#8b2020', white: '#FFFFFF',
}

// Mapeia região → distrito mostrado nos PDFs/imagens. Default Coimbra para
// retro-compatibilidade (a maioria do histórico não tinha região definida).
function distritoDeRegiao(regiao) {
  if (regiao === 'AMP') return 'Área Metropolitana do Porto'
  return 'Coimbra'
}

export function composeEstudoSvg({
  imovelNome,
  morada,
  freguesia,
  regiao = null,         // 'Coimbra' | 'AMP' — controla footer e prefixo do subtítulo
  resultados = [],
  highlights = [],
  destaque = null,    // categoria/string a marcar como ★ gold
  modo = 'driving',
  mapaPngBase64 = null, // imagem satélite Google Static Maps
  mapaSvgPronto = null, // mapa já em SVG (OpenStreetMap, ver estudoMapaOSM.js)
}) {
  const distrito = distritoDeRegiao(regiao)
  // Estudos com os três meios (OpenStreetMap, desde 11/2026) ordenam pela distância a pé.
  const tresMeios = resultados.some(r => r.bicicleta)
  const chave = r => (tresMeios ? r.pe?.distancia_metros : null) ?? r.distancia_metros ?? Infinity
  const ok = resultados.filter(r => r.status === 'OK').sort((a, b) => chave(a) - chave(b))

  // top 7 para tabela
  const principais = ok.slice(0, 7)
  // agrupar todos por secção
  const grupos = { acessos: [], saude_universidade: [], lazer: [], comercio: [] }
  ok.forEach(r => { const sec = categorizar(r); if (grupos[sec]) grupos[sec].push(r) })
  Object.values(grupos).forEach(arr => arr.sort((a, b) => chave(a) - chave(b)))

  // ----- Mapa satélite (Google Static Maps) -----
  const mapW = 1100, mapH = MAP_H

  // Lista de pinos para legenda (1..9, matching markers no PNG)
  // Estudos novos: todos os aprovados numerados no mapa, com a legenda por baixo.
  const pinsLegenda = tresMeios ? ok : ok.slice(0, 9)
  const COLS_LEG = 3, LEG_ROW = 22
  const legendaH = tresMeios ? Math.ceil(ok.length / COLS_LEG) * LEG_ROW + 30 : 0
  const yAposMapa = HEADER_H + 33 + MAP_H + 20 + legendaH + (tresMeios ? 16 : 0)
  // Legenda: primeiro os números do mapa; depois, com um ponto e sem número, os que ficam fora do mapa.
  const noMapa = ok.filter(r => r.numero != null).sort((a, b) => a.numero - b.numero)
  const foraMapa = ok.filter(r => r.numero == null)
  const legendaItens = [...noMapa, ...foraMapa]
  const legendaAbaixoSvg = !tresMeios ? '' : `
    <g transform="translate(50, ${HEADER_H + 33 + MAP_H + 16})">
      <rect width="1100" height="${legendaH - 10}" rx="6" fill="${T.white}" stroke="${T.border}" stroke-width="1"/>
      <g transform="translate(14, 0)">
        ${legendaItens.map((r, i) => {
          const porCol = Math.ceil(legendaItens.length / COLS_LEG)
          const col = Math.floor(i / porCol), lin = i % porCol
          const x = col * 360, y = 22 + lin * LEG_ROW
          const isDest = destaque && r.categoria && r.categoria.toLowerCase().includes(destaque.toLowerCase())
          const marca = r.numero != null
            ? `<circle cx="9" cy="-4" r="9" fill="${isDest ? T.gold : '#1a1a1a'}"/>
               <text x="9" y="-0.5" text-anchor="middle" font-size="${r.numero > 9 ? 8.5 : 10}" fill="${isDest ? T.body : T.white}" font-weight="800">${r.numero}</text>`
            : `<circle cx="9" cy="-4" r="4.5" fill="${isDest ? T.gold : SECCOES[categorizar(r)]?.cor || T.muted}"/>`
          return `<g transform="translate(${x}, ${y})">
            ${marca}
            <text x="25" y="0" font-size="11" fill="${r.numero != null ? T.body : '#555'}" font-weight="600">${escapeXml(ellide(r.categoria || '', 30))}</text>
            ${r.numero == null ? `<text x="330" y="0" font-size="9" fill="${T.muted}" font-style="italic" text-anchor="end">fora do mapa</text>` : ''}
          </g>`
        }).join('')}
      </g>
    </g>`

  const mapaSvg = mapaSvgPronto ? mapaSvgPronto : mapaPngBase64
    ? `
      <defs>
        <clipPath id="mapClip"><rect x="0" y="0" width="${mapW}" height="${mapH}" rx="8"/></clipPath>
      </defs>
      <image x="0" y="0" width="${mapW}" height="${mapH}" preserveAspectRatio="xMidYMid slice"
             clip-path="url(#mapClip)" href="data:image/png;base64,${mapaPngBase64}"/>
      <!-- Atribuição -->
      <rect x="${mapW - 150}" y="${mapH - 24}" width="138" height="18" rx="3" fill="#000000" opacity="0.5"/>
      <text x="${mapW - 12}" y="${mapH - 10}" font-size="10" fill="#FFFFFF" text-anchor="end" font-weight="600">Imagem do mapa</text>`
    : `
      <rect x="0" y="0" width="${mapW}" height="${mapH}" rx="8" fill="#FAEAEA" stroke="#C97070" stroke-width="2"/>
      <text x="${mapW/2}" y="${mapH/2}" text-anchor="middle" font-size="18" fill="#8B2A2A" font-weight="700">Mapa não disponível</text>`

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
  // Cada card 540 wide. A 13px Inter (~7.5px/char) cabe ~62 chars de
  // descricao por linha; acima quebra em 2 linhas. Para simetria visual
  // os 2 cards ficam com altura maxima do mais alto.
  const HIGHLIGHT_W = 540
  const DESC_MAX_CHARS = 62
  const hData = highlights.slice(0, 2).map(h => {
    const descLinhas = quebrarLinhas(h.descricao || '', DESC_MAX_CHARS, 2)
    return {
      h,
      titulo: stripLeadingEmoji(h.titulo || ''),
      subtitulo: stripLeadingEmoji(h.subtitulo || ''),
      descLinhas,
    }
  })
  const maxDescLinhas = Math.max(1, ...hData.map(d => d.descLinhas.length))
  const cardH = 130 + (maxDescLinhas > 1 ? 16 : 0)
  const badgeY = maxDescLinhas > 1 ? 98 : 82
  const subY = maxDescLinhas > 1 ? 119 : 103
  const highlightsH = highlights.length > 0 ? cardH + 20 : 0
  const highlightsSvg = highlights.length === 0 ? '' : `
    <g transform="translate(50, ${yAposMapa})">
      ${hData.map(({ h, titulo, subtitulo, descLinhas }, i) => {
        const accent = h.accent === 'red' ? T.red : T.gold
        const x = i * 560
        const descSvg = descLinhas.map((l, k) =>
          `<tspan x="22" dy="${k === 0 ? 0 : 16}">${escapeXml(l)}</tspan>`
        ).join('')
        return `<g transform="translate(${x}, 0)">
          <rect width="${HIGHLIGHT_W}" height="${cardH}" rx="6" fill="${T.white}" stroke="${T.border}" stroke-width="1"/>
          <rect width="6" height="${cardH}" rx="3" fill="${accent}"/>
          <text x="22" y="32" font-size="18" fill="${T.body}" font-weight="700">${escapeXml(titulo)}</text>
          <line x1="22" y1="42" x2="80" y2="42" stroke="${T.gold}" stroke-width="2"/>
          <text x="22" y="64" font-size="13" fill="#444" font-weight="500">${descSvg}</text>
          ${(() => {
            const badges = Array.isArray(h.badge) ? h.badge.filter(Boolean) : (h.badge ? [String(h.badge)] : [])
            if (badges.length === 0) {
              return `<text x="22" y="${badgeY + 18}" font-size="13" fill="${T.body}" font-weight="700">${escapeXml(subtitulo)}</text>`
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
              <g transform="translate(22, ${badgeY})">${boxes}</g>
              <text x="${22 + totalW + 12}" y="${subY}" font-size="11" fill="${T.muted}" font-style="italic">${escapeXml(subtitulo)}</text>`
          })()}
        </g>`
      }).join('')}
    </g>`

  // ----- Tabela principais — cabecalho dark, body light alternado -----
  const tableY = yAposMapa + highlightsH + (highlightsH > 0 ? 30 : 0)
  const tabelaSvg = `
    <g transform="translate(50, ${tableY})">
      <text x="0" y="0" font-size="18" fill="${T.body}" font-weight="700">${tresMeios ? 'Distâncias e tempos — a pé, bicicleta e carro' : 'Distâncias e tempos — carro e a pé'}</text>
      <line x1="0" y1="10" x2="540" y2="10" stroke="${T.gold}" stroke-width="2"/>
      <g transform="translate(0, 30)">
        <rect width="540" height="32" rx="4" fill="${T.body}"/>
        <text x="18" y="21" font-size="11" fill="${T.gold}" font-weight="700" letter-spacing="1">#</text>
        <text x="44" y="21" font-size="11" fill="${T.gold}" font-weight="700" letter-spacing="1">PONTO DE INTERESSE</text>
        ${tresMeios ? `
        <text x="300" y="21" font-size="11" fill="${T.gold}" font-weight="700" letter-spacing="1" text-anchor="end">DIST.</text>
        <text x="380" y="21" font-size="11" fill="${T.gold}" font-weight="700" letter-spacing="1" text-anchor="end">A PÉ</text>
        <text x="460" y="21" font-size="11" fill="${T.gold}" font-weight="700" letter-spacing="1" text-anchor="end">BICICLETA</text>
        <text x="530" y="21" font-size="11" fill="${T.gold}" font-weight="700" letter-spacing="1" text-anchor="end">CARRO</text>` : `
        <text x="385" y="21" font-size="11" fill="${T.gold}" font-weight="700" letter-spacing="1" text-anchor="end">CARRO</text>
        <text x="535" y="21" font-size="11" fill="${T.gold}" font-weight="700" letter-spacing="1" text-anchor="end">A PÉ</text>`}
      </g>
      <g transform="translate(0, 70)" font-size="13" fill="${T.body}">
        ${principais.map((r, i) => {
          const yRow = i * 34
          const fill = i % 2 === 0 ? T.light : T.white
          const carroTxt = `${fmtKm(r.distancia_metros)} · ${fmtMin(r.duracao_segundos)}`
          const pe = r.pe
          const peDentro5km = pe && pe.status === 'OK' && pe.distancia_metros != null && pe.distancia_metros <= 5000
          const peTxt = peDentro5km ? `${fmtKm(pe.distancia_metros)} · ${fmtMin(pe.duracao_segundos)}` : '—'
          if (tresMeios) {
            return `<rect x="0" y="${yRow}" width="540" height="34" fill="${fill}"/>
                  ${r.numero != null ? `<text x="18" y="${yRow + 22}" font-weight="700">${r.numero}</text>` : `<circle cx="22" cy="${yRow + 17}" r="4" fill="${T.muted}"/>`}
                  <text x="44" y="${yRow + 22}" font-weight="600">${escapeXml(ellide(r.categoria || r.endereco || '', 24))}</text>
                  <text x="300" y="${yRow + 22}" text-anchor="end" font-weight="500" fill="${T.muted}">${escapeXml(fmtKm(pe?.distancia_metros ?? r.distancia_metros))}</text>
                  <text x="380" y="${yRow + 22}" text-anchor="end" font-weight="700">${escapeXml(peDentro5km ? fmtMin(pe.duracao_segundos) : '—')}</text>
                  <text x="460" y="${yRow + 22}" text-anchor="end" font-weight="600">${escapeXml(fmtMin(r.bicicleta?.duracao_segundos))}</text>
                  <text x="530" y="${yRow + 22}" text-anchor="end" font-weight="600">${escapeXml(fmtMin(r.duracao_segundos))}</text>`
          }
          return `<rect x="0" y="${yRow}" width="540" height="34" fill="${fill}"/>
                  <text x="18" y="${yRow + 22}" font-weight="700">${i + 1}</text>
                  <text x="44" y="${yRow + 22}" font-weight="600">${escapeXml((r.categoria || r.endereco || '').slice(0, 28))}</text>
                  <text x="385" y="${yRow + 22}" text-anchor="end" font-weight="700">${escapeXml(carroTxt)}</text>
                  <text x="535" y="${yRow + 22}" text-anchor="end" font-weight="600" fill="${T.muted}">${escapeXml(peTxt)}</text>`
        }).join('')}
        <text x="0" y="${principais.length * 34 + 16}" font-size="10" fill="${T.muted}" font-style="italic">${tresMeios ? 'Distância pelo percurso a pé. A pé indicado até 5 km.' : 'A pé indicado até 5 km de distância.'}</text>
      </g>
    </g>`

  // ----- Cards por secção — 2x2, header light com barra colorida -----
  // Card 260x210. A 11px Inter (~6.0px/char) cabem ~21 chars na coluna
  // do nome (~127px) com 105px reservados para valor + 14px padding cada
  // lado. Truncamos a 19 chars + ellipsis para folga visual confortavel.
  const CARD_W = 260
  const CARD_H = 210
  const CARD_GAP_X = 20
  const CARD_GAP_Y = 18
  const NOME_MAX = 19
  const VALOR_X = CARD_W - 14
  const cardsSvg = `
    <g transform="translate(610, ${tableY})">
      <text x="0" y="0" font-size="18" fill="${T.body}" font-weight="700">Pontos fortes da localização</text>
      <line x1="0" y1="10" x2="540" y2="10" stroke="${T.gold}" stroke-width="2"/>
      ${['acessos', 'saude_universidade', 'lazer', 'comercio'].map((sec, idx) => {
        const xCard = (idx % 2) * (CARD_W + CARD_GAP_X)
        const yCard = 30 + Math.floor(idx / 2) * (CARD_H + CARD_GAP_Y)
        const items = grupos[sec].slice(0, 5)
        if (items.length === 0) return ''
        const colorBar = SECCOES[sec].cor
        const linhas = items.map((r, i) => {
          const y = 50 + i * 30
          const isDestaque = destaque && r.categoria && r.categoria.toLowerCase().includes(destaque.toLowerCase())
          const colTxt = isDestaque ? T.goldDark : T.body
          const colVal = isDestaque ? T.goldDark : T.body
          const wTxt = isDestaque ? '700' : '500'
          const wVal = isDestaque ? '800' : '700'
          const nome = ellide(r.categoria || '', tresMeios ? 15 : NOME_MAX)
          // Valor compacto: prefere fmtMin (curto: "1h50") ao texto Google
          // ("1 hora 50 minutos") para evitar overflow no card.
          const distancia = r.distancia_texto || fmtKm(r.distancia_metros)
          const duracao = fmtMin(r.duracao_segundos)
          const valor = `${distancia} · ${duracao}`
          // Tempo a pé numa 2.ª linha — só até 5 km (acima não faz sentido).
          const pe = r.pe
          const peDentro5km = pe && pe.status === 'OK' && pe.distancia_metros != null && pe.distancia_metros <= 5000
          let valorPe = peDentro5km ? `a pé ${fmtMin(pe.duracao_segundos)}` : ''
          let valorLinha1 = valor
          if (tresMeios) {
            // Perto: a pé em destaque; longe: carro. Os outros dois meios na 2.ª linha.
            const longe = !peDentro5km || pe.distancia_metros > 2000
            valorLinha1 = longe ? `${fmtKm(r.distancia_metros)} · carro ${fmtMin(r.duracao_segundos)}` : `${fmtKm(pe.distancia_metros)} · a pé ${fmtMin(pe.duracao_segundos)}`
            valorPe = longe
              ? [peDentro5km && `a pé ${fmtMin(pe.duracao_segundos)}`, r.bicicleta && `bicicleta ${fmtMin(r.bicicleta.duracao_segundos)}`].filter(Boolean).join(' · ')
              : [r.bicicleta && `bicicleta ${fmtMin(r.bicicleta.duracao_segundos)}`, `carro ${fmtMin(r.duracao_segundos)}`].filter(Boolean).join(' · ')
          }
          return `
            ${isDestaque ? `<polygon points="6,${y - 8} 10,${y - 5} 6,${y - 2}" fill="${T.gold}"/>` : ''}
            <text x="14" y="${y}" font-weight="${wTxt}" fill="${colTxt}">${escapeXml(nome)}</text>
            <text x="${VALOR_X}" y="${y}" text-anchor="end" font-weight="${wVal}" fill="${colVal}">${escapeXml(valorLinha1)}</text>
            ${valorPe ? `<text x="${VALOR_X}" y="${y + 13}" text-anchor="end" font-size="10" font-weight="500" fill="${T.muted}">${escapeXml(valorPe)}</text>` : ''}`
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
    ${tresMeios ? '' : `<!-- Bloco de legenda numerada: fundo branco semi-opaco + sombra -->
    <g transform="translate(14, 14)">
      <rect width="240" height="${pinsLegenda.length * 18 + 16}" rx="6" fill="${T.white}" opacity="0.94" stroke="${T.border}" stroke-width="0.5"/>
      ${legendaPins}
    </g>`}
    <!-- Marcador do imóvel: pill branca com pin gold -->
    <g transform="translate(14, ${mapH - 38})">
      <rect width="180" height="26" rx="13" fill="${T.white}" opacity="0.94" stroke="${T.border}" stroke-width="0.5"/>
      <circle cx="20" cy="13" r="9" fill="${T.green}" stroke="${T.white}" stroke-width="1.5"/>
      <text x="20" y="17" text-anchor="middle" font-size="10" fill="${T.white}" font-weight="800">I</text>
      <text x="36" y="17.5" font-size="11" fill="${T.body}" font-weight="700">Imóvel</text>
    </g>
  </g>

  ${legendaAbaixoSvg}
  ${highlightsSvg}
  ${tabelaSvg}
  ${cardsSvg}

  <!-- Footer light -->
  <g transform="translate(0, ${footerY})">
    <line x1="50" y1="0" x2="${W - 50}" y2="0" stroke="${T.gold}" stroke-width="1"/>
    <text x="50" y="32" font-size="10" fill="${T.muted}" font-weight="700" letter-spacing="2.5">SOMNIUM PROPERTIES</text>
    <text x="50" y="50" font-size="9" fill="${T.muted}">Estudo de localização · gerado para apresentação a investidor</text>
    <text x="50" y="66" font-size="9" fill="${T.muted}" font-style="italic">${tresMeios ? 'Tempos a pé, de bicicleta e de carro por rotas reais (OSRM) · Imagem: DGT, OrtoSat 2023 · Dados: © contribuidores do OpenStreetMap' : 'Distâncias e tempos calculados em modo de condução.'}</text>
    <text x="${W - 50}" y="32" font-size="9" fill="${T.muted}" text-anchor="end">${escapeXml(distrito)} · Portugal</text>
    <text x="${W - 50}" y="50" font-size="9" fill="${T.muted}" font-style="italic" text-anchor="end">${escapeXml(imovelNome || '')}</text>
  </g>
</svg>`
}
