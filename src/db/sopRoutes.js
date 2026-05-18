/**
 * Rotas REST para a biblioteca de SOPs.
 * Cobertas pelo middleware Supabase JWT global em server.js (caminho /api/sops/*).
 */
import { Router } from 'express'
import pool from './pg.js'
import { importFolderToSops, parseFolderId, isConfigured as driveConfigured } from './sopDriveImport.js'

const router = Router()
const DEPARTAMENTOS_VALIDOS = ['comercial', 'financeiro', 'administrativo', 'geral']

function userEmail(req) {
  return req.user?.email || null
}

// GET /api/sops?departamento=...
router.get('/', async (req, res) => {
  try {
    const dep = req.query.departamento
    const params = []
    let where = ''
    if (dep && DEPARTAMENTOS_VALIDOS.includes(dep)) {
      params.push(dep)
      where = 'WHERE departamento = $1'
    }
    const { rows } = await pool.query(
      `SELECT id, titulo, departamento, versao, drive_url, drive_file_id,
              created_at, updated_at, updated_by,
              LEFT(conteudo_md, 400) AS conteudo_md_preview
         FROM sops ${where}
         ORDER BY
           COALESCE((SUBSTRING(titulo FROM 'SOP[[:space:]]*([0-9]+)'))::int, 999999),
           titulo`,
      params
    )
    res.json({ sops: rows })
  } catch (e) {
    console.error('[sops] list erro:', e)
    res.status(500).json({ error: e.message })
  }
})

// GET /api/sops/:id
router.get('/:id', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM sops WHERE id = $1', [req.params.id])
    if (!rows.length) return res.status(404).json({ error: 'SOP não encontrado' })
    res.json({ sop: rows[0] })
  } catch (e) {
    console.error('[sops] get erro:', e)
    res.status(500).json({ error: e.message })
  }
})

// POST /api/sops
router.post('/', async (req, res) => {
  try {
    const { titulo, departamento, conteudo_md } = req.body || {}
    if (!titulo || !departamento) {
      return res.status(400).json({ error: 'titulo e departamento são obrigatórios' })
    }
    if (!DEPARTAMENTOS_VALIDOS.includes(departamento)) {
      return res.status(400).json({ error: `departamento inválido: ${departamento}` })
    }
    const user = userEmail(req)
    const { rows } = await pool.query(
      `INSERT INTO sops (titulo, departamento, conteudo_md, created_by, updated_by)
       VALUES ($1, $2, $3, $4, $4) RETURNING *`,
      [titulo, departamento, conteudo_md || '', user]
    )
    res.json({ sop: rows[0] })
  } catch (e) {
    console.error('[sops] create erro:', e)
    res.status(500).json({ error: e.message })
  }
})

// PUT /api/sops/:id
router.put('/:id', async (req, res) => {
  try {
    const { titulo, departamento, conteudo_md } = req.body || {}
    if (departamento && !DEPARTAMENTOS_VALIDOS.includes(departamento)) {
      return res.status(400).json({ error: `departamento inválido: ${departamento}` })
    }
    const user = userEmail(req)
    const fields = []
    const values = []
    let i = 1
    if (titulo !== undefined) { fields.push(`titulo = $${i++}`); values.push(titulo) }
    if (departamento !== undefined) { fields.push(`departamento = $${i++}`); values.push(departamento) }
    if (conteudo_md !== undefined) { fields.push(`conteudo_md = $${i++}`); values.push(conteudo_md) }
    if (!fields.length) return res.status(400).json({ error: 'Nada para actualizar' })
    fields.push(`updated_at = NOW()`)
    fields.push(`updated_by = $${i++}`); values.push(user)
    fields.push(`versao = versao + 1`)
    values.push(req.params.id)
    const { rows } = await pool.query(
      `UPDATE sops SET ${fields.join(', ')} WHERE id = $${i} RETURNING *`,
      values
    )
    if (!rows.length) return res.status(404).json({ error: 'SOP não encontrado' })
    res.json({ sop: rows[0] })
  } catch (e) {
    console.error('[sops] update erro:', e)
    res.status(500).json({ error: e.message })
  }
})

// DELETE /api/sops/:id
router.delete('/:id', async (req, res) => {
  try {
    const r = await pool.query('DELETE FROM sops WHERE id = $1', [req.params.id])
    if (!r.rowCount) return res.status(404).json({ error: 'SOP não encontrado' })
    res.json({ ok: true })
  } catch (e) {
    console.error('[sops] delete erro:', e)
    res.status(500).json({ error: e.message })
  }
})

// POST /api/sops/import-drive
router.post('/import-drive', async (req, res) => {
  try {
    if (!driveConfigured()) {
      return res.status(503).json({ error: 'Google Drive não configurado no servidor.' })
    }
    const { folderId: rawFolder, departamento, overwrite } = req.body || {}
    const folderId = parseFolderId(rawFolder)
    if (!folderId) return res.status(400).json({ error: 'folderId / URL Drive inválido' })
    if (!DEPARTAMENTOS_VALIDOS.includes(departamento)) {
      return res.status(400).json({ error: `departamento inválido: ${departamento}` })
    }
    const stats = await importFolderToSops({
      folderId,
      departamento,
      overwrite: !!overwrite,
      user: userEmail(req),
    })
    res.json({ ok: true, ...stats })
  } catch (e) {
    console.error('[sops] import-drive erro:', e)
    res.status(500).json({ error: e.message })
  }
})

export default router
