#!/usr/bin/env node
/**
 * CLI: gerar estudo de localização de um imóvel.
 *
 *   node scripts/gerar-estudo-localizacao.mjs <imovelId> [opções]
 *
 * Opções:
 *   --origem="<morada>"         Override da morada (default: campo morada do imóvel)
 *   --mode=driving|walking|...  Modo (default: driving)
 *   --destaque="<texto>"        Categoria a destacar como ★ gold (substring match)
 *   --destinos=path/to.json     Ficheiro JSON com destinos custom (em alternativa, usa os já guardados)
 *   --highlights=path/to.json   Ficheiro JSON com highlights (SMTUC, GNR, etc.)
 *
 * Variáveis de ambiente necessárias:
 *   DATABASE_URL                (Supabase Postgres)
 *   SUPABASE_URL                (default: o do projecto Somnium)
 *   SUPABASE_SERVICE_KEY        (server key, dá acesso ao bucket Imoveis)
 *   GOOGLE_MAPS_API_KEY         (Distance Matrix)
 */
import fs from 'fs'
import pg from 'pg'
import { createClient } from '@supabase/supabase-js'
import { runEstudoLocalizacao } from '../src/lib/estudoLocalizacao.js'

function parseArgs(argv) {
  const out = { _: [] }
  for (const a of argv) {
    if (a.startsWith('--')) {
      const [k, ...rest] = a.slice(2).split('=')
      out[k] = rest.join('=') || true
    } else out._.push(a)
  }
  return out
}

const args = parseArgs(process.argv.slice(2))
const imovelId = args._[0]
if (!imovelId) {
  console.error('Uso: node scripts/gerar-estudo-localizacao.mjs <imovelId> [--origem=...] [--mode=driving] [--destaque=...] [--destinos=file.json] [--highlights=file.json]')
  process.exit(1)
}

const databaseUrl = process.env.DATABASE_URL
const supabaseUrl = process.env.SUPABASE_URL || 'https://mjgusjuougzoeiyavsor.supabase.co'
const supabaseKey = process.env.SUPABASE_SERVICE_KEY
const mapsKey = process.env.GOOGLE_MAPS_API_KEY

if (!databaseUrl) { console.error('Falta DATABASE_URL no env'); process.exit(1) }
if (!supabaseKey) { console.error('Falta SUPABASE_SERVICE_KEY no env'); process.exit(1) }
if (!mapsKey)     { console.error('Falta GOOGLE_MAPS_API_KEY no env'); process.exit(1) }

const pool = new pg.Pool({ connectionString: databaseUrl, ssl: { rejectUnauthorized: false } })
const supabaseStorage = createClient(supabaseUrl, supabaseKey)

const destinos = args.destinos ? JSON.parse(fs.readFileSync(args.destinos, 'utf8')) : null
const highlights = args.highlights ? JSON.parse(fs.readFileSync(args.highlights, 'utf8')) : []
const mode = typeof args.mode === 'string' ? args.mode : 'driving'
const destaque = typeof args.destaque === 'string' ? args.destaque : null
const origem = typeof args.origem === 'string' ? args.origem : null

try {
  const r = await runEstudoLocalizacao({
    pool, supabaseStorage,
    imovelId, destinos, mode, highlights, destaque, origem,
  })
  console.log(JSON.stringify({
    ok: r.ok,
    imovel: r.imovel_nome,
    morada: r.origem_resolvida,
    freguesia: r.freguesia,
    imagem: r.localizacao_imagem,
    n_destinos: r.resultados.length,
    top3: r.resultados.slice(0, 3).map(x => ({ categoria: x.categoria, distancia: x.distancia_texto, tempo: x.duracao_texto })),
  }, null, 2))
} catch (e) {
  console.error('ERRO:', e.message)
  process.exit(1)
} finally {
  await pool.end()
}
