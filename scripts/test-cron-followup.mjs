/**
 * Invoca a Edge Function cron-followup directamente e mostra a resposta.
 * Usa o INTERNAL_API_KEY do .env. A funcao deve responder
 * { ok: true, ran: false, reason: "fora da janela" } se nao for 8h Lisboa.
 */
const SUPABASE_URL = process.env.SUPABASE_URL;
const KEY = process.env.INTERNAL_API_KEY;
if (!SUPABASE_URL || !KEY) {
  console.error("Falta SUPABASE_URL ou INTERNAL_API_KEY no .env");
  process.exit(1);
}
const url = `${SUPABASE_URL.replace(/\/$/, "")}/functions/v1/cron-followup`;
console.log("POST", url);
const res = await fetch(url, {
  method: "POST",
  headers: { "x-api-key": KEY, "Content-Type": "application/json" },
  body: "{}",
});
console.log("Status:", res.status);
console.log("Body:", await res.text());
