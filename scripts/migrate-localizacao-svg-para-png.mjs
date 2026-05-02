#!/usr/bin/env node
/**
 * Migra imoveis com localizacao_imagem em SVG para PNG.
 *
 * Motivo: PDFKit (renderer dos PDFs investidor) so aceita PNG/JPEG. Os
 * estudos de localizacao gerados antes desta migracao foram gravados como
 * SVG, o que faz a geracao do PDF abortar com "Unknown image format".
 *
 * O script faz fetch do SVG existente, rasteriza com Resvg (sem chamar
 * APIs Google de novo) e faz upload do PNG para Supabase, actualizando
 * imoveis.localizacao_imagem.
 *
 *   node scripts/migrate-localizacao-svg-para-png.mjs            # dry-run
 *   node scripts/migrate-localizacao-svg-para-png.mjs --apply    # aplicar
 *
 * Variaveis de ambiente:
 *   DATABASE_URL          (Supabase Postgres)
 *   SUPABASE_URL          (default: projecto Somnium)
 *   SUPABASE_SERVICE_KEY  (server key, acesso ao bucket Imoveis)
 */
import pg from 'pg'
import { createClient } from '@supabase/supabase-js'
import { rasterizarSvgParaPng } from '../src/lib/estudoLocalizacao.js'

const apply = process.argv.includes('--apply')

const databaseUrl = process.env.DATABASE_URL
const supabaseUrl = process.env.SUPABASE_URL || 'https://mjgusjuougzoeiyavsor.supabase.co'
const supabaseKey = process.env.SUPABASE_SERVICE_KEY

if (!databaseUrl) { console.error('Falta DATABASE_URL no env'); process.exit(1) }
if (!supabaseKey) { console.error('Falta SUPABASE_SERVICE_KEY no env'); process.exit(1) }

const pool = new pg.Pool({ connectionString: databaseUrl, ssl: { rejectUnauthorized: false } })
const supabase = createClient(supabaseUrl, supabaseKey)

function logRow(prefix, row, extra = '') {
  console.log(`${prefix} #${row.id} ${row.nome || ''}${extra ? '  ' + extra : ''}`)
}

async function listarCandidatos() {
  const { rows } = await pool.query(`
    SELECT id, nome, localizacao_imagem
    FROM imoveis
    WHERE localizacao_imagem ILIKE '%.svg%' OR localizacao_imagem ILIKE '%svg+xml%'
    ORDER BY id
  `)
  return rows
}

async function migrarUm(row) {
  const svgUrl = row.localizacao_imagem
  const r = await fetch(svgUrl)
  if (!r.ok) throw new Error(`fetch ${svgUrl} -> HTTP ${r.status}`)
  const svg = await r.text()
  const png = rasterizarSvgParaPng(svg)

  const filename = `localizacao_estudo_auto_${Date.now()}.png`
  const storagePath = `imoveis/${row.id}/${filename}`
  const { error: upErr } = await supabase.storage
    .from('Imoveis')
    .upload(storagePath, png, { contentType: 'image/png', upsert: true })
  if (upErr) throw new Error(`Supabase upload: ${upErr.message}`)
  const { data: urlData } = supabase.storage.from('Imoveis').getPublicUrl(storagePath)
  const publicUrl = urlData.publicUrl

  await pool.query(
    `UPDATE imoveis SET localizacao_imagem = $1, updated_at = NOW()::text WHERE id = $2`,
    [publicUrl, row.id]
  )
  return publicUrl
}

try {
  const candidatos = await listarCandidatos()
  console.log(`Encontrados ${candidatos.length} imovel(eis) com localizacao_imagem em SVG.`)
  if (candidatos.length === 0) process.exit(0)

  if (!apply) {
    console.log('\n[DRY-RUN] sem --apply, apenas listo:\n')
    candidatos.forEach(r => logRow('  •', r, r.localizacao_imagem))
    console.log('\nCorre com --apply para migrar.')
    process.exit(0)
  }

  let ok = 0, fail = 0
  for (const row of candidatos) {
    try {
      const url = await migrarUm(row)
      logRow('  ✓', row, '→ ' + url)
      ok++
    } catch (e) {
      logRow('  ✗', row, '(' + e.message + ')')
      fail++
    }
  }
  console.log(`\nFeito. OK=${ok}  FAIL=${fail}`)
  process.exit(fail > 0 ? 2 : 0)
} catch (e) {
  console.error('ERRO:', e.message)
  process.exit(1)
} finally {
  await pool.end()
}
