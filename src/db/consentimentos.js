// Base legal do tratamento de dados pessoais (RGPD, auditoria D4).
// Espelho Deno: supabase/functions/_shared/consentimentos.ts (manter em sync).
//
// Um registo único para investidores, consultores e proprietários (tabela
// consentimentos, migração 0078). Estados de uma pessoa:
//   consentimento | contrato | interesse_legitimo → base registada em vigor
//   retirado → retirou o consentimento ou opôs-se: sem envios automáticos
//   sem      → nada registado (os registos antigos ficam assim até o advogado
//              confirmar a base de cada origem)
// O investidor num projeto CAEP tem «execução de contrato» calculada (caep).

export const ENTIDADES = ['investidor', 'consultor', 'proprietario']
export const BASES_LEGAIS = {
  consentimento: 'Consentimento',
  contrato: 'Execução de contrato',
  interesse_legitimo: 'Interesse legítimo',
}
export const FINALIDADE_PADRAO = {
  investidor: 'Contacto sobre oportunidades de investimento imobiliário',
  consultor: 'Parceria na angariação de imóveis',
  proprietario: 'Negociação da compra do imóvel',
}
// Versão da política de privacidade da landing /investir (somnium-investidores.html).
export const POLITICA_VERSAO = '2026-10'
// Prazo de conservação provisório, até o advogado o confirmar: quem está sem
// interação há mais do que isto e sem contrato ativo aparece nos Alertas.
export const CONSERVACAO_MESES = 24

const TABELA = { investidor: 'investidores', consultor: 'consultores', proprietario: 'imoveis' }

// Investidores com projeto CAEP ativo → nome do projeto.
async function contratosCaep(pool, ids = null) {
  const { rows } = await pool.query(
    `SELECT pi.investidor_id, n.movimento FROM projeto_investidores pi
       JOIN negocios n ON n.id = pi.negocio_id
      WHERE n.categoria = 'CAEP' AND n.deleted_at IS NULL ${ids ? 'AND pi.investidor_id = ANY($1)' : ''}`,
    ids ? [ids] : [])
  const m = new Map()
  for (const r of rows) if (!m.has(r.investidor_id)) m.set(r.investidor_id, r.movimento)
  return m
}

// Estado a partir dos registos de uma pessoa (mais recentes primeiro).
export function estadoDe(registos, caep = null) {
  const ativos = registos.filter(r => r.base_legal && !r.retirado_em)
  if (ativos.length) return { estado: ativos[0].base_legal, registo: ativos[0], caep }
  if (registos.some(r => r.retirado_em)) return { estado: 'retirado', registo: registos.find(r => r.retirado_em), caep }
  if (caep) return { estado: 'contrato', registo: null, caep, automatico: true }
  return { estado: 'sem', registo: null, caep: null }
}

export async function baseLegal(pool, entidade, id) {
  const { rows } = await pool.query(
    'SELECT * FROM consentimentos WHERE entidade = $1 AND entidade_id = $2 ORDER BY registado_em DESC', [entidade, id])
  const caep = entidade === 'investidor' ? (await contratosCaep(pool, [id])).get(id) || null : null
  return { ...estadoDe(rows, caep), historico: rows }
}

// { id: estado } de todas as pessoas com algo registado (as restantes são 'sem').
export async function mapaEstados(pool, entidade) {
  const { rows } = await pool.query(
    'SELECT entidade_id, base_legal, retirado_em, registado_em FROM consentimentos WHERE entidade = $1 ORDER BY registado_em DESC', [entidade])
  const porId = new Map()
  for (const r of rows) { if (!porId.has(r.entidade_id)) porId.set(r.entidade_id, []); porId.get(r.entidade_id).push(r) }
  const caep = entidade === 'investidor' ? await contratosCaep(pool) : new Map()
  const out = {}
  for (const id of new Set([...porId.keys(), ...caep.keys()])) out[id] = estadoDe(porId.get(id) || [], caep.get(id) || null).estado
  return out
}

// Ids que retiraram o consentimento (excluir de envios automáticos).
export async function retirados(pool, entidade, ids) {
  if (!ids?.length) return new Set()
  const { rows } = await pool.query(
    `SELECT entidade_id FROM consentimentos WHERE entidade = $1 AND entidade_id = ANY($2)
      GROUP BY entidade_id HAVING bool_and(retirado_em IS NOT NULL OR base_legal IS NULL) AND bool_or(retirado_em IS NOT NULL)`,
    [entidade, ids])
  return new Set(rows.map(r => r.entidade_id))
}

export function validarEntidade(entidade) {
  return ENTIDADES.includes(entidade)
}

export async function registar(pool, dados) {
  const { entidade, id, base_legal, finalidade, origem, prova, por } = dados
  if (!validarEntidade(entidade)) throw Object.assign(new Error('Entidade inválida'), { status: 400 })
  if (!BASES_LEGAIS[base_legal]) throw Object.assign(new Error('Base legal inválida'), { status: 400 })
  if (!String(origem || '').trim()) throw Object.assign(new Error('Indica a origem (de onde vem o contacto)'), { status: 400 })
  const { rows: [existe] } = await pool.query(`SELECT 1 FROM ${TABELA[entidade]} WHERE id = $1`, [id])
  if (!existe) throw Object.assign(new Error('Registo não encontrado'), { status: 404 })
  const { rows: [r] } = await pool.query(
    `INSERT INTO consentimentos (id, entidade, entidade_id, base_legal, finalidade, origem, prova, registado_por)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
    [crypto.randomUUID(), entidade, id, base_legal, String(finalidade || '').trim() || FINALIDADE_PADRAO[entidade],
      String(origem).trim(), String(prova || '').trim() || null, por || 'Sistema'])
  return r
}

// Retira o consentimento (ou regista a oposição): fecha as bases em vigor; sem
// nenhuma, fica uma linha só de retirada para a pessoa não voltar a ser contactada.
export async function retirar(pool, dados) {
  const { entidade, id, motivo, por } = dados
  if (!validarEntidade(entidade)) throw Object.assign(new Error('Entidade inválida'), { status: 400 })
  if (!String(motivo || '').trim()) throw Object.assign(new Error('Indica o motivo (ex.: pedido do titular por email)'), { status: 400 })
  const quem = por || 'Sistema'
  const { rowCount } = await pool.query(
    `UPDATE consentimentos SET retirado_em = NOW(), retirado_por = $3, motivo_retirada = $4
      WHERE entidade = $1 AND entidade_id = $2 AND retirado_em IS NULL AND base_legal IS NOT NULL`,
    [entidade, id, quem, String(motivo).trim()])
  if (!rowCount) {
    await pool.query(
      `INSERT INTO consentimentos (id, entidade, entidade_id, base_legal, origem, registado_por, retirado_em, retirado_por, motivo_retirada)
       VALUES ($1, $2, $3, NULL, 'Pedido do titular', $4, NOW(), $4, $5)`,
      [crypto.randomUUID(), entidade, id, quem, String(motivo).trim()])
  }
}

// Alertas de conservação: investidores e consultores sem interação há mais de
// CONSERVACAO_MESES e sem contrato ativo (CAEP / parceria) → candidatos a eliminação.
export async function alertasConservacao(pool) {
  const limite = new Date()
  limite.setMonth(limite.getMonth() - CONSERVACAO_MESES)
  const caep = await contratosCaep(pool)
  const alertas = []
  const ultima = (...ds) => ds.filter(Boolean).map(d => new Date(d)).filter(d => !isNaN(d)).sort((a, b) => b - a)[0] || null
  const { rows: invs } = await pool.query(
    `SELECT i.id, i.nome, i.status, i.created_at, i.data_ultimo_contacto, MAX(x.data_hora) AS ultima_interacao
       FROM investidores i LEFT JOIN investidor_interacoes x ON x.investidor_id = i.id
      GROUP BY i.id`)
  for (const i of invs) {
    if (caep.has(i.id)) continue
    const u = ultima(i.ultima_interacao, i.data_ultimo_contacto, i.created_at)
    if (u && u < limite) alertas.push({ tipo: 'conservacao_dados', severidade: 'info', entidade: i.nome,
      mensagem: `Investidor sem interação desde ${u.toISOString().slice(0, 10)}: rever se os dados se conservam (prazo ${CONSERVACAO_MESES} meses)`, status: i.status, id: i.id })
  }
  const { rows: cons } = await pool.query(
    `SELECT c.id, c.nome, c.estatuto, c.created_at, MAX(x.data_hora) AS ultima_interacao
       FROM consultores c LEFT JOIN consultor_interacoes x ON x.consultor_id = c.id
      GROUP BY c.id`)
  for (const c of cons) {
    if (/parceria/i.test(c.estatuto || '')) continue
    const u = ultima(c.ultima_interacao, c.created_at)
    if (u && u < limite) alertas.push({ tipo: 'conservacao_dados', severidade: 'info', entidade: c.nome,
      mensagem: `Consultor sem interação desde ${u.toISOString().slice(0, 10)}: rever se os dados se conservam (prazo ${CONSERVACAO_MESES} meses)`, status: c.estatuto, id: c.id })
  }
  return alertas
}
