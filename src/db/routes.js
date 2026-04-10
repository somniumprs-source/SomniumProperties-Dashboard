/**
 * API REST routes para o CRM.
 * Monta em /api/crm/* no Express.
 */
import { Router } from 'express'
import { Imoveis, Investidores, Consultores, Negocios, Despesas, Tarefas, getDashboardStats, db } from './crud.js'
import { syncFromNotion, syncAllFromNotion, syncToNotion } from './sync.js'

const router = Router()

// ── Generic CRUD route factory ────────────────────────────────
function crudRoutes(path, crud) {
  // List
  router.get(path, (req, res) => {
    try {
      const { limit = 100, offset = 0, sort, search, ...filter } = req.query
      if (search) return res.json({ data: crud.search(search, +limit) })
      res.json(crud.list({ limit: +limit, offset: +offset, sort, filter }))
    } catch (e) { res.status(500).json({ error: e.message }) }
  })

  // Stats
  router.get(`${path}/stats`, (req, res) => {
    try { res.json(crud.stats()) }
    catch (e) { res.status(500).json({ error: e.message }) }
  })

  // Get by ID
  router.get(`${path}/:id`, (req, res) => {
    try {
      const item = crud.getById(req.params.id)
      if (!item) return res.status(404).json({ error: 'Não encontrado' })
      res.json(item)
    } catch (e) { res.status(500).json({ error: e.message }) }
  })

  // Create (+ sync to Notion in background)
  router.post(path, (req, res) => {
    try {
      const item = crud.create(req.body)
      const table = path.slice(1) // remove leading /
      syncToNotion(table, item.id).catch(e => console.error(`[sync] create ${table}:`, e.message))
      res.status(201).json(item)
    } catch (e) { res.status(400).json({ error: e.message }) }
  })

  // Update (+ sync to Notion in background)
  router.put(`${path}/:id`, (req, res) => {
    try {
      const item = crud.update(req.params.id, req.body)
      if (!item) return res.status(404).json({ error: 'Não encontrado' })
      const table = path.slice(1)
      syncToNotion(table, req.params.id).catch(e => console.error(`[sync] update ${table}:`, e.message))
      res.json(item)
    } catch (e) { res.status(400).json({ error: e.message }) }
  })

  // Delete
  router.delete(`${path}/:id`, (req, res) => {
    try {
      const ok = crud.delete(req.params.id)
      if (!ok) return res.status(404).json({ error: 'Não encontrado' })
      res.json({ ok: true })
    } catch (e) { res.status(500).json({ error: e.message }) }
  })
}

// ── Mount all CRUD routes ─────────────────────────────────────
crudRoutes('/imoveis', Imoveis)
crudRoutes('/investidores', Investidores)
crudRoutes('/consultores', Consultores)
crudRoutes('/negocios', Negocios)
crudRoutes('/despesas', Despesas)
crudRoutes('/tarefas', Tarefas)

// ── Dashboard overview ────────────────────────────────────────
router.get('/stats', (req, res) => {
  try { res.json(getDashboardStats()) }
  catch (e) { res.status(500).json({ error: e.message }) }
})

// ── Sync Notion ↔ CRM ─────────────────────────────────────────
router.post('/sync', async (req, res) => {
  try {
    const results = await syncAllFromNotion()
    res.json({ ok: true, results })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

router.post('/sync/:table', async (req, res) => {
  try {
    const result = await syncFromNotion(req.params.table)
    res.json(result)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// ── Audit log ─────────────────────────────────────────────────
router.get('/audit', (req, res) => {
  try {
    const { limit = 50, tabela } = req.query
    let query = 'SELECT * FROM audit_log'
    const params = { limit: +limit }
    if (tabela) { query += ' WHERE tabela = @tabela'; params.tabela = tabela }
    query += ' ORDER BY created_at DESC LIMIT @limit'
    res.json(db.prepare(query).all(params))
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// ── Backup: export all tables as JSON ─────────────────────────
router.get('/backup', (req, res) => {
  try {
    const backup = {}
    const tables = ['imoveis', 'investidores', 'consultores', 'negocios', 'despesas', 'tarefas']
    for (const t of tables) {
      backup[t] = db.prepare(`SELECT * FROM ${t}`).all()
    }
    backup.exported_at = new Date().toISOString()
    backup.total = Object.values(backup).filter(Array.isArray).reduce((s, a) => s + a.length, 0)

    if (req.query.download === 'true') {
      res.setHeader('Content-Type', 'application/json')
      res.setHeader('Content-Disposition', `attachment; filename=somnium-backup-${new Date().toISOString().slice(0,10)}.json`)
    }
    res.json(backup)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

export default router
