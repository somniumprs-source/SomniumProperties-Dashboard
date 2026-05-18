/**
 * Push de fases e tarefas de um projecto Fix and Flip para o Google Calendar.
 * Funciona on-demand (botão no UI). Não é sync bidirecional contínuo.
 * Marca eventos com [Somnium · {projeto}] para identificação visual.
 */
import pool from './pg.js'

const GCAL_TZ = 'Europe/Lisbon'

function dataAllDay(dateStr) {
  // GCal all-day: date no formato YYYY-MM-DD, end exclusivo (dia seguinte)
  if (!dateStr) return null
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return null
  const iso = d.toISOString().slice(0, 10)
  const nextDay = new Date(d.getTime() + 86400000).toISOString().slice(0, 10)
  return { start: { date: iso }, end: { date: nextDay } }
}

async function upsertEvent(gcal, calendarId, eventId, payload) {
  if (eventId) {
    try {
      await gcal.events.update({ calendarId, eventId, resource: payload })
      return eventId
    } catch (e) {
      if (e.code !== 404) throw e
      // Evento apagado manualmente — criar novo
    }
  }
  const r = await gcal.events.insert({ calendarId, resource: payload })
  return r.data.id
}

export async function pushProjetoToGCal({ gcal, calendarId, negocioId }) {
  if (!gcal || !calendarId) return { ok: false, error: 'GCal não configurado' }

  // Carregar projecto, fases, tarefas
  const { rows: negs } = await pool.query('SELECT id, movimento FROM negocios WHERE id = $1', [negocioId])
  if (!negs.length) return { ok: false, error: 'Projecto não encontrado' }
  const negocio = negs[0]
  const tag = `[Somnium · ${negocio.movimento}]`

  const { rows: fases } = await pool.query(
    `SELECT * FROM projeto_fases WHERE negocio_id = $1 AND data_fim_prevista IS NOT NULL ORDER BY ordem`,
    [negocioId]
  )
  const faseIds = fases.map(f => f.id)
  const tarefas = faseIds.length > 0
    ? (await pool.query(
        `SELECT t.*, f.nome AS fase_nome FROM projeto_tarefas t
         JOIN projeto_fases f ON t.fase_id = f.id
         WHERE f.negocio_id = $1 AND t.deadline IS NOT NULL`,
        [negocioId]
      )).rows
    : []

  let stats = { fasesCriadas: 0, fasesAtualizadas: 0, tarefasCriadas: 0, tarefasAtualizadas: 0, erros: 0 }

  // Push fases
  for (const f of fases) {
    if (f.estado === 'concluida') continue
    const dt = dataAllDay(f.data_fim_prevista)
    if (!dt) continue
    const payload = {
      summary: `${tag} ${f.nome} (fim previsto)`,
      description: `Fase: ${f.nome}\nEstado: ${f.estado}\nProgresso: ${f.perc_execucao || 0}%\nProjecto: ${negocio.movimento}\nSomnium Properties`,
      ...dt,
    }
    try {
      const eventId = await upsertEvent(gcal, calendarId, f.gcal_event_id, payload)
      if (eventId !== f.gcal_event_id) {
        await pool.query('UPDATE projeto_fases SET gcal_event_id = $1 WHERE id = $2', [eventId, f.id])
        stats.fasesCriadas++
      } else stats.fasesAtualizadas++
    } catch (e) {
      console.error(`[projeto-gcal] fase "${f.nome}":`, e.message)
      stats.erros++
    }
  }

  // Push tarefas
  for (const t of tarefas) {
    if (t.concluida) continue
    const dt = dataAllDay(t.deadline)
    if (!dt) continue
    const payload = {
      summary: `${tag} ${t.descricao}`,
      description: `Tarefa: ${t.descricao}\nFase: ${t.fase_nome}\nProjecto: ${negocio.movimento}\n${t.responsavel ? `Responsável: ${t.responsavel}\n` : ''}Somnium Properties`,
      ...dt,
    }
    try {
      const eventId = await upsertEvent(gcal, calendarId, t.gcal_event_id, payload)
      if (eventId !== t.gcal_event_id) {
        await pool.query('UPDATE projeto_tarefas SET gcal_event_id = $1 WHERE id = $2', [eventId, t.id])
        stats.tarefasCriadas++
      } else stats.tarefasAtualizadas++
    } catch (e) {
      console.error(`[projeto-gcal] tarefa "${t.descricao}":`, e.message)
      stats.erros++
    }
  }

  return { ok: true, ...stats }
}
