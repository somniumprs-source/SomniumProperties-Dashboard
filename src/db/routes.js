/**
 * API REST routes para o CRM (PostgreSQL).
 */
import { Router } from 'express'
import multer from 'multer'
import path from 'path'
import { fileURLToPath } from 'url'
import { randomUUID } from 'crypto'
import { Imoveis, Investidores, Consultores, Negocios, Despesas, Tarefas, getDashboardStats } from './crud.js'
import pool from './pg.js'
import { syncFromNotion, syncAllFromNotion, syncToNotion } from './sync.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const uploadsDir = path.resolve(__dirname, '../../public/uploads/despesas')

const storage = multer.diskStorage({
  destination: uploadsDir,
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname)
    cb(null, `${randomUUID()}${ext}`)
  },
})
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = /\.(pdf|jpg|jpeg|png|webp|heic)$/i
    cb(null, allowed.test(path.extname(file.originalname)))
  },
})

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

// ── Upload de documentos para despesas ───────────────────────
router.post('/despesas/:id/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Ficheiro inválido (PDF, JPG, PNG até 10MB)' })
    const { id } = req.params
    const despesa = await Despesas.getById(id)
    if (!despesa) return res.status(404).json({ error: 'Despesa não encontrada' })

    const docs = despesa.documentos ? JSON.parse(despesa.documentos) : []
    docs.push({
      id: randomUUID(),
      name: req.file.originalname,
      path: `/uploads/despesas/${req.file.filename}`,
      type: req.file.mimetype,
      size: req.file.size,
      uploaded_at: new Date().toISOString(),
    })
    await Despesas.update(id, { documentos: JSON.stringify(docs) })
    res.json({ ok: true, documentos: docs })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

router.delete('/despesas/:id/upload/:docId', async (req, res) => {
  try {
    const { id, docId } = req.params
    const despesa = await Despesas.getById(id)
    if (!despesa) return res.status(404).json({ error: 'Despesa não encontrada' })

    const docs = despesa.documentos ? JSON.parse(despesa.documentos) : []
    const filtered = docs.filter(d => d.id !== docId)
    await Despesas.update(id, { documentos: JSON.stringify(filtered) })
    res.json({ ok: true, documentos: filtered })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

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
    // Análises de rentabilidade
    const { rows: analises } = await pool.query('SELECT * FROM analises WHERE imovel_id = $1 ORDER BY activa DESC, updated_at DESC', [imovel.id])
    // Audit log (timeline)
    const { rows: timeline } = await pool.query("SELECT * FROM audit_log WHERE registo_id = $1 ORDER BY created_at DESC LIMIT 20", [imovel.id])
    res.json({ ...imovel, negocios, consultores, tarefas, analises, timeline })
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

// ── Relation lookups (para dropdowns nos formulários) ─────────
router.get('/lookup/imoveis', async (req, res) => {
  try {
    const { rows } = await pool.query("SELECT id, nome, estado FROM imoveis ORDER BY nome")
    res.json(rows)
  } catch (e) { res.status(500).json({ error: e.message }) }
})
router.get('/lookup/investidores', async (req, res) => {
  try {
    const { rows } = await pool.query("SELECT id, nome, status FROM investidores ORDER BY nome")
    res.json(rows)
  } catch (e) { res.status(500).json({ error: e.message }) }
})
router.get('/lookup/consultores', async (req, res) => {
  try {
    const { rows } = await pool.query("SELECT id, nome, estatuto FROM consultores ORDER BY nome")
    res.json(rows)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// ── Automações PostgreSQL ──────────────────────────────────────
router.post('/automation/score-investidores', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM investidores')
    const updated = []
    for (const inv of rows) {
      let score = 0
      if (inv.capital_min > 0 || inv.capital_max > 0) score += 20
      if (inv.data_reuniao) score += 20
      if (inv.nda_assinado) score += 15
      const estrategia = inv.estrategia ? JSON.parse(inv.estrategia) : []
      if (estrategia.length > 0) score += 10
      const tipo = inv.tipo_investidor ? JSON.parse(inv.tipo_investidor) : []
      if (tipo.length > 0) score += 10
      if (inv.telemovel || inv.email) score += 5
      if (inv.data_primeiro_contacto) score += 5

      const classificacao = score >= 80 ? 'A' : score >= 60 ? 'B' : score >= 35 ? 'C' : 'D'
      if (inv.pontuacao !== score || inv.classificacao !== classificacao) {
        await pool.query('UPDATE investidores SET pontuacao = $1, classificacao = $2, updated_at = $3 WHERE id = $4',
          [score, classificacao, new Date().toISOString(), inv.id])
        updated.push({ nome: inv.nome, score, classificacao })
      }
    }
    res.json({ ok: true, atualizados: updated.length, detalhes: updated })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

router.post('/automation/score-consultores', async (req, res) => {
  try {
    const { rows: consultores } = await pool.query('SELECT * FROM consultores')
    const { rows: imoveis } = await pool.query('SELECT nome_consultor FROM imoveis')
    const updated = []
    for (const c of consultores) {
      let score = 0
      const leads = imoveis.filter(i => i.nome_consultor?.trim() === c.nome).length
      score += Math.min(leads * 3, 30)
      score += Math.min((c.imoveis_off_market || 0) * 10, 30)
      if (c.data_proximo_follow_up && new Date(c.data_proximo_follow_up) >= new Date()) score += 15
      if (c.email) score += 5
      const imobs = c.imobiliaria ? JSON.parse(c.imobiliaria) : []
      if (imobs.length > 0) score += 5
      const zonas = c.zonas ? JSON.parse(c.zonas) : []
      if (zonas.length > 0) score += 5
      if (c.imoveis_enviados > 0) score += 10

      const classificacao = score >= 70 ? 'A' : score >= 45 ? 'B' : score >= 20 ? 'C' : 'D'
      if (c.classificacao !== classificacao) {
        await pool.query('UPDATE consultores SET classificacao = $1, updated_at = $2 WHERE id = $3',
          [classificacao, new Date().toISOString(), c.id])
        updated.push({ nome: c.nome, score, classificacao })
      }
    }
    res.json({ ok: true, atualizados: updated.length, detalhes: updated })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

router.post('/automation/calc-roi', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM imoveis WHERE ask_price > 0')
    const updated = []
    for (const im of rows) {
      const custoTotal = im.ask_price + (im.custo_estimado_obra || 0)
      if (custoTotal <= 0) continue
      let roi = null
      if (im.valor_venda_remodelado > 0) {
        roi = Math.round((im.valor_venda_remodelado - custoTotal) / custoTotal * 10000) / 100
      } else if (im.valor_proposta > 0 && im.valor_proposta < im.ask_price) {
        roi = Math.round((im.ask_price - im.valor_proposta) / im.ask_price * 10000) / 100
      }
      if (roi === null) continue
      const roiAnualizado = Math.round(roi * 2 * 100) / 100
      if (Math.abs((im.roi || 0) - roi) > 0.1) {
        await pool.query('UPDATE imoveis SET roi = $1, roi_anualizado = $2, updated_at = $3 WHERE id = $4',
          [roi, roiAnualizado, new Date().toISOString(), im.id])
        updated.push({ nome: im.nome, roi, roiAnualizado })
      }
    }
    res.json({ ok: true, atualizados: updated.length, detalhes: updated })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

router.post('/automation/run-all', async (req, res) => {
  try {
    const base = `http://localhost:${process.env.PORT ?? 3001}`
    const results = {}
    for (const ep of ['score-investidores', 'score-consultores', 'calc-roi']) {
      try {
        const r = await fetch(`${base}/api/crm/automation/${ep}`, { method: 'POST' })
        results[ep] = await r.json()
      } catch (e) { results[ep] = { error: e.message } }
    }
    res.json({ ok: true, results })
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

// ── Undo (reverter alteração via audit log) ──────────────────
router.post('/undo/:auditId', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM audit_log WHERE id = $1', [req.params.auditId])
    if (!rows[0]) return res.status(404).json({ error: 'Entrada não encontrada' })
    const entry = rows[0]
    const tabela = entry.tabela
    const registoId = entry.registo_id

    if (entry.acao === 'UPDATE' && entry.dados_anteriores) {
      // Reverter UPDATE: restaurar dados anteriores
      const anterior = JSON.parse(entry.dados_anteriores)
      const SKIP = new Set(['id', 'created_at', 'notion_id'])
      const fields = Object.entries(anterior).filter(([k]) => !SKIP.has(k))
      const sets = fields.map(([k], i) => `${k} = $${i + 1}`)
      const params = [...fields.map(([, v]) => v), registoId]
      await pool.query(`UPDATE ${tabela} SET ${sets.join(', ')} WHERE id = $${params.length}`, params)
      // Log the undo
      await pool.query(
        'INSERT INTO audit_log (tabela, registo_id, acao, dados_anteriores, dados_novos) VALUES ($1, $2, $3, $4, $5)',
        [tabela, registoId, 'UNDO', entry.dados_novos, entry.dados_anteriores]
      )
      res.json({ ok: true, action: 'restored', tabela, registoId })

    } else if (entry.acao === 'DELETE' && entry.dados_anteriores) {
      // Reverter DELETE: re-inserir o registo
      const anterior = JSON.parse(entry.dados_anteriores)
      const fields = Object.entries(anterior).filter(([, v]) => v !== undefined && v !== null)
      const cols = fields.map(([k]) => k)
      const vals = fields.map((_, i) => `$${i + 1}`)
      const params = fields.map(([, v]) => v)
      await pool.query(`INSERT INTO ${tabela} (${cols.join(', ')}) VALUES (${vals.join(', ')}) ON CONFLICT (id) DO NOTHING`, params)
      await pool.query(
        'INSERT INTO audit_log (tabela, registo_id, acao, dados_anteriores, dados_novos) VALUES ($1, $2, $3, $4, $5)',
        [tabela, registoId, 'UNDO_DELETE', null, entry.dados_anteriores]
      )
      res.json({ ok: true, action: 'restored_deleted', tabela, registoId })

    } else if (entry.acao === 'INSERT') {
      // Reverter INSERT: apagar o registo criado
      await pool.query(`DELETE FROM ${tabela} WHERE id = $1`, [registoId])
      await pool.query(
        'INSERT INTO audit_log (tabela, registo_id, acao, dados_anteriores, dados_novos) VALUES ($1, $2, $3, $4, $5)',
        [tabela, registoId, 'UNDO_INSERT', entry.dados_novos, null]
      )
      res.json({ ok: true, action: 'deleted_created', tabela, registoId })

    } else {
      res.status(400).json({ error: 'Não é possível reverter esta ação' })
    }
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// ── Backup ────────────────────────────────────────────────────
const BACKUP_TABLES = ['imoveis', 'investidores', 'consultores', 'negocios', 'despesas', 'tarefas']

router.get('/backup', async (req, res) => {
  try {
    const backup = {}
    let total = 0
    for (const t of BACKUP_TABLES) {
      const { rows } = await pool.query(`SELECT * FROM ${t}`)
      backup[t] = rows
      total += rows.length
    }
    // Incluir audit log
    const { rows: audit } = await pool.query('SELECT * FROM audit_log ORDER BY created_at DESC LIMIT 500')
    backup.audit_log = audit
    backup.exported_at = new Date().toISOString()
    backup.total = total
    if (req.query.download === 'true') {
      res.setHeader('Content-Type', 'application/json')
      res.setHeader('Content-Disposition', `attachment; filename=somnium-backup-${new Date().toISOString().slice(0,10)}.json`)
    }
    res.json(backup)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// Backup automático — guarda snapshot na tabela backups
router.post('/backup/auto', async (req, res) => {
  try {
    // Criar tabela de backups se não existir
    await pool.query(`
      CREATE TABLE IF NOT EXISTS backups (
        id SERIAL PRIMARY KEY,
        data JSONB NOT NULL,
        total_registos INT DEFAULT 0,
        created_at TEXT DEFAULT (NOW()::TEXT)
      )
    `)
    const backup = {}
    let total = 0
    for (const t of BACKUP_TABLES) {
      const { rows } = await pool.query(`SELECT * FROM ${t}`)
      backup[t] = rows
      total += rows.length
    }
    await pool.query(
      'INSERT INTO backups (data, total_registos, created_at) VALUES ($1, $2, $3)',
      [JSON.stringify(backup), total, new Date().toISOString()]
    )
    // Manter só os últimos 30 backups
    await pool.query(`DELETE FROM backups WHERE id NOT IN (SELECT id FROM backups ORDER BY created_at DESC LIMIT 30)`)
    res.json({ ok: true, total, timestamp: new Date().toISOString() })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// Listar backups disponíveis
router.get('/backup/list', async (req, res) => {
  try {
    await pool.query(`CREATE TABLE IF NOT EXISTS backups (id SERIAL PRIMARY KEY, data JSONB NOT NULL, total_registos INT DEFAULT 0, created_at TEXT DEFAULT (NOW()::TEXT))`)
    const { rows } = await pool.query('SELECT id, total_registos, created_at FROM backups ORDER BY created_at DESC LIMIT 30')
    res.json(rows)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// Restaurar backup específico
router.post('/backup/restore/:id', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM backups WHERE id = $1', [req.params.id])
    if (!rows[0]) return res.status(404).json({ error: 'Backup não encontrado' })

    // Primeiro fazer backup do estado actual (safety net)
    const currentBackup = {}
    let currentTotal = 0
    for (const t of BACKUP_TABLES) {
      const { rows: current } = await pool.query(`SELECT * FROM ${t}`)
      currentBackup[t] = current
      currentTotal += current.length
    }
    await pool.query(`CREATE TABLE IF NOT EXISTS backups (id SERIAL PRIMARY KEY, data JSONB NOT NULL, total_registos INT DEFAULT 0, created_at TEXT DEFAULT (NOW()::TEXT))`)
    await pool.query(
      'INSERT INTO backups (data, total_registos, created_at) VALUES ($1, $2, $3)',
      [JSON.stringify(currentBackup), currentTotal, new Date().toISOString() + '_pre_restore']
    )

    // Restaurar
    const backup = typeof rows[0].data === 'string' ? JSON.parse(rows[0].data) : rows[0].data
    let restored = 0
    for (const t of BACKUP_TABLES) {
      if (!backup[t]?.length) continue
      // Limpar tabela
      await pool.query(`DELETE FROM ${t}`)
      // Re-inserir registos
      for (const row of backup[t]) {
        const fields = Object.entries(row).filter(([, v]) => v !== undefined && v !== null)
        const cols = fields.map(([k]) => k)
        const vals = fields.map((_, i) => `$${i + 1}`)
        await pool.query(`INSERT INTO ${t} (${cols.join(', ')}) VALUES (${vals.join(', ')}) ON CONFLICT (id) DO NOTHING`, fields.map(([, v]) => v))
        restored++
      }
    }
    res.json({ ok: true, restored, fromBackup: rows[0].created_at })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// Descarregar backup específico como ficheiro
router.get('/backup/:id/download', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM backups WHERE id = $1', [req.params.id])
    if (!rows[0]) return res.status(404).json({ error: 'Backup não encontrado' })
    const data = typeof rows[0].data === 'string' ? JSON.parse(rows[0].data) : rows[0].data
    data.exported_at = rows[0].created_at
    data.total = rows[0].total_registos
    res.setHeader('Content-Type', 'application/json')
    res.setHeader('Content-Disposition', `attachment; filename=somnium-backup-${rows[0].created_at.slice(0,10)}.json`)
    res.json(data)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

export default router
