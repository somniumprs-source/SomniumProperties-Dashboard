/**
 * Portal Fetch — extrai dados de anúncios imobiliários a partir de URLs.
 * Suporta: Idealista, Imovirtual, Supercasa, ERA, RE/MAX, KW, Zome, Century21
 * Inclui extração e importação de fotografias para o CRM.
 */

import { randomUUID } from 'crypto'
import { createClient } from '@supabase/supabase-js'
import { writeFile, unlink, mkdir } from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// ── Supabase Storage (mesmo padrão de routes.js) ──────────────
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://mjgusjuougzoeiyavsor.supabase.co'
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || ''
const supabaseStorage = SUPABASE_SERVICE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
  : null

// ── Diretório local (fallback) ────────────────────────────────
const LOCAL_UPLOADS_DIR = path.resolve(__dirname, '../../public/uploads/imoveis')

const MAX_PHOTOS = 15
const MAX_PHOTO_SIZE = 5 * 1024 * 1024 // 5MB
const PHOTO_TIMEOUT = 8000 // 8s

// ── Padrões para excluir imagens irrelevantes ─────────────────
const EXCLUDE_PATTERNS = /logo|avatar|icon|placeholder|sprite|banner|badge|favicon|widget|button|arrow|pixel|tracking|blank|spacer|captcha/i

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
  const result = { tipologia: null, zona: null, ask_price: null, area_m2: null, referencia: null, ano_construcao: null, fotos_urls: [] }

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

  // ── Fotografias ────────────────────────────────────────────
  const imageUrls = new Set()

  // 1. og:image (foto principal — presente em quase todos os portais)
  const ogImages = html.matchAll(/<meta[^>]+property="og:image"[^>]+content="([^"]+)"/gi)
  for (const m of ogImages) {
    if (m[1]) imageUrls.add(m[1])
  }

  // 2. JSON-LD (schema.org — Idealista, Imovirtual usam "image": [...])
  const jsonLdBlocks = html.matchAll(/<script[^>]+type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi)
  for (const block of jsonLdBlocks) {
    try {
      const data = JSON.parse(block[1])
      const images = data.image || data.photo?.map(p => p.contentUrl) || []
      const arr = Array.isArray(images) ? images : [images]
      for (const img of arr) {
        if (typeof img === 'string' && img.startsWith('http')) imageUrls.add(img)
      }
    } catch { /* JSON inválido — ignorar */ }
  }

  // 3. Tags <img> com URLs de alta resolução (CDNs de portais)
  const imgTags = html.matchAll(/<img[^>]+src="(https?:\/\/[^"]+\.(jpg|jpeg|png|webp)[^"]*)"/gi)
  for (const m of imgTags) {
    if (m[1]) imageUrls.add(m[1])
  }

  // 4. Atributos data-src e data-lazy (galerias com lazy loading)
  const lazySrcs = html.matchAll(/data-(?:src|lazy|original)="(https?:\/\/[^"]+\.(jpg|jpeg|png|webp)[^"]*)"/gi)
  for (const m of lazySrcs) {
    if (m[1]) imageUrls.add(m[1])
  }

  // Filtrar: excluir logos, ícones, imagens pequenas por padrão de URL
  const baseUrl = new URL(url).origin
  result.fotos_urls = [...imageUrls]
    .map(u => u.startsWith('//') ? `https:${u}` : u)
    .map(u => u.startsWith('/') ? `${baseUrl}${u}` : u)
    .filter(u => u.startsWith('http'))
    .filter(u => !EXCLUDE_PATTERNS.test(u))
    .filter(u => !u.includes('1x1'))
    .filter(u => !u.includes('data:image'))
    .slice(0, MAX_PHOTOS)

  return result
}

/**
 * Descarrega fotografias de URLs de portal e importa para o CRM.
 * Guarda em Supabase Storage (se configurado) ou disco local.
 * @param {string} imovelId — UUID do imóvel no CRM
 * @param {string[]} fotosUrls — lista de URLs de imagens
 * @returns {Promise<Array<{id, name, path, type, size, uploaded_at}>>}
 */
export async function downloadPortalPhotos(imovelId, fotosUrls) {
  if (!fotosUrls?.length) return []

  // Garantir diretório local existe
  try { await mkdir(LOCAL_UPLOADS_DIR, { recursive: true }) } catch {}

  const fotos = []

  for (let i = 0; i < fotosUrls.length; i++) {
    const imageUrl = fotosUrls[i]
    try {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), PHOTO_TIMEOUT)

      const res = await fetch(imageUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
          'Accept': 'image/*',
          'Referer': imageUrl,
        },
        signal: controller.signal,
      })
      clearTimeout(timeout)

      if (!res.ok) continue

      const contentType = res.headers.get('content-type') || 'image/jpeg'
      if (!contentType.startsWith('image/')) continue

      const buffer = Buffer.from(await res.arrayBuffer())
      if (buffer.length < 1000 || buffer.length > MAX_PHOTO_SIZE) continue

      // Determinar extensão
      const extMap = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' }
      const ext = extMap[contentType] || '.jpg'
      const fileId = randomUUID()
      const filename = `${fileId}${ext}`

      let filePath

      if (supabaseStorage) {
        // Upload para Supabase Storage
        const storagePath = `imoveis/${imovelId}/${filename}`
        const { error } = await supabaseStorage.storage
          .from('Imoveis')
          .upload(storagePath, buffer, { contentType, upsert: true })

        if (!error) {
          const { data: urlData } = supabaseStorage.storage
            .from('Imoveis').getPublicUrl(storagePath)
          filePath = urlData.publicUrl
        } else {
          console.warn(`[portalFetch] Erro Supabase upload foto ${i + 1}:`, error.message)
          // Fallback para local
          const localPath = path.join(LOCAL_UPLOADS_DIR, filename)
          await writeFile(localPath, buffer)
          filePath = `/uploads/imoveis/${filename}`
        }
      } else {
        // Local disk
        const localPath = path.join(LOCAL_UPLOADS_DIR, filename)
        await writeFile(localPath, buffer)
        filePath = `/uploads/imoveis/${filename}`
      }

      fotos.push({
        id: fileId,
        name: `portal-foto-${i + 1}${ext}`,
        path: filePath,
        type: contentType,
        size: buffer.length,
        uploaded_at: new Date().toISOString(),
      })

      console.log(`[portalFetch] Foto ${i + 1}/${fotosUrls.length} importada (${(buffer.length / 1024).toFixed(0)}KB)`)
    } catch (e) {
      console.warn(`[portalFetch] Erro ao descarregar foto ${i + 1}:`, e.message)
    }
  }

  return fotos
}
