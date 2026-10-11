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

// Follow-up do imóvel. A designação só existe em dois casos: o imóvel está numa
// fase de follow-up ou está em Pendentes (algo a resolver antes de ser
// analisado, fica nessa fase). Nas restantes fases o que se agenda é o próximo
// contacto (chamada, visita).
//   Follow UP               — algo tem de mudar para o negócio ser viável
//   Follow Up após proposta — proposta recusada e sem margem para subir: o
//                             negócio já está alinhado, espera-se pelo vendedor
export const FASES_FOLLOW_UP = ['Follow UP', 'Follow Up após proposta']
// Proposta que seguiu passa para «Em negociação»: é a partir daí que um
// follow-up é "após proposta".
const FASES_COM_PROPOSTA = ['Em negociação', 'Proposta aceite', 'Enviar proposta ao investidor']
export const eFaseFollowUp = estado => FASES_FOLLOW_UP.includes(limpaEstado(estado))

// O que acontece à fase quando se agenda um follow-up. destino: fase pedida à
// partida — uma fase de follow-up (coluna do Kanban, fase escolhida na ficha)
// ou Pendentes (visita com decisão de espera, decidido caso a caso).
//   { aplica: false }             — negócio fechado, não há follow-up
//   { aplica: true, mover: null } — fica na fase onde está
//   { aplica: true, mover: fase } — passa para essa fase, com o motivo
//                                   («Follow Up após proposta» se a proposta
//                                   já seguiu, senão «Follow UP»)
export function faseAoAgendarFollowUp(estado, destino = null) {
  const atual = limpaEstado(estado)
  const pedido = limpaEstado(destino)
  if (FASES_FOLLOW_UP.includes(pedido) || pedido === 'Pendentes') return { aplica: true, mover: pedido === atual ? null : pedido }
  if (FASES_FOLLOW_UP.includes(atual) || atual === 'Pendentes') return { aplica: true, mover: null }
  if (tipoFase(atual) === 'fecho') return { aplica: false, mover: null }
  return { aplica: true, mover: FASES_COM_PROPOSTA.includes(atual) ? 'Follow Up após proposta' : 'Follow UP' }
}
