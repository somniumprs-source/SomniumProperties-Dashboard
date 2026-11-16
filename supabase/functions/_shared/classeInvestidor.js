// Classificação A–D de investidores (SOP 4 e SOP 23, secção 4.10).
//
// Fonte única da regra: scorecard da discovery call (6 critérios de 0 a 2,
// total de 0 a 12), conversão total → classe, consequência no CRM,
// elegibilidade para apresentação e validação pelos dois CEO.
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
export const AVISO_LEGADO = 'Classe anterior ao SOP 23 – reclassificar na próxima discovery'

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

// ── Validação pelos dois CEO ──────────────────────────────────
// log: [{ por, em, classe, acao: 'validou'|'alterou', motivo? }]. Conta só o
// que veio depois da última alteração: quem altera valida a classe nova e o
// outro CEO tem de a validar outra vez. Definitiva com dois CEO diferentes.
export function estadoValidacao(proposta, log = []) {
  let alvo = proposta || null
  let validadores = []
  for (const e of Array.isArray(log) ? log : []) {
    if (e.acao === 'alterou') { alvo = e.classe; validadores = [e.por] }
    else if (e.classe === alvo && !validadores.includes(e.por)) validadores.push(e.por)
  }
  return { classe: alvo, validadores, alterada: alvo !== proposta, definitiva: !!alvo && validadores.length >= 2 }
}

// Acrescenta a decisão de um CEO ao log. Devolve { log, estado } ou lança.
// decisao: { por, classe, motivo?, follow_up_dias?, motivo_inactivo?, em? }
export function registarValidacao(proposta, log, decisao, ceos = []) {
  if (!proposta) throw new ErroClassificacao('Não há classe proposta para validar')
  const por = String(decisao?.por || '').trim()
  if (!por) throw new ErroClassificacao('Validador desconhecido')
  if (ceos.length && !ceos.includes(por)) throw new ErroClassificacao('Só os dois CEO podem validar a classificação')
  const classe = decisao?.classe || null
  if (!CLASSES[classe]) throw new ErroClassificacao('Classe inválida')
  const antes = estadoValidacao(proposta, log)
  if (antes.definitiva) throw new ErroClassificacao('A classificação já está validada pelos dois CEO')
  const altera = classe !== antes.classe
  const motivo = String(decisao?.motivo || '').trim()
  if (altera && !motivo) throw new ErroClassificacao('Alterar a classe proposta obriga a indicar o motivo')
  if (!altera && antes.validadores.includes(por)) throw new ErroClassificacao('Já validaste esta classe; falta o outro CEO')
  const entrada = { por, em: decisao?.em || new Date().toISOString(), classe, acao: altera ? 'alterou' : 'validou' }
  if (motivo) entrada.motivo = motivo
  const novoLog = [...(Array.isArray(log) ? log : []), entrada]
  const estado = estadoValidacao(proposta, novoLog)
  if (estado.definitiva) {
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
  }
  return { log: novoLog, estado }
}
