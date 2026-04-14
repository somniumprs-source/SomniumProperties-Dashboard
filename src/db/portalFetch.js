/**
 * Portal Fetch — extrai dados de anúncios imobiliários a partir de URLs.
 * Suporta: Idealista, Imovirtual, Supercasa, ERA, RE/MAX, KW, Zome, Century21
 */

const PORTAL_PATTERNS = [
  { name: 'Idealista', pattern: /idealista\.pt/i },
  { name: 'Imovirtual', pattern: /imovirtual\.com/i },
  { name: 'Supercasa', pattern: /supercasa\.pt/i },
  { name: 'ERA', pattern: /era\.pt/i },
  { name: 'RE/MAX', pattern: /remax\.pt/i },
  { name: 'KW', pattern: /kw(portugal|union)?\.pt/i },
  { name: 'Zome', pattern: /zome\.pt/i },
  { name: 'Century21', pattern: /century21\.pt/i },
  { name: 'Homelusa', pattern: /homelusa\.pt/i },
  { name: 'CasasPrime', pattern: /casasprime\.pt/i },
]

/**
 * Detecta se um texto contém um link de portal imobiliário.
 * @returns {{ url: string, portal: string } | null}
 */
export function detectPortalLink(text) {
  const urlMatch = text.match(/https?:\/\/[^\s"'<>]+/i)
  if (!urlMatch) return null
  const url = urlMatch[0]
  const portal = PORTAL_PATTERNS.find(p => p.pattern.test(url))
  if (!portal) return null
  return { url, portal: portal.name }
}

/**
 * Faz fetch a um portal e tenta extrair dados básicos do imóvel.
 * Usa Open Graph e meta tags como fallback.
 * @returns {{ tipologia, zona, ask_price, area_m2, referencia, ano_construcao } | null}
 */
export async function fetchPortalData(url) {
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 10000)
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Accept': 'text/html',
        'Accept-Language': 'pt-PT,pt;q=0.9',
      },
      signal: controller.signal,
    })
    clearTimeout(timeout)
    if (!res.ok) return null
    const html = await res.text()
    return parseHtml(html, url)
  } catch (e) {
    console.warn('[portalFetch] Erro ao aceder:', url, e.message)
    return null
  }
}

function parseHtml(html, url) {
  const result = { tipologia: null, zona: null, ask_price: null, area_m2: null, referencia: null, ano_construcao: null }

  // Meta tags (og:title, og:description, description)
  const ogTitle = html.match(/<meta[^>]+property="og:title"[^>]+content="([^"]+)"/i)?.[1] || ''
  const ogDesc = html.match(/<meta[^>]+property="og:description"[^>]+content="([^"]+)"/i)?.[1] || ''
  const title = html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1] || ''
  const fullText = `${ogTitle} ${ogDesc} ${title}`

  // Tipologia (T0-T9, M0-M9, moradia, apartamento, prédio)
  const tipoMatch = fullText.match(/\b([TM]\d+)\b/i) || fullText.match(/\b(moradia|apartamento|pr[eé]dio|loft|duplex|vivenda)\b/i)
  if (tipoMatch) result.tipologia = tipoMatch[1]

  // Preço (€, EUR)
  const priceMatch = fullText.match(/(\d[\d\s.,]*)\s*€/) || html.match(/price[^>]*>[\s€]*(\d[\d\s.,]*)/i)
  if (priceMatch) {
    const cleaned = priceMatch[1].replace(/\s/g, '').replace(/\./g, '').replace(',', '.')
    const num = parseFloat(cleaned)
    if (num > 1000 && num < 10000000) result.ask_price = num
  }

  // Área (m2, m²)
  const areaMatch = fullText.match(/(\d+[\d.,]*)\s*m[²2]/i)
  if (areaMatch) {
    const num = parseFloat(areaMatch[1].replace(',', '.'))
    if (num > 10 && num < 5000) result.area_m2 = num
  }

  // Zona — extrair do título ou meta
  const zonaPatterns = [
    /(?:em|in)\s+([A-ZÀ-Ú][a-zà-ú]+(?:\s+(?:de|do|da|dos|das)\s+)?[A-ZÀ-Ú]?[a-zà-ú]*)/,
    /Coimbra[,\s]+([^,\-"]+)/i,
    /(?:Santo|Santa|São)\s+[A-ZÀ-Ú][a-zà-ú]+(?:\s+(?:de|do|da|dos|das)\s+[A-ZÀ-Ú]?[a-zà-ú]*)*/,
  ]
  for (const p of zonaPatterns) {
    const m = fullText.match(p)
    if (m) { result.zona = (m[1] || m[0]).trim(); break }
  }

  // Referência do anúncio
  const refMatch = url.match(/\/(\d{7,10})\/?/) || html.match(/ref[eê]r[eê]ncia[^>]*>[\s:]*([A-Z0-9\-]+)/i)
  if (refMatch) result.referencia = refMatch[1]

  // Ano de construção
  const anoMatch = fullText.match(/(?:ano|constru[çc][aã]o|built)[^0-9]*(\d{4})/i)
  if (anoMatch) {
    const ano = parseInt(anoMatch[1])
    if (ano >= 1800 && ano <= 2030) result.ano_construcao = ano
  }

  return result
}
