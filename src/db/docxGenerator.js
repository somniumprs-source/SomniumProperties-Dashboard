/**
 * DOCX Generator — gera versao Word dos documentos do CRM.
 * Reutiliza os dados dos geradores PDF mas gera formato .docx.
 */
import { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, AlignmentType, BorderStyle, HeadingLevel, PageBreak } from 'docx'
import pool from './pg.js'

const BRAND = { gold: 'C9A84C', dark: '0D0D0D', body: '2A2A2A', muted: '888888' }
const EUR = v => v == null ? '—' : `${Number(v).toLocaleString('pt-PT', { minimumFractionDigits: 0 })} €`
const PCT = v => v == null ? '—' : `${(Number(v) * 100).toFixed(1)}%`
const FDATE = v => v ? new Date(v).toLocaleDateString('pt-PT') : '—'

function brandTitle(text) {
  return new Paragraph({
    children: [new TextRun({ text, bold: true, size: 32, color: BRAND.dark, font: 'Calibri' })],
    spacing: { after: 200 },
  })
}

function brandSubtitle(text) {
  return new Paragraph({
    children: [new TextRun({ text, size: 20, color: BRAND.muted, font: 'Calibri' })],
    spacing: { after: 300 },
  })
}

function sectionHeader(text) {
  return new Paragraph({
    children: [new TextRun({ text: text.toUpperCase(), bold: true, size: 22, color: BRAND.gold, font: 'Calibri' })],
    spacing: { before: 400, after: 200 },
    border: { bottom: { color: BRAND.gold, space: 4, style: BorderStyle.SINGLE, size: 6 } },
  })
}

function textPara(text) {
  return new Paragraph({
    children: [new TextRun({ text: text || '', size: 20, color: BRAND.body, font: 'Calibri' })],
    spacing: { after: 100 },
  })
}

function dataTable(rows) {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: rows.map(({ label, value }) =>
      new TableRow({
        children: [
          new TableCell({
            width: { size: 35, type: WidthType.PERCENTAGE },
            children: [new Paragraph({ children: [new TextRun({ text: label, bold: true, size: 20, color: BRAND.dark, font: 'Calibri' })] })],
            borders: { top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.SINGLE, size: 1, color: 'EEEEEE' }, left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE } },
          }),
          new TableCell({
            width: { size: 65, type: WidthType.PERCENTAGE },
            children: [new Paragraph({ children: [new TextRun({ text: String(value || '—'), size: 20, color: BRAND.body, font: 'Calibri' })] })],
            borders: { top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.SINGLE, size: 1, color: 'EEEEEE' }, left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE } },
          }),
        ],
      })
    ),
  })
}

function bigNumbersPara(items) {
  const runs = []
  for (const item of items) {
    if (runs.length > 0) runs.push(new TextRun({ text: '    |    ', color: BRAND.muted, size: 20 }))
    runs.push(new TextRun({ text: `${item.label}: `, color: BRAND.muted, size: 20, font: 'Calibri' }))
    runs.push(new TextRun({ text: String(item.value || '—'), bold: true, size: 24, color: BRAND.dark, font: 'Calibri' }))
  }
  return new Paragraph({ children: runs, spacing: { before: 200, after: 200 } })
}

function disclaimer() {
  return new Paragraph({
    children: [new TextRun({
      text: 'Documento gerado automaticamente pelo CRM Somnium Properties. Informacao confidencial.',
      italics: true, size: 16, color: BRAND.muted, font: 'Calibri',
    })],
    spacing: { before: 600 },
  })
}

// ── Geradores por tipo ──────────────────────────────────────

function fichaImovel(im) {
  return [
    brandTitle(im.nome || 'Imóvel'),
    brandSubtitle(`${im.zona || ''} — ${FDATE(im.data_adicionado)}`),
    sectionHeader('Informação Geral'),
    dataTable([
      { label: 'Estado', value: (im.estado || '').replace(/^\d+-/, '') },
      { label: 'Tipologia', value: im.tipologia },
      { label: 'Zona', value: im.zona },
      { label: 'Consultor', value: im.nome_consultor },
      { label: 'Modelo de Negócio', value: im.modelo_negocio },
      { label: 'Origem', value: im.origem },
      { label: 'Área Bruta', value: im.area_bruta ? `${im.area_bruta} m²` : '—' },
    ]),
    sectionHeader('Valores'),
    bigNumbersPara([
      { label: 'Ask Price', value: EUR(im.ask_price) },
      { label: 'VVR', value: EUR(im.valor_venda_remodelado || im.vvr) },
      { label: 'ROI', value: PCT(im.roi) },
    ]),
    dataTable([
      { label: 'Valor Proposta', value: EUR(im.valor_proposta) },
      { label: 'Custo Estimado Obra', value: EUR(im.custo_estimado_obra) },
      { label: 'ROI Anualizado', value: PCT(im.roi_anualizado) },
    ]),
    ...(im.notas ? [sectionHeader('Notas'), textPara(im.notas)] : []),
    disclaimer(),
  ]
}

function apresentacaoInvestidor(im, analise) {
  const content = [
    brandTitle('Proposta de Investimento'),
    brandSubtitle(`${im.nome || 'Imóvel'} — ${im.zona || ''}`),
    sectionHeader('O Imóvel'),
    dataTable([
      { label: 'Localização', value: im.zona },
      { label: 'Tipologia', value: im.tipologia },
      { label: 'Estado', value: (im.estado || '').replace(/^\d+-/, '') },
      { label: 'Área', value: im.area_bruta ? `${im.area_bruta} m²` : '—' },
    ]),
    sectionHeader('Investimento'),
    bigNumbersPara([
      { label: 'Preço Aquisição', value: EUR(im.ask_price) },
      { label: 'Valor Após Obra', value: EUR(im.valor_venda_remodelado || im.vvr) },
    ]),
    dataTable([
      { label: 'Custo Estimado Obra', value: EUR(im.custo_estimado_obra) },
      { label: 'ROI Estimado', value: PCT(im.roi) },
      { label: 'ROI Anualizado', value: PCT(im.roi_anualizado) },
      { label: 'Modelo de Negócio', value: im.modelo_negocio },
    ]),
  ]

  if (analise) {
    content.push(sectionHeader('Análise Financeira'))
    content.push(dataTable([
      { label: 'Lucro Estimado', value: EUR(analise.lucro_estimado) },
      { label: 'Margem', value: PCT(analise.margem) },
      { label: 'Capital Necessário', value: EUR(analise.capital_necessario) },
      { label: 'Tempo Estimado', value: analise.tempo_estimado ? `${analise.tempo_estimado} meses` : '—' },
    ]))
  }

  content.push(disclaimer())
  return content
}

function propostaFormal(im) {
  return [
    brandTitle('Proposta Formal'),
    brandSubtitle(`Ref: ${im.nome || 'Imóvel'}`),
    sectionHeader('Dados do Imóvel'),
    dataTable([
      { label: 'Imóvel', value: im.nome },
      { label: 'Zona', value: im.zona },
      { label: 'Tipologia', value: im.tipologia },
      { label: 'Ask Price', value: EUR(im.ask_price) },
    ]),
    sectionHeader('Proposta'),
    dataTable([
      { label: 'Valor Proposta', value: EUR(im.valor_proposta) },
      { label: 'Modelo de Negócio', value: im.modelo_negocio },
      { label: 'Condições', value: im.condicoes_proposta || 'A definir' },
    ]),
    textPara(''),
    textPara('A presente proposta é válida por 15 dias úteis a contar da data de emissão.'),
    textPara(''),
    textPara('Somnium Properties'),
    textPara(`Data: ${FDATE(new Date())}`),
    disclaimer(),
  ]
}

function genericDoc(title, im) {
  return [
    brandTitle(title),
    brandSubtitle(`${im.nome || 'Imóvel'} — ${im.zona || ''}`),
    sectionHeader('Dados do Imóvel'),
    dataTable([
      { label: 'Nome', value: im.nome },
      { label: 'Estado', value: (im.estado || '').replace(/^\d+-/, '') },
      { label: 'Zona', value: im.zona },
      { label: 'Tipologia', value: im.tipologia },
      { label: 'Ask Price', value: EUR(im.ask_price) },
      { label: 'VVR', value: EUR(im.valor_venda_remodelado || im.vvr) },
      { label: 'ROI', value: PCT(im.roi) },
      { label: 'Consultor', value: im.nome_consultor },
      { label: 'Modelo', value: im.modelo_negocio },
    ]),
    ...(im.notas ? [sectionHeader('Notas'), textPara(im.notas)] : []),
    disclaimer(),
  ]
}

const DOC_GENERATORS = {
  ficha_imovel: (im) => fichaImovel(im),
  ficha_visita: (im) => genericDoc('Ficha de Visita', im),
  proposta_formal: (im) => propostaFormal(im),
  dossier_investidor: (im, a) => apresentacaoInvestidor(im, a),
  proposta_investimento_anonima: (im, a) => apresentacaoInvestidor(im, a),
  resumo_negociacao: (im) => genericDoc('Resumo de Negociação', im),
  ficha_follow_up: (im) => genericDoc('Ficha Follow Up', im),
  ficha_descarte: (im) => genericDoc('Ficha de Descarte', im),
  analise_mercado: (im) => genericDoc('Análise de Mercado', im),
  due_diligence: (im) => genericDoc('Due Diligence', im),
  contrato_parceria: (im) => genericDoc('Contrato de Parceria', im),
  relatorio_final: (im) => genericDoc('Relatório Final', im),
  comparativo_mercado: (im) => genericDoc('Comparativo de Mercado', im),
  carta_intencao: (im) => propostaFormal(im),
}

export async function generateDocx(tipo, imovelId) {
  const { rows: [imovel] } = await pool.query('SELECT * FROM imoveis WHERE id = $1', [imovelId])
  if (!imovel) throw new Error('Imóvel não encontrado')

  // Buscar analise se existir
  const { rows: [analise] } = await pool.query(
    'SELECT * FROM analises WHERE imovel_id = $1 ORDER BY created_at DESC LIMIT 1', [imovelId]
  ).catch(() => ({ rows: [] }))

  const generator = DOC_GENERATORS[tipo]
  if (!generator) throw new Error(`Tipo de documento desconhecido: ${tipo}`)

  const content = generator(imovel, analise || null)

  const doc = new Document({
    creator: 'Somnium Properties CRM',
    title: `${tipo.replace(/_/g, ' ')} — ${imovel.nome || 'Imóvel'}`,
    sections: [{
      properties: {
        page: { margin: { top: 1200, right: 1200, bottom: 1200, left: 1200 } },
      },
      children: content,
    }],
  })

  const buffer = await Packer.toBuffer(doc)
  return { buffer, fileName: `${tipo}_${(imovel.nome || 'imovel').replace(/\s+/g, '_')}.docx` }
}

export function getAvailableTypes() {
  return Object.keys(DOC_GENERATORS)
}
