import pool from "../_shared/pg.ts";
import { OAuth2Client } from "google-auth-library";
import { calendar } from "@googleapis/calendar";
import { pullGCalToTarefas, pushAllTarefas } from "../calendar/calendarSync.ts";

const INTERNAL_API_KEY = Deno.env.get("INTERNAL_API_KEY") || "";
// GCAL_ID: usa GCAL_ID, com fallback para GOOGLE_CALENDAR_ID (env usada na fn `calendar`).
const GCAL_ID = Deno.env.get("GCAL_ID") || Deno.env.get("GOOGLE_CALENDAR_ID") || "somniumprs@gmail.com";

// Cliente Google Calendar (gcal) construido de env (OAuth2). Sem credenciais -> null.
function getGcal(): any {
  const clientId = Deno.env.get("GOOGLE_CLIENT_ID");
  const clientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET");
  const refreshToken = Deno.env.get("GOOGLE_REFRESH_TOKEN");
  if (clientId && clientSecret && refreshToken) {
    try {
      const oauth2 = new OAuth2Client(clientId, clientSecret, "http://localhost:3333");
      oauth2.setCredentials({ refresh_token: refreshToken });
      return calendar({ version: "v3", auth: oauth2 });
    } catch (e) {
      console.warn("[cron-sync-calendar] Google Calendar não disponível:", (e as Error).message);
      return null;
    }
  }
  return null;
}

// Segunda-feira da semana corrente em ISO (YYYY-MM-DD).
function mondayOfCurrentWeek(): string {
  const d = new Date();
  const dow = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - dow);
  d.setHours(0, 0, 0, 0);
  return d.toISOString().slice(0, 10);
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  if (req.method === "GET" && url.searchParams.get("health") === "1") {
    return Response.json({ ok: true, fn: "cron-sync-calendar" });
  }
  if (INTERNAL_API_KEY && req.headers.get("x-api-key") !== INTERNAL_API_KEY) {
    return new Response("forbidden", { status: 403 });
  }

  // SEM janela horaria — corre sempre (pg_cron */15). No-op se gcal nao configurado.
  const gcal = getGcal();
  if (!gcal) {
    return Response.json({ ok: true, ran: false, reason: "gcal nao configurado", fn: "cron-sync-calendar" });
  }

  const lockKey = 90009;
  const { rows } = await pool.query("SELECT pg_try_advisory_lock($1) AS got", [lockKey]);
  if (!rows[0]?.got) return Response.json({ ok: true, ran: false, reason: "lock ocupado" });
  try {
    const push = await pushAllTarefas(gcal, GCAL_ID, { sinceDate: mondayOfCurrentWeek() });
    const pull = await pullGCalToTarefas(gcal, GCAL_ID, { days: 30 });
    return Response.json({ ok: true, ran: true, push, pull, fn: "cron-sync-calendar" });
  } catch (e) {
    console.error("[cron-sync-calendar]", (e as Error).message);
    return Response.json({ ok: false, error: (e as Error).message }, { status: 500 });
  } finally {
    await pool.query("SELECT pg_advisory_unlock($1)", [lockKey]);
  }
});
