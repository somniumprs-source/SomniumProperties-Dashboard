// Port de src/db/calendarSync.js — sync bidirecional Tarefas <-> Google Calendar.
// Usa pool (pg.ts) e o cliente gcal (googleapis) passado por argumento.
// crypto.randomUUID() e global no Deno (substitui o import('crypto')).
import pool from "../_shared/pg.ts";

const GCAL_TZ = "Europe/Lisbon";

// ── PUSH: Tarefa -> Google Calendar ──────────────────────────
export async function pushTarefaToGCal(gcal: any, calendarId: string, tarefa: any): Promise<string | null> {
  if (!gcal || !tarefa.inicio) return null;
  try {
    const event = buildEvent(tarefa);
    const r = await gcal.events.insert({ calendarId, resource: event });
    const eventId = r.data.id;
    await pool.query(
      "UPDATE tarefas SET gcal_event_id = $1, gcal_synced_at = $2 WHERE id = $3",
      [eventId, new Date().toISOString(), tarefa.id],
    );
    console.log(`[gcal-sync] PUSH criado: "${tarefa.tarefa}" → ${eventId}`);
    return eventId;
  } catch (e: any) {
    const detail = e.errors?.[0]?.message || e.response?.data?.error?.message || e.message;
    console.error(`[gcal-sync] PUSH erro "${tarefa.tarefa}":`, detail);
    return null;
  }
}

export async function updateGCalEvent(gcal: any, calendarId: string, tarefa: any): Promise<boolean | string | null> {
  if (!gcal || !tarefa.gcal_event_id) return false;
  try {
    const event = buildEvent(tarefa);
    await gcal.events.update({ calendarId, eventId: tarefa.gcal_event_id, resource: event });
    await pool.query(
      "UPDATE tarefas SET gcal_synced_at = $1 WHERE id = $2",
      [new Date().toISOString(), tarefa.id],
    );
    console.log(`[gcal-sync] PUSH atualizado: "${tarefa.tarefa}" → ${tarefa.gcal_event_id}`);
    return true;
  } catch (e: any) {
    if (e.code === 404 || e.message?.includes("Not Found")) {
      console.warn(`[gcal-sync] Evento ${tarefa.gcal_event_id} não existe, a criar novo...`);
      await pool.query("UPDATE tarefas SET gcal_event_id = NULL WHERE id = $1", [tarefa.id]);
      return pushTarefaToGCal(gcal, calendarId, { ...tarefa, gcal_event_id: null });
    }
    console.error("[gcal-sync] PUSH atualizar erro:", e.message);
    return false;
  }
}

export async function deleteGCalEvent(gcal: any, calendarId: string, gcalEventId: string): Promise<boolean> {
  if (!gcal || !gcalEventId) return false;
  try {
    await gcal.events.delete({ calendarId, eventId: gcalEventId });
    console.log(`[gcal-sync] PUSH apagado: ${gcalEventId}`);
    return true;
  } catch (e: any) {
    if (e.code === 404 || e.code === 410) return true;
    console.error("[gcal-sync] PUSH apagar erro:", e.message);
    return false;
  }
}

// ── PULL: Google Calendar -> Tarefas ─────────────────────────
export async function pullGCalToTarefas(gcal: any, calendarId: string, { days = 30 }: { days?: number } = {}) {
  if (!gcal) return { created: 0, updated: 0, skipped: 0 };

  const now = new Date();
  const timeMin = new Date(now);
  timeMin.setDate(timeMin.getDate() - 7);
  const timeMax = new Date(now);
  timeMax.setDate(timeMax.getDate() + days);

  let created = 0, updated = 0, skipped = 0;

  try {
    const r = await gcal.events.list({
      calendarId,
      timeMin: timeMin.toISOString(),
      timeMax: timeMax.toISOString(),
      singleEvents: true,
      orderBy: "startTime",
      maxResults: 250,
      showDeleted: true,
    });

    const events = r.data.items ?? [];

    for (const event of events) {
      if (!event.summary) continue;

      const eventId = event.id;
      const inicio = event.start?.dateTime || event.start?.date || null;
      const fim = event.end?.dateTime || event.end?.date || null;
      const titulo = event.summary;
      const descricao = event.description || "";
      const cancelled = event.status === "cancelled";

      const { rows: [existing] } = await pool.query("SELECT * FROM tarefas WHERE gcal_event_id = $1", [eventId]);

      if (cancelled) {
        if (existing && existing.status !== "Concluida") {
          await pool.query(
            "UPDATE tarefas SET status = $1, gcal_synced_at = $2, updated_at = $3 WHERE id = $4",
            ["Concluida", new Date().toISOString(), new Date().toISOString(), existing.id],
          );
          updated++;
        }
        continue;
      }

      if (existing) {
        const eventUpdated = new Date(event.updated || event.created);
        const lastSync = existing.gcal_synced_at ? new Date(existing.gcal_synced_at) : new Date(0);

        if (eventUpdated > lastSync) {
          const horas = inicio && fim ? Math.max(0, (new Date(fim).getTime() - new Date(inicio).getTime()) / 3600000) : 0;
          const funcMatch = descricao.match(/Funcion[aá]rio:\s*(.+)/i);
          const funcionario = funcMatch ? funcMatch[1].trim() : existing.funcionario;

          await pool.query(
            `UPDATE tarefas SET tarefa = $1, inicio = $2, fim = $3, tempo_horas = $4,
             funcionario = $5, gcal_synced_at = $6, updated_at = $7
             WHERE id = $8`,
            [titulo, inicio, fim, Math.round(horas * 100) / 100, funcionario, new Date().toISOString(), new Date().toISOString(), existing.id],
          );
          updated++;
        } else {
          skipped++;
        }
      } else {
        const { rows: [duplicate] } = await pool.query(
          "SELECT id FROM tarefas WHERE tarefa = $1 AND inicio = $2 AND gcal_event_id IS NULL",
          [titulo, inicio],
        );

        if (duplicate) {
          await pool.query(
            "UPDATE tarefas SET gcal_event_id = $1, gcal_synced_at = $2 WHERE id = $3",
            [eventId, new Date().toISOString(), duplicate.id],
          );
          skipped++;
          continue;
        }

        const uuid = crypto.randomUUID();
        const nowStr = new Date().toISOString();
        const horas = inicio && fim ? Math.max(0, (new Date(fim).getTime() - new Date(inicio).getTime()) / 3600000) : 0;
        const funcMatch = descricao.match(/Funcion[aá]rio:\s*(.+)/i);

        await pool.query(
          `INSERT INTO tarefas (id, tarefa, status, inicio, fim, funcionario, tempo_horas,
           gcal_event_id, gcal_synced_at, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
          [uuid, titulo, "A fazer", inicio, fim, funcMatch ? funcMatch[1].trim() : null, Math.round(horas * 100) / 100, eventId, nowStr, nowStr, nowStr],
        );
        created++;
      }
    }

    console.log(`[gcal-sync] PULL: ${created} criadas, ${updated} atualizadas, ${skipped} inalteradas`);
  } catch (e: any) {
    console.error("[gcal-sync] PULL erro:", e.message);
  }

  return { created, updated, skipped };
}

// Push-only: Tarefas -> GCal (GCal e espelho).
export async function pushAllTarefas(gcal: any, calendarId: string, { sinceDate }: { sinceDate?: string } = {}) {
  if (!gcal) return { created: 0, updated: 0, skipped: 0 };

  const params: any[] = [];
  let dateCond = "";
  if (sinceDate) {
    params.push(sinceDate);
    dateCond = ` AND inicio >= $${params.length}`;
  }

  const { rows: unsynced } = await pool.query(
    `SELECT * FROM tarefas WHERE gcal_event_id IS NULL AND inicio IS NOT NULL${dateCond}`,
    params,
  );
  let created = 0;
  for (const t of unsynced) {
    const eventId = await pushTarefaToGCal(gcal, calendarId, t);
    if (eventId) created++;
  }

  const { rows: stale } = await pool.query(
    `SELECT * FROM tarefas WHERE gcal_event_id IS NOT NULL
     AND updated_at > COALESCE(gcal_synced_at, '1970-01-01')${dateCond}`,
    params,
  );
  let updated = 0;
  for (const t of stale) {
    const ok = await updateGCalEvent(gcal, calendarId, t);
    if (ok) updated++;
  }

  return { created, updated, skipped: 0 };
}

export async function fullSync(gcal: any, calendarId: string, options: any = {}) {
  const push = await pushAllTarefas(gcal, calendarId, options);
  const pull = await pullGCalToTarefas(gcal, calendarId, { days: options.days ?? 30 });
  return { push, pull };
}

// ── Helpers ─────────────────────────────────────────────────
function normaliseDateTime(v: any): string | null {
  if (!v) return null;
  if (v instanceof Date) return v.toISOString();
  let s = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(s)) s += ":00";
  return s;
}

function buildEvent(tarefa: any): any {
  const inicioStr = tarefa.inicio instanceof Date ? tarefa.inicio.toISOString() : String(tarefa.inicio || "");
  const isDiaInteiro = /^\d{4}-\d{2}-\d{2}$/.test(inicioStr);

  const event: any = {
    summary: tarefa.tarefa,
    description: tarefa.funcionario ? `Funcionário: ${tarefa.funcionario}` : "",
  };

  if (isDiaInteiro) {
    const fimStr = tarefa.fim instanceof Date ? tarefa.fim.toISOString().slice(0, 10) : String(tarefa.fim || inicioStr);
    event.start = { date: inicioStr };
    event.end = { date: fimStr.slice(0, 10) };
  } else {
    const inicio = normaliseDateTime(tarefa.inicio);
    let fim = normaliseDateTime(tarefa.fim);
    if (!fim) {
      fim = new Date(new Date(inicio as string).getTime() + (tarefa.tempo_horas || 1) * 3600000).toISOString();
    }
    event.start = { dateTime: inicio, timeZone: GCAL_TZ };
    event.end = { dateTime: fim, timeZone: GCAL_TZ };
  }

  const status = (tarefa.status || "").toLowerCase();
  if (status.startsWith("conclu")) event.colorId = "2";
  else if (status.startsWith("atrasad")) event.colorId = "11";
  else if (status.startsWith("em ")) event.colorId = "5";

  return event;
}
