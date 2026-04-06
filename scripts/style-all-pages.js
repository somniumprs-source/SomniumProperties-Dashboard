#!/usr/bin/env node
/**
 * Aplica cover banner + header callout a todas as sub-páginas dos departamentos.
 * Usage: node scripts/style-all-pages.js
 */
import sharp from 'sharp'
import https from 'https'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PUBLIC = path.join(__dirname, '../public/subbanners')

function loadEnv() {
  const envPath = path.join(__dirname, '../.env')
  if (!fs.existsSync(envPath)) return
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z_]+)=(.*)$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim()
  }
}
loadEnv()

const TOKEN = process.env.NOTION_API_KEY
if (!TOKEN) { console.error('NOTION_API_KEY not set'); process.exit(1) }
if (!fs.existsSync(PUBLIC)) fs.mkdirSync(PUBLIC, { recursive: true })

// ── Pages to style ─────────────────────────────────────────────────────────
const pages = [
  // Administração — gallery items
  { id: '30dc6d45-a01f-80ce-89b9-dbe880497b11', title: "KPI'S POR TRIMESTRE", svgEmoji: '&#x1F4C8;', icon: '📈', subtitle: 'Indicadores de Performance Trimestral' },
  { id: '30dc6d45-a01f-803d-a8fe-c765b0157bb4', title: 'TAREFAS A FAZER',     svgEmoji: '&#x2705;',  icon: '✅', subtitle: 'Gestão de Tarefas & Prioridades' },
  { id: '30dc6d45-a01f-8045-8e2c-c2f824985a6d', title: 'TRACKER TAREFAS',     svgEmoji: '&#x1F4CA;', icon: '📊', subtitle: 'Acompanhamento & Controlo de Tarefas' },
  { id: '30dc6d45-a01f-80c9-84b1-f6ed7e5ef62f', title: 'SOP',                 svgEmoji: '&#x1F4D6;', icon: '📖', subtitle: 'Procedimentos Operacionais Padrão' },
  // Financeiro — DBs
  { id: 'ecbb876e-e01e-4e65-b8f5-61499d42a2b2', title: 'FATURAÇÃO',           svgEmoji: '&#x1F4B3;', icon: '💳', subtitle: 'Registo & Controlo de Faturação' },
  { id: 'ae764d59-5500-4c1b-b0fb-a7705bb6931c', title: 'DESPESAS',            svgEmoji: '&#x1F4B8;', icon: '💸', subtitle: 'Controlo de Despesas Operacionais' },
  // Comercial — DBs + page
  { id: '30dc6d45-a01f-804a-abbc-dedfb2f15c57', title: 'PIPELINE DE LEADS',   svgEmoji: '&#x1F3AF;', icon: '🎯', subtitle: 'Oportunidades & Funil Comercial' },
  { id: 'c032cba7-569c-415c-b1d2-8b34754da4bc', title: 'EMPREITEIROS',        svgEmoji: '&#x1F528;', icon: '🔨', subtitle: 'Base de Dados de Empreiteiros' },
  { id: '332c6d45-a01f-8133-a0d8-d968b30e8ec5', title: 'DASHBOARD GERAL',     svgEmoji: '&#x1F4F0;', icon: '📰', subtitle: 'Visão Consolidada do Negócio' },
  // Formação
  { id: '333c6d45-a01f-81bf-8a45-c217d3b5941b', title: 'AREAS MINIMAS',       svgEmoji: '&#x1F4D0;', icon: '📐', subtitle: 'Art. 66.º-1 — Tipologias' },
]

// ── SVG banner ─────────────────────────────────────────────────────────────
function makeSVG(title, subtitle, svgEmoji) {
  const fontSize = title.length > 18 ? 64 : 80
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1500" height="600" viewBox="0 0 1500 600">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%"   stop-color="#0d0d0d"/>
      <stop offset="50%"  stop-color="#141414"/>
      <stop offset="100%" stop-color="#0d0d0d"/>
    </linearGradient>
    <linearGradient id="goldLine" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%"   stop-color="transparent"/>
      <stop offset="20%"  stop-color="#C9A84C88"/>
      <stop offset="50%"  stop-color="#C9A84C"/>
      <stop offset="80%"  stop-color="#C9A84C88"/>
      <stop offset="100%" stop-color="transparent"/>
    </linearGradient>
    <radialGradient id="glow" cx="50%" cy="50%" r="50%">
      <stop offset="0%"   stop-color="#C9A84C" stop-opacity="0.10"/>
      <stop offset="100%" stop-color="#C9A84C" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="1500" height="600" fill="url(#bg)"/>
  <ellipse cx="750" cy="300" rx="600" ry="280" fill="url(#glow)"/>
  <rect x="0" y="0"   width="1500" height="4" fill="url(#goldLine)"/>
  <rect x="0" y="596" width="1500" height="4" fill="url(#goldLine)"/>
  <line x1="40"   y1="4"   x2="40"   y2="50"  stroke="#C9A84C" stroke-width="2" opacity="0.4"/>
  <line x1="4"    y1="40"  x2="90"   y2="40"  stroke="#C9A84C" stroke-width="2" opacity="0.4"/>
  <line x1="1460" y1="4"   x2="1460" y2="50"  stroke="#C9A84C" stroke-width="2" opacity="0.4"/>
  <line x1="1410" y1="40"  x2="1496" y2="40"  stroke="#C9A84C" stroke-width="2" opacity="0.4"/>
  <line x1="40"   y1="596" x2="40"   y2="550" stroke="#C9A84C" stroke-width="2" opacity="0.4"/>
  <line x1="4"    y1="560" x2="90"   y2="560" stroke="#C9A84C" stroke-width="2" opacity="0.4"/>
  <line x1="1460" y1="596" x2="1460" y2="550" stroke="#C9A84C" stroke-width="2" opacity="0.4"/>
  <line x1="1410" y1="560" x2="1496" y2="560" stroke="#C9A84C" stroke-width="2" opacity="0.4"/>
  <text x="750" y="232" text-anchor="middle" dominant-baseline="middle"
        font-family="Apple Color Emoji, Segoe UI Emoji, Noto Color Emoji, sans-serif"
        font-size="96">${svgEmoji}</text>
  <text x="750" y="345" text-anchor="middle" dominant-baseline="middle"
        font-family="'SF Pro Display', 'Helvetica Neue', Arial, sans-serif"
        font-size="${fontSize}" font-weight="700" letter-spacing="6"
        fill="white" stroke="#C9A84C" stroke-width="1.5" paint-order="stroke">${title}</text>
  <rect x="400" y="376" width="700" height="2" rx="1" fill="#C9A84C" opacity="0.4"/>
  <text x="750" y="420" text-anchor="middle" dominant-baseline="middle"
        font-family="'SF Pro Text', 'Helvetica Neue', Arial, sans-serif"
        font-size="20" font-weight="400" letter-spacing="4"
        fill="#777777">${subtitle}</text>
  <text x="750" y="528" text-anchor="middle" dominant-baseline="middle"
        font-family="'SF Pro Display', 'Helvetica Neue', Arial, sans-serif"
        font-size="12" font-weight="600" letter-spacing="6"
        fill="#252525">SOMNIUM PROPERTIES</text>
</svg>`
}

// ── Imgur upload ───────────────────────────────────────────────────────────
function imgurUpload(filePath) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ image: fs.readFileSync(filePath).toString('base64'), type: 'base64' })
    const options = {
      hostname: 'api.imgur.com', path: '/3/image', method: 'POST',
      headers: { Authorization: 'Client-ID 546c25a59c58ad7', 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
    }
    const req = https.request(options, res => {
      let raw = ''
      res.on('data', d => raw += d)
      res.on('end', () => {
        const j = JSON.parse(raw)
        if (j.success) resolve(j.data.link)
        else reject(new Error(JSON.stringify(j)))
      })
    })
    req.on('error', reject)
    req.write(body)
    req.end()
  })
}

// ── Notion helpers ─────────────────────────────────────────────────────────
function notionPatch(path, body) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body)
    const options = {
      hostname: 'api.notion.com', path, method: 'PATCH',
      headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json', 'Notion-Version': '2022-06-28', 'Content-Length': Buffer.byteLength(payload) },
    }
    const req = https.request(options, res => {
      let raw = ''
      res.on('data', d => raw += d)
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) resolve(JSON.parse(raw))
        else reject(new Error(`Notion ${res.statusCode}: ${raw}`))
      })
    })
    req.on('error', reject)
    req.write(payload)
    req.end()
  })
}

function notionGet(path) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.notion.com', path, method: 'GET',
      headers: { Authorization: `Bearer ${TOKEN}`, 'Notion-Version': '2022-06-28' },
    }
    const req = https.request(options, res => {
      let raw = ''
      res.on('data', d => raw += d)
      res.on('end', () => resolve(JSON.parse(raw)))
    })
    req.on('error', reject)
    req.end()
  })
}

async function getChildren(blockId) {
  const res = await notionGet(`/v1/blocks/${blockId}/children?page_size=100`)
  return res.results ?? []
}

async function archiveBlock(blockId) {
  await notionPatch(`/v1/blocks/${blockId}`, { archived: true })
}

// ── Main ───────────────────────────────────────────────────────────────────
async function main() {
  for (const page of pages) {
    console.log(`\n── ${page.title}`)

    // 1. Generate banner
    const slug = page.title.toLowerCase().replace(/[^a-z0-9]/g, '_').slice(0, 30)
    const filePath = path.join(PUBLIC, `${slug}.png`)
    // subtitle in SVG needs &amp; for &
    const svgSubtitle = page.subtitle.replace(/&(?!amp;)/g, '&amp;')
    await sharp(Buffer.from(makeSVG(page.title, svgSubtitle, page.svgEmoji))).png().toFile(filePath)
    console.log(`  ✓ Banner gerado`)

    // 2. Upload
    const url = await imgurUpload(filePath)
    console.log(`  ✓ Imgur: ${url}`)

    // 3. Cover
    await notionPatch(`/v1/pages/${page.id}`, { cover: { type: 'external', external: { url } } })
    console.log(`  ✓ Cover aplicado`)

    // 4. Archive old text blocks (keep child_page, child_database, callout already there)
    const existing = await getChildren(page.id)
    let archived = 0
    for (const b of existing) {
      if (b.type !== 'child_page' && b.type !== 'child_database') {
        try { await archiveBlock(b.id); archived++ } catch {}
      }
    }
    if (archived) console.log(`  ✓ Arquivados ${archived} blocos antigos`)

    // 5. Header callout
    await notionPatch(`/v1/blocks/${page.id}/children`, {
      children: [{
        object: 'block',
        type: 'callout',
        callout: {
          rich_text: [
            { type: 'text', text: { content: page.title + '\n' }, annotations: { bold: true } },
            { type: 'text', text: { content: page.subtitle }, annotations: { color: 'gray' } },
          ],
          icon: { type: 'emoji', emoji: page.icon },
          color: 'gray_background',
        },
      }],
    })
    console.log(`  ✓ Header adicionado`)
  }

  console.log('\n✅ Concluído.')
}

main().catch(e => { console.error(e.message ?? e); process.exit(1) })
