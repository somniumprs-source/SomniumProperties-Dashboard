#!/usr/bin/env node
/**
 * Batch: garante que todas as reunioes do Fireflies estao associadas ao
 * investidor correcto, com analise_completa preenchida, e exporta PDF
 * corporativo de cada uma para Relatorios/Reunioes/<Investidor>/.
 *
 * Uso:
 *   node scripts/gerar-relatorios-reunioes.js [flags]
 *
 * Flags:
 *   --no-sync          Nao chama Fireflies API (apenas usa BD)
 *   --no-analise       Nao chama Claude API (skip reunioes sem analise)
 *   --no-pdf           Nao escreve ficheiros (apenas normaliza BD)
 *   --desde YYYY-MM-DD Filtrar reunioes por data
 *   --investidor NOME  Apenas reunioes de um investidor (ILIKE %nome%)
 *   --dry-run          Listar accoes sem alterar BD nem escrever ficheiros
 */
import 'dotenv/config'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import pool from '../src/db/pg.js'
import { syncFireflies, isConfigured as firefliesConfigured } from '../src/db/firefliesSync.js'
import { autoFillInvestidor, analyzeReuniao } from '../src/db/meetingAnalysis.js'
import { generateMeetingPDF } from '../src/db/pdfMeetingReport.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const OUT_DIR = path.join(ROOT, 'Relatorios', 'Reunioes')

// ── Args ────────────────────────────────────────────────────────────
const args = process.argv.slice(2)
const flag = (n) => args.includes(n)
const arg = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null }

const opts = {
  noSync: flag('--no-sync'),
  noAnalise: flag('--no-analise'),
  noPdf: flag('--no-pdf'),
  desde: arg('--desde'),
  investidor: arg('--investidor'),
  dryRun: flag('--dry-run'),
}

// ── Helpers ─────────────────────────────────────────────────────────
const SOMNIUM_RE = /somnium|alexandre.*mendes|joao.*abreu|jo[aã]o.*abreu/i

function slugify(s, maxLen = 60) {
  return String(s || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9 _-]/g, '')
    .trim().replace(/\s+/g, '_')
    .slice(0, maxLen) || 'sem_titulo'
}

function fmtDate(d) {
  if (!d) return '0000-00-00'
  const dt = new Date(d)
  if (isNaN(dt)) return '0000-00-00'
  return dt.toISOString().slice(0, 10)
}

function parseParticipantes(p) {
  if (!p) return []
  if (Array.isArray(p)) return p
  try { return JSON.parse(p) } catch { return [] }
}

// Tenta associar reuniao a investidor por email + nome (fallback alargado)
async function reassociar(reuniao) {
  if (reuniao.entidade_id) return reuniao

  // 1. Match por email do organizer + participants
  const participantes = parseParticipantes(reuniao.participantes)
  const emails = [reuniao.organizador, ...participantes]
    .filter(e => e && /@/.test(String(e)))
    .filter(e => !SOMNIUM_RE.test(e))

  for (const email of emails) {
    const { rows: [inv] } = await pool.query(
      'SELECT id, nome FROM investidores WHERE LOWER(email) = LOWER($1) LIMIT 1', [email])
    if (inv) {
      if (!opts.dryRun) {
        await pool.query(
          "UPDATE reunioes SET entidade_tipo='investidores', entidade_id=$1, updated_at=$2 WHERE id=$3",
          [inv.id, new Date().toISOString(), reuniao.id])
      }
      return { ...reuniao, entidade_tipo: 'investidores', entidade_id: inv.id, _matched: 'email' }
    }
  }

  // 2. Match por nome no titulo (alargado: aceita primeiro+ultimo nome)
  const titulo = reuniao.titulo || ''
  const partes = titulo.split(/\s+(?:e|&|com|with)\s+/i).map(s => s.trim()).filter(Boolean)
  for (const parte of partes) {
    if (SOMNIUM_RE.test(parte) || parte.length < 3) continue
    // tentar nome completo, depois primeiro nome
    const tentativas = [parte, parte.split(/\s+/)[0]].filter(t => t.length >= 3)
    for (const nome of tentativas) {
      const { rows: [inv] } = await pool.query(
        'SELECT id, nome FROM investidores WHERE nome ILIKE $1 LIMIT 1', [`%${nome}%`])
      if (inv) {
        if (!opts.dryRun) {
          await pool.query(
            "UPDATE reunioes SET entidade_tipo='investidores', entidade_id=$1, updated_at=$2 WHERE id=$3",
            [inv.id, new Date().toISOString(), reuniao.id])
        }
        return { ...reuniao, entidade_tipo: 'investidores', entidade_id: inv.id, _matched: 'nome' }
      }
    }
  }

  return reuniao
}

async function getInvestidor(id) {
  if (!id) return null
  const { rows: [inv] } = await pool.query('SELECT * FROM investidores WHERE id = $1', [id])
  return inv || null
}

function gerarPdfFile(reuniao, analise, investidor) {
  const investName = investidor?.nome || 'Sem_Investidor'
  const folder = path.join(OUT_DIR, slugify(investName, 80))
  fs.mkdirSync(folder, { recursive: true })

  const fname = `${fmtDate(reuniao.data)}_${slugify(reuniao.titulo, 60)}.pdf`
  const fpath = path.join(folder, fname)

  return new Promise((resolve, reject) => {
    const doc = generateMeetingPDF(reuniao, analise, investidor)
    const stream = fs.createWriteStream(fpath)
    doc.pipe(stream)
    stream.on('finish', () => resolve(fpath))
    stream.on('error', reject)
  })
}

// ── Main ────────────────────────────────────────────────────────────
async function main() {
  console.log('\n══════════════════════════════════════════════════════════')
  console.log('  Somnium Properties · Relatorios de Reunioes em Batch')
  console.log('══════════════════════════════════════════════════════════')
  if (opts.dryRun) console.log('  [DRY-RUN] Nenhuma alteracao sera persistida\n')

  // 1. Sync Fireflies (opcional)
  let syncResult = null
  if (!opts.noSync && firefliesConfigured()) {
    try {
      console.log('• Sync Fireflies API...')
      syncResult = opts.dryRun ? { created: 0, skipped: 0, total: 0, dryRun: true } : await syncFireflies()
      console.log(`  ${syncResult.created} novas · ${syncResult.skipped} ja existentes\n`)
    } catch (e) {
      console.log(`  Erro no sync: ${e.message}\n`)
    }
  } else if (!opts.noSync) {
    console.log('• Sync Fireflies SKIP (FIREFLIES_API_KEY nao configurada localmente)\n')
  }

  // 2. Listar reunioes
  let q = 'SELECT * FROM reunioes'
  const params = []
  const where = []
  if (opts.desde) { params.push(opts.desde); where.push(`data >= $${params.length}`) }
  if (where.length) q += ' WHERE ' + where.join(' AND ')
  q += ' ORDER BY data DESC'

  const { rows: reunioes } = await pool.query(q, params)
  console.log(`• ${reunioes.length} reunioes encontradas na BD\n`)

  // 3. Iterar
  const stats = {
    total: reunioes.length,
    reassociadas: 0,
    analisadasNovas: 0,
    pdfsGerados: 0,
    semInvestidor: 0,
    semAnalise: 0,
    erros: 0,
  }
  const erros = []

  for (let i = 0; i < reunioes.length; i++) {
    let r = reunioes[i]
    const prefix = `[${String(i + 1).padStart(3)}/${reunioes.length}]`

    // Filtro --investidor (apos eventual reassociacao)
    const matchInvestidorFilter = async (reu) => {
      if (!opts.investidor) return true
      if (!reu.entidade_id) return false
      const { rows: [inv] } = await pool.query(
        'SELECT 1 FROM investidores WHERE id = $1 AND nome ILIKE $2', [reu.entidade_id, `%${opts.investidor}%`])
      return !!inv
    }

    try {
      // 3a. Reassociar se necessario
      if (!r.entidade_id) {
        const before = r.entidade_id
        r = await reassociar(r)
        if (r.entidade_id && !before) stats.reassociadas++
      }

      // Aplicar filtro --investidor depois de tentar reassociar
      if (!(await matchInvestidorFilter(r))) continue

      // 3b. Analise
      let analise = null
      if (r.analise_completa) {
        try { analise = JSON.parse(r.analise_completa) }
        catch { analise = null }
      }

      const podeAnalisar = r.entidade_tipo === 'investidores' && r.entidade_id && r.transcricao
      if (!analise && podeAnalisar && !opts.noAnalise && !opts.dryRun) {
        console.log(`${prefix} Analise nova (Claude): "${r.titulo}"`)
        const result = await autoFillInvestidor(r.id)
        // autoFillInvestidor persiste analise_completa; recarregar
        const { rows: [reload] } = await pool.query('SELECT analise_completa FROM reunioes WHERE id = $1', [r.id])
        if (reload?.analise_completa) {
          try { analise = JSON.parse(reload.analise_completa); stats.analisadasNovas++ }
          catch { analise = null }
        }
      } else if (!analise && podeAnalisar && opts.dryRun) {
        console.log(`${prefix} [DRY] Analise pendente: "${r.titulo}"`)
        stats.analisadasNovas++  // simular
      } else if (!analise) {
        stats.semAnalise++
      }

      // 3c. Gerar PDF
      if (!opts.noPdf) {
        const investidor = await getInvestidor(r.entidade_id)
        if (!investidor) stats.semInvestidor++

        // Se nao tem analise nem podemos correr (consultor / sem transcricao),
        // gerar PDF basico com dados da reuniao apenas
        const analiseSafe = analise || { resumo_executivo: r.resumo || '' }

        if (opts.dryRun) {
          const dest = path.join(OUT_DIR, slugify(investidor?.nome || 'Sem_Investidor'),
            `${fmtDate(r.data)}_${slugify(r.titulo)}.pdf`)
          console.log(`${prefix} [DRY] PDF -> ${path.relative(ROOT, dest)}`)
        } else {
          const fpath = await gerarPdfFile(r, analiseSafe, investidor)
          stats.pdfsGerados++
          if (i % 5 === 0 || i === reunioes.length - 1) {
            console.log(`${prefix} ${path.relative(ROOT, fpath)}`)
          }
        }
      }
    } catch (e) {
      stats.erros++
      erros.push({ titulo: r.titulo, erro: e.message })
      console.log(`${prefix} ERRO: ${r.titulo} -> ${e.message}`)
    }
  }

  // 4. Summary
  console.log('\n══════════════════════════════════════════════════════════')
  console.log('  Resumo')
  console.log('══════════════════════════════════════════════════════════')
  console.log(`  Total reunioes processadas:  ${stats.total}`)
  console.log(`  Reassociadas a investidor:   ${stats.reassociadas}`)
  console.log(`  Analises novas (Claude):     ${stats.analisadasNovas}  (~EUR ${(stats.analisadasNovas * 0.04).toFixed(2)})`)
  console.log(`  PDFs gerados:                ${stats.pdfsGerados}`)
  console.log(`  Sem investidor associado:    ${stats.semInvestidor}`)
  console.log(`  Sem analise (consultor/etc): ${stats.semAnalise}`)
  console.log(`  Erros:                       ${stats.erros}`)
  if (erros.length) {
    console.log('\n  Detalhe erros:')
    for (const e of erros) console.log(`   · ${e.titulo}: ${e.erro}`)
  }
  if (!opts.noPdf && !opts.dryRun && stats.pdfsGerados > 0) {
    console.log(`\n  Output em: ${path.relative(process.cwd(), OUT_DIR)}/`)
  }
  console.log('')

  await pool.end()
}

main().catch(async (e) => {
  console.error('\n[fatal]', e.message)
  console.error(e.stack)
  try { await pool.end() } catch {}
  process.exit(1)
})
