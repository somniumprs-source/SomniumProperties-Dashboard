/**
 * API REST routes para o CRM (PostgreSQL).
 */
import { Router } from 'express'
import { Imoveis, Investidores, Consultores, Negocios, Despesas, Tarefas, getDashboardStats } from './crud.js'
import pool from './pg.js'
import { syncFromNotion, syncAllFromNotion, syncToNotion } from './sync.js'

const router = Router()

// ── Generic CRUD route factory ────────────────────────────────
function crudRoutes(path, crud) {
  router.get(path, async (req, res) => {
    try {
      const { limit = 100, offset = 0, sort, search, ...filter } = req.query
      if (search) return res.json({ data: await crud.search(search, +limit) })
      res.json(await crud.list({ limit: +limit, offset: +offset, sort, filter }))
    } catch (e) { res.status(500).json({ error: e.message }) }
  })

  router.get(`${path}/stats`, async (req, res) => {
    try { res.json(await crud.stats()) }
    catch (e) { res.status(500).json({ error: e.message }) }
  })

  router.get(`${path}/:id`, async (req, res) => {
    try {
      const item = await crud.getById(req.params.id)
      if (!item) return res.status(404).json({ error: 'Não encontrado' })
      res.json(item)
    } catch (e) { res.status(500).json({ error: e.message }) }
  })

  router.post(path, async (req, res) => {
    try {
      const item = await crud.create(req.body)
      const table = path.slice(1)
      syncToNotion(table, item.id).catch(e => console.error(`[sync] create ${table}:`, e.message))
      res.status(201).json(item)
    } catch (e) { res.status(400).json({ error: e.message }) }
  })

  router.put(`${path}/:id`, async (req, res) => {
    try {
      const item = await crud.update(req.params.id, req.body)
      if (!item) return res.status(404).json({ error: 'Não encontrado' })
      const table = path.slice(1)
      syncToNotion(table, req.params.id).catch(e => console.error(`[sync] update ${table}:`, e.message))
      res.json(item)
    } catch (e) { res.status(400).json({ error: e.message }) }
  })

  router.delete(`${path}/:id`, async (req, res) => {
    try {
      const ok = await crud.delete(req.params.id)
      if (!ok) return res.status(404).json({ error: 'Não encontrado' })
      res.json({ ok: true })
    } catch (e) { res.status(500).json({ error: e.message }) }
  })
}

crudRoutes('/imoveis', Imoveis)
crudRoutes('/investidores', Investidores)
crudRoutes('/consultores', Consultores)
crudRoutes('/negocios', Negocios)
crudRoutes('/despesas', Despesas)
crudRoutes('/tarefas', Tarefas)

router.get('/stats', async (req, res) => {
  try { res.json(await getDashboardStats()) }
  catch (e) { res.status(500).json({ error: e.message }) }
})

// ── Sync Notion ↔ CRM ─────────────────────────────────────────
router.post('/sync', async (req, res) => {
  try { res.json({ ok: true, results: await syncAllFromNotion() }) }
  catch (e) { res.status(500).json({ error: e.message }) }
})

router.post('/sync/:table', async (req, res) => {
  try { res.json(await syncFromNotion(req.params.table)) }
  catch (e) { res.status(500).json({ error: e.message }) }
})

// ── Audit log ─────────────────────────────────────────────────
router.get('/audit', async (req, res) => {
  try {
    const { limit = 50, tabela } = req.query
    let query = 'SELECT * FROM audit_log'
    const params = []
    if (tabela) { query += ' WHERE tabela = $1'; params.push(tabela) }
    query += ` ORDER BY created_at DESC LIMIT $${params.length + 1}`
    params.push(+limit)
    const { rows } = await pool.query(query, params)
    res.json(rows)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// ── Backup ────────────────────────────────────────────────────
router.get('/backup', async (req, res) => {
  try {
    const backup = {}
    const tables = ['imoveis', 'investidores', 'consultores', 'negocios', 'despesas', 'tarefas']
    let total = 0
    for (const t of tables) {
      const { rows } = await pool.query(`SELECT * FROM ${t}`)
      backup[t] = rows
      total += rows.length
    }
    backup.exported_at = new Date().toISOString()
    backup.total = total
    if (req.query.download === 'true') {
      res.setHeader('Content-Type', 'application/json')
      res.setHeader('Content-Disposition', `attachment; filename=somnium-backup-${new Date().toISOString().slice(0,10)}.json`)
    }
    res.json(backup)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

export default router
