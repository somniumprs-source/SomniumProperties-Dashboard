/**
 * Classificação A–D de investidores pelo scorecard de qualificação (SOP 23,
 * 4.10). Desde 17/11/2026 a classe é AUTOMÁTICA: cada contacto analisado (call
 * gravada ou reunião) atualiza os critérios com prova; com os 6 critérios a
 * classe fica definida logo, sem validação pelo outro CEO, e pode mudar no
 * contacto seguinte. Cada classificação fica em classificacao_historico.
 * A classe não mexe na etapa do kanban. A regra vive só em ./classeInvestidor.js.
 *
 * Gémeo Deno em supabase/functions/_shared/classificacaoInvestidor.ts — o código é o mesmo, só
 * muda o import. Portar qualquer alteração para os dois.
 */

import {
  CRITERIOS_DISCOVERY, CHAVES_DISCOVERY, calcularClasseDiscovery, validarDecisao, validacaoAtrasada,
  temApresentacaoMarcada, precisaDesmarcarApresentacao, ehTarefaApresentacao,
  STATUS_APOS_VALIDACAO, STATUS_CLASSE_PROPOSTA, ORIGEM_DISCOVERY, PRAZO_VALIDACAO_HORAS, ErroClassificacao, fundirScorecard,
} from "../../supabase/functions/_shared/classeInvestidor.js"

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
    automatica: true,
    historico: (await pool.query(
      `SELECT classificacao_anterior, classificacao_nova, pontuacao_nova, motivo, tipo, autor, created_at FROM classificacao_historico
        WHERE investidor_id = $1 ORDER BY created_at DESC LIMIT 50`, [investidorId]).catch(() => ({ rows: [] }))).rows,
  }
}

// Aplica o scorecard ao investidor. Com os 6 critérios a classe fica definida
// (automática, sem validação); incompleto, a classe anterior mantém-se.
async function aplicarScorecard(pool, inv, scorecard, { por, origem, descricao, fonteTipo, fonteId }) {
  const calc = calcularClasseDiscovery(scorecard)
  const now = agora()
  if (!calc.classe) {
    await pool.query(`UPDATE investidores SET scorecard_discovery = $2, pontuacao_discovery = NULL, updated_at = $3 WHERE id = $1`,
      [inv.id, JSON.stringify(scorecard), now])
    return { completo: false, em_falta: calc.em_falta, total: null, classe: inv.classificacao || null, classe_anterior: inv.classificacao || null }
  }
  await pool.query(
    `UPDATE investidores SET scorecard_discovery = $2, pontuacao_discovery = $3, classificacao = $4, classificacao_origem = $5,
       classificacao_estado = 'validada', classificacao_definida_em = $6::timestamptz,
       classificacao_proposta = $4, classificacao_proposta_por = $7, classificacao_proposta_em = $6::timestamptz, classificacao_proposta_origem = $8,
       classificacao_validada_por = $9, classificacao_validada_em = $6::timestamptz, classificacao_alteracao_motivo = NULL, updated_at = $6::text
     WHERE id = $1`,
    [inv.id, JSON.stringify(scorecard), calc.total, calc.classe, ORIGEM_DISCOVERY, now, por || null, origem === 'manual' ? 'manual' : 'ia',
      origem === 'manual' ? `Manual (${por || 'utilizador'})` : 'Automática (IA)'])
  const antes = inv.classificacao || null
  await pool.query(
    `INSERT INTO classificacao_historico (id, investidor_id, classificacao_anterior, classificacao_nova, pontuacao_anterior, pontuacao_nova, motivo, tipo, autor, created_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [crypto.randomUUID(), inv.id, antes, calc.classe, inv.pontuacao_discovery ?? null, calc.total,
      `${descricao || 'Scorecard'}: ${calc.total}/12, classe ${calc.classe}${antes && antes !== calc.classe ? ` (era ${antes})` : ''}${fonteTipo ? ` [${fonteTipo}${fonteId ? `:${fonteId}` : ''}]` : ''}`,
      origem === 'manual' ? 'scorecard_manual' : 'automatica', por || (origem === 'manual' ? 'utilizador' : 'IA'), now])
  const tarefas = (await tarefasApresentacao(pool, [inv]))[inv.id] || []
  const depois = { ...inv, classificacao: calc.classe, classificacao_estado: 'validada', classificacao_origem: ORIGEM_DISCOVERY }
  return {
    completo: true, total: calc.total, classe: calc.classe, classe_anterior: antes, em_falta: [],
    alerta_apresentacao: precisaDesmarcarApresentacao(depois, tarefas) ? `Apresentação marcada com classe ${calc.classe}: desmarcar (SOP 23, 4.11)` : null,
  }
}

/**
 * Classificação automática depois de cada contacto analisado.
 * notas: { capital: { nota, evidencia, minuto } | null, ... } (só com prova deste contacto).
 * fonte: { tipo: 'gravacao'|'reuniao', id, data: 'YYYY-MM-DD', descricao, conduzidaPor }.
 */
export async function classificarAutomaticamente(pool, investidorId, notas, fonte = {}) {
  try {
    const { rows: [inv] } = await pool.query('SELECT * FROM investidores WHERE id = $1', [investidorId])
    if (!inv || !temColunas(inv)) return { aplicado: false, motivo: 'migracao' }
    const anterior = json(inv.scorecard_discovery) || {}
    const { scorecard, alterados } = fundirScorecard(anterior, notas || {}, { data: fonte.data, tipo: fonte.tipo, id: fonte.id, descricao: fonte.descricao })
    if (!alterados.length && json(inv.scorecard_discovery)) {
      // Nada novo: a classe mantém-se, mas regista-se no histórico que este contacto a confirmou (com os 6 critérios).
      const calc = calcularClasseDiscovery(scorecard)
      if (calc.classe && fonte.descricao) {
        await pool.query(
          `INSERT INTO classificacao_historico (id, investidor_id, classificacao_anterior, classificacao_nova, pontuacao_anterior, pontuacao_nova, motivo, tipo, autor, created_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,'automatica','IA',$8)`,
          [crypto.randomUUID(), inv.id, inv.classificacao || null, calc.classe, inv.pontuacao_discovery ?? null, calc.total,
            `${fonte.descricao}: sem prova nova, mantém ${calc.total}/12, classe ${calc.classe}`, agora()])
      }
      return { aplicado: !!calc.classe, classe: calc.classe, total: calc.total, alterados: [] }
    }
    const meta = { ...scorecard, origem: 'ia', preenchido_por: fonte.descricao ? `IA (${fonte.descricao})` : 'IA', preenchido_em: agora(),
      ultima_fonte: { tipo: fonte.tipo || null, id: fonte.id || null, data: fonte.data || null, conduzida_por: fonte.conduzidaPor || null } }
    const r = await aplicarScorecard(pool, inv, meta, { por: fonte.conduzidaPor || null, origem: 'ia', descricao: fonte.descricao, fonteTipo: fonte.tipo, fonteId: fonte.id })
    return { aplicado: r.completo, classe: r.classe, total: r.total, em_falta: r.em_falta, alterados, alerta_apresentacao: r.alerta_apresentacao || null }
  } catch (e) { throw traduzErro(e) }
}

// Compatibilidade: a análise das gravações chamava esta função.
export async function proporClassificacaoPelaIA(pool, gravacao, notasIA) {
  const data = String(gravacao.data_chamada || gravacao.created_at || '').slice(0, 10)
  return classificarAutomaticamente(pool, gravacao.investidor_id, notasIA, { tipo: 'gravacao', id: gravacao.id, data, descricao: `Call de ${data}`, conduzidaPor: gravacao.realizada_por })
}

/**
 * Scorecard gravado à mão. body: { notas: { capital: 0..2|null, ... }, observacoes? }
 * Com os 6 critérios a classe fica definida logo (sem validação).
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
    const hoje = now.slice(0, 10)
    const scorecard = { observacoes: String(body?.observacoes || '').trim() || null, preenchido_por: autor, preenchido_em: now, origem: 'manual' }
    for (const k of CHAVES_DISCOVERY) {
      const n = calc.notas[k]
      const ant = anterior[k]
      if (n === null) continue
      if (ant && ant.nota === n) scorecard[k] = { ...ant }
      else scorecard[k] = { nota: n, origem: 'manual', data: hoje, fonte: `Manual (${autor || 'utilizador'})` }
    }
    for (const k of CHAVES_DISCOVERY) {
      const s = sugestoes[k]
      if (!s || calc.notas[k] == null) continue
      await pool.query(`UPDATE investidor_campos_ia SET estado = $2, decidido_por = $3, decidido_em = $4 WHERE id = $1`,
        [s.id, s.nota === calc.notas[k] ? 'aceite' : 'rejeitado', autor || 'utilizador', now])
    }
    const r = await aplicarScorecard(pool, inv, scorecard, { por: autor, origem: 'manual', descricao: `Scorecard à mão por ${autor || 'utilizador'}` })
    return { ok: true, completo: r.completo, em_falta: r.em_falta, total: r.total, classe: r.completo ? r.classe : null, classe_proposta: r.completo ? r.classe : null, alerta_apresentacao: r.alerta_apresentacao || null }
  } catch (e) { throw traduzErro(e) }
}

/**
 * Validação pelo outro CEO (desativada na app desde 17/11/2026: a classe é automática). body: { classe?, motivo?, follow_up_dias?, motivo_inactivo? }
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

// Reclassificação sem IA: volta a aplicar, por ordem cronológica, as notas do
// scorecard já guardadas nas análises das calls e das reuniões. Recomeça o
// scorecard dos investidores sem scorecard manual (o manual mantém-se e entra
// como ponto de partida). Útil depois de mudar a regra ou corrigir um erro.
export async function reclassificarPelasAnalises(pool, { investidorId = null } = {}) {
  const { rows: contactos } = await pool.query(
    `SELECT 'gravacao' AS tipo, g.id, g.investidor_id, left(COALESCE(g.data_chamada, g.created_at), 10) AS data, g.tipo_chamada AS sub,
            g.realizada_por AS por, g.analise->'scorecard_discovery' AS sc
       FROM investidor_gravacoes g WHERE g.analise ? 'scorecard_discovery' AND ($1::text IS NULL OR g.investidor_id = $1)
     UNION ALL
     SELECT 'reuniao', r.id, r.entidade_id, left(r.data, 10), NULL, r.organizador, r.analise_completa::jsonb->'scorecard_discovery'
       FROM reunioes r WHERE r.entidade_tipo = 'investidores' AND r.entidade_id IS NOT NULL
        AND r.analise_completa IS NOT NULL AND r.analise_completa::jsonb ? 'scorecard_discovery' AND ($1::text IS NULL OR r.entidade_id = $1)
     ORDER BY 3, 4, 1`, [investidorId])
  const porInv = {}
  for (const c of contactos) (porInv[c.investidor_id] ||= []).push(c)
  const res = { investidores: 0, contactos: contactos.length, classificados: 0, resultado: [] }
  for (const [invId, lista] of Object.entries(porInv)) {
    const { rows: [inv] } = await pool.query('SELECT scorecard_discovery FROM investidores WHERE id = $1', [invId])
    const atual = json(inv?.scorecard_discovery)
    if (atual?.origem !== 'manual') {
      await pool.query(`UPDATE investidores SET scorecard_discovery = NULL, pontuacao_discovery = NULL WHERE id = $1`, [invId])
      await pool.query(`DELETE FROM classificacao_historico WHERE investidor_id = $1 AND tipo = 'automatica'`, [invId])
    }
    res.investidores++
    let ultimo = null
    for (const c of lista) {
      const rotulo = c.tipo === 'reuniao' ? 'Reunião' : ({ cold_call: 'Chamada 1', follow_up: 'Recontacto', discovery: 'Discovery' }[c.sub] || 'Call')
      ultimo = await classificarAutomaticamente(pool, invId, c.sc || {}, { tipo: c.tipo, id: c.id, data: c.data, descricao: `${rotulo} de ${c.data}`, conduzidaPor: c.por })
    }
    if (ultimo?.aplicado) res.classificados++
    res.resultado.push({ investidor_id: invId, contactos: lista.length, classe: ultimo?.classe || null, total: ultimo?.total ?? null, em_falta: ultimo?.em_falta || [] })
  }
  return res
}
