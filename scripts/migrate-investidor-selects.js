#!/usr/bin/env node
/**
 * Migration: converte campos free-text de investidores em valores canónicos
 * compatíveis com os novos selects/multi-selects.
 *
 *   roi_pretendido          (text) → enum
 *   experiencia_imobiliario (text) → enum
 *   tipo_imovel_preferido   (text) → JSON array
 *   localizacao_preferida   (text) → JSON array
 *   equipa_obras            (text) → enum
 *
 * Uso:
 *   node scripts/migrate-investidor-selects.js --dry-run
 *   node scripts/migrate-investidor-selects.js
 */
import 'dotenv/config'
import pool from '../src/db/pg.js'
import { mapRoi, mapExperiencia, mapTipoImovel, mapLocalizacao, mapEquipa } from '../src/db/investidorMappers.js'

const DRY_RUN = process.argv.includes('--dry-run')

const FIELDS = [
  { col: 'roi_pretendido', mapper: mapRoi },
  { col: 'experiencia_imobiliario', mapper: mapExperiencia },
  { col: 'tipo_imovel_preferido', mapper: mapTipoImovel },
  { col: 'localizacao_preferida', mapper: mapLocalizacao },
  { col: 'equipa_obras', mapper: mapEquipa },
]

async function main() {
  const { rows } = await pool.query(
    `SELECT id, nome, roi_pretendido, experiencia_imobiliario, tipo_imovel_preferido,
            localizacao_preferida, equipa_obras
     FROM investidores ORDER BY nome`
  )
  console.log(`A analisar ${rows.length} investidores. ${DRY_RUN ? '[DRY-RUN]' : '[LIVE]'}\n`)

  let changes = 0
  let unmapped = 0
  const changesByInv = new Map()

  for (const inv of rows) {
    const updates = {}
    const log = []
    for (const { col, mapper } of FIELDS) {
      const cur = inv[col]
      if (!cur) continue
      const next = mapper(cur)
      if (next === null) {
        log.push(`  ✗ ${col}: "${cur}" → (não mapeado, mantém)`)
        unmapped++
        continue
      }
      if (next !== cur) {
        updates[col] = next
        log.push(`  ✓ ${col}: "${cur}" → "${next}"`)
      }
    }
    if (Object.keys(updates).length > 0 || log.some(l => l.includes('✗'))) {
      console.log(`${inv.nome} (${inv.id})`)
      log.forEach(l => console.log(l))
      console.log()
    }
    if (Object.keys(updates).length > 0) {
      changes++
      changesByInv.set(inv.id, updates)
    }
  }

  console.log(`\n${changes} fichas a actualizar · ${unmapped} valores sem mapeamento`)
  if (DRY_RUN || changes === 0) {
    await pool.end()
    return
  }

  for (const [id, updates] of changesByInv) {
    const cols = Object.keys(updates)
    const vals = cols.map(c => updates[c])
    const sets = cols.map((c, i) => `${c} = $${i + 1}`).join(', ')
    await pool.query(`UPDATE investidores SET ${sets}, updated_at = NOW()::TEXT WHERE id = $${cols.length + 1}`, [...vals, id])
  }
  console.log(`Actualizados ${changes} registos.`)
  await pool.end()
}

main().catch(err => { console.error(err); process.exit(1) })
