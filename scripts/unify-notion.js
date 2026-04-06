#!/usr/bin/env node
/**
 * Unifica a estrutura Notion sob SOMNIUM PROPERTIES:
 * 1. Aplica banner + layout hub à página SOMNIUM PROPERTIES
 * 2. Arquiva conteúdo antigo do "Gestão Empresarial - Dashboard Central" e redireciona
 * 3. Arquiva sub-páginas Financeiro/Comercial legadas e redireciona para as reais
 */
import sharp from 'sharp'
import https from 'https'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

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

// ── IDs ────────────────────────────────────────────────────────────────────
const SOMNIUM_PAGE          = '2bcc6d45-a01f-80d0-aae1-f5db53cdb9ca'
const DASHBOARD_CENTRAL     = '333c6d45-a01f-8183-a378-e0fd92f7521f'
const LEGACY_FINANCEIRO     = '333c6d45-a01f-81dc-9cb4-d12a999e28ed'
const LEGACY_COMERCIAL      = '333c6d45-a01f-810d-bae7-ca7a9882ebef'
const REAL_FINANCEIRO       = '6a51b61c-e89f-476c-a8b0-69391ab742b2'
const REAL_COMERCIAL        = '8c1965bc-3ac0-49c3-a128-9958f2796dbd'
const REAL_ADMINISTRACAO    = '333b41f4-1d3e-467d-a49e-36b9f4c7206a'
const REAL_FORMACAO         = '9a7cd819-ad5f-4e19-949a-1d42605f2892'

// ── Notion helpers ─────────────────────────────────────────────────────────
function nReq(method, path, body) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null
    const options = {
      hostname: 'api.notion.com', path, method,
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        'Content-Type': 'application/json',
        'Notion-Version': '2022-06-28',
        ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
      },
    }
    const req = https.request(options, res => {
      let raw = ''
      res.on('data', d => raw += d)
      res.on('end', () => {
        const json = JSON.parse(raw)
        if (res.statusCode >= 200 && res.statusCode < 300) resolve(json)
        else reject(new Error(`Notion ${res.statusCode} ${path}: ${raw.slice(0, 300)}`))
      })
    })
    req.on('error', reject)
    if (payload) req.write(payload)
    req.end()
  })
}

async function getChildren(id) {
  const r = await nReq('GET', `/v1/blocks/${id}/children?page_size=100`)
  return r.results ?? []
}

async function archiveAll(id) {
  const blocks = await getChildren(id)
  let n = 0
  for (const b of blocks) {
    if (b.type !== 'child_page' && b.type !== 'child_database') {
      try { await nReq('PATCH', `/v1/blocks/${b.id}`, { archived: true }); n++ } catch {}
    }
  }
  return n
}

async function append(id, children) {
  await nReq('PATCH', `/v1/blocks/${id}/children`, { children })
}

async function setCover(id, url) {
  await nReq('PATCH', `/v1/pages/${id}`, { cover: { type: 'external', external: { url } } })
}

// ── Banner generator ───────────────────────────────────────────────────────
function makeSVG(title, subtitle, svgEmoji) {
  const fontSize = title.length > 20 ? 60 : title.length > 14 ? 72 : 84
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1500" height="600" viewBox="0 0 1500 600">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#080808"/>
      <stop offset="50%" stop-color="#111111"/>
      <stop offset="100%" stop-color="#080808"/>
    </linearGradient>
    <linearGradient id="gl" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="transparent"/>
      <stop offset="20%" stop-color="#C9A84C88"/>
      <stop offset="50%" stop-color="#C9A84C"/>
      <stop offset="80%" stop-color="#C9A84C88"/>
      <stop offset="100%" stop-color="transparent"/>
    </linearGradient>
    <radialGradient id="glow" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#C9A84C" stop-opacity="0.12"/>
      <stop offset="100%" stop-color="#C9A84C" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="1500" height="600" fill="url(#bg)"/>
  <ellipse cx="750" cy="300" rx="650" ry="300" fill="url(#glow)"/>
  <rect x="0" y="0" width="1500" height="4" fill="url(#gl)"/>
  <rect x="0" y="596" width="1500" height="4" fill="url(#gl)"/>
  <line x1="40" y1="4" x2="40" y2="55" stroke="#C9A84C" stroke-width="2" opacity="0.5"/>
  <line x1="4" y1="40" x2="95" y2="40" stroke="#C9A84C" stroke-width="2" opacity="0.5"/>
  <line x1="1460" y1="4" x2="1460" y2="55" stroke="#C9A84C" stroke-width="2" opacity="0.5"/>
  <line x1="1405" y1="40" x2="1496" y2="40" stroke="#C9A84C" stroke-width="2" opacity="0.5"/>
  <line x1="40" y1="596" x2="40" y2="545" stroke="#C9A84C" stroke-width="2" opacity="0.5"/>
  <line x1="4" y1="560" x2="95" y2="560" stroke="#C9A84C" stroke-width="2" opacity="0.5"/>
  <line x1="1460" y1="596" x2="1460" y2="545" stroke="#C9A84C" stroke-width="2" opacity="0.5"/>
  <line x1="1405" y1="560" x2="1496" y2="560" stroke="#C9A84C" stroke-width="2" opacity="0.5"/>
  <text x="750" y="222" text-anchor="middle" dominant-baseline="middle"
        font-family="Apple Color Emoji, Segoe UI Emoji, Noto Color Emoji, sans-serif"
        font-size="96">${svgEmoji}</text>
  <text x="750" y="340" text-anchor="middle" dominant-baseline="middle"
        font-family="'SF Pro Display', 'Helvetica Neue', Arial, sans-serif"
        font-size="${fontSize}" font-weight="700" letter-spacing="8"
        fill="white" stroke="#C9A84C" stroke-width="1.5" paint-order="stroke">${title}</text>
  <rect x="350" y="372" width="800" height="2" rx="1" fill="#C9A84C" opacity="0.45"/>
  <text x="750" y="416" text-anchor="middle" dominant-baseline="middle"
        font-family="'SF Pro Text', 'Helvetica Neue', Arial, sans-serif"
        font-size="20" font-weight="400" letter-spacing="5"
        fill="#777777">${subtitle}</text>
</svg>`
}

async function genAndUpload(filename, title, subtitle, svgEmoji) {
  const dir = path.join(__dirname, '../public/subbanners')
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  const fp = path.join(dir, filename)
  await sharp(Buffer.from(makeSVG(title, subtitle, svgEmoji))).png().toFile(fp)

  const body = JSON.stringify({ image: fs.readFileSync(fp).toString('base64'), type: 'base64' })
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.imgur.com', path: '/3/image', method: 'POST',
      headers: { Authorization: 'Client-ID 546c25a59c58ad7', 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
    }, res => {
      let raw = ''; res.on('data', d => raw += d)
      res.on('end', () => { const j = JSON.parse(raw); if (j.success) resolve(j.data.link); else reject(new Error(JSON.stringify(j))) })
    })
    req.on('error', reject); req.write(body); req.end()
  })
}

// ── Rich text helpers ──────────────────────────────────────────────────────
const bold = (text, color = 'default') => [{ type: 'text', text: { content: text }, annotations: { bold: true, color } }]
const plain = (text, color = 'gray') => [{ type: 'text', text: { content: text }, annotations: { color } }]
const link = (text, url) => [{ type: 'text', text: { content: text, link: { url } }, annotations: { bold: true, color: 'default' } }]

// ── Step 1: SOMNIUM PROPERTIES main page ──────────────────────────────────
async function styleMainPage() {
  console.log('\n── SOMNIUM PROPERTIES (página principal)')

  const url = await genAndUpload('somnium_main.png', 'SOMNIUM PROPERTIES', 'Gestão Empresarial · Imobiliário &amp; Construção', '&#x1F3E2;')
  await setCover(SOMNIUM_PAGE, url)
  console.log('  ✓ Banner aplicado:', url)

  const archived = await archiveAll(SOMNIUM_PAGE)
  if (archived) console.log(`  ✓ Arquivados ${archived} blocos antigos`)

  await append(SOMNIUM_PAGE, [
    {
      object: 'block', type: 'callout', callout: {
        rich_text: [
          ...bold('SOMNIUM PROPERTIES\n'),
          ...plain('Gestão Empresarial · Imobiliário & Construção'),
        ],
        icon: { type: 'emoji', emoji: '🏢' },
        color: 'gray_background',
      },
    },
    { object: 'block', type: 'divider', divider: {} },
    {
      object: 'block', type: 'heading_2', heading_2: {
        rich_text: plain('🏛️  ADMINISTRAÇÃO', 'default'),
      },
    },
    {
      object: 'block', type: 'paragraph', paragraph: {
        rich_text: link('→ Abrir Administração', `https://www.notion.so/${REAL_ADMINISTRACAO.replace(/-/g, '')}`),
      },
    },
    { object: 'block', type: 'divider', divider: {} },
    {
      object: 'block', type: 'heading_2', heading_2: {
        rich_text: plain('💰  DEPARTAMENTO FINANCEIRO', 'default'),
      },
    },
    {
      object: 'block', type: 'paragraph', paragraph: {
        rich_text: link('→ Abrir Departamento Financeiro', `https://www.notion.so/${REAL_FINANCEIRO.replace(/-/g, '')}`),
      },
    },
    { object: 'block', type: 'divider', divider: {} },
    {
      object: 'block', type: 'heading_2', heading_2: {
        rich_text: plain('🏡  DEPARTAMENTO COMERCIAL & VENDAS', 'default'),
      },
    },
    {
      object: 'block', type: 'paragraph', paragraph: {
        rich_text: link('→ Abrir Departamento Comercial', `https://www.notion.so/${REAL_COMERCIAL.replace(/-/g, '')}`),
      },
    },
    { object: 'block', type: 'divider', divider: {} },
    {
      object: 'block', type: 'heading_2', heading_2: {
        rich_text: plain('🎓  FORMAÇÃO', 'default'),
      },
    },
    {
      object: 'block', type: 'paragraph', paragraph: {
        rich_text: link('→ Abrir Formação', `https://www.notion.so/${REAL_FORMACAO.replace(/-/g, '')}`),
      },
    },
    { object: 'block', type: 'divider', divider: {} },
    {
      object: 'block', type: 'callout', callout: {
        rich_text: [
          ...bold('Dashboard Web — Tempo Real\n'),
          ...plain('localhost:5173  ·  KPIs, Pipeline, Financeiro, Comercial em tempo real'),
        ],
        icon: { type: 'emoji', emoji: '🖥️' },
        color: 'blue_background',
      },
    },
  ])
  console.log('  ✓ Layout hub aplicado')
}

// ── Step 2: Archive legacy Dashboard Central and redirect ──────────────────
async function cleanDashboardCentral() {
  console.log('\n── Gestão Empresarial — Dashboard Central (legado)')

  const url = await genAndUpload('dashboard_central.png', 'DASHBOARD CENTRAL', 'Consolidado em SOMNIUM PROPERTIES', '&#x1F4CC;')
  await setCover(DASHBOARD_CENTRAL, url)
  console.log('  ✓ Banner aplicado')

  const archived = await archiveAll(DASHBOARD_CENTRAL)
  if (archived) console.log(`  ✓ Arquivados ${archived} blocos antigos`)

  await append(DASHBOARD_CENTRAL, [
    {
      object: 'block', type: 'callout', callout: {
        rich_text: [
          ...bold('Este espaço foi consolidado\n'),
          ...plain('Toda a gestão e dados operacionais foram centralizados em SOMNIUM PROPERTIES.'),
        ],
        icon: { type: 'emoji', emoji: '📌' },
        color: 'yellow_background',
      },
    },
    {
      object: 'block', type: 'paragraph', paragraph: {
        rich_text: link('→ Ir para SOMNIUM PROPERTIES', `https://www.notion.so/${SOMNIUM_PAGE.replace(/-/g, '')}`),
      },
    },
    { object: 'block', type: 'divider', divider: {} },
    {
      object: 'block', type: 'paragraph', paragraph: {
        rich_text: [
          ...link('💰 Departamento Financeiro', `https://www.notion.so/${REAL_FINANCEIRO.replace(/-/g, '')}`),
          ...plain('  ·  '),
          ...link('🏡 Departamento Comercial', `https://www.notion.so/${REAL_COMERCIAL.replace(/-/g, '')}`),
        ],
      },
    },
  ])
  console.log('  ✓ Página redirecionada para SOMNIUM PROPERTIES')
}

// ── Step 3: Legacy Financeiro sub-page → redirect to real ─────────────────
async function cleanLegacyFinanceiro() {
  console.log('\n── Dashboard Central → Financeiro (legado)')

  const archived = await archiveAll(LEGACY_FINANCEIRO)
  if (archived) console.log(`  ✓ Arquivados ${archived} blocos`)

  await append(LEGACY_FINANCEIRO, [
    {
      object: 'block', type: 'callout', callout: {
        rich_text: [
          ...bold('Dados financeiros consolidados\n'),
          ...plain('Os dados reais de Faturação e Despesas estão no Departamento Financeiro.'),
        ],
        icon: { type: 'emoji', emoji: '💰' },
        color: 'gray_background',
      },
    },
    {
      object: 'block', type: 'paragraph', paragraph: {
        rich_text: link('→ Abrir Departamento Financeiro', `https://www.notion.so/${REAL_FINANCEIRO.replace(/-/g, '')}`),
      },
    },
  ])
  console.log('  ✓ Redirecionado para Departamento Financeiro real')
}

// ── Step 4: Legacy Comercial sub-page → redirect to real ──────────────────
async function cleanLegacyComercial() {
  console.log('\n── Dashboard Central → Comercial & Vendas (legado)')

  const archived = await archiveAll(LEGACY_COMERCIAL)
  if (archived) console.log(`  ✓ Arquivados ${archived} blocos`)

  await append(LEGACY_COMERCIAL, [
    {
      object: 'block', type: 'callout', callout: {
        rich_text: [
          ...bold('Dados comerciais consolidados\n'),
          ...plain('O Pipeline de Imóveis, Investidores e Empreiteiros estão no Departamento Comercial.'),
        ],
        icon: { type: 'emoji', emoji: '🏡' },
        color: 'gray_background',
      },
    },
    {
      object: 'block', type: 'paragraph', paragraph: {
        rich_text: link('→ Abrir Departamento Comercial', `https://www.notion.so/${REAL_COMERCIAL.replace(/-/g, '')}`),
      },
    },
  ])
  console.log('  ✓ Redirecionado para Departamento Comercial real')
}

// ── Main ───────────────────────────────────────────────────────────────────
async function main() {
  await styleMainPage()
  await cleanDashboardCentral()
  await cleanLegacyFinanceiro()
  await cleanLegacyComercial()
  console.log('\n✅ Unificação concluída. Tudo centralizado em SOMNIUM PROPERTIES.')
}

main().catch(e => { console.error(e.message ?? e); process.exit(1) })
