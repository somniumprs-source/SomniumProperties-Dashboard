/**
 * Sync bidirecional Tarefas ↔ Google Calendar.
 *
 * PUSH: tarefa criada/atualizada/apagada → cria/atualiza/apaga evento GCal
 * PULL: eventos GCal novos/alterados → cria/atualiza tarefas
 *
 * Usa gcal_event_id para manter a ligação persistente.
 */
import pool from './pg.js'

const GCAL_TZ = 'Europe/Lisbon'

// ── PUSH: Tarefa → Google Calendar ──────────────────────────

/**
 * Cria evento no GCal a partir de uma tarefa.
 * Guarda o gcal_event_id na tarefa.
 */
export async function pushTarefaToGCal(gcal, calendarId, tarefa) {
  if (!gcal || !tarefa.inicio) return null
  try {
    const event = buildEvent(tarefa)
    const r = await gcal.events.insert({ calendarId, resource: event })
    const eventId = r.data.id
    // Guardar referência
    await pool.query(
      'UPDATE tarefas SET gcal_event_id = $1, gcal_synced_at = $2 WHERE id = $3',
      [eventId, new Date().toISOString(), tarefa.id]
    )
    console.log(`[gcal-sync] PUSH criado: "${tarefa.tarefa}" → ${eventId}`)
    return eventId
  } catch (e) {
    console.error('[gcal-sync] PUSH criar erro:', e.message)
    return null
  }
}

/**
 * Atualiza evento existente no GCal.
 */
export async function updateGCalEvent(gcal, calendarId, tarefa) {
  if (!gcal || !tarefa.gcal_event_id) return false
  try {
    const event = buildEvent(tarefa)
    await gcal.events.update({
      calendarId,
      eventId: tarefa.gcal_event_id,
      resource: event,
    })
    await pool.query(
      'UPDATE tarefas SET gcal_synced_at = $1 WHERE id = $2',
      [new Date().toISOString(), tarefa.id]
    )
    console.log(`[gcal-sync] PUSH atualizado: "${tarefa.tarefa}" → ${tarefa.gcal_event_id}`)
    return true
  } catch (e) {
    // Se evento não existe no GCal (apagado manualmente), criar novo
    if (e.code === 404 || e.message?.includes('Not Found')) {
      console.warn(`[gcal-sync] Evento ${tarefa.gcal_event_id} não existe, a criar novo...`)
      await pool.query('UPDATE tarefas SET gcal_event_id = NULL WHERE id = $1', [tarefa.id])
      return pushTarefaToGCal(gcal, calendarId, { ...tarefa, gcal_event_id: null })
    }
    console.error('[gcal-sync] PUSH atualizar erro:', e.message)
    return false
  }
}

/**
 * Apaga evento do GCal quando tarefa é apagada.
 */
export async function deleteGCalEvent(gcal, calendarId, gcalEventId) {
  if (!gcal || !gcalEventId) return false
  try {
    await gcal.events.delete({ calendarId, eventId: gcalEventId })
    console.log(`[gcal-sync] PUSH apagado: ${gcalEventId}`)
    return true
  } catch (e) {
    // Ignorar se já não existe
    if (e.code === 404 || e.code === 410) return true
    console.error('[gcal-sync] PUSH apagar erro:', e.message)
    return false
  }
}

// ── PULL: Google Calendar → Tarefas ─────────────────────────

/**
 * Sincroniza eventos do GCal para a tabela tarefas.
 * - Eventos novos (sem match por gcal_event_id) → cria tarefa
 * - Eventos alterados (updated > gcal_synced_at) → atualiza tarefa
 * - Eventos cancelados → marca tarefa como Concluida
 */
export async function pullGCalToTarefas(gcal, calendarId, { days = 30 } = {}) {
  if (!gcal) return { created: 0, updated: 0, skipped: 0 }

  const now = new Date()
  const timeMin = new Date(now)
  timeMin.setDate(timeMin.getDate() - 7) // incluir última semana
  const timeMax = new Date(now)
  timeMax.setDate(timeMax.getDate() + days)

  let created = 0, updated = 0, skipped = 0

  try {
    const r = await gcal.events.list({
      calendarId,
      timeMin: timeMin.toISOString(),
      timeMax: timeMax.toISOString(),
      singleEvents: true,
      orderBy: 'startTime',
      maxResults: 250,
      showDeleted: true,
    })

    const events = r.data.items ?? []

    for (const event of events) {
      if (!event.summary) continue // ignorar eventos sem título

      const eventId = event.id
      const inicio = event.start?.dateTime || event.start?.date || null
      const fim = event.end?.dateTime || event.end?.date || null
      const titulo = event.summary
      const descricao = event.description || ''
      const cancelled = event.status === 'cancelled'

      // Procurar tarefa existente com este gcal_event_id
      const { rows: [existing] } = await pool.query(
        'SELECT * FROM tarefas WHERE gcal_event_id = $1', [eventId]
      )

      if (cancelled) {
        // Evento cancelado no GCal → marcar tarefa como concluída
        if (existing && existing.status !== 'Concluida') {
          await pool.query(
            'UPDATE tarefas SET status = $1, gcal_synced_at = $2, updated_at = $3 WHERE id = $4',
            ['Concluida', new Date().toISOString(), new Date().toISOString(), existing.id]
          )
          updated++
        }
        continue
      }

      if (existing) {
        // Verificar se o evento foi alterado depois do último sync
        const eventUpdated = new Date(event.updated || event.created)
        const lastSync = existing.gcal_synced_at ? new Date(existing.gcal_synced_at) : new Date(0)

        if (eventUpdated > lastSync) {
          // Atualizar tarefa com dados do GCal
          const horas = inicio && fim ? Math.max(0, (new Date(fim) - new Date(inicio)) / 3600000) : 0
          // Extrair funcionário da descrição se existir
          const funcMatch = descricao.match(/Funcion[aá]rio:\s*(.+)/i)
          const funcionario = funcMatch ? funcMatch[1].trim() : existing.funcionario

          await pool.query(
            `UPDATE tarefas SET tarefa = $1, inicio = $2, fim = $3, tempo_horas = $4,
             funcionario = $5, gcal_synced_at = $6, updated_at = $7
             WHERE id = $8`,
            [titulo, inicio, fim, Math.round(horas * 100) / 100,
             funcionario, new Date().toISOString(), new Date().toISOString(), existing.id]
          )
          updated++
        } else {
          skipped++
        }
      } else {
        // Verificar se já existe uma tarefa com o mesmo título e data (evitar duplicados)
        const { rows: [duplicate] } = await pool.query(
          "SELECT id FROM tarefas WHERE tarefa = $1 AND inicio = $2 AND gcal_event_id IS NULL",
          [titulo, inicio]
        )

        if (duplicate) {
          // Ligar a tarefa existente ao evento
          await pool.query(
            'UPDATE tarefas SET gcal_event_id = $1, gcal_synced_at = $2 WHERE id = $3',
            [eventId, new Date().toISOString(), duplicate.id]
          )
          skipped++
          continue
        }

        // Criar nova tarefa a partir do evento
        const id = (await import('crypto')).then(m => m.randomUUID())
        const uuid = await id
        const nowStr = new Date().toISOString()
        const horas = inicio && fim ? Math.max(0, (new Date(fim) - new Date(inicio)) / 3600000) : 0
        const funcMatch = descricao.match(/Funcion[aá]rio:\s*(.+)/i)

        await pool.query(
          `INSERT INTO tarefas (id, tarefa, status, inicio, fim, funcionario, tempo_horas,
           gcal_event_id, gcal_synced_at, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
          [uuid, titulo, 'A fazer', inicio, fim,
           funcMatch ? funcMatch[1].trim() : null,
           Math.round(horas * 100) / 100,
           eventId, nowStr, nowStr, nowStr]
        )
        created++
      }
    }

    console.log(`[gcal-sync] PULL: ${created} criadas, ${updated} atualizadas, ${skipped} inalteradas`)
  } catch (e) {
    console.error('[gcal-sync] PULL erro:', e.message)
  }

  return { created, updated, skipped }
}

/**
 * Push-only: Tarefas → GCal (GCal é espelho).
 * sinceDate (ISO YYYY-MM-DD) — se definido, só migra tarefas com inicio >= sinceDate.
 */
export async function pushAllTarefas(gcal, calendarId, { sinceDate } = {}) {
  if (!gcal) return { created: 0, updated: 0, skipped: 0 }

  const params = []
  let dateCond = ''
  if (sinceDate) {
    params.push(sinceDate)
    dateCond = ` AND inicio >= $${params.length}`
  }

  // 1. Tarefas com data mas sem gcal_event_id (criar)
  const { rows: unsynced } = await pool.query(
    `SELECT * FROM tarefas WHERE gcal_event_id IS NULL AND inicio IS NOT NULL${dateCond}`,
    params
  )
  let created = 0
  for (const t of unsynced) {
    const eventId = await pushTarefaToGCal(gcal, calendarId, t)
    if (eventId) created++
  }

  // 2. Tarefas alteradas depois do último sync (atualizar evento existente)
  const { rows: stale } = await pool.query(
    `SELECT * FROM tarefas WHERE gcal_event_id IS NOT NULL
     AND updated_at > COALESCE(gcal_synced_at, '1970-01-01')${dateCond}`,
    params
  )
  let updated = 0
  for (const t of stale) {
    const ok = await updateGCalEvent(gcal, calendarId, t)
    if (ok) updated++
  }

  return { created, updated, skipped: 0 }
}

/**
 * @deprecated — mantido apenas como escape hatch manual. GCal é espelho (push-only).
 * Sincronização bidirecional desligada para evitar que eventos criados no GCal
 * criem tarefas na app.
 */
export async function fullSync(gcal, calendarId, options = {}) {
  const push = await pushAllTarefas(gcal, calendarId, options)
  return { push: { synced: push.created + push.updated }, pull: { created: 0, updated: 0, skipped: 0 } }
}

// ── Helpers ─────────────────────────────────────────────────

function buildEvent(tarefa) {
  const isDiaInteiro = tarefa.inicio && tarefa.inicio.length === 10 // YYYY-MM-DD

  const event = {
    summary: tarefa.tarefa,
    description: tarefa.funcionario ? `Funcionário: ${tarefa.funcionario}` : '',
  }

  if (isDiaInteiro) {
    event.start = { date: tarefa.inicio }
    event.end = { date: tarefa.fim || tarefa.inicio }
  } else {
    event.start = { dateTime: tarefa.inicio, timeZone: GCAL_TZ }
    const fim = tarefa.fim || new Date(
      new Date(tarefa.inicio).getTime() + (tarefa.tempo_horas || 1) * 3600000
    ).toISOString()
    event.end = { dateTime: fim, timeZone: GCAL_TZ }
  }

  // Cor baseada no status
  if (tarefa.status === 'Concluida') event.colorId = '2' // verde
  else if (tarefa.status === 'Atrasada') event.colorId = '11' // vermelho
  else if (tarefa.status === 'Em progresso') event.colorId = '5' // amarelo

  return event
}
