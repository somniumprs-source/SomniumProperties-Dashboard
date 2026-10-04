// @ts-nocheck
// Pipeline de imóveis: lista única de fases, pela ordem do Kanban, lida pelo
// Kanban, pela ficha, pelos filtros e pelo servidor.
// Espelho de src/constants/pipelineImoveis.js (manter em sync).
//
// tipo:
//   principal  — caminho normal do negócio
//   excecional — só se usa quando a situação o pede; pode ser saltada e nunca
//                trava o avanço (ex.: Chamada Não Atendida)
//   fecho      — modelo de negócio fechado, ou desistência
export const FASES_IMOVEIS = [
  { nome: 'Pré-aprovação', tipo: 'excecional' },
  { nome: 'Adicionado', tipo: 'principal' },
  { nome: 'Chamada Não Atendida', tipo: 'excecional' },
  { nome: 'Pendentes', tipo: 'excecional' },
  { nome: 'Necessidade de Visita', tipo: 'principal' },
  { nome: 'Visita Marcada', tipo: 'principal' },
  { nome: 'Estudo de VVR', tipo: 'principal' },
  { nome: 'Criar Proposta ao Proprietário', tipo: 'principal' },
  { nome: 'Enviar proposta ao Proprietário', tipo: 'principal' },
  { nome: 'Em negociação', tipo: 'principal' },
  { nome: 'Proposta aceite', tipo: 'principal' },
  { nome: 'Enviar proposta ao investidor', tipo: 'principal' },
  { nome: 'Follow Up após proposta', tipo: 'excecional' },
  { nome: 'Follow UP', tipo: 'excecional' },
  { nome: 'Wholesaling', tipo: 'fecho' },
  { nome: 'CAEP', tipo: 'fecho' },
  { nome: 'Fix and Flip', tipo: 'fecho' },
  { nome: 'Não interessa', tipo: 'fecho' },
]

export const ESTADOS_IMOVEIS = FASES_IMOVEIS.map(f => f.nome)
export const MODELOS_FECHO = ['Wholesaling', 'CAEP', 'Fix and Flip']
const ESTADOS_SAIDA = ['Não interessa', 'Nao interessa', 'Descartado']

// Estados antigos vinham com prefixo numérico ("3- Visita Marcada").
export const limpaEstado = e => String(e || '').replace(/^\d+-\s*/, '').trim()

export function indiceFase(estado) {
  return ESTADOS_IMOVEIS.indexOf(limpaEstado(estado))
}

export function tipoFase(estado) {
  const nome = limpaEstado(estado)
  if (ESTADOS_SAIDA.includes(nome)) return 'fecho'
  return FASES_IMOVEIS.find(f => f.nome === nome)?.tipo || null
}

export const eSaida = estado => ESTADOS_SAIDA.includes(limpaEstado(estado))
