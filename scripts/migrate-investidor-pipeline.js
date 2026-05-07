#!/usr/bin/env node
/**
 * Migration da pipeline de investidores:
 *  - Renomeia "Investidor em espera" → "Investidor Qualificado em Carteira" (Passivo)
 *  - Para Ativos com "Investidor em espera"   → "Acesso a Off-Market"
 *  - Para Ativos com "Investidor em parceria" → "Investidor Activo"
 *  - Passa Follow Up sem contacto > 90d para "Inactivo" (com motivo_inatividade)
 *
 * Uso:
 *   node scripts/migrate-investidor-pipeline.js --dry-run
 *   node scripts/migrate-investidor-pipeline.js
 */
import 'dotenv/config'
import pool from '../src/db/pg.js'

const DRY_RUN = process.argv.includes('--dry-run')

async function fetch(sql, params = []) {
  const { rows } = await pool.query(sql, params)
  return rows
}

async function main() {
  console.log(DRY_RUN ? '[DRY-RUN]\n' : '[LIVE]\n')
  const now = new Date().toISOString()

  // 1. Investidor em espera → Investidor Qualificado em Carteira (Passivo ou null)
  const passivoEmEspera = await fetch(
    `SELECT id, nome FROM investidores
     WHERE status = 'Investidor em espera' AND (tipo_principal IS NULL OR tipo_principal = 'Passivo')`
  )
  console.log(`[1] Passivo "Investidor em espera" → "Investidor Qualificado em Carteira": ${passivoEmEspera.length} fichas`)
  passivoEmEspera.forEach(i => console.log(`    - ${i.nome}`))

  // 2. Ativo + Investidor em espera → Acesso a Off-Market
  const ativoEmEspera = await fetch(
    `SELECT id, nome FROM investidores WHERE status = 'Investidor em espera' AND tipo_principal = 'Ativo'`
  )
  console.log(`\n[2] Ativo "Investidor em espera" → "Acesso a Off-Market": ${ativoEmEspera.length} fichas`)
  ativoEmEspera.forEach(i => console.log(`    - ${i.nome}`))

  // 3. Ativo + Investidor em parceria → Investidor Activo
  const ativoParceria = await fetch(
    `SELECT id, nome FROM investidores WHERE status = 'Investidor em parceria' AND tipo_principal = 'Ativo'`
  )
  console.log(`\n[3] Ativo "Investidor em parceria" → "Investidor Activo": ${ativoParceria.length} fichas`)
  ativoParceria.forEach(i => console.log(`    - ${i.nome}`))

  // 4. Follow Up parado > 90d → Inactivo (usa última actividade conhecida:
  //    último contacto > 1º contacto > created_at)
  const followUpStale = await fetch(
    `SELECT id, nome, data_ultimo_contacto, data_primeiro_contacto, created_at FROM investidores
     WHERE status = 'Follow Up'
       AND COALESCE(data_ultimo_contacto, data_primeiro_contacto, created_at)
           < TO_CHAR(NOW() - INTERVAL '90 days', 'YYYY-MM-DD')`
  )
  console.log(`\n[4] Follow Up parado > 90d → "Inactivo": ${followUpStale.length} fichas`)
  followUpStale.forEach(i => console.log(`    - ${i.nome} (última actividade: ${i.data_ultimo_contacto || i.data_primeiro_contacto || (i.created_at || '').slice(0,10) || '?'})`))

  if (DRY_RUN) {
    console.log('\n[DRY-RUN] Nenhuma alteração aplicada.')
    await pool.end()
    return
  }

  // Apply
  if (passivoEmEspera.length > 0) {
    await pool.query(
      `UPDATE investidores SET status = 'Investidor Qualificado em Carteira', updated_at = $1
       WHERE status = 'Investidor em espera' AND (tipo_principal IS NULL OR tipo_principal = 'Passivo')`,
      [now]
    )
  }
  if (ativoEmEspera.length > 0) {
    await pool.query(
      `UPDATE investidores SET status = 'Acesso a Off-Market', updated_at = $1
       WHERE status = 'Investidor em espera' AND tipo_principal = 'Ativo'`,
      [now]
    )
  }
  if (ativoParceria.length > 0) {
    await pool.query(
      `UPDATE investidores SET status = 'Investidor Activo', updated_at = $1
       WHERE status = 'Investidor em parceria' AND tipo_principal = 'Ativo'`,
      [now]
    )
  }
  if (followUpStale.length > 0) {
    await pool.query(
      `UPDATE investidores SET
         status = 'Inactivo',
         motivo_inatividade = COALESCE(NULLIF(motivo_inatividade, ''), 'Sem actividade há mais de 90 dias'),
         updated_at = $1
       WHERE status = 'Follow Up'
         AND COALESCE(data_ultimo_contacto, data_primeiro_contacto, created_at)
             < TO_CHAR(NOW() - INTERVAL '90 days', 'YYYY-MM-DD')`,
      [now]
    )
  }

  const total = passivoEmEspera.length + ativoEmEspera.length + ativoParceria.length + followUpStale.length
  console.log(`\nActualizados ${total} registos no total.`)
  await pool.end()
}

main().catch(err => { console.error(err); process.exit(1) })
