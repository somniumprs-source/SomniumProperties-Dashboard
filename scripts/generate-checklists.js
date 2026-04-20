/**
 * Script para gerar checklists para todos os imóveis existentes.
 * Gera items para o estado actual + todos os estados anteriores.
 */
import 'dotenv/config'
import pg from 'pg'
import crypto from 'crypto'
import { CHECKLIST_TEMPLATES } from '../src/constants/checklistTemplates.js'

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })

const PIPELINE = [
  'Pré-aprovação','Adicionado','Chamada Não Atendida','Pendentes',
  'Necessidade de Visita','Visita Marcada','Estudo de VVR',
  'Criar Proposta ao Proprietário','Enviar proposta ao Proprietário',
  'Em negociação','Proposta aceite','Enviar proposta ao investidor',
  'Follow Up após proposta','Follow UP',
  'Wholesaling','CAEP','Fix and Flip','Não interessa',
]

function normalizeEstado(e) {
  if (e === 'Nao interessa') return 'Não interessa'
  return (e || '').replace(/^\d+-\s*/, '').trim()
}

const { rows: imoveis } = await pool.query('SELECT id, nome, estado FROM imoveis')
console.log(`${imoveis.length} imóveis encontrados\n`)

const now = new Date().toISOString()
let totalCreated = 0

for (const im of imoveis) {
  const estadoNorm = normalizeEstado(im.estado)
  const estadoIdx = PIPELINE.indexOf(estadoNorm)

  if (estadoIdx === -1) {
    console.log(`  SKIP ${im.nome} (estado desconhecido: "${im.estado}")`)
    continue
  }

  // Gerar para estado actual + anteriores
  const estadosAGerar = PIPELINE.slice(0, estadoIdx + 1).filter(e => CHECKLIST_TEMPLATES[e])
  let created = 0

  for (const estado of estadosAGerar) {
    const templates = CHECKLIST_TEMPLATES[estado]
    for (let i = 0; i < templates.length; i++) {
      const t = templates[i]
      const id = crypto.randomUUID()
      const { rowCount } = await pool.query(
        `INSERT INTO checklist_imovel (id, imovel_id, estado, template_key, titulo, campo_crm, categoria, tempo_estimado, obrigatoria, ordem, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
         ON CONFLICT (imovel_id, template_key) DO NOTHING`,
        [id, im.id, estado, t.key, t.titulo, t.campo_crm, t.categoria, t.tempo_estimado, t.obrigatoria, i + 1, now, now]
      )
      created += rowCount
    }
  }

  console.log(`  ${im.nome} (${im.estado}) -> ${estadosAGerar.length} estados, ${created} items criados`)
  totalCreated += created
}

// Resumo
const { rows: cl } = await pool.query('SELECT COUNT(*) as n FROM checklist_imovel')
console.log(`\nTotal items criados: ${totalCreated}`)
console.log(`Total items na BD: ${cl[0].n}`)

const { rows: resumo } = await pool.query(
  `SELECT estado, COUNT(*) as n, COUNT(*) FILTER (WHERE obrigatoria) as obrig
   FROM checklist_imovel GROUP BY estado ORDER BY estado`
)
console.log('\nResumo por estado:')
resumo.forEach(r => console.log(`  ${r.estado}: ${r.n} items (${r.obrig} obrigatórias)`))

// Por imóvel
const { rows: porImovel } = await pool.query(
  `SELECT ci.imovel_id, i.nome, i.estado,
          COUNT(*) as total,
          COUNT(*) FILTER (WHERE ci.obrigatoria) as obrig,
          COUNT(*) FILTER (WHERE ci.obrigatoria AND ci.concluida) as done
   FROM checklist_imovel ci JOIN imoveis i ON ci.imovel_id = i.id
   GROUP BY ci.imovel_id, i.nome, i.estado ORDER BY i.nome`
)
console.log('\nPor imóvel:')
porImovel.forEach(r => console.log(`  ${r.nome} (${r.estado}): ${r.total} items, ${r.done}/${r.obrig} obrigatórias concluídas`))

await pool.end()
