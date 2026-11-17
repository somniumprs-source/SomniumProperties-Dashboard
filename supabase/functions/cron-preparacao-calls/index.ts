// Preparação das calls com investidores (SOP 23 v2.1): de hora a hora, garante que
// todas as calls dos próximos 14 dias têm documento de preparação e regenera
// as da véspera (D-1, SOP 10) e do próprio dia se o contexto mudou. O texto é
// gerado no Mac (fila IA); aqui só se classifica, junta o CRM e põe na fila.
import pool from "../_shared/pg.ts";
import { sincronizarPreparacoes, regenerarPreparacoes } from "../_shared/preparacaoCall.ts";
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
  // Backfill do autopreenchimento, pedido à mão (mesma chave interna do cron):
  // ?backfill=autopreenchimento[&modo=auto|backfill][&so=gravacoes|reunioes]
  if (url.searchParams.get("backfill") === "autopreenchimento") {
    const modo = url.searchParams.get("modo") || "backfill";
    const so = url.searchParams.get("so") || null;
    try { return Response.json({ ok: true, fn: "cron-preparacao-calls", backfill: await pedirBackfill(pool, { modo, so }) }); }
    catch (e) { return Response.json({ ok: false, error: (e as Error).message }, { status: 500 }); }
  }
  // Regenerar à força as preparações de um período: ?regenerar=semana&desde=YYYY-MM-DD&ate=YYYY-MM-DD[&tarefas=id1,id2]
  if (url.searchParams.get("regenerar") === "semana") {
    try { return Response.json({ ok: true, fn: "cron-preparacao-calls", regenerar: await regenerarPreparacoes(pool, { desde: url.searchParams.get("desde"), ate: url.searchParams.get("ate"), tarefas: (url.searchParams.get("tarefas") || "").split(",").filter(Boolean) }) }); }
    catch (e) { return Response.json({ ok: false, error: (e as Error).message }, { status: 500 }); }
  }
  // Lease de 10 min (ver migração 0103): o advisory lock através do pooler
  // podia ficar preso noutra ligação e bloquear o cron para sempre.
  const { rows } = await pool.query(
    `INSERT INTO cron_leases (nome, ate) VALUES ('cron-preparacao-calls', now() + interval '10 minutes')
     ON CONFLICT (nome) DO UPDATE SET ate = EXCLUDED.ate WHERE cron_leases.ate < now() RETURNING nome`);
  if (!rows.length) return Response.json({ ok: true, ran: false, reason: "lease ocupado" });
  try {
    const res = await sincronizarPreparacoes(pool);
    return Response.json({ ok: true, ran: true, fn: "cron-preparacao-calls", ...res });
  } catch (e) {
    console.error("[cron-preparacao-calls]", (e as Error).message);
    return Response.json({ ok: false, error: (e as Error).message }, { status: 500 });
  } finally {
    await pool.query(`UPDATE cron_leases SET ate = now() WHERE nome = 'cron-preparacao-calls'`).catch(() => {});
  }
});
