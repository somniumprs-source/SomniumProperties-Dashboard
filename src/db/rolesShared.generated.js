// GERADO AUTOMATICAMENTE a partir de supabase/functions/_shared/roles.ts — NÃO editar à mão.
// Para regenerar: npm run generate:roles (já corre sozinho antes de dev/build/server).
// Mudar roles/módulos/áreas: editar supabase/functions/_shared/roles.ts e regenerar — nunca este ficheiro directamente.

export const ROLES = ["admin","comercial","financeiro","investidor","operacoes","parceiro"]
export const ROLE_AREAS = {"admin":["dashboard","crm","projectos","financeiro","operacoes","metricas","alertas","administracao","marketing","admin"],"comercial":["dashboard","crm","projectos","metricas"],"financeiro":["dashboard","financeiro","metricas"],"operacoes":["dashboard","operacoes","alertas","metricas"],"parceiro":["crm","projectos"],"investidor":["projectos"]}
export const ROLE_MODULES = {"admin":["crm.imoveis","crm.investidores","crm.consultores","crm.empreiteiros","crm.negocios","crm.despesas"],"comercial":["crm.imoveis","crm.investidores","crm.consultores","crm.empreiteiros","crm.negocios"],"financeiro":["crm.negocios","crm.despesas"],"operacoes":[],"parceiro":["crm.imoveis","crm.negocios"],"investidor":["crm.negocios"]}
export const RECORD_RESTRICTED_ROLES = new Set(["investidor","parceiro"])
export const NON_ID_SEGS = new Set(["checklist","enriched","find-or-create","lookup","pois","relatorio","stats"])
