#!/usr/bin/env node
/**
 * Migration da pipeline de investidores:
 *  - "Investidor em espera"   → "Investidor Qualificado em Carteira" (todos)
 *  - "Acesso a Off-Market"    → "Investidor Qualificado em Carteira" (legado, removido do funil)
 *  - "Investidor Activo"      → "Investidor Ativo" (correcção ortográfica)
 *  - Para Ativos com "Investidor em parceria" → "Investidor Ativo"
 *  - Passa Follow Up sem actividade > 90d para "Inactivo"
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

  // 1. "Investidor em espera" → "Investidor Qualificado em Carteira" (todos os tipos)
  const emEspera = await fetch(
    `SELECT id, nome FROM investidores WHERE status = 'Investidor em espera'`
  )
  console.log(`[1] "Investidor em espera" → "Investidor Qualificado em Carteira": ${emEspera.length} fichas`)
  emEspera.forEach(i => console.log(`    - ${i.nome}`))

  // 2. "Acesso a Off-Market" → "Investidor Qualificado em Carteira" (estado legado removido)
  const offMarket = await fetch(
    `SELECT id, nome FROM investidores WHERE status = 'Acesso a Off-Market'`
  )
  console.log(`\n[2] "Acesso a Off-Market" → "Investidor Qualificado em Carteira": ${offMarket.length} fichas`)
  offMarket.forEach(i => console.log(`    - ${i.nome}`))

  // 3. "Investidor Activo" → "Investidor Ativo" (ortografia)
  const activoOrtografia = await fetch(
    `SELECT id, nome FROM investidores WHERE status = 'Investidor Activo'`
  )
  console.log(`\n[3] "Investidor Activo" → "Investidor Ativo": ${activoOrtografia.length} fichas`)
  activoOrtografia.forEach(i => console.log(`    - ${i.nome}`))

  // 4. Ativo + "Investidor em parceria" → "Investidor Ativo"
  const ativoParceria = await fetch(
    `SELECT id, nome FROM investidores WHERE status = 'Investidor em parceria' AND tipo_principal = 'Ativo'`
  )
  console.log(`\n[4] Ativo "Investidor em parceria" → "Investidor Ativo": ${ativoParceria.length} fichas`)
  ativoParceria.forEach(i => console.log(`    - ${i.nome}`))

  // 5. Follow Up parado > 90d → Inactivo (usa última actividade conhecida:
  //    último contacto > 1º contacto > created_at)
  const followUpStale = await fetch(
    `SELECT id, nome, data_ultimo_contacto, data_primeiro_contacto, created_at FROM investidores
     WHERE status = 'Follow Up'
       AND COALESCE(data_ultimo_contacto, data_primeiro_contacto, created_at)
           < TO_CHAR(NOW() - INTERVAL '90 days', 'YYYY-MM-DD')`
  )
  console.log(`\n[5] Follow Up parado > 90d → "Inactivo": ${followUpStale.length} fichas`)
  followUpStale.forEach(i => console.log(`    - ${i.nome} (última actividade: ${i.data_ultimo_contacto || i.data_primeiro_contacto || (i.created_at || '').slice(0,10) || '?'})`))

  if (DRY_RUN) {
    console.log('\n[DRY-RUN] Nenhuma alteração aplicada.')
    await pool.end()
    return
  }

  // Apply
  if (emEspera.length > 0) {
    await pool.query(
      `UPDATE investidores SET status = 'Investidor Qualificado em Carteira', updated_at = $1
       WHERE status = 'Investidor em espera'`,
      [now]
    )
  }
  if (offMarket.length > 0) {
    await pool.query(
      `UPDATE investidores SET status = 'Investidor Qualificado em Carteira', updated_at = $1
       WHERE status = 'Acesso a Off-Market'`,
      [now]
    )
  }
  if (activoOrtografia.length > 0) {
    await pool.query(
      `UPDATE investidores SET status = 'Investidor Ativo', updated_at = $1
       WHERE status = 'Investidor Activo'`,
      [now]
    )
  }
  if (ativoParceria.length > 0) {
    await pool.query(
      `UPDATE investidores SET status = 'Investidor Ativo', updated_at = $1
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

  const total = emEspera.length + offMarket.length + activoOrtografia.length + ativoParceria.length + followUpStale.length
  console.log(`\nActualizados ${total} registos no total.`)
  await pool.end()
}

main().catch(err => { console.error(err); process.exit(1) })
