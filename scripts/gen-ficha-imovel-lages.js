// Gera/atualiza a Ficha do Imóvel para os 2 imóveis Lages.
// Reaproveita a lógica de persistência (substituir, não acumular).
import 'dotenv/config'
import pg from 'pg'
import { persistDocumento } from '../src/db/documentLifecycle.js'

const { Pool } = pg
const pool = new Pool({ connectionString: process.env.DATABASE_URL })

const IDS = [
  '3b7cd883-9dc0-4cf0-bce8-aacffeba6b32', // T2 Cave Lages
  '68d423f8-f72b-46aa-9fea-c75784c39212', // T2+1 Sub-Cave Lages
]

async function genFor(imovelId) {
  const r = await pool.query(`SELECT * FROM imoveis WHERE id = $1`, [imovelId])
  const im = r.rows[0]
  if (!im) throw new Error(`imovel ${imovelId} not found`)
  const out = await persistDocumento(im, 'ficha_imovel', {
    trigger: 'manual:gen-ficha-imovel-lages',
    generatedBy: 'script',
  })
  console.log(`  ${(im.nome || '').padEnd(28)}  v${out.version}  ${(out.sizeBytes / 1024).toFixed(1)} KB  ${out.pdfPath}`)
}

async function main() {
  console.log('A gerar/atualizar Ficha do Imóvel para os 2 imóveis Lages...')
  for (const id of IDS) await genFor(id)
  await pool.end()
}

main().catch(e => { console.error(e); process.exit(1) })
