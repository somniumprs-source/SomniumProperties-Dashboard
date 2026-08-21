// Mapa desfecho de chamada → dias até ao próximo follow-up automático.
// PENDENTE — valores placeholder, confirmar com o SOP 2 antes de activar
// em produção com dados reais. Até lá, o mecanismo fica pronto mas os
// prazos abaixo são só um ponto de partida razoável.
//
// Chaves: cc_resultado (Cold Call) e cl_resultado (Close Call) — os únicos
// desfechos estruturados que fazem sentido gerar follow-up automático.
export const FOLLOWUP_RULES_DIAS = {
  // Cold Call
  cc_resultado: {
    atendeu: 3,
    nao_atendeu: 1,
    recusou: null, // sem follow-up automático
    numero_errado: null,
  },
  // Close Call
  cl_resultado: {
    aceite: null, // avança para outro fluxo, não follow-up
    recusa_definitiva: null,
    vou_pensar_com_data: null, // já tem data própria (cl_deadline)
    vou_pensar_sem_data: 5,
  },
}

// Dado o registo de uma gravação (já validado/sanitizado), devolve os dias
// até ao follow-up automático, ou null se este desfecho não gera follow-up.
export function diasFollowUpParaRegisto(registo) {
  if (registo.tipo_chamada === 'cold_call' && registo.cc_resultado) {
    return FOLLOWUP_RULES_DIAS.cc_resultado[registo.cc_resultado] ?? null
  }
  if (registo.tipo_chamada === 'close_call' && registo.cl_resultado) {
    return FOLLOWUP_RULES_DIAS.cl_resultado[registo.cl_resultado] ?? null
  }
  return null
}
