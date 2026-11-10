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
import { nomeApresentado } from './analiseLocalizacaoIA.js'

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

function metros(a, b) {
  const R = 6371000, rad = (x) => (x * Math.PI) / 180
  const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
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
export async function mapaOSMSvg({ centro, destinos = [], w = 1100, h = 640, focoM = null }) {
  const pontos = [centro, ...destinos]
  const escala = destinos.length > 16 ? 0.72 : destinos.length > 10 ? 0.82 : 1
  // Centrado no imóvel: o maior zoom (13–17) em que todos os pontos cabem à volta dele,
  // com folga para os pinos (que sobem ~40 px acima do local).
  // focoM: o zoom é escolhido só pelos pontos até essa distância; os outros entram se couberem.
  const cabeEm = (p, z) => {
    const c = px(centro.lat, centro.lng, z), q = px(p.lat, p.lng, z)
    const dx = q.x - c.x, dy = q.y - c.y
    return Math.abs(dx) <= w / 2 - 28 && dy >= -(h / 2 - 48) && dy <= h / 2 - 14
  }
  const foco = focoM ? destinos.filter((d) => metros(centro, d) <= focoM) : destinos
  let z = 17
  for (; z > 13; z--) if (foco.every((p) => cabeEm(p, z))) break
  // Só os que cabem no enquadramento ficam no mapa, numerados 1, 2, 3… pela ordem recebida.
  destinos = destinos.filter((p) => cabeEm(p, z)).map((d, i) => ({ ...d, numero: i + 1 }))
  const c0 = px(centro.lat, centro.lng, z)
  const ox = c0.x - w / 2, oy = c0.y - h / 2
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
  // Imóvel sempre a verde (pedido do João).
  const imovel = pino(c.x, c.y, '#16a34a', 'I', '#FFFFFF', Math.max(escala, 0.95))

  const svg = `
    <defs><clipPath id="mapClip"><rect x="0" y="0" width="${w}" height="${h}" rx="8"/></clipPath></defs>
    <g clip-path="url(#mapClip)">
      <rect x="0" y="0" width="${w}" height="${h}" fill="#EEEDE8"/>
      ${tilesSvg}${rotasSvg}${marcadores}${imovel}
    </g>
    <rect x="${w - 312}" y="${h - 24}" width="306" height="18" rx="3" fill="#000000" opacity="0.55"/>
    <text x="${w - 14}" y="${h - 10}" font-size="10" fill="#FFFFFF" text-anchor="end" font-weight="600">${esc(satelite ? 'Imagem: DGT, OrtoSat 2023 · Dados: © OpenStreetMap' : 'Mapa: © contribuidores do OpenStreetMap')}</text>`
  return { svg, numeros: new Map(destinos.map((d) => [d.idx, d.numero])) }
}

// ── Estudo a partir dos pontos de interesse aprovados (corre no browser) ──

const SECCAO = { transportes: 'acessos', saude: 'saude_universidade', educacao: 'saude_universidade', desporto: 'lazer', lazer: 'lazer' }
const fmtDist = (m) => (m == null ? null : m < 1000 ? `${m} m` : `${(m / 1000).toFixed(1).replace('.', ',')} km`)
const fmtMin = (s) => (s == null ? null : `${Math.max(1, Math.round(s / 60))} min`)
const FOCO_MAPA_M = 900 // o zoom enquadra os pontos até 900 m (bairro); os mais longe entram se couberem, senão ficam na legenda «fora do mapa»

// Converte os aprovados para o formato de `pois_distancias.resultados` do estudo.
export function resultadosDosAprovados(dados) {
  return (dados?.pois || [])
    .filter((p) => p.estado === 'validado' && p.carro?.s != null)
    .map((p) => ({
      categoria: nomeApresentado(p), icone: '📍', seccao: SECCAO[p.grupo] || 'comercio', endereco: p.endereco || p.nome,
      tipo_local: p.categoria_label, lat: p.lat, lng: p.lng, fora_do_mapa: false,
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
    lat: r.lat, lng: r.lng, idx: i,
    perfil: (r.pe?.distancia_metros ?? Infinity) <= 1500 ? 'pe' : 'carro', rota: i < 8,
    destaque: !!destaque && r.categoria.toLowerCase().includes(String(destaque).toLowerCase()),
  })).filter((d) => d.lat != null && metros(centro, d) <= 20000)
  const { svg: mapaSvg, numeros } = await mapaOSMSvg({ centro, destinos, focoM: FOCO_MAPA_M })
  // Número só para quem aparece no mapa; os outros ficam na legenda com um ponto, sem número.
  resultados.forEach((r, i) => { r.numero = numeros.get(i) ?? null; r.fora_do_mapa = r.numero == null })
  aoProgresso?.('A compor a imagem…')
  const regiao = imovel.regiao || 'Coimbra'
  let svg = composeEstudoSvg({
    // Se a pesquisa partiu de coordenadas, no cabeçalho mostra-se a morada da ficha.
    imovelNome: imovel.nome, morada: (/^\s*-?\d{1,2}[.,]\d+/.test(dados.origem.texto || '') ? imovel.morada : dados.origem.texto) || imovel.morada || '',
    freguesia: imovel.freguesia ? `${regiao === 'AMP' ? 'Porto/Gaia' : 'Coimbra'} · ${imovel.freguesia}` : null,
    regiao, resultados, highlights, destaque, modo: 'driving', mapaSvgPronto: mapaSvg,
  })
  const fontes = await fontesInter()
  if (fontes) svg = svg.replace(/(<svg[^>]*>)/, `$1<defs><style>${fontes}</style></defs>`)
  const blob = await svgParaPng(svg, 1600)
  return { blob, resultados }
}
