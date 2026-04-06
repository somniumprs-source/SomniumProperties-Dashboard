#!/usr/bin/env node
/**
 * Genera banners PNG para os departamentos e faz upload para Imgur.
 * Usage: node scripts/gen-banners.js [--upload] [--apply]
 *   --upload  faz upload para Imgur e mostra URLs
 *   --apply   aplica as covers nas páginas Notion (requer --upload)
 */
import sharp from 'sharp'
import fs from 'fs'
import https from 'https'
import http from 'http'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PUBLIC = path.join(__dirname, '../public')

const UPLOAD  = process.argv.includes('--upload')
const APPLY   = process.argv.includes('--apply')

// ── Departamentos ──────────────────────────────────────────────────────────
const depts = [
  {
    file:     'banner_admin.png',
    name:     'ADMINISTRAÇÃO',
    subtitle: 'Gestão &amp; Estratégia Empresarial',
    emoji:    '&#x1F3DB;',
    pageId:   '333b41f4-1d3e-467d-a49e-36b9f4c7206a',
  },
  {
    file:     'banner_fin.png',
    name:     'FINANCEIRO',
    subtitle: 'Controlo Financeiro &amp; Orçamental',
    emoji:    '&#x1F4B0;',
    pageId:   '6a51b61c-e89f-476c-a8b0-69391ab742b2',
  },
  {
    file:     'banner_com.png',
    name:     'COMERCIAL &amp; VENDAS',
    subtitle: 'Pipeline · Investidores · Empreiteiros',
    emoji:    '&#x1F3E1;',
    pageId:   '8c1965bc-3ac0-49c3-a128-9958f2796dbd',
  },
  {
    file:     'banner_form.png',
    name:     'FORMAÇÃO',
    subtitle: 'Desenvolvimento &amp; Capacitação',
    emoji:    '&#x1F393;',
    pageId:   '9a7cd819-ad5f-4e19-949a-1d42605f2892',
  },
]

// ── SVG template ───────────────────────────────────────────────────────────
function makeSVG({ name, subtitle, emoji }) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1500" height="600" viewBox="0 0 1500 600">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%"   stop-color="#0d0d0d"/>
      <stop offset="50%"  stop-color="#141414"/>
      <stop offset="100%" stop-color="#0d0d0d"/>
    </linearGradient>
    <linearGradient id="gold" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%"   stop-color="transparent"/>
      <stop offset="30%"  stop-color="#C9A84C"/>
      <stop offset="70%"  stop-color="#E8D08A"/>
      <stop offset="100%" stop-color="transparent"/>
    </linearGradient>
    <linearGradient id="goldLine" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%"   stop-color="transparent"/>
      <stop offset="20%"  stop-color="#C9A84C88"/>
      <stop offset="50%"  stop-color="#C9A84C"/>
      <stop offset="80%"  stop-color="#C9A84C88"/>
      <stop offset="100%" stop-color="transparent"/>
    </linearGradient>
    <!-- subtle radial glow behind emoji -->
    <radialGradient id="glow" cx="50%" cy="50%" r="50%">
      <stop offset="0%"   stop-color="#C9A84C" stop-opacity="0.12"/>
      <stop offset="100%" stop-color="#C9A84C" stop-opacity="0"/>
    </radialGradient>
  </defs>

  <!-- Background -->
  <rect width="1500" height="600" fill="url(#bg)"/>

  <!-- Subtle center glow -->
  <ellipse cx="750" cy="300" rx="600" ry="280" fill="url(#glow)"/>

  <!-- Top gold line -->
  <rect x="0" y="0" width="1500" height="4" fill="url(#goldLine)"/>
  <!-- Bottom gold line -->
  <rect x="0" y="596" width="1500" height="4" fill="url(#goldLine)"/>

  <!-- Corner accents top-left -->
  <line x1="40" y1="4" x2="40" y2="50" stroke="#C9A84C" stroke-width="2" opacity="0.5"/>
  <line x1="4"  y1="40" x2="90" y2="40" stroke="#C9A84C" stroke-width="2" opacity="0.5"/>
  <!-- Corner accents top-right -->
  <line x1="1460" y1="4" x2="1460" y2="50" stroke="#C9A84C" stroke-width="2" opacity="0.5"/>
  <line x1="1410" y1="40" x2="1496" y2="40" stroke="#C9A84C" stroke-width="2" opacity="0.5"/>
  <!-- Corner accents bottom-left -->
  <line x1="40" y1="596" x2="40" y2="550" stroke="#C9A84C" stroke-width="2" opacity="0.5"/>
  <line x1="4"  y1="560" x2="90" y2="560" stroke="#C9A84C" stroke-width="2" opacity="0.5"/>
  <!-- Corner accents bottom-right -->
  <line x1="1460" y1="596" x2="1460" y2="550" stroke="#C9A84C" stroke-width="2" opacity="0.5"/>
  <line x1="1410" y1="560" x2="1496" y2="560" stroke="#C9A84C" stroke-width="2" opacity="0.5"/>

  <!-- Emoji -->
  <text x="750" y="232" text-anchor="middle" dominant-baseline="middle"
        font-family="Apple Color Emoji, Segoe UI Emoji, Noto Color Emoji, sans-serif"
        font-size="96">${emoji}</text>

  <!-- Department name -->
  <text x="750" y="345" text-anchor="middle" dominant-baseline="middle"
        font-family="'SF Pro Display', 'Helvetica Neue', Arial, sans-serif"
        font-size="80" font-weight="700" letter-spacing="6"
        fill="white" stroke="#C9A84C" stroke-width="1.5" paint-order="stroke">${name}</text>

  <!-- Gold underline -->
  <rect x="400" y="376" width="700" height="2" rx="1" fill="#C9A84C" opacity="0.5"/>

  <!-- Subtitle -->
  <text x="750" y="420" text-anchor="middle" dominant-baseline="middle"
        font-family="'SF Pro Text', 'Helvetica Neue', Arial, sans-serif"
        font-size="22" font-weight="400" letter-spacing="4"
        fill="#888888">${subtitle}</text>

  <!-- SOMNIUM PROPERTIES watermark -->
  <text x="750" y="528" text-anchor="middle" dominant-baseline="middle"
        font-family="'SF Pro Display', 'Helvetica Neue', Arial, sans-serif"
        font-size="13" font-weight="600" letter-spacing="6"
        fill="#2a2a2a">SOMNIUM PROPERTIES</text>
</svg>`
}

// ── Imgur upload ───────────────────────────────────────────────────────────
function imgurUpload(filePath) {
  return new Promise((resolve, reject) => {
    const data = fs.readFileSync(filePath)
    const b64  = data.toString('base64')
    const body = JSON.stringify({ image: b64, type: 'base64' })

    const options = {
      hostname: 'api.imgur.com',
      path:     '/3/image',
      method:   'POST',
      headers: {
        Authorization:  'Client-ID 546c25a59c58ad7',
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    }

    const req = https.request(options, res => {
      let raw = ''
      res.on('data', d => raw += d)
      res.on('end', () => {
        try {
          const json = JSON.parse(raw)
          if (json.success) resolve(json.data.link)
          else reject(new Error(JSON.stringify(json)))
        } catch (e) { reject(e) }
      })
    })
    req.on('error', reject)
    req.write(body)
    req.end()
  })
}

// ── Notion cover update ────────────────────────────────────────────────────
function notionSetCover(pageId, imageUrl) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      cover: { type: 'external', external: { url: imageUrl } }
    })

    const token = process.env.NOTION_API_KEY
    if (!token) return reject(new Error('NOTION_API_KEY not set'))

    const options = {
      hostname: 'api.notion.com',
      path:     `/v1/pages/${pageId}`,
      method:   'PATCH',
      headers: {
        Authorization:   `Bearer ${token}`,
        'Content-Type':  'application/json',
        'Notion-Version': '2022-06-28',
        'Content-Length': Buffer.byteLength(body),
      },
    }

    const req = https.request(options, res => {
      let raw = ''
      res.on('data', d => raw += d)
      res.on('end', () => {
        if (res.statusCode === 200) resolve()
        else reject(new Error(`Notion ${res.statusCode}: ${raw}`))
      })
    })
    req.on('error', reject)
    req.write(body)
    req.end()
  })
}

// ── Load .env manually ────────────────────────────────────────────────────
function loadEnv() {
  const envPath = path.join(__dirname, '../.env')
  if (!fs.existsSync(envPath)) return
  const lines = fs.readFileSync(envPath, 'utf8').split('\n')
  for (const line of lines) {
    const m = line.match(/^([A-Z_]+)=(.*)$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim()
  }
}

// ── Main ───────────────────────────────────────────────────────────────────
async function main() {
  if (APPLY) loadEnv()

  const urls = {}

  for (const dept of depts) {
    const outPath = path.join(PUBLIC, dept.file)
    const svg = makeSVG(dept)

    console.log(`Generating ${dept.file}...`)
    await sharp(Buffer.from(svg))
      .png()
      .toFile(outPath)
    console.log(`  ✓ Saved ${outPath}`)

    if (UPLOAD || APPLY) {
      console.log(`  Uploading to Imgur...`)
      const url = await imgurUpload(outPath)
      urls[dept.file] = url
      console.log(`  ✓ ${url}`)
    }

    if (APPLY && urls[dept.file]) {
      console.log(`  Applying cover to Notion page ${dept.pageId}...`)
      await notionSetCover(dept.pageId, urls[dept.file])
      console.log(`  ✓ Applied`)
    }
  }

  if (Object.keys(urls).length) {
    console.log('\nImgur URLs:')
    for (const [file, url] of Object.entries(urls)) {
      console.log(`  ${file}: ${url}`)
    }
  }
}

main().catch(e => { console.error(e); process.exit(1) })
