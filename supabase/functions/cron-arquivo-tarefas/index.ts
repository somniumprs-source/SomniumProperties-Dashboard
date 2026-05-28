import pool from "../_shared/pg.ts";
import { arquivarTarefasAntigas } from "../_shared/tarefasArquivo.ts";

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
    return Response.json({ ok: true, fn: "cron-arquivo-tarefas" });
  }
  if (INTERNAL_API_KEY && req.headers.get("x-api-key") !== INTERNAL_API_KEY) {
    return new Response("forbidden", { status: 403 });
  }

  // Janela horaria Lisboa: arquivamento trimestral dia 1 de Jan/Abr/Jul/Out 03h.
  const t = lisbon();
  if (!(t.day === 1 && [1, 4, 7, 10].includes(t.month) && t.hour === 3)) {
    return Response.json({ ok: true, ran: false, reason: "fora da janela", fn: "cron-arquivo-tarefas" });
  }

  const lockKey = 90007;
  const { rows } = await pool.query("SELECT pg_try_advisory_lock($1) AS got", [lockKey]);
  if (!rows[0]?.got) return Response.json({ ok: true, ran: false, reason: "lock ocupado" });
  try {
    const n = await arquivarTarefasAntigas(90);
    console.log(`[cron-arquivo-tarefas] Tarefas arquivadas (>90 dias): ${n}`);
    return Response.json({ ok: true, ran: true, arquivadas: n, fn: "cron-arquivo-tarefas" });
  } catch (e) {
    console.error("[cron-arquivo-tarefas]", (e as Error).message);
    return Response.json({ ok: false, error: (e as Error).message }, { status: 500 });
  } finally {
    await pool.query("SELECT pg_advisory_unlock($1)", [lockKey]);
  }
});
