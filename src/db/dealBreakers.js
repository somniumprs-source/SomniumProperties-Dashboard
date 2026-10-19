// Requisitos de entrada das fases do pipeline de imóveis. Cada fase valida só
// o que ela própria precisa, venha o imóvel de onde vier: fases saltadas nunca
// são cobradas. Os mesmos requisitos servem o travão do servidor, o painel do
// imóvel e a janela que abre ao mudar de fase.
// Fases de espera e de agendamento (auditoria D8): entrar nelas exige o próximo
// passo marcado, para nenhum imóvel ficar parado sem data nem motivo. Continuam
// a poder ser saltadas: só se valida a fase de destino.
// Origem do imóvel (auditoria D7): a morada para marcar a visita; para fechar
// o negócio, a identificação legal e os documentos (certidão, caderneta e, se
// existirem, licença e certificado). O proprietário só se pede na Aquisição
// do projeto (fasesFixFlip.js).
// Espelho: supabase/functions/_shared/dealBreakers.ts (manter em sync).
import { normalizeFicha, CHECKLIST_SECTIONS } from '../constants/fichaVisitaSchema.js'
import { MODELOS_FECHO, limpaEstado, indiceFase, tipoFase, eSaida } from '../constants/pipelineImoveis.js'

// Fases com requisitos de entrada, pela ordem do caminho principal. Os três
// modelos de fecho partilham o mesmo requisito.
const FASES_ESPERA = ['Pendentes', 'Follow UP', 'Follow Up após proposta']
const FASES_AGENDAMENTO = ['Chamada Não Atendida', 'Necessidade de Visita', 'Visita Marcada']
const FASES_COM_REQUISITOS = [...FASES_AGENDAMENTO, ...FASES_ESPERA, 'Estudo de VVR', 'Criar Proposta ao Proprietário', 'Em negociação', 'Proposta aceite', ...MODELOS_FECHO]

const n = v => {
  const x = parseFloat(String(v ?? '').replace(',', '.'))
  return Number.isFinite(x) ? x : 0
}
const temTexto = v => v !== null && v !== undefined && String(v).trim() !== ''
const hojeLisboa = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Lisbon' })
const dataPt = d => String(d).slice(0, 10).split('-').reverse().join('/')
const isoData = v => (v instanceof Date ? (isNaN(v) ? '' : v.toISOString()) : String(v || '')).slice(0, 10)

// Dados que os requisitos leem. query(sql, params) → { rows }.
//   contactos: próxima chamada ou follow-up por fazer, do próprio imóvel ou no
//   contacto com o consultor em que o imóvel é assunto.
//   finalizado: Wholesaling com o CPCV de Cedência concluído — da parte da
//   Somnium o processo acabou; não se pedem documentos nem a visita.
export async function carregarDadosEntrada(query, id) {
  const { rows: [imovel] } = await query(
    `SELECT estado, ask_price, valor_venda_remodelado, valor_proposta, data_proposta, data_proposta_aceite,
            data_chamada, data_follow_up, motivo_follow_up, morada, artigo_matricial, descricao_predial,
            licenca_utilizacao, certificado_energetico, fotos FROM imoveis WHERE id = $1`, [id])
  if (!imovel) return null
  const [{ rows: visitas }, { rows: contactos }, { rows: fin }] = await Promise.all([
    query('SELECT data_hora, created_at, estado, investidor_id, ficha FROM visitas WHERE imovel_id = $1', [id]),
    query(`SELECT t.inicio, t.data_limite FROM tarefas t
            WHERE t.origem_tipo = 'imovel' AND t.origem_id = $1 AND t.origem_campo IN ('proxima_chamada', 'data_follow_up')
              AND t.status <> 'Concluída' AND COALESCE(t.arquivada, false) = false
           UNION ALL
           SELECT t.inicio, t.data_limite FROM contacto_assuntos a JOIN tarefas t ON t.id = a.origem_id
            WHERE a.origem = 'tarefa' AND a.imovel_id = $1 AND t.origem_campo = 'proximo_contacto'
              AND t.status <> 'Concluída' AND COALESCE(t.arquivada, false) = false`, [id]),
    query(`SELECT 1 FROM negocios n JOIN projeto_fases pf ON pf.negocio_id = n.id
            WHERE n.imovel_id = $1 AND n.deleted_at IS NULL AND n.categoria = 'Wholesaling'
              AND pf.fase_key = 'cpcv_cedencia' AND pf.estado = 'concluida' LIMIT 1`, [id]),
  ])
  return { imovel, visitas, contactos, finalizado: fin.length > 0 }
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
export function fichaMaisRecente(visitas) {
  const ordenadas = [...(visitas || [])].sort((a, b) =>
    String(b.data_hora || b.created_at || '').localeCompare(String(a.data_hora || a.created_at || '')))
  for (const v of ordenadas) {
    const f = normalizeFicha(v.ficha)
    if (temConteudo(f)) return f
  }
  return null
}

const lista = v => {
  if (Array.isArray(v)) return v
  if (typeof v === 'string') { try { const a = JSON.parse(v); return Array.isArray(a) ? a : [] } catch { return [] } }
  return []
}
const temSlot = (im, slot) => lista(im.fotos).some(f => f?.slot === slot)
// Estados do CE sem documento; as classes (A+ a F) pedem o certificado.
const CE_SEM_DOCUMENTO = ['Isento', 'Em obtenção', 'Não tem']

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

// Identificação legal e documentos para fechar o negócio. acao 'legal' =
// campos da ficha (a janela pede-os); 'documentacao' = carregar no separador
// Documentos (a análise da certidão e da caderneta preenche a ficha).
export function requisitosDocumentacao(im = {}) {
  const onde = 'Documentos'
  const doc = (id, titulo, slot) => {
    const ok = temSlot(im, slot)
    return item(id, titulo, ok ? 'ok' : 'por_fazer', ok ? null : 'Falta carregar no separador Documentos', 'documentacao', onde)
  }
  const out = [
    doc('doc_certidao', 'Certidão permanente', 'certidao_permanente'),
    doc('doc_caderneta', 'Caderneta predial', 'caderneta_predial'),
  ]
  const falta = [!temTexto(im.artigo_matricial) && 'o artigo matricial', !temTexto(im.descricao_predial) && 'a descrição predial'].filter(Boolean)
  out.push(item('legal_identificacao', 'Artigo matricial e descrição predial', falta.length ? 'por_fazer' : 'ok',
    falta.length ? `Falta ${falta.join(' e ')}` : null, 'legal', 'Situação legal'))

  const lu = String(im.licenca_utilizacao || '').trim()
  if (!lu) out.push(item('legal_lu', 'Licença de utilização', 'por_fazer', 'Falta escolher a situação da licença', 'legal', 'Situação legal'))
  else if (lu === 'Tem' && !temSlot(im, 'licenca_utilizacao')) out.push(item('legal_lu', 'Licença de utilização', 'por_fazer', 'Tem licença: falta carregar o documento', 'documentacao', onde))
  else out.push(item('legal_lu', 'Licença de utilização', 'ok', null, 'legal', 'Situação legal'))

  const ce = String(im.certificado_energetico || '').trim()
  if (!ce) out.push(item('legal_ce', 'Certificado energético', 'por_fazer', 'Falta escolher a classe ou a situação do certificado', 'legal', 'Situação legal'))
  else if (!CE_SEM_DOCUMENTO.includes(ce) && !temSlot(im, 'certificado_energetico')) out.push(item('legal_ce', 'Certificado energético', 'por_fazer', `Classe ${ce}: falta carregar o certificado`, 'documentacao', onde))
  else out.push(item('legal_ce', 'Certificado energético', 'ok', null, 'legal', 'Situação legal'))
  return out
}

// Requisitos para entrar numa fase. dados = { imovel, visitas }.
export function requisitosDeEntrada(estado, dados = {}) {
  const fase = limpaEstado(estado)
  const im = dados.imovel || {}
  // fase: a janela de registo usa-a para gravar o follow-up na fase certa.
  if (FASES_ESPERA.includes(fase)) {
    const motivo = temTexto(im.motivo_follow_up)
    const d = isoData(im.data_follow_up)
    const data = /^\d{4}-\d{2}-\d{2}$/.test(d) && d >= hojeLisboa()
    const falta = [!motivo && 'o motivo', !data && (d ? `uma data nova (a de ${dataPt(d)} já passou)` : 'a data')].filter(Boolean)
    const titulo = fase === 'Pendentes' ? 'Motivo e data de reativação' : 'Motivo e data do follow-up'
    return [{ ...item('follow_up', titulo, falta.length ? 'por_fazer' : 'ok', falta.length ? `Falta ${falta.join(' e ')}` : null, 'follow_up', 'Próximos passos'), fase }]
  }
  if (fase === 'Chamada Não Atendida') {
    const ok = (dados.contactos || []).length > 0
    return [item('chamada_agendada', 'Próxima tentativa agendada', ok ? 'ok' : 'por_fazer', ok ? null : 'Falta agendar a próxima chamada', 'chamada_agendada', 'Próximos passos')]
  }
  if (fase === 'Necessidade de Visita') {
    const ok = temTexto(im.data_chamada)
    return [item('chamada_registada', 'Primeira chamada registada', ok ? 'ok' : 'por_fazer', ok ? null : 'Falta a data da primeira chamada', 'chamada_registada', 'Ficha do imóvel')]
  }
  if (fase === 'Visita Marcada') {
    const ok = (dados.visitas || []).some(v => v.estado !== 'cancelada' && !v.investidor_id && v.data_hora)
    const morada = temTexto(im.morada)
    return [
      item('morada', 'Rua do imóvel', morada ? 'ok' : 'por_fazer', morada ? null : 'Falta a rua: sem ela não se sabe onde ir', 'morada', 'Ficha do imóvel'),
      item('visita_agendada', 'Visita marcada com data e hora', ok ? 'ok' : 'por_fazer', ok ? null : 'Falta marcar a visita', 'visita_agendada', 'Visitas'),
    ]
  }
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
    return [
      item('aceite', 'Proposta aceite', ok ? 'ok' : 'por_fazer', ok ? null : 'Falta a data de aceitação da proposta', 'aceite', 'Ficha do imóvel'),
      ...requisitosDocumentacao(im),
    ]
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
  // Imóvel que entrou numa fase de espera ou de agendamento antes do travão (D8).
  if ([...FASES_ESPERA, ...FASES_AGENDAMENTO].includes(atual)) {
    avisos.push(...requisitosDeEntrada(atual, dados).filter(i => i.estado !== 'ok'))
  }
  // Negócio fechado antes do travão da documentação (D7).
  if (MODELOS_FECHO.includes(atual) && !dados.finalizado) {
    avisos.push(...requisitosDocumentacao(dados.imovel || {}).filter(i => i.estado !== 'ok'))
  }
  const jaPassouEstudo = (tipo === 'principal' && idx >= indiceFase('Estudo de VVR')) || MODELOS_FECHO.includes(atual)
  if (jaPassouEstudo && !dados.finalizado && !fichaMaisRecente(dados.visitas)) {
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
