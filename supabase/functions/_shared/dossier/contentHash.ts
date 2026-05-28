// Hash SHA-256 do conteudo financeiro do documento — tamper-evidence
// barato. Edicao manual de numeros no PDF nao actualiza o hash; investidor
// pode pedir verificacao server-side se desconfiar.
import crypto from "node:crypto"

const FIELDS = [
  'compra', 'obra', 'vvr',
  'capital_necessario', 'lucro_bruto', 'lucro_liquido',
  'retorno_anualizado', 'moic', 'payback_meses',
  'regime_fiscal', 'meses', 'perc_financiamento', 'modo_obra',
  // Região do imóvel — quando o deal é re-categorizado de Coimbra para AMP
  // (ou vice-versa) o hash deve mudar para invalidar assinaturas antigas
  // que se referiam a um contexto regional diferente.
  'regiao',
]

function num(v: any): string {
  if (v == null) return ''
  const n = parseFloat(v)
  return Number.isFinite(n) ? n.toFixed(2) : ''
}

// Devolve uma string canonica (chaves ordenadas, valores normalizados).
// Numeros: 2 casas decimais. Strings: trim + lower. Ausencia: empty.
function canonicalString(deal: any, version: any): string {
  const parts = []
  for (const k of FIELDS) {
    const v = deal?.[k]
    if (typeof v === 'number' || (!isNaN(parseFloat(v)) && isFinite(v))) {
      parts.push(`${k}=${num(v)}`)
    } else {
      parts.push(`${k}=${(v ?? '').toString().trim().toLowerCase()}`)
    }
  }
  parts.push(`version=${version || 1}`)
  return parts.join('|')
}

export function computeContentHash(deal: any, version: any): string {
  const s = canonicalString(deal, version)
  return crypto.createHash('sha256').update(s).digest('hex')
}

// Versao curta para footer (12 chars) — ainda anti-tampering pratico,
// muito menos espaco visual.
export function shortHash(fullHash: any): string {
  if (!fullHash || typeof fullHash !== 'string') return ''
  return fullHash.slice(0, 12)
}
