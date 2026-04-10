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

// ── Ficha de detalhe com relações ──────────────────────────────
router.get('/imoveis/:id/full', async (req, res) => {
  try {
    const { rows: [imovel] } = await pool.query('SELECT * FROM imoveis WHERE id = $1', [req.params.id])
    if (!imovel) return res.status(404).json({ error: 'Não encontrado' })
    // Negócios ligados a este imóvel
    const { rows: negocios } = await pool.query('SELECT * FROM negocios WHERE imovel_id = $1', [imovel.id])
    // Consultor (por nome)
    const { rows: consultores } = imovel.nome_consultor
      ? await pool.query('SELECT id, nome, estatuto, classificacao, contacto, email FROM consultores WHERE nome ILIKE $1', [`%${imovel.nome_consultor}%`])
      : { rows: [] }
    // Tarefas
    const { rows: tarefas } = await pool.query("SELECT * FROM tarefas WHERE tarefa ILIKE $1 ORDER BY created_at DESC", [`%${imovel.nome}%`])
    // Audit log (timeline)
    const { rows: timeline } = await pool.query("SELECT * FROM audit_log WHERE registo_id = $1 ORDER BY created_at DESC LIMIT 20", [imovel.id])
    res.json({ ...imovel, negocios, consultores, tarefas, timeline })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

router.get('/investidores/:id/full', async (req, res) => {
  try {
    const { rows: [inv] } = await pool.query('SELECT * FROM investidores WHERE id = $1', [req.params.id])
    if (!inv) return res.status(404).json({ error: 'Não encontrado' })
    // Negócios onde este investidor aparece
    const { rows: negocios } = await pool.query("SELECT * FROM negocios WHERE investidor_ids LIKE $1", [`%${inv.notion_id ?? inv.id}%`])
    // Tarefas relacionadas
    const { rows: tarefas } = await pool.query("SELECT * FROM tarefas WHERE tarefa ILIKE $1 ORDER BY created_at DESC", [`%${inv.nome}%`])
    const { rows: timeline } = await pool.query("SELECT * FROM audit_log WHERE registo_id = $1 ORDER BY created_at DESC LIMIT 20", [inv.id])
    res.json({ ...inv, negocios, tarefas, timeline })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

router.get('/consultores/:id/full', async (req, res) => {
  try {
    const { rows: [cons] } = await pool.query('SELECT * FROM consultores WHERE id = $1', [req.params.id])
    if (!cons) return res.status(404).json({ error: 'Não encontrado' })
    // Imóveis deste consultor
    const { rows: imoveis } = await pool.query("SELECT id, nome, estado, ask_price, zona FROM imoveis WHERE nome_consultor ILIKE $1", [`%${cons.nome}%`])
    // Negócios
    const { rows: negocios } = await pool.query("SELECT * FROM negocios WHERE consultor_ids LIKE $1", [`%${cons.notion_id ?? cons.id}%`])
    const { rows: tarefas } = await pool.query("SELECT * FROM tarefas WHERE tarefa ILIKE $1 ORDER BY created_at DESC", [`%${cons.nome}%`])
    const { rows: timeline } = await pool.query("SELECT * FROM audit_log WHERE registo_id = $1 ORDER BY created_at DESC LIMIT 20", [cons.id])
    res.json({ ...cons, imoveis, negocios, tarefas, timeline })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// ── KPIs rápidos por tab ──────────────────────────────────────
router.get('/kpis/:tab', async (req, res) => {
  try {
    const tab = req.params.tab
    if (tab === 'imoveis') {
      const { rows } = await pool.query(`
        SELECT estado, COUNT(*) as count, COALESCE(SUM(ask_price),0) as valor
        FROM imoveis GROUP BY estado ORDER BY count DESC
      `)
      const { rows: [totals] } = await pool.query(`SELECT COUNT(*) as total, COALESCE(AVG(NULLIF(roi,0)),0) as roi_medio FROM imoveis`)
      res.json({ byEstado: rows, total: parseInt(totals.total), roiMedio: parseFloat(totals.roi_medio).toFixed(1) })
    } else if (tab === 'investidores') {
      const { rows } = await pool.query(`SELECT status, COUNT(*) as count FROM investidores GROUP BY status ORDER BY count DESC`)
      const { rows: [totals] } = await pool.query(`
        SELECT COUNT(*) as total,
          COUNT(CASE WHEN classificacao IN ('A','B') THEN 1 END) as ab,
          COALESCE(SUM(capital_max),0) as capital
        FROM investidores
      `)
      res.json({ byStatus: rows, total: parseInt(totals.total), classAB: parseInt(totals.ab), capitalTotal: parseFloat(totals.capital) })
    } else if (tab === 'consultores') {
      const { rows } = await pool.query(`SELECT estatuto, COUNT(*) as count FROM consultores GROUP BY estatuto ORDER BY count DESC`)
      const { rows: [totals] } = await pool.query(`SELECT COUNT(*) as total FROM consultores`)
      res.json({ byEstatuto: rows, total: parseInt(totals.total) })
    } else if (tab === 'negocios') {
      const { rows: [totals] } = await pool.query(`
        SELECT COUNT(*) as total, COALESCE(SUM(lucro_estimado),0) as lucro_est,
          COALESCE(SUM(lucro_real),0) as lucro_real,
          COUNT(CASE WHEN fase = 'Vendido' THEN 1 END) as vendidos
        FROM negocios
      `)
      res.json(totals)
    } else if (tab === 'despesas') {
      const { rows: [totals] } = await pool.query(`
        SELECT COUNT(*) as total,
          COALESCE(SUM(CASE WHEN timing = 'Mensalmente' THEN custo_mensal ELSE 0 END),0) as burn_rate,
          COALESCE(SUM(custo_anual),0) as total_anual
        FROM despesas
      `)
      res.json(totals)
    } else {
      res.status(404).json({ error: 'Tab not found' })
    }
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// ── Tarefas automáticas por mudança de fase ───────────────────
router.post('/auto-task', async (req, res) => {
  try {
    const { entity, entityId, entityName, newPhase } = req.body
    const TASK_MAP = {
      imoveis: {
        'Em Análise':       'Estudar mercado e comparáveis para {name}',
        'Visita Marcada':   'Preparar visita ao imóvel {name}',
        'Follow UP':        'Follow-up do imóvel {name}',
        'Estudo de VVR':    'Elaborar estudo de VVR para {name}',
        'Enviar proposta ao investidor': 'Preparar proposta para investidor — {name}',
        'Wholesaling':      'Formalizar contrato de wholesaling — {name}',
        'Negócio em Curso': 'Acompanhar negócio em curso — {name}',
      },
      investidores: {
        'Marcar call':             'Marcar call com investidor {name}',
        'Call marcada':            'Preparar apresentação para {name}',
        'Follow Up':               'Follow-up com investidor {name}',
        'Investidor classificado': 'Enviar proposta de negócio a {name}',
        'Investidor em parceria':  'Preparar onboarding de {name}',
      },
      consultores: {
        'Follow up':          'Follow-up com consultor {name}',
        'Aberto Parcerias':   'Formalizar parceria com {name}',
      },
    }
    const templates = TASK_MAP[entity] ?? {}
    const template = templates[newPhase]
    if (!template) return res.json({ ok: true, created: false, reason: 'No task for this phase' })

    const tarefa = template.replace('{name}', entityName)
    const id = (await import('crypto')).randomUUID()
    const now = new Date().toISOString()
    await pool.query(
      'INSERT INTO tarefas (id, tarefa, status, created_at, updated_at) VALUES ($1, $2, $3, $4, $5)',
      [id, tarefa, 'A fazer', now, now]
    )
    res.json({ ok: true, created: true, tarefa, id })
  } catch (e) { res.status(500).json({ error: e.message }) }
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
