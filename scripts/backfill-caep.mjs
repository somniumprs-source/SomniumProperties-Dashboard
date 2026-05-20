// Backfill one-off: cria negocios CAEP para imóveis em estado CAEP que
// não tenham negocio activo (efeito do bug em routes.js:385 onUpdate).
import 'dotenv/config'
import { randomUUID } from 'crypto'
import pg from 'pg'
import { FASES_POR_CATEGORIA, getTemplateFases } from '../src/db/fasesFixFlip.js'

const { Pool } = pg
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } })

const ESTADO_PARA_CATEGORIA = {
  'Wholesaling':  'Wholesalling',
  'Wholesalling': 'Wholesalling',
  'CAEP':         'CAEP',
  'Fix and Flip': 'Fix and Flip',
}

async function criarFasesProjecto(client, negocioId, categoria) {
  const template = getTemplateFases(categoria)
  if (!template) return

  const { rows: existentes } = await client.query(
    'SELECT id FROM projeto_fases WHERE negocio_id = $1 LIMIT 1', [negocioId]
  )
  if (existentes.length > 0) return

  const { rows: negRows } = await client.query('SELECT tipo_projeto FROM negocios WHERE id = $1', [negocioId])
  const tipoProjeto = negRows[0]?.tipo_projeto || 'fracao_unica'

  let fracaoId = null
  if (tipoProjeto === 'fracao_unica') {
    fracaoId = randomUUID()
    await client.query(
      `INSERT INTO projeto_fracoes (id, negocio_id, nome, tipo, ordem)
       VALUES ($1, $2, $3, 'fracao', 0)
       ON CONFLICT (negocio_id, nome) DO NOTHING`,
      [fracaoId, negocioId, 'Fração Única']
    )
  }

  for (let i = 0; i < template.length; i++) {
    const fase = template[i]
    const faseId = randomUUID()
    await client.query(
      `INSERT INTO projeto_fases (id, negocio_id, fracao_id, fase_key, nome, ordem, estado)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [faseId, negocioId, fracaoId, fase.key, fase.nome, i, i === 0 ? 'em_curso' : 'pendente']
    )
    for (let j = 0; j < fase.tarefas.length; j++) {
      await client.query(
        `INSERT INTO projeto_tarefas (id, fase_id, descricao, ordem) VALUES ($1, $2, $3, $4)`,
        [randomUUID(), faseId, fase.tarefas[j], j]
      )
    }
  }
}

async function autoCriarNegocio(client, imovel) {
  const categoria = ESTADO_PARA_CATEGORIA[imovel.estado]
  if (!categoria) { console.log(`  skip: estado "${imovel.estado}" não é modelo de negócio`); return null }

  const { rows: existentes } = await client.query(
    `SELECT id FROM negocios WHERE imovel_id = $1 AND deleted_at IS NULL LIMIT 1`, [imovel.id]
  )
  if (existentes.length > 0) { console.log(`  skip: já existe negocio ${existentes[0].id}`); return null }

  const negocioId = randomUUID()
  const capital = Number(imovel.valor_proposta) > 0 ? Number(imovel.valor_proposta) : (Number(imovel.ask_price) || 0)
  const lucroEst = Number(imovel.valor_venda_remodelado) > 0 && Number(imovel.custo_estimado_obra) >= 0 && capital > 0
    ? Math.max(0, Number(imovel.valor_venda_remodelado) - capital - Number(imovel.custo_estimado_obra || 0))
    : 0
  const movimento = imovel.nome || `Projecto ${categoria}`
  const notas = `Backfill (bug onUpdate routes.js:385) — imóvel "${imovel.nome || imovel.id}" estado=${imovel.estado}`

  await client.query(
    `INSERT INTO negocios (id, movimento, categoria, fase, capital_total, lucro_estimado, imovel_id, data, notas)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [negocioId, movimento, categoria, 'Fase de obras', capital, lucroEst, imovel.id,
     new Date().toISOString().slice(0, 10), notas]
  )

  if (FASES_POR_CATEGORIA[categoria]) {
    await criarFasesProjecto(client, negocioId, categoria)
  }

  console.log(`  ✅ negocio ${negocioId} criado (capital=${capital}, lucroEst=${lucroEst})`)
  return negocioId
}

const { rows: imoveis } = await pool.query(
  `SELECT i.* FROM imoveis i
   WHERE i.estado IN ('CAEP','Wholesaling','Wholesalling','Fix and Flip')
     AND NOT EXISTS (SELECT 1 FROM negocios n WHERE n.imovel_id = i.id AND n.deleted_at IS NULL)
   ORDER BY i.updated_at DESC NULLS LAST`
)

console.log(`\n=== ${imoveis.length} imóveis sem negocio activo num estado de modelo de negócio ===\n`)

const client = await pool.connect()
try {
  for (const im of imoveis) {
    console.log(`• ${im.nome} (${im.estado})`)
    await client.query('BEGIN')
    try {
      await autoCriarNegocio(client, im)
      await client.query('COMMIT')
    } catch (e) {
      await client.query('ROLLBACK')
      console.error(`  ❌ rollback: ${e.message}`)
    }
  }
} finally {
  client.release()
  await pool.end()
}
