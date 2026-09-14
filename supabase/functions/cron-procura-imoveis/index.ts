import pool from "../_shared/pg.ts";
import { runProcuraImoveis } from "../_shared/cronJobs.ts";

const INTERNAL_API_KEY = Deno.env.get("INTERNAL_API_KEY") || "";

// Hora local de Lisboa (DST-safe) via Intl.
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
    return Response.json({ ok: true, fn: "cron-procura-imoveis" });
  }
  if (INTERNAL_API_KEY && req.headers.get("x-api-key") !== INTERNAL_API_KEY) {
    return new Response("forbidden", { status: 403 });
  }

  // Janela horaria Lisboa: pesquisa diaria de imoveis (SOP 1) as 7h — mesma
  // hora do antigo LaunchAgent com.somnium.search-properties.
  const t = lisbon();
  if (t.hour !== 7) {
    return Response.json({ ok: true, ran: false, reason: "fora da janela", fn: "cron-procura-imoveis" });
  }

  // Re-entrancia: advisory lock.
  const lockKey = 90014;
  const { rows } = await pool.query("SELECT pg_try_advisory_lock($1) AS got", [lockKey]);
  if (!rows[0]?.got) return Response.json({ ok: true, ran: false, reason: "lock ocupado" });
  try {
    const resultado = await runProcuraImoveis();
    return Response.json({ ok: true, ran: true, fn: "cron-procura-imoveis", ...resultado });
  } catch (e) {
    console.error("[cron-procura-imoveis]", (e as Error).message);
    return Response.json({ ok: false, error: (e as Error).message }, { status: 500 });
  } finally {
    await pool.query("SELECT pg_advisory_unlock($1)", [lockKey]);
  }
});
