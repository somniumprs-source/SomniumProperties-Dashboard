/**
 * Queries PostgreSQL que substituem as funções Notion do server.js.
 * Drop-in replacement: mesma estrutura de dados, fonte diferente.
 */
import pool from './pg.js'

function round2(n) { return Math.round(n * 100) / 100 }

// ── Mappers (DB row → API format, compatível com o frontend existente) ──

function mapNegocio(r) {
  return {
    id: r.id, movimento: r.movimento, categoria: r.categoria, fase: r.fase,
    lucroEstimado: r.lucro_estimado || 0, lucroReal: r.lucro_real || 0,
    custoRealObra: r.custo_real_obra || 0, dataVenda: r.data_venda,
    dataEstimada: r.data_estimada_venda, dataCompra: r.data_compra, data: r.data,
    pagamentoEmFalta: !!r.pagamento_em_falta,
    investidor: r.investidor_ids ? JSON.parse(r.investidor_ids) : [],
    imovel: r.imovel_id ? [r.imovel_id] : [],
    consultorIds: r.consultor_ids ? JSON.parse(r.consultor_ids) : [],
    notas: r.notas, quotaSomnium: r.quota_somnium || 0,
    capitalTotal: r.capital_total || 0, nInvestidores: r.n_investidores || 0,
  }
}

function mapDespesa(r) {
  return {
    id: r.id, movimento: r.movimento, categoria: r.categoria, data: r.data,
    custoMensal: r.custo_mensal || 0, custoAnual: r.custo_anual || 0, timing: r.timing,
    notas: r.notas,
  }
}

function mapImovel(r) {
  const zonas = r.zonas ? JSON.parse(r.zonas) : []
  return {
    id: r.id, nome: r.nome, estado: (r.estado || '').replace(/^\d+-\s*/, '').replace('Nao interessa', 'Não interessa'),
    tipologia: r.tipologia, askPrice: r.ask_price || 0,
    valorProposta: r.valor_proposta || 0, custoObra: r.custo_estimado_obra || 0,
    areaUtil: r.area_util, areaBruta: r.area_bruta,
    area: r.area_util || r.area_bruta || 0,
    roi: r.roi || 0, roiAnualizado: r.roi_anualizado || 0,
    origem: r.origem, zona: r.zona, zonas,
    nomeConsultor: r.nome_consultor, modeloNegocio: r.modelo_negocio,
    motivoDescarte: r.motivo_descarte,
    valorVendaRemodelado: r.valor_venda_remodelado || 0,
    dataFollowUp: r.data_follow_up, dataAdicionado: r.data_adicionado,
    dataChamada: r.data_chamada, dataVisita: r.data_visita,
    dataProposta: r.data_proposta, dataPropostaAceite: r.data_proposta_aceite,
    dataEstudoMercado: r.data_estudo_mercado,
    dataAceiteInvestidor: r.data_aceite_investidor,
    link: r.link, notas: r.notas,
  }
}

function mapInvestidor(r) {
  return {
    id: r.id, nome: r.nome, status: r.status,
    classificacao: r.classificacao ? [r.classificacao] : [],
    pontuacao: r.pontuacao || 0,
    capitalMin: r.capital_min || 0, capitalMax: r.capital_max || 0,
    montanteInvestido: r.montante_investido || 0,
    numeroNegocios: r.numero_negocios || 0,
    estrategia: r.estrategia ? JSON.parse(r.estrategia) : [],
    origem: r.origem, ndaAssinado: !!r.nda_assinado,
    tipoInvestidor: r.tipo_investidor ? JSON.parse(r.tipo_investidor) : [],
    perfilRisco: r.perfil_risco, telemovel: r.telemovel, email: r.email,
    proximaAcao: r.proxima_acao,
    roiInvestidor: r.roi_investidor || 0,
    roiAnualizadoInvestidor: r.roi_anualizado_investidor || 0,
    motivoNaoAprovacao: r.motivo_nao_aprovacao,
    motivoInatividade: r.motivo_inatividade,
    dataReuniao: r.data_reuniao, dataPrimeiroContacto: r.data_primeiro_contacto,
    dataUltimoContacto: r.data_ultimo_contacto,
    dataCapitalTransferido: r.data_capital_transferido,
    dataProximaAcao: r.data_proxima_acao,
    dataApresentacaoNegocio: r.data_apresentacao_negocio,
    dataAprovacaoNegocio: r.data_aprovacao_negocio,
    diasSemContacto: (() => {
      const u = r.data_ultimo_contacto ?? r.data_reuniao ?? r.data_primeiro_contacto
      if (!u) return null
      return Math.floor((Date.now() - new Date(u)) / 86400000)
    })(),
    notas: r.notas,
  }
}

function mapConsultor(r) {
  return {
    id: r.id, nome: r.nome, estatuto: r.estatuto, tipo: r.tipo,
    classificacao: r.classificacao,
    imobiliaria: r.imobiliaria ? JSON.parse(r.imobiliaria) : [],
    zonas: r.zonas ? JSON.parse(r.zonas) : [],
    contacto: r.contacto, email: r.email, equipaRemax: r.equipa_remax,
    dataInicio: r.data_inicio, dataFollowUp: r.data_follow_up,
    dataProximoFollowUp: r.data_proximo_follow_up,
    motivoFollowUp: r.motivo_follow_up,
    imoveisEnviados: r.imoveis_enviados || 0,
    imoveisOffMarket: r.imoveis_off_market || 0,
    metaMensalLeads: r.meta_mensal_leads || 0,
    comissao: r.comissao || 0, dataPrimeiraCall: r.data_primeira_call,
    lucroGerado: r.lucro_gerado || 0,
    motivoDescontinuacao: r.motivo_descontinuacao,
    notas: r.notas,
  }
}

// ── Query functions (same API as Notion getters) ─────────────

export async function getNegócios() {
  const { rows } = await pool.query('SELECT * FROM negocios')
  return rows.map(mapNegocio)
}

export async function getDespesas() {
  const { rows } = await pool.query('SELECT * FROM despesas')
  return rows.map(mapDespesa)
}

export async function getImóveis() {
  const { rows } = await pool.query('SELECT * FROM imoveis')
  return rows.map(mapImovel)
}

export async function getInvestidores() {
  const { rows } = await pool.query('SELECT * FROM investidores')
  return rows.map(mapInvestidor)
}

export async function getConsultores() {
  const { rows } = await pool.query('SELECT * FROM consultores')
  return rows.map(mapConsultor)
}

export async function getTarefas() {
  const { rows } = await pool.query('SELECT * FROM tarefas ORDER BY inicio DESC')
  return rows.map(r => ({
    id: r.id, tarefa: r.tarefa, status: r.status,
    inicio: r.inicio, fim: r.fim, funcionario: r.funcionario,
    tempoHoras: r.tempo_horas || 0, grupoId: r.grupo_id,
  }))
}

export { round2 }
