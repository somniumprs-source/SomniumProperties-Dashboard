import { notion } from '../client.js'
import { DATABASES } from '../../config/notion.js'

const DB = DATABASES.clientes

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

function extractEmail(prop) {
  return prop?.email ?? null
}

function extractPhone(prop) {
  return prop?.phone_number ?? null
}

function mapEntry(page) {
  const p = page.properties
  return {
    id: page.id,
    nome:              extractTitle(p['Nome/Empresa']),
    tipo:              extractSelect(p['Tipo']),
    segmento:          extractSelect(p['Segmento']),
    email:             extractEmail(p['Email']),
    telefone:          extractPhone(p['Telefone']),
    nif:               extractText(p['NIF']),
    localizacao:       extractText(p['Localização']),
    valorFaturado:     extractNumber(p['Valor Total Faturado €']),
    ultimaInteracao:   extractDate(p['Última Interação']),
    potencialRecompra: extractSelect(p['Potencial de Recompra']),
    notas:             extractText(p['Notas']),
  }
}

export async function listAll(filters = []) {
  try {
    const response = await notion.databases.query({
      database_id: DB,
      filter: filters.length > 0 ? { and: filters } : undefined,
      sorts: [{ property: 'Última Interação', direction: 'descending' }],
    })
    return response.results.map(mapEntry)
  } catch (err) {
    console.error('[clientes] listAll error:', err.message)
    throw err
  }
}

export async function getById(id) {
  try {
    const page = await notion.pages.retrieve({ page_id: id })
    return mapEntry(page)
  } catch (err) {
    console.error('[clientes] getById error:', err.message)
    throw err
  }
}

export async function create(data) {
  try {
    return await notion.pages.create({
      parent: { database_id: DB },
      properties: {
        'Nome/Empresa':          { title: [{ text: { content: data.nome } }] },
        'Tipo':                  { select: { name: data.tipo } },
        'Segmento':              { select: { name: data.segmento } },
        'Email':                 { email: data.email },
        'Telefone':              { phone_number: data.telefone },
        'NIF':                   { rich_text: [{ text: { content: data.nif ?? '' } }] },
        'Localização':           { rich_text: [{ text: { content: data.localizacao ?? '' } }] },
        'Valor Total Faturado €':{ number: data.valorFaturado ?? 0 },
        'Potencial de Recompra': { select: { name: data.potencialRecompra ?? 'Desconhecido' } },
        'Notas':                 { rich_text: [{ text: { content: data.notas ?? '' } }] },
      },
    })
  } catch (err) {
    console.error('[clientes] create error:', err.message)
    throw err
  }
}

export async function update(id, data) {
  try {
    const properties = {}
    if (data.tipo !== undefined) properties['Tipo'] = { select: { name: data.tipo } }
    if (data.valorFaturado !== undefined) properties['Valor Total Faturado €'] = { number: data.valorFaturado }
    if (data.ultimaInteracao !== undefined) properties['Última Interação'] = { date: { start: data.ultimaInteracao } }
    if (data.potencialRecompra !== undefined) properties['Potencial de Recompra'] = { select: { name: data.potencialRecompra } }
    return await notion.pages.update({ page_id: id, properties })
  } catch (err) {
    console.error('[clientes] update error:', err.message)
    throw err
  }
}
