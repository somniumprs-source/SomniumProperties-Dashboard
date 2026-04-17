/**
 * Link Scraper — extrai fotografias de links de anuncios imobiliarios.
 * Suporta: idealista, supercasa, imovirtual, casa.sapo, e links genericos.
 */
import { randomUUID } from 'crypto'
import { writeFile, mkdir } from 'fs/promises'
import { existsSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const UPLOADS_DIR = path.resolve(__dirname, '../../public/uploads/imoveis')

/**
 * Busca HTML de um URL com headers de browser real.
 */
async function fetchPage(url) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 15000)
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'pt-PT,pt;q=0.9,en;q=0.8',
      },
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return await res.text()
  } finally {
    clearTimeout(timeout)
  }
}

/**
 * Extrai URLs de imagens do HTML.
 * Estrategia: procura og:image, meta images, e img tags com src de alta resolucao.
 */
function extractImageUrls(html, pageUrl) {
  const images = new Set()
  const baseUrl = new URL(pageUrl).origin

  // 1. og:image e meta tags
  const ogMatches = html.matchAll(/property="og:image"\s+content="([^"]+)"/gi)
  for (const m of ogMatches) images.add(m[1])

  const metaMatches = html.matchAll(/name="twitter:image"\s+content="([^"]+)"/gi)
  for (const m of metaMatches) images.add(m[1])

  // 2. JSON-LD (idealista, supercasa usam structured data)
  const jsonLdMatches = html.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi)
  for (const m of jsonLdMatches) {
    try {
      const data = JSON.parse(m[1])
      const extractFromObj = (obj) => {
        if (!obj) return
        if (Array.isArray(obj.image)) obj.image.forEach(i => typeof i === 'string' ? images.add(i) : i?.url && images.add(i.url))
        else if (typeof obj.image === 'string') images.add(obj.image)
        else if (obj.image?.url) images.add(obj.image.url)
        if (Array.isArray(obj.photo)) obj.photo.forEach(p => p?.contentUrl && images.add(p.contentUrl))
      }
      if (Array.isArray(data)) data.forEach(extractFromObj)
      else extractFromObj(data)
    } catch {}
  }

  // 3. data-src e src de imagens grandes (min 400px ou keywords de foto)
  const imgMatches = html.matchAll(/<img[^>]+(?:src|data-src|data-original)="([^"]+)"/gi)
  for (const m of imgMatches) {
    const src = m[1]
    if (src.includes('logo') || src.includes('icon') || src.includes('avatar') || src.includes('sprite')) continue
    if (src.includes('placeholder') || src.includes('lazy') || src.includes('1x1')) continue
    if (src.length < 10) continue
    // Aceitar imagens que parecem ser fotos de imoveis
    if (src.match(/\.(jpg|jpeg|png|webp)/i) && (
      src.includes('foto') || src.includes('photo') || src.includes('image') ||
      src.includes('media') || src.includes('pictures') || src.includes('gallery') ||
      src.includes('property') || src.includes('imovel') || src.includes('anuncio') ||
      src.match(/\d{3,}x\d{3,}/) || src.match(/w_\d{3,}/) || src.match(/h_\d{3,}/) ||
      src.includes('upload') || src.includes('cdn') || src.includes('img')
    )) {
      images.add(src)
    }
  }

  // 4. Supercasa/idealista: URLs em atributos data
  const dataMatches = html.matchAll(/data-(?:full|big|zoom|original)(?:-?src)?="([^"]+\.(jpg|jpeg|png|webp)[^"]*)"/gi)
  for (const m of dataMatches) images.add(m[1])

  // 5. Background images em style
  const bgMatches = html.matchAll(/url\(["']?(https?:\/\/[^"')]+\.(jpg|jpeg|png|webp)[^"')]*)/gi)
  for (const m of bgMatches) images.add(m[1])

  // Normalizar URLs relativas
  const normalized = new Set()
  for (const img of images) {
    try {
      const url = img.startsWith('http') ? img : new URL(img, baseUrl).href
      // Filtrar imagens muito pequenas (thumbnails, icons)
      if (url.match(/[_-](\d+)x(\d+)/)) {
        const [, w, h] = url.match(/[_-](\d+)x(\d+)/)
        if (parseInt(w) < 200 || parseInt(h) < 200) continue
      }
      normalized.add(url)
    } catch {}
  }

  return [...normalized]
}

/**
 * Descarrega uma imagem e guarda no disco.
 */
async function downloadImage(url, imovelId) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 30000)
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Referer': new URL(url).origin,
      },
    })
    if (!res.ok) return null

    const contentType = res.headers.get('content-type') || ''
    if (!contentType.includes('image')) return null

    const buffer = Buffer.from(await res.arrayBuffer())
    if (buffer.length < 5000) return null // Ignorar imagens < 5KB (provavelmente placeholders)

    const ext = contentType.includes('png') ? 'png' : contentType.includes('webp') ? 'webp' : 'jpg'
    const filename = `${imovelId}_scraped_${randomUUID().slice(0, 8)}.${ext}`
    const dir = path.join(UPLOADS_DIR)
    if (!existsSync(dir)) await mkdir(dir, { recursive: true })

    const filePath = path.join(dir, filename)
    await writeFile(filePath, buffer)

    return {
      id: randomUUID(),
      name: filename,
      path: `/uploads/imoveis/${filename}`,
      type: `image/${ext}`,
      size: buffer.length,
      folder: 'fotos',
      source: 'scraper',
      source_url: url,
      uploaded_at: new Date().toISOString(),
    }
  } catch {
    return null
  } finally {
    clearTimeout(timeout)
  }
}

/**
 * Extrai e descarrega fotos de um link de anuncio imobiliario.
 * @param {string} url - URL do anuncio
 * @param {string} imovelId - ID do imovel no CRM
 * @param {number} maxPhotos - Numero maximo de fotos a descarregar (default: 20)
 * @returns {Array} Array de objectos foto descarregados
 */
export async function scrapePhotosFromLink(url, imovelId, maxPhotos = 20) {
  if (!url || !url.startsWith('http')) throw new Error('URL invalido')

  console.log(`[scraper] A extrair fotos de: ${url}`)
  const html = await fetchPage(url)
  const imageUrls = extractImageUrls(html, url)
  console.log(`[scraper] Encontradas ${imageUrls.length} imagens potenciais`)

  const limited = imageUrls.slice(0, maxPhotos)
  const photos = []

  for (const imgUrl of limited) {
    const photo = await downloadImage(imgUrl, imovelId)
    if (photo) {
      photos.push(photo)
      console.log(`[scraper] Descarregada: ${photo.name} (${Math.round(photo.size / 1024)}KB)`)
    }
  }

  console.log(`[scraper] Total: ${photos.length} fotos extraidas de ${url}`)
  return photos
}
