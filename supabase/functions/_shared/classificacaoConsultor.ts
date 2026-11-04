// @ts-nocheck
/**
 * Registo e classificação de consultores (spec v1, nov 2026).
 *
 * Fluxo: a gravação entra em consultor_gravacoes (a mesma do Registo de
 * Chamada SOP 2) com etapa + consentimento → worker Whisper local transcreve
 * em segmentos com tempos → extração (IA) → pontuação (IA, só discovery e
 * acompanhamento) → avaliação "proposta" → o associado aceita, ajusta ou
 * rejeita cada nota → só então a classe passa para a ficha.
 *
 * A IA corre no Mac do worker (Claude Code, plano Claude): sem custo de API.
 * O servidor só prepara os prompts e trata as respostas (passoAnaliseConsultor).
 *
 * A IA propõe, os associados decidem. Tetos por tipo de evidência, cobertura,
 * regras mínimas e bloqueios são calculados em código (classificacaoConsultorCalc).
 *
 * Gémeo Node em src/db/classificacaoConsultor.js — o código é o mesmo, só mudam
 * os imports. Portar qualquer alteração para os dois.
 */
import {
  CRITERIOS, CHAVES, PARAMETROS_PADRAO, comPadrao, calcularClasse, aplicarTeto,
  qualificarImovel, diasDepois, taxa, ETAPAS, GUIOES,
} from './classificacaoConsultorCalc.ts'
import { agendarContactoPessoa } from './contactoPessoa.ts'

const uuid = () => globalThis.crypto.randomUUID()
const agora = () => new Date().toISOString()

export const VERSAO_PROMPTS = 'cons-v1'
// Estados de imóvel que não contam como pipeline em curso.
const ESTADOS_FECHADOS = ['Não interessa', 'Nao interessa', 'Descartado', 'Pendentes']
const limpaEstado = (e) => String(e || '').replace(/^\d+-\s*/, '').trim()

// ── Esquema (as migrações não são auto-aplicadas em produção: ver 0095) ──
let _garantido = false
export async function ensureClassificacaoTables(pool) {
  if (_garantido) return
  await pool.query(`
    ALTER TABLE consultores ADD COLUMN IF NOT EXISTS validacao TEXT DEFAULT 'Por validar';
    ALTER TABLE consultores ADD COLUMN IF NOT EXISTS associado_responsavel TEXT;
    ALTER TABLE consultores ADD COLUMN IF NOT EXISTS pontuacao REAL;
    ALTER TABLE consultores ADD COLUMN IF NOT EXISTS cobertura REAL;
    ALTER TABLE consultor_gravacoes ADD COLUMN IF NOT EXISTS etapa_consultor TEXT;
    ALTER TABLE consultor_gravacoes ADD COLUMN IF NOT EXISTS realizada_por TEXT;
    ALTER TABLE consultor_gravacoes ADD COLUMN IF NOT EXISTS consentimento_modo TEXT;
    ALTER TABLE consultor_gravacoes ADD COLUMN IF NOT EXISTS consentimento_em TEXT;
    ALTER TABLE consultor_gravacoes ADD COLUMN IF NOT EXISTS segmentos JSONB;
    ALTER TABLE consultor_gravacoes ADD COLUMN IF NOT EXISTS analise_consultor JSONB;
    ALTER TABLE consultor_gravacoes ADD COLUMN IF NOT EXISTS estado_consultor TEXT;
    ALTER TABLE consultor_gravacoes ADD COLUMN IF NOT EXISTS erro_consultor TEXT;
    ALTER TABLE consultor_gravacoes ADD COLUMN IF NOT EXISTS audio_apagado_em TEXT;
    ALTER TABLE imoveis ADD COLUMN IF NOT EXISTS qualificada BOOLEAN;
    ALTER TABLE imoveis ADD COLUMN IF NOT EXISTS qualificacao_motivo TEXT;
    ALTER TABLE imoveis ADD COLUMN IF NOT EXISTS qualificacao_manual BOOLEAN DEFAULT false;
    ALTER TABLE imoveis ADD COLUMN IF NOT EXISTS causa_perda TEXT;
    ALTER TABLE classificacao_historico ADD COLUMN IF NOT EXISTS consultor_id TEXT;
    ALTER TABLE classificacao_historico ADD COLUMN IF NOT EXISTS autor TEXT;
    ALTER TABLE classificacao_historico ALTER COLUMN investidor_id DROP NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_class_hist_consultor ON classificacao_historico(consultor_id);

    CREATE TABLE IF NOT EXISTS parametros_classificacao (
      id TEXT PRIMARY KEY,
      entidade_tipo TEXT NOT NULL DEFAULT 'consultor',
      versao INTEGER NOT NULL,
      valores JSONB NOT NULL,
      ativa BOOLEAN NOT NULL DEFAULT true,
      criado_por TEXT,
      created_at TEXT DEFAULT (NOW()::TEXT)
    );
    CREATE TABLE IF NOT EXISTS avaliacoes (
      id TEXT PRIMARY KEY,
      entidade_tipo TEXT NOT NULL,
      entidade_id TEXT NOT NULL,
      gravacao_id TEXT,
      motivo TEXT,
      notas_ia JSONB,
      notas_finais JSONB,
      pontuacao REAL,
      cobertura REAL,
      classe_calculada TEXT,
      bloqueios JSONB,
      versao_parametros INTEGER,
      versao_prompts TEXT,
      modelo TEXT,
      estado TEXT NOT NULL DEFAULT 'proposta',
      validacao TEXT,
      validado_por TEXT,
      validado_em TEXT,
      created_at TEXT DEFAULT (NOW()::TEXT),
      updated_at TEXT DEFAULT (NOW()::TEXT)
    );
    CREATE INDEX IF NOT EXISTS idx_avaliacoes_entidade ON avaliacoes(entidade_tipo, entidade_id);
    CREATE TABLE IF NOT EXISTS evidencias (
      id TEXT PRIMARY KEY,
      entidade_tipo TEXT NOT NULL,
      entidade_id TEXT NOT NULL,
      avaliacao_id TEXT,
      gravacao_id TEXT,
      imovel_id TEXT,
      criterio TEXT NOT NULL,
      citacao TEXT NOT NULL,
      inicio_seg REAL,
      fim_seg REAL,
      tipo TEXT NOT NULL,
      confianca TEXT,
      origem TEXT NOT NULL DEFAULT 'gravacao',
      estado TEXT NOT NULL DEFAULT 'proposta',
      created_by TEXT,
      created_at TEXT DEFAULT (NOW()::TEXT)
    );
    CREATE INDEX IF NOT EXISTS idx_evidencias_entidade ON evidencias(entidade_tipo, entidade_id);
    CREATE INDEX IF NOT EXISTS idx_evidencias_avaliacao ON evidencias(avaliacao_id);
    CREATE TABLE IF NOT EXISTS compromissos (
      id TEXT PRIMARY KEY,
      entidade_tipo TEXT NOT NULL,
      entidade_id TEXT NOT NULL,
      gravacao_id TEXT,
      quem TEXT NOT NULL,
      descricao TEXT NOT NULL,
      data_limite TEXT,
      estado TEXT NOT NULL DEFAULT 'pendente',
      causa TEXT,
      tarefa_id TEXT,
      created_by TEXT,
      created_at TEXT DEFAULT (NOW()::TEXT),
      updated_at TEXT DEFAULT (NOW()::TEXT)
    );
    CREATE INDEX IF NOT EXISTS idx_compromissos_entidade ON compromissos(entidade_tipo, entidade_id);
  `)
  _garantido = true
}

// ── Parâmetros (versionados) ─────────────────────────────────
export async function lerParametros(pool) {
  await ensureClassificacaoTables(pool)
  const { rows: [r] } = await pool.query(
    "SELECT versao, valores FROM parametros_classificacao WHERE entidade_tipo = 'consultor' AND ativa ORDER BY versao DESC LIMIT 1")
  return { versao: r?.versao || 0, valores: comPadrao(r?.valores) }
}

export async function guardarParametros(pool, valores, user) {
  await ensureClassificacaoTables(pool)
  const atual = await lerParametros(pool)
  const novos = comPadrao(valores)
  const soma = CHAVES.reduce((s, k) => s + (Number(novos.pesos[k]) || 0), 0)
  if (soma !== 100) throw new Error(`Os pesos têm de somar 100 (somam ${soma})`)
  const versao = atual.versao + 1
  await pool.query("UPDATE parametros_classificacao SET ativa = false WHERE entidade_tipo = 'consultor'")
  await pool.query(
    'INSERT INTO parametros_classificacao (id, entidade_tipo, versao, valores, ativa, criado_por) VALUES ($1, $2, $3, $4, true, $5)',
    [uuid(), 'consultor', versao, JSON.stringify(novos), user?.email || user?.nome || null])
  return { versao, valores: novos }
}

// ── Transcrição em segmentos ─────────────────────────────────
// segmentos: [{ i, ini, fim, texto }] (segundos). Sem segmentos (gravações
// antigas), cada linha da transcrição vira um segmento sem tempos.
export function segmentosDe(g) {
  const s = Array.isArray(g?.segmentos) ? g.segmentos : null
  if (s?.length) return s.map((x, i) => ({ i, ini: Number(x.ini) || 0, fim: Number(x.fim) || 0, texto: String(x.texto || '').trim() })).filter(x => x.texto)
  return String(g?.transcricao || '').split(/\n+/).map(t => t.trim()).filter(Boolean).map((texto, i) => ({ i, ini: null, fim: null, texto }))
}
const mmss = (s) => (s == null ? '--:--' : `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`)

function fichaConsultor(c) {
  if (!c) return '(sem ficha)'
  let zonas = c.zonas
  try { zonas = JSON.parse(c.zonas || '[]').join(', ') } catch { /* texto */ }
  let imob = c.imobiliaria
  try { imob = JSON.parse(c.imobiliaria || '[]').join(', ') } catch { /* texto */ }
  return [['Nome', c.nome], ['Estatuto', c.estatuto], ['Agência', imob], ['Zonas', zonas], ['Região', c.regiao], ['Notas', c.notas]]
    .filter(([, v]) => v != null && v !== '').map(([k, v]) => `${k}: ${v}`).join('\n') || '(ficha vazia)'
}

function criteriosTexto(comAncoras) {
  return CRITERIOS.map(c => {
    const base = `${c.chave} — ${c.label}\n  Mede: ${c.mede}\n  Não mede: ${c.naoMede}`
    return comAncoras ? `${base}\n  Nota 1: ${c.ancoras[1]}\n  Nota 3: ${c.ancoras[3]}\n  Nota 5: ${c.ancoras[5]}` : base
  }).join('\n')
}

function promptExtracao(etapa, consultor, segmentos, params) {
  const nomeEtapa = (ETAPAS[etapa] || etapa).toUpperCase()
  const segs = segmentos.map(s => `[${s.i}] ${mmss(s.ini)}–${mmss(s.fim)} ${s.texto}`).join('\n')
  const guiao = GUIOES[etapa === 'acompanhamento' ? 'discovery' : etapa] || GUIOES.cold_call
  const perguntasGuiao = guiao.perguntas.map((q, i) => `${i}. ${q}`).join('\n')
  const triagem = etapa === 'cold_call'
    ? `,\n  "sugestao_triagem": "avancar_discovery" | "follow_up" | "descartar",\n  "triagem_justificacao": "1-2 frases"`
    : ''
  return `És analista comercial da Somnium Properties (investimento imobiliário: Fix and Flip e Wholesaling, em Coimbra, Condeixa, Miranda do Corvo, Mealhada, Lousã e Área Metropolitana do Porto; imóveis com obra até ${params.limiares.preco_max.toLocaleString('pt-PT')} €). Recebes a transcrição segmentada, com tempos, de uma ${nomeEtapa} entre um associado da Somnium e um consultor imobiliário.

CRITÉRIOS (o que cada um mede e NÃO mede — não contes a mesma evidência em dois critérios)
${criteriosTexto(false)}

FICHA DO CONSULTOR NO CRM
${fichaConsultor(consultor)}

GUIÃO DESTA ETAPA (índice. pergunta)
${perguntasGuiao}

TAREFAS
1. Atribui cada segmento a "associado", "consultor" ou "outro", pelo conteúdo (quem pergunta e apresenta a Somnium é o associado).
2. Para cada critério, recolhe só falas do CONSULTOR, LITERAIS, com o índice do segmento. Classifica cada uma:
   - "declaracao": afirmação geral ("tenho muitos compradores");
   - "exemplo": caso concreto com imóvel, data ou valor;
   - "observada": só se a conversa disser que a Somnium já verificou o facto (ex.: "recebemos a caderneta que enviou ontem").
3. Extrai dados factuais, compromissos com data (de ambos os lados) e alertas.
4. Ignora tom, simpatia, fluência, notoriedade da agência e aceitação verbal da proposta: não são evidência.
Não inventes: o que não está na transcrição fica de fora.

Responde APENAS com JSON válido, sem markdown:
{
  "resumo": "2-3 frases",
  "interlocutores": [{ "segmento": 0, "quem": "associado" | "consultor" | "outro" }],
  "dados_factuais": {
    "agencia": "texto ou null", "concelhos": ["..."], "tipologias": ["..."],
    "faixa_preco": { "min": numero ou null, "max": numero ou null },
    "imoveis_referidos": [{ "descricao": "...", "concelho": "texto ou null", "preco": numero ou null, "off_market": true|false|null, "acesso_proprietario": true|false|null, "segmento": 0 }],
    "aceitou_proposta_verbal": true|false|null
  },
  "evidencias": [{ "criterio": "C1".."C5", "segmento": 0, "citacao": "literal", "tipo": "declaracao" | "exemplo" | "observada", "confianca": "alta" | "media" | "baixa" }],
  "alertas": [{ "tipo": "contradicao" | "enganosa" | "fora_criterios" | "compromisso_em_falta", "descricao": "...", "segmento": 0 ou null, "bloqueante": true|false }],
  "compromissos": [{ "quem": "consultor" | "somnium", "descricao": "...", "data_limite": "YYYY-MM-DD ou null", "segmento": 0 }],
  "perguntas_cobertas": [índices das perguntas do guião que foram feitas, ex.: 0, 2],
  "proximos_passos": [{ "acao": "...", "data": "YYYY-MM-DD ou null" }],
  "sugestao_estatuto": "Discovery Call" | "Follow Up" | "Parceria" | null${triagem}
}
Português de Portugal. "bloqueante" só para informação enganosa ou atuação apenas fora das zonas-alvo.

--- TRANSCRIÇÃO ---
${segs}`
}

function promptPontuacao(etapa, consultor, novas, aceites, metricas, params) {
  const fmtEv = (e) => `- [${e.criterio}] (${e.tipo}${e.origem && e.origem !== 'gravacao' ? `, ${e.origem}` : ''}) "${e.citacao}"`
  return `És o diretor comercial da Somnium Properties. Propõe a nota de cada critério para o consultor abaixo, a partir das evidências. A classe NÃO é tua: a plataforma calcula-a.

CRITÉRIOS E ÂNCORAS (2 e 4 são intermédios)
${criteriosTexto(true)}

REGRAS
- Nota 1–5 só com evidência. Sem evidência suficiente: "nota": null, "por_verificar": true e uma pergunta concreta sobre um caso passado para o próximo contacto.
- Nota máxima pelo tipo de evidência mais forte: declaração ${params.tetos.declaracao}, exemplo ${params.tetos.exemplo}, observada ${params.tetos.observada}.
- Falta de informação nunca é nota baixa: só desempenho fraco demonstrado dá 1 ou 2.
- Falhas com causa na Somnium, em investidores ou em terceiros não contam contra o consultor.
- Nunca pontues tom, simpatia, fluência, notoriedade da agência ou aceitação verbal.
- Justifica cada nota citando as evidências.

FICHA
${fichaConsultor(consultor)}

EVIDÊNCIAS NOVAS (${ETAPAS[etapa] || etapa})
${novas.map(fmtEv).join('\n') || '(nenhuma)'}

EVIDÊNCIAS JÁ ACEITES EM CONTACTOS ANTERIORES
${aceites.map(fmtEv).join('\n') || '(nenhuma)'}

MÉTRICAS DA PLATAFORMA (com n.º de casos; com menos de ${params.amostra_minima} casos não tires conclusões)
${JSON.stringify(metricas)}

Responde APENAS com JSON válido, sem markdown:
{
  "criterios": {
    "C1": { "nota": 1-5 ou null, "por_verificar": true|false, "confianca": "alta" | "media" | "baixa", "justificacao": "...", "pergunta_sugerida": "texto ou null" },
    "C2": { ... }, "C3": { ... }, "C4": { ... }, "C5": { ... }
  },
  "perguntas_pendentes": ["..."]
}
Português de Portugal, direto.`
}

function textoDaResposta(response) {
  const bloco = (response?.content || []).find(b => b.type === 'text')
  return bloco?.text || '{}'
}
function parseJson(texto) {
  const m = String(texto || '').match(/\{[\s\S]*\}/)
  return JSON.parse(m?.[0] || texto || '{}')
}

// Protocolo sem estado com o worker: cada pedido traz as respostas que o worker
// já tem; quando falta uma, a análise para e devolve o prompt a correr no Mac.
class PedidoIA {
  constructor(passo, modelo, prompt) { this.passo = passo; this.modelo = modelo; this.prompt = prompt }
}
function respostaOuPedido(respostas, passo, modelo, prompt) {
  const r = respostas?.[passo]
  if (!r?.texto) throw new PedidoIA(passo, modelo, prompt)
  return { dados: parseJson(r.texto), modelo: r.modelo || modelo }
}

// ── Métricas automáticas (oportunidades, compromissos, negócios) ──
export async function metricasConsultor(pool, consultorId, params) {
  const p = comPadrao(params)
  const { rows: imoveis } = await pool.query(
    `SELECT id, nome, estado, concelho, zona, zonas, tipologia, predio_tipo, ask_price, area_bruta, area_util, fotos, link,
            qualificada, qualificacao_manual, causa_perda, created_at, data_adicionado
       FROM imoveis WHERE consultor_id = $1`, [consultorId])
  const quando = (i) => new Date(i.data_adicionado || i.created_at || 0).getTime()
  const desde90 = Date.now() - 90 * 864e5
  const desde12m = Date.now() - 365 * 864e5
  const qual = imoveis.map(i => (i.qualificacao_manual ? i.qualificada : qualificarImovel(i, p).qualificada))
  const enviadas = imoveis.length
  const qualificadas = qual.filter(q => q === true).length
  const fase = (i) => limpaEstado(i.estado)
  const prog = {
    analise: imoveis.filter(i => !['Adicionado', 'Pré-aprovação'].includes(fase(i))).length,
    visita: imoveis.filter(i => /visita|vvr|proposta|negocia|investidor|caep|wholesaling|fix/i.test(fase(i))).length,
    proposta: imoveis.filter(i => /proposta|negocia|investidor|caep|wholesaling|fix/i.test(fase(i))).length,
  }
  const { rows: negocios } = await pool.query(
    `SELECT n.id, n.categoria, n.fase, n.lucro_real, n.lucro_estimado FROM negocios n
       LEFT JOIN imoveis i ON i.id = n.imovel_id
      WHERE n.deleted_at IS NULL AND (i.consultor_id = $1 OR n.consultor_ids LIKE '%' || $1 || '%')`, [consultorId])
  await ensureClassificacaoTables(pool)
  const { rows: comp } = await pool.query(
    "SELECT estado, causa, data_limite FROM compromissos WHERE entidade_tipo = 'consultor' AND entidade_id = $1 AND quem = 'consultor'", [consultorId])
  const vencidos = comp.filter(c => c.estado !== 'pendente' || (c.data_limite && c.data_limite < agora().slice(0, 10)))
  const cumpridos = comp.filter(c => c.estado === 'cumprido').length
  const falhadosConsultor = comp.filter(c => c.estado === 'falhado' && (!c.causa || c.causa === 'consultor')).length
  return {
    oportunidades_enviadas: enviadas,
    qualificadas_total: qualificadas,
    qualificadas_90d: imoveis.filter((i, k) => qual[k] === true && quando(i) >= desde90).length,
    qualificadas_12m: imoveis.filter((i, k) => qual[k] === true && quando(i) >= desde12m).length,
    adequacao: taxa(qualificadas, enviadas, p.amostra_minima),
    progressao: { enviadas, ...prog, negocio: negocios.length },
    compromissos: { cumpridos, falhados_consultor: falhadosConsultor, vencidos: vencidos.length, cumprimento: taxa(cumpridos, cumpridos + falhadosConsultor, p.amostra_minima) },
    negocios: { n: negocios.length, lucro: negocios.reduce((s, n) => s + (Number(n.lucro_real) || Number(n.lucro_estimado) || 0), 0) },
    perdas_por_causa: imoveis.reduce((acc, i) => { if (i.causa_perda) acc[i.causa_perda] = (acc[i.causa_perda] || 0) + 1; return acc }, {}),
  }
}

// Notas finais da última avaliação validada (base para as seguintes).
async function notasBase(pool, consultorId) {
  const { rows: [a] } = await pool.query(
    `SELECT notas_finais FROM avaliacoes WHERE entidade_tipo = 'consultor' AND entidade_id = $1 AND estado = 'validada'
      ORDER BY validado_em DESC LIMIT 1`, [consultorId])
  const out = {}
  for (const k of CHAVES) { const n = a?.notas_finais?.[k]?.nota; if (Number.isInteger(n)) out[k] = n }
  return out
}

async function evidenciasAceites(pool, consultorId) {
  const { rows } = await pool.query(
    `SELECT * FROM evidencias WHERE entidade_tipo = 'consultor' AND entidade_id = $1 AND estado = 'aceite' ORDER BY created_at`, [consultorId])
  return rows
}

// ── Análise de uma gravação ──────────────────────────────────
// Devolve { pedido: { passo, modelo, prompt } } enquanto faltar uma resposta da
// IA, ou { concluido: true, gravacao } no fim.
export async function passoAnaliseConsultor(pool, gravacaoId, respostas = {}) {
  await ensureClassificacaoTables(pool)
  const { rows: [g] } = await pool.query('SELECT * FROM consultor_gravacoes WHERE id = $1', [gravacaoId])
  if (!g) throw new Error('Gravacao nao encontrada')
  if (!g.etapa_consultor) return { concluido: true, gravacao: g } // gravação só do SOP 2
  if (!g.consentimento_em) throw new Error('Sem consentimento registado: a gravação não é processada')
  const segmentos = segmentosDe(g)
  if (!segmentos.length) throw new Error('Sem transcricao para analisar')
  const { rows: [consultor] } = await pool.query('SELECT * FROM consultores WHERE id = $1', [g.consultor_id])
  const { versao, valores: params } = await lerParametros(pool)
  // Primeiro passo: reserva atómica (dois Macs a correr o worker, só um analisa).
  if (!Object.keys(respostas || {}).length) {
    const { rowCount } = await pool.query(
      `UPDATE consultor_gravacoes SET estado_consultor = 'a_analisar', erro_consultor = NULL, updated_at = $2
        WHERE id = $1 AND (estado_consultor = 'aguarda_analise' OR (estado_consultor = 'a_analisar' AND updated_at < $3))`,
      [gravacaoId, agora(), new Date(Date.now() - 30 * 60_000).toISOString()])
    if (!rowCount) return { ocupado: true }
  }

  try {
    const etapa = g.etapa_consultor
    const modeloExtracao = params.modelos[etapa] || PARAMETROS_PADRAO.modelos.discovery
    const ext = respostaOuPedido(respostas, 'extracao', modeloExtracao, promptExtracao(etapa, consultor, segmentos, params))
    const extracao = ext.dados || {}
    const porSeg = new Map(segmentos.map(s => [s.i, s]))
    const novas = (Array.isArray(extracao.evidencias) ? extracao.evidencias : [])
      .filter(e => CHAVES.includes(e?.criterio) && e?.citacao && ['declaracao', 'exemplo', 'observada'].includes(e?.tipo))
      .map(e => ({ ...e, inicio_seg: porSeg.get(Number(e.segmento))?.ini ?? null, fim_seg: porSeg.get(Number(e.segmento))?.fim ?? null, origem: 'gravacao' }))

    const analise = { versao_prompts: VERSAO_PROMPTS, etapa, extracao, modelos: { extracao: ext.modelo } }
    let avaliacaoId = null

    if (etapa !== 'cold_call') {
      const aceites = await evidenciasAceites(pool, g.consultor_id)
      const metricas = await metricasConsultor(pool, g.consultor_id, params)
      const pont = respostaOuPedido(respostas, 'pontuacao', params.modelos.pontuacao, promptPontuacao(etapa, consultor, novas, aceites, metricas, params))
      analise.modelos.pontuacao = pont.modelo
      const propostos = pont.dados?.criterios || {}
      const notasIa = {}
      for (const k of CHAVES) {
        const c = propostos[k] || {}
        const ev = [...novas.filter(e => e.criterio === k), ...aceites.filter(e => e.criterio === k)]
        const capped = aplicarTeto(Number(c.nota), ev, params)
        notasIa[k] = {
          nota: capped,
          nota_ia_original: Number.isInteger(Number(c.nota)) ? Number(c.nota) : null,
          por_verificar: capped == null,
          confianca: c.confianca || null,
          justificacao: c.justificacao || null,
          pergunta_sugerida: capped == null ? (c.pergunta_sugerida || null) : null,
        }
      }
      analise.perguntas_pendentes = pont.dados?.perguntas_pendentes || []
      // Proposta = base validada + o que esta chamada traz (só notas não nulas).
      const base = await notasBase(pool, g.consultor_id)
      const merged = { ...base }
      for (const k of CHAVES) if (notasIa[k].nota != null) merged[k] = notasIa[k].nota
      const calc = calcularClasse(merged, params, [])
      avaliacaoId = uuid()
      await pool.query(
        `INSERT INTO avaliacoes (id, entidade_tipo, entidade_id, gravacao_id, motivo, notas_ia, pontuacao, cobertura, classe_calculada,
           bloqueios, versao_parametros, versao_prompts, modelo, estado)
         VALUES ($1, 'consultor', $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'proposta')`,
        [avaliacaoId, g.consultor_id, gravacaoId, etapa, JSON.stringify(notasIa), calc.pontuacao, calc.cobertura, calc.classe,
         JSON.stringify((extracao.alertas || []).filter(a => a?.bloqueante)), versao, VERSAO_PROMPTS, pont.modelo])
      analise.calculo = calc
    }

    // Uma análise nova substitui as evidências ainda por rever desta gravação.
    await pool.query("DELETE FROM evidencias WHERE gravacao_id = $1 AND estado = 'proposta'", [gravacaoId])
    await pool.query(
      "UPDATE avaliacoes SET estado = 'descartada', updated_at = $3 WHERE gravacao_id = $1 AND estado = 'proposta' AND id IS DISTINCT FROM $2::text",
      [gravacaoId, avaliacaoId, agora()])
    // Cold call não dá classe: as citações ficam só na análise da gravação.
    for (const e of (avaliacaoId ? novas : [])) {
      await pool.query(
        `INSERT INTO evidencias (id, entidade_tipo, entidade_id, avaliacao_id, gravacao_id, criterio, citacao, inicio_seg, fim_seg, tipo, confianca, origem, estado)
         VALUES ($1, 'consultor', $2, $3, $4, $5, $6, $7, $8, $9, $10, 'gravacao', 'proposta')`,
        [uuid(), g.consultor_id, avaliacaoId, gravacaoId, e.criterio, String(e.citacao).slice(0, 2000), e.inicio_seg, e.fim_seg, e.tipo, e.confianca || null])
    }
    analise.avaliacao_id = avaliacaoId
    const { rows: [final] } = await pool.query(
      `UPDATE consultor_gravacoes SET analise_consultor = $2, estado_consultor = 'analisado', erro_consultor = NULL, updated_at = $3
        WHERE id = $1 RETURNING *`, [gravacaoId, JSON.stringify(analise), agora()])
    return { concluido: true, gravacao: final }
  } catch (e) {
    if (e instanceof PedidoIA) return { pedido: { passo: e.passo, modelo: e.modelo, prompt: e.prompt } }
    await pool.query("UPDATE consultor_gravacoes SET estado_consultor = 'erro', erro_consultor = $2 WHERE id = $1",
      [gravacaoId, String(e.message || e).slice(0, 500)]).catch(() => {})
    throw e
  }
}

// ── Leitura para a ficha (aba Avaliação) ─────────────────────
// Worker: gravações à espera da análise (ou presas em a_analisar há >30 min).
export async function gravacoesPorAnalisar(pool) {
  await ensureClassificacaoTables(pool)
  const { rows } = await pool.query(
    `SELECT id, etapa_consultor FROM consultor_gravacoes
      WHERE etapa_consultor IS NOT NULL AND consentimento_em IS NOT NULL AND transcricao IS NOT NULL
        AND (estado_consultor = 'aguarda_analise' OR (estado_consultor = 'a_analisar' AND updated_at < $1))
      ORDER BY created_at ASC LIMIT 5`, [new Date(Date.now() - 30 * 60_000).toISOString()])
  return rows
}

export async function falhaAnaliseConsultor(pool, gravacaoId, erro) {
  await pool.query("UPDATE consultor_gravacoes SET estado_consultor = 'erro', erro_consultor = $2, updated_at = $3 WHERE id = $1",
    [gravacaoId, String(erro || 'Falha na análise').slice(0, 500), agora()])
}

export async function lerAvaliacaoConsultor(pool, consultorId) {
  await ensureClassificacaoTables(pool)
  const { rows: [c] } = await pool.query(
    `SELECT id, nome, estatuto, classificacao, validacao, estado_avaliacao, pontuacao, cobertura, associado_responsavel, data_proximo_follow_up
       FROM consultores WHERE id = $1`, [consultorId])
  if (!c) return null
  const { versao, valores: params } = await lerParametros(pool)
  const { rows: validadas } = await pool.query(
    `SELECT * FROM avaliacoes WHERE entidade_tipo = 'consultor' AND entidade_id = $1 AND estado = 'validada' ORDER BY validado_em DESC LIMIT 1`, [consultorId])
  const { rows: propostas } = await pool.query(
    `SELECT a.id, a.gravacao_id, a.motivo, a.classe_calculada, a.pontuacao, a.cobertura, a.created_at, g.data_chamada, g.titulo
       FROM avaliacoes a LEFT JOIN consultor_gravacoes g ON g.id = a.gravacao_id
      WHERE a.entidade_tipo = 'consultor' AND a.entidade_id = $1 AND a.estado = 'proposta' ORDER BY a.created_at DESC`, [consultorId])
  const evidencias = await evidenciasAceites(pool, consultorId)
  const { rows: historico } = await pool.query(
    `SELECT id, classificacao_anterior, classificacao_nova, pontuacao_anterior, pontuacao_nova, motivo, tipo, autor, created_at
       FROM classificacao_historico WHERE consultor_id = $1 ORDER BY created_at DESC`, [consultorId])
  const { rows: compromissos } = await pool.query(
    `SELECT * FROM compromissos WHERE entidade_tipo = 'consultor' AND entidade_id = $1 ORDER BY COALESCE(data_limite, '9999') ASC`, [consultorId])
  const metricas = await metricasConsultor(pool, consultorId, params)
  return { consultor: c, parametros: { versao, valores: params }, ultima: validadas[0] || null, propostas, evidencias, historico, compromissos, metricas }
}

// ── Leitura para o ecrã de revisão ───────────────────────────
export async function lerAvaliacao(pool, avaliacaoId) {
  await ensureClassificacaoTables(pool)
  const { rows: [a] } = await pool.query('SELECT * FROM avaliacoes WHERE id = $1', [avaliacaoId])
  if (!a) return null
  const { rows: [g] } = await pool.query(
    `SELECT id, consultor_id, titulo, data_chamada, ficheiro_path, ficheiro_nome, duracao_seg, transcricao, segmentos,
            analise_consultor, etapa_consultor, realizada_por, consentimento_modo, consentimento_em, audio_apagado_em
       FROM consultor_gravacoes WHERE id = $1`, [a.gravacao_id])
  const { rows: [c] } = await pool.query('SELECT id, nome, estatuto, classificacao, validacao, estado_avaliacao FROM consultores WHERE id = $1', [a.entidade_id])
  const { rows: evidencias } = await pool.query('SELECT * FROM evidencias WHERE avaliacao_id = $1 ORDER BY inicio_seg NULLS LAST', [avaliacaoId])
  const aceites = await evidenciasAceites(pool, a.entidade_id)
  const base = await notasBase(pool, a.entidade_id)
  const parametros = await lerParametros(pool)
  return { avaliacao: a, gravacao: g ? { ...g, segmentos: segmentosDe(g) } : null, consultor: c, evidencias, evidencias_anteriores: aceites, base, parametros }
}

/**
 * Validação humana. payload:
 *  decisoes: { C1: { decisao: 'aceite'|'ajustada'|'rejeitada', nota?, motivo? } }
 *  evidencias_rejeitadas: [ids]
 *  bloqueios: [texto] (alertas bloqueantes confirmados pelo associado)
 *  validacao: 'Em teste' | 'Validado'
 *  compromissos: [{ quem, descricao, data_limite }]
 *  estatuto: novo estatuto (opcional, sugestão aceite)
 */
export async function validarAvaliacao(pool, avaliacaoId, payload, user) {
  await ensureClassificacaoTables(pool)
  const { rows: [a] } = await pool.query('SELECT * FROM avaliacoes WHERE id = $1', [avaliacaoId])
  if (!a) throw new Error('Avaliação não encontrada')
  if (a.estado !== 'proposta') throw new Error('Esta avaliação já foi tratada')
  const decisoes = payload?.decisoes || {}
  const notasFinais = {}
  for (const k of CHAVES) {
    const d = decisoes[k] || { decisao: 'aceite' }
    const ia = a.notas_ia?.[k] || {}
    if (d.decisao === 'ajustada') {
      if (!String(d.motivo || '').trim()) throw new Error(`${k}: ajustar obriga a indicar o motivo`)
      const n = d.nota == null || d.nota === '' ? null : Number(d.nota)
      if (n != null && !(Number.isInteger(n) && n >= 1 && n <= 5)) throw new Error(`${k}: nota inválida`)
      notasFinais[k] = { nota: n, decisao: 'ajustada', nota_ia: ia.nota ?? null, motivo: String(d.motivo).trim() }
    } else if (d.decisao === 'rejeitada') {
      if (!String(d.motivo || '').trim()) throw new Error(`${k}: rejeitar obriga a indicar o motivo`)
      notasFinais[k] = { nota: null, decisao: 'rejeitada', nota_ia: ia.nota ?? null, motivo: String(d.motivo).trim() }
    } else {
      notasFinais[k] = { nota: ia.nota ?? null, decisao: 'aceite', nota_ia: ia.nota ?? null }
    }
  }
  const { valores: params } = await lerParametros(pool)
  const base = await notasBase(pool, a.entidade_id)
  const merged = { ...base }
  for (const k of CHAVES) if (notasFinais[k].nota != null) merged[k] = notasFinais[k].nota
  // Notas finais guardadas = o conjunto acumulado (base da próxima avaliação).
  const acumuladas = {}
  for (const k of CHAVES) acumuladas[k] = { ...notasFinais[k], nota: merged[k] ?? null }
  const bloqueios = (payload?.bloqueios || []).map(String).filter(Boolean)
  const calc = calcularClasse(merged, params, bloqueios)

  // Validado exige evidência observada aceite em C1 e C3.
  let validacao = payload?.validacao === 'Validado' ? 'Validado' : 'Em teste'
  const rejeitadas = new Set(payload?.evidencias_rejeitadas || [])
  const { rows: evAval } = await pool.query('SELECT id, criterio, tipo FROM evidencias WHERE avaliacao_id = $1', [avaliacaoId])
  const aceitesAntes = await evidenciasAceites(pool, a.entidade_id)
  const observadaEm = (k) => [...aceitesAntes, ...evAval.filter(e => !rejeitadas.has(e.id))].some(e => e.criterio === k && e.tipo === 'observada')
  if (validacao === 'Validado' && !(observadaEm('C1') && observadaEm('C3'))) validacao = 'Em teste'

  const { rows: [cons] } = await pool.query('SELECT classificacao, pontuacao FROM consultores WHERE id = $1', [a.entidade_id])
  const classeFicha = calc.classe === 'Pendente' ? null : calc.classe
  const autor = user?.nome || user?.email || null
  const now = agora()

  await pool.query(
    `UPDATE avaliacoes SET notas_finais = $2, pontuacao = $3, cobertura = $4, classe_calculada = $5, bloqueios = $6,
       estado = 'validada', validacao = $7, validado_por = $8, validado_em = $9, updated_at = $9 WHERE id = $1`,
    [avaliacaoId, JSON.stringify(acumuladas), calc.pontuacao, calc.cobertura, calc.classe, JSON.stringify(bloqueios), validacao, autor, now])
  for (const e of evAval) {
    await pool.query('UPDATE evidencias SET estado = $2, created_by = COALESCE(created_by, $3) WHERE id = $1',
      [e.id, rejeitadas.has(e.id) ? 'rejeitada' : 'aceite', autor])
  }
  const sets = ['classificacao = $2', 'validacao = $3', 'pontuacao = $4', 'cobertura = $5', 'updated_at = $6']
  const vals = [a.entidade_id, classeFicha, validacao, calc.pontuacao, calc.cobertura, now]
  if (payload?.estatuto) { vals.push(String(payload.estatuto)); sets.push(`estatuto = $${vals.length}`) }
  await pool.query(`UPDATE consultores SET ${sets.join(', ')} WHERE id = $1`, vals)
  await pool.query(
    `INSERT INTO classificacao_historico (id, consultor_id, classificacao_anterior, classificacao_nova, pontuacao_anterior, pontuacao_nova, motivo, tipo, autor, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [uuid(), a.entidade_id, cons?.classificacao || null, calc.classe, Number(cons?.pontuacao) || 0, calc.pontuacao || 0,
     `${ETAPAS[a.motivo] || a.motivo || 'Avaliação'} validada (${validacao})${calc.regras.length ? ` · ${calc.regras.join('; ')}` : ''}`,
     a.motivo || 'avaliacao', autor, now])
  for (const cp of (payload?.compromissos || [])) {
    if (!cp?.descricao) continue
    await pool.query(
      `INSERT INTO compromissos (id, entidade_tipo, entidade_id, gravacao_id, quem, descricao, data_limite, estado, created_by)
       VALUES ($1, 'consultor', $2, $3, $4, $5, $6, 'pendente', $7)`,
      [uuid(), a.entidade_id, a.gravacao_id, cp.quem === 'somnium' ? 'somnium' : 'consultor', String(cp.descricao).slice(0, 500),
       /^\d{4}-\d{2}-\d{2}$/.test(cp.data_limite || '') ? cp.data_limite : null, autor])
  }
  // Correções de quem fala (associado/consultor), feitas no ecrã de revisão.
  if (payload?.interlocutores && typeof payload.interlocutores === 'object' && a.gravacao_id) {
    const lista = Object.entries(payload.interlocutores).map(([segmento, quem]) => ({ segmento: Number(segmento), quem: String(quem) }))
    await pool.query(
      `UPDATE consultor_gravacoes SET analise_consultor = jsonb_set(COALESCE(analise_consultor, '{}'::jsonb), '{extracao,interlocutores}', $2::jsonb, true)
        WHERE id = $1 AND analise_consultor->'extracao' IS NOT NULL`, [a.gravacao_id, JSON.stringify(lista)])
  }
  // Próximo contacto pela cadência da classe (só se ainda não houver um marcado).
  await agendarPelaCadencia(pool, a.entidade_id, calc.classe, params, user).catch(() => {})
  return { classe: calc.classe, pontuacao: calc.pontuacao, cobertura: calc.cobertura, regras: calc.regras, validacao }
}

export async function descartarAvaliacao(pool, avaliacaoId) {
  await pool.query("UPDATE avaliacoes SET estado = 'descartada', updated_at = $2 WHERE id = $1 AND estado = 'proposta'", [avaliacaoId, agora()])
  await pool.query("UPDATE evidencias SET estado = 'rejeitada' WHERE avaliacao_id = $1 AND estado = 'proposta'", [avaliacaoId])
  return { ok: true }
}

async function agendarPelaCadencia(pool, consultorId, classe, params, user) {
  const dias = params.cadencias?.[classe]
  if (!dias) return null
  const { rows: [aberta] } = await pool.query(
    `SELECT id FROM tarefas WHERE origem_tipo = 'consultor' AND origem_id = $1 AND origem_campo = 'proximo_contacto'
        AND status NOT IN ('Concluída', 'Concluida') AND COALESCE(arquivada, false) = false LIMIT 1`, [consultorId])
  if (aberta) return null
  return agendarContactoPessoa(pool, 'consultor', consultorId, { data: diasDepois(dias), user })
}

export async function atualizarCompromisso(pool, id, { estado, causa }) {
  const est = ['pendente', 'cumprido', 'falhado'].includes(estado) ? estado : null
  if (!est) throw new Error('Estado inválido')
  const { rows: [r] } = await pool.query(
    'UPDATE compromissos SET estado = $2, causa = $3, updated_at = $4 WHERE id = $1 RETURNING *',
    [id, est, est === 'falhado' ? (causa || 'consultor') : null, agora()])
  return r
}

// ── Sugestões (reavaliação contínua): a plataforma sugere, o associado decide ──
export async function sugestoesConsultores(pool) {
  await ensureClassificacaoTables(pool)
  const { valores: params } = await lerParametros(pool)
  const { rows: consultores } = await pool.query(
    `SELECT id, nome, classificacao, validacao, estado_avaliacao, estatuto, created_at FROM consultores
      WHERE COALESCE(estado_avaliacao, '') NOT IN ('Inativo', 'Encerrado')`)
  const { rows: ultimos } = await pool.query(`
    SELECT consultor_id, MAX(q) AS ultimo FROM (
      SELECT consultor_id, data_hora AS q FROM consultor_interacoes
        WHERE canal IS DISTINCT FROM 'Nota' AND COALESCE(resultado, 'Feito') <> 'Sem sucesso'
      UNION ALL SELECT consultor_id, COALESCE(data_adicionado, created_at) FROM imoveis WHERE consultor_id IS NOT NULL
      UNION ALL SELECT consultor_id, data_chamada FROM consultor_gravacoes WHERE transcricao IS NOT NULL OR cc_resultado = 'atendeu'
    ) t GROUP BY consultor_id`)
  const ultimoDe = new Map(ultimos.map(r => [r.consultor_id, r.ultimo]))
  const { rows: emCurso } = await pool.query(
    `SELECT DISTINCT consultor_id FROM imoveis WHERE consultor_id IS NOT NULL AND NOT (regexp_replace(COALESCE(estado, ''), '^\\d+-\\s*', '') = ANY($1))`,
    [ESTADOS_FECHADOS])
  const comPipeline = new Set(emCurso.map(r => r.consultor_id))
  const out = []
  for (const c of consultores) {
    const ultimo = ultimoDe.get(c.id) || c.created_at
    const dias = ultimo ? Math.floor((Date.now() - new Date(ultimo).getTime()) / 864e5) : null
    if (dias != null && dias >= params.inativo_dias && !comPipeline.has(c.id)) {
      out.push({ consultor_id: c.id, nome: c.nome, tipo: 'inativo', texto: `${dias} dias sem atividade nem contactos relevantes: sugerir Inativo` })
      continue
    }
    if (!c.classificacao) continue
    const m = await metricasConsultor(pool, c.id, params)
    if (m.oportunidades_enviadas >= params.amostra_minima && m.adequacao.valor != null && m.adequacao.valor < params.adequacao_min) {
      out.push({ consultor_id: c.id, nome: c.nome, tipo: 'baixa_qualidade', texto: `Adequação ${m.adequacao.valor}% (n=${m.adequacao.n}): rever C1 e C4` })
    }
    if (m.compromissos.falhados_consultor >= params.compromissos_falhados_max) {
      out.push({ consultor_id: c.id, nome: c.nome, tipo: 'incumprimento', texto: `${m.compromissos.falhados_consultor} compromissos falhados: rever C3` })
    }
    const cad = params.cadencias?.[c.classificacao]
    if (cad && dias != null && dias >= 2 * cad && m.qualificadas_90d === 0 && !comPipeline.has(c.id)) {
      out.push({ consultor_id: c.id, nome: c.nome, tipo: 'sem_oportunidades', texto: `Sem oportunidades qualificadas há ${dias} dias: marcar conversa (não descer a classe)` })
    }
  }
  return out
}

// Cria uma tarefa "Por aprovar" por sugestão (sem duplicar as que estão abertas).
export async function gerarTarefasSugestao(pool, sugestoes) {
  let criadas = 0
  for (const s of sugestoes) {
    const campo = `sugestao_${s.tipo}`
    const { rows: [ja] } = await pool.query(
      `SELECT id FROM tarefas WHERE origem_tipo = 'consultor' AND origem_id = $1 AND origem_campo = $2
          AND status NOT IN ('Concluída', 'Concluida') AND COALESCE(arquivada, false) = false LIMIT 1`, [s.consultor_id, campo])
    if (ja) continue
    const hoje = agora().slice(0, 10)
    await pool.query(
      `INSERT INTO tarefas (id, tarefa, categoria, status, prioridade, data_limite, inicio, fim, tempo_horas, origem_tipo, origem_id, origem_campo, por_aprovar)
       VALUES ($1, $2, 'Rever classificação de consultor', 'A fazer', 'media', $3, $3, $3, 0.25, 'consultor', $4, $5, true)`,
      [uuid(), `${s.nome} — ${s.texto}`, hoje, s.consultor_id, campo])
    criadas++
  }
  return criadas
}

// Revisão trimestral: uma tarefa "Rever classe" por consultor com classe validada há 90+ dias.
export async function sugestoesTrimestrais(pool) {
  await ensureClassificacaoTables(pool)
  const { rows } = await pool.query(`
    SELECT c.id AS consultor_id, c.nome, c.classificacao, MAX(a.validado_em) AS ultima
      FROM consultores c JOIN avaliacoes a ON a.entidade_tipo = 'consultor' AND a.entidade_id = c.id AND a.estado = 'validada'
     WHERE c.classificacao IS NOT NULL AND COALESCE(c.estado_avaliacao, '') NOT IN ('Inativo', 'Encerrado')
     GROUP BY c.id, c.nome, c.classificacao HAVING MAX(a.validado_em) < $1`, [new Date(Date.now() - 90 * 864e5).toISOString()])
  return rows.map(r => ({ consultor_id: r.consultor_id, nome: r.nome, tipo: 'revisao_trimestral', texto: `Revisão trimestral da classe ${r.classificacao}` }))
}

// ── Conservação: apaga o áudio N dias depois de validada a avaliação ──
export async function limparAudiosAntigos(pool, removerFicheiro) {
  await ensureClassificacaoTables(pool)
  const { valores: params } = await lerParametros(pool)
  const limite = new Date(Date.now() - params.conservacao.audio_dias * 864e5).toISOString()
  const { rows } = await pool.query(`
    SELECT DISTINCT g.id, g.ficheiro_path FROM consultor_gravacoes g
      JOIN avaliacoes a ON a.gravacao_id = g.id AND a.estado = 'validada' AND a.validado_em < $1
     WHERE g.etapa_consultor IS NOT NULL AND g.ficheiro_path IS NOT NULL AND g.audio_apagado_em IS NULL`, [limite])
  for (const r of rows) {
    await removerFicheiro(r.ficheiro_path).catch(() => {})
    await pool.query('UPDATE consultor_gravacoes SET ficheiro_path = NULL, audio_apagado_em = $2 WHERE id = $1', [r.id, agora()])
  }
  return rows.length
}

// ── Eliminação a pedido: áudio, transcrições e citações do consultor ──
export async function apagarDadosGravacoes(pool, consultorId, removerFicheiro, user) {
  await ensureClassificacaoTables(pool)
  const { rows } = await pool.query('SELECT id, ficheiro_path FROM consultor_gravacoes WHERE consultor_id = $1', [consultorId])
  for (const r of rows) if (r.ficheiro_path) await removerFicheiro(r.ficheiro_path).catch(() => {})
  await pool.query(
    `UPDATE consultor_gravacoes SET ficheiro_path = NULL, transcricao = NULL, segmentos = NULL, analise = NULL, analise_consultor = NULL,
       audio_apagado_em = $2, updated_at = $2 WHERE consultor_id = $1`, [consultorId, agora()])
  await pool.query("DELETE FROM evidencias WHERE entidade_tipo = 'consultor' AND entidade_id = $1", [consultorId])
  await pool.query(
    `INSERT INTO classificacao_historico (id, consultor_id, classificacao_anterior, classificacao_nova, motivo, tipo, autor, created_at)
     SELECT $1, id, classificacao, COALESCE(classificacao, 'Pendente'), 'Dados de gravação apagados a pedido (áudio, transcrições e citações)', 'eliminacao', $3, $4
       FROM consultores WHERE id = $2`,
    [uuid(), consultorId, user?.nome || user?.email || null, agora()])
  return { gravacoes: rows.length }
}

// ── Painel da rede (Departamento Comercial) ──────────────────
export async function painelRede(pool) {
  await ensureClassificacaoTables(pool)
  const { valores: params } = await lerParametros(pool)
  const { rows: porClasse } = await pool.query(`
    SELECT COALESCE(classificacao, CASE WHEN cobertura IS NOT NULL THEN 'Pendente' ELSE 'Sem avaliação' END) AS classe, COUNT(*)::int AS n
      FROM consultores WHERE COALESCE(estado_avaliacao, '') NOT IN ('Inativo', 'Encerrado') GROUP BY 1`)
  const { rows: imoveis } = await pool.query(`
    SELECT i.id, i.consultor_id, i.estado, i.concelho, i.zona, i.zonas, i.tipologia, i.predio_tipo, i.ask_price, i.area_bruta, i.area_util,
           i.fotos, i.link, i.qualificada, i.qualificacao_manual, COALESCE(i.data_adicionado, i.created_at) AS quando
      FROM imoveis i WHERE i.consultor_id IS NOT NULL`)
  const meses = {}
  for (let k = 11; k >= 0; k--) { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - k); meses[d.toISOString().slice(0, 7)] = { mes: d.toISOString().slice(0, 7), enviadas: 0, qualificadas: 0 } }
  for (const i of imoveis) {
    const m = String(i.quando || '').slice(0, 7)
    if (!meses[m]) continue
    meses[m].enviadas++
    const q = i.qualificacao_manual ? i.qualificada : qualificarImovel(i, params).qualificada
    if (q === true) meses[m].qualificadas++
  }
  const ano = new Date().getFullYear()
  const { rows: negocios } = await pool.query(`
    SELECT n.categoria, (im.consultor_id IS NOT NULL) AS da_rede FROM negocios n LEFT JOIN imoveis im ON im.id = n.imovel_id
     WHERE n.deleted_at IS NULL AND substr(COALESCE(n.data, n.created_at), 1, 4) = $1`, [String(ano)])
  const ff = negocios.filter(n => /fix|caep/i.test(n.categoria || ''))
  const ws = negocios.filter(n => /wholesal/i.test(n.categoria || ''))
  const sugestoes = [...await sugestoesConsultores(pool), ...await sugestoesTrimestrais(pool)]
  const fase = (i) => limpaEstado(i.estado)
  return {
    por_classe: porClasse,
    oportunidades_por_mes: Object.values(meses),
    progressao: {
      enviadas: imoveis.length,
      analise: imoveis.filter(i => !['Adicionado', 'Pré-aprovação'].includes(fase(i))).length,
      visita: imoveis.filter(i => /visita|vvr|proposta|negocia|investidor|caep|wholesaling|fix/i.test(fase(i))).length,
      proposta: imoveis.filter(i => /proposta|negocia|investidor|caep|wholesaling|fix/i.test(fase(i))).length,
    },
    objetivo: {
      ano,
      fix_flip: { feitos: ff.length, da_rede: ff.filter(n => n.da_rede).length, meta: '2–3' },
      wholesaling: { feitos: ws.length, da_rede: ws.filter(n => n.da_rede).length, meta: '5' },
    },
    a_rever: sugestoes,
  }
}

// Recalcula e guarda a qualificação automática de um imóvel (respeita a manual).
export async function atualizarQualificacao(pool, imovelId) {
  await ensureClassificacaoTables(pool)
  const { rows: [im] } = await pool.query('SELECT * FROM imoveis WHERE id = $1', [imovelId])
  if (!im || im.qualificacao_manual) return im || null
  const { valores: params } = await lerParametros(pool)
  const q = qualificarImovel(im, params)
  const { rows: [r] } = await pool.query(
    'UPDATE imoveis SET qualificada = $2, qualificacao_motivo = $3 WHERE id = $1 RETURNING id, qualificada, qualificacao_motivo, qualificacao_manual',
    [imovelId, q.qualificada, q.motivos.join('; ') || null])
  return r
}

export async function corrigirQualificacao(pool, imovelId, { qualificada, motivo, causa_perda }, user) {
  await ensureClassificacaoTables(pool)
  const sets = []
  const vals = [imovelId]
  if (qualificada !== undefined) {
    if (!String(motivo || '').trim()) throw new Error('Corrigir a qualificação obriga a indicar o motivo')
    vals.push(qualificada === null ? null : !!qualificada); sets.push(`qualificada = $${vals.length}`)
    vals.push(`${String(motivo).trim()}${user?.nome ? ` (${user.nome})` : ''}`); sets.push(`qualificacao_motivo = $${vals.length}`)
    sets.push('qualificacao_manual = true')
  }
  if (causa_perda !== undefined) { vals.push(causa_perda || null); sets.push(`causa_perda = $${vals.length}`) }
  if (!sets.length) return null
  const { rows: [r] } = await pool.query(`UPDATE imoveis SET ${sets.join(', ')} WHERE id = $1 RETURNING id, qualificada, qualificacao_motivo, qualificacao_manual, causa_perda`, vals)
  return r
}
