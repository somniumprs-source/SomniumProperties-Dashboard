// @ts-nocheck
// Tarefas de projeto: criação a partir do modelo de fases, checklist dentro da
// tarefa e percentagem automática da fase.
// Espelho de src/db/projetoTarefas.js (manter em sync).
//
// Uma tarefa do modelo é um texto simples ou um objeto:
//   { t: 'Texto', opcional: true, porInvestidor: true,
//     checklist: [{ k: 'chave', t: 'Item', slot: 'caderneta_predial', obrigatoria: false }] }
// opcional = só aparece no projeto quando é ativada (blocos que o Comercial marca).
// Itens que só se assinalam com o documento carregado (prova do que foi feito):
// slot          = documento do imóvel (checklist de documentação do Comercial).
// doc           = documento do projeto, com este tipo (separador Documentos).
// docInvestidor = documento na ficha do investidor, com este tipo; serve para
//                 os projetos seguintes, exceto com porProjeto (só vale o deste
//                 imóvel: origem dos fundos, declaração de risco, comprovativos).
// imovel        = campos da ficha do imóvel que têm de estar preenchidos (ex.:
//                 nome e NIF do vendedor, pedidos só na Aquisição; auditoria D7).

export function normalizarTarefa(t) {
  if (typeof t === 'string') return { descricao: t, opcional: false, checklist: null }
  const itens = (t.checklist || []).map(i => ({
    k: i.k, t: i.t, slot: i.slot || null, obrigatoria: i.obrigatoria !== false,
    ...(i.doc ? { doc: i.doc } : {}),
    ...(i.docInvestidor ? { docInvestidor: i.docInvestidor, porProjeto: !!i.porProjeto } : {}),
    ...(i.imovel ? { imovel: i.imovel } : {}),
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

// ── Prova documental ──────────────────────────────────────────

export const pedeDocumento = i => !!(i?.slot || i?.doc || i?.docInvestidor || i?.imovel?.length)

const lista = v => {
  if (Array.isArray(v)) return v
  if (typeof v === 'string') { try { const a = JSON.parse(v); return Array.isArray(a) ? a : [] } catch { return [] } }
  return []
}

// Documento que prova um item (ou null). chave = 'k' ou 'investidorId:k'.
// ctx = { imovelId, fotos (documentos do imóvel), dadosImovel, docsProjeto, docsInvestidor }.
export function documentoDoItem(item, chave, estado, ctx) {
  if (item.imovel?.length) {
    const d = ctx.dadosImovel || {}
    return item.imovel.every(c => String(d[c] ?? '').trim() !== '') ? { nome: 'Ficha do imóvel' } : null
  }
  if (item.slot) {
    return lista(ctx.fotos).filter(f => f?.slot === item.slot)
      .sort((a, b) => String(b.uploaded_at || '').localeCompare(String(a.uploaded_at || '')))[0] || null
  }
  if (item.doc) {
    const id = estado?.[chave]?.doc?.id
    return id ? (ctx.docsProjeto || []).find(d => d.id === id) || null : null
  }
  if (item.docInvestidor) {
    const invId = String(chave).includes(':') ? String(chave).split(':')[0] : null
    return (ctx.docsInvestidor || [])
      .filter(d => d.investidor_id === invId && d.tipo === item.docInvestidor && d.storage_path
        && (!item.porProjeto || d.imovel_id === ctx.imovelId))
      .sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')))[0] || null
  }
  return null
}

// Chaves de itens obrigatórios que pedem documento e não o têm
// (os marcados «Não aplicável», com motivo, dispensam-no).
export function documentosEmFalta(checklist, investidorIds, ctx) {
  if (!checklist) return []
  const porK = Object.fromEntries(checklist.itens.map(i => [i.k, i]))
  return chavesObrigatorias(checklist, investidorIds).filter(ch => {
    const item = porK[String(ch).split(':').pop()]
    return pedeDocumento(item) && !checklist.estado?.[ch]?.na && !documentoDoItem(item, ch, checklist.estado, ctx)
  })
}

// Documentos do imóvel, do projeto e dos investidores de uma fase.
export async function contextoDocumentos(pool, faseId) {
  const { rows: [f] } = await pool.query(
    `SELECT f.negocio_id, n.imovel_id, i.fotos, i.proprietario_nome, i.proprietario_nif FROM projeto_fases f
     JOIN negocios n ON n.id = f.negocio_id LEFT JOIN imoveis i ON i.id = n.imovel_id WHERE f.id = $1`, [faseId])
  if (!f) return { imovelId: null, fotos: [], dadosImovel: {}, docsProjeto: [], docsInvestidor: [] }
  const { rows: docsProjeto } = await pool.query('SELECT id, nome, url, tipo FROM projeto_documentos WHERE negocio_id = $1', [f.negocio_id])
  const { rows: docsInvestidor } = await pool.query(
    `SELECT d.id, d.investidor_id, d.imovel_id, d.tipo, d.nome, d.storage_path, d.created_at FROM documentos_investidor d
     JOIN projeto_investidores pi ON pi.investidor_id = d.investidor_id WHERE pi.negocio_id = $1`, [f.negocio_id])
  const dadosImovel = { proprietario_nome: f.proprietario_nome, proprietario_nif: f.proprietario_nif }
  return { negocioId: f.negocio_id, imovelId: f.imovel_id, fotos: f.fotos, dadosImovel, docsProjeto, docsInvestidor }
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

// Wholesaling (auditoria D6): com todas as tranches do fee recebidas, a tarefa
// «Confirmar recebimento do fee» conclui sozinha — a prova são as tranches
// confirmadas. A fase segue a regra normal (média das tarefas).
export async function concluirRecebimentoFee(pool, negocioId) {
  const { rows } = await pool.query(
    `UPDATE projeto_tarefas t SET concluida = 1, concluida_em = NOW()
       FROM projeto_fases f
      WHERE t.fase_id = f.id AND f.negocio_id = $1 AND f.fase_key = 'fee_recebido'
        AND t.descricao = 'Confirmar recebimento do fee' AND COALESCE(t.concluida, 0) = 0
      RETURNING f.id`, [negocioId])
  for (const r of rows) await recalcularFase(pool, r.id)
  return rows.length
}
