import pool from "../_shared/pg.ts";

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
    return Response.json({ ok: true, fn: "cron-backup" });
  }
  if (INTERNAL_API_KEY && req.headers.get("x-api-key") !== INTERNAL_API_KEY) {
    return new Response("forbidden", { status: 403 });
  }

  // Janela horaria Lisboa: backup diario 03h.
  const t = lisbon();
  if (t.hour !== 3) {
    return Response.json({ ok: true, ran: false, reason: "fora da janela", fn: "cron-backup" });
  }

  const lockKey = 90012;
  const { rows } = await pool.query("SELECT pg_try_advisory_lock($1) AS got", [lockKey]);
  if (!rows[0]?.got) return Response.json({ ok: true, ran: false, reason: "lock ocupado" });
  try {
    // TODO: backup depende do endpoint crm/backup/auto (stub 501).
    // O original fazia fetch a localhost /api/crm/backup/auto; esse endpoint ainda
    // nao foi portado (stub). Corpo no-op com log ate o endpoint existir.
    console.log("[cron-backup] no-op: endpoint crm/backup/auto ainda stub (501)");
    return Response.json({ ok: true, ran: false, reason: "backup endpoint stub", fn: "cron-backup" });
  } catch (e) {
    console.error("[cron-backup]", (e as Error).message);
    return Response.json({ ok: false, error: (e as Error).message }, { status: 500 });
  } finally {
    await pool.query("SELECT pg_advisory_unlock($1)", [lockKey]);
  }
});
