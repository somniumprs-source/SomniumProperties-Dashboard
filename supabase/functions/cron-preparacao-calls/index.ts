// Preparação das calls com investidores (SOP 4): de hora a hora, garante que
// todas as calls dos próximos 14 dias têm documento de preparação e regenera
// as da véspera (D-1, SOP 10) e do próprio dia se o contexto mudou. O texto é
// gerado no Mac (fila IA); aqui só se classifica, junta o CRM e põe na fila.
import pool from "../_shared/pg.ts";
import { sincronizarPreparacoes } from "../_shared/preparacaoCall.ts";
import { pedirBackfill } from "../_shared/autopreenchimento.ts";

const INTERNAL_API_KEY = Deno.env.get("INTERNAL_API_KEY") || "";

Deno.serve(async (req) => {
  const url = new URL(req.url);
  if (req.method === "GET" && url.searchParams.get("health") === "1") {
    return Response.json({ ok: true, fn: "cron-preparacao-calls" });
  }
  if (INTERNAL_API_KEY && req.headers.get("x-api-key") !== INTERNAL_API_KEY) {
    return new Response("forbidden", { status: 403 });
  }
  // Backfill do autopreenchimento (modo só-sugestões), pedido à mão:
  // ?backfill=autopreenchimento (mesma chave interna do cron).
  if (url.searchParams.get("backfill") === "autopreenchimento") {
    try { return Response.json({ ok: true, fn: "cron-preparacao-calls", backfill: await pedirBackfill(pool) }); }
    catch (e) { return Response.json({ ok: false, error: (e as Error).message }, { status: 500 }); }
  }
  const lockKey = 90101;
  const { rows } = await pool.query("SELECT pg_try_advisory_lock($1) AS got", [lockKey]);
  if (!rows[0]?.got) return Response.json({ ok: true, ran: false, reason: "lock ocupado" });
  try {
    const res = await sincronizarPreparacoes(pool);
    return Response.json({ ok: true, ran: true, fn: "cron-preparacao-calls", ...res });
  } catch (e) {
    console.error("[cron-preparacao-calls]", (e as Error).message);
    return Response.json({ ok: false, error: (e as Error).message }, { status: 500 });
  } finally {
    await pool.query("SELECT pg_advisory_unlock($1)", [lockKey]);
  }
});
