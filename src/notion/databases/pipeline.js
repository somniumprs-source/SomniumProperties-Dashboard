import { notion } from '../client.js'
import { DATABASES } from '../../config/notion.js'
import { extractText, extractSelect, extractNumber, extractTitle, extractDate } from '../helpers.js'

const DB = DATABASES.pipeline

function mapEntry(page) {
  const p = page.properties
  return {
    id: page.id,
    nome:              extractTitle(p['Obra/Oportunidade']),
    cliente:           extractText(p['Cliente']),
    fase:              extractSelect(p['Fase']),
    tipoObra:          extractSelect(p['Tipo de Obra']),
    valorEstimado:     extractNumber(p['Valor Estimado €']),
    probabilidade:     extractNumber(p['Probabilidade %']),
    dataLead:          extractDate(p['Data do Lead']),
    dataFechoPrevista: extractDate(p['Data de Fecho Prevista']),
    responsavel:       extractText(p['Responsável']),
    origemLead:        extractSelect(p['Origem do Lead']),
    notas:             extractText(p['Notas']),
    createdTime:       page.created_time,
  }
}

export async function listAll(filters = []) {
  try {
    const response = await notion.databases.query({
      database_id: DB,
      filter: filters.length > 0 ? { and: filters } : undefined,
      sorts: [{ property: 'Data de Fecho Prevista', direction: 'ascending' }],
    })
    return response.results.map(mapEntry)
  } catch (err) {
    console.error('[pipeline] listAll error:', err.message)
    throw err
  }
}

export async function getById(id) {
  try {
    const page = await notion.pages.retrieve({ page_id: id })
    return mapEntry(page)
  } catch (err) {
    console.error('[pipeline] getById error:', err.message)
    throw err
  }
}

export async function create(data) {
  try {
    return await notion.pages.create({
      parent: { database_id: DB },
      properties: {
        'Obra/Oportunidade':     { title: [{ text: { content: data.nome } }] },
        'Cliente':               { rich_text: [{ text: { content: data.cliente ?? '' } }] },
        'Fase':                  { select: { name: data.fase } },
        'Tipo de Obra':          { select: { name: data.tipoObra } },
        'Valor Estimado €':      { number: data.valorEstimado },
        'Probabilidade %':       { number: data.probabilidade },
        'Data do Lead':          { date: { start: data.dataLead } },
        'Data de Fecho Prevista':{ date: { start: data.dataFechoPrevista } },
        'Responsável':           { rich_text: [{ text: { content: data.responsavel ?? '' } }] },
        'Origem do Lead':        { select: { name: data.origemLead } },
        'Notas':                 { rich_text: [{ text: { content: data.notas ?? '' } }] },
      },
    })
  } catch (err) {
    console.error('[pipeline] create error:', err.message)
    throw err
  }
}

export async function update(id, data) {
  try {
    const properties = {}
    if (data.fase !== undefined) properties['Fase'] = { select: { name: data.fase } }
    if (data.valorEstimado !== undefined) properties['Valor Estimado €'] = { number: data.valorEstimado }
    if (data.probabilidade !== undefined) properties['Probabilidade %'] = { number: data.probabilidade }
    if (data.dataFechoPrevista !== undefined) properties['Data de Fecho Prevista'] = { date: { start: data.dataFechoPrevista } }
    return await notion.pages.update({ page_id: id, properties })
  } catch (err) {
    console.error('[pipeline] update error:', err.message)
    throw err
  }
}
