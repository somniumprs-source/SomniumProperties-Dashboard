/**
 * Sync bidirecional CRM ↔ Notion (PostgreSQL version).
 * Nunca apaga — só cria e atualiza.
 */
import 'dotenv/config'
import { Client } from '@notionhq/client'
import pool from './pg.js'
import { randomUUID } from 'crypto'

const notion = new Client({ auth: process.env.NOTION_API_KEY })

const NOTION_DBS = {
  imoveis:      process.env.NOTION_DB_PIPELINE_IMOVEIS,
  investidores: process.env.NOTION_DB_INVESTIDORES,
  negocios:     process.env.NOTION_DB_FATURACAO,
  despesas:     process.env.NOTION_DB_DESPESAS,
  consultores:  process.env.NOTION_DB_CONSULTORES,
  tarefas:      process.env.NOTION_DB_TAREFAS,
}

// ── Helpers ──────────────────────────────────────────────────
const title    = p => p?.title?.map(r => r.plain_text).join('') ?? ''
const text     = p => p?.rich_text?.map(r => r.plain_text).join('') ?? ''
const sel      = p => p?.select?.name ?? null
const multisel = p => JSON.stringify((p?.multi_select ?? []).map(s => s.name))
const statusP  = p => p?.status?.name ?? null
const num      = p => p?.number ?? 0
const dt       = p => p?.date?.start ?? null
const emailP   = p => p?.email ?? null
const phoneP   = p => p?.phone_number ?? null
const formula  = p => p?.formula?.number ?? p?.formula?.string ?? null
const checkbox = p => p?.checkbox ? 1 : 0

async function queryAll(dbId) {
  const results = []
  let cursor
  do {
    const res = await notion.databases.query({ database_id: dbId, start_cursor: cursor, page_size: 100 })
    results.push(...res.results)
    cursor = res.has_more ? res.next_cursor : undefined
  } while (cursor)
  return results
}

async function upsert(table, notionId, data) {
  const now = new Date().toISOString()
  const { rows: existing } = await pool.query(`SELECT id FROM ${table} WHERE notion_id = $1`, [notionId])

  if (existing.length > 0) {
    const entries = Object.entries(data).filter(([, v]) => v !== undefined)
    const sets = entries.map(([k], i) => `${k} = $${i + 1}`)
    sets.push(`updated_at = $${entries.length + 1}`, `synced_at = $${entries.length + 2}`)
    const params = [...entries.map(([, v]) => v), now, now, notionId]
    await pool.query(`UPDATE ${table} SET ${sets.join(', ')} WHERE notion_id = $${entries.length + 3}`, params)
    return { action: 'update', id: existing[0].id }
  } else {
    const id = randomUUID()
    const entries = Object.entries(data).filter(([, v]) => v !== undefined)
    const cols = ['id', 'notion_id', ...entries.map(([k]) => k), 'created_at', 'updated_at', 'synced_at']
    const vals = cols.map((_, i) => `$${i + 1}`)
    const params = [id, notionId, ...entries.map(([, v]) => v), now, now, now]
    await pool.query(`INSERT INTO ${table} (${cols.join(', ')}) VALUES (${vals.join(', ')})`, params)
    return { action: 'insert', id }
  }
}

// ── Mappers ──────────────────────────────────────────────────
const MAPPERS = {
  imoveis: (p) => {
    const pr = p.properties
    const zonaMulti = (pr['Zona (Multi)']?.multi_select ?? []).map(s => s.name)
    const zonaLegacy = text(pr['Zona'])
    return {
      nome: title(pr['Nome do Imóvel']), estado: statusP(pr['Estado']),
      tipologia: text(pr['Tipologia']) || sel(pr['Tipologia']),
      ask_price: num(pr['Ask Price']), valor_proposta: num(pr['Valor Proposta']),
      custo_estimado_obra: num(pr['Custo Estimado de Obra']),
      valor_venda_remodelado: num(pr['Valor de Venda Remodelado']),
      roi: num(pr['ROI']), roi_anualizado: num(pr['ROI Anualizado']),
      area_bruta: num(pr['Área Bruta']),
      origem: sel(pr['Origem']),
      zona: zonaMulti[0] ?? zonaLegacy ?? null,
      zonas: JSON.stringify(zonaMulti.length > 0 ? zonaMulti : zonaLegacy ? [zonaLegacy] : []),
      nome_consultor: text(pr['Nome Consultor']),
      modelo_negocio: sel(pr['Modelo de Negócio']),
      motivo_descarte: sel(pr['Motivo Descarte']),
      link: pr['Link']?.url ?? null,
      data_adicionado: dt(pr['Data Adicionado']), data_chamada: dt(pr['Data Chamada']),
      data_visita: dt(pr['Data de Visita']), data_estudo_mercado: dt(pr['Data Estudo Mercado']),
      data_proposta: dt(pr['Data da Proposta']), data_proposta_aceite: dt(pr['Data Proposta Aceite']),
      data_follow_up: dt(pr['Data Follow Up']),
      data_aceite_investidor: dt(pr['Data de aceitação por investidor']),
      notas: text(pr['Notas']),
    }
  },
  investidores: (p) => {
    const pr = p.properties; const nome = title(pr['Nome']); if (!nome) return null
    return { nome, status: statusP(pr['Status']),
      classificacao: (pr['Classificação']?.multi_select ?? []).map(s => s.name)[0] ?? null,
      pontuacao: num(pr['Pontuação Classificação']),
      capital_min: num(pr['Capital mínimo']), capital_max: num(pr['Capital máximo']),
      montante_investido: num(pr['Montante Investido']), numero_negocios: num(pr['Numero de Negocios']),
      estrategia: multisel(pr['Estratégia de Investimento']), origem: sel(pr['Origem']),
      nda_assinado: checkbox(pr['NDA Assinado']), tipo_investidor: multisel(pr['Tipo de Investidor']),
      perfil_risco: sel(pr['Perfil de Risco']), telemovel: phoneP(pr['Telemovel']), email: emailP(pr['Email']),
      proxima_acao: text(pr['Proxima Acao']), roi_investidor: num(pr['ROI Investidor %']),
      roi_anualizado_investidor: num(pr['ROI Anualizado Investidor %']),
      motivo_nao_aprovacao: text(pr['Motivo Não Aprovação']), motivo_inatividade: text(pr['Motivo Inatividade']),
      data_reuniao: dt(pr['Data Reunião']), data_primeiro_contacto: dt(pr['Data de Primeiro Contacto']),
      data_ultimo_contacto: dt(pr['Data de Último Contacto']), data_capital_transferido: dt(pr['Data Capital Transferido']),
      data_proxima_acao: dt(pr['Data Proxima Acao']),
      data_apresentacao_negocio: dt(pr['Data Apresentação Negócio']), data_aprovacao_negocio: dt(pr['Data Aprovação Negócio']),
      notas: text(pr['Notas']),
    }
  },
  consultores: (p) => {
    const pr = p.properties; const nome = title(pr['Nome']); if (!nome) return null
    return { nome, estatuto: statusP(pr['Estatuto']), tipo: sel(pr['Tipo']), classificacao: sel(pr['Classificação']),
      imobiliaria: multisel(pr['Imobiliária']), zonas: multisel(pr['Zona de Atuação']),
      contacto: text(pr['Contacto']), email: emailP(pr['Email']), equipa_remax: text(pr['Equipa REMAX']),
      data_inicio: dt(pr['Data de Início']), data_follow_up: dt(pr['Data Follow up']),
      data_proximo_follow_up: dt(pr['Data Proximo follow up']), motivo_follow_up: text(pr['Motivo de Follow Up']),
      imoveis_enviados: num(pr['Imoveis enviado publicados']), imoveis_off_market: num(pr['Imoveis Off/Market ']),
      meta_mensal_leads: num(pr['Meta Mensal Leads']), comissao: num(pr['Comissão %']),
      data_primeira_call: dt(pr['Data Primeira Call']), lucro_gerado: num(pr['Lucro Gerado €']),
      motivo_descontinuacao: text(pr['Motivo Descontinuação']), notas: text(pr['Notas']),
    }
  },
  negocios: async (p) => {
    const pr = p.properties
    const imovelNotionId = (pr['Imóvel']?.relation ?? [])[0]?.id ?? null
    let imovelId = null
    if (imovelNotionId) {
      const { rows } = await pool.query('SELECT id FROM imoveis WHERE notion_id = $1', [imovelNotionId])
      imovelId = rows[0]?.id ?? null
    }
    return { movimento: title(pr['Movimento']), categoria: sel(pr['Categoria']), fase: sel(pr['Fase']),
      lucro_estimado: num(pr['Lucro estimado']), lucro_real: num(pr['Lucro real']),
      custo_real_obra: num(pr['Custo Real de Obra']), capital_total: num(pr['Capital Total €']),
      n_investidores: num(pr['Nº Investidores']), quota_somnium: formula(pr['Quota Somnium €']) ?? 0,
      pagamento_em_falta: checkbox(pr['Pagamento em falta']),
      data: dt(pr['Data']), data_compra: dt(pr['Data Compra']),
      data_estimada_venda: dt(pr['Data estimada de venda']), data_venda: dt(pr['Data de venda']),
      imovel_id: imovelId,
      investidor_ids: JSON.stringify((pr['Investidor']?.relation ?? []).map(r => r.id)),
      consultor_ids: JSON.stringify((pr['Consultor']?.relation ?? []).map(r => r.id)),
      notas: text(pr['Notas']),
    }
  },
  despesas: (p) => {
    const pr = p.properties; const timing = sel(pr['Timing Pagamento']); const cm = num(pr['Custo Mensal'])
    const caf = formula(pr['Custo Anual']) ?? 0; const car = num(pr['Custo Anual (Real)'])
    return { movimento: title(pr['Movimento']), categoria: sel(pr['Categoria']), data: dt(pr['Data']),
      custo_mensal: cm, custo_anual: Math.round((caf || car || (timing === 'Mensalmente' ? cm * 12 : cm)) * 100) / 100,
      timing, notas: text(pr['Notas']),
    }
  },
  tarefas: (p) => {
    const pr = p.properties
    const funcs = (pr['Funcionário']?.multi_select ?? []).map(s => s.name)
    return {
      tarefa: title(pr['Tarefa']),
      status: statusP(pr['Status']) ?? 'A fazer',
      inicio: dt(pr['Início da tarefa']),
      fim: dt(pr['Fim da tarefa']),
      funcionario: funcs.join(', ') || null,
      tempo_horas: formula(pr['Tempo (Hora)']) ?? 0,
      grupo_id: (pr['Grupo de Tarefas']?.relation ?? [])[0]?.id ?? null,
    }
  },
}

export async function syncFromNotion(table) {
  const dbId = NOTION_DBS[table]
  if (!dbId) return { error: `No Notion DB for ${table}` }
  try {
    const rows = await queryAll(dbId)
    const mapper = MAPPERS[table]
    let inserted = 0, updated = 0, skipped = 0
    for (const p of rows) {
      const data = await mapper(p)
      if (!data) { skipped++; continue }
      const result = await upsert(table, p.id, data)
      if (result.action === 'insert') inserted++; else updated++
    }
    const now = new Date().toISOString()
    await pool.query(
      `INSERT INTO sync_state (tabela, last_sync, notion_db_id, status) VALUES ($1, $2, $3, 'ok') ON CONFLICT(tabela) DO UPDATE SET last_sync = $2, status = 'ok'`,
      [table, now, dbId]
    )
    return { table, total: rows.length, inserted, updated, skipped }
  } catch (e) { return { table, error: e.message } }
}

export async function syncAllFromNotion() {
  const results = {}
  for (const t of ['imoveis', 'investidores', 'consultores', 'negocios', 'despesas', 'tarefas']) {
    results[t] = await syncFromNotion(t)
  }
  return results
}

// ── CRM → Notion (push) ─────────────────────────────────────
// Helper para campos opcionais
const optSel = (v) => v ? { select: { name: v } } : undefined
const optDate = (v) => v ? { date: { start: v } } : undefined
const optNum = (v) => (v !== null && v !== undefined && v !== 0) ? { number: v } : undefined
const optText = (v) => v ? { rich_text: [{ text: { content: v } }] } : undefined

const NOTION_FIELD_MAP = {
  imoveis: (row) => ({
    'Nome do Imóvel': { title: [{ text: { content: row.nome ?? '' } }] },
    'Ask Price': optNum(row.ask_price),
    'Valor Proposta': optNum(row.valor_proposta),
    'Custo Estimado de Obra': optNum(row.custo_estimado_obra),
    'Valor de Venda Remodelado': optNum(row.valor_venda_remodelado),
    'ROI': optNum(row.roi),
    'ROI Anualizado': optNum(row.roi_anualizado),
    'Origem': optSel(row.origem),
    'Modelo de Negócio': optSel(row.modelo_negocio),
    'Motivo Descarte': optSel(row.motivo_descarte),
    'Nome Consultor': optText(row.nome_consultor),
    'Link': row.link ? { url: row.link } : undefined,
    'Data Adicionado': optDate(row.data_adicionado),
    'Data Chamada': optDate(row.data_chamada),
    'Data de Visita': optDate(row.data_visita),
    'Data Estudo Mercado': optDate(row.data_estudo_mercado),
    'Data da Proposta': optDate(row.data_proposta),
    'Data Proposta Aceite': optDate(row.data_proposta_aceite),
    'Data Follow Up': optDate(row.data_follow_up),
    'Notas': optText(row.notas),
  }),
  investidores: (row) => ({
    'Nome': { title: [{ text: { content: row.nome ?? '' } }] },
    'Origem': optSel(row.origem),
    'Capital mínimo': optNum(row.capital_min),
    'Capital máximo': optNum(row.capital_max),
    'Montante Investido': optNum(row.montante_investido),
    'NDA Assinado': { checkbox: !!row.nda_assinado },
    'Perfil de Risco': optSel(row.perfil_risco),
    'Proxima Acao': optText(row.proxima_acao),
    'Motivo Não Aprovação': optText(row.motivo_nao_aprovacao),
    'Motivo Inatividade': optText(row.motivo_inatividade),
    'Data Reunião': optDate(row.data_reuniao),
    'Data de Primeiro Contacto': optDate(row.data_primeiro_contacto),
    'Data de Último Contacto': optDate(row.data_ultimo_contacto),
    'Data Capital Transferido': optDate(row.data_capital_transferido),
    'Data Proxima Acao': optDate(row.data_proxima_acao),
    'Data Apresentação Negócio': optDate(row.data_apresentacao_negocio),
    'Data Aprovação Negócio': optDate(row.data_aprovacao_negocio),
    'Notas': optText(row.notas),
  }),
  consultores: (row) => ({
    'Nome': { title: [{ text: { content: row.nome ?? '' } }] },
    'Tipo': optSel(row.tipo),
    'Classificação': optSel(row.classificacao),
    'Contacto': optText(row.contacto),
    'Equipa REMAX': optText(row.equipa_remax),
    'Motivo de Follow Up': optText(row.motivo_follow_up),
    'Motivo Descontinuação': optText(row.motivo_descontinuacao),
    'Imoveis enviado publicados': optNum(row.imoveis_enviados),
    'Imoveis Off/Market ': optNum(row.imoveis_off_market),
    'Meta Mensal Leads': optNum(row.meta_mensal_leads),
    'Comissão %': optNum(row.comissao),
    'Data de Início': optDate(row.data_inicio),
    'Data Follow up': optDate(row.data_follow_up),
    'Data Proximo follow up': optDate(row.data_proximo_follow_up),
    'Data Primeira Call': optDate(row.data_primeira_call),
    'Notas': optText(row.notas),
  }),
  negocios: (row) => ({
    'Movimento': { title: [{ text: { content: row.movimento ?? '' } }] },
    'Categoria': optSel(row.categoria),
    'Fase': optSel(row.fase),
    'Lucro estimado': optNum(row.lucro_estimado),
    'Lucro real': optNum(row.lucro_real),
    'Custo Real de Obra': optNum(row.custo_real_obra),
    'Capital Total €': optNum(row.capital_total),
    'Nº Investidores': optNum(row.n_investidores),
    'Pagamento em falta': { checkbox: !!row.pagamento_em_falta },
    'Data': optDate(row.data),
    'Data Compra': optDate(row.data_compra),
    'Data estimada de venda': optDate(row.data_estimada_venda),
    'Data de venda': optDate(row.data_venda),
    'Notas': optText(row.notas),
  }),
  despesas: (row) => ({
    'Movimento': { title: [{ text: { content: row.movimento ?? '' } }] },
    'Categoria': optSel(row.categoria),
    'Custo Mensal': optNum(row.custo_mensal),
    'Timing Pagamento': optSel(row.timing),
    'Data': optDate(row.data),
    'Notas': optText(row.notas),
  }),
}

export async function syncToNotion(table, id) {
  const dbId = NOTION_DBS[table]; const fieldMapper = NOTION_FIELD_MAP[table]
  if (!dbId || !fieldMapper) return { error: `No mapper for ${table}` }
  const { rows } = await pool.query(`SELECT * FROM ${table} WHERE id = $1`, [id])
  if (!rows[0]) return { error: 'Not found' }
  const row = rows[0]
  const properties = Object.fromEntries(Object.entries(fieldMapper(row)).filter(([, v]) => v !== undefined))
  try {
    if (row.notion_id) {
      await notion.pages.update({ page_id: row.notion_id, properties })
      await pool.query(`UPDATE ${table} SET synced_at = $1 WHERE id = $2`, [new Date().toISOString(), id])
      return { action: 'updated', notionId: row.notion_id }
    } else {
      const page = await notion.pages.create({ parent: { database_id: dbId }, properties })
      await pool.query(`UPDATE ${table} SET notion_id = $1, synced_at = $2 WHERE id = $3`, [page.id, new Date().toISOString(), id])
      return { action: 'created', notionId: page.id }
    }
  } catch (e) { console.error(`[sync→notion] ${table}/${id}:`, e.message); return { error: e.message } }
}
