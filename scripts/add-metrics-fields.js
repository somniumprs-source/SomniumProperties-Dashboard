#!/usr/bin/env node
/**
 * Adiciona campos em falta ao Notion para suportar o framework de métricas:
 *
 * Pipeline Imóveis:
 *   + Modelo de Negócio (select) — Wholesaling | Fix & Flip | Mediação
 *   + Motivo Descarte   (select) — razão do descarte do imóvel
 *
 * Faturação:
 *   + Custo Real de Obra (number) — custo efectivo vs estimado (F&F)
 *
 * Investidores:
 *   + Data Capital Transferido (date) — data em que o capital foi efectivamente transferido
 *
 * Run: node scripts/add-metrics-fields.js
 */
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
if (!TOKEN) { console.error('NOTION_API_KEY não definida'); process.exit(1) }

function nReq(method, urlPath, body) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null
    const req = https.request({
      hostname: 'api.notion.com', path: urlPath, method,
      headers: {
        Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json',
        'Notion-Version': '2022-06-28',
        ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
      },
    }, res => {
      let raw = ''
      res.on('data', d => raw += d)
      res.on('end', () => {
        try {
          const json = JSON.parse(raw)
          if (res.statusCode >= 200 && res.statusCode < 300) resolve(json)
          else reject(new Error(`${res.statusCode}: ${raw.slice(0, 300)}`))
        } catch (e) { reject(e) }
      })
    })
    req.on('error', reject)
    if (payload) req.write(payload)
    req.end()
  })
}

async function getProps(dbId) {
  const db = await nReq('GET', `/v1/databases/${dbId}`)
  return Object.keys(db.properties)
}

async function addProps(dbId, label, props) {
  const existing = await getProps(dbId)
  const toAdd = {}
  for (const [name, def] of Object.entries(props)) {
    if (existing.includes(name)) {
      console.log(`  ⏭  "${name}" já existe`)
    } else {
      toAdd[name] = def
      console.log(`  + "${name}"`)
    }
  }
  if (Object.keys(toAdd).length === 0) {
    console.log(`  (sem campos a adicionar)`)
    return
  }
  await nReq('PATCH', `/v1/databases/${dbId}`, { properties: toAdd })
  console.log(`  ✓ ${Object.keys(toAdd).length} campo(s) adicionado(s)`)
}

async function main() {
  console.log('🚀 A adicionar campos de métricas ao Notion...\n')

  // ── Pipeline Imóveis ─────────────────────────────────────────────
  console.log('── Pipeline Imóveis')
  await addProps(process.env.NOTION_DB_PIPELINE_IMOVEIS, 'Pipeline', {
    'Modelo de Negócio': {
      select: {
        options: [
          { name: 'Wholesaling',  color: 'blue'   },
          { name: 'Fix & Flip',   color: 'orange' },
          { name: 'Mediação',     color: 'green'  },
        ],
      },
    },
    'Motivo Descarte': {
      select: {
        options: [
          { name: 'Preço alto',                  color: 'red'    },
          { name: 'ROI insuficiente',             color: 'orange' },
          { name: 'Zona fraca',                   color: 'yellow' },
          { name: 'Proprietário não negoceia',    color: 'pink'   },
          { name: 'Problema legal',               color: 'purple' },
          { name: 'Imóvel ocupado',               color: 'brown'  },
          { name: 'Concorrência ganhou',          color: 'gray'   },
          { name: 'Outro',                        color: 'default'},
        ],
      },
    },
  })

  // ── Faturação ────────────────────────────────────────────────────
  console.log('\n── Faturação')
  await addProps(process.env.NOTION_DB_FATURACAO, 'Faturação', {
    'Custo Real de Obra': {
      number: { format: 'euro' },
    },
    'Data Compra': {
      date: {},
    },
  })

  // ── Investidores ─────────────────────────────────────────────────
  console.log('\n── Investidores')
  await addProps(process.env.NOTION_DB_INVESTIDORES, 'Investidores', {
    'Data Capital Transferido': {
      date: {},
    },
  })

  console.log('\n✅ Campos adicionados. Actualiza os registos existentes no Notion para começar a recolher dados.')
  console.log('\nCampos adicionados por DB:')
  console.log('  Pipeline Imóveis → "Modelo de Negócio" e "Motivo Descarte"')
  console.log('  Faturação        → "Custo Real de Obra" e "Data Compra"')
  console.log('  Investidores     → "Data Capital Transferido"')
}

main().catch(e => { console.error('\n❌', e.message); process.exit(1) })
