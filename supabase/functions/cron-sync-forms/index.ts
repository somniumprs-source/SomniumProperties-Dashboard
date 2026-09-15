import pool from "../_shared/pg.ts";
import { throttled } from "../_shared/cronThrottle.ts";
import { isConfigured, syncForms } from "../_shared/formsSync.ts";

const INTERNAL_API_KEY = Deno.env.get("INTERNAL_API_KEY") || "";

Deno.serve(async (req) => {
  const url = new URL(req.url);
  if (req.method === "GET" && url.searchParams.get("health") === "1") {
    return Response.json({ ok: true, fn: "cron-sync-forms" });
  }
  if (INTERNAL_API_KEY && req.headers.get("x-api-key") !== INTERNAL_API_KEY) {
    return new Response("forbidden", { status: 403 });
  }

  // SEM janela horaria — corre sempre (pg_cron */17). Sem INTERNAL_API_KEY
  // definida, este endpoint ficava invocável sem limite; o throttle impõe o
  // mesmo intervalo mínimo do cron legítimo mesmo que alguém o chame à parte.
  if (!(await throttled("cron-sync-forms", 14 * 60 * 1000))) {
    return Response.json({ ok: true, ran: false, reason: "throttled", fn: "cron-sync-forms" });
  }
  if (!isConfigured()) {
    return Response.json({ ok: true, ran: false, reason: "forms nao configurado", fn: "cron-sync-forms" });
  }

  const lockKey = 90011;
  const { rows } = await pool.query("SELECT pg_try_advisory_lock($1) AS got", [lockKey]);
  if (!rows[0]?.got) return Response.json({ ok: true, ran: false, reason: "lock ocupado" });
  try {
    const result = await syncForms();
    return Response.json({ ok: true, ran: true, result, fn: "cron-sync-forms" });
  } catch (e) {
    console.error("[cron-sync-forms]", (e as Error).message);
    return Response.json({ ok: false, error: (e as Error).message }, { status: 500 });
  } finally {
    await pool.query("SELECT pg_advisory_unlock($1)", [lockKey]);
  }
});
