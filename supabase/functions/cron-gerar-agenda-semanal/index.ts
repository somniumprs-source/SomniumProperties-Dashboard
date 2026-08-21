import pool from "../_shared/pg.ts";
import { runGerarAgendaSemanal } from "../_shared/cronJobs.ts";

const INTERNAL_API_KEY = Deno.env.get("INTERNAL_API_KEY") || "";

function lisbon() {
  const f = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Lisbon",
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    hour12: false,
  }).formatToParts(new Date());
  const get = (t: string) => f.find((p) => p.type === t)?.value || "";
  return {
    weekday: get("weekday"),
    day: parseInt(get("day")),
    month: parseInt(get("month")),
    hour: parseInt(get("hour")),
  };
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  if (req.method === "GET" && url.searchParams.get("health") === "1") {
    return Response.json({ ok: true, fn: "cron-gerar-agenda-semanal" });
  }
  if (INTERNAL_API_KEY && req.headers.get("x-api-key") !== INTERNAL_API_KEY) {
    return new Response("forbidden", { status: 403 });
  }

  // Janela horaria Lisboa: pré-gerar a agenda Domingo às 20h, depois de a
  // equipa ter tido o dia para marcar disponibilidade da semana seguinte.
  const t = lisbon();
  if (!(t.weekday === "Sun" && t.hour === 20)) {
    return Response.json({ ok: true, ran: false, reason: "fora da janela", fn: "cron-gerar-agenda-semanal" });
  }

  const lockKey = 90013;
  const { rows } = await pool.query("SELECT pg_try_advisory_lock($1) AS got", [lockKey]);
  if (!rows[0]?.got) return Response.json({ ok: true, ran: false, reason: "lock ocupado" });
  try {
    const resultado = await runGerarAgendaSemanal();
    return Response.json({ ok: true, ran: true, fn: "cron-gerar-agenda-semanal", ...resultado });
  } catch (e) {
    console.error("[cron-gerar-agenda-semanal]", (e as Error).message);
    return Response.json({ ok: false, error: (e as Error).message }, { status: 500 });
  } finally {
    await pool.query("SELECT pg_advisory_unlock($1)", [lockKey]);
  }
});
