/**
 * Checklist canónica de documentação por imóvel.
 * Cada slot identifica uma posição na checklist; os ficheiros importados
 * são guardados na coluna fotos do imóvel com folder='documentos' + slot=<key>.
 * Os documentos com slot são anexados ao Dossier de Investimento.
 */

export const CHECKLIST_DOCUMENTACAO = [
  { slot: 'caderneta_predial', titulo: 'Caderneta Predial Urbana', descricao: 'Documento das Finanças com identificação fiscal do imóvel.', obrigatoria: true },
  { slot: 'certidao_permanente', titulo: 'Certidão Permanente do Registo Predial', descricao: 'Comprova titularidade, ónus e encargos.', obrigatoria: true },
  { slot: 'licenca_utilizacao', titulo: 'Licença de Utilização', descricao: 'Emitida pela Câmara Municipal; obrigatória na escritura.', obrigatoria: true },
  { slot: 'ficha_tecnica', titulo: 'Ficha Técnica de Habitação', descricao: 'Características técnicas do imóvel (obrigatória para licenças pós-2004).', obrigatoria: true },
  { slot: 'certificado_energetico', titulo: 'Certificado Energético', descricao: 'Classe energética emitida pela ADENE.', obrigatoria: true },
  { slot: 'planta_imovel', titulo: 'Planta do imóvel', descricao: 'Planta arquitectónica ou cadastral.', obrigatoria: false },
  { slot: 'cpcv', titulo: 'Contrato Promessa Compra e Venda', descricao: 'CPCV assinado entre vendedor e Somnium.', obrigatoria: false },
  { slot: 'id_vendedor', titulo: 'Documento de identificação do vendedor', descricao: 'CC/passaporte e NIF do titular.', obrigatoria: false },
  { slot: 'comprovativo_imi', titulo: 'Comprovativo de IMI', descricao: 'Último comprovativo de pagamento de IMI.', obrigatoria: false },
]

export const CHECKLIST_SLOTS = new Set(CHECKLIST_DOCUMENTACAO.map(c => c.slot))

/**
 * Devolve o ficheiro associado a um slot da checklist (ou null).
 * Pesquisa na lista de docs (que já vem normalizada do useDocumentacao).
 */
export function getDocBySlot(docs, slot) {
  if (!Array.isArray(docs) || !slot) return null
  return docs.find(d => d?.slot === slot) || null
}

/**
 * Sumário: { obrigatoriosOk, obrigatoriosTotal, opcionaisOk, opcionaisTotal }.
 */
export function resumoChecklist(docs) {
  let obrigatoriosOk = 0, obrigatoriosTotal = 0
  let opcionaisOk = 0, opcionaisTotal = 0
  for (const item of CHECKLIST_DOCUMENTACAO) {
    const importado = !!getDocBySlot(docs, item.slot)
    if (item.obrigatoria) {
      obrigatoriosTotal++
      if (importado) obrigatoriosOk++
    } else {
      opcionaisTotal++
      if (importado) opcionaisOk++
    }
  }
  return { obrigatoriosOk, obrigatoriosTotal, opcionaisOk, opcionaisTotal }
}
