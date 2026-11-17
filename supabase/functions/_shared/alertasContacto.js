// Alertas por falta de contacto a consultores e investidores — PAUSADOS.
//
// Desde 17/11/2026 a equipa está a recuperar o histórico de contactos e a pôr
// tudo em dia; até lá estes alertas só fariam ruído (contactos feitos mas
// ainda não registados). Com o interruptor a true:
//   - /api/alertas não gera inatividade_investidor, followup_consultor,
//     consultor_sem_contacto_48h nem consultor_inativo_15d;
//   - Dashboard (Comercial, KPIs, pulso semanal) mostra 0 nestes indicadores;
//   - relatórios do CRM (investidores/consultores) e semáforo dos consultores
//     não contam falta de contacto;
//   - crons de reclassificação semanal e auto-Inactivo dos investidores não
//     correm (penalizariam/inativariam por contactos ainda por registar).
// Para reativar: passar a false (Express de dev e Edge Functions usam este ficheiro).
export const ALERTAS_FALTA_CONTACTO_PAUSADOS = true;
