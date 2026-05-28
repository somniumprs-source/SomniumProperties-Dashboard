// Stub cron — "cron-sync-calendar". Invocado por pg_cron via net.http_post; protegido por INTERNAL_API_KEY.
// Logica real (janela horaria Lisboa + advisory lock) entra na fase de crons.
const INTERNAL_API_KEY = Deno.env.get("INTERNAL_API_KEY") || "";

Deno.serve((req) => {
  const url = new URL(req.url);
  if (req.method === "GET" && url.searchParams.get("health") === "1") {
    return Response.json({ ok: true, fn: "cron-sync-calendar" });
  }
  if (INTERNAL_API_KEY && req.headers.get("x-api-key") !== INTERNAL_API_KEY) {
    return new Response("forbidden", { status: 403 });
  }
  return Response.json({ ok: true, ran: false, fn: "cron-sync-calendar" });
});
