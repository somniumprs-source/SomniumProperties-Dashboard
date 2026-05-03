// Lifecycle dos documentos automáticos por imóvel
// Gera PDF, escreve em /public/uploads/documentos/{imovel_id}/{tipo}_{slug}[_vN].pdf
// e regista em documentos_imovel.
//
// Política de persistência:
//   - frozen=false (documento "vivo", ex: Ficha do Imóvel) → 1 só ficheiro por
//     (imovel, tipo). Cada geração faz overwrite no disco e UPDATE in-place na
//     BD (incrementa `version` para auditoria mas mantém o mesmo `pdf_path`).
//   - frozen=true  (Dossier enviado, NDA assinado, Proposta enviada, etc.) →
//     histórico imutável. Cada geração cria novo ficheiro `{tipo}_{slug}_v{N}.pdf`
//     e nova linha em documentos_imovel.
//
// Hooks suportados:
//   - imoveis.onCreate         → gera Ficha do Imóvel
//   - imoveis.onUpdate(estado) → regenera documentos da fase
//   - manual                   → forçar nova geração (reaproveita política acima)
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

function slugify(s) {
  return String(s || '')
    .normalize('NFD').replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'imovel'
}

export async function persistDocumento(imovel, tipo, { trigger, generatedBy = 'system', frozen = false, analise = null } = {}) {
  const pdfDoc = await generateDoc(tipo, imovel, analise)
  if (!pdfDoc) return null

  const buf = await streamToBuffer(pdfDoc)
  const slug = slugify(imovel.nome || imovel.ref_interna || imovel.id)
  const dir = path.join(DOC_ROOT, imovel.id)
  fs.mkdirSync(dir, { recursive: true })

  if (frozen) {
    // Histórico imutável: bump version, novo ficheiro
    const r = await pool.query(
      `SELECT COALESCE(MAX(version), 0) + 1 AS v FROM documentos_imovel WHERE imovel_id = $1 AND tipo = $2`,
      [imovel.id, tipo]
    )
    const version = Number(r.rows[0].v)
    const fileName = `${tipo}_${slug}_v${version}.pdf`
    fs.writeFileSync(path.join(dir, fileName), buf)
    const pdfPath = `/uploads/documentos/${imovel.id}/${fileName}`
    await pool.query(
      `INSERT INTO documentos_imovel (imovel_id, tipo, version, pdf_path, pdf_size_bytes, frozen, trigger_event, generated_by, snapshot_data)
       VALUES ($1, $2, $3, $4, $5, true, $6, $7, $8)`,
      [imovel.id, tipo, version, pdfPath, buf.length, trigger || null, generatedBy, imovel]
    )
    return { tipo, version, pdfPath, sizeBytes: buf.length, frozen: true }
  }

  // Vivo: 1 só ficheiro por (imovel, tipo). Overwrite + UPDATE in-place se já existir.
  const fileName = `${tipo}_${slug}.pdf`
  const pdfPath = `/uploads/documentos/${imovel.id}/${fileName}`
  fs.writeFileSync(path.join(dir, fileName), buf)

  const existing = await pool.query(
    `SELECT id, version, pdf_path FROM documentos_imovel
      WHERE imovel_id = $1 AND tipo = $2 AND frozen = false
      ORDER BY version DESC LIMIT 1`,
    [imovel.id, tipo]
  )

  if (existing.rows.length > 0) {
    const old = existing.rows[0]
    // Se o nome do imóvel mudou, o ficheiro antigo fica órfão — apaga.
    if (old.pdf_path && old.pdf_path !== pdfPath) {
      const oldAbs = path.join(process.cwd(), 'public', old.pdf_path.replace(/^\//, ''))
      try { if (fs.existsSync(oldAbs)) fs.unlinkSync(oldAbs) } catch {}
    }
    const newVersion = Number(old.version) + 1
    await pool.query(
      `UPDATE documentos_imovel
          SET version = $1, pdf_path = $2, pdf_size_bytes = $3,
              trigger_event = $4, generated_by = $5, snapshot_data = $6,
              generated_at = now()
        WHERE id = $7`,
      [newVersion, pdfPath, buf.length, trigger || null, generatedBy, imovel, old.id]
    )
    return { tipo, version: newVersion, pdfPath, sizeBytes: buf.length, frozen: false, replaced: true }
  }

  await pool.query(
    `INSERT INTO documentos_imovel (imovel_id, tipo, version, pdf_path, pdf_size_bytes, frozen, trigger_event, generated_by, snapshot_data)
     VALUES ($1, $2, 1, $3, $4, false, $5, $6, $7)`,
    [imovel.id, tipo, pdfPath, buf.length, trigger || null, generatedBy, imovel]
  )
  return { tipo, version: 1, pdfPath, sizeBytes: buf.length, frozen: false, replaced: false }
}

// ── Hooks por evento ─────────────────────────────────
export async function onImovelCreated(imovel) {
  try {
    return await persistDocumento(imovel, 'ficha_imovel', { trigger: 'imovel.created' })
  } catch (e) {
    console.error('[docs] Falha ao gerar Ficha:', e.message)
    return null
  }
}

export async function listDocumentos(imovelId) {
  const r = await pool.query(
    `SELECT id, tipo, version, pdf_path, pdf_size_bytes, frozen, trigger_event, generated_at
       FROM documentos_imovel
      WHERE imovel_id = $1
      ORDER BY tipo, frozen, version DESC`,
    [imovelId]
  )
  return r.rows
}
