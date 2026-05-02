// Gera Ficha do Imóvel para os dois imóveis Lages e persiste em /public/uploads/documentos/{id}/ficha_v{N}.pdf
// + insere registo em documentos_imovel
import 'dotenv/config'
import fs from 'node:fs'
import path from 'node:path'
import pg from 'pg'
import { generateDoc } from '../src/db/pdfImovelDocs.js'

const { Pool } = pg
const pool = new Pool({ connectionString: process.env.DATABASE_URL })

const IDS = [
  '3b7cd883-9dc0-4cf0-bce8-aacffeba6b32', // T2 Cave Lages
  '68d423f8-f72b-46aa-9fea-c75784c39212', // T2 Sub-Cave Lages
]

async function nextVersion(imovelId, tipo) {
  const r = await pool.query(
    `SELECT COALESCE(MAX(version), 0) + 1 AS v FROM documentos_imovel WHERE imovel_id = $1 AND tipo = $2`,
    [imovelId, tipo]
  )
  return r.rows[0].v
}

async function genFor(imovelId) {
  const r = await pool.query(`SELECT * FROM imoveis WHERE id = $1`, [imovelId])
  const im = r.rows[0]
  if (!im) throw new Error('imovel not found')

  const tipo = 'ficha_imovel'
  const version = await nextVersion(imovelId, tipo)

  const doc = await generateDoc(tipo, im, null)

  const dir = path.join('public', 'uploads', 'documentos', imovelId)
  fs.mkdirSync(dir, { recursive: true })
  const fileName = `ficha_v${version}.pdf`
  const filePath = path.join(dir, fileName)

  const chunks = []
  await new Promise((resolve, reject) => {
    doc.on('data', c => chunks.push(c))
    doc.on('end', resolve)
    doc.on('error', reject)
  })
  const buf = Buffer.concat(chunks)
  fs.writeFileSync(filePath, buf)

  const pdfPath = `/uploads/documentos/${imovelId}/${fileName}`
  await pool.query(
    `INSERT INTO documentos_imovel (imovel_id, tipo, version, pdf_path, pdf_size_bytes, frozen, trigger_event, generated_by, snapshot_data)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [imovelId, tipo, version, pdfPath, buf.length, false, 'manual:gen-ficha-imovel-lages', 'system', im]
  )

  console.log(`  ${im.nome.padEnd(25)}  v${version}  ${(buf.length / 1024).toFixed(1)} KB  ${pdfPath}`)
}

async function main() {
  console.log('A gerar Fichas do Imóvel para os 2 imóveis Lages...')
  for (const id of IDS) await genFor(id)
  await pool.end()
}

main().catch(e => { console.error(e); process.exit(1) })
