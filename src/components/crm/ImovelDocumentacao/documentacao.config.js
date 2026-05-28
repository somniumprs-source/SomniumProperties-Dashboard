/**
 * Configuração da checklist documental por tipo de imóvel.
 * Espelha DOCS_OBRIGATORIOS / DOC_LABELS_LEGAIS em src/db/pdfImovelDocs.js (backend).
 */

export const DOC_LABELS = {
  certidao: 'Certidão Permanente',
  caderneta: 'Caderneta Predial',
  guia_impostos: 'Guia de Impostos IMT/IS',
  licenca: 'Licença de Utilização',
  ficha_tecnica: 'Ficha Técnica de Habitação',
  cert_energetico: 'Certificado Energético',
  cert_condominio: 'Declaração de Condomínio',
}

// Apartamento exige Declaração de Condomínio; moradia não.
export const CHECKLIST = {
  apartamento: [
    { id: 'certidao', label: DOC_LABELS.certidao, obrigatorio: true },
    { id: 'caderneta', label: DOC_LABELS.caderneta, obrigatorio: true },
    { id: 'guia_impostos', label: DOC_LABELS.guia_impostos, obrigatorio: true },
    { id: 'licenca', label: DOC_LABELS.licenca, obrigatorio: true },
    { id: 'ficha_tecnica', label: DOC_LABELS.ficha_tecnica, obrigatorio: true },
    { id: 'cert_energetico', label: DOC_LABELS.cert_energetico, obrigatorio: true },
    { id: 'cert_condominio', label: DOC_LABELS.cert_condominio, obrigatorio: true },
  ],
  moradia: [
    { id: 'certidao', label: DOC_LABELS.certidao, obrigatorio: true },
    { id: 'caderneta', label: DOC_LABELS.caderneta, obrigatorio: true },
    { id: 'guia_impostos', label: DOC_LABELS.guia_impostos, obrigatorio: true },
    { id: 'licenca', label: DOC_LABELS.licenca, obrigatorio: true },
    { id: 'ficha_tecnica', label: DOC_LABELS.ficha_tecnica, obrigatorio: true },
    { id: 'cert_energetico', label: DOC_LABELS.cert_energetico, obrigatorio: true },
  ],
}

// Mapeia o campo predio_tipo/tipologia do imóvel → 'apartamento' | 'moradia' | null (ambíguo).
export function resolveTipo(tipoImovel) {
  const t = String(tipoImovel || '').toLowerCase()
  if (!t.trim()) return null
  if (t.includes('morad')) return 'moradia'
  if (t.includes('apart') || t.includes('frac') || /\bt\d/.test(t) || t.includes('andar')) return 'apartamento'
  return null
}

// Estados visuais (palette Somnium).
export const ESTADOS = {
  pendente: { label: 'Pendente', cor: '#9ca3af', bg: '#f3f4f6' },
  carregado: { label: 'Aguarda análise', cor: '#C9A84C', bg: '#FCF8EC' },
  validado: { label: 'Validado', cor: '#27ae60', bg: '#eafaf0' },
  warning: { label: 'Validado com alertas', cor: '#e67e22', bg: '#fdf2e8' },
  erro: { label: 'Erro / flag crítica', cor: '#c0392b', bg: '#fdecea' },
}

// Converte o campo `valido` da análise (true|false|'warning') no estado visual.
export function estadoFromAnalise(analise) {
  if (!analise) return 'pendente'
  if (analise.valido === true) return 'validado'
  if (analise.valido === 'warning') return 'warning'
  return 'erro'
}

export const SEVERIDADE = {
  critical: { label: 'Crítico', icone: '⛔', cor: '#c0392b', rank: 0 },
  warning: { label: 'Alerta', icone: '⚠️', cor: '#e67e22', rank: 1 },
  info: { label: 'Info', icone: 'ℹ️', cor: '#6b7280', rank: 2 },
}
