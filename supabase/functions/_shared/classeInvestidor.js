// Classificação A–D de investidores (SOP 4 e SOP 23 v2.1, secções 4.10 e 4.11).
//
// Fonte única da regra: scorecard de qualificação (6 critérios de 0 a 2,
// total de 0 a 12), conversão total → classe, elegibilidade para apresentação
// e apresentações a desmarcar.
// Decisão de 17/11/2026 (Alexandre Mendes): a classe é AUTOMÁTICA. Cada
// contacto analisado (call gravada ou reunião, incluindo videochamadas
// gravadas) atualiza os critérios sobre os quais houve prova; com os 6
// critérios a classe fica definida logo, sem validação pelo outro CEO, e pode
// mudar no contacto seguinte (histórico em classificacao_historico).
// Só funções puras, sem BD nem dependências: importado tal e qual pelo
// frontend (Vite), pelo Express de dev (src/db/routes.js) e pelas Edge
// Functions (Deno). Testes: `npm run test:classe`.
//
// NÃO repetir limiares noutros ficheiros: importar daqui.

export const CRITERIOS_DISCOVERY = [
  { chave: 'capital', label: 'Capital', niveis: ['Depende de algo sem data', 'Disponível em breve, com data', 'Disponível hoje'] },
  { chave: 'via', label: 'Via', niveis: ['Indefinida', 'Escolhida, mas os sinais não batem', 'Clara e coerente com os sinais'] },
  { chave: 'objetivo', label: 'Objetivo', niveis: ['Vago', 'Concreto, sem prazo', 'Concreto e com prazo'] },
  { chave: 'urgencia', label: 'Urgência', niveis: ['Nenhuma', 'Alguma, sem gatilho', 'Gatilho concreto identificado'] },
  { chave: 'experiencia', label: 'Experiência e confiança', niveis: ['Nenhuma e desconfiado', 'Pouca, mas aberto', 'Já investiu ou confia no processo'] },
  { chave: 'decisor', label: 'Decisor', niveis: ['Ausente', 'Partilhado, mas não esteve', 'Decide sozinho ou estava presente'] },
]
export const CHAVES_DISCOVERY = CRITERIOS_DISCOVERY.map((c) => c.chave)
export const PONTUACAO_MAX_DISCOVERY = CRITERIOS_DISCOVERY.length * 2

export const CLASSES = {
  A: { label: 'Prioritário', min: 11, max: 12, apresentavel: true, consequencia: 'Pode ser apresentado; primeiro na partilha de oportunidades' },
  B: { label: 'Elegível', min: 9, max: 10, apresentavel: true, consequencia: 'Pode ser apresentado' },
  C: { label: 'Observação', min: 7, max: 8, apresentavel: false, consequencia: 'Não é apresentado; vai para Follow Up (30, 60 ou 90 dias)' },
  D: { label: 'Não Elegível', min: 0, max: 6, apresentavel: false, consequencia: 'Não é apresentado; vai para Inactivo, com motivo' },
}

// Status para onde o investidor vai depois de a classe ficar definitiva.
export const STATUS_APOS_VALIDACAO = { A: 'Investidor Qualificado em Carteira', B: 'Investidor Qualificado em Carteira', C: 'Follow Up', D: 'Inactivo' }
export const STATUS_CLASSE_PROPOSTA = 'Pendente de Aprovação'
export const DIAS_FOLLOW_UP_C = [30, 60, 90]

export const ORIGEM_LEGADO = 'legado'
export const ORIGEM_DISCOVERY = 'discovery'
export const AVISO_LEGADO = 'Classe anterior ao SOP 23 – reclassificar'

export class ErroClassificacao extends Error {}

// Aceita só 0, 1 ou 2 (também em texto). Vazio → null (critério em falta).
export function normalizarNota(v, chave = 'critério') {
  if (v === null || v === undefined || v === '') return null
  const n = typeof v === 'string' ? Number(v.trim()) : v
  if (!Number.isInteger(n) || n < 0 || n > 2) throw new ErroClassificacao(`${chave}: nota inválida (${v}); só 0, 1 ou 2`)
  return n
}

export function classeDoTotal(total) {
  if (!Number.isInteger(total) || total < 0 || total > PONTUACAO_MAX_DISCOVERY) throw new ErroClassificacao(`Total inválido: ${total}`)
  for (const [classe, def] of Object.entries(CLASSES)) if (total >= def.min && total <= def.max) return classe
  throw new ErroClassificacao(`Total sem classe: ${total}`)
}

// notas: { capital: 0..2, ... } ou { capital: { nota: 0..2, ... }, ... }.
// Devolve { notas, total, classe, em_falta }. Com algum critério em falta,
// total e classe ficam null. Nota fora de 0..2 lança ErroClassificacao.
export function calcularClasseDiscovery(notas = {}) {
  const limpas = {}
  const emFalta = []
  for (const k of CHAVES_DISCOVERY) {
    const bruto = notas?.[k]
    const valor = bruto && typeof bruto === 'object' ? bruto.nota : bruto
    const n = normalizarNota(valor, k)
    limpas[k] = n
    if (n === null) emFalta.push(k)
  }
  if (emFalta.length) return { notas: limpas, total: null, classe: null, em_falta: emFalta }
  const total = CHAVES_DISCOVERY.reduce((s, k) => s + limpas[k], 0)
  return { notas: limpas, total, classe: classeDoTotal(total), em_falta: [] }
}

// Pode ser apresentado a oportunidades? Só A ou B com classe definitiva.
// Classe legada (anterior ao SOP 23) continua a valer até à reclassificação
// (decisão de 16/11/2026). Classe em validação não é apresentada.
export function podeSerApresentado(inv) {
  if (!inv || !['A', 'B'].includes(inv.classificacao)) return false
  if (inv.classificacao_estado === 'proposta') return false
  if (inv.classificacao_origem === ORIGEM_DISCOVERY) return inv.classificacao_estado === 'validada'
  return true
}

export const ehLegado = (inv) => inv?.classificacao_origem === ORIGEM_LEGADO

// ── Validação pelo outro CEO (SOP 23 v2.1, 4.10 e 4.11) ──────
// Quem conduz a discovery propõe; um CEO diferente de quem propôs valida, em
// 24 horas. Uma validação basta para a classe ficar definitiva.
export const PRAZO_VALIDACAO_HORAS = 24

// decisao: { por, classe, motivo?, follow_up_dias?, motivo_inactivo?, em? }
// Devolve a entrada a registar ou lança ErroClassificacao.
export function validarDecisao({ proposta, propostaPor, decisao, ceos = [] }) {
  if (!proposta) throw new ErroClassificacao('Não há classe proposta para validar')
  const por = String(decisao?.por || '').trim()
  if (!por) throw new ErroClassificacao('Validador desconhecido')
  if (ceos.length && !ceos.includes(por)) throw new ErroClassificacao('Só os CEO podem validar a classificação')
  if (propostaPor && por === propostaPor) throw new ErroClassificacao('Quem propôs a classe não a pode validar: tem de ser o outro CEO')
  const classe = decisao?.classe || proposta
  if (!CLASSES[classe]) throw new ErroClassificacao('Classe inválida')
  const alterada = classe !== proposta
  const motivo = String(decisao?.motivo || '').trim()
  if (alterada && !motivo) throw new ErroClassificacao('Alterar a classe proposta obriga a indicar o motivo')
  const entrada = { por, em: decisao?.em || new Date().toISOString(), classe, proposta, alterada }
  if (alterada) entrada.motivo = motivo
  if (classe === 'C') {
    const dias = Number(decisao?.follow_up_dias)
    if (!DIAS_FOLLOW_UP_C.includes(dias)) throw new ErroClassificacao('Classe C: escolhe o follow-up a 30, 60 ou 90 dias')
    entrada.follow_up_dias = dias
  }
  if (classe === 'D') {
    const m = String(decisao?.motivo_inactivo || '').trim()
    if (!m) throw new ErroClassificacao('Classe D: indica o motivo para passar a Inactivo')
    entrada.motivo_inactivo = m
  }
  return entrada
}

// Classe por validar há mais de 24 horas (destaque no dashboard).
export function validacaoAtrasada(inv, agora = new Date(), horas = PRAZO_VALIDACAO_HORAS) {
  if (inv?.classificacao_estado !== 'proposta' || !inv.classificacao_proposta_em) return false
  return new Date(agora).getTime() - new Date(inv.classificacao_proposta_em).getTime() > horas * 3600000
}

// ── Apresentação marcada (SOP 23, 4.11) ───────────────────────
// Marcada = ficha com data_apresentacao_negocio preenchida, ou tarefa aberta
// "Apresentação negócio <nome do investidor>".
const semAcentos = (t) => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()
const ESTADOS_TAREFA_FECHADA = new Set(['concluida', 'cancelada'])

export function ehTarefaApresentacao(tarefa, nomeInvestidor) {
  const t = semAcentos(tarefa?.tarefa ?? tarefa)
  const nome = semAcentos(nomeInvestidor)
  return !!nome && t.startsWith('apresentacao negocio') && t.includes(nome)
}

export function temApresentacaoMarcada(inv, tarefas = []) {
  if (String(inv?.data_apresentacao_negocio || '').trim()) return true
  return tarefas.some((t) => !ESTADOS_TAREFA_FECHADA.has(semAcentos(t.status)) && !t.arquivada && ehTarefaApresentacao(t, inv?.nome))
}

// Validação baixou para C ou D e há apresentação marcada: quem conduziu a
// discovery tem de a desmarcar.
export function precisaDesmarcarApresentacao(inv, tarefas = []) {
  return inv?.classificacao_origem === ORIGEM_DISCOVERY && inv?.classificacao_estado === 'validada'
    && ['C', 'D'].includes(inv.classificacao) && temApresentacaoMarcada(inv, tarefas)
}

// Scorecard pontuado à mão antes da call (SOP 23, 3.5 e 4.10): uma linha por critério.
export function linhasScorecardMao(lista) {
  const ROTULO_CRITERIO = Object.fromEntries(CRITERIOS_DISCOVERY.map(c => [c.chave, c.label]))
  const arr = Array.isArray(lista) ? lista : []
  const notas = arr.map(x => x?.nota).filter(n => n !== null && n !== undefined && Number.isFinite(Number(n))).map(Number)
  const linhas = arr.map(x => `${ROTULO_CRITERIO[x?.criterio] || x?.criterio}: ${x?.nota === null || x?.nota === undefined ? 'em branco (perguntar)' : `${x.nota}/2`}${x?.porque ? `. ${x.porque}` : ''}`)
  if (notas.length) linhas.push(`Total parcial: ${notas.reduce((s, n) => s + n, 0)}/${notas.length * 2} (${arr.length - notas.length} critério(s) em branco)`)
  return linhas
}

// ── Scorecard acumulado entre contactos (classificação automática) ──
// anterior: scorecard gravado { capital: { nota, data, ... }, ... }.
// novas: notas deste contacto { capital: { nota, evidencia, minuto } | nota | null }.
// fonte: { data: 'YYYY-MM-DD', tipo: 'gravacao'|'reuniao'|'manual', id, descricao }.
// Um critério só muda com prova neste contacto (nota não nula) e se o contacto
// não for mais antigo do que a prova que já lá está. Devolve o scorecard novo e
// a lista dos critérios que mudaram.
export function fundirScorecard(anterior = {}, novas = {}, fonte = {}) {
  const base = anterior && typeof anterior === 'object' ? anterior : {}
  const out = {}
  const alterados = []
  const data = String(fonte.data || '').slice(0, 10) || null
  for (const k of CHAVES_DISCOVERY) {
    const ant = base[k] && typeof base[k] === 'object' ? base[k] : (base[k] != null ? { nota: base[k] } : null)
    const bruto = novas?.[k]
    const valor = bruto && typeof bruto === 'object' ? bruto.nota : bruto
    let n = null
    try { n = normalizarNota(valor, k) } catch { n = null }
    const antData = ant?.data ? String(ant.data).slice(0, 10) : null
    const maisRecente = !antData || !data || data >= antData
    if (n !== null && maisRecente) {
      out[k] = {
        nota: n, origem: fonte.tipo === 'manual' ? 'manual' : 'ia', data,
        evidencia: (bruto && typeof bruto === 'object' && bruto.evidencia) || null,
        minuto: (bruto && typeof bruto === 'object' && bruto.minuto) || null,
        fonte: fonte.descricao || null, fonte_tipo: fonte.tipo || null, fonte_id: fonte.id || null,
      }
      if (!ant || ant.nota !== n) alterados.push(k)
    } else if (ant) out[k] = ant
  }
  return { scorecard: out, alterados }
}
