// Lifecycle dos documentos automáticos por imóvel
// Gera PDF, escreve em /public/uploads/documentos/{imovel_id}/{tipo}_v{N}.pdf
// e regista em documentos_imovel.
//
// Hooks suportados:
//   - imoveis.onCreate           → gera Ficha do Imóvel v1
//   - imoveis.onUpdate(estado)   → gera documentos da fase
//   - manual                     → forçar nova versão
import fs from 'node:fs'
import path from 'node:path'
import { generateDoc } from './pdfImovelDocs.js'
import pool from './pg.js'

const DOC_ROOT = path.join(process.cwd(), 'public', 'uploads', 'documentos')

async function streamToBuffer(doc) {
  const chunks = []
  return new Promise((resolve, reject) => {
    doc.on('data', c => chunks.push(c))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)
  })
}

async function nextVersion(imovelId, tipo) {
  const r = await pool.query(
    `SELECT COALESCE(MAX(version), 0) + 1 AS v FROM documentos_imovel WHERE imovel_id = $1 AND tipo = $2`,
    [imovelId, tipo]
  )
  return Number(r.rows[0].v)
}

export async function persistDocumento(imovel, tipo, { trigger, generatedBy = 'system', frozen = false, analise = null } = {}) {
  const pdfDoc = await generateDoc(tipo, imovel, analise)
  if (!pdfDoc) return null

  const buf = await streamToBuffer(pdfDoc)
  const version = await nextVersion(imovel.id, tipo)

  const dir = path.join(DOC_ROOT, imovel.id)
  fs.mkdirSync(dir, { recursive: true })
  const fileName = `${tipo}_v${version}.pdf`
  fs.writeFileSync(path.join(dir, fileName), buf)
  const pdfPath = `/uploads/documentos/${imovel.id}/${fileName}`

  await pool.query(
    `INSERT INTO documentos_imovel (imovel_id, tipo, version, pdf_path, pdf_size_bytes, frozen, trigger_event, generated_by, snapshot_data)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [imovel.id, tipo, version, pdfPath, buf.length, frozen, trigger || null, generatedBy, imovel]
  )
  return { tipo, version, pdfPath, sizeBytes: buf.length }
}

// ── Hooks por evento ─────────────────────────────────
export async function onImovelCreated(imovel) {
  try {
    return await persistDocumento(imovel, 'ficha_imovel', { trigger: 'imovel.created' })
  } catch (e) {
    console.error('[docs] Falha ao gerar Ficha v1:', e.message)
    return null
  }
}

export async function listDocumentos(imovelId) {
  const r = await pool.query(
    `SELECT id, tipo, version, pdf_path, pdf_size_bytes, frozen, trigger_event, generated_at
       FROM documentos_imovel
      WHERE imovel_id = $1
      ORDER BY tipo, version DESC`,
    [imovelId]
  )
  return r.rows
}
