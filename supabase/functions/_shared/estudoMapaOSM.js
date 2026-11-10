// @ts-nocheck
/**
 * Mapa do Estudo de Localização sem Google (gratuito): imagem de satélite
 * OrtoSat 2023 da DGT (dados abertos; mosaicos do OpenStreetMap se a DGT
 * falhar), rotas reais do OSRM (FOSSGIS) e marcadores Somnium,
 * devolvido como fragmento SVG para o composeEstudoSvg (mesma caixa de 1100×640).
 * Usado quando o estudo é gerado a partir dos pontos de interesse aprovados
 * na Análise IA da localização. Importado pela Edge Function e pelo Express.
 */

import { composeEstudoSvg } from './estudoSvg.js'

const EM_BROWSER = typeof window !== 'undefined'
const UA = EM_BROWSER ? {} : { 'User-Agent': 'SomniumCRM/1.0 (estudo-localizacao)' }
const TILE = 256
export const DGT_SATELITE = { url: 'https://ortos.dgterritorio.gov.pt/wms/ortosat2023', camada: 'ortoSat2023-CorVerdadeira' }
const MERC = 20037508.342789244

// Satélite DGT para o retângulo em píxeis (zoom z) — um único GetMap WMS em EPSG:3857.
async function sateliteDGT({ ox, oy, w, h, z }) {
  const res = (2 * MERC) / (TILE * 2 ** z)
  const bbox = [ox * res - MERC, MERC - (oy + h) * res, (ox + w) * res - MERC, MERC - oy * res].map((v) => v.toFixed(2)).join(',')
  const url = `${DGT_SATELITE.url}?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap&LAYERS=${DGT_SATELITE.camada}&STYLES=&CRS=EPSG:3857&BBOX=${bbox}&WIDTH=${w * 2}&HEIGHT=${h * 2}&FORMAT=image/jpeg`
  const r = await comPrazo(url, 40000)
  if (!r.ok || !(r.headers.get('content-type') || '').startsWith('image/')) return null
  return `<image x="0" y="0" width="${w}" height="${h}" preserveAspectRatio="none" href="data:image/jpeg;base64,${base64(await r.arrayBuffer())}"/>`
}

const px = (lat, lng, z) => {
  const n = TILE * 2 ** z
  const s = Math.sin((lat * Math.PI) / 180)
  return { x: ((lng + 180) / 360) * n, y: (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * n }
}

function base64(buf) {
  const bytes = new Uint8Array(buf)
  let s = ''
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000))
  return btoa(s)
}

async function comPrazo(url, ms = 15000) {
  const ctl = new AbortController()
  const t = setTimeout(() => ctl.abort(), ms)
  try { return await fetch(url, { headers: UA, signal: ctl.signal }) } finally { clearTimeout(t) }
}

// Até `n` pedidos em simultâneo (política de uso dos mosaicos do OSM).
async function emLotes(itens, n, fn) {
  const out = new Array(itens.length)
  let i = 0
  await Promise.all(Array.from({ length: n }, async () => {
    while (i < itens.length) { const k = i++; out[k] = await Promise.resolve().then(() => fn(itens[k])).catch(() => null) }
  }))
  return out
}

async function rota(origem, destino, perfil) {
  const base = perfil === 'pe' ? 'https://routing.openstreetmap.de/routed-foot' : 'https://routing.openstreetmap.de/routed-car'
  const url = `${base}/route/v1/driving/${origem.lng},${origem.lat};${destino.lng},${destino.lat}?overview=simplified&geometries=geojson`
  // FOSSGIS (perfil certo) e, se não responder, o servidor de demonstração do OSRM (só carro).
  const alternativa = `https://router.project-osrm.org/route/v1/driving/${origem.lng},${origem.lat};${destino.lng},${destino.lat}?overview=simplified&geometries=geojson`
  for (const [tentativa, u] of [url, url, alternativa].entries()) {
    if (tentativa) await new Promise((r) => setTimeout(r, 1500))
    const j = await comPrazo(u, 12000).then((r) => r.json()).catch(() => null)
    if (j?.code === 'Ok') return j.routes?.[0]?.geometry?.coordinates || null
  }
  return null
}

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/**
 * centro: { lat, lng } do imóvel
 * destinos: [{ lat, lng, numero, perfil: 'pe'|'carro', destaque, rota }] — numero = n.º da legenda
 */
export async function mapaOSMSvg({ centro, destinos = [], w = 1100, h = 640 }) {
  const pontos = [centro, ...destinos]
  const escala = destinos.length > 16 ? 0.72 : destinos.length > 10 ? 0.82 : 1
  // Zoom máximo (13–17) em que todos os pontos cabem com margem.
  let z = 17
  for (; z > 13; z--) {
    const ps = pontos.map((p) => px(p.lat, p.lng, z))
    const largura = Math.max(...ps.map((p) => p.x)) - Math.min(...ps.map((p) => p.x))
    const altura = Math.max(...ps.map((p) => p.y)) - Math.min(...ps.map((p) => p.y))
    if (largura <= w * 0.86 && altura <= h * 0.8) break
  }
  const ps = pontos.map((p) => px(p.lat, p.lng, z))
  const cx = (Math.max(...ps.map((p) => p.x)) + Math.min(...ps.map((p) => p.x))) / 2
  const cy = (Math.max(...ps.map((p) => p.y)) + Math.min(...ps.map((p) => p.y))) / 2
  const ox = cx - w / 2, oy = cy - h / 2
  const local = (lat, lng) => { const p = px(lat, lng, z); return { x: p.x - ox, y: p.y - oy } }

  // Fundo: satélite DGT; se falhar, mosaicos de ruas do OpenStreetMap.
  const satelite = await sateliteDGT({ ox, oy, w, h, z }).catch(() => null)
  const tiles = []
  if (!satelite) {
    for (let tx = Math.floor(ox / TILE); tx <= Math.floor((ox + w) / TILE); tx++) {
      for (let ty = Math.floor(oy / TILE); ty <= Math.floor((oy + h) / TILE); ty++) tiles.push({ tx, ty })
    }
  }
  const imgs = await emLotes(tiles, 4, async ({ tx, ty }) => {
    const r = await comPrazo(`https://tile.openstreetmap.org/${z}/${tx}/${ty}.png`)
    if (!r.ok || !(r.headers.get('content-type') || '').startsWith('image/')) return null
    return base64(await r.arrayBuffer())
  })
  const tilesSvg = satelite || tiles.map(({ tx, ty }, i) => imgs[i]
    ? `<image x="${(tx * TILE - ox).toFixed(1)}" y="${(ty * TILE - oy).toFixed(1)}" width="${TILE + 0.5}" height="${TILE + 0.5}" href="data:image/png;base64,${imgs[i]}"/>`
    : '').join('')

  // Rotas (por baixo dos marcadores)
  const rotas = await emLotes(destinos, 2, (d) => (d.rota ? rota(centro, d, d.perfil) : null))
  const rotasSvg = rotas.map((coords) => {
    if (!coords?.length) return ''
    const d = coords.map(([lng, lat], i) => { const p = local(lat, lng); return `${i ? 'L' : 'M'}${p.x.toFixed(1)},${p.y.toFixed(1)}` }).join('')
    return `<path d="${d}" fill="none" stroke="#FFFFFF" stroke-width="7" stroke-linecap="round" stroke-linejoin="round" opacity="0.9"/>
            <path d="${d}" fill="none" stroke="#C9A84C" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>`
  }).join('')

  // Pinos em gota (como no estudo da Lages): a ponta assenta no local.
  const pino = (x, y, cor, texto, corTexto, escala = 1) => `<g transform="translate(${x.toFixed(1)},${y.toFixed(1)}) scale(${escala})">
      <ellipse cx="0" cy="0" rx="6" ry="2.5" fill="#000000" opacity="0.35"/>
      <path d="M0,0 C-4,-9 -15,-17 -15,-28 A15,15 0 1 1 15,-28 C15,-17 4,-9 0,0 Z" fill="${cor}" stroke="#FFFFFF" stroke-width="2.5"/>
      <text x="0" y="-23" font-size="${String(texto).length > 1 ? 12 : 14}" font-weight="800" fill="${corTexto}" text-anchor="middle">${texto}</text></g>`
  const marcadores = destinos.map((d, i) => {
    const p = local(d.lat, d.lng)
    const n = d.numero ?? i + 1
    return d.destaque ? pino(p.x, p.y, '#C9A84C', n, '#0d0d0d', escala) : pino(p.x, p.y, '#111111', n, '#FFFFFF', escala)
  }).reverse().join('') // o n.º 1 fica por cima
  const c = local(centro.lat, centro.lng)
  const imovel = pino(c.x, c.y, '#C9A84C', 'I', '#0d0d0d', Math.max(escala, 0.9))

  return `
    <defs><clipPath id="mapClip"><rect x="0" y="0" width="${w}" height="${h}" rx="8"/></clipPath></defs>
    <g clip-path="url(#mapClip)">
      <rect x="0" y="0" width="${w}" height="${h}" fill="#EEEDE8"/>
      ${tilesSvg}${rotasSvg}${marcadores}${imovel}
    </g>
    <rect x="${w - 312}" y="${h - 24}" width="306" height="18" rx="3" fill="#000000" opacity="0.55"/>
    <text x="${w - 14}" y="${h - 10}" font-size="10" fill="#FFFFFF" text-anchor="end" font-weight="600">${esc(satelite ? 'Imagem: DGT, OrtoSat 2023 · Dados: © OpenStreetMap' : 'Mapa: © contribuidores do OpenStreetMap')}</text>`
}

// ── Estudo a partir dos pontos de interesse aprovados (corre no browser) ──

const SECCAO = { transportes: 'acessos', saude: 'saude_universidade', educacao: 'saude_universidade', desporto: 'lazer', lazer: 'lazer' }
const fmtDist = (m) => (m == null ? null : m < 1000 ? `${m} m` : `${(m / 1000).toFixed(1).replace('.', ',')} km`)
const fmtMin = (s) => (s == null ? null : `${Math.max(1, Math.round(s / 60))} min`)
const LIMITE_MAPA_M = 3000 // mais longe do que isto (estações distantes, autoestrada, aeroportos) fica só na legenda, como na Lages

// Converte os aprovados para o formato de `pois_distancias.resultados` do estudo.
export function resultadosDosAprovados(dados) {
  return (dados?.pois || [])
    .filter((p) => p.estado === 'validado' && p.carro?.s != null)
    .map((p) => ({
      categoria: p.nome, icone: '📍', seccao: SECCAO[p.grupo] || 'comercio', endereco: p.endereco || p.nome,
      tipo_local: p.categoria_label, lat: p.lat, lng: p.lng, fora_do_mapa: (p.linha_reta_m ?? 0) > LIMITE_MAPA_M,
      distancia_metros: p.carro.m, distancia_texto: fmtDist(p.carro.m), duracao_segundos: p.carro.s, duracao_texto: fmtMin(p.carro.s), status: 'OK',
      pe: p.pe ? { status: 'OK', distancia_metros: p.pe.m, distancia_texto: fmtDist(p.pe.m), duracao_segundos: p.pe.s, duracao_texto: fmtMin(p.pe.s) } : null,
      bicicleta: p.bicicleta ? { distancia_metros: p.bicicleta.m, duracao_segundos: p.bicicleta.s } : null,
    }))
    // Mesma ordem do estudo (composeEstudoSvg): pela distância a pé.
    .sort((a, b) => (a.pe?.distancia_metros ?? a.distancia_metros) - (b.pe?.distancia_metros ?? b.distancia_metros))
}

// Fontes Inter servidas pelo próprio site (public/fonts), embutidas no SVG para o canvas as usar.
async function fontesInter() {
  const pesos = [['Inter-Regular.ttf', 400], ['Inter-SemiBold.ttf', 600], ['Inter-Bold.ttf', 700], ['Inter-Bold.ttf', 800]]
  const css = []
  for (const [f, w] of pesos) {
    const r = await fetch(`/fonts/${f}`).catch(() => null)
    if (r?.ok) css.push(`@font-face{font-family:Inter;font-weight:${w};src:url(data:font/ttf;base64,${base64(await r.arrayBuffer())}) format('truetype');}`)
  }
  return css.join('')
}

async function svgParaPng(svg, largura) {
  const blobUrl = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }))
  try {
    const img = new Image()
    img.src = blobUrl
    await img.decode()
    const vb = svg.match(/viewBox="0 0 (\d+) (\d+)"/)
    const [vw, vh] = vb ? [Number(vb[1]), Number(vb[2])] : [img.width, img.height]
    const canvas = document.createElement('canvas')
    canvas.width = largura
    canvas.height = Math.round((vh / vw) * largura)
    canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height)
    // JPEG: com a fotografia de satélite fica ~6× mais leve do que PNG (o dossier em PDF agradece).
    const ctx = canvas.getContext('2d')
    ctx.globalCompositeOperation = 'destination-over'
    ctx.fillStyle = '#f7f6f2'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    return await new Promise((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error('Não foi possível criar a imagem'))), 'image/jpeg', 0.9))
  } finally { URL.revokeObjectURL(blobUrl) }
}

/**
 * Gera no browser a imagem do estudo (PNG) com os pontos aprovados.
 * imovel: { nome, morada, freguesia, regiao }; devolve { blob, resultados }.
 */
export async function gerarEstudoPNG({ dados, imovel, highlights = [], destaque = null, aoProgresso }) {
  const resultados = resultadosDosAprovados(dados)
  if (!resultados.length) throw new Error('Aprova pelo menos um ponto de interesse para gerar o estudo')
  const centro = { lat: dados.origem.lat, lng: dados.origem.lng }
  aoProgresso?.('A preparar o mapa de satélite…')
  // Todos numerados como na legenda; rotas só para os 8 mais próximos (evita um novelo de linhas).
  const destinos = resultados.map((r, i) => ({
    lat: r.lat, lng: r.lng, numero: i + 1, fora: r.fora_do_mapa,
    perfil: (r.pe?.distancia_metros ?? Infinity) <= 1500 ? 'pe' : 'carro', rota: i < 8 && !r.fora_do_mapa,
    destaque: !!destaque && r.categoria.toLowerCase().includes(String(destaque).toLowerCase()),
  })).filter((d) => !d.fora)
  const mapaSvg = await mapaOSMSvg({ centro, destinos })
  aoProgresso?.('A compor a imagem…')
  const regiao = imovel.regiao || 'Coimbra'
  let svg = composeEstudoSvg({
    imovelNome: imovel.nome, morada: dados.origem.texto || imovel.morada || '',
    freguesia: imovel.freguesia ? `${regiao === 'AMP' ? 'Porto/Gaia' : 'Coimbra'} · ${imovel.freguesia}` : null,
    regiao, resultados, highlights, destaque, modo: 'driving', mapaSvgPronto: mapaSvg,
  })
  const fontes = await fontesInter()
  if (fontes) svg = svg.replace(/(<svg[^>]*>)/, `$1<defs><style>${fontes}</style></defs>`)
  const blob = await svgParaPng(svg, 1600)
  return { blob, resultados }
}
