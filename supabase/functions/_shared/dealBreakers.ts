// @ts-nocheck
// Deal breakers do Comercial: condições verificadas sobre os dados do imóvel
// que impedem o negócio de avançar enquanto não estiverem conferidas. Bloqueiam
// sempre — o negócio só avança quando é ajustado, ou é chumbado (Não interessa).
// Espelho de src/db/dealBreakers.js (manter em sync).
import { normalizeFicha, CHECKLIST_SECTIONS } from './fichaVisitaSchema.ts'

// Porta exigida por cada estado. Cumulativa: um estado da porta N exige as
// portas 1..N. Estados de saída (Não interessa, Descartado) e anteriores à
// visita não exigem nenhuma.
export const PORTA_DO_ESTADO = {
  'Estudo de VVR': 1,
  'Criar Proposta ao Proprietário': 1,
  'Enviar proposta ao Proprietário': 1,
  'Em negociação': 1,
  'Proposta aceite': 1,
  'Enviar proposta ao investidor': 1,
  'Follow Up após proposta': 1,
  'Wholesaling': 1,
  'CAEP': 1,
  'Fix and Flip': 1,
  'Negócio em Curso': 1,
}

// Ordem do pipeline, para distinguir avançar de recuar. Recuar (ou desistir
// para Não interessa/Descartado) nunca é travado: é assim que se volta atrás
// para completar a checklist ou corrigir dados. Wholesaling, CAEP e Fix and
// Flip são alternativas ao mesmo nível.
const ORDEM_ESTADO = {
  'Adicionado': 0, 'Chamada Não Atendida': 1, 'Pendentes': 2, 'Pré-aprovação': 3,
  'Necessidade de Visita': 4, 'Follow UP': 5, 'Visita Marcada': 6, 'Estudo de VVR': 7,
  'Criar Proposta ao Proprietário': 8, 'Enviar proposta ao Proprietário': 9,
  'Em negociação': 10, 'Proposta aceite': 11, 'Enviar proposta ao investidor': 12,
  'Follow Up após proposta': 13, 'Wholesaling': 14, 'CAEP': 14, 'Fix and Flip': 14,
  'Negócio em Curso': 15,
}
const ESTADOS_SAIDA = ['Não interessa', 'Nao interessa', 'Descartado']
const limpa = e => String(e || '').replace(/^\d+-\s*/, '').trim()

export function eRecuo(de, para) {
  if (ESTADOS_SAIDA.includes(limpa(para))) return true
  const a = ORDEM_ESTADO[limpa(de)], b = ORDEM_ESTADO[limpa(para)]
  return a !== undefined && b !== undefined && b < a
}

export const PORTAS = {
  1: 'Depois da visita',
}

const n = v => {
  const x = parseFloat(String(v ?? '').replace(',', '.'))
  return Number.isFinite(x) ? x : 0
}

function temConteudo(f) {
  const nc = f.preVisita.notasCampo
  if (nc.impressaoContacto || nc.pontosCriticos || nc.estrategia) return true
  if (CHECKLIST_SECTIONS.some(s => f.checklists[s.key].some(it => it.rating || it.obs))) return true
  if (f.medicoes.some(m => m.m2) || f.areaMedida) return true
  if (f.relatorio.decisao) return true
  return false
}

// Ficha preenchida mais recente (uma visita pode não ter ficha).
function fichaMaisRecente(visitas) {
  const ordenadas = [...(visitas || [])].sort((a, b) =>
    String(b.data_hora || b.created_at || '').localeCompare(String(a.data_hora || a.created_at || '')))
  for (const v of ordenadas) {
    const f = normalizeFicha(v.ficha)
    if (temConteudo(f)) return f
  }
  return null
}

const item = (id, titulo, estado, detalhe) => ({ id, porta: 1, titulo, estado, detalhe, onde: 'Visitas · Ficha de Visita' })

export function avaliarPorta1(visitas) {
  const f = fichaMaisRecente(visitas)
  if (!f) {
    return [
      item('visita_ficha', 'Ficha de Visita preenchida', 'por_fazer', 'Ainda não há nenhuma Ficha de Visita preenchida'),
      item('visita_decisao', 'Decisão da visita: GO', 'por_fazer', 'Sem Ficha de Visita'),
      item('visita_mau_estado', 'Problemas graves com custo previsto', 'por_fazer', 'Sem Ficha de Visita'),
      item('visita_areas', 'Áreas medidas na visita', 'por_fazer', 'Sem Ficha de Visita'),
    ]
  }

  const out = [item('visita_ficha', 'Ficha de Visita preenchida', 'ok', null)]

  const decisao = f.relatorio.decisao
  if (decisao === 'GO') out.push(item('visita_decisao', 'Decisão da visita: GO', 'ok', null))
  else if (decisao === 'NO_GO') out.push(item('visita_decisao', 'Decisão da visita: GO', 'problema', 'A decisão da visita é NO GO: o negócio deve ser chumbado'))
  else if (decisao === 'PERITO') out.push(item('visita_decisao', 'Decisão da visita: GO', 'por_fazer', 'A aguardar parecer técnico: mudar a decisão para GO depois do relatório'))
  else if (decisao === 'SEGUNDA_VISITA') out.push(item('visita_decisao', 'Decisão da visita: GO', 'por_fazer', 'Falta a segunda visita'))
  else if (decisao === 'STAND_BY') out.push(item('visita_decisao', 'Decisão da visita: GO', 'por_fazer', 'Em stand-by: falta documentação ou informação'))
  else out.push(item('visita_decisao', 'Decisão da visita: GO', 'por_fazer', 'A decisão da visita ainda não foi escolhida'))

  const maus = CHECKLIST_SECTIONS.flatMap(s =>
    f.checklists[s.key].map((it, i) => (it.rating === 'M' ? s.items[i] : null)).filter(Boolean))
  const custoObra = n(f.totalObra) || f.estimativaObra.reduce((s, o) => s + n(o.custo), 0)
  if (maus.length === 0) out.push(item('visita_mau_estado', 'Problemas graves com custo previsto', 'ok', 'Nenhum elemento avaliado como Mau'))
  else if (custoObra > 0) out.push(item('visita_mau_estado', 'Problemas graves com custo previsto', 'ok', `${maus.length} elemento(s) em mau estado, com estimativa de obra`))
  else out.push(item('visita_mau_estado', 'Problemas graves com custo previsto', 'problema', `${maus.length} elemento(s) em mau estado sem custo na estimativa de obra: ${maus.slice(0, 3).join(', ')}${maus.length > 3 ? '…' : ''}`))

  const medido = n(f.areaMedida) > 0 || f.medicoes.some(m => n(m.m2) > 0)
  out.push(item('visita_areas', 'Áreas medidas na visita', medido ? 'ok' : 'por_fazer', medido ? null : 'Falta a medição das áreas (secção 9 da Ficha de Visita)'))
  return out
}

// Avalia os deal breakers exigidos por um estado. Sem estado alvo, usa a porta
// do estado atual e a seguinte (para o painel mostrar o que vem aí).
export function avaliarDealBreakers(dados, estado) {
  const porta = PORTA_DO_ESTADO[estado] || 0
  const itens = porta >= 1 ? avaliarPorta1(dados.visitas) : []
  return { estado, porta, itens, bloqueado: itens.some(i => i.estado !== 'ok') }
}

// Painel: o que o estado atual já exige, ou o que a próxima porta vai exigir.
export function painelDealBreakers(dados, estadoAtual) {
  const portaAtual = PORTA_DO_ESTADO[estadoAtual] || 0
  const porta = Math.max(portaAtual, 1)
  const itens = avaliarPorta1(dados.visitas)
  return { porta, titulo: PORTAS[porta], jaExigida: portaAtual >= porta, itens, pendentes: itens.filter(i => i.estado !== 'ok').length }
}
