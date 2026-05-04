// Lifecycle dos documentos automáticos por imóvel.
// Persistência em Supabase Storage (bucket "Documentos") — sobrevive a deploys
// no Render (filesystem efémero).
//
// Política de persistência:
//   - frozen=false (documento "vivo", ex: Ficha do Imóvel) → 1 só objecto por
//     (imovel, tipo). Cada geração faz upsert no bucket e UPDATE in-place na
//     BD (incrementa `version` para auditoria mas mantém o mesmo `pdf_path`).
//   - frozen=true  (Dossier enviado, NDA assinado, Proposta enviada, etc.) →
//     histórico imutável. Cada geração cria novo objecto `{tipo}_{slug}_v{N}.pdf`
//     e nova linha em documentos_imovel.
//
// Hooks:
//   - imoveis.onCreate         → gera Ficha do Imóvel
//   - imoveis.onUpdate(estado) → regenera documentos da fase
//   - manual                   → POST /api/crm/imoveis/:id/documentos/:tipo/regenerar
import { createClient } from '@supabase/supabase-js'
import { generateDoc } from './pdfImovelDocs.js'
import pool from './pg.js'

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://mjgusjuougzoeiyavsor.supabase.co'
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || ''
const supabase = SUPABASE_SERVICE_KEY ? createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY) : null
const BUCKET = 'Documentos'

let bucketEnsured = false
async function ensureBucket() {
  if (bucketEnsured || !supabase) return
  try {
    const { data: buckets } = await supabase.storage.listBuckets()
    const exists = (buckets || []).some(b => b.name === BUCKET)
    if (!exists) {
      await supabase.storage.createBucket(BUCKET, { public: true })
      console.log(`[docs] bucket "${BUCKET}" criado`)
    }
    bucketEnsured = true
  } catch (e) {
    console.error('[docs] ensureBucket:', e.message)
  }
}

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

async function uploadToStorage(storagePath, buf) {
  if (!supabase) throw new Error('Supabase Storage não configurado (SUPABASE_SERVICE_KEY ausente)')
  await ensureBucket()
  const { error } = await supabase.storage.from(BUCKET).upload(storagePath, buf, {
    contentType: 'application/pdf',
    upsert: true,
  })
  if (error) throw new Error(`storage upload: ${error.message}`)
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(storagePath)
  return data.publicUrl
}

function storagePathFromUrl(url) {
  if (!url) return null
  const m = url.match(/\/storage\/v1\/object\/public\/Documentos\/(.+)$/)
  return m ? m[1] : null
}

async function removeFromStorage(url) {
  const p = storagePathFromUrl(url)
  if (!p || !supabase) return
  try { await supabase.storage.from(BUCKET).remove([p]) } catch {}
}

export async function persistDocumento(imovel, tipo, { trigger, generatedBy = 'system', frozen = false, analise = null } = {}) {
  const slug = slugify(imovel.nome || imovel.ref_interna || imovel.id)
  const generatedAt = new Date()

  // Calcular version ANTES de gerar o PDF, para que o renderer possa
  // imprimir o stamp "Ficha gerada em X · Versão N" no documento.
  let version, existingId, existingPath
  if (frozen) {
    const r = await pool.query(
      `SELECT COALESCE(MAX(version), 0) + 1 AS v FROM documentos_imovel WHERE imovel_id = $1 AND tipo = $2`,
      [imovel.id, tipo]
    )
    version = Number(r.rows[0].v)
  } else {
    const existing = await pool.query(
      `SELECT id, version, pdf_path FROM documentos_imovel
        WHERE imovel_id = $1 AND tipo = $2 AND frozen = false
        ORDER BY version DESC LIMIT 1`,
      [imovel.id, tipo]
    )
    if (existing.rows.length > 0) {
      existingId = existing.rows[0].id
      existingPath = existing.rows[0].pdf_path
      version = Number(existing.rows[0].version) + 1
    } else {
      version = 1
    }
  }

  const imForRender = { ...imovel, _version: version, _generatedAt: generatedAt.toISOString() }
  const pdfDoc = await generateDoc(tipo, imForRender, analise)
  if (!pdfDoc) return null
  const buf = await streamToBuffer(pdfDoc)

  if (frozen) {
    const storagePath = `${imovel.id}/${tipo}_${slug}_v${version}.pdf`
    const url = await uploadToStorage(storagePath, buf)
    await pool.query(
      `INSERT INTO documentos_imovel (imovel_id, tipo, version, pdf_path, pdf_size_bytes, frozen, trigger_event, generated_by, snapshot_data, generated_at)
       VALUES ($1, $2, $3, $4, $5, true, $6, $7, $8, $9)`,
      [imovel.id, tipo, version, url, buf.length, trigger || null, generatedBy, imovel, generatedAt]
    )
    return { tipo, version, pdfPath: url, sizeBytes: buf.length, frozen: true }
  }

  // Vivo: 1 só ficheiro por (imovel, tipo). Upsert no bucket + UPDATE in-place.
  const storagePath = `${imovel.id}/${tipo}_${slug}.pdf`
  const url = await uploadToStorage(storagePath, buf)

  if (existingId) {
    if (existingPath && existingPath !== url) await removeFromStorage(existingPath)
    await pool.query(
      `UPDATE documentos_imovel
          SET version = $1, pdf_path = $2, pdf_size_bytes = $3,
              trigger_event = $4, generated_by = $5, snapshot_data = $6,
              generated_at = $7
        WHERE id = $8`,
      [version, url, buf.length, trigger || null, generatedBy, imovel, generatedAt, existingId]
    )
    return { tipo, version, pdfPath: url, sizeBytes: buf.length, frozen: false, replaced: true }
  }

  await pool.query(
    `INSERT INTO documentos_imovel (imovel_id, tipo, version, pdf_path, pdf_size_bytes, frozen, trigger_event, generated_by, snapshot_data, generated_at)
     VALUES ($1, $2, 1, $3, $4, false, $5, $6, $7, $8)`,
    [imovel.id, tipo, url, buf.length, trigger || null, generatedBy, imovel, generatedAt]
  )
  return { tipo, version: 1, pdfPath: url, sizeBytes: buf.length, frozen: false, replaced: false }
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
