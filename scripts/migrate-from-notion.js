#!/usr/bin/env node
/**
 * Migração completa: Notion → SQLite
 * Puxa todos os dados das 5 DBs ativas e insere na DB local.
 * Seguro para correr múltiplas vezes (upsert por notion_id).
 *
 * Usage: node scripts/migrate-from-notion.js [--dry-run]
 */
import 'dotenv/config'
import { Client } from '@notionhq/client'
import { randomUUID } from 'crypto'

const DRY_RUN = process.argv.includes('--dry-run')

// Import DB (dynamic to handle ESM)
const { default: db } = await import('../src/db/schema.js')

const notion = new Client({ auth: process.env.NOTION_API_KEY })

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
const relations = p => JSON.stringify((p?.relation ?? []).map(r => r.id))

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

function upsert(table, notionId, data) {
  const existing = db.prepare(`SELECT id FROM ${table} WHERE notion_id = ?`).get(notionId)
  const now = new Date().toISOString()

  if (existing) {
    const sets = Object.keys(data).map(k => `${k} = @${k}`).join(', ')
    db.prepare(`UPDATE ${table} SET ${sets}, updated_at = @updated_at, synced_at = @synced_at WHERE notion_id = @notion_id`).run({
      ...data, notion_id: notionId, updated_at: now, synced_at: now,
    })
    return { action: 'UPDATE', id: existing.id }
  } else {
    const id = randomUUID()
    const cols = ['id', 'notion_id', ...Object.keys(data), 'created_at', 'updated_at', 'synced_at']
    const vals = cols.map(c => `@${c}`).join(', ')
    db.prepare(`INSERT INTO ${table} (${cols.join(', ')}) VALUES (${vals})`).run({
      id, notion_id: notionId, ...data, created_at: now, updated_at: now, synced_at: now,
    })
    return { action: 'INSERT', id }
  }
}

// ── Migração por tabela ──────────────────────────────────────

async function migrateImoveis() {
  const dbId = process.env.NOTION_DB_PIPELINE_IMOVEIS
  if (!dbId) { console.log('  SKIP: NOTION_DB_PIPELINE_IMOVEIS not set'); return 0 }
  const rows = await queryAll(dbId)
  let count = 0
  for (const p of rows) {
    const pr = p.properties
    const zonaMulti = (pr['Zona (Multi)']?.multi_select ?? []).map(s => s.name)
    const zonaLegacy = text(pr['Zona'])
    const data = {
      nome: title(pr['Nome do Imóvel']),
      estado: statusP(pr['Estado']),
      tipologia: text(pr['Tipologia']) || sel(pr['Tipologia']),
      ask_price: num(pr['Ask Price']),
      valor_proposta: num(pr['Valor Proposta']),
      custo_estimado_obra: num(pr['Custo Estimado de Obra']),
      valor_venda_remodelado: num(pr['Valor de Venda Remodelado']),
      roi: num(pr['ROI']),
      roi_anualizado: num(pr['ROI Anualizado']),
      area_util: num(pr['Área Util']),
      area_bruta: num(pr['Área Bruta']),
      origem: sel(pr['Origem']),
      zona: zonaMulti[0] ?? zonaLegacy ?? null,
      zonas: JSON.stringify(zonaMulti.length > 0 ? zonaMulti : zonaLegacy ? [zonaLegacy] : []),
      nome_consultor: text(pr['Nome Consultor']),
      modelo_negocio: sel(pr['Modelo de Negócio']),
      motivo_descarte: sel(pr['Motivo Descarte']),
      link: pr['Link']?.url ?? null,
      data_adicionado: dt(pr['Data Adicionado']),
      data_chamada: dt(pr['Data Chamada']),
      data_visita: dt(pr['Data de Visita']),
      data_estudo_mercado: dt(pr['Data Estudo Mercado']),
      data_proposta: dt(pr['Data da Proposta']),
      data_proposta_aceite: dt(pr['Data Proposta Aceite']),
      data_follow_up: dt(pr['Data Follow Up']),
      data_aceite_investidor: dt(pr['Data de aceitação por investidor']),
      notas: text(pr['Notas']),
    }
    if (!DRY_RUN) upsert('imoveis', p.id, data)
    count++
  }
  return count
}

async function migrateInvestidores() {
  const dbId = process.env.NOTION_DB_INVESTIDORES
  if (!dbId) { console.log('  SKIP: NOTION_DB_INVESTIDORES not set'); return 0 }
  const rows = await queryAll(dbId)
  let count = 0
  for (const p of rows) {
    const pr = p.properties
    const nome = title(pr['Nome'])
    if (!nome) continue // skip blank entries
    const data = {
      nome,
      status: statusP(pr['Status']),
      classificacao: (pr['Classificação']?.multi_select ?? []).map(s => s.name)[0] ?? null,
      pontuacao: num(pr['Pontuação Classificação']),
      capital_min: num(pr['Capital mínimo']),
      capital_max: num(pr['Capital máximo']),
      montante_investido: num(pr['Montante Investido']),
      numero_negocios: num(pr['Numero de Negocios']),
      estrategia: multisel(pr['Estratégia de Investimento']),
      origem: sel(pr['Origem']),
      nda_assinado: checkbox(pr['NDA Assinado']),
      tipo_investidor: multisel(pr['Tipo de Investidor']),
      perfil_risco: sel(pr['Perfil de Risco']),
      telemovel: phoneP(pr['Telemovel']),
      email: emailP(pr['Email']),
      proxima_acao: text(pr['Proxima Acao']),
      roi_investidor: num(pr['ROI Investidor %']),
      roi_anualizado_investidor: num(pr['ROI Anualizado Investidor %']),
      motivo_nao_aprovacao: text(pr['Motivo Não Aprovação']),
      motivo_inatividade: text(pr['Motivo Inatividade']),
      data_reuniao: dt(pr['Data Reunião']),
      data_primeiro_contacto: dt(pr['Data de Primeiro Contacto']),
      data_ultimo_contacto: dt(pr['Data de Último Contacto']),
      data_capital_transferido: dt(pr['Data Capital Transferido']),
      data_proxima_acao: dt(pr['Data Proxima Acao']),
      data_apresentacao_negocio: dt(pr['Data Apresentação Negócio']),
      data_aprovacao_negocio: dt(pr['Data Aprovação Negócio']),
      data_follow_up: dt(pr['Data Follow Up'] ?? pr['Data de Follow Up']),
      notas: text(pr['Notas']),
    }
    if (!DRY_RUN) upsert('investidores', p.id, data)
    count++
  }
  return count
}

async function migrateConsultores() {
  const dbId = process.env.NOTION_DB_CONSULTORES
  if (!dbId) { console.log('  SKIP: NOTION_DB_CONSULTORES not set'); return 0 }
  const rows = await queryAll(dbId)
  let count = 0
  for (const p of rows) {
    const pr = p.properties
    const nome = title(pr['Nome'])
    if (!nome) continue
    const data = {
      nome,
      estatuto: statusP(pr['Estatuto']),
      tipo: sel(pr['Tipo']),
      classificacao: sel(pr['Classificação']),
      imobiliaria: multisel(pr['Imobiliária']),
      zonas: multisel(pr['Zona de Atuação']),
      contacto: text(pr['Contacto']),
      email: emailP(pr['Email']),
      equipa_remax: text(pr['Equipa REMAX']),
      data_inicio: dt(pr['Data de Início']),
      data_follow_up: dt(pr['Data Follow up']),
      data_proximo_follow_up: dt(pr['Data Proximo follow up']),
      motivo_follow_up: text(pr['Motivo de Follow Up']),
      imoveis_enviados: num(pr['Imoveis enviado publicados']),
      imoveis_off_market: num(pr['Imoveis Off/Market ']),
      meta_mensal_leads: num(pr['Meta Mensal Leads']),
      comissao: num(pr['Comissão %']),
      data_primeira_call: dt(pr['Data Primeira Call']),
      lucro_gerado: num(pr['Lucro Gerado €']),
      motivo_descontinuacao: text(pr['Motivo Descontinuação']),
      notas: text(pr['Notas']),
    }
    if (!DRY_RUN) upsert('consultores', p.id, data)
    count++
  }
  return count
}

async function migrateNegocios() {
  const dbId = process.env.NOTION_DB_FATURACAO
  if (!dbId) { console.log('  SKIP: NOTION_DB_FATURACAO not set'); return 0 }
  const rows = await queryAll(dbId)
  let count = 0
  for (const p of rows) {
    const pr = p.properties
    const data = {
      movimento: title(pr['Movimento']),
      categoria: sel(pr['Categoria']),
      fase: sel(pr['Fase']),
      lucro_estimado: num(pr['Lucro estimado']),
      lucro_real: num(pr['Lucro real']),
      custo_real_obra: num(pr['Custo Real de Obra']),
      capital_total: num(pr['Capital Total €']),
      n_investidores: num(pr['Nº Investidores']),
      quota_somnium: formula(pr['Quota Somnium €']) ?? 0,
      pagamento_em_falta: checkbox(pr['Pagamento em falta']),
      data: dt(pr['Data']),
      data_compra: dt(pr['Data Compra']),
      data_estimada_venda: dt(pr['Data estimada de venda']),
      data_venda: dt(pr['Data de venda']),
      imovel_id: (() => {
        const notionImovelId = (pr['Imóvel']?.relation ?? [])[0]?.id ?? null
        if (!notionImovelId) return null
        const row = db.prepare('SELECT id FROM imoveis WHERE notion_id = ?').get(notionImovelId)
        return row?.id ?? null
      })(),
      investidor_ids: relations(pr['Investidor']),
      consultor_ids: relations(pr['Consultor']),
      notas: text(pr['Notas']),
    }
    if (!DRY_RUN) upsert('negocios', p.id, data)
    count++
  }
  return count
}

async function migrateDespesas() {
  const dbId = process.env.NOTION_DB_DESPESAS
  if (!dbId) { console.log('  SKIP: NOTION_DB_DESPESAS not set'); return 0 }
  const rows = await queryAll(dbId)
  let count = 0
  for (const p of rows) {
    const pr = p.properties
    const timing = sel(pr['Timing Pagamento'])
    const custoMensal = num(pr['Custo Mensal'])
    const custoAnualFormula = formula(pr['Custo Anual']) ?? 0
    const custoAnualReal = num(pr['Custo Anual (Real)'])
    const custoAnual = custoAnualFormula || custoAnualReal || (timing === 'Mensalmente' ? custoMensal * 12 : custoMensal)

    const data = {
      movimento: title(pr['Movimento']),
      categoria: sel(pr['Categoria']),
      data: dt(pr['Data']),
      custo_mensal: custoMensal,
      custo_anual: Math.round(custoAnual * 100) / 100,
      timing,
      notas: text(pr['Notas']),
    }
    if (!DRY_RUN) upsert('despesas', p.id, data)
    count++
  }
  return count
}

// ── Main ─────────────────────────────────────────────────────
async function main() {
  console.log(`\n=== MIGRAÇÃO NOTION → SQLITE ${DRY_RUN ? '(DRY RUN)' : '(LIVE)'} ===\n`)

  const results = {}

  console.log('Migrando Pipeline Imóveis...')
  results.imoveis = await migrateImoveis()
  console.log(`  → ${results.imoveis} registos\n`)

  console.log('Migrando Investidores...')
  results.investidores = await migrateInvestidores()
  console.log(`  → ${results.investidores} registos\n`)

  console.log('Migrando Consultores...')
  results.consultores = await migrateConsultores()
  console.log(`  → ${results.consultores} registos\n`)

  console.log('Migrando Negócios (Faturação)...')
  results.negocios = await migrateNegocios()
  console.log(`  → ${results.negocios} registos\n`)

  console.log('Migrando Despesas...')
  results.despesas = await migrateDespesas()
  console.log(`  → ${results.despesas} registos\n`)

  // Update sync state
  if (!DRY_RUN) {
    const now = new Date().toISOString()
    const syncUpsert = db.prepare(`INSERT INTO sync_state (tabela, last_sync, notion_db_id, status) VALUES (?, ?, ?, 'ok') ON CONFLICT(tabela) DO UPDATE SET last_sync = ?, status = 'ok'`)
    syncUpsert.run('imoveis', now, process.env.NOTION_DB_PIPELINE_IMOVEIS, now)
    syncUpsert.run('investidores', now, process.env.NOTION_DB_INVESTIDORES, now)
    syncUpsert.run('consultores', now, process.env.NOTION_DB_CONSULTORES, now)
    syncUpsert.run('negocios', now, process.env.NOTION_DB_FATURACAO, now)
    syncUpsert.run('despesas', now, process.env.NOTION_DB_DESPESAS, now)
  }

  console.log('=== RESUMO ===')
  const total = Object.values(results).reduce((s, v) => s + v, 0)
  for (const [table, count] of Object.entries(results)) {
    console.log(`  ${table}: ${count}`)
  }
  console.log(`  TOTAL: ${total} registos migrados`)
  console.log('\n=== MIGRAÇÃO CONCLUÍDA ===\n')
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1) })
