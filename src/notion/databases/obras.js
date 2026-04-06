import { notion } from '../client.js'
import { DATABASES } from '../../config/notion.js'

const DB = DATABASES.obras

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
    nome:               extractTitle(p['Nome da Obra']),
    cliente:            extractText(p['Cliente']),
    tipoObra:           extractSelect(p['Tipo de Obra']),
    localizacao:        extractText(p['Localização']),
    status:             extractSelect(p['Status']),
    dataInicioPrevista: extractDate(p['Data Início Prevista']),
    dataFimPrevista:    extractDate(p['Data Fim Prevista']),
    dataFimReal:        extractDate(p['Data Fim Real']),
    orcamentoAprovado:  extractNumber(p['Orçamento Aprovado €']),
    custoReal:          extractNumber(p['Custo Real €']),
    desvioPct:          extractNumber(p['Desvio de Orçamento %']),
    area:               extractNumber(p['Área m²']),
    responsavel:        extractText(p['Encarregado/Responsável']),
    naoConformidades:   extractNumber(p['Não Conformidades']),
    notas:              extractText(p['Notas']),
  }
}

export async function listAll(filters = []) {
  try {
    const response = await notion.databases.query({
      database_id: DB,
      filter: filters.length > 0 ? { and: filters } : undefined,
      sorts: [{ property: 'Data Início Prevista', direction: 'descending' }],
    })
    return response.results.map(mapEntry)
  } catch (err) {
    console.error('[obras] listAll error:', err.message)
    throw err
  }
}

export async function getById(id) {
  try {
    const page = await notion.pages.retrieve({ page_id: id })
    return mapEntry(page)
  } catch (err) {
    console.error('[obras] getById error:', err.message)
    throw err
  }
}

export async function create(data) {
  try {
    return await notion.pages.create({
      parent: { database_id: DB },
      properties: {
        'Nome da Obra':          { title: [{ text: { content: data.nome } }] },
        'Cliente':               { rich_text: [{ text: { content: data.cliente ?? '' } }] },
        'Tipo de Obra':          { select: { name: data.tipoObra } },
        'Localização':           { rich_text: [{ text: { content: data.localizacao ?? '' } }] },
        'Status':                { select: { name: data.status ?? 'Planeada' } },
        'Data Início Prevista':  { date: { start: data.dataInicioPrevista } },
        'Data Fim Prevista':     data.dataFimPrevista ? { date: { start: data.dataFimPrevista } } : undefined,
        'Orçamento Aprovado €':  { number: data.orcamentoAprovado ?? 0 },
        'Não Conformidades':     { number: 0 },
        'Notas':                 { rich_text: [{ text: { content: data.notas ?? '' } }] },
      },
    })
  } catch (err) {
    console.error('[obras] create error:', err.message)
    throw err
  }
}

export async function update(id, data) {
  try {
    const properties = {}
    if (data.status !== undefined) properties['Status'] = { select: { name: data.status } }
    if (data.custoReal !== undefined) properties['Custo Real €'] = { number: data.custoReal }
    if (data.desvioPct !== undefined) properties['Desvio de Orçamento %'] = { number: data.desvioPct }
    if (data.dataFimReal !== undefined) properties['Data Fim Real'] = { date: { start: data.dataFimReal } }
    if (data.naoConformidades !== undefined) properties['Não Conformidades'] = { number: data.naoConformidades }
    return await notion.pages.update({ page_id: id, properties })
  } catch (err) {
    console.error('[obras] update error:', err.message)
    throw err
  }
}
