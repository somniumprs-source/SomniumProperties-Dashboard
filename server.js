import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import { Client } from '@notionhq/client'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const app = express()
app.use(cors())
app.use(express.json())

const notion = new Client({ auth: process.env.NOTION_API_KEY })

const DB = {
  negócios:        process.env.NOTION_DB_FATURACAO,         // Faturação — negócios / deals
  despesas:        process.env.NOTION_DB_DESPESAS,           // Despesas operacionais
  investidores:    process.env.NOTION_DB_INVESTIDORES,
  pipelineImoveis: process.env.NOTION_DB_PIPELINE_IMOVEIS,
  empreiteiros:    process.env.NOTION_DB_EMPREITEIROS,
  consultores:     process.env.NOTION_DB_CONSULTORES,
  projetos:        process.env.NOTION_DB_PROJETOS,           // Projetos (linked to Pipeline Imóveis)
  pipeline:        process.env.NOTION_DB_PIPELINE,
  clientes:        process.env.NOTION_DB_CLIENTES,
  campanhas:       process.env.NOTION_DB_CAMPANHAS,
  obras:           process.env.NOTION_DB_OBRAS,
}

// ── Helpers ──────────────────────────────────────────────────────
const title      = p => p?.title?.map(r => r.plain_text).join('') ?? ''
const text       = p => p?.rich_text?.map(r => r.plain_text).join('') ?? ''
const sel        = p => p?.select?.name ?? null
const multisel   = p => (p?.multi_select ?? []).map(s => s.name)
const statusProp = p => p?.status?.name ?? null
const num        = p => p?.number ?? 0
const dt         = p => p?.date?.start ?? null
const email      = p => p?.email ?? null
const phone      = p => p?.phone_number ?? null
const formula    = p => p?.formula?.number ?? p?.formula?.string ?? null

function round2(n) { return Math.round(n * 100) / 100 }

const MES_ABREV    = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']

function getMesAtual() {
  const now = new Date()
  return { mesAbrev: MES_ABREV[now.getMonth()], ano: now.getFullYear(), month: now.getMonth() + 1 }
}

function isMonth(dateStr, year, month) {
  if (!dateStr) return false
  const d = new Date(dateStr)
  return d.getFullYear() === year && d.getMonth() + 1 === month
}

function isYear(dateStr, year) {
  if (!dateStr) return false
  return new Date(dateStr).getFullYear() === year
}

function mesAbrevToNum(abrev) { return MES_ABREV.indexOf(abrev) + 1 }

async function queryAll(dbId, filter) {
  const results = []
  let cursor
  do {
    const res = await notion.databases.query({ database_id: dbId, filter, start_cursor: cursor, page_size: 100 })
    results.push(...res.results)
    cursor = res.has_more ? res.next_cursor : undefined
  } while (cursor)
  return results
}

// ── Mappers ───────────────────────────────────────────────────────
function mapNegocio(p) {
  const pr = p.properties
  return {
    id: p.id,
    movimento:        title(pr['Movimento']),
    categoria:        sel(pr['Categoria']),      // Wholesalling | CAEP | Mediação Imobiliária | Fix and Flip
    fase:             sel(pr['Fase']),            // Fase de obras | Fase de venda | Vendido
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

function mapDespesa(p) {
  const pr = p.properties
  const timing     = sel(pr['Timing Pagamento'])  // Mensalmente | Anual | Único
  const custoMensal = num(pr['Custo Mensal'])
  const custoAnualFormula = formula(pr['Custo Anual']) ?? 0
  const custoAnualReal    = num(pr['Custo Anual (Real)'])
  // Prefer formula result → real → calculated fallback
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

function mapPipeline(p) {
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

function mapCliente(p) {
  const pr = p.properties
  return {
    id: p.id,
    nome:              title(pr['Nome / Empresa']),
    tipo:              sel(pr['Tipo']),
    segmento:          sel(pr['Segmento']),
    email:             email(pr['Email']),
    telefone:          phone(pr['Telefone']),
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

function mapCampanha(p) {
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

function mapObra(p) {
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

function mapImovel(p) {
  const pr = p.properties
  // Zona: prefer new multi_select field, fallback to legacy rich_text
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
    areaUtil:          num(pr['Área Util']),
    areaBruta:         num(pr['Área Bruta']),
    area:              num(pr['Área Util']) || num(pr['Área Bruta']),
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

function mapProjeto(p) {
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

function mapInvestidor(p) {
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

function mapEmpreiteiro(p) {
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

function mapConsultor(p) {
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
    email:               email(pr['Email']),
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

// ── Cache 30s ─────────────────────────────────────────────────────
const cache = new Map()
async function cached(key, ttlMs, fn) {
  const hit = cache.get(key)
  if (hit && Date.now() - hit.ts < ttlMs) return hit.data
  const data = await fn()
  cache.set(key, { data, ts: Date.now() })
  return data
}

const getNegócios    = () => cached('neg',  30000, async () => (await queryAll(DB.negócios)).map(mapNegocio))
const getDespesas    = () => cached('des',  30000, async () => (await queryAll(DB.despesas)).map(mapDespesa))
const getImóveis     = () => cached('imo',  30000, async () => (await queryAll(DB.pipelineImoveis)).map(mapImovel))
const getInvestidores= () => cached('inv',  30000, async () => (await queryAll(DB.investidores)).map(mapInvestidor))
const getEmpreiteiros  = () => cached('emp',  30000, async () => (await queryAll(DB.empreiteiros)).map(mapEmpreiteiro))
const getConsultores   = () => cached('cons', 30000, async () => DB.consultores ? (await queryAll(DB.consultores)).map(mapConsultor) : [])
const getProjetos    = () => cached('proj', 30000, async () => DB.projetos ? (await queryAll(DB.projetos)).map(mapProjeto) : [])
const getPipeline    = () => cached('pip',  30000, async () => (await queryAll(DB.pipeline)).map(mapPipeline))
const getClientes    = () => cached('cli',  30000, async () => (await queryAll(DB.clientes)).map(mapCliente))
const getCampanhas   = () => cached('camp', 30000, async () => (await queryAll(DB.campanhas)).map(mapCampanha))
const getObras       = () => cached('obr',  30000, async () => (await queryAll(DB.obras)).map(mapObra))

// ════════════════════════════════════════════════════════════════
// FINANCEIRO — Wholesaling Imobiliário
// ════════════════════════════════════════════════════════════════
app.get('/api/kpis/financeiro', async (req, res) => {
  try {
    const [negócios, despesas] = await Promise.all([getNegócios(), getDespesas()])

    const lucroEstimadoTotal = round2(negócios.reduce((s,n) => s + n.lucroEstimado, 0))
    const lucroRealTotal     = round2(negócios.reduce((s,n) => s + n.lucroReal, 0))
    const pendentes          = negócios.filter(n => n.pagamentoEmFalta)
    const lucroPendente      = round2(pendentes.reduce((s,n) => s + n.lucroEstimado, 0))
    const negóciosAtivos     = negócios.filter(n => n.fase !== 'Vendido')

    // Burn rate — despesas mensais recorrentes
    const burnRate = round2(despesas
      .filter(d => d.timing === 'Mensalmente')
      .reduce((s,d) => s + d.custoMensal, 0))
    const despesasAnuaisTotal = round2(despesas.reduce((s,d) => s + d.custoAnual, 0))
    const runway = burnRate > 0 ? round2(lucroPendente / burnRate) : null

    // Por categoria
    const porCategoria = {}
    for (const n of negócios) {
      const k = n.categoria ?? 'Outro'
      if (!porCategoria[k]) porCategoria[k] = { count: 0, lucroEst: 0, lucroReal: 0 }
      porCategoria[k].count++
      porCategoria[k].lucroEst  += n.lucroEstimado
      porCategoria[k].lucroReal += n.lucroReal
    }
    const categorias = Object.entries(porCategoria).map(([cat, v]) => ({
      categoria: cat, count: v.count,
      lucroEst:  round2(v.lucroEst), lucroReal: round2(v.lucroReal),
    }))

    // Por fase
    const FASES = ['Fase de obras', 'Fase de venda', 'Vendido']
    const porFase = FASES.map(f => ({
      fase: f,
      count: negócios.filter(n => n.fase === f).length,
      lucroEst: round2(negócios.filter(n => n.fase === f).reduce((s,n) => s + n.lucroEstimado, 0)),
    }))

    res.json({
      lucroEstimadoTotal, lucroRealTotal, lucroPendente,
      burnRate, despesasAnuaisTotal, runway,
      negóciosAtivos:    negóciosAtivos.length,
      negociosPendentes: pendentes.length,
      totalNegócios:     negócios.length,
      categorias, porFase,
      negociosLista:     negócios,
    })
  } catch (err) {
    console.error('[financeiro]', err.message)
    res.status(500).json({ error: err.message })
  }
})

// ── Despesas operacionais ────────────────────────────────────────
app.get('/api/financeiro/despesas', async (req, res) => {
  try {
    const despesas = await getDespesas()

    const recorrentes = despesas.filter(d => d.timing === 'Mensalmente')
    const anuais      = despesas.filter(d => d.timing === 'Anual')
    const unicaVez    = despesas.filter(d => d.timing === 'Único')
    const burnRate    = round2(recorrentes.reduce((s,d) => s + d.custoMensal, 0))

    const porCategoria = {}
    for (const d of despesas) {
      const k = d.categoria ?? 'Outros'
      if (!porCategoria[k]) porCategoria[k] = { custoMensal: 0, custoAnual: 0, count: 0 }
      porCategoria[k].custoMensal += d.custoMensal
      porCategoria[k].custoAnual  += d.custoAnual
      porCategoria[k].count++
    }
    const categorias = Object.entries(porCategoria)
      .map(([cat, v]) => ({ categoria: cat, custoMensal: round2(v.custoMensal), custoAnual: round2(v.custoAnual), count: v.count }))
      .sort((a,b) => b.custoAnual - a.custoAnual)

    res.json({
      burnRate, burnRateAnual: round2(burnRate * 12),
      totalAnual: round2(despesas.reduce((s,d) => s + d.custoAnual, 0)),
      recorrentes, anuais, unicaVez, todas: despesas, categorias,
    })
  } catch (err) {
    console.error('[financeiro/despesas]', err.message)
    res.status(500).json({ error: err.message })
  }
})

// ── Cash Flow & Runway ───────────────────────────────────────────
app.get('/api/financeiro/cashflow', async (req, res) => {
  try {
    const [negócios, despesas] = await Promise.all([getNegócios(), getDespesas()])

    const pendentes  = negócios.filter(n => n.pagamentoEmFalta)
    const recebidos  = negócios.filter(n => !n.pagamentoEmFalta && n.lucroReal > 0)
    const burnRate   = round2(despesas.filter(d => d.timing === 'Mensalmente').reduce((s,d) => s + d.custoMensal, 0))

    const lucroPendente = round2(pendentes.reduce((s,n) => s + n.lucroEstimado, 0))
    const lucroRecebido = round2(recebidos.reduce((s,n) => s + n.lucroReal, 0))
    const runway = burnRate > 0 ? round2(lucroPendente / burnRate) : null

    const pendentesOrdenados = [...pendentes].sort((a,b) => {
      const da = a.dataEstimada ?? a.dataVenda ?? '9999'
      const db = b.dataEstimada ?? b.dataVenda ?? '9999'
      return da.localeCompare(db)
    })

    res.json({ lucroPendente, lucroRecebido, burnRate, runway, pendentes: pendentesOrdenados, recebidos })
  } catch (err) {
    console.error('[financeiro/cashflow]', err.message)
    res.status(500).json({ error: err.message })
  }
})

// ── dummy endpoints kept for /api/kpis aggregate compat ─────────
app.get('/api/financeiro/pl',     async (_req, res) => res.json({}))
app.get('/api/financeiro/aging',  async (_req, res) => res.json({ summary: [], buckets: {} }))
app.get('/api/financeiro/budget', async (_req, res) => res.json({ linhas: [] }))

app.get('/api/financeiro/historico', async (req, res) => {
  try {
    const negócios = await getNegócios()
    // Agrupamos por mês de dataVenda ou data
    const porMes = {}
    for (const n of negócios) {
      const d = n.dataVenda ?? n.data
      if (!d) continue
      const dt2 = new Date(d)
      const key = `${dt2.getFullYear()}-${String(dt2.getMonth()+1).padStart(2,'0')}`
      const label = `${MES_ABREV[dt2.getMonth()]} ${String(dt2.getFullYear()).slice(2)}`
      if (!porMes[key]) porMes[key] = { label, lucroEst: 0, lucroReal: 0, count: 0 }
      porMes[key].lucroEst  += n.lucroEstimado
      porMes[key].lucroReal += n.lucroReal
      porMes[key].count++
    }
    const meses = Object.entries(porMes)
      .sort(([a],[b]) => a.localeCompare(b))
      .map(([, v]) => ({ ...v, lucroEst: round2(v.lucroEst), lucroReal: round2(v.lucroReal) }))
    res.json({ meses })
  } catch (err) {
    console.error('[financeiro/historico]', err.message)
    res.status(500).json({ error: err.message })
  }
})


// ════════════════════════════════════════════════════════════════
// COMERCIAL — Wholesaling Imobiliário
// ════════════════════════════════════════════════════════════════

// Estados do pipeline imóveis que estão "activos"
const ESTADOS_NEGATIVOS = ['Descartado', 'Nao interessa', 'Não interessa', 'Cancelado']

// Funil do pipeline imóveis (ordem lógica)
const FUNIL_IMOVEIS = [
  'Em Análise',
  'Visita Marcada',
  'Follow UP',
  'Estudo de VVR',
  'Enviar proposta ao investidor',
  'Wholesaling',
  'Negócio em Curso',
]

// Funil do investidor — suporta nomes antigos e novos do Notion
const FUNIL_INVESTIDORES = [
  'Potencial Investidor', 'Potencial',
  'Marcar call', 'Marcar Call',
  'Call marcada', 'Call Marcada',
  'Follow Up',
  'Investidor classificado', 'Classificado',
  'Investidor em parceria', 'Em Parceria',
]
// Labels bonitos para o funil (colapsa old→new)
const FUNIL_INV_LABEL = {
  'Potencial Investidor':    'Potencial',
  'Marcar call':             'Marcar Call',
  'Call marcada':            'Call Marcada',
  'Investidor classificado': 'Classificado',
  'Investidor em parceria':  'Em Parceria',
}

app.get('/api/kpis/comercial', async (req, res) => {
  try {
    const [imoveisResult, investidores] = await Promise.all([
      getImóveis().catch(() => []),
      getInvestidores(),
    ])
    const imoveis = imoveisResult

    const ativos = imoveis.filter(i => !ESTADOS_NEGATIVOS.some(e => i.estado?.toLowerCase().includes(e.toLowerCase())))
    const negativos = imoveis.filter(i => ESTADOS_NEGATIVOS.some(e => i.estado?.toLowerCase().includes(e.toLowerCase())))

    const valorPotencial = round2(ativos.reduce((s,i) => s + i.askPrice, 0))
    const roiMedio = ativos.filter(i => i.roi > 0).length > 0
      ? round2(ativos.filter(i => i.roi > 0).reduce((s,i) => s + i.roi, 0) / ativos.filter(i => i.roi > 0).length)
      : 0

    // Investidores classificados A ou B
    const investClassificados = investidores.filter(i => i.classificacao.some(c => ['A','B'].includes(c)))
    const investParceria = investidores.filter(i => i.status === 'Investidor em parceria')
    const capitalDisponivel = round2(investClassificados.reduce((s,i) => s + i.capitalMax, 0))

    // Funil imóveis
    const funilImoveis = FUNIL_IMOVEIS.map(estado => ({
      estado,
      count: imoveis.filter(i => i.estado === estado).length,
      valorTotal: round2(imoveis.filter(i => i.estado === estado).reduce((s,i) => s + i.askPrice, 0)),
    })).filter(f => f.count > 0)

    // Funil investidores — colapsa nomes antigos em labels normalizados
    const funilInvestidoresRaw = {}
    for (const status of FUNIL_INVESTIDORES) {
      const label = FUNIL_INV_LABEL[status] ?? status
      const count = investidores.filter(i => i.status === status).length
      if (count > 0) funilInvestidoresRaw[label] = (funilInvestidoresRaw[label] ?? 0) + count
    }
    const funilInvestidores = Object.entries(funilInvestidoresRaw).map(([status, count]) => ({ status, count }))

    // Por origem
    const porOrigem = {}
    for (const i of imoveis) { const k = i.origem ?? 'Outro'; porOrigem[k] = (porOrigem[k] ?? 0) + 1 }
    const origens = Object.entries(porOrigem).map(([name, value]) => ({ name, value })).sort((a,b) => b.value-a.value)

    res.json({
      imóveisAtivos:      ativos.length,
      imóveisDescartados: negativos.length,
      imóveisTotal:       imoveis.length,
      valorPotencial,
      roiMedio,
      investidoresTotal:  investidores.length,
      investClassificados: investClassificados.length,
      investParceria:     investParceria.length,
      capitalDisponivel,
      funilImoveis,
      funilInvestidores,
      origens,
      imoveisAtivosLista: ativos.slice(0, 15),
    })
  } catch (err) {
    console.error('[comercial]', err.message)
    res.status(500).json({ error: err.message })
  }
})

app.get('/api/comercial/imoveis', async (req, res) => {
  try {
    const imoveis = await getImóveis().catch(() => [])
    res.json({ imoveis })
  } catch (err) {
    console.error('[comercial/imoveis]', err.message)
    res.json({ imoveis: [] })
  }
})

app.get('/api/comercial/investidores', async (req, res) => {
  try {
    const investidores = await getInvestidores()

    // Grouped by classification
    const porClass = { A: [], B: [], C: [], D: [], 'Sem class.': [] }
    for (const inv of investidores) {
      const classes = inv.classificacao
      if (classes.includes('A')) porClass.A.push(inv)
      else if (classes.includes('B')) porClass.B.push(inv)
      else if (classes.includes('C')) porClass.C.push(inv)
      else if (classes.includes('D')) porClass.D.push(inv)
      else porClass['Sem class.'].push(inv)
    }

    res.json({ investidores, porClass })
  } catch (err) {
    console.error('[comercial/investidores]', err.message)
    res.status(500).json({ error: err.message })
  }
})

app.get('/api/comercial/empreiteiros', async (req, res) => {
  try {
    const empreiteiros = await getEmpreiteiros()
    res.json({ empreiteiros })
  } catch (err) {
    console.error('[comercial/empreiteiros]', err.message)
    res.status(500).json({ error: err.message })
  }
})

// Cache de nomes de consultores por page ID (resolve relações da Faturação)
const consultorNameCache = new Map()
async function resolveConsultorName(pageId) {
  if (consultorNameCache.has(pageId)) return consultorNameCache.get(pageId)
  try {
    const p = await notion.pages.retrieve({ page_id: pageId })
    const nome = Object.values(p.properties).find(v => v.type === 'title')?.title?.map(t => t.plain_text).join('') ?? null
    consultorNameCache.set(pageId, nome)
    return nome
  } catch { return null }
}

app.get('/api/comercial/consultores', async (_req, res) => {
  try {
    const [imoveis, consultoresNotion, negocios] = await Promise.all([getImóveis(), getConsultores(), getNegócios()])
    const now = new Date()
    const year = now.getFullYear(), month = now.getMonth() + 1
    const prevMonth = month === 1 ? 12 : month - 1
    const prevYear  = month === 1 ? year - 1 : year

    const ESTADOS_NEG = new Set(['Descartado','Nao interessa','Não interessa','Cancelado'])
    const ESTADOS_AV  = new Set(['Visita Marcada','Follow UP','Estudo de VVR','Enviar proposta ao investidor',
      'Wholesaling','Negócio em Curso','CAEP','Fix and Flip','Em negociação','Contrato fechado'])

    // Pipeline metrics grouped by consultant name
    const byNome = {}
    for (const im of imoveis) {
      const nome = im.nomeConsultor?.trim() || null
      if (!nome) continue
      if (!byNome[nome]) byNome[nome] = []
      byNome[nome].push(im)
    }

    function calcMetrics(nome, leads) {
      const total       = leads.length
      const descartados = leads.filter(i => ESTADOS_NEG.has(i.estado)).length
      const ativos      = total - descartados
      const avancados   = leads.filter(i => ESTADOS_AV.has(i.estado)).length
      const taxaDescarte  = total > 0 ? round2(descartados / total * 100) : 0
      const taxaConversao = total > 0 ? round2(avancados   / total * 100) : 0

      const valorPipeline = leads
        .filter(i => !ESTADOS_NEG.has(i.estado))
        .reduce((s, i) => s + (i.valorProposta || i.askPrice || 0), 0)

      const rois = leads.filter(i => i.roi > 0).map(i => i.roi)
      const roiMedio = rois.length ? round2(rois.reduce((a, b) => a + b, 0) / rois.length) : null

      const temposResposta = leads.map(i => daysBetween(i.dataAdicionado, i.dataChamada)).filter(v => v != null && v >= 0 && v < 365)
      const tempoRespostaMedio = temposResposta.length ? round2(temposResposta.reduce((a, b) => a + b, 0) / temposResposta.length) : null

      const temposNeg = leads.map(i => daysBetween(i.dataChamada, i.dataProposta)).filter(v => v != null && v >= 0 && v < 365)
      const tempoNegociacaoMedio = temposNeg.length ? round2(temposNeg.reduce((a, b) => a + b, 0) / temposNeg.length) : null

      const leadsEsteMes     = leads.filter(i => isMonth(i.dataAdicionado, year, month)).length
      const leadsMesAnterior = leads.filter(i => isMonth(i.dataAdicionado, prevYear, prevMonth)).length

      const datas = leads.map(i => i.dataAdicionado).filter(Boolean).sort().reverse()
      const ultimoLead  = datas[0] ?? null
      const diasSemLead = ultimoLead ? Math.floor((now - new Date(ultimoLead)) / 86400000) : null

      const funil = [
        { fase: 'Lead adicionado',  count: total },
        { fase: '1ª Chamada',       count: leads.filter(i => i.dataChamada).length },
        { fase: 'Visita',           count: leads.filter(i => i.dataVisita).length },
        { fase: 'Proposta enviada', count: leads.filter(i => i.dataProposta).length },
        { fase: 'Proposta aceite',  count: leads.filter(i => i.dataPropostaAceite).length },
      ]

      return { nome, total, ativos, descartados, avancados, taxaDescarte, taxaConversao,
        valorPipeline: round2(valorPipeline), roiMedio, tempoRespostaMedio, tempoNegociacaoMedio,
        leadsEsteMes, leadsMesAnterior, ultimoLead, diasSemLead, funil }
    }

    // KPIs de faturação por consultor — indexado por page ID (relação directa)
    const fatById = {}
    for (const neg of negocios) {
      for (const cid of neg.consultorIds) {
        if (!fatById[cid]) fatById[cid] = []
        fatById[cid].push(neg)
      }
    }

    function calcFatMetrics(consultorId) {
      const negs = fatById[consultorId] ?? []
      const vendidos = negs.filter(n => n.fase === 'Vendido' || n.dataVenda)
      const emCurso  = negs.filter(n => n.fase !== 'Vendido' && !n.dataVenda)
      const lucroRealizado  = round2(vendidos.reduce((s, n) => s + (n.lucroReal || 0), 0))
      const lucroPotencial  = round2(emCurso.reduce((s, n) => s + (n.lucroEstimado || 0), 0))
      const lucroTotal      = round2(negs.reduce((s, n) => s + (n.lucroReal || n.lucroEstimado || 0), 0))
      const dealsEsteMes    = negs.filter(n => isMonth(n.dataVenda ?? n.data, year, month)).length
      const taxaConversaoFat = negs.length > 0 ? round2(vendidos.length / negs.length * 100) : null
      return { dealsTotal: negs.length, dealsVendidos: vendidos.length, dealsEmCurso: emCurso.length,
        dealsEsteMes, lucroRealizado, lucroPotencial, lucroTotal, taxaConversaoFat }
    }

    // Merge: Notion consultores + pipeline metrics + faturação KPIs (por ID)
    const consultores = consultoresNotion.map(c => {
      const leads = byNome[c.nome] ?? []
      const metrics = calcMetrics(c.nome, leads)
      const fat = calcFatMetrics(c.id)
      const cumpreMeta = c.metaMensalLeads > 0
        ? round2(metrics.leadsEsteMes / c.metaMensalLeads * 100) : null
      return { ...c, ...metrics, ...fat, cumpreMeta }
    })

    // Consultores no pipeline que não estão na lista Notion
    for (const [nome, leads] of Object.entries(byNome)) {
      if (!consultoresNotion.find(c => c.nome === nome)) {
        consultores.push({ ...calcMetrics(nome, leads),
          dealsTotal: 0, dealsVendidos: 0, dealsEsteMes: 0, lucroTotal: 0, taxaConversaoFat: null,
          status: null, tipo: null, classificacao: null, zonas: [],
          metaMensalLeads: 0, comissao: 0, cumpreMeta: null })
      }
    }

    consultores.sort((a, b) => b.total - a.total)
    res.json({ consultores, total: consultores.length })
  } catch (err) {
    console.error('[comercial/consultores]', err.message)
    res.status(500).json({ error: err.message })
  }
})

app.get('/api/comercial/projetos', async (req, res) => {
  try {
    const projetos = await getProjetos().catch(() => [])
    res.json({ projetos })
  } catch (err) {
    console.error('[comercial/projetos]', err.message)
    res.json({ projetos: [] })
  }
})

app.get('/api/comercial/historico', async (req, res) => {
  try {
    const imoveis = await getImóveis().catch(() => [])
    const now = new Date()

    // Imóveis adicionados por mês (últimos 12)
    const meses = []
    for (let i = 11; i >= 0; i--) {
      const d     = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const ano   = d.getFullYear()
      const month = d.getMonth() + 1
      const label = `${MES_ABREV[d.getMonth()]} ${String(ano).slice(2)}`
      const adicionados = imoveis.filter(im => isMonth(im.dataAdicionado, ano, month))
      const descartados = adicionados.filter(im => ESTADOS_NEGATIVOS.some(e => im.estado?.toLowerCase().includes(e.toLowerCase())))
      meses.push({
        label,
        adicionados: adicionados.length,
        descartados: descartados.length,
        ativos: adicionados.length - descartados.length,
      })
    }

    // Por tipologia
    const porTipologia = {}
    for (const im of imoveis) {
      const k = im.tipologia ?? 'Outro'
      if (!porTipologia[k]) porTipologia[k] = { count: 0, valor: 0 }
      porTipologia[k].count++
      porTipologia[k].valor += im.askPrice
    }
    const tipologias = Object.entries(porTipologia)
      .map(([name, v]) => ({ name, count: v.count, valor: round2(v.valor) }))
      .sort((a,b) => b.count - a.count)

    res.json({ meses, tipologias })
  } catch (err) {
    console.error('[comercial/historico]', err.message)
    res.status(500).json({ error: err.message })
  }
})

// ════════════════════════════════════════════════════════════════
// COMERCIAL — Métricas Temporais (KPI Framework completo)
// ════════════════════════════════════════════════════════════════
app.get('/api/comercial/metricas-temporais', async (req, res) => {
  try {
    const [imoveis, investidores, consultoresRaw, negocios] = await Promise.all([
      getImóveis().catch(() => []),
      getInvestidores(),
      getConsultores().catch(() => []),
      getNegócios(),
    ])

    const now   = new Date()
    const year  = now.getFullYear()
    const month = now.getMonth() + 1

    // ── Períodos ─────────────────────────────────────────────
    const wDay = now.getDay()
    const weekStart = new Date(now); weekStart.setDate(now.getDate() - (wDay === 0 ? 6 : wDay - 1)); weekStart.setHours(0,0,0,0)
    const weekEnd   = new Date(weekStart); weekEnd.setDate(weekStart.getDate() + 6); weekEnd.setHours(23,59,59,999)

    const monthStart   = new Date(year, month - 1, 1)
    const monthEnd     = new Date(year, month, 0, 23, 59, 59, 999)

    const q            = Math.ceil(month / 3)
    const quarterStart = new Date(year, (q - 1) * 3, 1)
    const quarterEnd   = new Date(year, q * 3, 0, 23, 59, 59, 999)

    const semStart = month <= 6 ? new Date(year, 0, 1)  : new Date(year, 6, 1)
    const semEnd   = month <= 6 ? new Date(year, 5, 30, 23,59,59,999) : new Date(year, 11, 31, 23,59,59,999)

    const yearStart = new Date(year, 0, 1)
    const yearEnd   = new Date(year, 11, 31, 23, 59, 59, 999)

    function inP(dateStr, start, end) {
      if (!dateStr) return false
      const d = new Date(dateStr)
      return d >= start && d <= end
    }

    function avgDays(arr) {
      const valid = arr.filter(v => v != null && v >= 0 && v < 365)
      return valid.length ? round2(valid.reduce((a,b) => a+b,0) / valid.length) : null
    }

    // ── Volume de atividades por período ─────────────────────
    function volImoveis(s, e) {
      return {
        adicionados: imoveis.filter(i => inP(i.dataAdicionado, s, e)).length,
        chamadas:    imoveis.filter(i => inP(i.dataChamada, s, e)).length,
        visitas:     imoveis.filter(i => inP(i.dataVisita, s, e)).length,
        estudos:     imoveis.filter(i => inP(i.dataEstudoMercado, s, e)).length,
        propostas:   imoveis.filter(i => inP(i.dataProposta, s, e)).length,
        propostasAceites: imoveis.filter(i => inP(i.dataPropostaAceite, s, e)).length,
        negocios:    negocios.filter(n => inP(n.dataVenda, s, e) || inP(n.dataCompra, s, e)).length,
      }
    }
    const emFollowUp = imoveis.filter(i => i.estado === 'Follow UP').length

    // ── Funil de conversão por coorte (data adicionado) ──────
    function funilCoorte(s, e) {
      const coorte = imoveis.filter(i => inP(i.dataAdicionado, s, e))
      const n = coorte.length
      return {
        adicionados:      n,
        comChamada:       coorte.filter(i => i.dataChamada).length,
        comVisita:        coorte.filter(i => i.dataVisita).length,
        comEstudo:        coorte.filter(i => i.dataEstudoMercado).length,
        comProposta:      coorte.filter(i => i.dataProposta).length,
        comPropostaAceite:coorte.filter(i => i.dataPropostaAceite).length,
        taxaChamada:      n > 0 ? round2(coorte.filter(i => i.dataChamada).length / n * 100) : null,
        taxaVisita:       n > 0 ? round2(coorte.filter(i => i.dataVisita).length / n * 100) : null,
        taxaProposta:     n > 0 ? round2(coorte.filter(i => i.dataProposta).length / n * 100) : null,
      }
    }

    // ── Ciclos médios Imóveis (todos os históricos) ───────────
    const ESTADOS_NEG_SET = new Set(['Descartado','Nao interessa','Não interessa','Cancelado'])
    const cicloImoveis = {
      leadAChamada:    avgDays(imoveis.map(i => daysBetween(i.dataAdicionado, i.dataChamada))),
      chamadaAVisita:  avgDays(imoveis.map(i => daysBetween(i.dataChamada, i.dataVisita))),
      visitaAEstudo:   avgDays(imoveis.map(i => daysBetween(i.dataVisita, i.dataEstudoMercado))),
      estudoAProposta: avgDays(imoveis.map(i => daysBetween(i.dataEstudoMercado, i.dataProposta))),
      propostaAFecho:  avgDays(imoveis.map(i => daysBetween(i.dataProposta, i.dataPropostaAceite))),
    }

    // ── Motivos de descarte ────────────────────────────────────
    const motivosDescarte = {}
    const descartados = imoveis.filter(i => ESTADOS_NEG_SET.has(i.estado))
    for (const i of descartados) {
      const m = i.motivoDescarte ?? 'Não registado'
      motivosDescarte[m] = (motivosDescarte[m] ?? 0) + 1
    }
    const motivosDescarteList = Object.entries(motivosDescarte)
      .map(([motivo, count]) => ({ motivo, count }))
      .sort((a,b) => b.count - a.count)

    // Descarte por origem
    const descarteOrigem = {}
    for (const i of imoveis) {
      const o = i.origem ?? 'Outro'
      if (!descarteOrigem[o]) descarteOrigem[o] = { total: 0, descartados: 0 }
      descarteOrigem[o].total++
      if (ESTADOS_NEG_SET.has(i.estado)) descarteOrigem[o].descartados++
    }
    const descarteOrigemList = Object.entries(descarteOrigem)
      .map(([origem, v]) => ({ origem, total: v.total, descartados: v.descartados, taxaDescarte: round2(v.descartados / v.total * 100) }))
      .sort((a,b) => b.total - a.total)

    // ── Investidores ──────────────────────────────────────────
    const INV_PARCERIA = new Set(['Investidor em parceria','Em Parceria','Investidor Ativo'])
    const emParceria   = investidores.filter(i => INV_PARCERIA.has(i.status))

    const invSemContacto60 = investidores
      .filter(i => i.diasSemContacto != null && i.diasSemContacto > 60)
      .map(i => ({ nome: i.nome, dias: i.diasSemContacto, status: i.status }))

    // LTV por investidor (montante investido + lucro real dos negócios com este investidor)
    const ltvInvestidores = investidores.map(i => {
      const negsInv  = negocios.filter(n => n.investidor.includes(i.id))
      const lucroRealizado = round2(negsInv.filter(n => n.fase === 'Vendido').reduce((s,n) => s + n.lucroReal, 0))
      const quotaSomnium   = round2(negsInv.filter(n => n.fase === 'Vendido').reduce((s,n) => s + (n.quotaSomnium || n.lucroReal * 0.267), 0))
      return { nome: i.nome, status: i.status, montante: i.montanteInvestido, lucroRealizado, quotaSomnium, numeroNegocios: i.numeroNegocios }
    }).filter(i => i.montante > 0 || i.lucroRealizado > 0).sort((a,b) => b.lucroRealizado - a.lucroRealizado || b.montante - a.montante)

    const capitalMobilizado = round2(investidores.reduce((s,i) => s + i.montanteInvestido, 0))
    const reinvestiram      = emParceria.filter(i => i.numeroNegocios > 1).length

    const cicloInvestidor = {
      contactoAReuniao:     avgDays(investidores.map(i => daysBetween(i.dataPrimeiroContacto, i.dataReuniao))),
      reuniaoACapital:      avgDays(investidores.map(i => daysBetween(i.dataReuniao, i.dataCapitalTransferido))),
      totalContactoACapital:avgDays(investidores.map(i => daysBetween(i.dataPrimeiroContacto, i.dataCapitalTransferido))),
    }

    // ── Consultores ────────────────────────────────────────────
    const CONS_ATIVOS_STATUS = new Set(['Aberto Parcerias','Em Parceria','Follow up','Follow Up'])
    const consAtivos = consultoresRaw.filter(c => CONS_ATIVOS_STATUS.has(c.estatuto))
    const consInativos = consultoresRaw.filter(c => c.estatuto === 'Inativo').length
    const consFollowUpAtrasado = consultoresRaw.filter(c =>
      c.dataProximoFollowUp && new Date(c.dataProximoFollowUp) < now && CONS_ATIVOS_STATUS.has(c.estatuto)
    ).length
    const consSemContacto30 = consultoresRaw.filter(c => {
      if (!CONS_ATIVOS_STATUS.has(c.estatuto)) return false
      if (!c.dataFollowUp && !c.dataProximoFollowUp) return true
      const ultima = c.dataProximoFollowUp ?? c.dataFollowUp
      const dias = (now - new Date(ultima)) / 86400000
      return dias > 30
    }).length

    const ltvConsultores = consultoresRaw
      .filter(c => c.lucroTotal > 0)
      .map(c => ({ nome: c.nome, ltv: c.lucroTotal, negocios: c.dealsTotal, lucroRealizado: c.lucroRealizado }))
      .sort((a,b) => b.ltv - a.ltv)
      .slice(0, 10)

    const cicloConsultor = {
      inicioA1Call: avgDays(consultoresRaw.filter(c => c.dataInicio && c.dataPrimeiraCall).map(c => daysBetween(c.dataInicio, c.dataPrimeiraCall))),
      call1ANegocio: avgDays(consultoresRaw.filter(c => c.dataPrimeiraCall).map(c => {
        const primeiroLead = imoveis.filter(i => i.nomeConsultor?.trim() === c.nome && i.dataAdicionado).map(i => i.dataAdicionado).sort()[0]
        return daysBetween(c.dataPrimeiraCall, primeiroLead)
      })),
    }

    // ── Receita por modelo ─────────────────────────────────────
    function receitaModelo(s, e) {
      const neg = negocios.filter(n => inP(n.dataVenda, s, e) && n.fase === 'Vendido')
      const wh  = neg.filter(n => n.categoria === 'Wholesalling')
      const caep= neg.filter(n => n.categoria === 'CAEP')
      return {
        totalNeg:     neg.length,
        lucroWhTotal: round2(wh.reduce((s,n) => s + n.lucroReal, 0)),
        lucroWhMedio: wh.length > 0 ? round2(wh.reduce((s,n) => s + n.lucroReal, 0) / wh.length) : null,
        lucroCAEPTotal: round2(caep.reduce((s,n) => s + n.lucroReal, 0)),
        quotaSomniumCAEP: round2(caep.reduce((s,n) => s + (n.quotaSomnium || n.lucroReal * 0.267), 0)),
        negWH:  wh.length,
        negCAEP: caep.length,
      }
    }

    res.json({
      updatedAt: new Date().toISOString(),
      periodos: {
        semana: { de: weekStart.toISOString().slice(0,10), ate: weekEnd.toISOString().slice(0,10) },
        mes:    { de: monthStart.toISOString().slice(0,10), ate: monthEnd.toISOString().slice(0,10) },
        trimestre: `Q${q} ${year}`,
        semestre: month <= 6 ? `S1 ${year}` : `S2 ${year}`,
        ano: year,
      },
      imoveis: {
        volume: {
          semanal:    { ...volImoveis(weekStart, weekEnd),   emFollowUp },
          mensal:     { ...volImoveis(monthStart, monthEnd), emFollowUp },
          trimestral: { ...volImoveis(quarterStart, quarterEnd), emFollowUp },
          semestral:  { ...volImoveis(semStart, semEnd),     emFollowUp },
          anual:      { ...volImoveis(yearStart, yearEnd),   emFollowUp },
        },
        funil: {
          mensal:     funilCoorte(monthStart, monthEnd),
          trimestral: funilCoorte(quarterStart, quarterEnd),
          semestral:  funilCoorte(semStart, semEnd),
          anual:      funilCoorte(yearStart, yearEnd),
          total:      funilCoorte(new Date('2020-01-01'), yearEnd),
        },
        ciclo: cicloImoveis,
        motivosDescarte: motivosDescarteList,
        descarteOrigem:  descarteOrigemList,
      },
      investidores: {
        alertas:         { semContacto60d: invSemContacto60 },
        ltv:             ltvInvestidores,
        capitalMobilizado,
        emParceria:      emParceria.length,
        reinvestiram,
        ciclo:           cicloInvestidor,
      },
      consultores: {
        alertas: { followUpAtrasado: consFollowUpAtrasado, inativos: consInativos, semContacto30d: consSemContacto30 },
        ltv:     ltvConsultores,
        ciclo:   cicloConsultor,
        totalAtivos: consAtivos.length,
      },
      receita: {
        mensal:     receitaModelo(monthStart, monthEnd),
        trimestral: receitaModelo(quarterStart, quarterEnd),
        semestral:  receitaModelo(semStart, semEnd),
        anual:      receitaModelo(yearStart, yearEnd),
      },
    })
  } catch (err) {
    console.error('[metricas-temporais]', err.message)
    res.status(500).json({ error: err.message })
  }
})

// ════════════════════════════════════════════════════════════════
// MARKETING
// ════════════════════════════════════════════════════════════════
app.get('/api/kpis/marketing', async (req, res) => {
  try {
    const { ano, month } = getMesAtual()
    const campanhas = await getCampanhas()

    const doMes  = campanhas.filter(c => isMonth(c.dataInicio, ano, month))
    const ativas = campanhas.filter(c => c.status === 'Ativa')

    const investimentoTotal = doMes.reduce((s,c) => s + c.investimento, 0)
    const leadsGerados      = doMes.reduce((s,c) => s + c.leadsGerados, 0)
    const sql               = doMes.reduce((s,c) => s + c.leadsQualificados, 0)
    const receitaAtribuida  = doMes.reduce((s,c) => s + c.receitaAtribuida, 0)
    const cpl               = leadsGerados > 0 ? round2(investimentoTotal / leadsGerados) : 0
    const taxaQualificacao  = leadsGerados > 0 ? round2(sql / leadsGerados * 100) : 0
    const roi               = investimentoTotal > 0 ? round2((receitaAtribuida - investimentoTotal) / investimentoTotal * 100) : 0

    res.json({ leadsGerados, cpl, sql, taxaQualificacao, receitaAtribuida: round2(receitaAtribuida), roi, campanhasAtivas: ativas.slice(0,10) })
  } catch (err) {
    console.error('[marketing]', err.message)
    res.status(500).json({ error: err.message })
  }
})

app.get('/api/marketing/historico', async (req, res) => {
  try {
    const campanhas = await getCampanhas()
    const now = new Date()

    // Leads por mês (últimos 12)
    const meses = []
    for (let i = 11; i >= 0; i--) {
      const d     = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const ano   = d.getFullYear()
      const month = d.getMonth() + 1
      const label = `${MES_ABREV[d.getMonth()]} ${String(ano).slice(2)}`
      const camp  = campanhas.filter(c => isMonth(c.dataInicio, ano, month))
      const invest = camp.reduce((s,c) => s + c.investimento, 0)
      const leads  = camp.reduce((s,c) => s + c.leadsGerados, 0)
      meses.push({
        label,
        leads,
        sql:         camp.reduce((s,c) => s + c.leadsQualificados, 0),
        investimento:round2(invest),
        receita:     round2(camp.reduce((s,c) => s + c.receitaAtribuida, 0)),
        cpl:         leads > 0 ? round2(invest / leads) : 0,
      })
    }

    // Performance por canal
    const porCanal = {}
    for (const c of campanhas) {
      const k = c.canal ?? 'Outro'
      if (!porCanal[k]) porCanal[k] = { investimento: 0, leads: 0, sql: 0, receita: 0 }
      porCanal[k].investimento += c.investimento
      porCanal[k].leads        += c.leadsGerados
      porCanal[k].sql          += c.leadsQualificados
      porCanal[k].receita      += c.receitaAtribuida
    }
    const canais = Object.entries(porCanal).map(([canal, v]) => ({
      canal,
      investimento: round2(v.investimento),
      leads:        v.leads,
      sql:          v.sql,
      receita:      round2(v.receita),
      roi:          v.investimento > 0 ? round2((v.receita - v.investimento) / v.investimento * 100) : 0,
      cpl:          v.leads > 0 ? round2(v.investimento / v.leads) : 0,
    })).sort((a,b) => b.leads - a.leads)

    res.json({ meses, canais })
  } catch (err) {
    console.error('[marketing/historico]', err.message)
    res.status(500).json({ error: err.message })
  }
})

// ════════════════════════════════════════════════════════════════
// OPERAÇÕES
// ════════════════════════════════════════════════════════════════
app.get('/api/kpis/operacoes', async (req, res) => {
  try {
    const { ano, month } = getMesAtual()
    const obras = await getObras()

    const obrasAtivas     = obras.filter(o => o.status === 'Em curso')
    const obrasConcluidas = obras.filter(o => o.status === 'Concluída' && isMonth(o.dataFimReal, ano, month))
    const noPrazo         = obrasConcluidas.filter(o => o.dataFimReal && o.dataFimPrevista && o.dataFimReal <= o.dataFimPrevista).length
    const percentNoPrazo  = obrasConcluidas.length > 0 ? round2(noPrazo / obrasConcluidas.length * 100) : 0
    const desvioVals      = obras.filter(o => o.status === 'Concluída' && o.desvioPct !== 0).map(o => o.desvioPct)
    const desvioMedio     = desvioVals.length > 0 ? round2(desvioVals.reduce((s,v) => s+v, 0) / desvioVals.length) : 0

    // Valor total em carteira
    const valorCarteira   = obrasAtivas.reduce((s,o) => s + o.orcamentoAprovado, 0)
    // Nº não conformidades abertas
    const naoConformidades = obrasAtivas.reduce((s,o) => s + o.naoConformidades, 0)
    // Taxa de faturação de obras (valor faturado / orçamento)
    const totalOrcado     = obrasAtivas.reduce((s,o) => s + o.orcamentoAprovado, 0)
    const totalFaturado   = obrasAtivas.reduce((s,o) => s + o.valorFaturado, 0)
    const taxaFaturacao   = totalOrcado > 0 ? round2(totalFaturado / totalOrcado * 100) : 0

    res.json({
      obrasAtivas:      obrasAtivas.length,
      obrasConcluidas:  obrasConcluidas.length,
      percentNoPrazo,
      desvioMedio,
      valorCarteira:    round2(valorCarteira),
      naoConformidades,
      taxaFaturacao,
      obrasAtivasLista: obrasAtivas.slice(0, 10),
    })
  } catch (err) {
    console.error('[operacoes]', err.message)
    res.status(500).json({ error: err.message })
  }
})

app.get('/api/operacoes/historico', async (req, res) => {
  try {
    const obras = await getObras()
    const now   = new Date()

    // Obras concluídas por mês (últimos 12)
    const meses = []
    for (let i = 11; i >= 0; i--) {
      const d     = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const ano   = d.getFullYear()
      const month = d.getMonth() + 1
      const label = `${MES_ABREV[d.getMonth()]} ${String(ano).slice(2)}`
      const conc  = obras.filter(o => o.status === 'Concluída' && isMonth(o.dataFimReal, ano, month))
      const inic  = obras.filter(o => isMonth(o.dataInicioPrevista, ano, month))
      meses.push({
        label,
        concluidas:    conc.length,
        iniciadas:     inic.length,
        valorConcluido:round2(conc.reduce((s,o) => s + o.orcamentoAprovado, 0)),
        desvioMedio:   conc.length > 0 ? round2(conc.reduce((s,o) => s + o.desvioPct, 0) / conc.length) : 0,
      })
    }

    // Por tipo de obra
    const porTipo = {}
    for (const o of obras) {
      const k = o.tipoObra ?? 'Outro'
      if (!porTipo[k]) porTipo[k] = { count: 0, valor: 0 }
      porTipo[k].count++
      porTipo[k].valor += o.orcamentoAprovado
    }
    const tipos = Object.entries(porTipo).map(([name, v]) => ({ name, count: v.count, valor: round2(v.valor) })).sort((a,b) => b.count-a.count)

    // Status actual
    const STATUS_LIST = ['Planeada','Em curso','Pausada','Concluída','Cancelada']
    const porStatus = STATUS_LIST.map(s => ({ status: s, count: obras.filter(o => o.status === s).length })).filter(s => s.count > 0)

    res.json({ meses, tipos, porStatus })
  } catch (err) {
    console.error('[operacoes/historico]', err.message)
    res.status(500).json({ error: err.message })
  }
})

// ════════════════════════════════════════════════════════════════
// DASHBOARD CENTRAL
// ════════════════════════════════════════════════════════════════
app.get('/api/kpis', async (req, res) => {
  try {
    const base = 'http://localhost:3001'
    const [financeiro, comercial, marketing, operacoes, cashflow] = await Promise.all([
      fetch(`${base}/api/kpis/financeiro`).then(r => r.json()),
      fetch(`${base}/api/kpis/comercial`).then(r => r.json()),
      fetch(`${base}/api/kpis/marketing`).then(r => r.json()),
      fetch(`${base}/api/kpis/operacoes`).then(r => r.json()),
      fetch(`${base}/api/financeiro/cashflow`).then(r => r.json()),
    ])
    res.json({ financeiro: { ...financeiro, cashflow }, comercial, marketing, operacoes, updatedAt: new Date().toISOString() })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.post('/api/cache/clear', (_req, res) => { cache.clear(); res.json({ ok: true }) })

// ════════════════════════════════════════════════════════════════
// MÉTRICAS — Framework completo Wholesaling / Fix & Flip
// ════════════════════════════════════════════════════════════════
function daysBetween(d1, d2) {
  if (!d1 || !d2) return null
  const ms = new Date(d2) - new Date(d1)
  return ms > 0 ? round2(ms / 86400000) : null
}
function avg(arr) {
  const valid = arr.filter(v => v != null && !isNaN(v))
  return valid.length > 0 ? round2(valid.reduce((s, v) => s + v, 0) / valid.length) : null
}

app.get('/api/metricas', async (req, res) => {
  try {
    const [imoveis, negocios, investidores] = await Promise.all([
      getImóveis().catch(() => []),
      getNegócios(),
      getInvestidores(),
    ])

    const { ano, month } = getMesAtual()

    // Normalização: suporta nomes antigos e novos do Notion em simultâneo
    const ESTADOS_NEGATIVOS_SET = new Set([
      'Descartado','Nao interessa','Não interessa','Cancelado',
    ])
    const ESTADOS_AVANCADOS_SET = new Set([
      'Visita Marcada','Necessidade de Visita',
      'Follow UP','Follow Up após proposta',
      'Estudo de VVR',
      'Enviar proposta ao investidor',
      'Criar Proposta ao Proprietário','Enviar proposta ao Proprietário',
      'Em negociação','Proposta aceite',
      'Wholesaling','Negócio em Curso','CAEP','Fix and Flip',
    ])
    const ESTADOS_PARCERIA = new Set([
      'Investidor em parceria','Em Parceria','Investidor Ativo',
    ])
    const ESTADOS_PROPOSTA_INV = new Set([
      'Investidor classificado','Classificado','Qualificado',
      'Em Qualificacao','Em Qualificação',
      'Proposta Enviada','Em Negociacao','Em Negociação',
      'Investidor em parceria','Em Parceria',
    ])
    const ESTADOS_PIPELINE_INV = new Set([
      'Potencial','Potencial Investidor',
      'Marcar Call','Marcar call',
      'Call Marcada','Call marcada',
      'Follow Up','Classificado','Investidor classificado',
    ])

    const imoveisAtivos      = imoveis.filter(i => !ESTADOS_NEGATIVOS_SET.has(i.estado))
    const imoveisDescartados = imoveis.filter(i =>  ESTADOS_NEGATIVOS_SET.has(i.estado))
    const imoveisDoMes       = imoveis.filter(i => isMonth(i.dataAdicionado, ano, month))

    // ── PIPELINE 1 — Imóveis ────────────────────────────────────

    // Funil (todos os imóveis históricos, baseado em data_adicionado / estado atingido)
    const leadsGerados       = imoveis.length
    const analisados         = imoveis.filter(i =>
      ESTADOS_AVANCADOS_SET.has(i.estado) || !!i.dataEstudoMercado).length
    const propostasEnviadas  = imoveis.filter(i => !!i.dataProposta).length
    const contratosAssinados = negocios.length   // cada entrada em Faturação = um contrato
    const escriturasConcluidas = negocios.filter(n => n.fase === 'Vendido').length

    // Taxa de conversão lead → contrato
    const taxaConversaoP1 = leadsGerados > 0
      ? round2(contratosAssinados / leadsGerados * 100) : 0

    // Spread médio negociação: (ask - proposta) / ask
    const spreads = imoveis
      .filter(i => i.askPrice > 0 && i.valorProposta > 0)
      .map(i => (i.askPrice - i.valorProposta) / i.askPrice * 100)
    const spreadMedio = avg(spreads)

    // Desconto sobre valor de mercado (CAEP/F&F): (VVR - proposta) / VVR
    const descontosCAEP = imoveis
      .filter(i => i.valorVendaRemodelado > 0 && i.valorProposta > 0)
      .map(i => (i.valorVendaRemodelado - i.valorProposta) / i.valorVendaRemodelado * 100)
    const descontoMercado = avg(descontosCAEP)

    // % imóveis abaixo limiar rentabilidade F&F (ROI < 15%)
    const imoveisFF = imoveis.filter(i => i.roi > 0)
    const abaixoLimiar = imoveisFF.length > 0
      ? round2(imoveisFF.filter(i => i.roi < 15).length / imoveisFF.length * 100) : null

    // Imóveis em due diligence simultânea
    const nDueDiligence = imoveis.filter(i => i.estado === 'Estudo de VVR').length

    // Tempo médio negociação (1.ª chamada → proposta aceite)
    const temposNegociacao = imoveis
      .map(i => daysBetween(i.dataChamada, i.dataPropostaAceite))
      .filter(v => v != null && v < 365)
    const tempoMedioNegociacao = avg(temposNegociacao)

    // Motivos de descarte
    const motivosDescarte = {}
    for (const i of imoveisDescartados) {
      const m = i.motivoDescarte ?? 'Não registado'
      motivosDescarte[m] = (motivosDescarte[m] ?? 0) + 1
    }

    // Descarte por origem
    const descarteOrigem = {}
    for (const i of imoveis) {
      const o = i.origem ?? 'Outro'
      if (!descarteOrigem[o]) descarteOrigem[o] = { total: 0, descartados: 0 }
      descarteOrigem[o].total++
      if (ESTADOS_NEGATIVOS_SET.has(i.estado)) descarteOrigem[o].descartados++
    }
    const descarteOrigemList = Object.entries(descarteOrigem).map(([origem, v]) => ({
      origem, total: v.total, descartados: v.descartados,
      taxaDescarte: round2(v.descartados / v.total * 100),
    })).sort((a, b) => b.taxaDescarte - a.taxaDescarte)

    // Modelo por estado (Wholesaling vs F&F derivado do campo Modelo de Negócio ou fallback por estado)
    const modeloCount = { 'Wholesaling': 0, 'Fix & Flip': 0, 'Mediação': 0, 'Não definido': 0 }
    for (const i of imoveisAtivos) {
      const m = i.modeloNegocio ?? 'Não definido'
      modeloCount[m] = (modeloCount[m] ?? 0) + 1
    }

    // ── PIPELINE 2 — Consultores (derivado de Faturação) ────────
    const porCategoria = {}
    for (const n of negocios) {
      const k = n.categoria ?? 'Outro'
      if (!porCategoria[k]) porCategoria[k] = { count: 0, lucroEst: 0, lucroReal: 0, fechados: 0 }
      porCategoria[k].count++
      porCategoria[k].lucroEst  += n.lucroEstimado
      porCategoria[k].lucroReal += n.lucroReal
      if (n.fase === 'Vendido') porCategoria[k].fechados++
    }
    const dealsPorCategoria = Object.entries(porCategoria).map(([cat, v]) => ({
      categoria: cat, count: v.count, fechados: v.fechados,
      lucroEst: round2(v.lucroEst), lucroReal: round2(v.lucroReal),
      lucroMedio: v.fechados > 0 ? round2(v.lucroReal / v.fechados) : null,
    }))

    // Deals com capital passivo (com investidor associado)
    const dealsComInvestidor = negocios.filter(n => n.investidor.length > 0)
    const pctDealsCapitalPassivo = negocios.length > 0
      ? round2(dealsComInvestidor.length / negocios.length * 100) : 0

    // Holding period (F&F): data compra → data venda
    const holdingPeriods = negocios
      .map(n => daysBetween(n.dataCompra, n.dataVenda))
      .filter(v => v != null && v > 0 && v < 730)
    const holdingMedio = avg(holdingPeriods)

    // Margem bruta por modelo
    const negWholesaling = negocios.filter(n => n.categoria === 'Wholesalling')
    const negFF          = negocios.filter(n => ['Fix and Flip', 'CAEP'].includes(n.categoria))
    const margemWholesaling = avg(negWholesaling.filter(n=>n.lucroReal>0).map(n=>n.lucroReal))
    const margemFF          = avg(negFF.filter(n=>n.lucroReal>0).map(n=>n.lucroReal))

    // Deals fechados no mês actual
    const dealsMes = negocios.filter(n => isMonth(n.dataVenda, ano, month) && n.fase === 'Vendido')
    const receitaMes = round2(dealsMes.reduce((s,n) => s + n.lucroEstimado, 0))

    // ── PIPELINE 3 — Investidores ───────────────────────────────
    const total            = investidores.length
    const comReuniao       = investidores.filter(i => !!i.dataReuniao).length
    const comNDA           = investidores.filter(i => i.ndaAssinado).length
    const comCapital       = investidores.filter(i => i.montanteInvestido > 0).length
    const emParceria  = investidores.filter(i => ESTADOS_PARCERIA.has(i.status))
    const comProposta = investidores.filter(i => ESTADOS_PROPOSTA_INV.has(i.status)).length

    // Capital
    const capitalCaptado    = round2(investidores.reduce((s,i) => s + i.montanteInvestido, 0))
    // capitalDisponivel = capital máximo dos investidores classificados A/B (potencial total mobilizável)
    const investClassif     = investidores.filter(i => i.classificacao.some(c => ['A','B'].includes(c)))
    const capitalDisponivel = investClassif.length > 0
      ? round2(investClassif.reduce((s,i) => s + i.capitalMax, 0))
      : round2(emParceria.reduce((s,i) => s + i.capitalMax, 0))
    const ticketMedio        = comCapital > 0
      ? round2(investidores.filter(i=>i.montanteInvestido>0).reduce((s,i)=>s+i.montanteInvestido,0) / comCapital)
      : null

    // Taxa de conversão: total → em parceria
    const taxaConversaoInv = total > 0 ? round2(emParceria.length / total * 100) : 0

    // Taxa de retenção: investidores com >1 negócio / total em parceria
    const taxaRetencao = emParceria.length > 0
      ? round2(emParceria.filter(i => i.numeroNegocios > 1).length / emParceria.length * 100) : null

    // Tempo médio captação (1.º contacto → capital transferido)
    const temposCaptacao = investidores
      .map(i => daysBetween(i.dataPrimeiroContacto, i.dataCapitalTransferido))
      .filter(v => v != null && v < 730)
    const tempoMedioCaptacao = avg(temposCaptacao)

    // ROI entregue: lucroReal de negócios com investidor / capital captado
    const lucroEntregue = negocios
      .filter(n => n.investidor.length > 0 && n.fase === 'Vendido')
      .reduce((s,n) => s + n.lucroReal, 0)
    const roiEntregue = capitalCaptado > 0 ? round2(lucroEntregue / capitalCaptado * 100) : null

    // LTV por investidor
    const ltvPorInvestidor = investidores
      .filter(i => i.montanteInvestido > 0)
      .map(i => ({ nome: i.nome, ltv: i.montanteInvestido, negocios: i.numeroNegocios, status: i.status }))
      .sort((a,b) => b.ltv - a.ltv)

    // Capital disponível vs alocado (deals activos)
    const capitalAlocado = round2(
      imoveisAtivos
        .filter(i => ['Wholesaling','Negócio em Curso'].includes(i.estado))
        .reduce((s,i) => s + i.askPrice, 0)
    )

    const investEmPipeline = investidores.filter(i => ESTADOS_PIPELINE_INV.has(i.status)).length

    // ── TRANSVERSAIS ────────────────────────────────────────────
    const pipelineValue = round2(imoveisAtivos.reduce((s,i) => s + i.askPrice, 0))
    const ratioDealFlowCapital = capitalDisponivel > 0
      ? round2(pipelineValue / capitalDisponivel) : null

    // % deals que cumprem projecção CAEP (lucroReal >= lucroEstimado * 0.8)
    const dealsFechados = negocios.filter(n => n.fase === 'Vendido' && n.lucroEstimado > 0)
    const cumpreProjeccao = dealsFechados.length > 0
      ? round2(dealsFechados.filter(n => n.lucroReal >= n.lucroEstimado * 0.8).length / dealsFechados.length * 100)
      : null

    // Velocidade ciclo completo (lead adicionado → deal fechado) — via Faturação com Imóvel ligado
    // Calculamos pelos imóveis que têm relação com Faturação fechada
    const ciclosCompletos = []
    for (const n of negocios.filter(n => n.fase === 'Vendido' && n.dataVenda)) {
      const imovelRel = imoveis.find(i => n.imovel.includes(i.id))
      if (imovelRel?.dataAdicionado) {
        const dias = daysBetween(imovelRel.dataAdicionado, n.dataVenda)
        if (dias && dias > 0 && dias < 730) ciclosCompletos.push(dias)
      }
    }
    const velocidadeCicloCompleto = avg(ciclosCompletos)

    // ROE (lucro real / capital investido pelos parceiros)
    const roe = capitalCaptado > 0 ? round2(lucroEntregue / capitalCaptado * 100) : null

    // Deals simultâneos em execução
    const dealsSilmultaneos = negocios.filter(n => n.fase !== 'Vendido').length

    res.json({
      updatedAt: new Date().toISOString(),

      // ── Top KPIs ──
      top: {
        receitaPrevistaMes:   receitaMes,
        dealsFechadosMes:     dealsMes.length,
        capitalPassivoCaptado: capitalCaptado,
        velocidadeMediaCiclo: tempoMedioNegociacao,
      },

      // ── Pipeline 1 — Imóveis ──
      pipeline1: {
        funil: [
          { label: 'Leads gerados',        value: leadsGerados },
          { label: 'Analisados (VVR/CAEP)', value: analisados },
          { label: 'Propostas enviadas',    value: propostasEnviadas },
          { label: 'Contratos assinados',   value: contratosAssinados },
          { label: 'Escrituras concluídas', value: escriturasConcluidas },
        ],
        taxaConversao:        taxaConversaoP1,
        spreadMedio:          spreadMedio,
        descontoMercado:      descontoMercado,
        abaixoLimiarFF:       abaixoLimiar,
        nDueDiligence,
        tempoMedioNegociacao,
        motivosDescarte:      Object.entries(motivosDescarte)
          .map(([motivo, count]) => ({ motivo, count }))
          .sort((a,b) => b.count - a.count),
        descarteOrigem:       descarteOrigemList,
        modeloNegocio:        Object.entries(modeloCount)
          .filter(([,v]) => v > 0)
          .map(([modelo, count]) => ({ modelo, count })),
        imoveisDoMes:         imoveisDoMes.length,
        taxaDescarte:         leadsGerados > 0
          ? round2(imoveisDescartados.length / leadsGerados * 100) : 0,
      },

      // ── Pipeline 2 — Consultores/Equipa (via Faturação) ──
      pipeline2: {
        dealsPorCategoria,
        dealsFechadosMes:    dealsMes.length,
        receitaMes,
        margemWholesaling,
        margemFF,
        holdingMedio,
        pctDealsCapitalPassivo,
        totalDeals:          negocios.length,
        dealsFechados:       negocios.filter(n => n.fase === 'Vendido').length,
        taxaRealizacao:      negocios.length > 0
          ? round2(negocios.filter(n=>n.fase==='Vendido').length / negocios.length * 100) : 0,
      },

      // ── Pipeline 3 — Investidores ──
      pipeline3: {
        funil: [
          { label: 'Contactos prospetados', value: total },
          { label: 'Reunião realizada',      value: comReuniao },
          { label: 'Proposta enviada',       value: comProposta },
          { label: 'Contrato / NDA',         value: comNDA },
          { label: 'Capital transferido',    value: comCapital },
        ],
        capitalCaptado,
        investidoresAtivos:   emParceria.length,
        ticketMedio,
        taxaConversao:        taxaConversaoInv,
        taxaRetencao,
        roiEntregue,
        tempoMedioCaptacao,
        capitalDisponivel,
        capitalAlocado,
        ratioCaptacaoAlocacao: capitalDisponivel > 0
          ? round2(capitalAlocado / capitalDisponivel * 100) : null,
        investEmPipeline,
        ltvTop5:              ltvPorInvestidor.slice(0, 5),
      },

      // ── Transversais ──
      transversal: {
        ratioDealFlowCapital,
        pctDealsCapitalPassivo,
        velocidadeCicloCompleto,
        roe,
        dealsSilmultaneos,
        cumpreProjeccao,
        margemWholesaling,
        margemFF,
        pipelineValue,
        capitalDisponivel,
      },
    })
  } catch (err) {
    console.error('[metricas]', err.message)
    res.status(500).json({ error: err.message })
  }
})

// Em produção serve o frontend compilado
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, 'dist')))
  app.get('/{*splat}', (_req, res) =>
    res.sendFile(path.join(__dirname, 'dist', 'index.html'))
  )
}

const PORT = process.env.PORT ?? 3001
app.listen(PORT, () => console.log(`[server] a correr na porta ${PORT}`))
