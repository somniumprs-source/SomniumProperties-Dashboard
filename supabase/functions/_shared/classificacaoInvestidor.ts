// @ts-nocheck
/**
 * Classificação A–D de investidores pelo scorecard da discovery call
 * (SOP 4 e SOP 23 v2.1, secções 4.10 e 4.11): gravar o scorecard, propor a
 * classe (à mão ou automaticamente pela análise da call), validação pelo outro
 * CEO em 24 horas e alertas (por validar, apresentação a desmarcar). A regra
 * (limiares, critérios, consequências) vive só em ./classeInvestidor.js.
 *
 * Gémeo Node em src/db/classificacaoInvestidor.js — o código é o mesmo, só
 * muda o import. Portar qualquer alteração para os dois.
 */

import {
  CRITERIOS_DISCOVERY, CHAVES_DISCOVERY, calcularClasseDiscovery, validarDecisao, validacaoAtrasada,
  temApresentacaoMarcada, precisaDesmarcarApresentacao, ehTarefaApresentacao,
  STATUS_APOS_VALIDACAO, STATUS_CLASSE_PROPOSTA, ORIGEM_DISCOVERY, PRAZO_VALIDACAO_HORAS, ErroClassificacao,
} from "./classeInvestidor.js"

const agora = () => new Date().toISOString()
const autorDe = (u) => u?.nome || u?.email || null
const somaDias = (dias) => new Date(Date.now() + dias * 86400000).toISOString().slice(0, 10)
const json = (v) => {
  if (v == null || v === '') return null
  if (typeof v === 'object') return v
  try { return JSON.parse(v) } catch { return null }
}
const MIGRACAO = 'Migração 0104 (classificação SOP 23) ainda não aplicada na base de dados'
const temColunas = (inv) => !!inv && Object.prototype.hasOwnProperty.call(inv, 'scorecard_discovery')

export class ErroMigracao extends Error {}
function traduzErro(e) {
  if (e?.code === '42703' || /column .*(scorecard_discovery|pontuacao_discovery|classificacao_(proposta|estado|validada|alteracao_motivo))/.test(e?.message || '')) {
    return new ErroMigracao(MIGRACAO)
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

// Tarefas abertas "Apresentação negócio <nome>" dos investidores indicados.
async function tarefasApresentacao(pool, investidores) {
  if (!investidores.length) return {}
  const { rows } = await pool.query(
    `SELECT id, tarefa, status, arquivada FROM tarefas
      WHERE COALESCE(arquivada, false) = false AND translate(lower(tarefa), 'çãâáàéêíóôõú', 'caaaaeeiooou') LIKE 'apresentacao negocio%'`).catch(() => ({ rows: [] }))
  const out = {}
  for (const inv of investidores) out[inv.id] = rows.filter((t) => ehTarefaApresentacao(t, inv.nome))
  return out
}

// Estado completo para o separador Avaliação.
export async function lerClassificacaoInvestidor(pool, investidorId) {
  const { rows: [inv] } = await pool.query('SELECT * FROM investidores WHERE id = $1', [investidorId])
  if (!inv) throw new ErroClassificacao('Investidor não encontrado')
  const tarefas = (await tarefasApresentacao(pool, [inv]))[inv.id] || []
  return {
    criterios: CRITERIOS_DISCOVERY,
    migracao_aplicada: temColunas(inv),
    nome: inv.nome,
    status: inv.status,
    classificacao: inv.classificacao || null,
    classificacao_origem: inv.classificacao_origem || null,
    classificacao_estado: inv.classificacao_estado || null,
    classificacao_definida_em: inv.classificacao_definida_em || null,
    proposta: inv.classificacao_proposta || null,
    proposta_por: inv.classificacao_proposta_por || null,
    proposta_em: inv.classificacao_proposta_em || null,
    proposta_origem: inv.classificacao_proposta_origem || null,
    validada_por: inv.classificacao_validada_por || null,
    validada_em: inv.classificacao_validada_em || null,
    alteracao_motivo: inv.classificacao_alteracao_motivo || null,
    atrasada: validacaoAtrasada(inv),
    prazo_horas: PRAZO_VALIDACAO_HORAS,
    pontuacao_antiga: inv.pontuacao ?? null,
    pontuacao_discovery: inv.pontuacao_discovery ?? null,
    scorecard: json(inv.scorecard_discovery) || {},
    sugestoes_ia: await sugestoesPendentes(pool, investidorId),
    apresentacao_marcada: temApresentacaoMarcada(inv, tarefas),
    data_apresentacao_negocio: inv.data_apresentacao_negocio || null,
    tarefas_apresentacao: tarefas.map((t) => ({ id: t.id, tarefa: t.tarefa, status: t.status })),
    desmarcar_apresentacao: precisaDesmarcarApresentacao(inv, tarefas),
    ceos: await nomesCEO(pool),
  }
}

// Grava a proposta (comum ao manual e à IA). scorecard já montado.
async function gravarProposta(pool, inv, scorecard, calc, { por, origem, motivoHistorico }) {
  const now = agora()
  await pool.query(
    `UPDATE investidores SET scorecard_discovery = $2, pontuacao_discovery = $3, classificacao_proposta = $4,
       classificacao_proposta_por = $5, classificacao_proposta_em = $6, classificacao_proposta_origem = $7,
       classificacao_estado = 'proposta', classificacao_validada_por = NULL, classificacao_validada_em = NULL,
       classificacao_alteracao_motivo = NULL, status = $8, updated_at = $6 WHERE id = $1`,
    [inv.id, JSON.stringify(scorecard), calc.total, calc.classe, por, now, origem, STATUS_CLASSE_PROPOSTA])
  await pool.query(
    `INSERT INTO classificacao_historico (id, investidor_id, classificacao_anterior, classificacao_nova, pontuacao_anterior, pontuacao_nova, motivo, tipo, autor, created_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [crypto.randomUUID(), inv.id, inv.classificacao || null, calc.classe, inv.pontuacao_discovery ?? null, calc.total,
      motivoHistorico, 'discovery_proposta', por, now])
}

/**
 * Grava o scorecard à mão. body: { notas: { capital: 0..2|null, ... }, observacoes? }
 * Com os 6 critérios: classe proposta por quem gravou, status Pendente de
 * Aprovação. A classe definitiva só muda na validação pelo outro CEO.
 */
export async function guardarScorecardDiscovery(pool, investidorId, body, user) {
  try {
    const { rows: [inv] } = await pool.query('SELECT * FROM investidores WHERE id = $1', [investidorId])
    if (!inv) throw new ErroClassificacao('Investidor não encontrado')
    if (!temColunas(inv)) throw new ErroMigracao(MIGRACAO)
    const calc = calcularClasseDiscovery(body?.notas || {})
    const sugestoes = await sugestoesPendentes(pool, investidorId)
    const anterior = json(inv.scorecard_discovery) || {}
    const autor = autorDe(user)
    const now = agora()
    const scorecard = { observacoes: String(body?.observacoes || '').trim() || null, preenchido_por: autor, preenchido_em: now, origem: 'manual' }
    for (const k of CHAVES_DISCOVERY) {
      const n = calc.notas[k]
      const s = sugestoes[k]
      const ant = anterior[k]
      if (s && s.nota === n) scorecard[k] = { nota: n, origem: 'ia_confirmada', evidencia: s.evidencia || null, minuto: s.minuto || null }
      else if (ant && ant.nota === n && ant.origem && ant.origem !== 'manual') scorecard[k] = { ...ant } // nota da IA mantida
      else scorecard[k] = { nota: n, origem: 'manual' }
    }
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
           classificacao_proposta_por = CASE WHEN classificacao_estado = 'proposta' THEN NULL ELSE classificacao_proposta_por END,
           classificacao_proposta_em = CASE WHEN classificacao_estado = 'proposta' THEN NULL ELSE classificacao_proposta_em END,
           classificacao_estado = CASE WHEN classificacao_estado = 'proposta' THEN NULL ELSE classificacao_estado END,
           updated_at = $3 WHERE id = $1`,
        [investidorId, JSON.stringify(scorecard), now])
      return { ok: true, completo: false, em_falta: calc.em_falta, total: null, classe_proposta: null }
    }

    await gravarProposta(pool, inv, scorecard, calc, {
      por: autor, origem: 'manual',
      motivoHistorico: `Proposta por ${autor || 'utilizador'} pelo scorecard da discovery (${calc.total}/12), por validar pelo outro CEO`,
    })
    return { ok: true, completo: true, total: calc.total, classe_proposta: calc.classe, status: STATUS_CLASSE_PROPOSTA }
  } catch (e) { throw traduzErro(e) }
}

/**
 * Proposta automática a partir da análise de uma discovery call gravada.
 * notasIA: { capital: { nota, evidencia, minuto }, ... }. Só propõe com os 6
 * critérios e se ninguém gravou o scorecard à mão depois desta call; nesse
 * caso devolve { aplicado: false } e as notas ficam como sugestões.
 * Quem propõe = quem conduziu a call (realizada_por), para o outro CEO validar.
 */
export async function proporClassificacaoPelaIA(pool, gravacao, notasIA) {
  try {
    const { rows: [inv] } = await pool.query('SELECT * FROM investidores WHERE id = $1', [gravacao.investidor_id])
    if (!inv || !temColunas(inv)) return { aplicado: false, motivo: 'migracao' }
    let calc
    try { calc = calcularClasseDiscovery(notasIA || {}) } catch { return { aplicado: false, motivo: 'notas_invalidas' } }
    if (!calc.classe) return { aplicado: false, motivo: 'incompleto' }
    const dataCall = String(gravacao.data_chamada || gravacao.created_at || '').slice(0, 10)
    const anterior = json(inv.scorecard_discovery)
    if (anterior?.origem === 'manual' && String(anterior.preenchido_em || '').slice(0, 10) >= dataCall) return { aplicado: false, motivo: 'manual_mais_recente' }
    const now = agora()
    const por = gravacao.realizada_por || null
    const scorecard = { observacoes: null, preenchido_por: `IA (discovery de ${dataCall})`, preenchido_em: now, origem: 'ia', gravacao_id: gravacao.id, conduzida_por: por }
    for (const k of CHAVES_DISCOVERY) {
      const s = notasIA[k] || {}
      scorecard[k] = { nota: calc.notas[k], origem: 'ia', evidencia: s.evidencia || null, minuto: s.minuto || null }
    }
    await gravarProposta(pool, inv, scorecard, calc, {
      por, origem: 'ia',
      motivoHistorico: `Proposta automática pela análise da discovery de ${dataCall}${por ? ` conduzida por ${por}` : ''} (${calc.total}/12), por validar pelo outro CEO`,
    })
    return { aplicado: true, classe: calc.classe, total: calc.total }
  } catch (e) { throw traduzErro(e) }
}

/**
 * Validação pelo outro CEO. body: { classe?, motivo?, follow_up_dias?, motivo_inactivo? }
 * Basta uma validação, de um CEO diferente de quem propôs.
 */
export async function validarClassificacaoInvestidor(pool, investidorId, body, user) {
  try {
    if (!user?.nome || user.role !== 'admin') throw new ErroClassificacao('Só os CEO podem validar a classificação')
    const { rows: [inv] } = await pool.query('SELECT * FROM investidores WHERE id = $1', [investidorId])
    if (!inv) throw new ErroClassificacao('Investidor não encontrado')
    if (inv.classificacao_estado !== 'proposta') throw new ErroClassificacao('Não há classe proposta por validar')
    const now = agora()
    const e = validarDecisao({ proposta: inv.classificacao_proposta, propostaPor: inv.classificacao_proposta_por,
      decisao: { ...body, por: user.nome, em: now }, ceos: await nomesCEO(pool) })
    const status = STATUS_APOS_VALIDACAO[e.classe]
    await pool.query(
      `UPDATE investidores SET classificacao = $2, classificacao_estado = 'validada', classificacao_origem = $3,
         classificacao_definida_em = $4, classificacao_validada_por = $5, classificacao_validada_em = $4,
         classificacao_alteracao_motivo = $6, status = $7,
         data_follow_up = COALESCE($8, data_follow_up), motivo_inatividade = COALESCE($9, motivo_inatividade), updated_at = $4
       WHERE id = $1`,
      [investidorId, e.classe, ORIGEM_DISCOVERY, now, e.por, e.motivo || null, status,
        e.classe === 'C' ? somaDias(e.follow_up_dias) : null, e.classe === 'D' ? e.motivo_inactivo : null])
    await pool.query(
      `INSERT INTO classificacao_historico (id, investidor_id, classificacao_anterior, classificacao_nova, pontuacao_anterior, pontuacao_nova, motivo, tipo, autor, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [crypto.randomUUID(), investidorId, inv.classificacao || null, e.classe, null, inv.pontuacao_discovery ?? null,
        `Proposta ${e.proposta} por ${inv.classificacao_proposta_por || 'IA'}; validada por ${e.por}${e.alterada ? ` com alteração para ${e.classe}: ${e.motivo}` : ''}`,
        'discovery_validada', e.por, now])
    const depois = { ...inv, classificacao: e.classe, classificacao_estado: 'validada', classificacao_origem: ORIGEM_DISCOVERY }
    const tarefas = (await tarefasApresentacao(pool, [inv]))[inv.id] || []
    const desmarcar = precisaDesmarcarApresentacao(depois, tarefas)
    return {
      ok: true, classe: e.classe, status, proposta: e.proposta, alterada: e.alterada, validada_por: e.por,
      alerta_apresentacao: desmarcar ? `Apresentação marcada com classe ${e.classe}: ${inv.classificacao_proposta_por || 'quem conduziu a discovery'} tem de a desmarcar (SOP 23, 4.11)` : null,
    }
  } catch (e) { throw traduzErro(e) }
}

// Para o dashboard: classes por validar há mais de 24 h e apresentações a desmarcar.
export async function alertasClassificacao(pool) {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM investidores WHERE (duplicado_de IS NULL OR duplicado_de = id)
         AND (classificacao_estado = 'proposta' OR (classificacao_estado = 'validada' AND classificacao IN ('C','D')))`)
    const agoraD = new Date()
    const porValidar = rows.filter((i) => validacaoAtrasada(i, agoraD))
    const validadosCD = rows.filter((i) => i.classificacao_estado === 'validada')
    const tarefas = await tarefasApresentacao(pool, validadosCD)
    const desmarcar = validadosCD.filter((i) => precisaDesmarcarApresentacao(i, tarefas[i.id] || []))
    return {
      classesPorValidar24h: porValidar.length,
      apresentacoesADesmarcar: desmarcar.length,
      porValidar: porValidar.map((i) => ({ id: i.id, nome: i.nome, proposta: i.classificacao_proposta, proposta_por: i.classificacao_proposta_por, proposta_em: i.classificacao_proposta_em })),
      desmarcar: desmarcar.map((i) => ({ id: i.id, nome: i.nome, classe: i.classificacao, conduzida_por: i.classificacao_proposta_por })),
    }
  } catch (e) {
    if (traduzErro(e) instanceof ErroMigracao) return { classesPorValidar24h: 0, apresentacoesADesmarcar: 0, porValidar: [], desmarcar: [] }
    throw e
  }
}
