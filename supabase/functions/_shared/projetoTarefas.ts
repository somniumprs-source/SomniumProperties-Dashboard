// @ts-nocheck
// Tarefas de projeto: criação a partir do modelo de fases, checklist dentro da
// tarefa e percentagem automática da fase.
// Espelho de src/db/projetoTarefas.js (manter em sync).
//
// Uma tarefa do modelo é um texto simples ou um objeto:
//   { t: 'Texto', opcional: true, porInvestidor: true,
//     checklist: [{ k: 'chave', t: 'Item', slot: 'caderneta_predial', obrigatoria: false }] }
// opcional = só aparece no projeto quando é ativada (blocos que o Comercial marca).
// slot     = documento do imóvel (checklist de documentação do Comercial) que o item mostra.

export function normalizarTarefa(t) {
  if (typeof t === 'string') return { descricao: t, opcional: false, checklist: null }
  const itens = (t.checklist || []).map(i => ({
    k: i.k, t: i.t, slot: i.slot || null, obrigatoria: i.obrigatoria !== false,
  }))
  return {
    descricao: t.t,
    opcional: !!t.opcional,
    checklist: itens.length ? { por_investidor: !!t.porInvestidor, itens, estado: {} } : null,
  }
}

export function lerChecklist(v) {
  if (!v) return null
  if (typeof v === 'string') { try { return JSON.parse(v) } catch { return null } }
  return v
}

// Chaves dos itens obrigatórios (por investidor, quando a checklist é por investidor).
export function chavesObrigatorias(checklist, investidorIds = []) {
  if (!checklist) return []
  const obrig = checklist.itens.filter(i => i.obrigatoria)
  if (checklist.por_investidor) return investidorIds.flatMap(id => obrig.map(i => `${id}:${i.k}`))
  return obrig.map(i => i.k)
}

export function checklistCompleta(checklist, investidorIds = []) {
  if (!checklist) return true
  const chaves = chavesObrigatorias(checklist, investidorIds)
  if (checklist.por_investidor && investidorIds.length === 0) return false
  return chaves.every(k => checklist.estado?.[k]?.feito)
}

// Progresso de uma tarefa entre 0 e 1: concluída = 1; com checklist conta em parte.
export function progressoTarefa(tarefa, investidorIds = []) {
  if (tarefa.concluida) return 1
  const ch = lerChecklist(tarefa.checklist)
  const chaves = chavesObrigatorias(ch, investidorIds)
  if (!chaves.length) return 0
  return chaves.filter(k => ch.estado?.[k]?.feito).length / chaves.length
}

export async function investidoresDaFase(pool, faseId) {
  const { rows } = await pool.query(
    `SELECT pi.investidor_id FROM projeto_investidores pi
     JOIN projeto_fases f ON f.negocio_id = pi.negocio_id WHERE f.id = $1`, [faseId])
  return rows.map(r => r.investidor_id)
}

// Percentagem da fase = média do progresso das tarefas ativas (todas valem o
// mesmo). Uma fase marcada como concluída fica nos 100%.
export async function recalcularFase(pool, faseId) {
  const { rows: [fase] } = await pool.query('SELECT estado FROM projeto_fases WHERE id = $1', [faseId])
  if (!fase || fase.estado === 'concluida') return
  const { rows } = await pool.query('SELECT concluida, checklist, ativa FROM projeto_tarefas WHERE fase_id = $1', [faseId])
  const ativas = rows.filter(t => t.ativa !== false)
  const precisaInv = ativas.some(t => lerChecklist(t.checklist)?.por_investidor)
  const inv = precisaInv ? await investidoresDaFase(pool, faseId) : []
  const perc = ativas.length ? Math.round(ativas.reduce((s, t) => s + progressoTarefa(t, inv), 0) / ativas.length * 100) : 0
  await pool.query('UPDATE projeto_fases SET perc_execucao = $1 WHERE id = $2', [perc, faseId])
}

export async function inserirTarefasDoModelo(pool, faseId, tarefas, novoId) {
  for (let j = 0; j < (tarefas || []).length; j++) {
    const n = normalizarTarefa(tarefas[j])
    await pool.query(
      `INSERT INTO projeto_tarefas (id, fase_id, descricao, ordem, checklist, opcional, ativa)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [novoId(), faseId, n.descricao, j, n.checklist ? JSON.stringify(n.checklist) : null, n.opcional, !n.opcional]
    )
  }
}
