import pool from "../_shared/pg.ts";
import { runRelatorioDiarioSlack } from "../_shared/slackRelatorioDiario.ts";

const INTERNAL_API_KEY = Deno.env.get("INTERNAL_API_KEY") || "";

function lisbon() {
  const f = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Lisbon",
    hour: "2-digit",
    hour12: false,
  }).formatToParts(new Date());
  const get = (t: string) => f.find((p) => p.type === t)?.value || "";
  return { hour: parseInt(get("hour")) };
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  if (req.method === "GET" && url.searchParams.get("health") === "1") {
    return Response.json({ ok: true, fn: "cron-relatorio-diario-slack" });
  }
  if (INTERNAL_API_KEY && req.headers.get("x-api-key") !== INTERNAL_API_KEY) {
    return new Response("forbidden", { status: 403 });
  }

  // Janela horaria Lisboa: relatorio diario Slack 19h. ?force=1 ignora a
  // janela — usado para testar manualmente sem esperar pela hora certa.
  const force = url.searchParams.get("force") === "1";
  if (!force) {
    const t = lisbon();
    if (t.hour !== 19) {
      return Response.json({ ok: true, ran: false, reason: "fora da janela", fn: "cron-relatorio-diario-slack" });
    }
  }

  const lockKey = 90012;
  const { rows } = await pool.query("SELECT pg_try_advisory_lock($1) AS got", [lockKey]);
  if (!rows[0]?.got) return Response.json({ ok: true, ran: false, reason: "lock ocupado" });
  try {
    const result = await runRelatorioDiarioSlack();
    return Response.json({ ok: true, fn: "cron-relatorio-diario-slack", ...result });
  } catch (e) {
    console.error("[cron-relatorio-diario-slack]", (e as Error).message);
    return Response.json({ ok: false, error: (e as Error).message }, { status: 500 });
  } finally {
    await pool.query("SELECT pg_advisory_unlock($1)", [lockKey]);
  }
});
