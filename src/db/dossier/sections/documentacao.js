import { CHECKLIST_DOCUMENTACAO } from '../../../components/crm/ImovelDocumentacao/checklist.config.js'

/**
 * Página índice da documentação anexada ao Dossier de Investimento.
 * Lista todos os slots da checklist canónica com o estado (anexo ou em falta).
 * As páginas físicas dos PDFs importados são acrescentadas ao ficheiro final
 * por appendDocumentacaoChecklist (pdf-lib) — esta secção é só o índice.
 */
export function renderDocumentacaoChecklist(b, im) {
  let fotos = []
  try { fotos = typeof im.fotos === 'string' ? JSON.parse(im.fotos || '[]') : (im.fotos || []) } catch { fotos = [] }

  const porSlot = new Map()
  for (const f of fotos) if (f?.slot) porSlot.set(f.slot, f)

  b.newPage()
  b.header('DOCUMENTAÇÃO')

  const rows = CHECKLIST_DOCUMENTACAO.map(item => {
    const f = porSlot.get(item.slot)
    const isPdf = f && (/\.pdf$/i.test(f.name || '') || f.type === 'application/pdf')
    const estado = !f
      ? (item.obrigatoria ? 'Em falta (obrigatório)' : 'Em falta')
      : isPdf ? 'Anexo · PDF' : 'Anexo · imagem (apenas listado)'
    return { label: item.titulo, value: estado }
  })

  b.simpleTable(rows)
  b.space(3)
  b.note('Os documentos PDF importados na checklist constam como páginas anexas no fim deste dossier. Documentos em formato de imagem ficam apenas listados aqui; para os anexar contacte a Somnium Properties.')
}
