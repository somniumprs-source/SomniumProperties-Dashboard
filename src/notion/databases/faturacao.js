import { notion } from '../client.js'
import { DATABASES } from '../../config/notion.js'
import { extractText, extractSelect, extractNumber, extractTitle } from '../helpers.js'

const DB = DATABASES.faturacao

function mapEntry(page) {
  const p = page.properties
  return {
    id: page.id,
    nome:             extractTitle(p['Mês / Projeto']),
    mes:              extractSelect(p['Mês']),
    ano:              extractNumber(p['Ano']),
    tipo:             extractSelect(p['Tipo']),
    receitaFaturada:  extractNumber(p['Receita Faturada (€)']),
    receitaRecebida:  extractNumber(p['Receita Recebida (€)']),
    custoDirecto:     extractNumber(p['Custo Direto (€)']),
    margemBruta:      extractNumber(p['Margem Bruta (€)']),
    margemPct:        extractNumber(p['Margem (%)']),
    statusPagamento:  extractSelect(p['Status Pagamento']),
    notas:            extractText(p['Notas']),
  }
}

export async function listAll(filters = []) {
  try {
    const response = await notion.databases.query({
      database_id: DB,
      filter: filters.length > 0 ? { and: filters } : undefined,
      sorts: [{ property: 'Ano', direction: 'descending' }],
    })
    return response.results.map(mapEntry)
  } catch (err) {
    console.error('[faturacao] listAll error:', err.message)
    throw err
  }
}

export async function getById(id) {
  try {
    const page = await notion.pages.retrieve({ page_id: id })
    return mapEntry(page)
  } catch (err) {
    console.error('[faturacao] getById error:', err.message)
    throw err
  }
}

export async function create(data) {
  try {
    return await notion.pages.create({
      parent: { database_id: DB },
      properties: {
        'Mês/Projeto':       { title: [{ text: { content: data.nome } }] },
        'Mês':               { select: { name: data.mes } },
        'Ano':               { number: data.ano },
        'Tipo':              { select: { name: data.tipo } },
        'Receita Faturada €':{ number: data.receitaFaturada },
        'Receita Recebida €':{ number: data.receitaRecebida },
        'Custo Direto €':    { number: data.custoDirecto },
        'Margem Bruta €':    { number: data.margemBruta },
        'Margem %':          { number: data.margemPct },
        'Status Pagamento':  { select: { name: data.statusPagamento } },
        'Notas':             { rich_text: [{ text: { content: data.notas ?? '' } }] },
      },
    })
  } catch (err) {
    console.error('[faturacao] create error:', err.message)
    throw err
  }
}

export async function update(id, data) {
  try {
    const properties = {}
    if (data.receitaFaturada !== undefined) properties['Receita Faturada €'] = { number: data.receitaFaturada }
    if (data.statusPagamento !== undefined) properties['Status Pagamento'] = { select: { name: data.statusPagamento } }
    if (data.notas !== undefined) properties['Notas'] = { rich_text: [{ text: { content: data.notas } }] }
    return await notion.pages.update({ page_id: id, properties })
  } catch (err) {
    console.error('[faturacao] update error:', err.message)
    throw err
  }
}
