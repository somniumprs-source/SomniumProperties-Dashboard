// Mapeia os caminhos /api/* (Express legacy) para as Edge Functions Supabase.
//
// Cada Edge Function e alcancada pelo seu NOME no 1.o segmento do path
// (https://<proj>.functions.supabase.co/<funcao>/...). Como uma funcao pode
// absorver varios prefixos Express (ex: o "dashboard" serve /kpis, /financeiro,
// /comercial, ...), traduzimos aqui o 1.o segmento -> funcao certa.
//
// Se VITE_API_URL nao estiver definido (dev / dual-run), devolve o URL original
// (/api/*) inalterado — o frontend continua a falar com o Express same-origin.
export const API_BASE = (import.meta.env.VITE_API_URL || "").replace(/\/$/, "");

// Segmentos cujo nome JA E o nome da funcao (path passa tal e qual).
const SELF = new Set(["crm", "users", "sops", "calendar", "voice", "scrape-portal"]);
// Segmentos absorvidos pela funcao "dashboard".
const DASH = new Set([
  "kpis", "financeiro", "comercial", "marketing", "operacoes",
  "metricas", "tarefas", "okrs", "okr-krs", "alertas",
]);

export function resolveApiUrl(url) {
  if (!API_BASE || typeof url !== "string" || !url.startsWith("/api/")) return url;
  const rest = url.slice(5); // depois de "/api/"
  // Webhooks (segmento composto com hifen na funcao).
  if (rest.startsWith("webhook/whatsapp")) {
    return API_BASE + "/webhook-whatsapp" + rest.slice("webhook/whatsapp".length);
  }
  if (rest.startsWith("webhook/landing-lead")) {
    return API_BASE + "/webhook-landing-lead" + rest.slice("webhook/landing-lead".length);
  }
  const seg = rest.split(/[/?#]/)[0];
  if (SELF.has(seg)) return `${API_BASE}/${rest}`;
  if (DASH.has(seg)) return `${API_BASE}/dashboard/${rest}`;
  if (seg === "acessos") return `${API_BASE}/users/${rest}`; // accessRouter -> /users/acessos/*
  return url; // desconhecido: fallback same-origin
}
