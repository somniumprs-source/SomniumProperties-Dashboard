// ── Constantes partilhadas ────────────────────────────────────
// Fonte única de verdade para cores, estados, labels e helpers.

// ── Regiões (multi-região: Coimbra vs AMP) ───────────────────
// AMP = Área Metropolitana do Porto (Porto + Gaia).
// Cada entidade (imovel, investidor, consultor, negocio, despesa) pertence a UMA
// região. Investidores podem ter múltiplas regiões preferidas (array em JSON).
export const REGIOES = ['Coimbra', 'AMP']

export const REGIAO_LABEL = {
  Coimbra: 'Coimbra',
  AMP: 'Área Metropolitana do Porto',
}

export const REGIAO_LABEL_CURTA = {
  Coimbra: 'Coimbra',
  AMP: 'AMP',
}

export const REGIAO_COR = {
  Coimbra: '#C9A84C',
  AMP: '#1f6feb',
}

export const CONCELHOS_POR_REGIAO = {
  Coimbra: ['Coimbra', 'Condeixa-a-Nova', 'Mealhada', 'Cantanhede', 'Montemor-o-Velho', 'Penacova', 'Miranda do Corvo', 'Lousã'],
  AMP: ['Porto', 'Vila Nova de Gaia', 'Santa Maria da Feira'],
}

export function concelhosDe(regiao) {
  return CONCELHOS_POR_REGIAO[regiao] || []
}

export function isRegiaoValida(r) {
  return REGIOES.includes(r)
}

// ── Formatadores ─────────────────────────────────────────────
export const EUR = v => {
  if (v === null || v === undefined) return '—'
  return new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(v)
}
export const EUR2 = v => new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v ?? 0)
export const PCT = v => v == null ? '—' : `${Number(v).toFixed(1)}%`
export const DAYS = v => v == null ? '—' : `${Number(v).toFixed(0)}d`
export const NUM = v => v == null ? '—' : String(v)
export const RATIO = v => v == null ? '—' : `${Number(v).toFixed(1)}:1`

// ── Status helper ────────────────────────────────────────────
export function statusColor(value, meta, higherIsBetter = true) {
  if (value === null || value === undefined || meta === undefined) return 'yellow'
  const ratio = value / meta
  if (higherIsBetter) return ratio >= 0.9 ? 'green' : ratio >= 0.7 ? 'yellow' : 'red'
  return ratio <= 1.1 ? 'green' : ratio <= 1.3 ? 'yellow' : 'red'
}

// ── Pipeline Imóveis — Estados ───────────────────────────────
export const IMOVEL_ESTADOS = [
  'Adicionado', 'Pendentes', 'Em Análise', 'Visita Marcada', 'Follow UP',
  'Estudo de VVR', 'Enviar proposta ao investidor',
  'Wholesaling', 'Negócio em Curso',
  'Nao interessa', 'Descartado',
]

export const IMOVEL_ESTADO_COLOR = {
  'Adicionado':                     'bg-gray-100 text-gray-600',
  'Chamada Não Atendida':           'bg-gray-100 text-gray-600',
  'Pendentes':                      'bg-gray-100 text-gray-600',
  'Pré-aprovação':                  'bg-amber-100 text-amber-700',
  'Necessidade de Visita':          'bg-blue-100 text-blue-700',
  'Visita Marcada':                 'bg-indigo-100 text-indigo-700',
  'Follow UP':                      'bg-yellow-100 text-yellow-700',
  'Estudo de VVR':                  'bg-purple-100 text-purple-700',
  'Criar Proposta ao Proprietário': 'bg-cyan-100 text-cyan-700',
  'Enviar proposta ao Proprietário':'bg-cyan-100 text-cyan-700',
  'Em negociação':                  'bg-orange-100 text-orange-700',
  'Proposta aceite':                'bg-amber-100 text-amber-700',
  'Enviar proposta ao investidor':  'bg-teal-100 text-teal-700',
  'Follow Up após proposta':        'bg-yellow-100 text-yellow-700',
  'Wholesaling':                    'bg-green-100 text-green-700',
  'CAEP':                           'bg-green-100 text-green-700',
  'Fix and Flip':                   'bg-green-100 text-green-700',
  'Não interessa':                  'bg-red-100 text-red-700',
  'Nao interessa':                  'bg-red-100 text-red-700',
  'Descartado':                     'bg-red-100 text-red-700',
}

// ── Investidores — Status ────────────────────────────────────
// Pipeline Passivo (capital em CAEP/Wholesaling — não opera deals)
export const INV_STATUS_PASSIVO = [
  'Pendente de Aprovação', 'Potencial Investidor', 'Marcar call', 'Call marcada',
  'Follow Up', 'Investidor Qualificado em Carteira', 'Investidor em parceria',
  'Não qualificado', 'Inactivo',
]

// Pipeline Activo (compra deals connosco)
export const INV_STATUS_ATIVO = [
  'Pendente de Aprovação', 'Potencial Investidor', 'Marcar call', 'Call marcada',
  'Follow Up', 'Investidor Qualificado em Carteira', 'Negociação de Deal', 'Investidor Ativo',
  'Não qualificado', 'Inactivo',
]

// União usada para filtros gerais. Mantida como `INV_STATUS` por compatibilidade.
export const INV_STATUS = [...new Set([...INV_STATUS_PASSIVO, ...INV_STATUS_ATIVO])]

// Devolve a lista de estados aplicável conforme o tipo_principal — que é
// multi-valor (ex: '["Ativo","Passivo"]'), um investidor pode ser os dois em
// simultâneo. Aceita string simples (legado) ou array/JSON array.
export function invStatusFor(tipo) {
  let tipos = tipo
  if (typeof tipo === 'string') {
    try { tipos = JSON.parse(tipo) } catch { tipos = [tipo] }
  }
  if (!Array.isArray(tipos)) tipos = [tipos].filter(Boolean)
  const temAtivo = tipos.includes('Ativo')
  const temPassivo = tipos.includes('Passivo') || tipos.length === 0
  if (temAtivo && temPassivo) return INV_STATUS
  return temAtivo ? INV_STATUS_ATIVO : INV_STATUS_PASSIVO
}

export const INV_STATUS_COLOR = {
  'Pendente de Aprovação':              'bg-amber-100 text-amber-700',
  'Potencial Investidor':               'bg-gray-100 text-gray-600',
  'Marcar call':                        'bg-yellow-100 text-yellow-700',
  'Call marcada':                       'bg-blue-100 text-blue-700',
  'Follow Up':                          'bg-orange-100 text-orange-700',
  'Investidor Qualificado em Carteira': 'bg-indigo-100 text-indigo-700',
  'Investidor em parceria':             'bg-green-100 text-green-700',
  'Negociação de Deal':                 'bg-purple-100 text-purple-700',
  'Investidor Ativo':                  'bg-green-100 text-green-700',
  'Não qualificado':                    'bg-red-100 text-red-700',
  'Inactivo':                           'bg-gray-100 text-gray-500',
}

// ── Consultores — Estatutos ──────────────────────────────────
export const CONS_ESTATUTOS = [
  'Cold Call', 'Follow up', 'Aberto Parcerias',
  'Acesso imoveis Off market', 'Consultores em Parceria',
]

export const CONS_ESTATUTO_COLOR = {
  'Cold Call':                  'bg-gray-100 text-gray-600',
  'Follow up':                  'bg-blue-100 text-blue-700',
  'Aberto Parcerias':           'bg-yellow-100 text-yellow-700',
  'Acesso imoveis Off market':  'bg-purple-100 text-purple-700',
  'Consultores em Parceria':    'bg-green-100 text-green-700',
}

// ── Consultores — Estado de Avaliação ────────────────────────
export const CONS_ESTADO_AVALIACAO = ['Em avaliação', 'Ativo', 'Inativo']

export const CONS_ESTADO_AVALIACAO_COLOR = {
  'Em avaliação': 'bg-yellow-100 text-yellow-700',
  'Ativo':        'bg-green-100 text-green-700',
  'Inativo':      'bg-gray-100 text-gray-600',
}

// ── Negócios — Categorias e Fases ────────────────────────────
export const NEG_CATEGORIAS = ['Wholesalling', 'CAEP', 'Mediação Imobiliária', 'Fix and Flip']
export const NEG_FASES = ['Fase de obras', 'Fase de venda', 'Vendido']

export const NEG_CAT_COLOR = {
  'Wholesalling':         'bg-indigo-100 text-indigo-700',
  'CAEP':                 'bg-yellow-100 text-yellow-700',
  'Mediação Imobiliária': 'bg-green-100 text-green-700',
  'Fix and Flip':         'bg-red-100 text-red-700',
}

export const NEG_FASE_COLOR = {
  'Fase de obras': 'bg-blue-100 text-blue-700',
  'Fase de venda': 'bg-yellow-100 text-yellow-700',
  'Vendido':       'bg-green-100 text-green-700',
}

// ── Despesas — Timing ────────────────────────────────────────
export const DESP_TIMING = ['Mensalmente', 'Anual', 'Único']
export const DESP_TIMING_COLOR = {
  'Mensalmente': 'bg-blue-100 text-blue-700',
  'Anual':       'bg-purple-100 text-purple-700',
  'Único':       'bg-gray-100 text-gray-600',
}

// ── Classificação ────────────────────────────────────────────
export const CLASS_COLOR = { A: 'bg-green-500', B: 'bg-blue-500', C: 'bg-yellow-500', D: 'bg-red-500' }

// ── Origens ──────────────────────────────────────────────────
export const ORIGENS_IMOVEIS = ['Idealista', 'Imovirtual', 'Supercasa', 'Consultor', 'Referência', 'Outro']
export const ORIGENS_INVESTIDORES = ['Landing Page', 'Skool', 'Grupos Whatsapp', 'Referenciação', 'LinkedIn', 'Eventos Networking', 'Outro']
export const MODELOS_NEGOCIO = ['Wholesaling', 'Fix & Flip', 'CAEP', 'Mediação']

// ── Despesas — Categorias ────────────────────────────────────
export const DESP_CATEGORIAS = [
  'Material Somnium', 'Deslocações', 'Refeições', 'Comissões Imobiliárias',
  'Referências', 'Minuta CPCV', 'Minutas CAEP', 'Contabilista', 'Ferramentas', 'Subscrição Skool',
]

// ── Badge helper ─────────────────────────────────────────────
export function cleanLabel(text) {
  return (text ?? '').replace(/^\d+-/, '').trim()
}

// ── Formatar data ISO → DD/MM/YYYY ──────────────────────────
export function fmtDate(iso) {
  if (!iso) return '—'
  const [y, m, d] = iso.slice(0, 10).split('-')
  return `${d}/${m}/${y}`
}

// ── Formatar data relativa ("há 3 dias") ─────────────────────
export function fmtDateRelative(iso) {
  if (!iso) return '—'
  const diff = Math.floor((Date.now() - new Date(iso)) / 86400000)
  if (diff === 0) return 'Hoje'
  if (diff === 1) return 'Ontem'
  if (diff < 7) return `Há ${diff} dias`
  if (diff < 30) return `Há ${Math.floor(diff / 7)} sem.`
  return fmtDate(iso)
}

// ── SOP 2 — Avaliação de Calls (Cold/Discovery/Close Call + Pivot Parceria) ──
export const TIPOS_CHAMADA = ['cold_call', 'discovery_call', 'close_call', 'pivot_parceria']

export const TIPO_CHAMADA_LABEL = {
  cold_call: 'Cold Call',
  discovery_call: 'Discovery Call',
  close_call: 'Close Call',
  pivot_parceria: 'Pivot para Parceria',
}

export const TIPO_CHAMADA_COLOR = {
  cold_call: 'bg-gray-100 text-gray-600',
  discovery_call: 'bg-yellow-100 text-yellow-700',
  close_call: 'bg-gray-800 text-white',
  pivot_parceria: 'bg-purple-100 text-purple-700',
}

export const CC_RESULTADOS = ['atendeu', 'nao_atendeu', 'recusou', 'numero_errado']
export const CC_RESULTADO_LABEL = {
  atendeu: 'Atendeu', nao_atendeu: 'Não atendeu', recusou: 'Recusou', numero_errado: 'Número errado',
}
export const SIM_NAO_NP = ['sim', 'nao', 'nao_perguntado']
export const SIM_NAO_NP_LABEL = { sim: 'Sim', nao: 'Não', nao_perguntado: 'Não chegou a perguntar-se' }

// Discovery Call — scorecard de qualificação 0-12 (6 critérios x 0-2)
export const DC_CRITERIOS = [
  { key: 'dc_score_objetivo', notaKey: 'dc_notas_objetivo', label: 'Objectivo' },
  { key: 'dc_score_motivo_real', notaKey: 'dc_notas_motivo_real', label: 'Motivo Real' },
  { key: 'dc_score_dor_desafio', notaKey: 'dc_notas_dor_desafio', label: 'Dor / Desafio' },
  { key: 'dc_score_impacto', notaKey: 'dc_notas_impacto', label: 'Impacto' },
  { key: 'dc_score_urgencia', notaKey: 'dc_notas_urgencia', label: 'Urgência' },
  { key: 'dc_score_tentativas_anteriores', notaKey: 'dc_notas_tentativas_anteriores', label: 'Tentativas Anteriores' },
]

// Bandas de decisão do scorecard (SOP 2, Secção 4).
export function bandaScorecard(total) {
  if (total == null) return null
  if (total <= 7) return { label: 'Aprofundar', cls: 'bg-red-100 text-red-700' }
  if (total <= 10) return { label: 'Avançar com atenção', cls: 'bg-amber-100 text-amber-700' }
  return { label: 'Avançar com confiança', cls: 'bg-green-100 text-green-700' }
}

export const CL_RESULTADOS = ['aceite', 'recusa_definitiva', 'vou_pensar_com_data', 'vou_pensar_sem_data']
export const CL_RESULTADO_LABEL = {
  aceite: 'Aceite', recusa_definitiva: 'Recusa definitiva',
  vou_pensar_com_data: '"Vou pensar" (com data)', vou_pensar_sem_data: '"Vou pensar" (sem data)',
}
export const CL_RESULTADO_COLOR = {
  aceite: 'bg-green-100 text-green-700',
  recusa_definitiva: 'bg-red-100 text-red-700',
  vou_pensar_com_data: 'bg-amber-100 text-amber-700',
  vou_pensar_sem_data: 'bg-red-100 text-red-700', // SOP2: resultado fraco/inválido, nao so "a aguardar"
}

// Rótulo humano de cada coluna do registo manual (usado na sugestão da IA e em
// qualquer listagem genérica dos campos SOP2).
export const REGISTO_FIELD_LABEL = {
  cc_resultado: 'Resultado', cc_aceita_negociar: 'Aceita negociar',
  dc_score_objetivo: 'Objectivo', dc_score_motivo_real: 'Motivo Real', dc_score_dor_desafio: 'Dor / Desafio',
  dc_score_impacto: 'Impacto', dc_score_urgencia: 'Urgência', dc_score_tentativas_anteriores: 'Tentativas Anteriores',
  dc_notas_objetivo: 'Justificação — Objectivo', dc_notas_motivo_real: 'Justificação — Motivo Real',
  dc_notas_dor_desafio: 'Justificação — Dor / Desafio', dc_notas_impacto: 'Justificação — Impacto',
  dc_notas_urgencia: 'Justificação — Urgência', dc_notas_tentativas_anteriores: 'Justificação — Tentativas Anteriores',
  dc_onus_verificado: 'Ónus/hipotecas verificado', dc_direito_preferencia_esclarecido: 'Direito de preferência esclarecido',
  cl_resultado: 'Resultado', cl_valor_ancora: 'Valor de âncora', cl_valor_contraproposta: 'Contra-proposta',
  cl_deadline: 'Deadline', cl_formalizado_escrito_mesmo_dia: 'Formalizado por escrito',
  pp_compromisso_confirmado: 'Compromisso confirmado', pp_criterios_pesquisa_enviados: 'Critérios enviados', pp_negocios_fechados: 'Negócios já fechados',
}

// Formata o valor de um campo do registo manual para leitura humana (usa os
// mapas de enum acima quando existem; booleanos como Sim/Não; resto em bruto).
export function fmtRegistoValor(key, v) {
  if (v === null || v === undefined || v === '') return '—'
  if (typeof v === 'boolean') return v ? 'Sim' : 'Não'
  if (key === 'cc_resultado') return CC_RESULTADO_LABEL[v] || v
  if (key === 'cc_aceita_negociar') return SIM_NAO_NP_LABEL[v] || v
  if (key === 'cl_resultado') return CL_RESULTADO_LABEL[v] || v
  if (key === 'cl_valor_ancora' || key === 'cl_valor_contraproposta') return EUR(Number(v))
  if (key === 'cl_deadline') return fmtDate(v)
  if (key.startsWith('dc_score_')) return `${v}/2`
  return String(v)
}

// Campos manuais (colunas do registo) por tipo de chamada, na ordem a mostrar.
export const CAMPOS_POR_TIPO = {
  cold_call: ['cc_resultado', 'cc_aceita_negociar'],
  discovery_call: ['dc_onus_verificado', 'dc_direito_preferencia_esclarecido'],
  close_call: ['cl_resultado', 'cl_valor_ancora', 'cl_valor_contraproposta', 'cl_deadline', 'cl_formalizado_escrito_mesmo_dia'],
  pivot_parceria: ['pp_compromisso_confirmado', 'pp_criterios_pesquisa_enviados', 'pp_negocios_fechados'],
}

// Uma chamada real cobre muitas vezes mais do que uma fase (ex: cold call que
// passa logo a discovery na mesma conversa) — por isso uma linha nao tem um
// "tipo" unico: verificamos directamente que campos ficaram preenchidos.
export function temDiscovery(g) {
  return DC_CRITERIOS.some(c => g[c.key] != null) || g.dc_onus_verificado != null || g.dc_direito_preferencia_esclarecido != null
}
export function temPivot(g) {
  return g.pp_compromisso_confirmado != null || g.pp_criterios_pesquisa_enviados != null || g.pp_negocios_fechados != null
}

// Fases cobertas por uma chamada (para mostrar 1+ badges por linha).
export function estagiosCobertos(g) {
  const out = []
  if (g.cc_resultado) out.push('cold_call')
  if (temDiscovery(g)) out.push('discovery_call')
  if (g.cl_resultado) out.push('close_call')
  if (temPivot(g)) out.push('pivot_parceria')
  return out
}

// Resumo de uma linha (uma chamada) para leitura rápida em tabela — concatena
// o resultado de todas as fases preenchidas nesta chamada.
export function resultadoResumo(g) {
  const partes = []
  if (g.cc_resultado) partes.push(CC_RESULTADO_LABEL[g.cc_resultado] || g.cc_resultado)
  if (g.dc_pontuacao_total != null) partes.push(`${g.dc_pontuacao_total}/12`)
  if (g.cl_resultado) partes.push(CL_RESULTADO_LABEL[g.cl_resultado] || g.cl_resultado)
  if (g.pp_compromisso_confirmado) partes.push('Compromisso confirmado')
  return partes.length ? partes.join(' · ') : '—'
}
