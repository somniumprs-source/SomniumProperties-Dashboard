/**
 * Checklist canónica de documentação por imóvel.
 * Cada slot identifica uma posição na checklist; os ficheiros importados
 * são guardados na coluna fotos do imóvel com folder='documentos' + slot=<key>.
 * Os documentos com slot são anexados ao Dossier de Investimento.
 */

export const CHECKLIST_DOCUMENTACAO = [
  { slot: 'caderneta_predial', titulo: 'Caderneta Predial Urbana', descricao: 'Documento das Finanças com identificação fiscal do imóvel.' },
  { slot: 'certidao_permanente', titulo: 'Certidão Permanente do Registo Predial', descricao: 'Comprova titularidade, ónus e encargos.' },
  { slot: 'licenca_utilizacao', titulo: 'Licença de Utilização', descricao: 'Emitida pela Câmara Municipal; obrigatória na escritura.' },
  { slot: 'ficha_tecnica', titulo: 'Ficha Técnica de Habitação', descricao: 'Características técnicas do imóvel.' },
  { slot: 'certificado_energetico', titulo: 'Certificado Energético', descricao: 'Classe energética emitida pela ADENE.' },
  { slot: 'planta_imovel', titulo: 'Planta do imóvel', descricao: 'Planta arquitectónica ou cadastral.' },
  { slot: 'cpcv', titulo: 'Contrato Promessa Compra e Venda', descricao: 'CPCV assinado entre vendedor e Somnium.' },
  { slot: 'id_vendedor', titulo: 'Documento de identificação do vendedor', descricao: 'CC/passaporte e NIF do titular.' },
  { slot: 'comprovativo_imi', titulo: 'Comprovativo de IMI', descricao: 'Último comprovativo de pagamento de IMI.' },
]

export const CHECKLIST_SLOTS = new Set(CHECKLIST_DOCUMENTACAO.map(c => c.slot))

/**
 * Devolve todos os ficheiros associados a um slot da checklist,
 * ordenados por uploaded_at ascendente (histórico cronológico).
 */
export function getDocsBySlot(docs, slot) {
  if (!Array.isArray(docs) || !slot) return []
  return docs
    .filter(d => d?.slot === slot)
    .sort((a, b) => {
      const ta = a?.uploaded_at ? Date.parse(a.uploaded_at) : 0
      const tb = b?.uploaded_at ? Date.parse(b.uploaded_at) : 0
      return ta - tb
    })
}

/**
 * Devolve o primeiro ficheiro associado a um slot da checklist (ou null).
 * Mantido por compatibilidade com consumidores que tratam o slot como único.
 */
export function getDocBySlot(docs, slot) {
  return getDocsBySlot(docs, slot)[0] || null
}

/**
 * Sumário: { importados, total }. Conta slots com pelo menos 1 ficheiro.
 */
export function resumoChecklist(docs) {
  let importados = 0
  for (const item of CHECKLIST_DOCUMENTACAO) {
    if (getDocBySlot(docs, item.slot)) importados++
  }
  return { importados, total: CHECKLIST_DOCUMENTACAO.length }
}

export function getDocsChecklist(docs) {
  if (!Array.isArray(docs)) return []
  return docs.filter(d => d?.slot && CHECKLIST_SLOTS.has(d.slot))
}

export function getDocsOutros(docs) {
  if (!Array.isArray(docs)) return []
  return docs.filter(d => !d?.slot || !CHECKLIST_SLOTS.has(d.slot))
}
