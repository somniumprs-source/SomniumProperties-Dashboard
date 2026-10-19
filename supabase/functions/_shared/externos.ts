// Guarda para funções só da equipa interna (sops, agenda, calendar, voice,
// scrape-portal). Correm depois do requireAuth, que só confirma que a sessão
// é válida: sem isto um parceiro ou investidor com conta lia e alterava SOPs,
// agenda e calendário. Externos só veem os imóveis/projetos partilhados com
// eles (função "crm"); aqui recebem sempre 403.
import { RECORD_RESTRICTED_ROLES } from "./roles.ts";
import { resolveOrProvisionUser } from "./userResolve.ts";

export async function bloquearExternos(c: any, next: any) {
  if (c.req.path.endsWith("/_health")) return await next();
  const authUser = c.get("user");
  // Sem utilizador (dev sem service key, ou pedido interno por x-api-key): segue.
  if (!authUser?.email) return await next();
  const u = await resolveOrProvisionUser({ id: authUser.sub || authUser.id, email: authUser.email }).catch(() => null);
  if (u && RECORD_RESTRICTED_ROLES.has(u.role)) return c.json({ error: "Sem acesso a esta área" }, 403);
  await next();
}
