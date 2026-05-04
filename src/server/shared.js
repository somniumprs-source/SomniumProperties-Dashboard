/**
 * Shared dependencies for all server route modules.
 * Extracted from monolithic server.js.
 */
import { Client } from '@notionhq/client'
import {
  getNegócios, getDespesas, getImóveis, getInvestidores, getConsultores, getTarefas,
  round2 as round2PG,
} from '../db/queries.js'

// ── Notion Client ─────────────────────────────────────────────
export const notion = new Client({ auth: process.env.NOTION_API_KEY })

export const DB = {
  negócios:        process.env.NOTION_DB_FATURACAO,
  despesas:        process.env.NOTION_DB_DESPESAS,
  investidores:    process.env.NOTION_DB_INVESTIDORES,
  pipelineImoveis: process.env.NOTION_DB_PIPELINE_IMOVEIS,
  empreiteiros:    process.env.NOTION_DB_EMPREITEIROS,
  consultores:     process.env.NOTION_DB_CONSULTORES,
  projetos:        process.env.NOTION_DB_PROJETOS,
  pipeline:        process.env.NOTION_DB_PIPELINE,
  clientes:        process.env.NOTION_DB_CLIENTES,
  campanhas:       process.env.NOTION_DB_CAMPANHAS,
  obras:           process.env.NOTION_DB_OBRAS,
}

// ── Notion Property Helpers ───────────────────────────────────
export const title      = p => p?.title?.map(r => r.plain_text).join('') ?? ''
export const text       = p => p?.rich_text?.map(r => r.plain_text).join('') ?? ''
export const sel        = p => p?.select?.name ?? null
export const multisel   = p => (p?.multi_select ?? []).map(s => s.name)
export const statusProp = p => p?.status?.name ?? null
export const num        = p => p?.number ?? 0
export const dt         = p => p?.date?.start ?? null
export const emailProp  = p => p?.email ?? null
export const phoneProp  = p => p?.phone_number ?? null
export const formula    = p => p?.formula?.number ?? p?.formula?.string ?? null

// ── Utility Functions ─────────────────────────────────────────
export function round2(n) { return Math.round(n * 100) / 100 }

export const MES_ABREV = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']

export function getMesAtual() {
  const now = new Date()
  return { mesAbrev: MES_ABREV[now.getMonth()], ano: now.getFullYear(), month: now.getMonth() + 1 }
}

export function isMonth(dateStr, year, month) {
  if (!dateStr) return false
  const d = new Date(dateStr)
  return d.getFullYear() === year && d.getMonth() + 1 === month
}

export function isYear(dateStr, year) {
  if (!dateStr) return false
  return new Date(dateStr).getFullYear() === year
}

export function mesAbrevToNum(abrev) { return MES_ABREV.indexOf(abrev) + 1 }

export function daysBetween(d1, d2) {
  if (!d1 || !d2) return null
  const ms = new Date(d2) - new Date(d1)
  return ms > 0 ? round2(ms / 86400000) : null
}

export function avg(arr) {
  const valid = arr.filter(v => v != null && !isNaN(v))
  return valid.length > 0 ? round2(valid.reduce((s, v) => s + v, 0) / valid.length) : null
}

export async function queryAll(dbId, filter) {
  const results = []
  let cursor
  do {
    const res = await notion.databases.query({ database_id: dbId, filter, start_cursor: cursor, page_size: 100 })
    results.push(...res.results)
    cursor = res.has_more ? res.next_cursor : undefined
  } while (cursor)
  return results
}

// ── Mappers ───────────────────────────────────────────────────
export function mapNegocio(p) {
  const pr = p.properties
  return {
    id: p.id,
    movimento:        title(pr['Movimento']),
    categoria:        sel(pr['Categoria']),
    fase:             sel(pr['Fase']),
    lucroEstimado:    num(pr['Lucro estimado']),
    lucroReal:        num(pr['Lucro real']),
    custoRealObra:    num(pr['Custo Real de Obra']),
    dataVenda:        dt(pr['Data de venda']),
    dataEstimada:     dt(pr['Data estimada de venda']),
    dataCompra:       dt(pr['Data Compra']),
    data:             dt(pr['Data']),
    pagamentoEmFalta: pr['Pagamento em falta']?.checkbox ?? false,
    investidor:       pr['Investidor']?.relation?.map(r => r.id) ?? [],
    imovel:           pr['Imóvel']?.relation?.map(r => r.id) ?? [],
    consultorIds:     pr['Consultor']?.relation?.map(r => r.id) ?? [],
    notas:            text(pr['Notas']),
    quotaSomnium:     formula(pr['Quota Somnium €']),
    capitalTotal:     num(pr['Capital Total €']),
    nInvestidores:    num(pr['Nº Investidores']),
  }
}

export function mapDespesa(p) {
  const pr = p.properties
  const timing     = sel(pr['Timing Pagamento'])
  const custoMensal = num(pr['Custo Mensal'])
  const custoAnualFormula = formula(pr['Custo Anual']) ?? 0
  const custoAnualReal    = num(pr['Custo Anual (Real)'])
  const custoAnual = custoAnualFormula || custoAnualReal ||
    (timing === 'Mensalmente' ? custoMensal * 12 : custoMensal)
  return {
    id: p.id,
    movimento:  title(pr['Movimento']),
    categoria:  sel(pr['Categoria']),
    data:       dt(pr['Data']),
    custoMensal,
    custoAnual: round2(custoAnual),
    timing,
    notas:      text(pr['Notas']),
  }
}

export function mapPipeline(p) {
  const pr = p.properties
  return {
    id: p.id,
    nome:              title(pr['Obra / Oportunidade']),
    cliente:           text(pr['Cliente']),
    fase:              sel(pr['Fase']),
    tipoObra:          sel(pr['Tipo de Obra']),
    valorEstimado:     num(pr['Valor Estimado (€)']),
    valorContratado:   num(pr['Valor Contratado (€)']),
    probabilidade:     num(pr['Probabilidade (%)']),
    dataLead:          dt(pr['Data do Lead']),
    dataFechoPrevista: dt(pr['Data de Fecho Prevista']),
    dataFechoReal:     dt(pr['Data Fecho Real']),
    responsavel:       text(pr['Responsável']),
    origemLead:        sel(pr['Origem do Lead']),
    notas:             text(pr['Notas']),
  }
}

export function mapCliente(p) {
  const pr = p.properties
  return {
    id: p.id,
    nome:              title(pr['Nome / Empresa']),
    tipo:              sel(pr['Tipo']),
    segmento:          sel(pr['Segmento']),
    email:             emailProp(pr['Email']),
    telefone:          phoneProp(pr['Telefone']),
    nif:               text(pr['NIF']),
    localizacao:       text(pr['Localização']),
    valorFaturado:     num(pr['Valor Total Faturado (€)']),
    ultimaInteracao:   dt(pr['Última Interação']),
    dataAquisicao:     dt(pr['Data Aquisição']),
    nProjetos:         num(pr['Nº Projetos']),
    potencialRecompra: sel(pr['Potencial de Recompra']),
    notas:             text(pr['Notas']),
  }
}

export function mapCampanha(p) {
  const pr = p.properties
  return {
    id: p.id,
    campanha:          title(pr['Campanha']),
    canal:             sel(pr['Canal']),
    dataInicio:        dt(pr['Data Início']),
    dataFim:           dt(pr['Data Fim']),
    investimento:      num(pr['Investimento (€)']),
    leadsGerados:      num(pr['Leads Gerados']),
    leadsQualificados: num(pr['Leads Qualificados (SQL)']),
    custoPorLead:      num(pr['Custo por Lead (€)']),
    receitaAtribuida:  num(pr['Receita Atribuída (€)']),
    status:            sel(pr['Status']),
    notas:             text(pr['Notas']),
  }
}

export function mapObra(p) {
  const pr = p.properties
  return {
    id: p.id,
    nome:               title(pr['Nome da Obra']),
    cliente:            text(pr['Cliente']),
    tipoObra:           sel(pr['Tipo de Obra']),
    localizacao:        text(pr['Localização']),
    status:             sel(pr['Status']),
    dataInicioPrevista: dt(pr['Data Início Prevista']),
    dataInicioReal:     dt(pr['Data Início Real']),
    dataFimPrevista:    dt(pr['Data Fim Prevista']),
    dataFimReal:        dt(pr['Data Fim Real']),
    orcamentoAprovado:  num(pr['Orçamento Aprovado (€)']),
    custoReal:          num(pr['Custo Real (€)']),
    valorFaturado:      num(pr['Valor Faturado (€)']),
    desvioPct:          num(pr['Desvio de Orçamento (%)']),
    area:               num(pr['Área (m²)']),
    responsavel:        text(pr['Encarregado / Responsável']),
    naoConformidades:   num(pr['Não Conformidades']),
    notas:              text(pr['Notas']),
  }
}

export function mapImovel(p) {
  const pr = p.properties
  const zonaMulti = multisel(pr['Zona (Multi)'])
  const zonaLegacy = text(pr['Zona'])
  return {
    id: p.id,
    nome:              title(pr['Nome do Imóvel']),
    estado:            statusProp(pr['Estado']),
    tipologia:         text(pr['Tipologia']) || sel(pr['Tipologia']),
    askPrice:          num(pr['Ask Price']),
    valorProposta:     num(pr['Valor Proposta']),
    custoObra:         num(pr['Custo Estimado de Obra']),
    areaBruta:         num(pr['Área Bruta']),
    area:              num(pr['Área Bruta']),
    roi:               num(pr['ROI']),
    roiAnualizado:     num(pr['ROI Anualizado']),
    origem:            sel(pr['Origem']),
    zona:                  zonaMulti.length > 0 ? zonaMulti[0] : zonaLegacy,
    zonas:                 zonaMulti.length > 0 ? zonaMulti : (zonaLegacy ? [zonaLegacy] : []),
    projeto:               pr['Projeto']?.relation?.map(r => r.id) ?? [],
    nomeConsultor:         text(pr['Nome Consultor']),
    modeloNegocio:         sel(pr['Modelo de Negócio']),
    motivoDescarte:        sel(pr['Motivo Descarte']),
    valorVendaRemodelado:  num(pr['Valor de Venda Remodelado']),
    dataFollowUp:          dt(pr['Data Follow Up']),
    dataAdicionado:        dt(pr['Data Adicionado']),
    dataChamada:           dt(pr['Data Chamada']),
    dataVisita:            dt(pr['Data de Visita']),
    dataProposta:          dt(pr['Data da Proposta']),
    dataPropostaAceite:    dt(pr['Data Proposta Aceite']),
    dataEstudoMercado:     dt(pr['Data Estudo Mercado']),
    dataAceiteInvestidor:  dt(pr['Data de aceitação por investidor']),
  }
}

export function mapProjeto(p) {
  const pr = p.properties
  return {
    id: p.id,
    nome:          title(pr['Nome'] ?? pr['Projeto'] ?? pr['Nome do Projeto']),
    estado:        statusProp(pr['Estado']) ?? sel(pr['Estado']),
    tipo:          sel(pr['Tipo']),
    zona:          text(pr['Zona']) || (multisel(pr['Zona'])[0] ?? ''),
    dataInicio:    dt(pr['Data de Início']) ?? dt(pr['Data Início']),
    dataFim:       dt(pr['Data de Fim']) ?? dt(pr['Data Fim']),
    imovel:        pr['Imóvel']?.relation?.map(r => r.id) ?? [],
    notas:         text(pr['Notas']),
    createdTime:   p.created_time,
  }
}

export function mapInvestidor(p) {
  const pr = p.properties
  return {
    id: p.id,
    nome:                    title(pr['Nome']),
    status:                  statusProp(pr['Status']),
    classificacao:           multisel(pr['Classificação']),
    pontuacao:               num(pr['Pontuação Classificação']),
    capitalMin:              num(pr['Capital mínimo']),
    capitalMax:              num(pr['Capital máximo']),
    montanteInvestido:       num(pr['Montante Investido (euro)']),
    numeroNegocios:          num(pr['Numero de Negocios']),
    estrategia:              multisel(pr['Estratégia de Investimento']),
    origem:                  sel(pr['Origem']),
    ndaAssinado:             pr['NDA Assinado']?.checkbox ?? false,
    dataReuniao:             dt(pr['Data Reunião']),
    dataPrimeiroContacto:    dt(pr['Data de Primeiro Contacto']),
    dataUltimoContacto:      dt(pr['Data de Último Contacto']),
    dataCapitalTransferido:  dt(pr['Data Capital Transferido']),
    dataProximaAcao:         dt(pr['Data Proxima Acao']),
    diasSemContacto:         formula(pr['Dias sem contacto']) ?? null,
    proximaAcao:             text(pr['Proxima Acao']),
    tipoInvestidor:          multisel(pr['Tipo de Investidor']),
    perfilRisco:              sel(pr['Perfil de Risco']),
    roiInvestidor:            num(pr['ROI Investidor %']),
    roiAnualizadoInvestidor:  num(pr['ROI Anualizado Investidor %']),
    motivoNaoAprovacao:       text(pr['Motivo Não Aprovação']),
    motivoInatividade:        text(pr['Motivo Inatividade']),
    dataApresentacaoNegocio:  dt(pr['Data Apresentação Negócio']),
    dataAprovacaoNegocio:     dt(pr['Data Aprovação Negócio']),
  }
}

export function mapEmpreiteiro(p) {
  const pr = p.properties
  return {
    id: p.id,
    nome:              title(pr['Nome']),
    empresa:           text(pr['Empresa']),
    estado:            sel(pr['Estado']),
    zona:              multisel(pr['Zona']),
    especializacao:    multisel(pr['Especialização']),
    score:             num(pr['Score']),
    custoMedioM2:      num(pr['Custo Médio m2']),
    fonte:             sel(pr['Fonte']),
    contratoFormalizado: pr['Contrato Formalizado']?.checkbox ?? false,
  }
}

export function mapConsultor(p) {
  const pr = p.properties
  return {
    id:                  p.id,
    nome:                title(pr['Nome']),
    estatuto:            statusProp(pr['Estatuto']),
    tipo:                sel(pr['Tipo']),
    classificacao:       sel(pr['Classificação']),
    imobiliaria:         multisel(pr['Imobiliária']),
    zonas:               multisel(pr['Zona de Atuação']),
    contacto:            text(pr['Contacto']),
    email:               emailProp(pr['Email']),
    equipaRemax:         text(pr['Equipa REMAX']),
    dataInicio:          dt(pr['Data de Início']),
    dataFollowUp:        dt(pr['Data Follow up']),
    dataProximoFollowUp: dt(pr['Data Proximo follow up']),
    motivoFollowUp:      text(pr['Motivo de Follow Up']),
    imoveisEnviados:     num(pr['Imoveis enviado publicados']),
    imoveisOffMarket:    num(pr['Imoveis Off/Market ']),
    metaMensalLeads:     num(pr['Meta Mensal Leads']),
    comissao:            num(pr['Comissão %']),
    dataPrimeiraCall:    dt(pr['Data Primeira Call']),
    lucroGerado:         num(pr['Lucro Gerado €']),
    motivoDescontinuacao: text(pr['Motivo Descontinuação']),
  }
}

// ── Data Getters (PostgreSQL) ─────────────────────────────────
export { getNegócios, getDespesas, getImóveis, getInvestidores, getConsultores, getTarefas }

// Legacy getters (retornam vazio — DBs inacessíveis)
export const getEmpreiteiros = async () => []
export const getProjetos     = async () => []
export const getPipeline     = async () => []
export const getClientes     = async () => []
export const getCampanhas    = async () => []
export const getObras        = async () => []

// ── Cache ─────────────────────────────────────────────────────
export const cache = new Map()

// ── Comercial Constants ───────────────────────────────────────
export const ESTADOS_NEGATIVOS = ['Descartado', 'Nao interessa', 'Não interessa', 'Cancelado']

export const FUNIL_IMOVEIS = [
  'Em Análise', 'Visita Marcada', 'Follow UP', 'Estudo de VVR',
  'Enviar proposta ao investidor', 'Wholesaling', 'Negócio em Curso',
]

export const FUNIL_INVESTIDORES = [
  'Potencial Investidor', 'Potencial',
  'Marcar call', 'Marcar Call',
  'Call marcada', 'Call Marcada',
  'Follow Up',
  'Investidor em espera', 'Classificado',
  'Investidor em parceria', 'Em Parceria',
]

export const FUNIL_INV_LABEL = {
  'Potencial Investidor':    'Potencial',
  'Marcar call':             'Marcar Call',
  'Call marcada':            'Call Marcada',
  'Investidor em espera': 'Classificado',
  'Investidor em parceria':  'Em Parceria',
}
