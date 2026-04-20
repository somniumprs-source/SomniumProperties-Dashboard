/**
 * Auto-complete de checklist: marca como concluídas as tarefas cujos campos
 * do imóvel já estão preenchidos.
 */
import 'dotenv/config'
import pg from 'pg'

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })

const { rows: imoveis } = await pool.query('SELECT * FROM imoveis')
console.log(`${imoveis.length} imóveis\n`)

const now = new Date().toISOString()
let totalCompleted = 0

for (const im of imoveis) {
  const { rows: pending } = await pool.query(
    "SELECT * FROM checklist_imovel WHERE imovel_id = $1 AND concluida = false AND campo_crm IS NOT NULL",
    [im.id]
  )

  const toComplete = []
  for (const cl of pending) {
    // Ignorar campos de análise, negócio, docs, calendário, notas, fotos
    if (/^(analise:|negocio:|doc:|tarefa calendario)/.test(cl.campo_crm)) continue
    const fields = cl.campo_crm.split(',').map(f => f.trim()).filter(f => f !== 'notas' && f !== 'fotos')
    if (fields.length === 0) continue

    const allFilled = fields.every(f => {
      const v = im[f]
      return v !== null && v !== undefined && v !== '' && v !== 0
    })
    if (allFilled) toComplete.push({ id: cl.id, titulo: cl.titulo, fields })
  }

  if (toComplete.length > 0) {
    await pool.query(
      `UPDATE checklist_imovel SET concluida = true, concluida_em = $1, concluida_por = 'auto', updated_at = $1
       WHERE id = ANY($2)`,
      [now, toComplete.map(t => t.id)]
    )
    console.log(`  ${im.nome}: ${toComplete.length} tarefas auto-completadas`)
    for (const t of toComplete) {
      console.log(`    - ${t.titulo} (${t.fields.join(', ')})`)
    }
    totalCompleted += toComplete.length
  } else {
    console.log(`  ${im.nome}: 0 tarefas auto-completadas`)
  }
}

// Resumo
const { rows: stats } = await pool.query(
  `SELECT
    COUNT(*) FILTER (WHERE obrigatoria) as total_obrig,
    COUNT(*) FILTER (WHERE obrigatoria AND concluida) as done_obrig,
    COUNT(*) FILTER (WHERE concluida_por = 'auto') as auto_completed
   FROM checklist_imovel`
)
console.log(`\nTotal auto-completadas agora: ${totalCompleted}`)
console.log(`Total auto-completadas (acumulado): ${stats[0].auto_completed}`)
console.log(`Progresso global: ${stats[0].done_obrig}/${stats[0].total_obrig} obrigatórias concluídas`)

await pool.end()
