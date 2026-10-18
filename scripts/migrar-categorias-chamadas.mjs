// One-off: categorias de chamadas da Agenda passam a Cold Call, Discovery Call
// e Follow-up por público (imóveis, consultores, investidores, parceiros).
//   • «Call de Imóveis Anunciados» → «Cold Call de Imóveis»
//   • «Call a Investidores»        → «Cold Call a Investidores»
//   (tarefas e modelos de tarefas recorrentes)
//   • Próximos contactos em aberto (origem_campo = 'proximo_contacto') ganham
//     a categoria e o título do tipo sugerido pela fase da pessoa, como os
//     contactos novos (src/db/contactoPessoa.js).
//
// Idempotente. Dry-run por defeito; passar --apply para gravar.
import 'dotenv/config'
import pg from 'pg'
import { agendarContactoPessoa } from '../src/db/contactoPessoa.js'

const APPLY = process.argv.includes('--apply')
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } })
const RENOMEAR = [
  ['Call de Imóveis Anunciados', 'Cold Call de Imóveis'],
  ['Call a Investidores', 'Cold Call a Investidores'],
]

const client = await pool.connect()
try {
  await client.query('BEGIN')
  console.log(APPLY ? '>>> MODO APPLY (vai gravar)\n' : '>>> DRY-RUN (nada gravado; usar --apply)\n')
  for (const [antiga, nova] of RENOMEAR) {
    const t = await client.query('UPDATE tarefas SET categoria = $1 WHERE categoria = $2', [nova, antiga])
    const m = await client.query('UPDATE tarefas_templates SET categoria = $1 WHERE categoria = $2', [nova, antiga])
    console.log(`«${antiga}» → «${nova}»: ${t.rowCount} tarefa(s), ${m.rowCount} modelo(s)`)
  }

  const { rows: abertas } = await client.query(
    `SELECT id, tarefa, categoria, origem_tipo, origem_id, data_limite, inicio FROM tarefas
     WHERE origem_campo = 'proximo_contacto' AND status NOT IN ('Concluída', 'Concluida') AND COALESCE(arquivada, false) = false
     ORDER BY origem_tipo, tarefa`)
  console.log(`\n${abertas.length} próximo(s) contacto(s) em aberto:`)
  for (const t of abertas) {
    const data = String(t.data_limite || t.inicio || '').slice(0, 10)
    const quando = /T\d{2}:\d{2}/.test(String(t.inicio || '')) ? t.inicio : null
    await agendarContactoPessoa(client, t.origem_tipo, t.origem_id, { data, quando })
    const { rows: [d] } = await client.query('SELECT tarefa, categoria FROM tarefas WHERE id = $1', [t.id])
    const mudou = d.tarefa !== t.tarefa || d.categoria !== t.categoria
    console.log(`  ${mudou ? '✏️ ' : '= '} [${t.categoria}] ${t.tarefa}${mudou ? `  →  [${d.categoria}] ${d.tarefa}` : ''}`)
  }

  await client.query(APPLY ? 'COMMIT' : 'ROLLBACK')
  console.log(APPLY ? '\n✅ Aplicado.' : '\nℹ️  Dry-run — correr com --apply para gravar.')
} catch (e) {
  await client.query('ROLLBACK')
  console.error('❌ rollback:', e.message)
  process.exitCode = 1
} finally {
  client.release()
  await pool.end()
}
