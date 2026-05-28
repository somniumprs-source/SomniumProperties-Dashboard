/**
 * Auditoria de foreign keys (READ-ONLY) — migration 006.
 *
 * Para cada relacao que a 006 vai ligar, conta:
 *   - orfaos: filho com valor NAO-nulo e NAO-vazio sem pai correspondente
 *   - vazios: filho com '' (string vazia; a 006 converte para NULL)
 *
 * Relacoes sem orfaos = LIMPAS (seguro correr 006b VALIDATE).
 * Relacoes com orfaos  = ficam NOT VALID; lista os ids para reveres.
 *
 * NAO altera nada. So faz SELECTs.
 *
 * Uso:  node scripts/audit-foreign-keys.mjs
 */
import 'dotenv/config'
import pg from 'pg'

const { Pool } = pg
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } })

// child.col -> parent.id  (mesma lista da 006)
const FKS = [
  ['negocios', 'imovel_id', 'imoveis', 'SET NULL'],
  ['analises', 'imovel_id', 'imoveis', 'NO ACTION'],
  ['checklist_imovel', 'imovel_id', 'imoveis', 'NO ACTION'],
  ['consultor_interacoes', 'imovel_id', 'imoveis', 'SET NULL'],
  ['documentos_investidor', 'imovel_id', 'imoveis', 'SET NULL'],
  ['scorecards', 'investidor_id', 'investidores', 'NO ACTION'],
  ['classificacao_historico', 'investidor_id', 'investidores', 'NO ACTION'],
  ['documentos_investidor', 'investidor_id', 'investidores', 'NO ACTION'],
  ['projeto_assinaturas', 'investidor_id', 'investidores', 'SET NULL'],
  ['investidores', 'duplicado_de', 'investidores', 'SET NULL'],
  ['consultor_interacoes', 'consultor_id', 'consultores', 'NO ACTION'],
  ['consultor_followups', 'consultor_id', 'consultores', 'NO ACTION'],
  ['whatsapp_last_seen', 'consultor_id', 'consultores', 'NO ACTION'],
  ['despesas', 'negocio_id', 'negocios', 'SET NULL'],
  ['projeto_audit', 'negocio_id', 'negocios', 'NO ACTION'],
  ['projeto_assinaturas', 'negocio_id', 'negocios', 'NO ACTION'],
  ['projeto_share_tokens', 'negocio_id', 'negocios', 'NO ACTION'],
  ['projeto_comentarios', 'negocio_id', 'negocios', 'NO ACTION'],
  ['projeto_documentos', 'negocio_id', 'negocios', 'NO ACTION'],
  ['projeto_fotos', 'negocio_id', 'negocios', 'NO ACTION'],
  ['investidor_acessos', 'negocio_id', 'negocios', 'SET NULL'],
  ['notificacoes', 'user_id', 'users', 'NO ACTION'],
  ['investidor_acessos', 'user_id', 'users', 'NO ACTION'],
  ['investidores', 'user_id', 'users', 'SET NULL'],
  ['despesas', 'fase_id', 'projeto_fases', 'SET NULL'],
  ['despesas', 'fracao_id', 'projeto_fracoes', 'SET NULL'],
  ['projeto_fases', 'fracao_id', 'projeto_fracoes', 'SET NULL'],
  ['projeto_fotos', 'fracao_id', 'projeto_fracoes', 'SET NULL'],
  ['scorecards', 'reuniao_id', 'reunioes', 'SET NULL'],
  ['classificacao_historico', 'scorecard_id', 'scorecards', 'SET NULL'],
]

async function main() {
  console.log('Auditoria de foreign keys (read-only) — migration 006\n')
  const clean = []
  const dirty = []

  for (const [child, col, parent, onDelete] of FKS) {
    const orphanSql = `
      SELECT COUNT(*)::int AS n FROM ${child} c
      WHERE c.${col} IS NOT NULL AND c.${col} <> ''
        AND NOT EXISTS (SELECT 1 FROM ${parent} p WHERE p.id = c.${col})`
    const emptySql = `SELECT COUNT(*)::int AS n FROM ${child} WHERE ${col} = ''`

    let orphans, empties
    try {
      orphans = (await pool.query(orphanSql)).rows[0].n
      empties = (await pool.query(emptySql)).rows[0].n
    } catch (e) {
      console.log(`  ERRO em ${child}.${col} -> ${parent}: ${e.message}`)
      continue
    }

    const rel = `${child}.${col} -> ${parent}`.padEnd(56)
    const tag = orphans === 0 ? 'LIMPA' : `ORFAOS=${orphans}`
    console.log(`  ${rel} ${tag}${empties ? `  (vazios '': ${empties})` : ''}  [${onDelete}]`)

    if (orphans === 0) {
      clean.push(`${child}.${col}`)
    } else {
      // listar ate 10 ids orfaos para inspeccao
      const ids = (await pool.query(`
        SELECT DISTINCT c.${col} AS v FROM ${child} c
        WHERE c.${col} IS NOT NULL AND c.${col} <> ''
          AND NOT EXISTS (SELECT 1 FROM ${parent} p WHERE p.id = c.${col})
        LIMIT 10`)).rows.map(r => r.v)
      dirty.push({ rel: `${child}.${col} -> ${parent}`, orphans, sample: ids })
    }
  }

  console.log('\n── Resumo ──────────────────────────────────────────')
  console.log(`LIMPAS (seguro VALIDATE na 006b): ${clean.length}/${FKS.length}`)
  if (dirty.length) {
    console.log(`\nCOM ORFAOS (deixar NOT VALID; rever ids antes de validar):`)
    for (const d of dirty) {
      console.log(`  - ${d.rel}: ${d.orphans} orfaos. ex: ${d.sample.join(', ')}`)
    }
  } else {
    console.log('\nSem orfaos. Podes correr 006b_validate_fks.sql na totalidade.')
  }
  console.log('\nNada foi alterado (auditoria read-only).')
}

main()
  .catch(e => { console.error('Falhou:', e.message); process.exitCode = 1 })
  .finally(() => pool.end())
