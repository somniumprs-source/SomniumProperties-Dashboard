// Requisitos de entrada das fases do pipeline de imóveis. Cada fase valida só
// o que ela própria precisa, venha o imóvel de onde vier: fases saltadas nunca
// são cobradas e as excecionais não exigem nada. Os mesmos requisitos servem o
// travão do servidor, o painel do imóvel e a janela que abre ao mudar de fase.
// Espelho: supabase/functions/_shared/dealBreakers.ts (manter em sync).
import { normalizeFicha, CHECKLIST_SECTIONS } from '../constants/fichaVisitaSchema.js'
import { MODELOS_FECHO, limpaEstado, indiceFase, tipoFase, eSaida } from '../constants/pipelineImoveis.js'

// Fases com requisitos de entrada, pela ordem do caminho principal. Os três
// modelos de fecho partilham o mesmo requisito.
const FASES_COM_REQUISITOS = ['Estudo de VVR', 'Criar Proposta ao Proprietário', 'Em negociação', 'Proposta aceite', ...MODELOS_FECHO]

const n = v => {
  const x = parseFloat(String(v ?? '').replace(',', '.'))
  return Number.isFinite(x) ? x : 0
}
const temTexto = v => v !== null && v !== undefined && String(v).trim() !== ''

function temConteudo(f) {
  const nc = f.preVisita.notasCampo
  if (nc.impressaoContacto || nc.pontosCriticos || nc.estrategia) return true
  if (CHECKLIST_SECTIONS.some(s => f.checklists[s.key].some(it => it.rating || it.obs))) return true
  if (f.medicoes.some(m => m.m2) || f.areaMedida) return true
  if (f.relatorio.decisao) return true
  return false
}

// Ficha preenchida mais recente (uma visita pode não ter ficha).
export function fichaMaisRecente(visitas) {
  const ordenadas = [...(visitas || [])].sort((a, b) =>
    String(b.data_hora || b.created_at || '').localeCompare(String(a.data_hora || a.created_at || '')))
  for (const v of ordenadas) {
    const f = normalizeFicha(v.ficha)
    if (temConteudo(f)) return f
  }
  return null
}

// acao: o que a interface abre para resolver o requisito.
const item = (id, titulo, estado, detalhe, acao, onde) => ({ id, titulo, estado, detalhe: detalhe || null, acao, onde })

// A visita vem antes do estudo: um problema grave visto no local torna o
// estudo tempo perdido. Sem ficha, é uma única pendência (registar a visita).
export function requisitosVisita(visitas) {
  const onde = 'Visitas'
  const f = fichaMaisRecente(visitas)
  if (!f) return [item('visita', 'Visita registada com decisão GO', 'por_fazer', 'Ainda não há visita registada com decisão', 'visita', onde)]

  const out = []
  const decisao = f.relatorio.decisao
  const titulo = 'Decisão da visita: GO'
  if (decisao === 'GO') out.push(item('visita_decisao', titulo, 'ok', null, 'visita', onde))
  else if (decisao === 'NO_GO') out.push(item('visita_decisao', titulo, 'problema', 'A decisão da visita é NO GO: o negócio deve passar para «Não interessa»', 'visita', onde))
  else if (decisao === 'PERITO') out.push(item('visita_decisao', titulo, 'por_fazer', 'A aguardar parecer técnico', 'visita', onde))
  else if (decisao === 'SEGUNDA_VISITA') out.push(item('visita_decisao', titulo, 'por_fazer', 'Falta a segunda visita', 'visita', onde))
  else if (decisao === 'STAND_BY') out.push(item('visita_decisao', titulo, 'por_fazer', 'Em stand-by: falta documentação ou informação', 'visita', onde))
  else out.push(item('visita_decisao', titulo, 'por_fazer', 'A decisão da visita ainda não foi escolhida', 'visita', onde))

  const medido = n(f.areaMedida) > 0 || f.medicoes.some(m => n(m.m2) > 0)
  out.push(item('visita_areas', 'Área medida na visita', medido ? 'ok' : 'por_fazer', medido ? null : 'Falta a área medida', 'visita', onde))

  const maus = CHECKLIST_SECTIONS.flatMap(s =>
    f.checklists[s.key].map((it, i) => (it.rating === 'M' ? s.items[i] : null)).filter(Boolean))
  const custoObra = n(f.totalObra) || f.estimativaObra.reduce((s, o) => s + n(o.custo), 0)
  const obraIndicada = temTexto(f.totalObra) || f.estimativaObra.some(o => temTexto(o.custo))
  if (maus.length > 0 && custoObra <= 0) {
    out.push(item('visita_obra', 'Custo de obra estimado', 'problema', `${maus.length} elemento(s) em mau estado sem custo de obra: ${maus.slice(0, 3).join(', ')}${maus.length > 3 ? '…' : ''}`, 'visita', onde))
  } else {
    out.push(item('visita_obra', 'Custo de obra estimado', obraIndicada ? 'ok' : 'por_fazer', obraIndicada ? null : 'Falta o custo de obra estimado', 'visita', onde))
  }
  return out
}

// Requisitos para entrar numa fase. dados = { imovel, visitas }.
export function requisitosDeEntrada(estado, dados = {}) {
  const fase = limpaEstado(estado)
  const im = dados.imovel || {}
  if (fase === 'Estudo de VVR') {
    const preco = n(im.ask_price) > 0
    return [
      item('preco', 'Preço pedido', preco ? 'ok' : 'por_fazer', preco ? null : 'Falta o preço pedido (Ask Price)', 'preco', 'Ficha do imóvel'),
      ...requisitosVisita(dados.visitas),
    ]
  }
  if (fase === 'Criar Proposta ao Proprietário') {
    const vvr = n(im.valor_venda_remodelado) > 0
    return [item('vvr', 'Estudo com VVR definido', vvr ? 'ok' : 'por_fazer', vvr ? null : 'Falta definir o VVR no estudo de mercado', 'vvr', 'Análise Financeira')]
  }
  if (fase === 'Em negociação') {
    const ok = n(im.valor_proposta) > 0 && temTexto(im.data_proposta)
    return [item('proposta', 'Proposta enviada, com valor e data', ok ? 'ok' : 'por_fazer', ok ? null : 'Falta o valor ou a data da proposta', 'proposta', 'Ficha do imóvel')]
  }
  if (fase === 'Proposta aceite') {
    const ok = n(im.valor_proposta) > 0 && temTexto(im.data_proposta_aceite)
    return [item('aceite', 'Valor final e data de aceitação', ok ? 'ok' : 'por_fazer', ok ? null : 'Falta o valor final ou a data de aceitação', 'aceite', 'Ficha do imóvel')]
  }
  if (MODELOS_FECHO.includes(fase)) {
    const ok = temTexto(im.data_proposta_aceite)
    return [item('aceite', 'Proposta aceite', ok ? 'ok' : 'por_fazer', ok ? null : 'Falta a data de aceitação da proposta', 'aceite', 'Ficha do imóvel')]
  }
  return []
}

// Mudanças que nunca são travadas: desistir, recuar no caminho principal (o
// imóvel já lá esteve) e trocar entre modelos de fecho. Quem vem de uma fase
// excecional é sempre validado, porque não se sabe onde estava antes.
export function isentoDeRequisitos(de, para) {
  if (eSaida(para)) return true
  const deFecho = MODELOS_FECHO.includes(limpaEstado(de)), paraFecho = MODELOS_FECHO.includes(limpaEstado(para))
  if (deFecho && paraFecho) return true
  const tDe = tipoFase(de), tPara = tipoFase(para)
  if (tDe === 'excecional' || tDe === null || eSaida(de)) return false
  if (tPara !== 'principal') return false
  return indiceFase(para) < indiceFase(de)
}

// Avalia uma mudança de fase. emFalta vazio = pode avançar.
export function avaliarEntrada(de, para, dados) {
  if (isentoDeRequisitos(de, para)) return { destino: limpaEstado(para), itens: [], emFalta: [], bloqueado: false }
  const itens = requisitosDeEntrada(para, dados)
  const emFalta = itens.filter(i => i.estado !== 'ok')
  return { destino: limpaEstado(para), itens, emFalta, bloqueado: emFalta.length > 0 }
}

// Painel do imóvel: os requisitos da próxima fase que os tem. Numa fase
// excecional mostra a primeira ainda por cumprir. Em fecho não há nada a pedir,
// mas um imóvel que passou o estudo sem visita registada fica com o aviso.
export function painelRequisitos(dados, estadoAtual) {
  const tipo = tipoFase(estadoAtual)
  const atual = limpaEstado(estadoAtual)
  const idx = indiceFase(estadoAtual)
  const fases = ['Estudo de VVR', 'Criar Proposta ao Proprietário', 'Em negociação', 'Proposta aceite', 'Wholesaling']
  const rotulo = f => (f === 'Wholesaling' ? 'Wholesaling, CAEP ou Fix and Flip' : f)

  let destino = null
  if (tipo === 'principal') destino = fases.find(f => indiceFase(f) > idx) || null
  else if (tipo === 'excecional' || tipo === null) {
    destino = fases.find(f => requisitosDeEntrada(f, dados).some(i => i.estado !== 'ok')) || null
  }
  const itens = destino ? requisitosDeEntrada(destino, dados) : []

  // Visita por registar em imóveis que já estão no estudo ou mais à frente.
  const avisos = []
  const jaPassouEstudo = (tipo === 'principal' && idx >= indiceFase('Estudo de VVR')) || MODELOS_FECHO.includes(atual)
  if (jaPassouEstudo && !fichaMaisRecente(dados.visitas)) {
    avisos.push(item('visita', 'Visita por registar', 'por_fazer', 'O imóvel já passou o estudo sem visita registada', 'visita', 'Visitas'))
  }

  return {
    estado: atual,
    destino,
    titulo: destino ? `Para entrar em «${rotulo(destino)}»` : null,
    itens,
    avisos,
    pendentes: itens.filter(i => i.estado !== 'ok').length + avisos.length,
  }
}

export { FASES_COM_REQUISITOS }
