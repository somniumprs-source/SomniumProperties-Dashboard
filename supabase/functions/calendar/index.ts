// Edge Function "calendar" — port dos handlers app.*('/api/calendar/...') de
// server.js (~4020-4374) + helpers de src/db/calendarSync.js (calendarSync.ts).
//
// Cliente Google Calendar (gcal) construido a partir de env (getGcal):
//   GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET + GOOGLE_REFRESH_TOKEN -> OAuth2.
// Sem essas envs, getGcal() devolve null e os handlers replicam os fallbacks
// do original (status: gcal_ok=false; events: {events:[],total:0,gcal_ok:false};
// backfill: 503). NAO ha leitura de ficheiros de disco (google-credentials.json
// /google-token.json) — assume-se apenas env, conforme pedido.
//
// googleapis COMPILA em Deno (deno check exit 0) — Google API NAO foi stubbada.
import { createApp } from "../_shared/hono.ts";
import { requireAuth } from "../_shared/auth.ts";
import pool from "../_shared/pg.ts";
import { OAuth2Client } from "google-auth-library";
import { calendar } from "@googleapis/calendar";
import { oauth2 } from "@googleapis/oauth2";
import { pushAllTarefas, pullGCalToTarefas } from "./calendarSync.ts";

const app = createApp("/calendar");

// Auth em codigo: o gateway verify_jwt=true aceita a anon key (publica); requireAuth
// exige um utilizador REAL (rejeita anon), como o middleware global do Render. _health isento.
app.use("*", async (c: any, next: any) => {
  if (c.req.path.endsWith("/_health")) return await next();
  return await requireAuth(c, next);
});

const GCAL_ID = Deno.env.get("GOOGLE_CALENDAR_ID") || "somniumprs@gmail.com";

// Constroi o cliente Google Calendar a partir de env vars (OAuth2 / Render).
// Sem credenciais -> null (handlers replicam os fallbacks do original).
function getGcal(): any {
  const clientId = Deno.env.get("GOOGLE_CLIENT_ID");
  const clientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET");
  const refreshToken = Deno.env.get("GOOGLE_REFRESH_TOKEN");
  if (clientId && clientSecret && refreshToken) {
    try {
      const oauth2Client = new OAuth2Client(clientId, clientSecret, "http://localhost:3333");
      oauth2Client.setCredentials({ refresh_token: refreshToken });
      return calendar({ version: "v3", auth: oauth2Client });
    } catch (e) {
      console.warn("[gcal] Google Calendar não disponível:", (e as Error).message);
      return null;
    }
  }
  return null;
}

// Helper: segunda-feira da semana corrente em ISO (YYYY-MM-DD) — port server.js 4348-4354
function mondayOfCurrentWeek(): string {
  const d = new Date();
  const dow = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - dow);
  d.setHours(0, 0, 0, 0);
  return d.toISOString().slice(0, 10);
}

// ── GET /calendar/status (port server.js 4020-4081) ──
app.get("/status", async (c: any) => {
  const gcal = getGcal();
  const status: any = {
    gcal_ok: !!gcal,
    calendar_id: GCAL_ID,
    credentials_source: null,
  };
  // Origem das credenciais — sem leitura de disco (apenas env).
  if (Deno.env.get("GOOGLE_SERVICE_ACCOUNT_JSON")) status.credentials_source = "service_account_env";
  else if (Deno.env.get("GOOGLE_CLIENT_ID") && Deno.env.get("GOOGLE_REFRESH_TOKEN")) status.credentials_source = "oauth2_env";
  else status.credentials_source = "missing";

  if (gcal) {
    try {
      const r = await gcal.events.list({ calendarId: GCAL_ID, maxResults: 1 });
      status.can_read = true;
      status.sample_count = r.data.items?.length ?? 0;
    } catch (e: any) {
      status.can_read = false;
      status.read_error = e.message;
    }

    // Identificar a conta OAuth2 autenticada
    try {
      const oauth2Svc = oauth2({ version: "v2", auth: gcal.context._options.auth });
      const info = await oauth2Svc.userinfo.get();
      status.authenticated_as = info.data.email;
    } catch { /* ignore */ }

    // Metadados do calendario (confirmar acesso de escrita)
    try {
      const cal = await gcal.calendarList.get({ calendarId: GCAL_ID });
      status.calendar_access_role = cal.data.accessRole;
      status.calendar_summary = cal.data.summary;
    } catch (e: any) {
      status.calendar_access_error = e.message;
    }

    // Estatisticas de tarefas
    try {
      const monday = mondayOfCurrentWeek();
      const { rows: [row] } = await pool.query(
        `SELECT
          COUNT(*) FILTER (WHERE inicio IS NOT NULL) AS com_data,
          COUNT(*) FILTER (WHERE inicio IS NOT NULL AND inicio >= $1) AS desta_semana,
          COUNT(*) FILTER (WHERE inicio IS NOT NULL AND inicio >= $1 AND gcal_event_id IS NOT NULL) AS desta_semana_sincronizadas,
          COUNT(*) FILTER (WHERE inicio IS NOT NULL AND inicio >= $1 AND gcal_event_id IS NULL) AS desta_semana_pendentes
         FROM tarefas`,
        [monday],
      );
      status.tarefas = { monday_filter: monday, ...row };
    } catch (e: any) { status.tarefas_error = e.message; }
  }
  return c.json(status);
});

// ── POST /calendar/backfill (port server.js 4084-4147) — buildEventForDebug inline ──
app.post("/backfill", async (c: any) => {
  const gcal = getGcal();
  if (!gcal) return c.json({ error: "gcal nao configurado" }, 503);
  const internalKey = Deno.env.get("INTERNAL_API_KEY");
  if (internalKey && c.req.query("key") !== internalKey) {
    return c.json({ error: "forbidden" }, 403);
  }
  try {
    const monday = mondayOfCurrentWeek();
    const sinceDate = c.req.query("all") === "1" ? null : (c.req.query("since") || monday);
    const params: any[] = sinceDate ? [sinceDate] : [];
    const cond = sinceDate ? " AND inicio >= $1" : "";
    const { rows } = await pool.query(
      `SELECT * FROM tarefas WHERE gcal_event_id IS NULL AND inicio IS NOT NULL${cond}`,
      params,
    );

    const log: any[] = [];
    let created = 0, failed = 0;
    for (const t of rows) {
      const entry: any = {
        id: t.id,
        tarefa: t.tarefa,
        inicio_raw: t.inicio,
        status: t.status,
      };
      // Construir o evento localmente para expor erro detalhado (buildEventForDebug)
      let inicio = t.inicio instanceof Date ? t.inicio.toISOString() : String(t.inicio || "");
      if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(inicio)) inicio += ":00";
      const isDiaInteiro = /^\d{4}-\d{2}-\d{2}$/.test(inicio);
      let fim = t.fim instanceof Date ? t.fim.toISOString() : (t.fim ? String(t.fim) : null);
      if (fim && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(fim)) fim += ":00";
      if (!fim && !isDiaInteiro) {
        fim = new Date(new Date(inicio).getTime() + ((t.tempo_horas || 1) * 3600000)).toISOString();
      }
      const resource = isDiaInteiro
        ? {
          summary: t.tarefa,
          description: t.funcionario ? `Funcionário: ${t.funcionario}` : "",
          start: { date: inicio },
          end: { date: (fim || inicio).slice(0, 10) },
        }
        : {
          summary: t.tarefa,
          description: t.funcionario ? `Funcionário: ${t.funcionario}` : "",
          start: { dateTime: inicio, timeZone: "Europe/Lisbon" },
          end: { dateTime: fim, timeZone: "Europe/Lisbon" },
        };
      entry.resource = resource;
      try {
        const r = await gcal.events.insert({ calendarId: GCAL_ID, resource });
        const eventId = r.data.id;
        await pool.query(
          "UPDATE tarefas SET gcal_event_id = $1, gcal_synced_at = $2 WHERE id = $3",
          [eventId, new Date().toISOString(), t.id],
        );
        created++;
        entry.result = "created";
        entry.eventId = eventId;
      } catch (e: any) {
        failed++;
        entry.result = "error";
        entry.error = e.errors?.[0]?.message || e.response?.data?.error?.message || e.message;
        entry.code = e.code;
      }
      log.push(entry);
    }
    return c.json({ ok: true, sinceDate, candidatos: rows.length, created, failed, log });
  } catch (e: any) { return c.json({ error: e.message, stack: e.stack }, 500); }
});

// ── GET /calendar/events (port server.js 4150-4184) ──
app.get("/events", async (c: any) => {
  const gcal = getGcal();
  if (!gcal) return c.json({ events: [], total: 0, gcal_ok: false });
  try {
    const days = parseInt(c.req.query("days") ?? "") || 7;
    const past = parseInt(c.req.query("past") ?? "") || 0;
    const now = new Date();
    const timeMin = new Date(now);
    timeMin.setDate(timeMin.getDate() - past);
    const timeMax = new Date(now);
    timeMax.setDate(timeMax.getDate() + days);

    const r = await gcal.events.list({
      calendarId: GCAL_ID,
      timeMin: timeMin.toISOString(),
      timeMax: timeMax.toISOString(),
      singleEvents: true,
      orderBy: "startTime",
      maxResults: 100,
    });
    const events = (r.data.items ?? []).map((e: any) => ({
      id: e.id,
      titulo: e.summary || "(sem título)",
      descricao: e.description || "",
      inicio: e.start?.dateTime || e.start?.date,
      fim: e.end?.dateTime || e.end?.date,
      diaInteiro: !!e.start?.date && !e.start?.dateTime,
      local: e.location || "",
      link: e.htmlLink,
    }));
    return c.json({ events, total: events.length });
  } catch (e: any) {
    console.error("[gcal] events:", e.message);
    return c.json({ error: e.message }, 500);
  }
});

// ── POST /calendar/events (port server.js 4187-4211) ──
app.post("/events", async (c: any) => {
  const gcal = getGcal();
  if (!gcal) return c.json({ error: "Google Calendar não configurado" }, 503);
  try {
    const { titulo, descricao, inicio, fim, diaInteiro } = await c.req.json().catch(() => ({}));
    if (!titulo || !inicio) return c.json({ error: "titulo e inicio são obrigatórios" }, 400);

    const event: any = {
      summary: titulo,
      description: descricao || "",
    };
    if (diaInteiro) {
      event.start = { date: inicio.slice(0, 10) };
      event.end = { date: (fim || inicio).slice(0, 10) };
    } else {
      event.start = { dateTime: inicio, timeZone: "Europe/Lisbon" };
      event.end = { dateTime: fim || new Date(new Date(inicio).getTime() + 3600000).toISOString(), timeZone: "Europe/Lisbon" };
    }

    const r = await gcal.events.insert({ calendarId: GCAL_ID, resource: event });
    return c.json({ ok: true, eventId: r.data.id, link: r.data.htmlLink });
  } catch (e: any) {
    console.error("[gcal] create:", e.message);
    return c.json({ error: e.message }, 500);
  }
});

// ── POST /calendar/sync — push + pull bidirecional (port server.js 4357-4365) ──
app.post("/sync", async (c: any) => {
  try {
    const gcal = getGcal();
    const sinceDate = c.req.query("all") === "1" ? undefined : (c.req.query("since") || mondayOfCurrentWeek());
    const push = await pushAllTarefas(gcal, GCAL_ID, { sinceDate });
    const pull = await pullGCalToTarefas(gcal, GCAL_ID, { days: parseInt(c.req.query("days") ?? "") || 30 });
    return c.json({ ok: true, sinceDate: sinceDate || null, push, pull });
  } catch (e: any) { return c.json({ error: e.message }, 500); }
});

// ── POST /calendar/pull — pull GCal -> tarefas (port server.js 4368-4374) ──
app.post("/pull", async (c: any) => {
  try {
    const gcal = getGcal();
    const result = await pullGCalToTarefas(gcal, GCAL_ID, { days: parseInt(c.req.query("days") ?? "") || 30 });
    return c.json({ ok: true, ...result });
  } catch (e: any) { return c.json({ error: e.message }, 500); }
});

app.get("/_health", (c) => c.json({ ok: true, fn: "calendar" }));

Deno.serve(app.fetch);
