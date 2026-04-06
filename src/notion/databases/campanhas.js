import { notion } from '../client.js'
import { DATABASES } from '../../config/notion.js'

const DB = DATABASES.campanhas

function extractText(prop) {
  return prop?.rich_text?.map(r => r.plain_text).join('') ?? ''
}

function extractSelect(prop) {
  return prop?.select?.name ?? null
}

function extractNumber(prop) {
  return prop?.number ?? 0
}

function extractTitle(prop) {
  return prop?.title?.map(r => r.plain_text).join('') ?? ''
}

function extractDate(prop) {
  return prop?.date?.start ?? null
}

function mapEntry(page) {
  const p = page.properties
  return {
    id: page.id,
    campanha:         extractTitle(p['Campanha']),
    canal:            extractSelect(p['Canal']),
    dataInicio:       extractDate(p['Data Início']),
    dataFim:          extractDate(p['Data Fim']),
    investimento:     extractNumber(p['Investimento €']),
    leadsGerados:     extractNumber(p['Leads Gerados']),
    leadsQualificados:extractNumber(p['Leads Qualificados SQL']),
    custoPorLead:     extractNumber(p['Custo por Lead €']),
    receitaAtribuida: extractNumber(p['Receita Atribuída €']),
    status:           extractSelect(p['Status']),
    notas:            extractText(p['Notas']),
  }
}

export async function listAll(filters = []) {
  try {
    const response = await notion.databases.query({
      database_id: DB,
      filter: filters.length > 0 ? { and: filters } : undefined,
      sorts: [{ property: 'Data Início', direction: 'descending' }],
    })
    return response.results.map(mapEntry)
  } catch (err) {
    console.error('[campanhas] listAll error:', err.message)
    throw err
  }
}

export async function getById(id) {
  try {
    const page = await notion.pages.retrieve({ page_id: id })
    return mapEntry(page)
  } catch (err) {
    console.error('[campanhas] getById error:', err.message)
    throw err
  }
}

export async function create(data) {
  try {
    return await notion.pages.create({
      parent: { database_id: DB },
      properties: {
        'Campanha':              { title: [{ text: { content: data.campanha } }] },
        'Canal':                 { select: { name: data.canal } },
        'Data Início':           { date: { start: data.dataInicio } },
        'Data Fim':              { date: { start: data.dataFim } },
        'Investimento €':        { number: data.investimento },
        'Leads Gerados':         { number: data.leadsGerados ?? 0 },
        'Leads Qualificados SQL':{ number: data.leadsQualificados ?? 0 },
        'Custo por Lead €':      { number: data.custoPorLead ?? 0 },
        'Receita Atribuída €':   { number: data.receitaAtribuida ?? 0 },
        'Status':                { select: { name: data.status } },
        'Notas':                 { rich_text: [{ text: { content: data.notas ?? '' } }] },
      },
    })
  } catch (err) {
    console.error('[campanhas] create error:', err.message)
    throw err
  }
}

export async function update(id, data) {
  try {
    const properties = {}
    if (data.leadsGerados !== undefined) properties['Leads Gerados'] = { number: data.leadsGerados }
    if (data.leadsQualificados !== undefined) properties['Leads Qualificados SQL'] = { number: data.leadsQualificados }
    if (data.custoPorLead !== undefined) properties['Custo por Lead €'] = { number: data.custoPorLead }
    if (data.receitaAtribuida !== undefined) properties['Receita Atribuída €'] = { number: data.receitaAtribuida }
    if (data.status !== undefined) properties['Status'] = { select: { name: data.status } }
    return await notion.pages.update({ page_id: id, properties })
  } catch (err) {
    console.error('[campanhas] update error:', err.message)
    throw err
  }
}
