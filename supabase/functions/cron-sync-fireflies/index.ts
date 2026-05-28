import pool from "../_shared/pg.ts";
import { isConfigured, syncFireflies } from "../_shared/firefliesSync.ts";

const INTERNAL_API_KEY = Deno.env.get("INTERNAL_API_KEY") || "";

Deno.serve(async (req) => {
  const url = new URL(req.url);
  if (req.method === "GET" && url.searchParams.get("health") === "1") {
    return Response.json({ ok: true, fn: "cron-sync-fireflies" });
  }
  if (INTERNAL_API_KEY && req.headers.get("x-api-key") !== INTERNAL_API_KEY) {
    return new Response("forbidden", { status: 403 });
  }

  // SEM janela horaria — corre sempre (pg_cron */16). No-op se nao configurado.
  if (!isConfigured()) {
    return Response.json({ ok: true, ran: false, reason: "fireflies nao configurado", fn: "cron-sync-fireflies" });
  }

  const lockKey = 90010;
  const { rows } = await pool.query("SELECT pg_try_advisory_lock($1) AS got", [lockKey]);
  if (!rows[0]?.got) return Response.json({ ok: true, ran: false, reason: "lock ocupado" });
  try {
    const result = await syncFireflies();
    return Response.json({ ok: true, ran: true, result, fn: "cron-sync-fireflies" });
  } catch (e) {
    console.error("[cron-sync-fireflies]", (e as Error).message);
    return Response.json({ ok: false, error: (e as Error).message }, { status: 500 });
  } finally {
    await pool.query("SELECT pg_advisory_unlock($1)", [lockKey]);
  }
});
