/**
 * Rotas REST do Sistema de Agenda — Fase 1 (disponibilidade + catálogo de
 * tarefas recorrentes). O motor de agendamento (gerar-semana/proposta/
 * confirmar) é Fase 2, ainda não implementado aqui.
 * Cobertas pelo middleware Supabase JWT global em server.js (caminho /api/agenda/*).
 */
import { Router } from 'express'
import { randomUUID } from 'crypto'
import pool from './pg.js'

const router = Router()
const FREQUENCIAS_VALIDAS = ['diaria', 'semanal', 'quinzenal', 'mensal', 'custom']
const PRIORIDADES_VALIDAS = ['alta', 'media', 'baixa']

function userEmail(req) {
  return req.user?.email || null
}

// ── Disponibilidade ──────────────────────────────────────────────

// GET /api/agenda/disponibilidade?user_id=&de=&ate=
router.get('/disponibilidade', async (req, res) => {
  try {
    const { user_id, de, ate } = req.query
    const where = []
    const params = []
    if (user_id) { params.push(user_id); where.push(`user_id = $${params.length}`) }
    if (de) { params.push(de); where.push(`data >= $${params.length}`) }
    if (ate) { params.push(ate); where.push(`data <= $${params.length}`) }
    const sql = `SELECT * FROM disponibilidade_blocos
                 ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
                 ORDER BY data, hora_inicio`
    const { rows } = await pool.query(sql, params)
    res.json({ blocos: rows })
  } catch (e) {
    console.error('[agenda] list disponibilidade erro:', e)
    res.status(500).json({ error: e.message })
  }
})

// POST /api/agenda/disponibilidade — aceita um bloco ou array de blocos
router.post('/disponibilidade', async (req, res) => {
  try {
    const items = Array.isArray(req.body) ? req.body : [req.body]
    if (!items.length) return res.status(400).json({ error: 'Nada para criar' })
    const criados = []
    for (const item of items) {
      const { user_id, data, hora_inicio, hora_fim } = item || {}
      if (!user_id || !data || !hora_inicio || !hora_fim) {
        return res.status(400).json({ error: 'user_id, data, hora_inicio e hora_fim são obrigatórios' })
      }
      if (hora_fim <= hora_inicio) {
        return res.status(400).json({ error: `Bloco inválido em ${data}: hora_fim tem de ser depois de hora_inicio` })
      }
      const id = randomUUID()
      const { rows } = await pool.query(
        `INSERT INTO disponibilidade_blocos (id, user_id, data, hora_inicio, hora_fim)
         VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [id, user_id, data, hora_inicio, hora_fim]
      )
      criados.push(rows[0])
    }
    res.status(201).json({ blocos: criados })
  } catch (e) {
    console.error('[agenda] create disponibilidade erro:', e)
    res.status(500).json({ error: e.message })
  }
})

// DELETE /api/agenda/disponibilidade/:id
router.delete('/disponibilidade/:id', async (req, res) => {
  try {
    const r = await pool.query('DELETE FROM disponibilidade_blocos WHERE id = $1', [req.params.id])
    if (!r.rowCount) return res.status(404).json({ error: 'Bloco não encontrado' })
    res.json({ ok: true })
  } catch (e) {
    console.error('[agenda] delete disponibilidade erro:', e)
    res.status(500).json({ error: e.message })
  }
})

// POST /api/agenda/disponibilidade/copiar-semana
// { user_id, semana_origem, semana_destino } — datas (YYYY-MM-DD) de
// referência (normalmente a segunda-feira) de cada semana. Copia todos os
// blocos de [semana_origem, semana_origem+6] para a mesma janela deslocada
// pelo offset entre as duas datas.
router.post('/disponibilidade/copiar-semana', async (req, res) => {
  try {
    const { user_id, semana_origem, semana_destino } = req.body || {}
    if (!user_id || !semana_origem || !semana_destino) {
      return res.status(400).json({ error: 'user_id, semana_origem e semana_destino são obrigatórios' })
    }
    const origem = new Date(semana_origem + 'T00:00:00Z')
    const destino = new Date(semana_destino + 'T00:00:00Z')
    const offsetDias = Math.round((destino - origem) / 86400000)
    const fimOrigem = new Date(origem)
    fimOrigem.setUTCDate(fimOrigem.getUTCDate() + 6)
    const fimOrigemStr = fimOrigem.toISOString().slice(0, 10)

    const { rows: blocos } = await pool.query(
      `SELECT * FROM disponibilidade_blocos WHERE user_id = $1 AND data >= $2 AND data <= $3`,
      [user_id, semana_origem, fimOrigemStr]
    )
    const criados = []
    for (const b of blocos) {
      const d = new Date(b.data + 'T00:00:00Z')
      d.setUTCDate(d.getUTCDate() + offsetDias)
      const novaData = d.toISOString().slice(0, 10)
      const id = randomUUID()
      const { rows } = await pool.query(
        `INSERT INTO disponibilidade_blocos (id, user_id, data, hora_inicio, hora_fim)
         VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [id, user_id, novaData, b.hora_inicio, b.hora_fim]
      )
      criados.push(rows[0])
    }
    res.status(201).json({ blocos: criados, copiados: criados.length })
  } catch (e) {
    console.error('[agenda] copiar-semana erro:', e)
    res.status(500).json({ error: e.message })
  }
})

// ── Catálogo de tarefas recorrentes ──────────────────────────────

// GET /api/agenda/templates?activo=true
router.get('/templates', async (req, res) => {
  try {
    const { activo } = req.query
    const where = []
    const params = []
    if (activo !== undefined) { params.push(activo === 'true'); where.push(`activo = $${params.length}`) }
    const { rows } = await pool.query(
      `SELECT * FROM tarefas_templates
       ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
       ORDER BY CASE prioridade WHEN 'alta' THEN 0 WHEN 'media' THEN 1 ELSE 2 END, titulo`,
      params
    )
    res.json({ templates: rows })
  } catch (e) {
    console.error('[agenda] list templates erro:', e)
    res.status(500).json({ error: e.message })
  }
})

// POST /api/agenda/templates
router.post('/templates', async (req, res) => {
  try {
    const {
      titulo, categoria, duracao_estimada_horas, frequencia,
      frequencia_intervalo_dias, dias_semana, prioridade, sop_ref,
      user_id_default, regiao, activo,
    } = req.body || {}
    if (!titulo) return res.status(400).json({ error: 'titulo é obrigatório' })
    const freq = frequencia || 'semanal'
    if (!FREQUENCIAS_VALIDAS.includes(freq)) {
      return res.status(400).json({ error: `frequencia inválida: ${freq}` })
    }
    const prio = prioridade || 'media'
    if (!PRIORIDADES_VALIDAS.includes(prio)) {
      return res.status(400).json({ error: `prioridade inválida: ${prio}` })
    }
    const id = randomUUID()
    const { rows } = await pool.query(
      `INSERT INTO tarefas_templates
         (id, titulo, categoria, duracao_estimada_horas, frequencia,
          frequencia_intervalo_dias, dias_semana, prioridade, sop_ref,
          user_id_default, regiao, activo, updated_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       RETURNING *`,
      [id, titulo, categoria || null, duracao_estimada_horas || 1, freq,
       frequencia_intervalo_dias || null, dias_semana || null, prio, sop_ref || null,
       user_id_default || null, regiao || null, activo !== false, userEmail(req)]
    )
    res.status(201).json({ template: rows[0] })
  } catch (e) {
    console.error('[agenda] create template erro:', e)
    res.status(500).json({ error: e.message })
  }
})

// PUT /api/agenda/templates/:id
router.put('/templates/:id', async (req, res) => {
  try {
    const body = req.body || {}
    if (body.frequencia && !FREQUENCIAS_VALIDAS.includes(body.frequencia)) {
      return res.status(400).json({ error: `frequencia inválida: ${body.frequencia}` })
    }
    if (body.prioridade && !PRIORIDADES_VALIDAS.includes(body.prioridade)) {
      return res.status(400).json({ error: `prioridade inválida: ${body.prioridade}` })
    }
    const campos = [
      'titulo', 'categoria', 'duracao_estimada_horas', 'frequencia',
      'frequencia_intervalo_dias', 'dias_semana', 'prioridade', 'sop_ref',
      'user_id_default', 'regiao', 'activo',
    ]
    const fields = []
    const values = []
    let i = 1
    for (const campo of campos) {
      if (body[campo] !== undefined) { fields.push(`${campo} = $${i++}`); values.push(body[campo]) }
    }
    if (!fields.length) return res.status(400).json({ error: 'Nada para actualizar' })
    fields.push(`updated_at = NOW()`)
    fields.push(`updated_by = $${i++}`); values.push(userEmail(req))
    values.push(req.params.id)
    const { rows } = await pool.query(
      `UPDATE tarefas_templates SET ${fields.join(', ')} WHERE id = $${i} RETURNING *`,
      values
    )
    if (!rows.length) return res.status(404).json({ error: 'Template não encontrado' })
    res.json({ template: rows[0] })
  } catch (e) {
    console.error('[agenda] update template erro:', e)
    res.status(500).json({ error: e.message })
  }
})

// DELETE /api/agenda/templates/:id
router.delete('/templates/:id', async (req, res) => {
  try {
    const r = await pool.query('DELETE FROM tarefas_templates WHERE id = $1', [req.params.id])
    if (!r.rowCount) return res.status(404).json({ error: 'Template não encontrado' })
    res.json({ ok: true })
  } catch (e) {
    console.error('[agenda] delete template erro:', e)
    res.status(500).json({ error: e.message })
  }
})

export default router
