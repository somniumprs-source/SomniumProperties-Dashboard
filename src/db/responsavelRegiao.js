// Responsável por região (auditoria D10). A responsabilidade é por listas, não
// por registo: o dono de um imóvel, consultor ou projeto é o utilizador da
// região dele (users.regiao). Sem campo novo por registo.
// Espelho: supabase/functions/_shared/responsavelRegiao.ts (manter em sync).

// { Coimbra: 'João Abreu', AMP: 'Alexandre Mendes' }
export async function donosDasRegioes(pool) {
  const { rows } = await pool.query(
    `SELECT regiao, nome FROM users WHERE regiao IS NOT NULL AND COALESCE(ativo, true) AND role = 'admin' ORDER BY nome`)
  const out = {}
  for (const r of rows) if (!out[r.regiao]) out[r.regiao] = r.nome
  return out
}

// Junta a região e o responsável aos alertas de imóveis, consultores e
// projetos (pelo id da entidade). Os de investidores ficam sem região.
export async function juntarResponsavel(pool, alertas) {
  const ids = [...new Set(alertas.map(a => a.id).filter(Boolean))]
  if (!ids.length) return alertas
  const [donos, { rows }] = await Promise.all([
    donosDasRegioes(pool),
    pool.query(
      `SELECT id::text, regiao FROM imoveis WHERE id::text = ANY($1)
       UNION ALL SELECT id::text, regiao FROM consultores WHERE id::text = ANY($1)
       UNION ALL SELECT n.id::text, COALESCE(n.regiao, i.regiao) FROM negocios n LEFT JOIN imoveis i ON i.id = n.imovel_id WHERE n.id::text = ANY($1)`, [ids]),
  ])
  const regiaoDe = Object.fromEntries(rows.filter(r => r.regiao).map(r => [r.id, r.regiao]))
  return alertas.map(a => {
    const regiao = regiaoDe[a.id]
    return regiao ? { ...a, regiao, responsavel: donos[regiao] || null } : a
  })
}
