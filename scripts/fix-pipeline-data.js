#!/usr/bin/env node
/**
 * Phase 2 — Pipeline Imóveis data fixes:
 *  1. Add Zona (Multi) multi_select property with Coimbra parishes + Condeixa + Mealhada
 *  2. Migrate existing Zona (rich_text) values → Zona (Multi)
 *  3. Archive TEMPLATE row
 *  4. Archive duplicate T2 Pedrulha (keep the one with area=76m², added 2025-12-11)
 *
 * Run: node scripts/fix-pipeline-data.js
 * Add --dry-run to preview changes without writing.
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
const DB_ID = process.env.NOTION_DB_PIPELINE_IMOVEIS

if (!TOKEN) { console.error('NOTION_API_KEY não definida'); process.exit(1) }
if (!DB_ID) { console.error('NOTION_DB_PIPELINE_IMOVEIS não definida'); process.exit(1) }

// ── Notion HTTP helper ──────────────────────────────────────────────────────
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

// ── Paginate all rows from a DB ─────────────────────────────────────────────
async function getAllRows(dbId) {
  const rows = []
  let cursor = undefined
  do {
    const body = { page_size: 100 }
    if (cursor) body.start_cursor = cursor
    const r = await nReq('POST', `/v1/databases/${dbId}/query`, body)
    rows.push(...r.results)
    cursor = r.has_more ? r.next_cursor : undefined
  } while (cursor)
  return rows
}

// ── Zona normalisation ──────────────────────────────────────────────────────
// Some entries are compound ("Cernache, Coimbra", "Casais, SMB").
// We split by common separators, normalise each token, and return all matches.

// Token → canonical option name
const TOKEN_MAP = {
  'alta':                     'Alta',
  'alta/praça república':     'Alta',
  'alta/praça republica':     'Alta',
  'praça república':          'Alta',
  'praça da república':       'Alta',
  'praça':                    'Alta',
  'coimbra centro':           'Alta',
  'carvalhais':               'Carvalhais',
  'figueira da foz':          null,         // unrelated municipality — skip token
  'ceia':                     'Ceia',
  'celas':                    'Celas',
  'ceira':                    'Ceira',
  'cernache':                 'Cernache',
  'caic':                     'Cernache',   // CAIC complex is in Cernache
  'corujeira':                'Corujeira',
  'eiras':                    'Eiras',
  'relvinha':                 'Eiras',      // Relvinha is within Eiras
  'monte formoso':            'Eiras',      // Monte Formoso is within Eiras
  'olivais':                  'Olivais',
  'norton de matos':          'Olivais',
  'pedrulha':                 'Pedrulha',
  'pereiros':                 'Pereiros',
  'santa clara':              'Santa Clara',
  'são martinho do bispo':    'São Martinho do Bispo',
  'são martinho':             'São Martinho do Bispo',
  'sao martinho do bispo':    'São Martinho do Bispo',
  'sao martinho':             'São Martinho do Bispo',
  'smb':                      'São Martinho do Bispo',
  'casais':                   'São Martinho do Bispo', // Casais neighbourhood near SMB
  'ribeira de frades':        'Ribeira de Frades',
  'solum':                    'Solum',
  'souselas':                 'Souselas',
  'vale das flores':          'Vale das Flores',
  'condeixa':                 'Condeixa',
  'condeixa-a-nova':          'Condeixa',
  'mealhada':                 'Mealhada',
  'montemor-o-velho':         'Montemor-o-Velho',
  'montemor o velho':         'Montemor-o-Velho',
  'montemor':                 'Montemor-o-Velho',
  'soure':                    'Soure',
  // Ambiguous tokens to skip
  'coimbra':                  null,
  'praia fluvial':            null,
  'rua dos combatentes':      null,
}

// All normalised option names (for creating the property schema)
const ZONA_OPTIONS = [
  // Coimbra — parishes / neighbourhoods
  { name: 'Alta',                  color: 'blue'   },
  { name: 'Carvalhais',            color: 'blue'   },
  { name: 'Ceia',                  color: 'blue'   },
  { name: 'Celas',                 color: 'blue'   },
  { name: 'Ceira',                 color: 'blue'   },
  { name: 'Cernache',              color: 'blue'   },
  { name: 'Corujeira',             color: 'blue'   },
  { name: 'Eiras',                 color: 'blue'   },
  { name: 'Olivais',               color: 'blue'   },
  { name: 'Pedrulha',              color: 'blue'   },
  { name: 'Pereiros',              color: 'blue'   },
  { name: 'Ribeira de Frades',     color: 'blue'   },
  { name: 'Santa Clara',           color: 'blue'   },
  { name: 'São Martinho do Bispo', color: 'blue'   },
  { name: 'Solum',                 color: 'blue'   },
  { name: 'Souselas',              color: 'blue'   },
  { name: 'Vale das Flores',       color: 'blue'   },
  // Condeixa-a-Nova
  { name: 'Condeixa',              color: 'green'  },
  // Mealhada
  { name: 'Mealhada',              color: 'purple' },
  // Montemor-o-Velho
  { name: 'Montemor-o-Velho',      color: 'yellow' },
  // Soure
  { name: 'Soure',                 color: 'orange' },
]

// ── Step helpers ────────────────────────────────────────────────────────────
function richTextToString(rt) {
  if (!rt || !Array.isArray(rt)) return ''
  return rt.map(t => t.plain_text ?? t.text?.content ?? '').join('').trim()
}

function mapZona(raw) {
  if (!raw) return []
  // Split compound values like "Cernache, Coimbra", "Casais, SMB", "CAIC, Cernache"
  const tokens = raw.split(/[,/&+]+/).map(t => t.trim().toLowerCase()).filter(Boolean)
  const seen = new Set()
  const results = []
  for (const token of tokens) {
    if (token in TOKEN_MAP) {
      const canonical = TOKEN_MAP[token]
      if (canonical && !seen.has(canonical)) {
        seen.add(canonical)
        results.push({ name: canonical })
      }
      // null means "skip this token" (e.g. generic "coimbra")
    } else {
      console.warn(`    ⚠  Token de zona desconhecido: "${token}" (de "${raw}")`)
    }
  }
  return results
}

// ── Main ────────────────────────────────────────────────────────────────────
async function main() {
  console.log(DRY_RUN ? '🔍 DRY RUN — nenhuma alteração será escrita\n' : '🚀 A executar migrações...\n')

  // ── 1. Get DB schema ──────────────────────────────────────────────────────
  console.log('1/4  A ler schema da base de dados...')
  const schema = await nReq('GET', `/v1/databases/${DB_ID}`)
  const props = schema.properties
  const hasZonaMulti = !!props['Zona (Multi)']
  console.log(`     Propriedades encontradas: ${Object.keys(props).join(', ')}`)
  console.log(`     "Zona (Multi)" já existe: ${hasZonaMulti}`)

  // ── 2. Add Zona (Multi) multi_select ──────────────────────────────────────
  if (!hasZonaMulti) {
    console.log('\n2/4  A criar propriedade "Zona (Multi)"...')
    if (!DRY_RUN) {
      await nReq('PATCH', `/v1/databases/${DB_ID}`, {
        properties: {
          'Zona (Multi)': {
            multi_select: { options: ZONA_OPTIONS },
          },
        },
      })
      console.log('     ✓ Propriedade criada com', ZONA_OPTIONS.length, 'opções')
    } else {
      console.log('     [dry-run] criaria "Zona (Multi)" com', ZONA_OPTIONS.length, 'opções')
    }
  } else {
    console.log('\n2/4  "Zona (Multi)" já existe — a saltar criação')
  }

  // ── 3. Fetch all rows ──────────────────────────────────────────────────────
  console.log('\n3/4  A carregar todas as filas do Pipeline...')
  const rows = await getAllRows(DB_ID)
  console.log(`     ${rows.length} filas encontradas`)

  let migratedZona = 0
  let skippedZona = 0
  let archivedTemplate = 0
  let archivedDupes = 0
  const unknownZonas = new Set()

  // Track T2 Pedrulha candidates for deduplication
  // Keep: Nome contains "Pedrulha" AND Tipologia contains "T2", area=76, date 2025-12-11
  const pedrulhaT2 = []

  for (const row of rows) {
    const p = row.properties
    const nome = richTextToString(p['Nome do Imóvel']?.title)
    const tipologia = richTextToString(p['Tipologia']?.rich_text) ||
                      p['Tipologia']?.select?.name || ''
    const zonaRaw = richTextToString(p['Zona']?.rich_text)
    const estadoName = p['Estado']?.status?.name ?? ''
    const origemName = p['Origem']?.select?.name ?? ''
    const askPrice = p['Ask Price']?.number ?? p['Ask Price (€)']?.number ?? null
    const area = p['Área Bruta']?.number ?? null
    const createdTime = row.created_time

    // ── Identify TEMPLATE row ──────────────────────────────────────────────
    const isTemplate = (
      nome === '' ||
      nome.toLowerCase().includes('template') ||
      (askPrice === null || askPrice === 0) && estadoName === 'Adicionado' && origemName === 'Portais'
    )

    if (isTemplate) {
      console.log(`\n     🗑  TEMPLATE identificado: "${nome || '(sem nome)'}" [${row.id}]`)
      if (!DRY_RUN) {
        await nReq('PATCH', `/v1/pages/${row.id}`, { archived: true })
        archivedTemplate++
        console.log('         ✓ Arquivado')
      } else {
        console.log('         [dry-run] seria arquivado')
        archivedTemplate++
      }
      continue
    }

    // ── Track T2 Pedrulha duplicates ──────────────────────────────────────
    const nomeLC = nome.toLowerCase()
    if (nomeLC.includes('pedrulha') && tipologia.includes('T2')) {
      pedrulhaT2.push({ id: row.id, nome, area, createdTime })
    }

    // ── Migrate Zona ──────────────────────────────────────────────────────
    // Skip if Zona (Multi) already has values
    const zonaMultiCurrent = p['Zona (Multi)']?.multi_select ?? []
    if (zonaMultiCurrent.length > 0) {
      skippedZona++
      continue
    }

    if (!zonaRaw) {
      skippedZona++
      continue
    }

    const newOptions = mapZona(zonaRaw)
    if (newOptions.length === 0) {
      unknownZonas.add(zonaRaw)
      skippedZona++
      continue
    }

    if (!DRY_RUN) {
      await nReq('PATCH', `/v1/pages/${row.id}`, {
        properties: { 'Zona (Multi)': { multi_select: newOptions } },
      })
      migratedZona++
    } else {
      console.log(`     [dry-run] "${nome}" Zona: "${zonaRaw}" → "${newOptions[0].name}"`)
      migratedZona++
    }
  }

  // ── 4. Handle T2 Pedrulha duplicates ─────────────────────────────────────
  console.log(`\n4/4  Duplicados T2 Pedrulha encontrados: ${pedrulhaT2.length}`)
  if (pedrulhaT2.length > 1) {
    // Sort: keep the one with area=76 / created 2025-12-11 (the more complete)
    pedrulhaT2.sort((a, b) => {
      // Prefer area=76
      const aScore = (a.area === 76 ? 2 : 0) + (a.createdTime?.startsWith('2025-12-11') ? 1 : 0)
      const bScore = (b.area === 76 ? 2 : 0) + (b.createdTime?.startsWith('2025-12-11') ? 1 : 0)
      return bScore - aScore
    })
    const [keep, ...remove] = pedrulhaT2
    console.log(`     Manter : "${keep.nome}" (área=${keep.area}m², criado=${keep.createdTime?.slice(0, 10)})`)
    for (const dup of remove) {
      console.log(`     Arquivar: "${dup.nome}" (área=${dup.area}m², criado=${dup.createdTime?.slice(0, 10)}) [${dup.id}]`)
      if (!DRY_RUN) {
        await nReq('PATCH', `/v1/pages/${dup.id}`, { archived: true })
        archivedDupes++
        console.log('     ✓ Arquivado')
      } else {
        console.log('     [dry-run] seria arquivado')
        archivedDupes++
      }
    }
  } else if (pedrulhaT2.length === 1) {
    console.log(`     Apenas 1 entrada T2 Pedrulha — sem duplicados`)
  } else {
    console.log(`     Nenhum T2 Pedrulha encontrado`)
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${DRY_RUN ? '🔍 DRY RUN — resumo do que seria feito' : '✅ Migração concluída'}

  Zona migrada:       ${migratedZona} filas
  Zona ignorada:      ${skippedZona} filas (já preenchida ou vazia)
  TEMPLATE arquivado: ${archivedTemplate}
  Duplicados removidos: ${archivedDupes}
${unknownZonas.size > 0 ? `\n  ⚠  Zonas não mapeadas (verificar manualmente):\n  ${[...unknownZonas].join(', ')}` : ''}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`)

  if (DRY_RUN) {
    console.log('\nCorre sem --dry-run para aplicar as alterações.')
  }
}

main().catch(e => { console.error('\n❌', e.message ?? e); process.exit(1) })
