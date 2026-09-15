// Fonte única de roles/áreas/módulos, partilhada pelas Edge Functions "crm",
// "users" e "dashboard". Antes destes três ficheiros tinham cada um a sua
// própria cópia destas constantes — divergiam sem ninguém reparar (ex:
// "crm.despesas" existia em "crm" mas não em "users", pelo que /api/users/me
// devolvia `modules` incompleto para o frontend decidir o que mostrar).
//
// O lado Express de dev (src/db/userRoutes.js, Node/CommonJS) NÃO importa
// daqui — Node não consegue importar um módulo Deno directamente. Mantém a
// sua própria cópia manual; o script `scripts/check-role-parity.mjs` (correr
// via `npm run check:roles`, e no CI) compara os dois lados a cada alteração.

export const ROLES = ["admin", "comercial", "financeiro", "operacoes", "parceiro", "investidor"] as const;

export const ROLE_AREAS: Record<string, string[]> = {
  admin: ["dashboard", "crm", "projectos", "financeiro", "operacoes", "metricas", "alertas", "administracao", "marketing", "admin"],
  comercial: ["dashboard", "crm", "projectos", "metricas"],
  financeiro: ["dashboard", "financeiro", "metricas"],
  operacoes: ["dashboard", "operacoes", "alertas", "metricas"],
  // Parceiro externo: vê CRM (só tab Imóveis) e Projectos, filtrado pela
  // tabela `acessos` (só os registos partilhados com ele).
  parceiro: ["crm", "projectos"],
  // Investidor: só Projectos (os projetos onde foi adicionado via `acessos`).
  investidor: ["projectos"],
};

// Sub-módulos dentro de cada área. Uma role não listada num módulo NÃO tem
// acesso a esse módulo — usado tanto para filtrar tabs no frontend
// (GET /api/users/me → `modules`) como para proteger endpoints no backend
// (requireModule). financeiro/admin são os únicos roles com a área
// "financeiro" em ROLE_AREAS acima, por isso só eles têm "crm.despesas".
export const ROLE_MODULES: Record<string, string[]> = {
  admin: ["crm.imoveis", "crm.investidores", "crm.consultores", "crm.empreiteiros", "crm.negocios", "crm.despesas"],
  comercial: ["crm.imoveis", "crm.investidores", "crm.consultores", "crm.empreiteiros", "crm.negocios"],
  financeiro: ["crm.negocios", "crm.despesas"],
  operacoes: [],
  parceiro: ["crm.imoveis", "crm.negocios"],
  investidor: ["crm.negocios"],
};

// Roles cujo acesso a registos é restrito pela tabela `acessos`. Outros
// roles (admin, comercial, financeiro, operacoes) vêem tudo dentro do que
// ROLE_MODULES/ROLE_AREAS já lhes permite.
export const RECORD_RESTRICTED_ROLES = new Set(["parceiro", "investidor"]);

// Segmentos de path que não são IDs de registo (rotas custom tipo
// /imoveis/stats, /imoveis/pois/sugeridos) — usado por restrictByAccessGeneric
// para distinguir "GET/POST num registo concreto" de "rota utilitária".
export const NON_ID_SEGS = new Set(["stats", "enriched", "find-or-create", "lookup", "checklist", "relatorio", "pois"]);
