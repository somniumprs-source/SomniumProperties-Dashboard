// @ts-nocheck
/**
 * Chamadas gravadas com investidores (Cold Call e Follow-up), avaliadas contra
 * o SOP 4 (Procura, registo e classificação de Investidores) e o Anexo 9
 * (Checklist de Validação de Investidores).
 *
 * Fluxo igual ao das gravações dos consultores: upload do áudio → worker
 * Whisper local (launchd) transcreve → análise pelo Claude. O registo manual
 * (resultado, próximo passo, temperatura, data de follow-up) é sempre a fonte
 * de verdade; a IA só deixa sugestões dentro de `analise`.
 *
 * Gémeo Node em src/db/chamadasInvestidor.js — o código é o mesmo, só muda o
 * import do SDK. Portar qualquer alteração para os dois.
 */
import Anthropic from "@anthropic-ai/sdk"

const env = (k) => (globalThis.Deno ? globalThis.Deno.env.get(k) : process.env[k])

export const TIPOS_CHAMADA_INV = ['cold_call', 'follow_up']
export const RESULTADOS_INV = ['atendeu', 'nao_atendeu', 'recusou', 'numero_errado']
export const PROXIMOS_PASSOS_INV = ['entrevista_marcada', 'follow_up_agendado', 'enviar_forms', 'sem_interesse', 'nao_elegivel']
export const TEMPERATURAS_INV = ['quente', 'intermedio', 'frio']

// Passos avaliados (0 = não feito, 1 = superficial, 2 = bem feito).
export const PASSOS_INV = {
  cold_call: [
    { chave: 'abertura', label: 'Abertura e apresentação', guia: 'Contacto personalizado (refere o Forms ou a origem do lead), apresenta a Somnium e resume o modelo (Fix and Flip, Cedência de Posição Contratual/CAEP, Parcerias) de forma breve.' },
    { chave: 'perfil', label: 'Tipo de investidor e experiência', guia: 'Identifica se é Ativo (gere obra e venda) ou Passivo (não participa na gestão), a experiência imobiliária e o historial de negócios. Se Ativo, confirma equipa de obras.' },
    { chave: 'capital', label: 'Capacidade financeira', guia: 'Capital mínimo e máximo, se é real e rapidamente mobilizável (não teórico) e quando fica disponível. Referência: Passivo 50.000€, Ativo 200.000€.' },
    { chave: 'retorno', label: 'Retorno esperado e risco', guia: 'ROI e ROI anualizado pretendidos, se são realistas, tolerância a imprevistos (atrasos, custos de obra, valor de venda).' },
    { chave: 'alinhamento', label: 'Alinhamento estratégico', guia: 'Estratégia (CAEP, cedência de posição, Fix and Flip), tipo de imóvel, zonas e grau de interferência compatíveis com o modelo da Somnium. É o critério mais importante no Passivo.' },
    { chave: 'compromisso', label: 'Disponibilidade e timing', guia: 'Timing real de decisão (não entusiasmo) e disponibilidade para avançar.' },
    { chave: 'objeccoes', label: 'Gestão de objecções', guia: 'Responde às dúvidas com clareza, sem pressionar nem prometer. Se não houve objecções, avalia como o interesse foi confirmado.' },
    { chave: 'fecho', label: 'Fecho e próximo passo', guia: 'Termina com próximo passo concreto e datado: entrevista estratégica com CEO e CFO, ou follow-up com data e motivo.' },
  ],
  follow_up: [
    { chave: 'retoma', label: 'Retoma de contexto', guia: 'Refere a última interação e personaliza. Não repete o mesmo script de forma idêntica (SOP 4, 5.7).' },
    { chave: 'valor', label: 'Valor novo', guia: 'Traz um motivo real para o contacto: novidade, oportunidade, resultado de projeto, resposta a uma dúvida anterior.' },
    { chave: 'actualizacao', label: 'Actualização da situação', guia: 'Confirma se mudou o capital disponível, o timing ou o perfil do investidor.' },
    { chave: 'dados_em_falta', label: 'Recolha de dados em falta', guia: 'Completa a qualificação do Anexo 9 (capital, ROI, estratégia, tipo de imóvel, experiência, equipa de obras).' },
    { chave: 'objeccoes', label: 'Gestão de objecções', guia: 'Responde às dúvidas com clareza, sem pressionar nem prometer.' },
    { chave: 'fecho', label: 'Fecho e próximo passo', guia: 'Próximo passo com data. Se não avança, define a temperatura: quente (30 dias), intermédio (60) ou frio (90).' },
  ],
}

export const CRITERIOS_CLASSIFICACAO = [
  ['capacidade_financeira', 'Capacidade financeira'],
  ['experiencia', 'Experiência imobiliária'],
  ['alinhamento', 'Alinhamento estratégico'],
  ['credibilidade', 'Estabilidade e credibilidade'],
  ['compromisso', 'Disponibilidade e compromisso'],
]

let _tabelaGarantida = false
export async function ensureInvestidorGravacoesTable(pool) {
  if (_tabelaGarantida) return
  await pool.query(`
    CREATE TABLE IF NOT EXISTS investidor_gravacoes (
      id TEXT PRIMARY KEY,
      investidor_id TEXT NOT NULL REFERENCES investidores(id) ON DELETE CASCADE,
      tipo_chamada TEXT NOT NULL DEFAULT 'cold_call',
      titulo TEXT,
      data_chamada TEXT,
      realizada_por TEXT,
      ficheiro_path TEXT,
      ficheiro_nome TEXT,
      duracao_seg INTEGER,
      estado TEXT NOT NULL DEFAULT 'pendente',
      erro TEXT,
      transcricao TEXT,
      analise JSONB,
      nota_sop SMALLINT,
      resultado TEXT,
      proximo_passo TEXT,
      temperatura TEXT,
      data_follow_up TEXT,
      notas TEXT,
      registo_fonte TEXT,
      registo_confirmado_em TEXT,
      created_at TEXT DEFAULT (NOW()::TEXT),
      updated_at TEXT DEFAULT (NOW()::TEXT)
    );
    CREATE INDEX IF NOT EXISTS idx_inv_gravacoes_investidor ON investidor_gravacoes(investidor_id);
    CREATE INDEX IF NOT EXISTS idx_inv_gravacoes_estado ON investidor_gravacoes(estado);
    CREATE INDEX IF NOT EXISTS idx_inv_gravacoes_data ON investidor_gravacoes(data_chamada);
  `)
  _tabelaGarantida = true
}

// O worker de transcrição usa as mesmas rotas /gravacoes/:id/* para as duas
// tabelas: o id (UUID) diz a qual pertence.
export async function tabelaDaGravacao(pool, id) {
  await ensureInvestidorGravacoesTable(pool)
  const { rows } = await pool.query('SELECT 1 FROM investidor_gravacoes WHERE id = $1', [id])
  return rows.length ? 'investidor_gravacoes' : 'consultor_gravacoes'
}

const escolhe = (v, lista) => (lista.includes(v) ? v : null)
const dataISO = (v) => (/^\d{4}-\d{2}-\d{2}/.test(String(v || '')) ? String(v).slice(0, 10) : null)

// Junta o payload novo com o registo actual (só as chaves presentes mudam).
export function sanitizeRegistoInvestidor(input = {}, current = {}) {
  const pick = (k) => (Object.prototype.hasOwnProperty.call(input, k) ? input[k] : current[k])
  return {
    resultado: escolhe(pick('resultado'), RESULTADOS_INV),
    proximo_passo: escolhe(pick('proximo_passo'), PROXIMOS_PASSOS_INV),
    temperatura: escolhe(pick('temperatura'), TEMPERATURAS_INV),
    data_follow_up: dataISO(pick('data_follow_up')),
    notas: String(pick('notas') ?? '').trim() || null,
  }
}

// Nota SOP (0-100): média dos passos avaliados.
export function notaSop(analise, tipo) {
  const passos = PASSOS_INV[tipo] || PASSOS_INV.cold_call
  const notas = passos.map(p => Number(analise?.passos?.[p.chave]?.nota)).filter(n => Number.isFinite(n))
  if (!notas.length) return null
  const soma = notas.reduce((s, n) => s + Math.max(0, Math.min(2, n)), 0)
  return Math.round(soma / (notas.length * 2) * 100)
}

function contextoInvestidor(inv) {
  if (!inv) return '(sem ficha)'
  const campos = [
    ['Nome', inv.nome], ['Status', inv.status], ['Tipo', inv.tipo_principal], ['Origem', inv.origem],
    ['Capital mín.', inv.capital_min], ['Capital máx.', inv.capital_max], ['Estratégia', inv.estrategia],
    ['ROI pretendido', inv.roi_pretendido], ['ROI anualizado pretendido', inv.roi_anualizado_pretendido],
    ['Experiência', inv.experiencia_imobiliario], ['Equipa de obras', inv.equipa_obras],
    ['Tipo de imóvel', inv.tipo_imovel_preferido], ['Classificação', inv.classificacao], ['Notas', inv.notas],
  ]
  return campos.filter(([, v]) => v != null && v !== '').map(([k, v]) => `${k}: ${v}`).join('\n') || '(ficha vazia)'
}

function buildPrompt(tipo, investidor) {
  const passos = PASSOS_INV[tipo] || PASSOS_INV.cold_call
  const nomeTipo = tipo === 'follow_up' ? 'FOLLOW-UP' : 'COLD CALL'
  const passosTxt = passos.map((p, i) => `${i + 1}. ${p.chave} (${p.label}): ${p.guia}`).join('\n')
  const passosJson = passos.map(p => `    "${p.chave}": { "nota": 0-2, "evidencia": "citação curta da transcrição ou null", "comentario": "o que faltou e como fazer melhor" }`).join(',\n')
  return `És um analista comercial sénior da Somnium Properties (investimento imobiliário em Coimbra, Portugal: Fix and Flip, CAEP/Cedência de Posição Contratual, Parcerias). Recebes a transcrição de uma chamada de ${nomeTipo} entre a nossa equipa e um potencial investidor. Avalia-a contra o SOP 4 (Procura, registo e classificação de Investidores) com o objectivo de OPTIMIZAR as nossas cold calls e follow-ups e treinar a equipa.

REGRAS DO SOP 4 PARA ESTE CONTACTO
- O primeiro contacto é personalizado, resume o modelo de negócio, avalia interesse e convida para conversa exploratória. NÃO deve conter informação financeira detalhada nem oportunidades concretas.
- Proibido: comunicação enganosa e promessas de rentabilidade garantida.
- Objectivo da qualificação (Anexo 9, Fase 2): capital mínimo e máximo, data do capital disponível, ROI e ROI anualizado pretendidos, estratégia, tipo de imóvel, tipo de investidor (Ativo/Passivo), experiência, histórico de negócios, equipa de obras.
- O passo seguinte certo para um investidor qualificado é a Entrevista Estratégica com o CEO e o CFO (Alexandre Mendes e João Abreu).
- Follow-up estratégico, nunca repetitivo: quente 30 dias, intermédio 60, frio 90.
- Investidor Passivo: capital mínimo recomendado 50.000€. Investidor Ativo: 200.000€ e experiência com peso máximo.

PASSOS A AVALIAR (0 = não feito, 1 = superficial, 2 = bem feito com detalhe concreto)
${passosTxt}

FICHA ACTUAL DO INVESTIDOR NO CRM
${contextoInvestidor(investidor)}

Responde APENAS com um objecto JSON válido (sem texto antes ou depois, sem markdown), com esta estrutura exacta:
{
  "resumo": "2-3 frases sobre o que aconteceu",
  "sentimento": "positivo" | "neutro" | "negativo",
  "interesse_investidor": "alto" | "medio" | "baixo",
  "passos": {
${passosJson}
  },
  "conformidade": { "promessa_rentabilidade_garantida": true|false, "informacao_financeira_detalhada_cedo": true|false, "comentario": "texto ou null" },
  "pontos_fortes": ["o que correu bem"],
  "pontos_fracos": ["onde falhámos ou perdemos o controlo da conversa"],
  "objeccoes": [{ "objeccao": "dúvida ou objecção do investidor", "resposta_dada": "como respondemos", "eficaz": true|false, "sugestao": "como responder melhor" }],
  "melhorias_script": [{ "momento": "abertura | qualificacao | objeccao | fecho | outro", "em_vez_de": "o que foi dito", "dizer": "frase concreta a usar da próxima vez" }],
  "dados_recolhidos": { "tipo_investidor": "Ativo" | "Passivo" | null, "capital_min": numero ou null, "capital_max": numero ou null, "capital_disponivel_quando": "texto ou null", "roi_pretendido": "texto ou null", "estrategia": "texto ou null", "tipo_imovel": "texto ou null", "experiencia": "texto ou null", "equipa_obras": "texto ou null", "dados_em_falta": ["campos do Anexo 9 que ficaram por recolher"] },
  "pre_classificacao": { "capacidade_financeira": 1-5 ou null, "experiencia": 1-5 ou null, "alinhamento": 1-5 ou null, "credibilidade": 1-5 ou null, "compromisso": 1-5 ou null, "justificacao": "1-2 frases" },
  "proximo_passo": "acção recomendada concreta, com prazo",
  "sugestao_resultado": "atendeu" | "nao_atendeu" | "recusou" | "numero_errado" | null,
  "sugestao_proximo_passo": "entrevista_marcada" | "follow_up_agendado" | "enviar_forms" | "sem_interesse" | "nao_elegivel" | null,
  "sugestao_temperatura": "quente" | "intermedio" | "frio" | null,
  "sugestao_data_follow_up": "YYYY-MM-DD ou null",
  "sugestao_justificacao": "1-2 frases a justificar as sugestões"
}

A pre_classificacao é só indicativa (a classificação oficial é feita na Entrevista Estratégica). Escreve em português de Portugal, directo e profissional. Não inventes: se algo não aparece na transcrição, usa null.`
}

function parseJson(texto) {
  const m = String(texto || '').match(/\{[\s\S]*\}/)
  return JSON.parse(m?.[0] || texto || '{}')
}

async function claude(prompt, maxTokens) {
  const key = env('ANTHROPIC_API_KEY')
  if (!key) throw new Error('ANTHROPIC_API_KEY nao configurada')
  const client = new Anthropic({ apiKey: key })
  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: maxTokens,
    messages: [{ role: 'user', content: prompt }],
  })
  return parseJson(response.content?.[0]?.text || '{}')
}

export async function analisarChamadaInvestidor(transcricao, tipo, investidor) {
  return claude(`${buildPrompt(tipo, investidor)}\n\n--- TRANSCRICAO ---\n${transcricao}`, 6000)
}

// Corre a análise e grava-a (com a nota SOP). Em erro, deixa a mensagem e
// repõe 'transcrito' para se poder tentar de novo.
export async function analisarEGravar(pool, id) {
  const { rows: [g] } = await pool.query('SELECT * FROM investidor_gravacoes WHERE id = $1', [id])
  if (!g) throw new Error('Gravacao nao encontrada')
  if (!g.transcricao?.trim()) throw new Error('Sem transcricao para analisar')
  const { rows: [inv] } = await pool.query('SELECT * FROM investidores WHERE id = $1', [g.investidor_id])
  await pool.query(`UPDATE investidor_gravacoes SET estado = 'a_analisar', updated_at = $2 WHERE id = $1`, [id, new Date().toISOString()])
  try {
    const analise = await analisarChamadaInvestidor(g.transcricao, g.tipo_chamada, inv)
    const { rows: [final] } = await pool.query(
      `UPDATE investidor_gravacoes SET analise = $2, nota_sop = $3, estado = 'analisado', erro = NULL, updated_at = $4 WHERE id = $1 RETURNING *`,
      [id, JSON.stringify(analise), notaSop(analise, g.tipo_chamada), new Date().toISOString()],
    )
    return final
  } catch (e) {
    await pool.query(`UPDATE investidor_gravacoes SET estado = 'transcrito', erro = $2, updated_at = $3 WHERE id = $1`,
      [id, `Analise: ${e.message}`, new Date().toISOString()]).catch(() => {})
    throw e
  }
}

const media = (arr) => (arr.length ? Math.round(arr.reduce((s, n) => s + n, 0) / arr.length * 10) / 10 : null)
const pct = (a, b) => (b ? Math.round(a / b * 1000) / 10 : null)

function inicioSemana(d) {
  const dt = new Date(String(d).slice(0, 10) + 'T00:00:00Z')
  if (Number.isNaN(dt.getTime())) return null
  const dia = (dt.getUTCDay() + 6) % 7 // segunda = 0
  dt.setUTCDate(dt.getUTCDate() - dia)
  return dt.toISOString().slice(0, 10)
}

// Agregado do período: nota por passo (onde falhamos), conversão, conformidade,
// evolução semanal e objecções. O registo manual prevalece; sem ele usa-se a
// sugestão da IA (contado à parte em `sem_registo_manual`).
export async function relatorioChamadasInvestidores(pool, { desde, ate }) {
  await ensureInvestidorGravacoesTable(pool)
  const { rows } = await pool.query(
    `SELECT g.*, i.nome AS investidor_nome, i.status AS investidor_status
     FROM investidor_gravacoes g LEFT JOIN investidores i ON i.id = g.investidor_id
     WHERE substr(g.data_chamada, 1, 10) BETWEEN $1 AND $2
     ORDER BY g.data_chamada DESC, g.created_at DESC`,
    [desde, ate],
  )
  const efectivo = (g, campo) => g[campo] ?? g.analise?.[`sugestao_${campo}`] ?? null
  const analisadas = rows.filter(g => g.analise && g.nota_sop != null)

  const passos = {}
  for (const tipo of TIPOS_CHAMADA_INV) {
    const doTipo = analisadas.filter(g => g.tipo_chamada === tipo)
    passos[tipo] = PASSOS_INV[tipo].map(p => {
      const notas = doTipo.map(g => Number(g.analise?.passos?.[p.chave]?.nota)).filter(n => Number.isFinite(n))
      return { chave: p.chave, label: p.label, media: media(notas), pct: notas.length ? Math.round(media(notas) / 2 * 100) : null, n: notas.length }
    })
  }

  const cold = rows.filter(g => g.tipo_chamada === 'cold_call')
  const follow = rows.filter(g => g.tipo_chamada === 'follow_up')
  const atendeu = (g) => efectivo(g, 'resultado') === 'atendeu' || (efectivo(g, 'resultado') == null && g.transcricao)
  const coldAtendidas = cold.filter(atendeu)
  const followAtendidas = follow.filter(atendeu)
  const entrevista = (g) => efectivo(g, 'proximo_passo') === 'entrevista_marcada'

  const semanas = {}
  for (const g of analisadas) {
    const s = inicioSemana(g.data_chamada)
    if (!s) continue
    ;(semanas[s] ||= []).push(g.nota_sop)
  }

  const objeccoes = []
  for (const g of analisadas) {
    for (const o of (Array.isArray(g.analise?.objeccoes) ? g.analise.objeccoes : [])) {
      if (o?.objeccao) objeccoes.push({ objeccao: o.objeccao, eficaz: !!o.eficaz, sugestao: o.sugestao || null, investidor: g.investidor_nome, data: g.data_chamada })
    }
  }

  const temperatura = { quente: 0, intermedio: 0, frio: 0 }
  for (const g of rows) { const t = efectivo(g, 'temperatura'); if (t in temperatura) temperatura[t]++ }

  return {
    periodo: { desde, ate },
    totais: {
      chamadas: rows.length,
      cold_call: cold.length,
      follow_up: follow.length,
      analisadas: analisadas.length,
      por_processar: rows.filter(g => ['pendente', 'a_transcrever', 'transcrito', 'a_analisar'].includes(g.estado)).length,
      sem_registo_manual: rows.filter(g => !g.resultado && !g.proximo_passo).length,
    },
    nota_media: {
      global: media(analisadas.map(g => g.nota_sop)),
      cold_call: media(analisadas.filter(g => g.tipo_chamada === 'cold_call').map(g => g.nota_sop)),
      follow_up: media(analisadas.filter(g => g.tipo_chamada === 'follow_up').map(g => g.nota_sop)),
    },
    passos,
    conversao: {
      taxa_contacto: pct(coldAtendidas.length + followAtendidas.length, rows.length),
      cold_atendidas: coldAtendidas.length,
      cold_entrevista: coldAtendidas.filter(entrevista).length,
      taxa_cold_entrevista: pct(coldAtendidas.filter(entrevista).length, coldAtendidas.length),
      follow_atendidas: followAtendidas.length,
      follow_entrevista: followAtendidas.filter(entrevista).length,
      taxa_follow_entrevista: pct(followAtendidas.filter(entrevista).length, followAtendidas.length),
      sem_interesse: rows.filter(g => ['sem_interesse', 'nao_elegivel'].includes(efectivo(g, 'proximo_passo'))).length,
      follow_up_sem_data: rows.filter(g => efectivo(g, 'proximo_passo') === 'follow_up_agendado' && !efectivo(g, 'data_follow_up')).length,
    },
    conformidade: {
      promessas_rentabilidade: analisadas.filter(g => g.analise?.conformidade?.promessa_rentabilidade_garantida === true).length,
      info_financeira_cedo: analisadas.filter(g => g.analise?.conformidade?.informacao_financeira_detalhada_cedo === true).length,
    },
    temperatura,
    evolucao: Object.entries(semanas).sort(([a], [b]) => a.localeCompare(b)).map(([semana, notas]) => ({ semana, nota_media: media(notas), n: notas.length })),
    objeccoes: objeccoes.slice(0, 60),
    chamadas: rows.map(g => ({
      id: g.id, data_chamada: g.data_chamada, investidor_id: g.investidor_id, investidor_nome: g.investidor_nome,
      tipo_chamada: g.tipo_chamada, realizada_por: g.realizada_por, estado: g.estado, nota_sop: g.nota_sop,
      resultado: efectivo(g, 'resultado'), proximo_passo: efectivo(g, 'proximo_passo'), temperatura: efectivo(g, 'temperatura'),
      registo_manual: !!(g.resultado || g.proximo_passo), resumo: g.analise?.resumo || null,
    })),
  }
}

// Leitura de conjunto pelo Claude: o que mudar no script e nos follow-ups.
export async function sinteseChamadasInvestidores(pool, periodo) {
  const rel = await relatorioChamadasInvestidores(pool, periodo)
  if (!rel.totais.analisadas) return { rel, sintese: null }
  const { rows } = await pool.query(
    `SELECT tipo_chamada, data_chamada, nota_sop, analise FROM investidor_gravacoes
     WHERE analise IS NOT NULL AND substr(data_chamada, 1, 10) BETWEEN $1 AND $2
     ORDER BY data_chamada DESC LIMIT 40`,
    [periodo.desde, periodo.ate],
  )
  const chamadas = rows.map(g => ({
    tipo: g.tipo_chamada, data: String(g.data_chamada).slice(0, 10), nota: g.nota_sop,
    resumo: g.analise?.resumo, pontos_fracos: g.analise?.pontos_fracos, objeccoes: g.analise?.objeccoes,
    melhorias_script: g.analise?.melhorias_script, dados_em_falta: g.analise?.dados_recolhidos?.dados_em_falta,
  }))
  const estat = { totais: rel.totais, nota_media: rel.nota_media, passos: rel.passos, conversao: rel.conversao, conformidade: rel.conformidade, temperatura: rel.temperatura }
  const sintese = await claude(`És o director comercial da Somnium Properties. Analisa o conjunto das chamadas a investidores (Cold Call e Follow-up) do período ${periodo.desde} a ${periodo.ate}, avaliadas contra o SOP 4, e diz o que a equipa deve mudar para converter mais investidores em Entrevista Estratégica.

ESTATÍSTICAS DO PERÍODO
${JSON.stringify(estat)}

ANÁLISES DAS CHAMADAS
${JSON.stringify(chamadas)}

Responde APENAS com JSON válido, sem markdown:
{
  "diagnostico": "3-5 frases: onde estamos a falhar e porquê, com base nos números",
  "prioridades": [{ "titulo": "mudança concreta", "porque": "evidência nos dados", "accao": "o que fazer já na próxima chamada" }],
  "objeccoes_frequentes": [{ "objeccao": "objecção agrupada", "frequencia": numero, "melhor_resposta": "resposta recomendada, conforme o SOP 4" }],
  "script_cold_call": { "abertura": "texto a usar", "qualificacao": ["perguntas pela ordem"], "fecho": "texto a usar" },
  "follow_up": ["recomendações concretas para os follow-ups (timing, valor novo, canal)"]
}
No máximo 5 prioridades e 6 objecções. Português de Portugal, directo. Sem promessas de rentabilidade garantida nos textos sugeridos.`, 4000)
  return { rel, sintese }
}
