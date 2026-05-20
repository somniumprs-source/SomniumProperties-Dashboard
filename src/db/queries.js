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
    pagamentosFaseados: (() => {
      try {
        const v = typeof r.pagamentos_faseados === 'string' ? JSON.parse(r.pagamentos_faseados) : r.pagamentos_faseados
        return Array.isArray(v) ? v : []
      } catch { return [] }
    })(),
  }
}

function parseRateio(raw) {
  if (!raw) return null
  try {
    const obj = typeof raw === 'string' ? JSON.parse(raw) : raw
    if (!obj || typeof obj !== 'object') return null
    // Normalizar: descartar entradas <=0 e devolver só se sobrarem pelo menos 2 regiões.
    const clean = {}
    for (const [k, v] of Object.entries(obj)) {
      const n = parseFloat(v)
      if (Number.isFinite(n) && n > 0) clean[k] = n
    }
    return Object.keys(clean).length >= 2 ? clean : null
  } catch { return null }
}

function mapDespesa(r) {
  return {
    id: r.id, movimento: r.movimento, categoria: r.categoria, data: r.data,
    custoMensal: r.custo_mensal || 0, custoAnual: r.custo_anual || 0, timing: r.timing,
    notas: r.notas,
    regiao: r.regiao || null,
    rateio: parseRateio(r.rateio),
  }
}

// Quando uma região está activa, aplica o rateio (se houver) escalando os custos
// pela fracção da região. Despesas sem rateio mas com `regiao` certa passam intactas;
// despesas com rateio são incluídas com custos escalados.
function aplicarRateioRegiao(despesas, regiao) {
  if (!regiao) return despesas
  const out = []
  for (const d of despesas) {
    if (d.rateio && d.rateio[regiao] != null) {
      const frac = d.rateio[regiao]
      out.push({
        ...d,
        custoMensal: round2((d.custoMensal || 0) * frac),
        custoAnual: round2((d.custoAnual || 0) * frac),
        rateioFraccao: frac,
        partilhada: true,
      })
    } else if (!d.rateio && d.regiao === regiao) {
      out.push(d)
    }
  }
  return out
}

function mapImovel(r) {
  const zonas = r.zonas ? JSON.parse(r.zonas) : []
  return {
    id: r.id, nome: r.nome, estado: (r.estado || '').replace(/^\d+-\s*/, '').replace('Nao interessa', 'Não interessa'),
    tipologia: r.tipologia, askPrice: r.ask_price || 0,
    valorProposta: r.valor_proposta || 0, custoObra: r.custo_estimado_obra || 0,
    areaBruta: r.area_bruta,
    area: r.area_bruta || 0,
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
    // Módulo gestão consultores
    scorePrioridade: r.score_prioridade || 0,
    taxaQualidade: r.taxa_qualidade || 0,
    tempoMedioResposta: r.tempo_medio_resposta,
    estadoAvaliacao: r.estado_avaliacao || 'Em avaliação',
    createdAt: r.created_at,
  }
}

// ── Query functions (same API as Notion getters) ─────────────

// Helper: aceita opcionalmente `{ regiao }` e injecta WHERE regiao = $1 quando
// presente. Mantém retro-compatibilidade com chamadas sem argumento.
function regiaoWhere(regiao) {
  return regiao ? { clause: ' WHERE regiao = $1', params: [regiao] } : { clause: '', params: [] }
}

export async function getNegócios({ regiao } = {}) {
  const w = regiaoWhere(regiao)
  const { rows } = await pool.query(`SELECT * FROM negocios${w.clause}`, w.params)
  return rows.map(mapNegocio)
}

export async function getDespesas({ regiao } = {}) {
  // Quando há região activa, precisamos também das despesas com rateio que
  // toquem nessa região (independentemente da coluna `regiao` directa). Por
  // isso o filtro SQL não pode ser estrito — fazemos `WHERE regiao = $1 OR
  // rateio IS NOT NULL` e refinamos em JS via aplicarRateioRegiao.
  if (regiao) {
    const { rows } = await pool.query(
      `SELECT * FROM despesas WHERE regiao = $1 OR rateio IS NOT NULL`, [regiao])
    return aplicarRateioRegiao(rows.map(mapDespesa), regiao)
  }
  const { rows } = await pool.query(`SELECT * FROM despesas`)
  return rows.map(mapDespesa)
}

// SELECT * trazia 79 colunas (média ~10KB/linha, sobretudo o JSON `fotos`)
// só para o mapImovel usar 25 destes campos. Tabela de 30 linhas demorava
// ~800ms em cold; com SELECT explícito desce para ~300ms (-60%).
const IMOVEIS_COLS = `id, nome, estado, tipologia, ask_price, valor_proposta,
  custo_estimado_obra, area_bruta, roi, roi_anualizado, origem, zona, zonas,
  nome_consultor, modelo_negocio, motivo_descarte, valor_venda_remodelado,
  data_follow_up, data_adicionado, data_chamada, data_visita, data_proposta,
  data_proposta_aceite, data_estudo_mercado, data_aceite_investidor, link, notas,
  regiao, concelho, freguesia`

export async function getImóveis({ regiao } = {}) {
  const w = regiaoWhere(regiao)
  const { rows } = await pool.query(`SELECT ${IMOVEIS_COLS} FROM imoveis${w.clause}`, w.params)
  return rows.map(mapImovel)
}

export async function getInvestidores({ regiao } = {}) {
  // Investidores são pool unificado — filtro só quando explicitamente pedido,
  // procurando o nome da região dentro do array JSON `regioes_preferidas`.
  if (regiao) {
    const { rows } = await pool.query(
      `SELECT * FROM investidores WHERE regioes_preferidas LIKE $1`, [`%"${regiao}"%`])
    return rows.map(mapInvestidor)
  }
  const { rows } = await pool.query('SELECT * FROM investidores')
  return rows.map(mapInvestidor)
}

export async function getConsultores({ regiao } = {}) {
  const w = regiaoWhere(regiao)
  const { rows } = await pool.query(`SELECT * FROM consultores${w.clause}`, w.params)
  return rows.map(mapConsultor)
}

export async function getTarefas({ regiao } = {}) {
  const w = regiaoWhere(regiao)
  const { rows } = await pool.query(`SELECT * FROM tarefas${w.clause} ORDER BY inicio DESC`, w.params)
  return rows.map(r => ({
    id: r.id, tarefa: r.tarefa, status: r.status, categoria: r.categoria,
    inicio: r.inicio, fim: r.fim, funcionario: r.funcionario,
    tempoHoras: r.tempo_horas || 0, grupoId: r.grupo_id,
  }))
}

// ── Visitas ────────────────────────────────────────────────────
function mapVisita(r) {
  return {
    id: r.id,
    imovelId: r.imovel_id,
    dataHora: r.data_hora instanceof Date ? r.data_hora.toISOString() : r.data_hora,
    estado: r.estado,
    investidorId: r.investidor_id,
    consultorId: r.consultor_id,
    resultado: r.resultado,
    notas: r.notas,
    createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : r.created_at,
    updatedAt: r.updated_at instanceof Date ? r.updated_at.toISOString() : r.updated_at,
  }
}

export async function getVisitas({ imovelId, regiao } = {}) {
  const conds = []
  const params = []
  if (imovelId) { params.push(imovelId); conds.push(`imovel_id = $${params.length}`) }
  if (regiao)   { params.push(regiao);   conds.push(`regiao = $${params.length}`) }
  const where = conds.length ? `WHERE ${conds.join(' AND ')}` : ''
  const { rows } = await pool.query(`SELECT * FROM visitas ${where} ORDER BY data_hora DESC`, params)
  return rows.map(mapVisita)
}

export async function getVisitasEnriquecidas({ imovelId } = {}) {
  const params = []
  let where = ''
  if (imovelId) { params.push(imovelId); where = `WHERE v.imovel_id = $1` }
  const { rows } = await pool.query(`
    SELECT v.*,
           inv.nome AS investidor_nome,
           con.nome AS consultor_nome,
           im.nome AS imovel_nome
      FROM visitas v
      LEFT JOIN investidores inv ON inv.id = v.investidor_id
      LEFT JOIN consultores con  ON con.id = v.consultor_id
      LEFT JOIN imoveis im       ON im.id  = v.imovel_id
      ${where}
      ORDER BY v.data_hora DESC
  `, params)
  return rows.map(r => ({
    ...mapVisita(r),
    investidorNome: r.investidor_nome,
    consultorNome: r.consultor_nome,
    imovelNome: r.imovel_nome,
  }))
}

/**
 * Mantem imoveis.data_visita = data da ultima visita realizada (data_hora <= NOW()).
 * Chamado em todas as mutacoes de visitas. Idempotente.
 */
export async function syncDataVisitaDerivada(imovelId) {
  if (!imovelId) return
  const { rows } = await pool.query(
    `SELECT MAX(data_hora) AS d FROM visitas
       WHERE imovel_id = $1 AND estado = 'realizada' AND data_hora <= NOW()`,
    [imovelId]
  )
  const ultima = rows[0]?.d
  await pool.query(
    `UPDATE imoveis SET data_visita = $1, updated_at = NOW()::TEXT WHERE id = $2`,
    [ultima ? new Date(ultima).toISOString().slice(0, 10) : null, imovelId]
  )
}

export { round2 }
