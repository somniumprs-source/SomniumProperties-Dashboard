// One-off: normaliza imoveis.modelo_negocio = 'Wholesaling' para imóveis que
// SÃO Wholesalling mas têm o campo a divergir (ex.: 'CAEP'). Critério: têm um
// negócio activo categoria='Wholesalling' OU estão em estado Wholesaling.
// Dry-run por defeito; --apply para gravar.
import 'dotenv/config'
import pg from 'pg'

const APPLY = process.argv.includes('--apply')
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } })

const SQL = `
  SELECT DISTINCT i.id, i.nome, i.estado, i.modelo_negocio
  FROM imoveis i
  WHERE i.modelo_negocio IS DISTINCT FROM 'Wholesaling'
    AND (
      i.estado IN ('Wholesaling','Wholesalling')
      OR EXISTS (
        SELECT 1 FROM negocios n
        WHERE n.imovel_id = i.id AND n.categoria = 'Wholesalling' AND n.deleted_at IS NULL
      )
    )
  ORDER BY i.nome
`

const { rows } = await pool.query(SQL)
console.log(`\n=== ${rows.length} imóvel(eis) Wholesalling com modelo_negocio a corrigir ===`)
console.log(APPLY ? '>>> MODO APPLY\n' : '>>> DRY-RUN (usar --apply)\n')
for (const r of rows) {
  console.log(`• ${r.nome} — estado=${r.estado} · modelo_negocio: ${JSON.stringify(r.modelo_negocio)} → "Wholesaling"`)
}

if (APPLY && rows.length > 0) {
  const ids = rows.map(r => r.id)
  const { rowCount } = await pool.query(
    `UPDATE imoveis SET modelo_negocio = 'Wholesaling', updated_at = NOW()::TEXT WHERE id = ANY($1)`, [ids]
  )
  console.log(`\n✅ ${rowCount} imóvel(eis) actualizado(s).`)
} else if (!APPLY) {
  console.log('\nℹ️  Dry-run — correr com --apply para gravar.')
}
await pool.end()
