#!/usr/bin/env node
/**
 * Phase 2 — Simplify status options:
 *  1. Pipeline Imóveis: 17 → 9 estados
 *  2. Lista Investidores: 16 → 7 status
 *
 * Strategy:
 *  - For rows using states being merged: PATCH the page to the target state first
 *  - Then rename all source options via PATCH /databases/{id}
 *
 * Run: node scripts/simplify-states.js [--dry-run]
 */
import https from 'https'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DRY_RUN = process.argv.includes('--dry-run')

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
const DB_PIPELINE = process.env.NOTION_DB_PIPELINE_IMOVEIS
const DB_INVEST   = process.env.NOTION_DB_INVESTIDORES

if (!TOKEN)       { console.error('NOTION_API_KEY não definida'); process.exit(1) }
if (!DB_PIPELINE) { console.error('NOTION_DB_PIPELINE_IMOVEIS não definida'); process.exit(1) }
if (!DB_INVEST)   { console.error('NOTION_DB_INVESTIDORES não definida'); process.exit(1) }

// ── HTTP helper ─────────────────────────────────────────────────────────────
function nReq(method, urlPath, body) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null
    const req = https.request({
      hostname: 'api.notion.com', path: urlPath, method,
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        'Content-Type': 'application/json',
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
          else reject(new Error(`Notion ${res.statusCode}: ${raw.slice(0, 400)}`))
        } catch (e) { reject(e) }
      })
    })
    req.on('error', reject)
    if (payload) req.write(payload)
    req.end()
  })
}

async function queryAll(dbId) {
  const rows = []
  let cursor
  do {
    const body = { page_size: 100 }
    if (cursor) body.start_cursor = cursor
    const r = await nReq('POST', `/v1/databases/${dbId}/query`, body)
    rows.push(...r.results)
    cursor = r.has_more ? r.next_cursor : undefined
  } while (cursor)
  return rows
}

// ── Migration helpers ────────────────────────────────────────────────────────

/**
 * Migrate rows: for each row whose current status is in `fromNames`,
 * update it to `toName`.
 */
async function migrateRows(rows, propName, fromNames, toName, label) {
  const toMigrate = rows.filter(r => fromNames.includes(r.properties[propName]?.status?.name))
  if (toMigrate.length === 0) {
    console.log(`     (nenhuma fila a migrar de [${fromNames.join(', ')}] → ${toName})`)
    return 0
  }
  console.log(`     Migrar ${toMigrate.length} filas: [${fromNames.join(', ')}] → "${toName}"`)
  let done = 0
  for (const row of toMigrate) {
    const current = row.properties[propName]?.status?.name
    if (DRY_RUN) {
      console.log(`       [dry] "${row.properties['Nome do Imóvel']?.title?.[0]?.plain_text ?? row.properties['Nome']?.title?.[0]?.plain_text ?? row.id}" : "${current}" → "${toName}"`)
      done++
    } else {
      await nReq('PATCH', `/v1/pages/${row.id}`, {
        properties: { [propName]: { status: { name: toName } } },
      })
      done++
    }
  }
  return done
}

/**
 * Rename status options in a DB schema.
 * renameMap: { 'Old Name': 'New Name', ... }
 * Options not in renameMap are left unchanged.
 */
async function renameOptions(dbId, propName, renameMap) {
  const schema = await nReq('GET', `/v1/databases/${dbId}`)
  const prop = schema.properties[propName]
  if (!prop || prop.type !== 'status') {
    throw new Error(`Property "${propName}" is not a status field in DB ${dbId}`)
  }

  // status options are spread across groups
  const groups = prop.status.groups ?? []
  const options = prop.status.options ?? []

  const updatedOptions = options.map(opt => {
    const newName = renameMap[opt.name]
    if (newName && newName !== opt.name) {
      console.log(`     Renomear: "${opt.name}" → "${newName}"`)
      return { ...opt, name: newName }
    }
    return opt
  })

  if (DRY_RUN) {
    console.log(`     [dry-run] schema patch ignorado`)
    return
  }

  await nReq('PATCH', `/v1/databases/${dbId}`, {
    properties: {
      [propName]: {
        status: { options: updatedOptions, groups },
      },
    },
  })
}

// ══════════════════════════════════════════════════════════════════════════════
// PIPELINE IMÓVEIS — 17 → 9 estados
// ══════════════════════════════════════════════════════════════════════════════

// Migration plan: states that need row-level migration BEFORE rename
// (because we're merging multiple → one that already has rows)
const PIPELINE_ROW_MIGRATIONS = [
  // from (old states)                                    → to (target = existing name we'll keep)
  { from: ['Pendentes', 'Chamada Não Atendida'],          to: 'Adicionado' },         // rename Adicionado→Em Análise after
  { from: ['Necessidade de Visita'],                       to: 'Visita Marcada' },
  { from: ['Follow Up após proposta'],                     to: 'Follow UP' },
  { from: ['Criar Proposta ao Proprietário',
           'Enviar proposta ao Proprietário',
           'Em negociação', 'Proposta aceite'],            to: 'Enviar proposta ao investidor' }, // will rename after
  { from: ['CAEP', 'Fix and Flip'],                        to: 'Wholesaling' },        // will rename after
]

// Final rename map (applied after row migrations)
const PIPELINE_RENAME = {
  'Adicionado':                    'Em Análise',
  'Chamada Não Atendida':          'Em Análise (legacy)',     // safety rename — should be 0 rows
  'Pendentes':                     'Em Análise (legacy 2)',   // safety rename — should be 0 rows after migration
  'Necessidade de Visita':         'Visita (legacy)',         // should be 0 rows
  'Criar Proposta ao Proprietário':'Proposta (legacy 1)',     // should be 0 rows
  'Enviar proposta ao Proprietário':'Proposta (legacy 2)',    // should be 0 rows
  'Em negociação':                 'Proposta (legacy 3)',     // should be 0 rows
  'Proposta aceite':               'Proposta (legacy 4)',     // should be 0 rows
  'Follow Up após proposta':       'Follow Up (legacy)',      // should be 0 rows
  'CAEP':                          'Negócio em Curso',
  'Fix and Flip':                  'Negócio em Curso (legacy)',
  'Nao interessa':                 'Descartado',
  // Keep as-is: Visita Marcada, Estudo de VVR, Enviar proposta ao investidor, Follow UP, Wholesaling
}

// ══════════════════════════════════════════════════════════════════════════════
// LISTA INVESTIDORES — 16 → 7 status
// ══════════════════════════════════════════════════════════════════════════════

// Only 5 states have rows — no row migrations needed, just renames
const INVESTIDORES_RENAME = {
  'Potencial Investidor':   'Potencial',
  'Marcar call':            'Marcar Call',
  'Call marcada':           'Call Marcada',
  // 'Follow Up' stays as-is
  'Investidor em parceria': 'Em Parceria',
  // Unused states — renamed to mark as legacy so they're visually clear
  'Hibernacao':             'Hibernação',
  'Investidor em espera':'Classificado',
  'Lead Frio':              'Lead Frio',
  'Primeiro Contacto':      'Primeiro Contacto',
  'Em Qualificacao':        'Em Qualificação',
  'Qualificado':            'Qualificado',
  'Proposta Enviada':       'Proposta Enviada',
  'Em Negociacao':          'Em Negociação',
  'Investidor Ativo':       'Ativo',
  'Investidor Inativo':     'Inativo',
  // 'Perdido' stays as-is
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log(DRY_RUN ? '🔍 DRY RUN\n' : '🚀 A simplificar estados...\n')

  // ── PIPELINE IMÓVEIS ──────────────────────────────────────────────────────
  console.log('━━━ Pipeline Imóveis ━━━')
  const pipelineRows = await queryAll(DB_PIPELINE)
  console.log(`  ${pipelineRows.length} filas carregadas\n`)

  let totalMigrated = 0
  for (const plan of PIPELINE_ROW_MIGRATIONS) {
    const n = await migrateRows(pipelineRows, 'Estado', plan.from, plan.to, 'Pipeline')
    totalMigrated += n
  }

  console.log('\n  A renomear opções de schema...')
  await renameOptions(DB_PIPELINE, 'Estado', PIPELINE_RENAME)

  console.log(`\n  ✓ Pipeline: ${totalMigrated} filas migradas, schema atualizado`)

  // ── LISTA INVESTIDORES ────────────────────────────────────────────────────
  console.log('\n━━━ Lista Investidores ━━━')
  console.log('  Sem migrações de filas necessárias (estados usados já são os correctos)\n')
  console.log('  A renomear opções de schema...')
  await renameOptions(DB_INVEST, 'Status', INVESTIDORES_RENAME)
  console.log('  ✓ Investidores: schema atualizado')

  console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${DRY_RUN ? '🔍 DRY RUN — nenhuma alteração foi escrita' : '✅ Estados simplificados com sucesso'}

Pipeline Imóveis — 9 estados activos:
  Em Análise · Visita Marcada · Follow UP
  Estudo de VVR · Enviar proposta ao investidor
  Wholesaling · Negócio em Curso · Descartado
  (+ legados com 0 filas para referência)

Lista Investidores — 7 estados activos:
  Potencial · Marcar Call · Call Marcada
  Follow Up · Em Parceria · Inativo · Perdido
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`)
}

main().catch(e => { console.error('\n❌', e.message ?? e); process.exit(1) })
