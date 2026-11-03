// @ts-nocheck
/**
 * AI assistant para resumos de projecto Fix and Flip.
 * Gera, pelo Claude:
 *  - Resumo executivo do estado do projecto
 *  - 3-5 sugestões priorizadas para o próximo passo
 *
 * O Claude corre no Mac do worker (fila IA, plano Claude, sem API paga). O
 * último resumo fica guardado na fila; com mais de 24h pede-se um novo e
 * mostra-se o anterior entretanto.
 * Gémeo Node em src/db/projetoAiAssistant.js — portar alterações para os dois.
 */
import pool from './pg.ts'
import { enfileirarIA, estadoIA, emFilaIA, jsonDaResposta } from './filaIA.ts'

const MODEL = 'haiku'
const CACHE_TTL_MS = 24 * 60 * 60 * 1000

export function isConfigured() {
  return true
}

const EUR = v => v == null ? '—' : new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(Number(v) || 0)
const DATE = v => v ? new Date(v).toLocaleDateString('pt-PT') : '—'

async function carregarContexto(negocioId) {
  const { rows: negRows } = await pool.query('SELECT * FROM negocios WHERE id = $1', [negocioId])
  if (!negRows.length) return null
  const negocio = negRows[0]

  const { rows: fases } = await pool.query(
    'SELECT * FROM projeto_fases WHERE negocio_id = $1 ORDER BY ordem', [negocioId]
  )
  const faseIds = fases.map(f => f.id)
  const tarefas = faseIds.length > 0
    ? (await pool.query('SELECT * FROM projeto_tarefas WHERE fase_id = ANY($1) ORDER BY ordem', [faseIds])).rows
    : []
  const despesas = (await pool.query('SELECT * FROM despesas WHERE negocio_id = $1 ORDER BY data DESC NULLS LAST', [negocioId])).rows
  const { rows: invs } = await pool.query(
    `SELECT pi.capital, pi.percentagem, i.nome FROM projeto_investidores pi
     JOIN investidores i ON pi.investidor_id = i.id WHERE pi.negocio_id = $1`,
    [negocioId]
  )

  const orcAlocado = fases.reduce((s, f) => s + (Number(f.orcamento_alocado) || 0), 0)
  const custoReal = fases.reduce((s, f) => s + (Number(f.custo_real) || 0), 0)
  const percGlobal = fases.length > 0
    ? Math.round(fases.reduce((s, f) => s + (Number(f.perc_execucao) || 0), 0) / fases.length)
    : 0

  // Atrasos
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0)
  const atrasos = fases.filter(f => {
    if (f.estado === 'concluida' || !f.data_fim_prevista) return false
    return new Date(f.data_fim_prevista) < hoje
  })

  return { negocio, fases, tarefas, despesas, invs, orcAlocado, custoReal, percGlobal, atrasos }
}

function montarPrompt(ctx) {
  const { negocio, fases, tarefas, despesas, invs, orcAlocado, custoReal, percGlobal, atrasos } = ctx
  const faseAtual = fases.find(f => f.estado === 'em_curso')
  const tarefasPend = tarefas.filter(t => !t.concluida)
  const tarefasPendFaseAtual = faseAtual ? tarefasPend.filter(t => t.fase_id === faseAtual.id) : []

  let prompt = `És um consultor sénior de obra a apresentar o estado de um projecto Fix and Flip a um investidor.\n\n`
  prompt += `DADOS DO PROJECTO:\n`
  prompt += `- Nome: ${negocio.movimento}\n`
  prompt += `- Categoria: ${negocio.categoria || '—'}\n`
  prompt += `- Compra: ${DATE(negocio.data_compra)} · Venda estimada: ${DATE(negocio.data_estimada_venda)}\n`
  prompt += `- Faturação esperada: ${EUR(negocio.lucro_estimado)} · Capital total: ${EUR(negocio.capital_total)}\n`
  prompt += `- Execução global: ${percGlobal}%\n`
  prompt += `- Orçamento alocado por fase: ${EUR(orcAlocado)} · Custo real até agora: ${EUR(custoReal)}\n`
  if (invs.length > 0) {
    prompt += `- Investidores ligados: ${invs.length} (${invs.map(i => `${i.nome} ${EUR(i.capital)}`).join(', ')})\n`
  }
  prompt += `\nFASES (${fases.length}):\n`
  for (const f of fases) {
    const emoji = f.estado === 'concluida' ? '✓' : f.estado === 'em_curso' ? '▶' : '○'
    prompt += `  ${emoji} ${f.nome} — ${f.perc_execucao || 0}% · ${f.estado}`
    if (f.data_fim_prevista) prompt += ` · prevista até ${DATE(f.data_fim_prevista)}`
    if (f.custo_real > 0) prompt += ` · gasto ${EUR(f.custo_real)}`
    prompt += `\n`
  }
  if (atrasos.length > 0) {
    prompt += `\n⚠️  ATRASOS (${atrasos.length}):\n`
    for (const a of atrasos) {
      const dias = Math.floor((new Date() - new Date(a.data_fim_prevista)) / 86400000)
      prompt += `  - ${a.nome} está ${dias} dias atrasado (previsto ${DATE(a.data_fim_prevista)})\n`
    }
  }
  if (faseAtual && tarefasPendFaseAtual.length > 0) {
    prompt += `\nTAREFAS PENDENTES NA FASE ACTUAL (${faseAtual.nome}):\n`
    tarefasPendFaseAtual.slice(0, 10).forEach(t => { prompt += `  - ${t.descricao}\n` })
  }
  if (despesas.length > 0) {
    const ultimas = despesas.slice(0, 5)
    prompt += `\nÚLTIMAS DESPESAS:\n`
    ultimas.forEach(d => { prompt += `  - ${d.movimento}: ${EUR(d.custo_mensal)} (${DATE(d.data)})\n` })
  }

  prompt += `\n\nGera resposta em JSON com este formato exacto:\n`
  prompt += `{\n`
  prompt += `  "resumo": "2-3 frases em português europeu, tom profissional e factual, sobre o estado actual",\n`
  prompt += `  "sinal": "verde" | "amarelo" | "vermelho",\n`
  prompt += `  "destaques": ["3-4 pontos curtos (max 10 palavras cada) que importam ao investidor"],\n`
  prompt += `  "proximos_passos": ["3-5 ações priorizadas para os próximos 7 dias"]\n`
  prompt += `}\n\n`
  prompt += `Regras:\n`
  prompt += `- Sinal "verde" se sem atrasos e %>= esperado para o tempo decorrido; "amarelo" se 1-2 alertas; "vermelho" se atrasos graves ou desvio orçamental >20%.\n`
  prompt += `- Não inventes dados. Se algo não for visível, omite.\n`
  prompt += `- Português europeu, sem emojis no JSON.\n`
  prompt += `- Devolve APENAS o JSON, sem texto antes ou depois.`

  return prompt
}

export async function gerarResumoProjeto(negocioId, { ignorarCache = false } = {}) {
  const ultimo = await estadoIA(pool, 'resumo_projeto', negocioId)
  const anterior = ultimo?.estado === 'concluido' ? ultimo.resultado : null
  if (emFilaIA(ultimo)) return { ok: true, em_fila: true, ...(anterior || {}) }
  const fresco = anterior && Date.now() - new Date(ultimo.updated_at).getTime() < CACHE_TTL_MS
  if (anterior && fresco && !ignorarCache) return { ok: true, ...anterior, cached: true }

  const ctx = await carregarContexto(negocioId)
  if (!ctx) return { ok: false, error: 'Projecto não encontrado' }
  await enfileirarIA(pool, { tipo: 'resumo_projeto', ref_id: negocioId, prompt: montarPrompt(ctx), modelo: MODEL })
  // Mostra o resumo anterior (se houver) enquanto o novo é gerado.
  const { rows: [ant] } = await pool.query(
    `SELECT resultado FROM ia_fila WHERE tipo = 'resumo_projeto' AND ref_id = $1 AND estado = 'concluido' ORDER BY updated_at DESC LIMIT 1`, [String(negocioId)])
  return { ok: true, em_fila: true, ...(ant?.resultado || {}) }
}

// Aplicador da fila IA: o resultado fica guardado no próprio pedido.
export async function aplicarResumoProjeto(pedido, texto) {
  const parsed = jsonDaResposta(texto)
  return {
    resumo: parsed.resumo || '',
    sinal: parsed.sinal || 'amarelo',
    destaques: Array.isArray(parsed.destaques) ? parsed.destaques : [],
    proximos_passos: Array.isArray(parsed.proximos_passos) ? parsed.proximos_passos : [],
    gerado_em: new Date().toISOString(),
    modelo: pedido.modelo || MODEL,
  }
}

// Invalidar cache (chamar quando um projecto muda significativamente)
export function invalidarCacheAi(negocioId) {
  // Sem cache em memória: o próximo pedido com ?fresh=1 gera um resumo novo.
}
