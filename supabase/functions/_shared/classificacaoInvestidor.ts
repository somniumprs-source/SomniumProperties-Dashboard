// @ts-nocheck
/**
 * Classificação A–D de investidores pelo scorecard da discovery call
 * (SOP 4 e SOP 23, secção 4.10): gravar o scorecard, propor a classe e
 * registar a validação dos dois CEO. A regra (limiares, critérios,
 * consequências) vive só em ./classeInvestidor.js.
 *
 * Gémeo Node em src/db/classificacaoInvestidor.js — o código é o mesmo, só
 * muda o import. Portar qualquer alteração para os dois.
 */

import {
  CRITERIOS_DISCOVERY, CHAVES_DISCOVERY, calcularClasseDiscovery, registarValidacao, estadoValidacao,
  STATUS_APOS_VALIDACAO, STATUS_CLASSE_PROPOSTA, ORIGEM_DISCOVERY, ErroClassificacao,
} from "./classeInvestidor.js"

const agora = () => new Date().toISOString()
const autorDe = (u) => u?.nome || u?.email || null
const CAMPO_IA = (k) => `scorecard_discovery.${k}`
const somaDias = (dias) => new Date(Date.now() + dias * 86400000).toISOString().slice(0, 10)
const json = (v) => {
  if (v == null || v === '') return null
  if (typeof v === 'object') return v
  try { return JSON.parse(v) } catch { return null }
}

export class ErroMigracao extends Error {}
// Colunas da migração 0104 ainda não aplicadas: mensagem clara em vez de 500 genérico.
function traduzErro(e) {
  if (e?.code === '42703' || /column .*(scorecard_discovery|pontuacao_discovery|classificacao_(proposta|estado|validacoes|alteracao_motivo))/.test(e?.message || '')) {
    return new ErroMigracao('Migração 0104 (classificação SOP 23) ainda não aplicada na base de dados')
  }
  return e
}

async function nomesCEO(pool) {
  const { rows } = await pool.query("SELECT nome FROM users WHERE role = 'admin' AND nome IS NOT NULL ORDER BY nome")
  return rows.map((r) => r.nome)
}

async function sugestoesPendentes(pool, investidorId) {
  const { rows } = await pool.query(
    `SELECT id, campo, valor, confianca, evidencia, minuto, origem_tipo, origem_id, origem_data, created_at
       FROM investidor_campos_ia WHERE investidor_id = $1 AND campo LIKE 'scorecard_discovery.%' AND estado = 'pendente'
      ORDER BY created_at DESC`, [investidorId]).catch(() => ({ rows: [] }))
  const porCriterio = {}
  for (const r of rows) {
    const k = r.campo.split('.')[1]
    if (!porCriterio[k]) porCriterio[k] = { ...r, nota: json(r.valor)?.nota ?? null }
  }
  return porCriterio
}

// Estado completo para o separador Avaliação.
export async function lerClassificacaoInvestidor(pool, investidorId) {
  const { rows: [inv] } = await pool.query('SELECT * FROM investidores WHERE id = $1', [investidorId])
  if (!inv) throw new ErroClassificacao('Investidor não encontrado')
  const log = json(inv.classificacao_validacoes) || []
  return {
    criterios: CRITERIOS_DISCOVERY,
    migracao_aplicada: Object.prototype.hasOwnProperty.call(inv, 'scorecard_discovery'),
    classificacao: inv.classificacao || null,
    classificacao_origem: inv.classificacao_origem || null,
    classificacao_estado: inv.classificacao_estado || null,
    classificacao_proposta: inv.classificacao_proposta || null,
    classificacao_alteracao_motivo: inv.classificacao_alteracao_motivo || null,
    classificacao_definida_em: inv.classificacao_definida_em || null,
    pontuacao_antiga: inv.pontuacao ?? null,
    pontuacao_discovery: inv.pontuacao_discovery ?? null,
    scorecard: json(inv.scorecard_discovery) || {},
    validacoes: log,
    validacao: estadoValidacao(inv.classificacao_proposta, log),
    sugestoes_ia: await sugestoesPendentes(pool, investidorId),
    ceos: await nomesCEO(pool),
    status: inv.status,
  }
}

/**
 * Grava o scorecard (campo manual). body: { notas: { capital: 0..2|null, ... }, observacoes? }
 * Com os 6 critérios: classe proposta, status Pendente de Aprovação, validações
 * a zero. A classe definitiva (classificacao) só muda na validação dos CEO.
 */
export async function guardarScorecardDiscovery(pool, investidorId, body, user) {
  try {
    const { rows: [inv] } = await pool.query('SELECT * FROM investidores WHERE id = $1', [investidorId])
    if (!inv) throw new ErroClassificacao('Investidor não encontrado')
    if (!Object.prototype.hasOwnProperty.call(inv, 'scorecard_discovery')) throw new ErroMigracao('Migração 0104 (classificação SOP 23) ainda não aplicada na base de dados')
    const calc = calcularClasseDiscovery(body?.notas || {})
    const sugestoes = await sugestoesPendentes(pool, investidorId)
    const autor = autorDe(user)
    const now = agora()
    const scorecard = { observacoes: String(body?.observacoes || '').trim() || null, preenchido_por: autor, preenchido_em: now }
    for (const k of CHAVES_DISCOVERY) {
      const s = sugestoes[k]
      const n = calc.notas[k]
      scorecard[k] = { nota: n, origem: n != null && s && s.nota === n ? 'ia_confirmada' : 'manual', ...(s && s.nota === n ? { sugestao_id: s.id } : {}) }
    }
    // Sugestões da IA ficam decididas pelo que o comercial gravou.
    for (const k of CHAVES_DISCOVERY) {
      const s = sugestoes[k]
      if (!s || calc.notas[k] == null) continue
      await pool.query(`UPDATE investidor_campos_ia SET estado = $2, decidido_por = $3, decidido_em = $4 WHERE id = $1`,
        [s.id, s.nota === calc.notas[k] ? 'aceite' : 'rejeitado', autor || 'utilizador', now])
    }

    if (!calc.classe) {
      // Incompleto: sem classe. Uma proposta pendente deixa de valer.
      await pool.query(
        `UPDATE investidores SET scorecard_discovery = $2, pontuacao_discovery = NULL,
           classificacao_proposta = CASE WHEN classificacao_estado = 'proposta' THEN NULL ELSE classificacao_proposta END,
           classificacao_validacoes = CASE WHEN classificacao_estado = 'proposta' THEN NULL ELSE classificacao_validacoes END,
           classificacao_estado = CASE WHEN classificacao_estado = 'proposta' THEN NULL ELSE classificacao_estado END,
           updated_at = $3 WHERE id = $1`,
        [investidorId, JSON.stringify(scorecard), now])
      return { ok: true, completo: false, em_falta: calc.em_falta, total: null, classe_proposta: null }
    }

    await pool.query(
      `UPDATE investidores SET scorecard_discovery = $2, pontuacao_discovery = $3, classificacao_proposta = $4,
         classificacao_estado = 'proposta', classificacao_validacoes = '[]'::jsonb, classificacao_alteracao_motivo = NULL,
         status = $5, updated_at = $6 WHERE id = $1`,
      [investidorId, JSON.stringify(scorecard), calc.total, calc.classe, STATUS_CLASSE_PROPOSTA, now])
    await pool.query(
      `INSERT INTO classificacao_historico (id, investidor_id, classificacao_anterior, classificacao_nova, pontuacao_anterior, pontuacao_nova, motivo, tipo, autor, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [crypto.randomUUID(), investidorId, inv.classificacao || null, calc.classe, inv.pontuacao_discovery ?? null, calc.total,
        `Proposta pelo scorecard da discovery (${calc.total}/12), por validar pelos dois CEO`, 'discovery_proposta', autor, now])
    return { ok: true, completo: true, total: calc.total, classe_proposta: calc.classe, status: STATUS_CLASSE_PROPOSTA }
  } catch (e) { throw traduzErro(e) }
}

/**
 * Validação por um CEO. body: { classe, motivo?, follow_up_dias?, motivo_inactivo? }
 * Só utilizadores admin (os dois CEO). Definitiva com os dois.
 */
export async function validarClassificacaoInvestidor(pool, investidorId, body, user) {
  try {
    if (!user?.nome || user.role !== 'admin') throw new ErroClassificacao('Só os dois CEO podem validar a classificação')
    const { rows: [inv] } = await pool.query('SELECT * FROM investidores WHERE id = $1', [investidorId])
    if (!inv) throw new ErroClassificacao('Investidor não encontrado')
    if (inv.classificacao_estado !== 'proposta') throw new ErroClassificacao('Não há classe proposta por validar')
    const now = agora()
    const { log, estado } = registarValidacao(inv.classificacao_proposta, json(inv.classificacao_validacoes) || [],
      { ...body, por: user.nome, em: now }, await nomesCEO(pool))
    const ultimaAlteracao = [...log].reverse().find((e) => e.acao === 'alterou')
    const motivoAlteracao = ultimaAlteracao?.motivo || null

    if (!estado.definitiva) {
      await pool.query('UPDATE investidores SET classificacao_validacoes = $2, classificacao_alteracao_motivo = $3, updated_at = $4 WHERE id = $1',
        [investidorId, JSON.stringify(log), motivoAlteracao, now])
      return { ok: true, definitiva: false, validacao: estado, validacoes: log }
    }

    const classe = estado.classe
    const entrada = log[log.length - 1]
    const status = STATUS_APOS_VALIDACAO[classe]
    await pool.query(
      `UPDATE investidores SET classificacao = $2, classificacao_estado = 'validada', classificacao_origem = $3,
         classificacao_definida_em = $4, classificacao_validacoes = $5, classificacao_alteracao_motivo = $6, status = $7,
         data_follow_up = COALESCE($8, data_follow_up), motivo_inatividade = COALESCE($9, motivo_inatividade), updated_at = $4
       WHERE id = $1`,
      [investidorId, classe, ORIGEM_DISCOVERY, now, JSON.stringify(log), motivoAlteracao, status,
        classe === 'C' ? somaDias(entrada.follow_up_dias) : null, classe === 'D' ? entrada.motivo_inactivo : null])
    const quem = estado.validadores.join(' e ')
    await pool.query(
      `INSERT INTO classificacao_historico (id, investidor_id, classificacao_anterior, classificacao_nova, pontuacao_anterior, pontuacao_nova, motivo, tipo, autor, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [crypto.randomUUID(), investidorId, inv.classificacao || null, classe, null, inv.pontuacao_discovery ?? null,
        `Validada por ${quem}${estado.alterada ? ` (proposta ${inv.classificacao_proposta} alterada: ${motivoAlteracao})` : ''}`,
        'discovery_validada', quem, now])
    return { ok: true, definitiva: true, classe, status, validacao: estado, validacoes: log }
  } catch (e) { throw traduzErro(e) }
}
