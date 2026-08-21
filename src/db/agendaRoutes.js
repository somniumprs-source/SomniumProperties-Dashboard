/**
 * Rotas REST do Sistema de Agenda — Fase 1 (disponibilidade + catálogo de
 * tarefas recorrentes). O motor de agendamento (gerar-semana/proposta/
 * confirmar) é Fase 2, ainda não implementado aqui.
 * Cobertas pelo middleware Supabase JWT global em server.js (caminho /api/agenda/*).
 */
import { Router } from 'express'
import { randomUUID } from 'crypto'
import pool from './pg.js'
import {
  gerarCadeiasAngariacao, gerarEstudoDeMercado, gerarAnaliseDeNegocio, gerarElaboracaoProposta,
  gerarTarefasSinteticas, instanciarTemplatesDevidos, gerarProposta, gerarFila, atribuirTarefa, desfazerAtribuicao,
} from './agendaEngine.js'

const router = Router()
const FREQUENCIAS_VALIDAS = ['diaria', 'semanal', 'quinzenal', 'mensal', 'custom']
const PRIORIDADES_VALIDAS = ['alta', 'media', 'baixa']

function addDias(dataISO, n) {
  const d = new Date(dataISO + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

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
      user_id_default, regiao, activo, simultaneo,
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
          user_id_default, regiao, activo, updated_by, simultaneo)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
       RETURNING *`,
      [id, titulo, categoria || null, duracao_estimada_horas || 1, freq,
       frequencia_intervalo_dias || null, dias_semana || null, prio, sop_ref || null,
       user_id_default || null, regiao || null, activo !== false, userEmail(req), !!simultaneo]
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
      'user_id_default', 'regiao', 'activo', 'simultaneo',
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

// ── Fila priorizada + atribuição manual (Fase 2, revisão 21/08/2026) ─
// Encaixe automático substituído por escolha manual — ver agendaEngine.js.

// POST /api/agenda/actualizar-fila { semana_inicio } — corre a geração
// (cadeias, gatilhos de estado, sequência, automáticas por data,
// templates devidos) e devolve a fila actualizada. semana_inicio só é
// usado para saber que templates estão devidos esta semana.
router.post('/actualizar-fila', async (req, res) => {
  try {
    const { semana_inicio } = req.body || {}
    if (!semana_inicio) return res.status(400).json({ error: 'semana_inicio é obrigatório' })
    const cadeias = await gerarCadeiasAngariacao(pool)
    const estudosMercado = await gerarEstudoDeMercado(pool)
    const analises = await gerarAnaliseDeNegocio(pool)
    const propostas = await gerarElaboracaoProposta(pool)
    const sinteticas = await gerarTarefasSinteticas(pool)
    const instanciadas = await instanciarTemplatesDevidos(pool, semana_inicio)
    const { users, fila } = await gerarFila(pool)
    res.json({
      ok: true,
      cadeias_angariacao: cadeias,
      estudos_mercado: estudosMercado,
      analises_negocio: analises,
      elaboracoes_proposta: propostas,
      tarefas_sinteticas: sinteticas,
      templates_instanciados: instanciadas,
      users,
      fila,
    })
  } catch (e) {
    console.error('[agenda] actualizar-fila erro:', e)
    res.status(500).json({ error: e.message })
  }
})

// GET /api/agenda/fila — só lê a fila actual, sem correr geração de novo.
router.get('/fila', async (req, res) => {
  try {
    const { users, fila } = await gerarFila(pool)
    res.json({ users, fila })
  } catch (e) {
    console.error('[agenda] fila erro:', e)
    res.status(500).json({ error: e.message })
  }
})

// POST /api/agenda/atribuir { blocoId, userId, item } — atribui um item
// da fila a um bloco de disponibilidade concreto, deliberadamente.
router.post('/atribuir', async (req, res) => {
  try {
    const { blocoId, userId, item } = req.body || {}
    if (!blocoId || !userId || !item) return res.status(400).json({ error: 'blocoId, userId e item são obrigatórios' })
    const resultado = await atribuirTarefa(pool, { blocoId, userId, item })
    res.json(resultado)
  } catch (e) {
    console.error('[agenda] atribuir erro:', e)
    res.status(400).json({ error: e.message })
  }
})

// POST /api/agenda/desfazer { tarefaId } — desfaz uma atribuição manual.
router.post('/desfazer', async (req, res) => {
  try {
    const { tarefaId } = req.body || {}
    if (!tarefaId) return res.status(400).json({ error: 'tarefaId é obrigatório' })
    const resultado = await desfazerAtribuicao(pool, tarefaId)
    res.json(resultado)
  } catch (e) {
    console.error('[agenda] desfazer erro:', e)
    res.status(400).json({ error: e.message })
  }
})

// GET /api/agenda/proposta?semana_inicio=&user_id=
router.get('/proposta', async (req, res) => {
  try {
    const { semana_inicio, user_id } = req.query
    if (!semana_inicio) return res.status(400).json({ error: 'semana_inicio é obrigatório' })
    const semanaFim = addDias(semana_inicio, 6)
    const params = [semana_inicio, semanaFim]
    let where = 'a.data >= $1 AND a.data <= $2'
    if (user_id) { params.push(user_id); where += ` AND a.user_id = $${params.length}` }
    const { rows: agendamentos } = await pool.query(
      `SELECT a.*, t.tarefa, t.categoria, t.prioridade, t.origem_tipo, t.tempo_horas
       FROM agendamentos a JOIN tarefas t ON t.id = a.tarefa_id
       WHERE ${where} ORDER BY a.data, a.hora_inicio`,
      params
    )
    const paramsNao = [semana_inicio, semanaFim]
    let whereNao = "t.inicio IS NULL AND t.status != 'Concluída' AND NOT EXISTS (SELECT 1 FROM agendamentos a2 WHERE a2.tarefa_id = t.id AND a2.estado IN ('proposto','confirmado') AND a2.data >= $1 AND a2.data <= $2)"
    if (user_id) { paramsNao.push(user_id); whereNao += ` AND (t.user_id = $${paramsNao.length} OR t.user_id IS NULL)` }
    const { rows: naoAgendadas } = await pool.query(
      `SELECT t.* FROM tarefas t WHERE ${whereNao}
       ORDER BY CASE t.prioridade WHEN 'alta' THEN 0 WHEN 'media' THEN 1 ELSE 2 END, t.data_limite NULLS LAST, t.created_at`,
      paramsNao
    )
    res.json({ agendamentos, nao_agendadas: naoAgendadas })
  } catch (e) {
    console.error('[agenda] proposta erro:', e)
    res.status(500).json({ error: e.message })
  }
})

// POST /api/agenda/agendamentos/:id/confirmar
router.post('/agendamentos/:id/confirmar', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `UPDATE agendamentos SET estado = 'confirmado', confirmado_em = NOW(), confirmado_por = $1, updated_at = NOW()
       WHERE id = $2 AND estado = 'proposto' RETURNING *`,
      [userEmail(req), req.params.id]
    )
    if (!rows.length) return res.status(404).json({ error: 'Agendamento não encontrado ou já processado' })
    const ag = rows[0]
    const { rows: tarefaRows } = await pool.query(
      `UPDATE tarefas SET inicio = $1, fim = $2, updated_at = NOW() WHERE id = $3 RETURNING origem_tipo, origem_campo, origem_id`,
      [`${ag.data}T${ag.hora_inicio}:00`, `${ag.data}T${ag.hora_fim}:00`, ag.tarefa_id]
    )
    const tarefa = tarefaRows[0]
    // Cold Call da cadeia de angariação: escreve data_chamada no imóvel —
    // é a âncora para o prazo de 48h do Estudo de Mercado (ver agendaEngine.js).
    if (tarefa?.origem_tipo === 'imovel' && tarefa?.origem_campo === 'cadeia_cold_call') {
      await pool.query(`UPDATE imoveis SET data_chamada = $1 WHERE id = $2`, [ag.data, tarefa.origem_id])
    }
    res.json({ agendamento: ag })
  } catch (e) {
    console.error('[agenda] confirmar erro:', e)
    res.status(500).json({ error: e.message })
  }
})

// POST /api/agenda/agendamentos/:id/recusar
router.post('/agendamentos/:id/recusar', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `UPDATE agendamentos SET estado = 'recusado', updated_at = NOW() WHERE id = $1 AND estado = 'proposto' RETURNING *`,
      [req.params.id]
    )
    if (!rows.length) return res.status(404).json({ error: 'Agendamento não encontrado ou já processado' })
    res.json({ agendamento: rows[0] })
  } catch (e) {
    console.error('[agenda] recusar erro:', e)
    res.status(500).json({ error: e.message })
  }
})

// PUT /api/agenda/agendamentos/:id — reagendar antes de confirmar
router.put('/agendamentos/:id', async (req, res) => {
  try {
    const { data, hora_inicio, hora_fim } = req.body || {}
    if (!data || !hora_inicio || !hora_fim) {
      return res.status(400).json({ error: 'data, hora_inicio e hora_fim são obrigatórios' })
    }
    if (hora_fim <= hora_inicio) return res.status(400).json({ error: 'hora_fim tem de ser depois de hora_inicio' })
    const { rows } = await pool.query(
      `UPDATE agendamentos SET data = $1, hora_inicio = $2, hora_fim = $3, updated_at = NOW()
       WHERE id = $4 AND estado = 'proposto' RETURNING *`,
      [data, hora_inicio, hora_fim, req.params.id]
    )
    if (!rows.length) return res.status(404).json({ error: 'Agendamento não encontrado ou já confirmado' })
    res.json({ agendamento: rows[0] })
  } catch (e) {
    console.error('[agenda] reagendar erro:', e)
    res.status(500).json({ error: e.message })
  }
})

// POST /api/agenda/semana/:semanaInicio/confirmar-tudo
router.post('/semana/:semanaInicio/confirmar-tudo', async (req, res) => {
  try {
    const semanaInicio = req.params.semanaInicio
    const semanaFim = addDias(semanaInicio, 6)
    const { rows: propostos } = await pool.query(
      `SELECT * FROM agendamentos WHERE data >= $1 AND data <= $2 AND estado = 'proposto'`,
      [semanaInicio, semanaFim]
    )
    const email = userEmail(req)
    let confirmados = 0
    for (const ag of propostos) {
      await pool.query(
        `UPDATE agendamentos SET estado = 'confirmado', confirmado_em = NOW(), confirmado_por = $1, updated_at = NOW() WHERE id = $2`,
        [email, ag.id]
      )
      const { rows: tarefaRows } = await pool.query(
        `UPDATE tarefas SET inicio = $1, fim = $2, updated_at = NOW() WHERE id = $3 RETURNING origem_tipo, origem_campo, origem_id`,
        [`${ag.data}T${ag.hora_inicio}:00`, `${ag.data}T${ag.hora_fim}:00`, ag.tarefa_id]
      )
      const tarefa = tarefaRows[0]
      if (tarefa?.origem_tipo === 'imovel' && tarefa?.origem_campo === 'cadeia_cold_call') {
        await pool.query(`UPDATE imoveis SET data_chamada = $1 WHERE id = $2`, [ag.data, tarefa.origem_id])
      }
      confirmados++
    }
    res.json({ ok: true, confirmados })
  } catch (e) {
    console.error('[agenda] confirmar-tudo erro:', e)
    res.status(500).json({ error: e.message })
  }
})

export default router
