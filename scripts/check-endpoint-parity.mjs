#!/usr/bin/env node
// Compara as rotas (método + path) registadas no Express de dev com as
// registadas na Edge Function de produção equivalente, para os pares que
// historicamente mais divergem sem ninguém reparar (ver CLAUDE.md:
// "alteracoes a endpoints precisam de ser portadas para AMBOS").
//
// NÃO é um parser real de Express/Hono — extrai `router.get('/x', ...)` /
// `app.get("/x", ...)` por regex. Isto é suficiente para o caso de uso (os
// dois lados usam a mesma sintaxe .get/.post/.put/.delete/.patch com o mesmo
// literal de path) e evita ter de executar o código (que abriria ligações à
// BD). Não apanha tudo (rotas construídas dinamicamente, `.use()` como
// guard) — é um alerta best-effort, não uma garantia formal.
//
// Uso: node scripts/check-endpoint-parity.mjs   (sai com código 1 se houver divergências)
// Corre no CI em push/PR que toque em src/db/*.js ou supabase/functions/*/index.ts.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

// "r" cobre o accessRouter de userRoutes.js (`const r = Router()`).
const METHOD_RE = /\b(?:router|app|r)\.(get|post|put|delete|patch)\(\s*(['"`])((?:(?!\2).)*)\2/g;

function extractRoutes(relPath, { normalize, filter } = {}) {
  const text = readFileSync(join(ROOT, relPath), "utf8");
  const routes = new Set();
  for (const m of text.matchAll(METHOD_RE)) {
    const method = m[1].toUpperCase();
    let path = m[3];
    if (filter && !filter(path)) continue;
    if (normalize) path = normalize(path);
    routes.add(`${method} ${path}`);
  }
  return routes;
}

// path -> path relativo esperado no outro lado, quando os dois lados NÃO
// usam o mesmo literal (caso conhecido: accessRouter é montado à parte em
// dev — /api/acessos/* — mas vive dentro do mesmo ficheiro users/index.ts em
// produção sob o prefixo /acessos/*).
const stripLeadingAcessos = (path) => path.replace(/^\/acessos(?=\/|$)/, "") || "/";

// Mesma lista usada em server.js:192 para o guard de acesso (parceiro/investidor
// não podem chamar nada destas áreas) — reaproveitada aqui para filtrar, de
// server.js (que mistura TODOS os domínios num só ficheiro), só as rotas que
// supabase/functions/dashboard/index.ts também deveria implementar. Mantida
// por sincronizar à mão com server.js:192 (script é best-effort, não formal).
const DASHBOARD_AREA_PREFIXES = ["/api/kpis", "/api/financeiro", "/api/comercial", "/api/metricas", "/api/alertas", "/api/operacoes", "/api/okrs", "/api/okr-krs", "/api/tarefas", "/api/weekly-pulse", "/api/ops-scorecard", "/api/time-tracking", "/api/data-health", "/api/marketing"];
const isDashboardRoute = (path) => DASHBOARD_AREA_PREFIXES.some((p) => path === p || path.startsWith(p + "/"));
const stripLeadingApi = (path) => path.replace(/^\/api(?=\/|$)/, "") || "/";

const PAIRS = [
  {
    label: "users (src/db/userRoutes.js ↔ supabase/functions/users/index.ts)",
    dev: "src/db/userRoutes.js",
    prod: "supabase/functions/users/index.ts",
    prodNormalize: stripLeadingAcessos,
  },
  {
    label: "crm (src/db/routes.js ↔ supabase/functions/crm/index.ts)",
    dev: "src/db/routes.js",
    prod: "supabase/functions/crm/index.ts",
  },
  {
    label: "dashboard (server.js [financeiro/comercial/kpis/metricas/operacoes/okrs/tarefas/alertas] ↔ supabase/functions/dashboard/index.ts)",
    dev: "server.js",
    prod: "supabase/functions/dashboard/index.ts",
    devFilter: isDashboardRoute,
    devNormalize: stripLeadingApi,
  },
];

// Rotas que existem só de um lado DE PROPÓSITO, ou gaps já conhecidos que
// ainda não foram portados — para o script poder ser bloqueante em CI sem
// rebentar já por causa de dívida técnica pré-existente. Cada excepção devia
// ou ser permanente (documentada) ou ter um dono/prazo para desaparecer.
const KNOWN_ONE_SIDED = new Set([
  "GET /_health", // convenção só das Edge Functions (probe de deploy), permanente
]);

let hasDiff = false;

for (const pair of PAIRS) {
  const devRoutes = extractRoutes(pair.dev, { normalize: pair.devNormalize, filter: pair.devFilter });
  const prodRoutes = extractRoutes(pair.prod, { normalize: pair.prodNormalize, filter: pair.prodFilter });

  const onlyDev = [...devRoutes].filter((r) => !prodRoutes.has(r) && !KNOWN_ONE_SIDED.has(r)).sort();
  const onlyProd = [...prodRoutes].filter((r) => !devRoutes.has(r) && !KNOWN_ONE_SIDED.has(r)).sort();

  if (onlyDev.length === 0 && onlyProd.length === 0) {
    console.log(`OK  ${pair.label} — ${devRoutes.size} rotas em paridade.`);
    continue;
  }

  hasDiff = true;
  console.log(`\nDIVERGE  ${pair.label}`);
  if (onlyDev.length) {
    console.log(`  Só em dev (${pair.dev}), falta portar para produção:`);
    for (const r of onlyDev) console.log(`    - ${r}`);
  }
  if (onlyProd.length) {
    console.log(`  Só em produção (${pair.prod}), falta portar para dev:`);
    for (const r of onlyProd) console.log(`    - ${r}`);
  }
}

if (hasDiff) {
  console.log(
    "\nAlgumas destas divergências são legítimas (endpoint dev-only de debug, " +
      "rota registada por padrão diferente que a regex não apanhou). Confirma à " +
      "mão antes de assumir que é um esquecimento — mas confirma sempre.",
  );
  process.exit(1);
}
