import { notion } from '../client.js'
import { DATABASES } from '../../config/notion.js'

const DB = DATABASES.custos

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
    despesa:    extractTitle(p['Despesa']),
    data:       extractDate(p['Data']),
    categoria:  extractSelect(p['Categoria']),
    obra:       extractText(p['Obra / Projeto']),
    valor:      extractNumber(p['Valor (€)']),
    fornecedor: extractText(p['Fornecedor']),
    status:     extractSelect(p['Status']),
    notas:      extractText(p['Notas']),
  }
}

export async function listAll(filters = []) {
  try {
    const response = await notion.databases.query({
      database_id: DB,
      filter: filters.length > 0 ? { and: filters } : undefined,
      sorts: [{ property: 'Data', direction: 'descending' }],
    })
    return response.results.map(mapEntry)
  } catch (err) {
    console.error('[custos] listAll error:', err.message)
    throw err
  }
}

export async function getById(id) {
  try {
    const page = await notion.pages.retrieve({ page_id: id })
    return mapEntry(page)
  } catch (err) {
    console.error('[custos] getById error:', err.message)
    throw err
  }
}

export async function create(data) {
  try {
    return await notion.pages.create({
      parent: { database_id: DB },
      properties: {
        'Despesa':     { title: [{ text: { content: data.despesa } }] },
        'Data':        { date: { start: data.data } },
        'Categoria':   { select: { name: data.categoria } },
        'Obra/Projeto':{ rich_text: [{ text: { content: data.obra ?? '' } }] },
        'Valor €':     { number: data.valor },
        'Fornecedor':  { rich_text: [{ text: { content: data.fornecedor ?? '' } }] },
        'Status':      { select: { name: data.status } },
        'Notas':       { rich_text: [{ text: { content: data.notas ?? '' } }] },
      },
    })
  } catch (err) {
    console.error('[custos] create error:', err.message)
    throw err
  }
}

export async function update(id, data) {
  try {
    const properties = {}
    if (data.valor !== undefined) properties['Valor €'] = { number: data.valor }
    if (data.status !== undefined) properties['Status'] = { select: { name: data.status } }
    return await notion.pages.update({ page_id: id, properties })
  } catch (err) {
    console.error('[custos] update error:', err.message)
    throw err
  }
}
