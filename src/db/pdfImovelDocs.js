/**
 * Documentos PDF profissionais por fase do imóvel.
 * Layout empresarial Somnium Properties — mobile-friendly.
 */
import PDFDocument from 'pdfkit'
import { readFileSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const LOGO_PATH = path.resolve(__dirname, '../../public/logo-transparent.png')

// Design tokens (reference: Proposta de Investimento Somnium)
const C = {
  gold: '#C9A84C', black: '#0d0d0d', white: '#ffffff',
  bg: '#f7f6f2', body: '#2a2a2a', muted: '#888888',
  border: '#e0ddd5', light: '#f0efe9', accent: '#1a1a1a',
  headerBg: '#f0efe9', totalBg: '#f5f3ee',
  green: '#2d6a2d', red: '#8b2020', blue: '#6366f1',
}
const ML = 50, MR = 50 // margins
const PW = 595.28, PH = 841.89
const CW = PW - ML - MR // content width

const EUR = v => v == null || v === 0 ? '—' : new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(v)
const PCT = v => v == null ? '—' : `${v}%`
const FDATE = d => { if (!d) return '—'; try { return new Date(d).toLocaleDateString('pt-PT') } catch { return d } }
const NOW = () => new Date().toLocaleDateString('pt-PT', { day: '2-digit', month: 'long', year: 'numeric' })

// Parse fotos JSON from imovel — only images, max 6 for PDF
function parseFotos(im) {
  try {
    const all = typeof im.fotos === 'string' ? JSON.parse(im.fotos || '[]') : (im.fotos || [])
    return all
      .filter(f => f.folder !== 'documentos' && (f.type?.startsWith('image/') || f.path?.match(/\.(jpg|jpeg|png|webp)$/i)))
      .slice(0, 6) // max 6 photos in PDF
  } catch { return [] }
}

// ── Estado → Documentos ──────────────────────────────────────
const ESTADO_DOC_MAP = {
  'Adicionado': ['ficha_imovel'],
  'Necessidade de Visita': ['ficha_pre_visita'],
  'Visita Marcada': ['checklist_visita'],
  'Estudo de VVR': ['relatorio_visita', 'analise_rentabilidade', 'estudo_comparaveis'],
  'Criar Proposta ao Proprietário': ['proposta_formal'],
  'Enviar proposta ao Proprietário': ['proposta_formal'],
  'Enviar proposta ao investidor': ['apresentacao_investidor'],
  'Em negociação': ['resumo_negociacao'],
  'Proposta aceite': ['resumo_acordo'],
  'Enviar proposta ao investidor': ['dossier_investimento'],
  'Follow Up após proposta': ['ficha_follow_up'],
  'Follow UP': ['ficha_follow_up'],
  'Wholesaling': ['ficha_cedencia'],
  'CAEP': ['ficha_acompanhamento_obra'],
  'Fix and Flip': ['ficha_acompanhamento_obra'],
}

export function getDocsForEstado(estado) { return ESTADO_DOC_MAP[estado] || [] }

const DOC_LABELS = {
  ficha_imovel: 'Ficha do Imóvel', ficha_pre_visita: 'Ficha Pré-Visita', checklist_visita: 'Checklist de Visita',
  relatorio_visita: 'Relatório de Visita', analise_rentabilidade: 'Análise de Rentabilidade', estudo_comparaveis: 'Estudo de Comparáveis',
  proposta_formal: 'Proposta ao Proprietário', apresentacao_investidor: 'Apresentação ao Investidor',
  resumo_negociacao: 'Resumo de Negociação', resumo_acordo: 'Resumo de Acordo', dossier_investimento: 'Dossier de Investimento',
  ficha_follow_up: 'Ficha de Follow Up', ficha_cedencia: 'Ficha de Cedência', ficha_acompanhamento_obra: 'Acompanhamento de Obra',
}

export function generateDoc(tipo, imovel, analise = null) {
  const fn = GENERATORS[tipo]
  return fn ? fn(imovel, analise) : null
}

// ══════════════════════════════════════════════════════════════
// LAYOUT SYSTEM — Professional, mobile-friendly
// ══════════════════════════════════════════════════════════════

class DocBuilder {
  constructor(title, subtitle, imovel) {
    this.doc = new PDFDocument({ size: 'A4', autoFirstPage: false })
    this.y = 0
    this.imovel = imovel
    this._drawCover(title, subtitle)
    this.newPage()
  }

  _drawCover(title, subtitle) {
    const d = this.doc
    const im = this.imovel
    d.addPage({ size: 'A4', margins: { top: 0, bottom: 0, left: 0, right: 0 } })
    // Barra dourada no topo
    d.rect(0, 0, PW, 6).fill(C.gold)
    // Logo centrado
    try { d.image(readFileSync(LOGO_PATH), (PW - 160) / 2, 140, { width: 160 }) } catch {}
    // Linha dourada decorativa
    d.rect(PW / 2 - 30, 310, 60, 1.5).fill(C.gold)
    // Titulo grande
    d.fontSize(28).fillColor(C.body).text(title, ML, 340, { width: CW, align: 'center' })
    // Subtitulo dourado (nome imovel + zona)
    const sub = [im.nome, im.zona].filter(Boolean).join(' · ').toUpperCase()
    if (sub) d.fontSize(10).fillColor(C.gold).text(sub, ML, 390, { width: CW, align: 'center', characterSpacing: 1.5 })
    // Localizacao
    if (subtitle) d.fontSize(10).fillColor(C.muted).text(subtitle + ' · Coimbra · Portugal', ML, 415, { width: CW, align: 'center' })
    // Linha separadora
    d.rect(ML + 80, 450, CW - 160, 0.5).fill(C.gold)
    // Data
    d.fontSize(9).fillColor(C.muted).text(NOW(), ML, 465, { width: CW, align: 'center' })
    // Footer
    d.rect(ML, PH - 65, CW, 0.5).fill(C.gold)
    d.fontSize(7).fillColor(C.muted).text('Somnium Properties · Investimento Imobiliário', ML, PH - 52, { width: CW, align: 'center' })
    d.fontSize(7).fillColor(C.muted).text(`Documento Confidencial · ${NOW()}`, ML, PH - 40, { width: CW, align: 'center' })
    // Barra dourada no fundo
    d.rect(0, PH - 6, PW, 6).fill(C.gold)
  }

  newPage() {
    this.doc.addPage({ size: 'A4', margins: { top: 60, bottom: 60, left: ML, right: MR } })
    const d = this.doc
    // Header: logo left, date right, gold line
    try { d.image(readFileSync(LOGO_PATH), ML, 15, { height: 22 }) } catch {}
    d.rect(ML, 45, CW, 1.5).fill(C.gold)
    // Footer: just the gold line (text added in end() to avoid cursor issues)
    d.rect(ML, PH - 45, CW, 0.5).fill(C.gold)
    this.y = 60
    return this
  }

  ensure(needed) {
    if (this.y > 50 && this.y + needed > PH - 50) this.newPage()
    return this
  }

  // Section header — bold uppercase + gold underline (no numbering)
  header(title) {
    this.ensure(28)
    this.doc.fontSize(11).fillColor(C.body).text(title.toUpperCase(), ML, this.y, { characterSpacing: 0.3 })
    this.y = this.doc.y + 4
    this.doc.rect(ML, this.y, CW, 1.5).fill(C.gold)
    this.y += 10
    return this
  }

  // Sub-header (lighter, smaller)
  subheader(title) {
    this.ensure(22)
    this.doc.fontSize(9.5).fillColor(C.body).text(title.toUpperCase(), ML, this.y, { characterSpacing: 0.3 })
    this.y = this.doc.y + 3
    this.doc.rect(ML, this.y, 40, 1).fill(C.gold)
    this.y += 8
    return this
  }

  // Section subtitle (gold underline)
  section(title) {
    this.ensure(28)
    this.doc.fontSize(11).fillColor(C.body).text(title, ML, this.y, { lineBreak: false })
    this.y += 15
    this.doc.rect(ML, this.y, 30, 2).fill(C.gold)
    this.doc.rect(ML + 32, this.y + 0.5, CW - 32, 0.5).fill(C.border)
    this.y += 10
    return this
  }

  // Data row (label + value in a clean box)
  row(label, value, options = {}) {
    this.ensure(30)
    const alt = options.alt
    if (alt) this.doc.roundedRect(ML, this.y, CW, 26, 3).fill(C.light)
    this.doc.fontSize(7).fillColor(C.muted).text(label.toUpperCase(), ML + 12, this.y + 5, { width: 155, lineBreak: false })
    this.doc.fontSize(9).fillColor(C.body).text(String(value || '—'), ML + 175, this.y + 4, { width: CW - 190 })
    this.y = Math.max(this.y + 26, this.doc.y + 2)
    return this
  }

  // Editable field (label + rounded input box — mobile friendly)
  input(label, value, options = {}) {
    this.ensure(options.tall ? 60 : 38)
    const h = options.tall ? 50 : 26
    this.doc.fontSize(7).fillColor(C.muted).text(label.toUpperCase(), ML, this.y, { lineBreak: false })
    this.y += 11
    this.doc.roundedRect(ML, this.y, options.half ? CW / 2 - 5 : CW, h, 4).lineWidth(0.5).stroke(C.border)
    if (value) {
      this.doc.fontSize(9).fillColor(C.body).text(String(value), ML + 8, this.y + 6, { width: (options.half ? CW / 2 - 20 : CW - 16) })
    }
    this.y += h + 6
    return this
  }

  // Two inputs side by side
  inputRow(label1, value1, label2, value2) {
    this.ensure(38)
    const halfW = CW / 2 - 5
    // Left
    this.doc.fontSize(7).fillColor(C.muted).text(label1.toUpperCase(), ML, this.y, { lineBreak: false })
    this.doc.fontSize(7).fillColor(C.muted).text(label2.toUpperCase(), ML + halfW + 10, this.y, { lineBreak: false })
    this.y += 11
    this.doc.roundedRect(ML, this.y, halfW, 26, 4).lineWidth(0.5).stroke(C.border)
    this.doc.roundedRect(ML + halfW + 10, this.y, halfW, 26, 4).lineWidth(0.5).stroke(C.border)
    if (value1) this.doc.fontSize(9).fillColor(C.body).text(String(value1), ML + 8, this.y + 6, { width: halfW - 16, lineBreak: false })
    if (value2) this.doc.fontSize(9).fillColor(C.body).text(String(value2), ML + halfW + 18, this.y + 6, { width: halfW - 16, lineBreak: false })
    this.y += 32
    return this
  }

  // Checkbox item (large touch target for mobile)
  check(text, checked = false) {
    this.ensure(24)
    this.doc.roundedRect(ML + 2, this.y + 2, 14, 14, 3).lineWidth(0.5).stroke(C.border)
    if (checked) {
      this.doc.fontSize(10).fillColor(C.green).text('✓', ML + 4, this.y + 1, { lineBreak: false })
    }
    this.doc.fontSize(9).fillColor(C.body).text(text, ML + 24, this.y + 3, { width: CW - 30 })
    this.y = Math.max(this.y + 22, this.doc.y + 4)
    return this
  }

  // Info text
  text(content, options = {}) {
    this.ensure(20)
    this.doc.fontSize(options.size || 9).fillColor(options.color || C.body).text(content, ML, this.y, { width: CW, lineGap: options.lineGap || 4 })
    this.y = this.doc.y + 6
    return this
  }

  // Highlighted box (for important info)
  highlight(label, value, color = C.gold) {
    this.ensure(40)
    this.doc.roundedRect(ML, this.y, CW, 34, 4).fill(color).opacity(0.08)
    this.doc.opacity(1)
    this.doc.roundedRect(ML, this.y, CW, 34, 4).lineWidth(0.5).stroke(color)
    this.doc.fontSize(7).fillColor(C.muted).text(label.toUpperCase(), ML + 12, this.y + 5, { lineBreak: false })
    this.doc.fontSize(12).fillColor(C.body).text(String(value || '—'), ML + 12, this.y + 16, { lineBreak: false })
    this.y += 40
    return this
  }

  // Spacing
  space(px = 8) { this.y += px; return this }

  // Numbered step
  step(num, text) {
    this.ensure(22)
    this.doc.circle(ML + 8, this.y + 8, 8).fill(C.gold)
    this.doc.fontSize(8).fillColor(C.white).text(String(num), ML + 3, this.y + 4, { width: 10, align: 'center', lineBreak: false })
    this.doc.fontSize(9).fillColor(C.body).text(text, ML + 24, this.y + 3, { width: CW - 30 })
    this.y = Math.max(this.y + 20, this.doc.y + 4)
    return this
  }

  // Photo gallery — grid of property photos
  photos(fotos, title = 'GALERIA FOTOGRÁFICA') {
    if (!fotos || fotos.length === 0) return this
    this.header(title)
    const ROOT = path.resolve(__dirname, '../..')
    const imgSize = (CW - 10) / 2 // 2 columns
    const imgHeight = imgSize * 0.65 // 4:3ish ratio
    let col = 0
    for (const foto of fotos) {
      // Skip non-image files
      if (!foto.type?.startsWith('image/') && !foto.path?.match(/\.(jpg|jpeg|png|webp)$/i)) continue
      const filePath = path.join(ROOT, 'public', foto.path)
      try {
        const imgData = readFileSync(filePath)
        this.ensure(imgHeight + 20)
        const x = ML + col * (imgSize + 10)
        this.doc.save()
        this.doc.roundedRect(x, this.y, imgSize, imgHeight, 4).clip()
        this.doc.image(imgData, x, this.y, { width: imgSize, height: imgHeight, fit: [imgSize, imgHeight], align: 'center', valign: 'center' })
        this.doc.restore()
        // Border
        this.doc.roundedRect(x, this.y, imgSize, imgHeight, 4).lineWidth(0.5).stroke(C.border)
        col++
        if (col >= 2) {
          col = 0
          this.y += imgHeight + 8
        }
      } catch {
        // File not found — skip silently
      }
    }
    if (col > 0) this.y += imgHeight + 8 // close last row
    this.space(4)
    return this
  }

  // Bullet point
  bullet(text) {
    this.ensure(18)
    this.doc.fontSize(9).fillColor(C.gold).text('▸ ', ML, this.y, { continued: true }).fillColor(C.body).text(text, { width: CW - 14, lineGap: 3 })
    this.y = this.doc.y + 4
    return this
  }

  // Table header
  tableHeader(cols) {
    this.ensure(22)
    this.doc.rect(ML, this.y, CW, 20).fill(C.black)
    let x = ML + 8
    for (const [label, w] of cols) {
      this.doc.fontSize(7).fillColor(C.gold).text(label.toUpperCase(), x, this.y + 6, { width: w, lineBreak: false })
      x += w
    }
    this.y += 22
    return this
  }

  // Table row
  tableRow(values, widths, alt = false) {
    this.ensure(22)
    if (alt) this.doc.rect(ML, this.y, CW, 20).fill(C.light)
    let x = ML + 8
    for (let i = 0; i < values.length; i++) {
      this.doc.fontSize(8).fillColor(C.body).text(String(values[i] || '—'), x, this.y + 5, { width: widths[i], lineBreak: false })
      x += widths[i]
    }
    this.y += 22
    return this
  }

  // ── Metodos empresariais (minimalistas, sem caixas escuras) ─

  // KPI grid — thin bordered cells, like the reference document
  bigNumbers(items) {
    this.ensure(56)
    const colW = CW / items.length
    // Draw border around all cells
    this.doc.rect(ML, this.y, CW, 50).lineWidth(0.5).stroke(C.border)
    items.forEach((item, i) => {
      const x = ML + i * colW
      if (i > 0) this.doc.rect(x, this.y, 0.5, 50).fill(C.border)
      this.doc.fontSize(7).fillColor(C.muted).text((item.label || '').toUpperCase(), x + 10, this.y + 8, { width: colW - 20, lineBreak: false, characterSpacing: 0.3 })
      this.doc.fontSize(16).fillColor(C.body).text(String(item.value || '—'), x + 10, this.y + 22, { width: colW - 20, lineBreak: false })
      if (item.sub) this.doc.fontSize(7).fillColor(C.muted).text(item.sub, x + 10, this.y + 40, { width: colW - 20, lineBreak: false })
    })
    this.y += 56
    return this
  }

  // Dados inline — label: valor lado a lado, compacto
  inlineData(items) {
    this.ensure(16)
    const colW = CW / items.length
    items.forEach((item, i) => {
      const x = ML + i * colW
      this.doc.fontSize(7.5).fillColor(C.muted).text(`${item.label}: `, x, this.y + 2, { continued: true }).fillColor(C.body).text(String(item.value || '—'), { lineBreak: false })
    })
    this.y += 16
    return this
  }

  // Professional table — warm header, generous rows (reference style)
  simpleTable(rows) {
    this.ensure(rows.length * 22 + 4)
    rows.forEach(row => {
      const isTotal = row.total
      if (isTotal) {
        this.doc.rect(ML, this.y, CW, 24).fill(C.totalBg)
      }
      this.doc.fontSize(isTotal ? 9.5 : 8.5).fillColor(C.body).text(row.label || '', ML + 10, this.y + 6, { width: 310, lineBreak: false })
      this.doc.fontSize(isTotal ? 9.5 : 8.5).fillColor(isTotal ? C.gold : C.body).text(String(row.value || '—'), ML + 320, this.y + 6, { width: CW - 330, align: 'right', lineBreak: false })
      this.doc.rect(ML, this.y + (isTotal ? 24 : 22), CW, 0.3).fill(C.border)
      this.y += isTotal ? 26 : 22
    })
    this.y += 4
    return this
  }

  // Column table — warm gray header with gold labels (reference style)
  colTable(headers, rows) {
    this.ensure(24 + rows.length * 24)
    // Header — warm gray bg, gold bold labels
    this.doc.rect(ML, this.y, CW, 22).fill(C.headerBg)
    let x = ML + 8
    for (const [label, w] of headers) {
      this.doc.fontSize(7.5).fillColor(C.gold).text(label, x, this.y + 6, { width: w, lineBreak: false })
      x += w
    }
    this.y += 24
    // Rows
    rows.forEach(row => {
      const isTotal = row._total
      if (isTotal) this.doc.rect(ML, this.y, CW, 24).fill(C.totalBg)
      x = ML + 8
      const vals = row._values || row
      for (let i = 0; i < vals.length; i++) {
        const cell = vals[i]
        const val = cell?.value !== undefined ? cell.value : cell
        const clr = cell?.color || C.body
        this.doc.fontSize(isTotal ? 9 : 8.5).fillColor(clr).text(String(val || '—'), x, this.y + 6, { width: headers[i][1], lineBreak: false })
        x += headers[i][1]
      }
      this.doc.rect(ML, this.y + (isTotal ? 24 : 22), CW, 0.3).fill(C.border)
      this.y += isTotal ? 26 : 24
    })
    this.y += 4
    return this
  }

  // Metrica simples — label + valor
  metric(label, value, options = {}) {
    this.ensure(16)
    const { total } = options
    if (total) { this.doc.rect(ML, this.y - 1, CW, 0.5).fill(C.body); this.y += 3 }
    this.doc.fontSize(total ? 9 : 8.5).fillColor(C.body).text(label, ML + 4, this.y + 1, { width: 320, lineBreak: false })
    this.doc.fontSize(total ? 9 : 8.5).fillColor(C.body).text(String(value || '—'), ML + 330, this.y + 1, { width: CW - 334, align: 'right', lineBreak: false })
    if (!total) this.doc.rect(ML, this.y + 13, CW, 0.2).fill('#e0ddd5')
    this.y += total ? 18 : 14
    return this
  }

  // Verdict — uma linha simples com cor
  // Narrative text block
  textBlock(content) {
    this.ensure(30)
    this.doc.fontSize(9).fillColor(C.body).text(content, ML, this.y, { width: CW, lineGap: 4, align: 'justify' })
    this.y = this.doc.y + 8
    return this
  }

  // Note/pressuposto
  note(text) {
    this.ensure(16)
    this.doc.fontSize(7.5).fillColor(C.muted).text(text, ML, this.y, { width: CW, lineGap: 3 })
    this.y = this.doc.y + 4
    return this
  }

  verdict(text, isPositive) {
    this.ensure(20)
    this.doc.fontSize(9.5).fillColor(isPositive ? C.green : C.red).text(text, ML, this.y, { width: CW })
    this.y = this.doc.y + 8
    return this
  }

  disclaimer() {
    this.ensure(30)
    this.doc.rect(ML, this.y, CW, 0.3).fill(C.border)
    this.y += 6
    this.doc.fontSize(6.5).fillColor(C.muted).text(
      'Este documento é preparado para fins informativos e não constitui aconselhamento financeiro ou fiscal. Os valores são estimativas e podem variar. Somnium Properties — Confidencial.',
      ML, this.y, { width: CW, lineGap: 2 })
    this.y = this.doc.y + 4
    return this
  }

  end() { this.doc.end(); return this.doc }
}

// ══════════════════════════════════════════════════════════════
// DOCUMENT GENERATORS
// ══════════════════════════════════════════════════════════════

const GENERATORS = {
  // ── 1. FICHA DO IMÓVEL ──────────────────────────────────────
  ficha_imovel: (im) => {
    const fotos = parseFotos(im)
    const b = new DocBuilder('Ficha do Imóvel', im.zona || '', im)
    b.inlineData([{ label: 'Estado', value: (im.estado || '').replace(/^\d+-/, '') }, { label: 'Data', value: FDATE(im.data_adicionado) }, { label: 'Origem', value: im.origem }])
    b.space(4)
    // Fotografias logo no início
    if (fotos.length > 0) b.photos(fotos)
    b.header('INFORMAÇÃO GERAL')
    b.simpleTable([
      { label: 'Tipologia', value: im.tipologia }, { label: 'Zona', value: im.zona },
      { label: 'Consultor', value: im.nome_consultor }, { label: 'Modelo de Negócio', value: im.modelo_negocio },
      { label: 'Link', value: im.link }, { label: 'Área Útil', value: im.area_util ? `${im.area_util} m²` : '—' },
      { label: 'Área Bruta', value: im.area_bruta ? `${im.area_bruta} m²` : '—' },
    ])
    b.space(4)
    b.header('VALORES')
    b.bigNumbers([
      { label: 'Ask Price', value: EUR(im.ask_price) },
      { label: 'Valor Proposta', value: EUR(im.valor_proposta) },
      { label: 'VVR', value: EUR(im.valor_venda_remodelado) },
    ])
    b.simpleTable([
      { label: 'Custo Estimado Obra', value: EUR(im.custo_estimado_obra) },
      { label: 'ROI', value: PCT(im.roi) }, { label: 'ROI Anualizado', value: PCT(im.roi_anualizado) },
    ])
    if (im.notas) { b.space(4); b.header('NOTAS'); b.text(im.notas) }
    b.disclaimer()
    return b.end()
  },

  // ── 2. FICHA PRÉ-VISITA ────────────────────────────────────
  ficha_pre_visita: (im) => {
    const b = new DocBuilder('Ficha Pré-Visita', im.zona || '', im)
    b.header('DADOS DO IMÓVEL')
    b.simpleTable([
      { label: 'Imóvel', value: im.nome }, { label: 'Tipologia', value: im.tipologia },
      { label: 'Zona', value: im.zona }, { label: 'Ask Price', value: EUR(im.ask_price) },
      { label: 'Consultor', value: im.nome_consultor }, { label: 'Link', value: im.link },
    ])
    b.space(4)
    b.header('PONTOS A AVALIAR NA VISITA')
    b.simpleTable([
      'Estado geral da estrutura (paredes, tectos, pavimentos)', 'Telhado e cobertura — infiltração ou degradação',
      'Instalação eléctrica — quadro, tomadas, iluminação', 'Canalização — pressão de água, esgotos, humidade',
      'Caixilharia e janelas — estado, isolamento térmico', 'Orientação solar e luminosidade natural',
      'Acessos, estacionamento e envolvente', 'Possibilidade de ampliação ou alteração de layout',
    ].map(p => ({ label: `□  ${p}`, value: '' })))
    b.space(4)
    b.header('PERGUNTAS AO PROPRIETÁRIO')
    b.simpleTable([
      'Há quanto tempo está à venda? Motivo da venda?', 'Valor mínimo que aceita? Margem de negociação?',
      'Algum problema estrutural ou legal conhecido?', 'Documentação em dia? (caderneta, certidão permanente)',
      'Existem ónus, hipotecas ou penhoras?', 'Área real corresponde à área registada?',
    ].map(p => ({ label: `□  ${p}`, value: '' })))
    b.space(4)
    b.header('DOCUMENTOS A SOLICITAR')
    b.simpleTable([
      'Caderneta predial urbana', 'Certidão permanente do registo predial', 'Licença de utilização',
      'Plantas do imóvel', 'Certificado energético', 'Declaração de dívidas ao condomínio',
    ].map(p => ({ label: `□  ${p}`, value: '' })))
    b.space(4)
    b.subheader('Notas')
    b.metric('Observações', '________________')
    b.disclaimer()
    return b.end()
  },

  // ── 3. CHECKLIST DE VISITA ──────────────────────────────────
  checklist_visita: (im) => {
    const b = new DocBuilder('Checklist de Visita', `${im.zona || ''} · ${im.tipologia || ''}`, im)
    b.header('DADOS DA VISITA')
    b.inlineData([{ label: 'Data da Visita', value: FDATE(im.data_visita) }, { label: 'Consultor', value: im.nome_consultor }])
    b.space(4)

    const secs = {
      'ESTRUTURA E EXTERIOR': ['Fachada — fissuras, humidade, degradação', 'Telhado / cobertura — telhas, isolamento', 'Terraço / varanda — impermeabilização', 'Garagem / estacionamento'],
      'INTERIOR': ['Paredes — fissuras, humidade, bolor', 'Tectos — manchas, infiltrações', 'Pavimentos — estado, nivelamento', 'Portas — funcionamento, estado'],
      'INSTALAÇÕES TÉCNICAS': ['Quadro eléctrico — disjuntores, estado', 'Tomadas e interruptores', 'Canalização — água quente e fria', 'Esgotos — cheiros, escoamento', 'Aquecimento — sistema, estado'],
      'COZINHA E CASAS DE BANHO': ['Cozinha — bancada, armários, equipamentos', 'WC — louças, torneiras, ventilação', 'Azulejos — estado geral'],
      'ENVOLVENTE': ['Vizinhança — ruído, segurança', 'Transportes e serviços próximos', 'Orientação solar', 'Estacionamento na zona'],
    }

    for (const [title, items] of Object.entries(secs)) {
      b.header(title)
      b.simpleTable(items.map(item => ({ label: `□  ${item}`, value: '' })))
      b.space(4)
    }

    b.header('IMPRESSÃO GERAL')
    b.metric('Impressão geral do imóvel', '________________')
    b.space(4)
    b.subheader('Decisão')
    b.simpleTable([
      { label: '□  Avançar para estudo de mercado', value: '' },
      { label: '□  Necessita segunda visita', value: '' },
      { label: '□  Descartar', value: '' },
    ])
    b.metric('Motivo / Observações', '________________')
    b.disclaimer()
    return b.end()
  },

  // ── 4a. RELATÓRIO DE VISITA ─────────────────────────────────
  relatorio_visita: (im) => {
    const fotos = parseFotos(im)
    const b = new DocBuilder('Relatório de Visita', im.zona || '', im)
    b.header('DADOS DA VISITA')
    b.simpleTable([
      { label: 'Imóvel', value: im.nome }, { label: 'Zona', value: im.zona },
      { label: 'Data Visita', value: FDATE(im.data_visita) }, { label: 'Consultor', value: im.nome_consultor },
    ])
    if (fotos.length > 0) { b.space(4); b.photos(fotos, 'FOTOGRAFIAS DA VISITA') }
    b.space(4)
    b.header('ESTADO REAL DO IMÓVEL')
    b.metric('Descrição geral do estado encontrado', '________________')
    b.space(4)
    b.header('OBRAS NECESSÁRIAS')
    b.colTable(
      [['Trabalho', 280], ['Custo Estimado', 200]],
      ['Demolições e remoção', 'Estrutura / alvenaria', 'Canalização', 'Electricidade',
        'Revestimentos / acabamentos', 'Cozinha e WC', 'Caixilharia', 'Pintura', 'Outros',
      ].map(item => ({ _values: [item, '________________'] }))
    )
    b.space(4)
    b.header('DECISÃO')
    b.simpleTable([
      { label: '□  GO — Avançar para análise de rentabilidade', value: '' },
      { label: '□  SEGUNDA VISITA — Necessita validação adicional', value: '' },
      { label: '□  NO GO — Descartar', value: '' },
    ])
    b.metric('Justificação', '________________')
    b.disclaimer()
    return b.end()
  },

  // ── 4b. ANÁLISE DE RENTABILIDADE (dados da calculadora) ────
  analise_rentabilidade: (im, analise) => {
    const b = new DocBuilder('Análise de Rentabilidade', im.zona || '', im)
    const a = analise || {}
    const compra = a.compra || im.valor_proposta || im.ask_price || 0
    const obra = a.obra_com_iva || a.obra || im.custo_estimado_obra || 0
    const vvr = a.vvr || im.valor_venda_remodelado || 0

    b.header('RESUMO DO INVESTIMENTO')
    b.bigNumbers([
      { label: 'Capital Necessário', value: EUR(a.capital_necessario || compra + obra) },
      { label: 'Lucro Líquido', value: EUR(a.lucro_liquido) },
      { label: 'Retorno Anualizado', value: PCT(a.retorno_anualizado) },
    ])
    b.space(4)

    b.header('A. CUSTOS DE AQUISIÇÃO')
    b.simpleTable([
      { label: 'Valor de Compra', value: EUR(compra) },
      { label: 'VPT', value: EUR(a.vpt) },
      { label: 'Finalidade', value: (a.finalidade || '').replace(/_/g, ' ') },
      { label: 'IMT', value: EUR(a.imt) },
      { label: 'Imposto de Selo', value: EUR(a.imposto_selo) },
      { label: 'Escritura', value: EUR(a.escritura) },
      { label: 'CPCV Compra', value: EUR(a.cpcv_compra) },
      { label: 'Due Diligence', value: EUR(a.due_diligence) },
      { label: 'Total Aquisição', value: EUR(a.total_aquisicao), total: true },
    ])
    b.space(4)

    if (a.perc_financiamento > 0) {
      b.header('B. FINANCIAMENTO')
      b.simpleTable([
        { label: '% Financiamento', value: PCT(a.perc_financiamento) },
        { label: 'Valor Financiado', value: EUR(a.valor_financiado) },
        { label: 'Prazo', value: `${a.prazo_anos || 30} anos` },
        { label: 'TAN', value: PCT(a.tan) },
        { label: 'Tipo Taxa', value: a.tipo_taxa },
        { label: 'Prestação Mensal', value: EUR(a.prestacao_mensal) },
        { label: 'Comissões Bancárias', value: EUR(a.comissoes_banco) },
        { label: 'IS Financiamento', value: EUR(a.is_financiamento) },
      ])
      b.space(4)
    }

    b.header('C. CUSTOS DE OBRA')
    b.simpleTable([
      { label: 'Obra', value: EUR(a.obra) },
      { label: 'PMO %', value: PCT(a.pmo_perc) },
      { label: 'ARU', value: a.aru ? 'Sim' : 'Não' },
      { label: 'Ampliação', value: a.ampliacao ? 'Sim' : 'Não' },
      { label: 'IVA Obra', value: EUR(a.iva_obra) },
      { label: 'Obra com IVA', value: EUR(a.obra_com_iva) },
      { label: 'Licenciamento', value: EUR(a.licenciamento) },
    ])
    b.space(4)

    b.header('D. CUSTOS DE DETENÇÃO')
    b.simpleTable([
      { label: 'Meses de Retenção', value: a.meses || '—' },
      { label: 'Seguro Mensal', value: EUR(a.seguro_mensal) },
      { label: 'Condomínio Mensal', value: EUR(a.condominio_mensal) },
      { label: 'Taxa IMI', value: PCT(a.taxa_imi) },
    ])
    b.space(4)

    b.header('E. VENDA')
    b.simpleTable([
      { label: 'VVR', value: EUR(vvr) },
      { label: 'Comissão %', value: PCT(a.comissao_perc) },
      { label: 'Comissão com IVA', value: EUR(a.comissao_com_iva) },
      { label: 'Total Custos Venda', value: EUR(a.total_venda), total: true },
    ])
    b.space(4)

    b.header('F. FISCALIDADE')
    const fiscRows = [
      { label: 'Regime', value: a.regime_fiscal || '—' },
      { label: 'Impostos', value: EUR(a.impostos) },
    ]
    if (a.regime_fiscal === 'Empresa') {
      fiscRows.push({ label: 'Derrama Municipal', value: PCT(a.derrama_perc) })
      fiscRows.push({ label: '% Distribuição Dividendos', value: PCT(a.perc_dividendos) })
      fiscRows.push({ label: 'Retenção Dividendos', value: EUR(a.retencao_dividendos) })
    }
    b.simpleTable(fiscRows)
    b.space(4)

    b.header('G. RESULTADO')
    b.bigNumbers([
      { label: 'Lucro Bruto', value: EUR(a.lucro_bruto) },
      { label: 'Impostos', value: EUR(a.impostos) },
      { label: 'Lucro Líquido', value: EUR(a.lucro_liquido) },
    ])
    b.simpleTable([
      { label: 'Retorno Total', value: PCT(a.retorno_total) },
      { label: 'Retorno Anualizado', value: PCT(a.retorno_anualizado) },
      { label: 'Cash-on-Cash', value: PCT(a.cash_on_cash) },
      { label: 'Break-Even', value: EUR(a.break_even) },
    ])
    b.space(4)

    if (a.stress_tests) {
      let st = a.stress_tests
      if (typeof st === 'string') try { st = JSON.parse(st) } catch { st = null }
      if (st) {
        b.header('H. TESTES DE STRESS')
        b.bigNumbers([
          { label: 'Pior Cenário', value: EUR(st.pior?.lucro_liquido) },
          { label: 'Cenário Base', value: EUR(st.base?.lucro_liquido) },
          { label: 'Melhor Cenário', value: EUR(st.melhor?.lucro_liquido) },
        ])
        b.simpleTable([
          ...(st.base ? [{ label: 'Base — RA', value: PCT(st.base.retorno_anualizado) }] : []),
          ...(st.pior ? [{ label: 'Pior Cenário — RA', value: PCT(st.pior.retorno_anualizado) }] : []),
          ...(st.melhor ? [{ label: 'Melhor Cenário — RA', value: PCT(st.melhor.retorno_anualizado) }] : []),
        ])

        const cenarios = st.cenarios || st.downside || []
        if (Array.isArray(cenarios) && cenarios.length > 0) {
          b.space(4)
          b.colTable(
            [['Cenário', 200], ['Lucro Líq.', 100], ['RT', 90], ['RA', 90]],
            cenarios.map((c, i) => ({ _values: [c.nome || c.label || `Cenário ${i+1}`, EUR(c.lucro_liquido), PCT(c.retorno_total), PCT(c.retorno_anualizado)] }))
          )
        }
      }
    }

    b.disclaimer()
    return b.end()
  },

  // ── 4c. ESTUDO DE COMPARÁVEIS (dados da calculadora) ──────
  estudo_comparaveis: (im, analise) => {
    const b = new DocBuilder('Estudo de Mercado — Comparáveis', im.zona || '', im)
    const a = analise || {}

    b.header('IMÓVEL EM ANÁLISE')
    b.simpleTable([
      { label: 'Imóvel', value: im.nome }, { label: 'Zona', value: im.zona },
      { label: 'Tipologia', value: im.tipologia }, { label: 'VVR Estimado', value: EUR(a.vvr || im.valor_venda_remodelado) },
    ])
    b.space(4)

    let comps = a.comparaveis || []
    if (typeof comps === 'string') try { comps = JSON.parse(comps) } catch { comps = [] }

    if (Array.isArray(comps) && comps.length > 0) {
      for (let t = 0; t < comps.length; t++) {
        const tip = comps[t]
        if (!tip) continue

        const tipLabel = tip.tipologia || tip.label || `Tipologia ${t + 1}`
        b.header(`TIPOLOGIA: ${tipLabel.toUpperCase()}`)

        if (tip.area || tip.renda || tip.yield_bruta) {
          b.simpleTable([
            { label: 'Área (m²)', value: tip.area },
            { label: 'Renda Mensal', value: EUR(tip.renda) },
            { label: 'Yield Bruta', value: PCT(tip.yield_bruta) },
            { label: 'VVR pelo Rendimento', value: EUR(tip.vvr_rendimento) },
          ])
          b.space(4)
        }

        if (tip.vvr_alvo) {
          b.bigNumbers([{ label: 'VVR Alvo', value: EUR(tip.vvr_alvo) }])
          b.space(4)
        }

        const items = tip.comparaveis || tip.items || []
        if (items.length > 0) {
          b.colTable(
            [['Comparável', 120], ['Área', 55], ['Preço', 70], ['€/m²', 70], ['Ajuste', 55], ['€/m² Aj.', 60], ['VVR Est.', 55]],
            items.map((c, i) => {
              const eurM2 = c.area > 0 ? Math.round((c.preco || c.preco_anuncio || 0) / c.area) : '—'
              const ajTotal = (c.ajuste_total || 0)
              const eurM2Aj = typeof eurM2 === 'number' ? Math.round(eurM2 * (1 + ajTotal / 100)) : '—'
              const vvrEst = typeof eurM2Aj === 'number' && tip.area ? eurM2Aj * tip.area : '—'
              return { _values: [
                c.notas || c.zona || `Comp. ${i+1}`,
                c.area ? `${c.area}m²` : '—',
                EUR(c.preco || c.preco_anuncio),
                typeof eurM2 === 'number' ? `€${eurM2}` : '—',
                ajTotal ? `${ajTotal > 0 ? '+' : ''}${ajTotal}%` : '0%',
                typeof eurM2Aj === 'number' ? `€${eurM2Aj}` : '—',
                typeof vvrEst === 'number' ? EUR(vvrEst) : '—',
              ] }
            })
          )

          const validVVRs = items.filter(c => c.vvr_estimado > 0).map(c => c.vvr_estimado)
          if (validVVRs.length > 0) {
            const media = Math.round(validVVRs.reduce((a, b) => a + b, 0) / validVVRs.length)
            b.space(4)
            b.metric('Média VVR Comparáveis', EUR(media), { total: true })
          }
        }
        b.space(4)
      }
    } else {
      for (let i = 1; i <= 5; i++) {
        b.header(`COMPARÁVEL ${i}`)
        b.simpleTable([
          { label: 'Endereço / Zona', value: '________________' }, { label: 'Tipologia', value: '________________' },
          { label: 'Área (m²)', value: '________________' }, { label: 'Valor de Venda', value: '________________' },
          { label: 'Valor por m²', value: '________________' }, { label: 'Data de Venda', value: '________________' },
          { label: 'Fonte', value: '________________' }, { label: 'Ajuste %', value: '________________' },
        ])
        b.metric('Notas', '________________')
        b.space(4)
      }
      b.header('CONCLUSÃO')
      b.metric('Análise comparativa e valor de mercado estimado', '________________')
    }

    b.space(4)
    b.text('Nota: Os valores apresentados são estimativas baseadas em comparáveis de mercado e podem não reflectir o valor exacto de transacção. A Somnium Properties recomenda validação com avaliação profissional certificada.', { size: 7, color: C.muted })
    b.disclaimer()
    return b.end()
  },

  // ── 5. PROPOSTA FORMAL ────────────────────────────────────
  proposta_formal: (im) => {
    const b = new DocBuilder('Proposta ao Proprietário', im.zona || '', im)
    b.header('DADOS DO IMÓVEL')
    b.simpleTable([
      { label: 'Imóvel', value: im.nome }, { label: 'Zona', value: im.zona },
      { label: 'Consultor', value: im.nome_consultor }, { label: 'Ask Price', value: EUR(im.ask_price) },
    ])
    b.space(4)
    b.header('PROPOSTA')
    b.bigNumbers([{ label: 'Valor Proposto', value: EUR(im.valor_proposta) }])
    b.simpleTable([
      { label: 'Condições de Pagamento', value: '________________' },
      { label: 'Prazo para CPCV', value: '________________' },
      { label: 'Prazo para Escritura', value: '________________' },
      { label: 'Condições Especiais', value: '________________' },
    ])
    b.space(4)
    b.subheader('Justificação do Valor')
    b.metric('Fundamentos da proposta (comparáveis, estado, obra necessária)', '________________')
    b.disclaimer()
    return b.end()
  },

  // ── 6. APRESENTAÇÃO AO INVESTIDOR (dossier completo com calculadora + CAEP)
  apresentacao_investidor: (im, analise) => {
    const fotos = parseFotos(im)
    const b = new DocBuilder('Dossier de Investimento', `Oportunidade · ${im.zona || ''}`, im)
    const a = analise || {}
    const compra = a.compra || im.valor_proposta || im.ask_price || 0
    const obra = a.obra_com_iva || a.obra || im.custo_estimado_obra || 0
    const vvr = a.vvr || im.valor_venda_remodelado || 0

    b.header('OPORTUNIDADE DE INVESTIMENTO')
    b.simpleTable([
      { label: 'Imóvel', value: im.nome }, { label: 'Zona', value: im.zona },
      { label: 'Tipologia', value: im.tipologia }, { label: 'Modelo', value: im.modelo_negocio || 'CAEP 50/50' },
      { label: 'Prazo Estimado', value: a.meses ? `${a.meses} meses` : '—' },
    ])
    if (fotos.length > 0) { b.space(4); b.photos(fotos, 'O IMÓVEL') }
    b.space(4)

    b.header('NÚMEROS DO NEGÓCIO')
    b.bigNumbers([
      { label: 'Capital Necessário', value: EUR(a.capital_necessario || compra + obra) },
      { label: 'Lucro Líquido', value: EUR(a.lucro_liquido) },
      { label: 'Retorno Anualizado', value: PCT(a.retorno_anualizado) },
    ])
    b.space(4)

    b.header('DECOMPOSIÇÃO DE CUSTOS')
    b.simpleTable([
      { label: 'Compra', value: EUR(compra) },
      { label: 'IMT + IS + Escritura', value: EUR((a.imt || 0) + (a.imposto_selo || 0) + (a.escritura || 0)) },
      { label: 'Total Aquisição', value: EUR(a.total_aquisicao), total: true },
      { label: 'Obra com IVA', value: EUR(a.obra_com_iva || obra) },
      { label: 'Custos Detenção', value: EUR(a.total_manutencao) },
      { label: 'VVR (conservador)', value: EUR(vvr) },
      { label: 'Comissão Venda', value: EUR(a.comissao_com_iva) },
      { label: `Impostos (${a.regime_fiscal || 'Empresa'})`, value: EUR(a.impostos) },
    ])
    b.space(4)

    b.header('RESULTADO')
    b.simpleTable([
      { label: 'Lucro Bruto', value: EUR(a.lucro_bruto) },
      { label: 'Impostos', value: EUR(a.impostos) },
      { label: 'Lucro Líquido', value: EUR(a.lucro_liquido), total: true },
      { label: 'Retorno Total', value: PCT(a.retorno_total) },
      { label: 'Retorno Anualizado', value: PCT(a.retorno_anualizado) },
      { label: 'Cash-on-Cash', value: PCT(a.cash_on_cash) },
    ])
    b.space(4)

    // CAEP
    let caep = a.caep
    if (typeof caep === 'string') try { caep = JSON.parse(caep) } catch { caep = null }
    if (caep) {
      b.header('ESTRUTURA CAEP')
      b.inlineData([{ label: '% Somnium', value: PCT(caep.perc_somnium || 40) }, { label: 'Base Distribuição', value: caep.base_distribuicao || 'Lucro bruto' }])
      if (caep.investidores && caep.investidores.length > 0) {
        b.space(4)
        b.colTable(
          [['Investidor', 140], ['Capital', 90], ['%', 60], ['Lucro', 70], ['ROI', 60], ['RA', 60]],
          caep.investidores.map((inv, i) => ({ _values: [inv.nome || `Inv. ${i+1}`, EUR(inv.capital), PCT(inv.perc), EUR(inv.lucro), PCT(inv.roi), PCT(inv.ra)] }))
        )
      }
      b.space(4)
    } else {
      b.header('MODELO DE PARCERIA')
      b.simpleTable([
        { label: 'Investidor(es) passivo(s)', value: '50% do lucro' },
        { label: 'Somnium Properties', value: '50% (gestão operacional + obra)' },
        { label: 'Documentação', value: 'Acesso total via Google Drive' },
        { label: 'Relatórios', value: 'Semanais de obra com fotos e vídeos' },
        { label: 'Comunicação', value: 'Canal dedicado via Slack' },
      ])
      b.space(4)
    }

    // Stress Tests
    if (a.stress_tests) {
      let st = a.stress_tests
      if (typeof st === 'string') try { st = JSON.parse(st) } catch { st = null }
      if (st) {
        b.header('TESTES DE STRESS')
        b.bigNumbers([
          { label: 'Pior Cenário', value: EUR(st.pior?.lucro_liquido) },
          { label: 'Cenário Base', value: EUR(st.base?.lucro_liquido) },
          { label: 'Melhor Cenário', value: EUR(st.melhor?.lucro_liquido) },
        ])
        b.space(4)
      }
    }

    b.header('ESTRATÉGIA DE SAÍDA')
    b.simpleTable([
      { label: '1. Exclusividade 15 dias para consultor original', value: '' },
      { label: '2. Top 2-3 consultores de Coimbra', value: '' },
      { label: '3. Ajuste de preço (-5%) após 2 meses sem venda', value: '' },
      { label: '4. Plano B: conversão para arrendamento (estudantes)', value: '' },
    ])
    b.space(4)

    b.header('TRANSPARÊNCIA E COMUNICAÇÃO')
    b.simpleTable([
      { label: 'Google Drive exclusivo com toda a documentação do negócio', value: '' },
      { label: 'Canal Slack dedicado para comunicação em tempo real', value: '' },
      { label: 'Relatórios semanais de obra com fotos e vídeos', value: '' },
      { label: 'Acesso a orçamentos, faturas e contratos', value: '' },
      { label: 'Acesso vitalício aos documentos do negócio', value: '' },
    ])

    b.space(4)
    b.text('Os valores apresentados são estimativas conservadoras baseadas em análise de mercado e podem variar. A Somnium Properties utiliza stress tests automáticos em todos os negócios para protecção do investidor. Investimento imobiliário envolve risco de capital.', { size: 7, color: C.muted })
    b.disclaimer()
    return b.end()
  },

  // ── 7. RESUMO DE NEGOCIAÇÃO ───────────────────────────────
  resumo_negociacao: (im) => {
    const b = new DocBuilder('Resumo de Negociação', im.zona || '', im)
    b.header('DADOS')
    b.simpleTable([
      { label: 'Imóvel', value: im.nome }, { label: 'Ask Price', value: EUR(im.ask_price) },
      { label: 'Valor Proposta', value: EUR(im.valor_proposta) }, { label: 'Consultor', value: im.nome_consultor },
    ])
    b.space(4)

    for (let i = 1; i <= 4; i++) {
      b.subheader(`Proposta ${i}`)
      b.simpleTable([
        { label: 'Data', value: '________________' }, { label: 'Valor', value: '________________' },
        { label: 'Resposta do Proprietário', value: '________________' },
        { label: 'Notas', value: '________________' },
      ])
      b.space(4)
    }
    b.header('ESTADO ACTUAL')
    b.metric('Ponto de situação da negociação', '________________')
    b.disclaimer()
    return b.end()
  },

  // ── 8. RESUMO DE ACORDO ───────────────────────────────────
  resumo_acordo: (im) => {
    const b = new DocBuilder('Resumo de Acordo', im.zona || '', im)
    b.header('TERMOS ACORDADOS')
    b.bigNumbers([{ label: 'Valor Final de Compra', value: EUR(im.valor_proposta || im.ask_price) }])
    b.simpleTable([
      { label: 'Data Proposta Aceite', value: FDATE(im.data_proposta_aceite) },
      { label: 'Consultor', value: im.nome_consultor },
    ])
    b.space(4)
    b.header('CONDIÇÕES DO CPCV')
    b.simpleTable([
      { label: 'Sinal', value: '________________' },
      { label: 'Prazo para escritura', value: '________________' },
      { label: 'Condições suspensivas', value: '________________' },
      { label: 'Penalizações', value: '________________' },
    ])
    b.space(4)
    b.header('TIMELINE')
    b.simpleTable([
      { label: 'Data CPCV', value: '________________' }, { label: 'Data Escritura', value: '________________' },
      { label: 'Início Obra', value: '________________' }, { label: 'Conclusão Obra', value: '________________' },
      { label: 'Data Prevista Venda', value: '________________' },
    ])
    b.space(4)
    b.header('PASSOS LEGAIS')
    b.simpleTable([
      'Validação documental', 'Licenciamento (se necessário)', 'Aprovação bancária (se financiado)', 'Assinatura CPCV', 'Escritura',
    ].map(p => ({ label: `□  ${p}`, value: '' })))
    b.disclaimer()
    return b.end()
  },

  // ── 9. DOSSIER DE INVESTIMENTO (versão final = apresentação)
  dossier_investimento: (im, analise) => GENERATORS.apresentacao_investidor(im, analise),

  // ── 10. FICHA FOLLOW UP ───────────────────────────────────
  ficha_follow_up: (im) => {
    const b = new DocBuilder('Ficha de Follow Up', im.zona || '', im)
    b.header('ESTADO ACTUAL')
    b.simpleTable([
      { label: 'Imóvel', value: im.nome }, { label: 'Estado', value: (im.estado || '').replace(/^\d+-/, '') },
      { label: 'Consultor', value: im.nome_consultor }, { label: 'Data Follow Up', value: FDATE(im.data_follow_up) },
    ])
    b.space(4)
    b.header('PONTO DE SITUAÇÃO')
    b.metric('O que aconteceu desde o último contacto?', '________________')
    b.space(4)
    b.header('PRÓXIMAS AÇÕES')
    b.simpleTable([1, 2, 3, 4, 5].map(i => ({ label: `□  Ação ${i}`, value: '' })))
    b.inlineData([{ label: 'Data próximo contacto', value: '________________' }, { label: 'Data limite decisão', value: '________________' }])
    b.metric('Notas', '________________')
    b.disclaimer()
    return b.end()
  },

  // ── 11. FICHA CEDÊNCIA DE POSIÇÃO ─────────────────────────
  ficha_cedencia: (im) => {
    const b = new DocBuilder('Ficha de Cedência de Posição', im.zona || '', im)
    b.header('DADOS DO NEGÓCIO')
    b.simpleTable([
      { label: 'Imóvel', value: im.nome }, { label: 'Zona', value: im.zona },
    ])
    b.bigNumbers([{ label: 'Valor de Entrada (compra)', value: EUR(im.valor_proposta || im.ask_price) }])
    b.simpleTable([
      { label: 'Valor de Saída (cedência)', value: '________________' },
      { label: 'Margem', value: '________________' },
    ])
    b.space(4)
    b.header('COMPRADOR / CESSIONÁRIO')
    b.simpleTable([
      { label: 'Nome', value: '________________' }, { label: 'Contacto', value: '________________' },
      { label: 'Email', value: '________________' }, { label: 'Capital confirmado', value: '________________' },
      { label: 'Data prevista cedência', value: '________________' },
    ])
    b.space(4)
    b.header('CONDIÇÕES DA CEDÊNCIA')
    b.metric('Termos e condições acordados', '________________')
    b.disclaimer()
    return b.end()
  },

  // ── 12. FICHA ACOMPANHAMENTO DE OBRA ──────────────────────
  ficha_acompanhamento_obra: (im) => {
    const b = new DocBuilder('Acompanhamento de Obra', im.zona || '', im)
    b.header('DADOS DO PROJECTO')
    b.simpleTable([
      { label: 'Imóvel', value: im.nome }, { label: 'Zona', value: im.zona },
      { label: 'Modelo', value: im.modelo_negocio || 'CAEP' }, { label: 'Custo Estimado', value: EUR(im.custo_estimado_obra) },
      { label: 'Data Início Obra', value: '________________' }, { label: 'Data Prevista Conclusão', value: '________________' },
    ])
    b.space(4)
    b.header('EMPREITEIRO')
    b.simpleTable([
      { label: 'Nome / Empresa', value: '________________' }, { label: 'Contacto', value: '________________' },
      { label: 'Orçamento acordado', value: '________________' }, { label: 'Prazo acordado', value: '________________' },
    ])
    b.space(4)

    for (let sem = 1; sem <= 4; sem++) {
      b.header(`SEMANA ${sem}`)
      b.simpleTable([
        { label: 'Data', value: '________________' }, { label: 'Custos semana', value: '________________' },
        { label: 'Trabalhos realizados', value: '________________' },
        { label: 'Custos acumulados', value: '________________' }, { label: 'Problemas', value: '________________' },
        { label: 'Próximos trabalhos', value: '________________' },
      ])
      b.space(4)
    }

    b.header('DESVIOS AO ORÇAMENTO')
    b.simpleTable([
      { label: 'Orçamento inicial', value: EUR(im.custo_estimado_obra) },
      { label: 'Custos reais acumulados', value: '________________' },
      { label: 'Desvio (€)', value: '________________' },
      { label: 'Desvio (%)', value: '________________' },
      { label: 'Justificação do desvio', value: '________________' },
    ])
    b.disclaimer()
    return b.end()
  },

  // ══════════════════════════════════════════════════════════════
  // RELATÓRIOS PARA INVESTIDOR (estilo limpo, arejado, profissional)
  // ══════════════════════════════════════════════════════════════

  relatorio_investimento: (im, an) => {
    const b = new DocBuilder('Análise de Investimento', im.zona || '', im)
    if (!an) { b.text('Sem análise financeira activa para este imóvel.'); return b.end() }

    const ra = an.retorno_anualizado || 0

    // 3 numeros-chave — grandes, texto puro, sem caixas
    b.bigNumbers([
      { label: 'Lucro Líquido', value: EUR(an.lucro_liquido) },
      { label: 'Retorno Anualizado', value: `${ra}%` },
      { label: 'Capital Necessário', value: EUR(an.capital_necessario) },
    ])

    // Enquadramento inline
    b.inlineData([
      { label: 'Zona', value: im.zona || '—' },
      { label: 'Tipologia', value: im.tipologia || '—' },
      { label: 'Prazo', value: `${an.meses || 6} meses` },
      { label: 'Regime', value: an.regime_fiscal || 'Empresa' },
    ])
    b.space(8)

    // Custos — tabela unica limpa
    b.header('CUSTOS DO INVESTIMENTO')
    b.simpleTable([
      { label: 'Preço de compra', value: EUR(an.compra) },
      { label: 'IMT', value: EUR(an.imt) },
      { label: 'Imposto de Selo', value: EUR(an.imposto_selo) },
      { label: 'Escritura + CPCV', value: EUR((an.escritura || 0) + (an.cpcv_compra || 0)) },
      { label: 'Total Aquisição', value: EUR(an.total_aquisicao), total: true },
      { label: 'Obra c/ IVA', value: EUR(an.obra_com_iva) },
      { label: 'Licenciamento', value: EUR(an.licenciamento) },
      { label: 'Total Obra', value: EUR(an.obra_com_iva), total: true },
      { label: `Detenção (${an.meses || 6} meses)`, value: EUR(an.total_detencao) },
      { label: `Comissão venda (${an.comissao_perc || 2.5}%)`, value: EUR(an.comissao_com_iva) },
      { label: 'Total Investimento', value: EUR(an.capital_necessario), total: true },
    ])
    b.space(6)

    // Resultado
    b.header('RESULTADO')
    b.simpleTable([
      { label: 'Receita de venda (VVR)', value: EUR(an.vvr) },
      { label: 'Total de custos', value: EUR(an.capital_necessario) },
      { label: 'Lucro Bruto', value: EUR(an.lucro_bruto), total: true },
      { label: 'Impostos (IRC + Derrama)', value: EUR(an.impostos) },
      { label: 'Retenção dividendos', value: EUR(an.retencao_dividendos) },
      { label: 'Lucro Líquido', value: EUR(an.lucro_liquido), total: true },
    ])
    b.space(6)

    // Metricas inline
    b.header('MÉTRICAS DE RETORNO')
    b.bigNumbers([
      { label: 'ROI Total', value: PCT(an.retorno_total) },
      { label: 'Retorno Anualizado', value: PCT(an.retorno_anualizado) },
      { label: 'Cash-on-Cash', value: PCT(an.cash_on_cash) },
      { label: 'Break-even', value: EUR(an.break_even) },
    ])

    b.disclaimer()
    return b.end()
  },

  relatorio_comparaveis: (im, an) => {
    const b = new DocBuilder('Estudo de Mercado', im.zona || '', im)
    const comps = an?.comparaveis
    const parsed = typeof comps === 'string' ? JSON.parse(comps || '[]') : (comps || [])
    if (!parsed.length) { b.text('Sem dados de comparáveis registados.'); return b.end() }

    b.inlineData([{ label: 'Imóvel', value: im.nome }, { label: 'Zona', value: im.zona }])
    b.space(6)

    for (const tip of parsed) {
      const items = tip.comparaveis || []
      const valid = items.filter(c => c.preco > 0 && c.area > 0)
      if (valid.length === 0) continue

      const precosM2 = valid.map(c => {
        const base = c.preco / c.area
        const ajTotal = Object.values(c.ajustes || {}).reduce((s, v) => s + (parseFloat(v) || 0), 0)
        return base * (1 + ajTotal / 100)
      })
      const media = Math.round(precosM2.reduce((a, b) => a + b, 0) / precosM2.length)
      const vvr = media * (tip.area || 0)

      b.header(`${tip.tipologia || 'Tipologia'} — ${tip.area || '?'} m²`)
      b.bigNumbers([
        { label: 'VVR Estimado', value: EUR(vvr) },
        { label: 'Média €/m²', value: `${media} €/m²` },
        { label: 'Amostra', value: `${valid.length} comparáveis` },
      ])

      b.colTable(
        [['#', 25], ['Preço', 70], ['Área', 45], ['€/m²', 50], ['Neg.', 45], ['Loc.', 45], ['Idade', 45], ['Cons.', 45], ['Total', 50]],
        valid.map((c, i) => {
          const aj = c.ajustes || {}
          const ajTotal = Object.values(aj).reduce((s, v) => s + (parseFloat(v) || 0), 0)
          return { _values: [`${i + 1}`, EUR(c.preco), `${c.area}m²`, `${Math.round(c.preco / c.area)}`, `${aj.neg || 0}%`, `${aj.loc || 0}%`, `${aj.idade || 0}%`, `${aj.conserv || 0}%`, `${ajTotal >= 0 ? '+' : ''}${ajTotal}%`] }
        })
      )
      b.space(10)
    }
    b.disclaimer()
    return b.end()
  },

  relatorio_caep: (im, an) => {
    const b = new DocBuilder('Parceria CAEP — Distribuição de Lucro', im.zona || '', im)
    const caep = an?.caep
    const parsed = typeof caep === 'string' ? JSON.parse(caep || 'null') : caep
    if (!parsed || parsed.quota_somnium === undefined) { b.text('Sem dados CAEP configurados.'); return b.end() }

    const percInv = 100 - parsed.perc_somnium
    const captado = parsed.capital_total || 0
    const necessario = an?.capital_necessario || captado
    const cobertura = necessario > 0 ? Math.round(captado / necessario * 100) : 100

    b.header('ENQUADRAMENTO DA PARCERIA')
    b.inlineData([
      { label: 'Estrutura', value: 'Associação em Participação' },
      { label: 'Base', value: parsed.base_distribuicao === 'liquido' ? 'Lucro Líquido (após IRC)' : 'Lucro Bruto' },
    ])
    b.space(6)

    b.header('CAPITAL DA OPERAÇÃO')
    b.bigNumbers([
      { label: 'Necessário', value: EUR(necessario) },
      { label: 'Captado', value: EUR(captado) },
      { label: 'Cobertura', value: `${cobertura}%` },
    ])

    if (parsed.investidores?.length) {
      b.colTable(
        [['#', 30], ['Investidor', 140], ['Tipo', 100], ['Capital', 100], ['% Capital', 80]],
        [
          ...parsed.investidores.map((inv, i) => ({
            _values: [`#${i + 1}`, inv.nome || `Investidor ${i + 1}`, inv.tipo === 'empresa' ? 'Empresa (IRC)' : 'Particular (IRS)', EUR(inv.capital), `${necessario > 0 ? ((inv.capital / necessario) * 100).toFixed(1) : 0}%`]
          })),
          { _values: ['', 'Total captado', '', EUR(captado), `${cobertura}%`], _total: true },
        ]
      )
      b.space(6)

      b.header('DISTRIBUIÇÃO DO LUCRO')
      b.colTable(
        [['#', 25], ['Parte', 95], ['Tipo', 70], ['%', 30], ['Lucro', 65], ['Imposto', 55], ['Líquido', 60], ['ROI', 50]],
        [
          { _values: ['S', 'Somnium Properties', 'Gestor', `${parsed.perc_somnium}%`, EUR(parsed.quota_somnium), '—', EUR(parsed.quota_somnium), '—'] },
          ...parsed.investidores.map((inv, i) => ({
            _values: [`#${i + 1}`, inv.nome || `Inv. ${i + 1}`, inv.tipo === 'empresa' ? 'Empresa' : 'Particular', `${inv.perc_lucro || 0}%`, EUR(inv.lucro_bruto), EUR(inv.impostos), EUR(inv.lucro_liquido), inv.roi ? `${inv.roi}%` : '—']
          })),
          { _values: ['', 'Total distribuído', '', '', '', '', EUR((parsed.investidores.reduce((s, inv) => s + (inv.lucro_liquido || 0), 0)) + parsed.quota_somnium), ''], _total: true },
        ]
      )
    }

    b.disclaimer()
    return b.end()
  },

  relatorio_stress: (im, an) => {
    const b = new DocBuilder('Análise de Risco', im.zona || '', im)
    const st = an?.stress_tests
    const parsed = typeof st === 'string' ? JSON.parse(st || 'null') : st
    if (!parsed) { b.text('Sem stress tests calculados.'); return b.end() }

    const resiliente = parsed.veredicto === 'resiliente'

    b.header('VEREDICTO')
    b.verdict(
      resiliente ? 'Investimento resiliente — mantém resultado positivo em todos os cenários.' : 'Atenção — cenários com risco de prejuízo identificados.',
      resiliente
    )
    b.space(6)

    b.header('CENÁRIOS PRINCIPAIS')
    b.bigNumbers([
      { label: 'Pior Cenário', value: EUR(parsed.pior?.lucro_liquido) },
      { label: 'Cenário Base', value: EUR(parsed.base?.lucro_liquido) },
      { label: 'Melhor Cenário', value: EUR(parsed.melhor?.lucro_liquido) },
    ])
    b.inlineData([
      { label: 'Pior', value: parsed.pior?.label || '—' },
      { label: 'Melhor', value: parsed.melhor?.label || '—' },
    ])
    b.space(6)

    if (parsed.downside?.length) {
      b.header('CENÁRIOS DE RISCO')
      b.colTable(
        [['Cenário', 110], ['Descrição', 140], ['Lucro Líq.', 80], ['Delta', 70], ['RA', 55]],
        parsed.downside.map(s => ({ _values: [s.label, s.descricao || '', EUR(s.lucro_liquido), EUR(s.delta), PCT(s.retorno_anualizado)] }))
      )
    }

    if (parsed.upside?.length) {
      b.space(6)
      b.header('CENÁRIOS FAVORÁVEIS')
      b.colTable(
        [['Cenário', 110], ['Descrição', 140], ['Lucro Líq.', 80], ['Delta', 70], ['RA', 55]],
        parsed.upside.map(s => ({ _values: [s.label, s.descricao || '', EUR(s.lucro_liquido), EUR(s.delta), PCT(s.retorno_anualizado)] }))
      )
    }

    b.disclaimer()
    return b.end()
  },
}

// ── Compilador de relatório para investidor ─────────────────
export function generateInvestorReport(imovel, analise, seccoes = []) {
  const doc = new PDFDocument({ size: 'A4', autoFirstPage: false })

  // Capa
  doc.addPage({ size: 'A4', margins: { top: 0, bottom: 0, left: 0, right: 0 } })
  doc.rect(0, 0, PW, PH).fill(C.black)
  doc.rect(0, 0, PW, 4).fill(C.gold)
  try { doc.image(readFileSync(LOGO_PATH), (PW - 150) / 2, 120, { width: 150 }) } catch {}
  doc.rect(PW / 2 - 20, 250, 40, 1).fill(C.gold)
  doc.fontSize(8).fillColor(C.gold).text('DOSSIER DE INVESTIMENTO', ML, 270, { width: CW, align: 'center', characterSpacing: 4 })
  doc.fontSize(24).fillColor(C.white).text(imovel.nome || 'Imóvel', ML, 310, { width: CW, align: 'center' })
  if (imovel.zona) doc.fontSize(12).fillColor(C.muted).text(imovel.zona, ML, 350, { width: CW, align: 'center' })
  doc.fontSize(9).fillColor(C.muted).text(NOW(), ML, 380, { width: CW, align: 'center' })

  // Índice
  doc.fontSize(10).fillColor(C.gold).text('CONTEÚDO', ML, 430, { width: CW, align: 'center' })
  let idx = 1
  const labels = {
    investimento: 'Análise de Investimento',
    comparaveis: 'Estudo de Comparáveis',
    caep: 'Distribuição CAEP',
    stress_tests: 'Stress Tests',
  }
  for (const s of seccoes) {
    doc.fontSize(11).fillColor(C.white).text(`${idx}. ${labels[s] || s}`, ML + 60, 460 + (idx - 1) * 22, { width: CW - 120, align: 'center' })
    idx++
  }

  doc.rect(0, PH - 45, PW, 45).fill('#1a1a1a')
  doc.rect(0, PH - 45, PW, 1).fill(C.gold).opacity(0.3); doc.opacity(1)
  doc.fontSize(7).fillColor(C.gold).text('SOMNIUM PROPERTIES — CONFIDENCIAL', ML, PH - 28, { width: CW, align: 'center' })

  doc.end()

  // Para cada seccao, gerar PDF separado e indicar ao frontend
  // (PDFKit nao suporta merge nativo — geramos cada seccao como paginas adicionais)
  // Alternativa: gerar tudo num unico DocBuilder
  return doc
}

// Gerar compilado num unico fluxo
export function generateCompiledReport(imovel, analise, seccoes = []) {
  // Gera um unico PDF com capa + conteudo real de cada seccao seleccionada
  // Cada seccao e gerada individualmente e concatenada
  // Como PDFKit nao permite merge, geramos cada seccao como documento separado
  // e o endpoint retorna o primeiro com conteudo

  // Abordagem simples: gerar o primeiro relatorio seleccionado que tenha dados
  // Para compilado completo, redirigir para gerador individual
  const generatorMap = {
    investimento: 'relatorio_investimento',
    comparaveis: 'relatorio_comparaveis',
    caep: 'relatorio_caep',
    stress_tests: 'relatorio_stress',
  }

  // Se so 1 seccao, gerar directamente esse relatorio
  if (seccoes.length === 1) {
    const tipo = generatorMap[seccoes[0]]
    if (tipo && GENERATORS[tipo]) return GENERATORS[tipo](imovel, analise)
  }

  // Para multiplas seccoes: gerar um DocBuilder unico com todo o conteudo
  const b = new DocBuilder('Dossier de Investimento', imovel.zona || '', imovel)
  const an = analise
  const im = imovel

  for (const seccao of seccoes) {
    // Reset section counter para cada seccao

    if (seccao === 'investimento' && an) {
      const ra = an.retorno_anualizado || 0
      b.bigNumbers([
        { label: 'Lucro Líquido', value: EUR(an.lucro_liquido) },
        { label: 'Retorno Anualizado', value: `${ra}%` },
        { label: 'Capital Necessário', value: EUR(an.capital_necessario) },
      ])
      b.inlineData([
        { label: 'Zona', value: im.zona || '—' },
        { label: 'Tipologia', value: im.tipologia || '—' },
        { label: 'Prazo', value: `${an.meses || 6} meses` },
      ])
      b.space(6)
      b.header('CUSTOS DO INVESTIMENTO')
      b.simpleTable([
        { label: 'Preço de compra', value: EUR(an.compra) },
        { label: 'IMT + Selo + Escritura', value: EUR((an.imt || 0) + (an.imposto_selo || 0) + (an.escritura || 0) + (an.cpcv_compra || 0)) },
        { label: 'Total Aquisição', value: EUR(an.total_aquisicao), total: true },
        { label: 'Obra c/ IVA', value: EUR(an.obra_com_iva) },
        { label: 'Total Obra', value: EUR(an.obra_com_iva), total: true },
        { label: `Detenção + Comissão`, value: EUR((an.total_detencao || 0) + (an.comissao_com_iva || 0)) },
        { label: 'Total Investimento', value: EUR(an.capital_necessario), total: true },
      ])
      b.space(4)
      b.header('RESULTADO')
      b.simpleTable([
        { label: 'Receita (VVR)', value: EUR(an.vvr) },
        { label: 'Custos totais', value: EUR(an.capital_necessario) },
        { label: 'Lucro Bruto', value: EUR(an.lucro_bruto), total: true },
        { label: 'Impostos + Dividendos', value: EUR((an.impostos || 0) + (an.retencao_dividendos || 0)) },
        { label: 'Lucro Líquido', value: EUR(an.lucro_liquido), total: true },
      ])
      b.space(4)
      b.bigNumbers([
        { label: 'ROI Total', value: PCT(an.retorno_total) },
        { label: 'Retorno Anualizado', value: PCT(an.retorno_anualizado) },
        { label: 'Cash-on-Cash', value: PCT(an.cash_on_cash) },
        { label: 'Break-even', value: EUR(an.break_even) },
      ])
    }

    if (seccao === 'comparaveis' && an) {
      const comps = typeof an.comparaveis === 'string' ? JSON.parse(an.comparaveis || '[]') : (an.comparaveis || [])
      if (comps.length > 0) {
        b.newPage()
        for (const tip of comps) {
          const valid = (tip.comparaveis || []).filter(c => c.preco > 0 && c.area > 0)
          if (!valid.length) continue
          const precosM2 = valid.map(c => { const aj = Object.values(c.ajustes || {}).reduce((s, v) => s + (parseFloat(v) || 0), 0); return (c.preco / c.area) * (1 + aj / 100) })
          const media = Math.round(precosM2.reduce((a, b) => a + b, 0) / precosM2.length)
          b.header(`COMPARÁVEIS — ${tip.tipologia || '?'} ${tip.area || '?'}m²`)
          b.bigNumbers([
            { label: 'VVR Estimado', value: EUR(media * (tip.area || 0)) },
            { label: 'Média €/m²', value: `${media} €/m²` },
            { label: 'Amostra', value: `${valid.length} comp.` },
          ])
          b.colTable(
            [['#', 25], ['Preço', 70], ['Área', 45], ['€/m²', 50], ['Neg.', 45], ['Loc.', 45], ['Idade', 45], ['Total', 50]],
            valid.map((c, i) => { const aj = c.ajustes || {}; const t = Object.values(aj).reduce((s, v) => s + (parseFloat(v) || 0), 0); return { _values: [`${i + 1}`, EUR(c.preco), `${c.area}m²`, `${Math.round(c.preco / c.area)}`, `${aj.neg || 0}%`, `${aj.loc || 0}%`, `${aj.idade || 0}%`, `${t >= 0 ? '+' : ''}${t}%`] } })
          )
          b.space(8)
        }
      }
    }

    if (seccao === 'caep' && an) {
      const caep = typeof an.caep === 'string' ? JSON.parse(an.caep || 'null') : an.caep
      if (caep?.quota_somnium !== undefined) {
        b.newPage()
        const percInv = 100 - caep.perc_somnium
        b.header('PARCERIA CAEP')
        b.inlineData([
          { label: 'Somnium', value: `${caep.perc_somnium}%` },
          { label: 'Investidores', value: `${percInv}%` },
          { label: 'Base', value: caep.base_distribuicao === 'liquido' ? 'Lucro Líquido' : 'Lucro Bruto' },
        ])
        b.bigNumbers([
          { label: 'Quota Somnium', value: EUR(caep.quota_somnium) },
          { label: 'Capital Total', value: EUR(caep.capital_total) },
        ])
        if (caep.investidores?.length) {
          b.header('DISTRIBUIÇÃO DO LUCRO')
          b.colTable(
            [['#', 25], ['Investidor', 100], ['Tipo', 70], ['%', 30], ['Lucro', 65], ['Imposto', 55], ['Líquido', 60], ['ROI', 50]],
            [
              { _values: ['S', 'Somnium Properties', 'Gestor', `${caep.perc_somnium}%`, EUR(caep.quota_somnium), '—', EUR(caep.quota_somnium), '—'] },
              ...caep.investidores.map((inv, i) => ({ _values: [`#${i + 1}`, inv.nome || `Inv. ${i + 1}`, inv.tipo === 'empresa' ? 'Empresa' : 'Particular', `${inv.perc_lucro || 0}%`, EUR(inv.lucro_bruto), EUR(inv.impostos), EUR(inv.lucro_liquido), inv.roi ? `${inv.roi}%` : '—'] })),
              { _values: ['', 'Total', '', '', '', '', EUR(caep.investidores.reduce((s, i) => s + (i.lucro_liquido || 0), 0) + caep.quota_somnium), ''], _total: true },
            ]
          )
        }
      }
    }

    if (seccao === 'stress_tests' && an) {
      const st = typeof an.stress_tests === 'string' ? JSON.parse(an.stress_tests || 'null') : an.stress_tests
      if (st) {
        b.newPage()
        b.header('ANÁLISE DE RISCO')
        b.verdict(
          st.veredicto === 'resiliente' ? 'Investimento resiliente — lucro positivo em todos os cenários.' : 'Atenção — cenários com risco de prejuízo.',
          st.veredicto === 'resiliente'
        )
        b.bigNumbers([
          { label: 'Pior Cenário', value: EUR(st.pior?.lucro_liquido) },
          { label: 'Base', value: EUR(st.base?.lucro_liquido) },
          { label: 'Melhor', value: EUR(st.melhor?.lucro_liquido) },
        ])
        if (st.downside?.length) {
          b.subheader('Cenários de risco')
          b.colTable(
            [['Cenário', 110], ['Descrição', 150], ['Lucro', 75], ['Delta', 65], ['RA', 50]],
            st.downside.map(s => ({ _values: [s.label, s.descricao || '', EUR(s.lucro_liquido), EUR(s.delta), PCT(s.retorno_anualizado)] }))
          )
        }
        if (st.upside?.length) {
          b.space(4)
          b.subheader('Cenários favoráveis')
          b.colTable(
            [['Cenário', 110], ['Descrição', 150], ['Lucro', 75], ['Delta', 65], ['RA', 50]],
            st.upside.map(s => ({ _values: [s.label, s.descricao || '', EUR(s.lucro_liquido), EUR(s.delta), PCT(s.retorno_anualizado)] }))
          )
        }
      }
    }
  }

  b.disclaimer()
  return b.end()
}

