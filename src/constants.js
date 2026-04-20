// ── Constantes partilhadas ────────────────────────────────────
// Fonte única de verdade para cores, estados, labels e helpers.

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
export const INV_STATUS = [
  'Potencial Investidor', 'Marcar call', 'Call marcada',
  'Follow Up', 'Investidor em espera', 'Investidor em parceria',
]

export const INV_STATUS_COLOR = {
  'Potencial Investidor':    'bg-gray-100 text-gray-600',
  'Marcar call':             'bg-yellow-100 text-yellow-700',
  'Call marcada':            'bg-blue-100 text-blue-700',
  'Follow Up':               'bg-orange-100 text-orange-700',
  'Investidor em espera': 'bg-indigo-100 text-indigo-700',
  'Investidor em parceria':  'bg-green-100 text-green-700',
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
export const ORIGENS_INVESTIDORES = ['Skool', 'Grupos Whatsapp', 'Referenciação', 'LinkedIn', 'Outro']
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
