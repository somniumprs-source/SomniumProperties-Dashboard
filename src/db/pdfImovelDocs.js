/**
 * Documentos PDF profissionais por fase do imóvel.
 * Layout empresarial Somnium Properties — mobile-friendly.
 */
import PDFDocument from 'pdfkit'
import { readFileSync, existsSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const LOGO_PATH = path.resolve(__dirname, '../../public/logo-transparent.png')
const STRESS_DIR = path.resolve(__dirname, '../../public/uploads/stress_tests')

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
  'Adicionado':                      ['ficha_imovel'],
  'Necessidade de Visita':           ['ficha_visita'],
  'Estudo de VVR':                   ['analise_rentabilidade', 'estudo_comparaveis'],
  'Criar Proposta ao Proprietário':  ['proposta_formal'],
  'Enviar proposta ao Proprietário': ['proposta_formal'],
  'Em negociação':                   ['resumo_negociacao'],
  'Proposta aceite':                 ['resumo_acordo'],
  'Enviar proposta ao investidor':   ['dossier_investidor', 'proposta_investimento_anonima'],
  'Follow Up após proposta':         ['ficha_follow_up'],
  'Follow UP':                       ['ficha_follow_up'],
  'Wholesaling':                     ['ficha_cedencia'],
  'CAEP':                            ['ficha_acompanhamento_obra'],
  'Fix and Flip':                    ['ficha_acompanhamento_obra'],
  'Não interessa':                   ['ficha_descarte'],
}

export function getDocsForEstado(estado) { return ESTADO_DOC_MAP[estado] || [] }

const DOC_LABELS = {
  ficha_imovel: 'Ficha do Imóvel',
  ficha_visita: 'Ficha de Visita',
  analise_rentabilidade: 'Análise de Rentabilidade',
  estudo_comparaveis: 'Estudo de Comparáveis',
  proposta_formal: 'Proposta ao Proprietário',
  dossier_investidor: 'Dossier de Investimento',
  proposta_investimento_anonima: 'Proposta de Investimento (Anónima)',
  resumo_negociacao: 'Resumo de Negociação',
  resumo_acordo: 'Resumo de Acordo',
  ficha_follow_up: 'Ficha de Follow Up',
  ficha_cedencia: 'Ficha de Cedência',
  ficha_acompanhamento_obra: 'Acompanhamento de Obra',
  ficha_descarte: 'Ficha de Descarte',
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
// STRESS TEST RENDERER — layout duas colunas (custos | retornos)
// ══════════════════════════════════════════════════════════════

function renderStressTests(b, a, opts = {}) {
  let st = a.stress_tests
  if (!st) return
  if (typeof st === 'string') try { st = JSON.parse(st) } catch { return }
  if (!st) return

  if (opts.newPage) b.newPage()
  b.header(opts.title || 'ANÁLISE DE SENSIBILIDADE — STRESS TESTS')

  // Tentar usar screenshot da UI (capturado pelo frontend)
  const screenshotPath = path.join(STRESS_DIR, `${a.id}.png`)
  if (a.id && existsSync(screenshotPath)) {
    try {
      const imgData = readFileSync(screenshotPath)
      // Calcular altura proporcional para a largura do conteudo
      const imgWidth = CW
      const imgHeight = imgWidth * 0.55 // ratio aproximado do componente
      b.ensure(imgHeight + 20)
      b.doc.image(imgData, ML, b.y, { width: imgWidth, fit: [imgWidth, imgHeight] })
      b.y += imgHeight + 10
      b.disclaimer()
      return
    } catch (e) {
      // Fallback para layout programatico se imagem falhar
    }
  }

  // Fallback: layout programatico
  const resiliente = st.veredicto === 'resiliente'
  b.verdict(
    resiliente ? 'Investimento resiliente — mantém resultado positivo em todos os cenários testados.' : 'Atenção — identificados cenários com risco de prejuízo.',
    resiliente
  )
  b.space(4)

  b.bigNumbers([
    { label: 'Pior Cenário', value: EUR(st.pior?.lucro_liquido) },
    { label: 'Cenário Base', value: EUR(st.base?.lucro_liquido) },
    { label: 'Melhor Cenário', value: EUR(st.melhor?.lucro_liquido) },
  ])
  b.space(4)

  b.simpleTable([
    ...(st.base ? [{ label: 'Base — RA', value: PCT(st.base.retorno_anualizado) }] : []),
    ...(st.pior ? [{ label: 'Pior Cenário — RA', value: PCT(st.pior.retorno_anualizado) }] : []),
    ...(st.melhor ? [{ label: 'Melhor Cenário — RA', value: PCT(st.melhor.retorno_anualizado) }] : []),
  ])

  if (st.downside?.length) {
    b.space(4)
    b.subheader('Cenários de Risco (Downside)')
    b.colTable(
      [['Cenário', 100], ['Descrição', 140], ['Lucro Líq.', 75], ['Delta', 65], ['RA', 55]],
      st.downside.map(s => ({ _values: [s.label, s.descricao || '', EUR(s.lucro_liquido), EUR(s.delta), PCT(s.retorno_anualizado)] }))
    )
  }

  if (st.upside?.length) {
    b.space(4)
    b.subheader('Cenários Favoráveis (Upside)')
    b.colTable(
      [['Cenário', 100], ['Descrição', 140], ['Lucro Líq.', 75], ['Delta', 65], ['RA', 55]],
      st.upside.map(s => ({ _values: [s.label, s.descricao || '', EUR(s.lucro_liquido), EUR(s.delta), PCT(s.retorno_anualizado)] }))
    )
  }
}

// ══════════════════════════════════════════════════════════════
// RENDER FUNCTIONS — desenham conteudo num DocBuilder existente.
// Os GENERATORS criam DocBuilder + capa e delegam aqui;
// generateCompiledReport chama-as inline para combinar seccoes.
// ══════════════════════════════════════════════════════════════

function renderFichaImovel(b, im) {
  const fotos = parseFotos(im)
  b.inlineData([{ label: 'Estado', value: (im.estado || '').replace(/^\d+-/, '') }, { label: 'Data', value: FDATE(im.data_adicionado) }, { label: 'Origem', value: im.origem }])
  b.space(4)
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
}

function renderFichaVisita(b, im) {
  const fotos = parseFotos(im)
  b.header('IDENTIFICAÇÃO DO IMÓVEL')
  b.simpleTable([
    { label: 'Nome / Referência', value: im.nome },
    { label: 'Tipologia', value: im.tipologia },
    { label: 'Zona', value: im.zona },
    { label: 'Modelo de Negócio', value: im.modelo_negocio },
    { label: 'Origem do Lead', value: im.origem },
    { label: 'Consultor Responsável', value: im.nome_consultor },
    { label: 'Data Adicionado', value: FDATE(im.data_adicionado) },
    { label: 'Data da Chamada', value: FDATE(im.data_chamada) },
    { label: 'Data da Visita', value: FDATE(im.data_visita) },
    { label: 'Link do Anúncio', value: im.link || '—' },
  ])
  b.space(4)

  b.header('ÁREAS E CARACTERÍSTICAS')
  b.simpleTable([
    { label: 'Área Útil', value: im.area_util ? `${im.area_util} m²` : '—' },
    { label: 'Área Bruta', value: im.area_bruta ? `${im.area_bruta} m²` : '—' },
    { label: 'Preço por m² (Ask)', value: im.ask_price && im.area_util ? EUR(Math.round(im.ask_price / im.area_util)) + '/m²' : '—' },
  ])
  b.space(4)

  b.header('ENQUADRAMENTO FINANCEIRO')
  b.bigNumbers([
    { label: 'Ask Price', value: EUR(im.ask_price) },
    { label: 'Proposta Estimada', value: EUR(im.valor_proposta) },
    { label: 'VVR Estimado', value: EUR(im.valor_venda_remodelado) },
  ])
  b.simpleTable([
    { label: 'Custo Estimado de Obra', value: EUR(im.custo_estimado_obra) },
    { label: 'ROI Estimado', value: PCT(im.roi) },
    { label: 'ROI Anualizado Estimado', value: PCT(im.roi_anualizado) },
    { label: 'Desconto face ao Ask Price', value: im.ask_price && im.valor_proposta ? PCT(Math.round((1 - im.valor_proposta / im.ask_price) * 100)) : '—' },
  ])
  b.space(4)

  if (fotos.length > 0) b.photos(fotos, 'FOTOGRAFIAS DO ANÚNCIO')

  b.header('PONTOS A AVALIAR NA VISITA')
  b.subheader('Estrutural')
  b.simpleTable([
    'Fachada: fissuras, humidade, descasque de reboco, eflorescências',
    'Telhado / cobertura: telhas partidas, infiltrações, isolamento térmico',
    'Fundações: assentamentos visíveis, fissuras em escada',
    'Paredes interiores: fissuras, humidade ascendente, bolor',
    'Tectos: manchas de água, deformações, descasque',
    'Pavimentos: nivelamento, estado do revestimento, soalho podre',
    'Laje / estrutura: vigas expostas, ferrugem em armaduras, flexão',
  ].map(p => ({ label: `□  ${p}`, value: '' })))
  b.space(4)

  b.subheader('Instalações Técnicas')
  b.simpleTable([
    'Quadro eléctrico: disjuntores, terra, estado geral, potência contratada',
    'Tomadas e interruptores: quantidade e funcionamento',
    'Canalização de água: pressão, tubagens (cobre, PPR, ferro), fugas',
    'Esgotos: cheiros, escoamento lento, caixas de visita',
    'Aquecimento: tipo de sistema (central, esquentador, caldeira), estado',
    'Gás: tipo de instalação, certificação, segurança',
    'Ventilação: VMC, exaustores, ventilação natural nas casas de banho',
  ].map(p => ({ label: `□  ${p}`, value: '' })))
  b.space(4)

  b.subheader('Caixilharia e Isolamento')
  b.simpleTable([
    'Janelas: material (alumínio, PVC, madeira), vidro simples ou duplo',
    'Estores / portadas: funcionamento e estado',
    'Isolamento térmico: paredes exteriores, cobertura, pontes térmicas',
    'Isolamento acústico: ruído exterior, entre fracções',
  ].map(p => ({ label: `□  ${p}`, value: '' })))
  b.space(4)

  b.subheader('Espaços Húmidos')
  b.simpleTable([
    'Cozinha: bancada, armários, equipamentos, ventilação, ponto de água',
    'WC: louças sanitárias, torneiras, impermeabilização, ventilação',
    'Azulejos: estado, fissuras, descolamentos',
  ].map(p => ({ label: `□  ${p}`, value: '' })))
  b.space(4)

  b.subheader('Envolvente e Localização')
  b.simpleTable([
    'Orientação solar e luminosidade natural dos compartimentos',
    'Acessos ao imóvel: estrada, passeios, rampa, escadas',
    'Estacionamento: garagem, lugar de parqueamento, rua',
    'Vizinhança: tipo de zona, ruído, segurança, serviços próximos',
    'Transportes públicos e acessos rodoviários',
    'Possibilidade de ampliação ou alteração de layout (PDM)',
    'Existência de logradouro, quintal ou terraço',
  ].map(p => ({ label: `□  ${p}`, value: '' })))
  b.space(4)

  b.header('PERGUNTAS AO PROPRIETÁRIO / MEDIADOR')
  b.subheader('Motivação e Urgência')
  b.simpleTable([
    'Há quanto tempo está à venda? Já baixou o preço?',
    'Motivo da venda? (herança, divórcio, emigração, necessidade financeira)',
    'Existe urgência na venda? Prazo pretendido?',
    'Está aberto a CPCV com sinal reduzido?',
  ].map(p => ({ label: `□  ${p}`, value: '' })))
  b.space(4)
  b.subheader('Negociação e Valor')
  b.simpleTable([
    'Valor mínimo que aceita? Margem de negociação?',
    'Já recebeu outras propostas? Qual o valor?',
    'Aceita permuta ou pagamento faseado?',
    'Quem é o decisor? (um proprietário, vários herdeiros, tribunal)',
  ].map(p => ({ label: `□  ${p}`, value: '' })))
  b.space(4)
  b.subheader('Situação Jurídica e Técnica')
  b.simpleTable([
    'Algum problema estrutural ou legal conhecido?',
    'Documentação em dia? (caderneta, certidão permanente, licença)',
    'Existem ónus, hipotecas, penhoras ou litígios?',
    'Área real corresponde à área registada? Há áreas não licenciadas?',
    'Existem obras recentes não declaradas?',
    'O imóvel está arrendado ou ocupado?',
    'Condomínio: valor mensal, dívidas, obras previstas no prédio?',
  ].map(p => ({ label: `□  ${p}`, value: '' })))
  b.space(4)

  b.header('DOCUMENTOS A SOLICITAR')
  b.subheader('Obrigatórios')
  b.simpleTable([
    'Caderneta predial urbana (actualizada)',
    'Certidão permanente do registo predial (com encargos)',
    'Licença de utilização',
    'Certificado energético',
    'Plantas do imóvel (aprovadas pela Câmara)',
  ].map(p => ({ label: `□  ${p}`, value: '' })))
  b.space(4)
  b.subheader('Complementares')
  b.simpleTable([
    'Ficha técnica da habitação (pós-2004)',
    'Declaração de dívidas ao condomínio',
    'Certidão de teor (se herança)',
    'Habilitação de herdeiros (se herança)',
    'Planta de localização e extracto do PDM',
    'Projecto de arquitectura (se disponível)',
    'Certificado de conformidade das instalações de gás',
  ].map(p => ({ label: `□  ${p}`, value: '' })))
  b.space(4)

  if (im.notas) {
    b.header('NOTAS DO CRM')
    b.textBlock(im.notas)
    b.space(4)
  }

  b.header('NOTAS DE CAMPO (PRÉ-VISITA)')
  b.input('Impressão geral do contacto telefónico', '', { tall: true })
  b.input('Pontos críticos a confirmar na visita', '', { tall: true })
  b.input('Estratégia de negociação a adoptar', '', { tall: true })
  b.space(4)

  b.newPage()
  b.header('CHECKLIST DE VISITA')
  b.note('B = Bom (sem intervenção)  ·  R = Razoável (intervenção ligeira)  ·  M = Mau (intervenção profunda)  ·  N/A = Não aplicável')
  b.space(4)

  b.header('1. ESTRUTURA E EXTERIOR')
  b.colTable(
    [['Elemento', 250], ['B', 40], ['R', 40], ['M', 40], ['Observações', 100]],
    ['Fachada (reboco, pintura, fissuras)', 'Telhado / cobertura (telhas, isolamento)', 'Chaminés e saídas de ventilação', 'Terraço / varanda (impermeabilização)', 'Garagem / estacionamento coberto', 'Muros / vedação / portões', 'Logradouro / jardim / quintal', 'Fundações (assentamentos visíveis)', 'Caixas de estore exteriores'].map(item => ({ _values: [item, '□', '□', '□', ''] }))
  )
  b.space(4)

  b.header('2. INTERIOR — COMPARTIMENTOS')
  b.colTable(
    [['Elemento', 250], ['B', 40], ['R', 40], ['M', 40], ['Observações', 100]],
    ['Hall de entrada', 'Sala de estar', 'Sala de jantar', 'Cozinha', 'Quarto 1 (suite)', 'Quarto 2', 'Quarto 3', 'WC 1', 'WC 2', 'Despensa / arrecadação', 'Corredor / circulação'].map(item => ({ _values: [item, '□', '□', '□', ''] }))
  )
  b.space(4)

  b.header('3. PAREDES, TECTOS E PAVIMENTOS')
  b.colTable(
    [['Elemento', 250], ['B', 40], ['R', 40], ['M', 40], ['Observações', 100]],
    ['Paredes interiores (fissuras, humidade, bolor)', 'Tectos (manchas, infiltrações, deformações)', 'Pavimento sala / quartos (tipo e estado)', 'Pavimento cozinha (tipo e estado)', 'Pavimento WC (tipo e estado)', 'Rodapés e molduras', 'Portas interiores (funcionamento, estado)'].map(item => ({ _values: [item, '□', '□', '□', ''] }))
  )
  b.space(4)

  b.header('4. INSTALAÇÕES TÉCNICAS')
  b.colTable(
    [['Elemento', 250], ['B', 40], ['R', 40], ['M', 40], ['Observações', 100]],
    ['Quadro eléctrico (disjuntores, diferencial, terra)', 'Tomadas e interruptores (quantidade, estado)', 'Iluminação (pontos de luz, funcionamento)', 'Canalização de água fria (pressão, material)', 'Canalização de água quente (pressão, material)', 'Esgotos (cheiros, escoamento, caixas de visita)', 'Esquentador / caldeira / bomba de calor', 'Aquecimento central (radiadores, piso radiante)', 'Ar condicionado (unidades, estado)', 'Instalação de gás (tipo, certificação)', 'Telecomunicações (fibra, TV cabo, tomadas)'].map(item => ({ _values: [item, '□', '□', '□', ''] }))
  )
  b.space(4)

  b.header('5. CAIXILHARIA E ISOLAMENTO')
  b.colTable(
    [['Elemento', 250], ['B', 40], ['R', 40], ['M', 40], ['Observações', 100]],
    ['Janelas (material, vidro simples/duplo)', 'Estores / portadas (funcionamento)', 'Porta de entrada (segurança, estado)', 'Isolamento térmico (pontes térmicas visíveis)', 'Isolamento acústico (ruído exterior)', 'Humidade por condensação (paredes frias)'].map(item => ({ _values: [item, '□', '□', '□', ''] }))
  )
  b.space(4)

  b.header('6. COZINHA — DETALHE')
  b.colTable(
    [['Elemento', 250], ['B', 40], ['R', 40], ['M', 40], ['Observações', 100]],
    ['Bancada (material, estado)', 'Armários superiores e inferiores', 'Equipamentos (forno, placa, exaustor)', 'Ponto de água (torneira, lava-louça)', 'Revestimento de parede (azulejo, estado)', 'Ventilação / exaustão'].map(item => ({ _values: [item, '□', '□', '□', ''] }))
  )
  b.space(4)

  b.header('7. CASAS DE BANHO — DETALHE')
  b.colTable(
    [['Elemento', 250], ['B', 40], ['R', 40], ['M', 40], ['Observações', 100]],
    ['Louças sanitárias (sanita, bidé, lavatório)', 'Base de duche / banheira (impermeabilização)', 'Torneiras e misturadoras', 'Azulejos (estado, fissuras, juntas)', 'Ventilação (natural ou mecânica)', 'Espelho e acessórios'].map(item => ({ _values: [item, '□', '□', '□', ''] }))
  )
  b.space(4)

  b.header('8. ENVOLVENTE E LOCALIZAÇÃO')
  b.colTable(
    [['Elemento', 250], ['B', 40], ['R', 40], ['M', 40], ['Observações', 100]],
    ['Vizinhança (tipo de zona, comércio, serviços)', 'Segurança da zona', 'Ruído (tráfego, vizinhos, indústria)', 'Transportes públicos (proximidade)', 'Estacionamento na envolvente', 'Orientação solar (nascente, poente)', 'Luminosidade natural dos compartimentos', 'Estado do prédio / condomínio (se aplicável)', 'Elevador (se aplicável)', 'Zonas comuns (se aplicável)'].map(item => ({ _values: [item, '□', '□', '□', ''] }))
  )
  b.space(4)

  b.header('9. CONFIRMAÇÃO DE ÁREAS E MEDIÇÕES')
  b.note('Medir ou estimar as áreas reais e comparar com o anunciado / registado.')
  b.colTable(
    [['Compartimento', 200], ['Medição (m²)', 130], ['Observações', 150]],
    ['Sala', 'Cozinha', 'Quarto 1', 'Quarto 2', 'Quarto 3', 'WC 1', 'WC 2', 'Corredor', 'Varanda / Terraço', 'Garagem'].map(item => ({ _values: [item, '', ''] }))
  )
  b.space(2)
  b.simpleTable([
    { label: 'Área Útil Anunciada', value: im.area_util ? `${im.area_util} m²` : '—' },
    { label: 'Área Útil Medida / Estimada', value: '__________ m²' },
    { label: 'Área Bruta Anunciada', value: im.area_bruta ? `${im.area_bruta} m²` : '—' },
    { label: 'Discrepância', value: '□ Sim  □ Não' },
  ])
  b.space(4)

  b.header('10. ESTIMATIVA PRELIMINAR DE OBRA')
  b.note('Registo rápido dos trabalhos necessários observados na visita.')
  b.colTable(
    [['Trabalho', 230], ['Necessário?', 80], ['Grau', 80], ['Custo Est.', 90]],
    ['Demolições e remoção de entulho', 'Estrutura / alvenaria / paredes', 'Cobertura / telhado', 'Canalização (água e esgotos)', 'Electricidade (quadro e instalação)', 'Revestimentos (pavimentos e paredes)', 'Cozinha completa', 'Casa(s) de banho completa(s)', 'Caixilharia (janelas e portas)', 'Pintura interior e exterior', 'Isolamento térmico / acústico', 'Ar condicionado / aquecimento', 'Arranjos exteriores / jardim', 'Outros'].map(item => ({ _values: [item, '□ S  □ N', '□ L  □ P', '€ _____'] }))
  )
  b.note('L = Ligeira  ·  P = Profunda')
  b.space(2)
  b.highlight('Total Estimado de Obra (campo)', '€ _______________')
  b.space(4)

  b.newPage()
  b.header('RELATÓRIO DE VISITA')
  b.subheader('Estado Real do Imóvel')
  b.input('Descrição geral do estado encontrado', '', { tall: true })
  b.space(4)
  b.subheader('Obras Necessárias')
  b.colTable(
    [['Trabalho', 280], ['Custo Estimado', 200]],
    ['Demolições e remoção', 'Estrutura / alvenaria', 'Canalização', 'Electricidade', 'Revestimentos / acabamentos', 'Cozinha e WC', 'Caixilharia', 'Pintura', 'Outros'].map(item => ({ _values: [item, '________________'] }))
  )
  b.space(4)
  b.header('IMPRESSÃO GERAL')
  b.input('Pontos fortes do imóvel', '', { tall: true })
  b.input('Pontos fracos / riscos identificados', '', { tall: true })
  b.input('Potencial de valorização', '', { tall: true })
  b.space(4)
  b.header('DECISÃO')
  b.simpleTable([
    { label: '□  GO — Avançar para estudo de mercado e análise de rentabilidade', value: '' },
    { label: '□  SEGUNDA VISITA — Necessita validação adicional (especificar)', value: '' },
    { label: '□  PERITO — Necessita avaliação por engenheiro / arquitecto', value: '' },
    { label: '□  STAND-BY — Aguardar documentação ou informação adicional', value: '' },
    { label: '□  NO GO — Descartar (especificar motivo)', value: '' },
  ])
  b.space(4)
  b.input('Justificação da decisão', '', { tall: true })
  b.input('Próximos passos', '', { tall: true })
}

function renderAnaliseRentabilidade(b, im, a) {
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

  renderStressTests(b, a, { title: 'H. TESTES DE STRESS' })
}

function renderEstudoComparaveis(b, im, a) {
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
}

function renderPropostaFormal(b, im) {
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
}

function renderDossierInvestidor(b, im, a) {
  const fotos = parseFotos(im)
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

  renderStressTests(b, a)

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
}

function renderResumoNegociacao(b, im) {
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
}

function renderResumoAcordo(b, im) {
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
}

function renderFichaFollowUp(b, im) {
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
}

function renderFichaCedencia(b, im) {
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
}

function renderFichaAcompanhamentoObra(b, im) {
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
}

function renderRelatorioInvestimento(b, im, an) {
  if (!an || !Object.keys(an).length) { b.text('Sem análise financeira activa para este imóvel.'); return }

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
    { label: 'Regime', value: an.regime_fiscal || 'Empresa' },
  ])
  b.space(8)

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

  b.header('MÉTRICAS DE RETORNO')
  b.bigNumbers([
    { label: 'ROI Total', value: PCT(an.retorno_total) },
    { label: 'Retorno Anualizado', value: PCT(an.retorno_anualizado) },
    { label: 'Cash-on-Cash', value: PCT(an.cash_on_cash) },
    { label: 'Break-even', value: EUR(an.break_even) },
  ])
}

function renderRelatorioComparaveis(b, im, an) {
  const comps = an?.comparaveis
  const parsed = typeof comps === 'string' ? JSON.parse(comps || '[]') : (comps || [])
  if (!parsed.length) { b.text('Sem dados de comparáveis registados.'); return }

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
}

function renderRelatorioCaep(b, im, an) {
  const caep = an?.caep
  const parsed = typeof caep === 'string' ? JSON.parse(caep || 'null') : caep
  if (!parsed || parsed.quota_somnium === undefined) { b.text('Sem dados CAEP configurados.'); return }

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
}

function renderRelatorioStress(b, im, an) {
  const a = an || {}
  if (!a.stress_tests) { b.text('Sem stress tests calculados.'); return }
  renderStressTests(b, a, { title: 'ANÁLISE DE RISCO — STRESS TESTS' })
}

function renderPropostaInvestimentoAnonima(b, im, a) {
  const compra = a.compra || im.valor_proposta || im.ask_price || 0
  const obra = a.obra_com_iva || a.obra || im.custo_estimado_obra || 0
  const vvr = a.vvr || im.valor_venda_remodelado || 0
  const meses = a.meses || 6
  const capitalNecessario = a.capital_necessario || (compra + obra)

  b.header('SUMÁRIO EXECUTIVO')
  b.bigNumbers([
    { label: 'Valor de Aquisição', value: EUR(compra), sub: a.perc_financiamento ? `${a.perc_financiamento}% financiado` : '100% capitais próprios' },
    { label: 'Valor de Venda Alvo', value: EUR(vvr) },
    { label: 'Retorno Total', value: PCT(a.retorno_total), sub: 'lucro bruto / total investido' },
    { label: 'Retorno Anualizado', value: PCT(a.retorno_anualizado), sub: `base ${meses} meses` },
  ])
  b.space(2)
  b.bigNumbers([
    { label: 'Lucro Bruto Estimado', value: EUR(a.lucro_bruto), sub: 'antes de impostos' },
    { label: 'Lucro Líquido', value: EUR(a.lucro_liquido), sub: `${a.regime_fiscal || 'IRC'} sobre lucro` },
    { label: 'Total Investido', value: EUR(capitalNecessario), sub: 'aquisição + obra + custos' },
    { label: 'Prazo de Retenção', value: `${meses} meses`, sub: 'da compra à escritura de venda' },
  ])
  b.space(6)

  b.header('SOBRE O PROJECTO')
  const tipoDesc = im.tipologia ? `um ${im.tipologia}` : 'um imóvel'
  const areaDesc = im.area_bruta ? ` com uma área bruta de ${im.area_bruta} m²` : (im.area_util ? ` com uma área útil de ${im.area_util} m²` : '')
  const zonaDesc = im.zona ? ` na zona de ${im.zona}, Coimbra` : ' em Coimbra'
  b.textBlock(
    `O projecto consiste na aquisição, remodelação integral e revenda de ${tipoDesc}${areaDesc}, localizado${zonaDesc}. ` +
    `O imóvel encontra-se num estado de conservação que exige remodelação total, o que justifica o preço de aquisição abaixo do valor de mercado e cria a margem de valorização identificada.`
  )
  b.space(4)

  b.header('IDENTIFICAÇÃO DO IMÓVEL')
  b.simpleTable([
    { label: 'Localização', value: im.zona ? `Zona de ${im.zona}, Coimbra` : 'Coimbra, Portugal' },
    { label: 'Tipologia', value: im.tipologia || '—' },
    { label: 'Área Bruta Privativa', value: im.area_bruta ? `${im.area_bruta} m²` : (im.area_util ? `${im.area_util} m²` : '—') },
    { label: 'Modelo de Negócio', value: im.modelo_negocio || 'CAEP 50/50' },
    { label: 'Prazo Estimado', value: `${meses} meses` },
  ])
  b.space(6)

  let comps = a.comparaveis
  if (typeof comps === 'string') try { comps = JSON.parse(comps || '[]') } catch { comps = [] }
  if (comps && comps.length > 0) {
    b.newPage()
    b.header('ESTUDO DE MERCADO — VALORES DE VENDA COMPARÁVEIS')

    for (const tip of comps) {
      const items = tip.comparaveis || []
      const valid = items.filter(c => c.preco > 0 && c.area > 0)
      if (valid.length === 0) continue

      const precosM2 = valid.map(c => {
        const base = c.preco / c.area
        const ajTotal = Object.values(c.ajustes || {}).reduce((s, v) => s + (parseFloat(v) || 0), 0)
        return base * (1 + ajTotal / 100)
      })
      const media = Math.round(precosM2.reduce((a, b) => a + b, 0) / precosM2.length)
      const vvrTip = media * (tip.area || 0)

      b.subheader(`${tip.tipologia || 'Tipologia'} — ${tip.area || '?'} m²`)
      b.bigNumbers([
        { label: 'VVR Estimado', value: EUR(vvrTip) },
        { label: 'Média €/m²', value: `${media} €/m²` },
        { label: 'Amostra', value: `${valid.length} comparáveis` },
      ])
      b.colTable(
        [['#', 25], ['Preço', 70], ['Área', 45], ['€/m²', 50], ['Neg.', 45], ['Loc.', 45], ['Idade', 45], ['Total', 50]],
        valid.map((c, i) => {
          const aj = c.ajustes || {}
          const ajTotal = Object.values(aj).reduce((s, v) => s + (parseFloat(v) || 0), 0)
          return { _values: [`${i + 1}`, EUR(c.preco), `${c.area}m²`, `${Math.round(c.preco / c.area)}`, `${aj.neg || 0}%`, `${aj.loc || 0}%`, `${aj.idade || 0}%`, `${ajTotal >= 0 ? '+' : ''}${ajTotal}%`] }
        })
      )
      b.space(8)
    }
  }

  b.newPage()
  b.header('ANÁLISE FINANCEIRA — CENÁRIO BASE')
  b.subheader('Estrutura de Custos')
  b.simpleTable([
    { label: 'Valor de Compra', value: EUR(compra) },
    { label: 'IMT + Imposto de Selo', value: EUR((a.imt || 0) + (a.imposto_selo || 0)) },
    { label: 'Escritura + Registos + CPCV', value: EUR((a.escritura || 0) + (a.cpcv_compra || 0)) },
    { label: 'Total Custos de Aquisição', value: EUR(a.total_aquisicao), total: true },
    { label: 'Obra + IVA', value: EUR(obra) },
    { label: `Manutenção (${meses} meses)`, value: EUR(a.total_detencao) },
    { label: 'Comissão Imobiliária', value: EUR(a.comissao_com_iva) },
    { label: 'Total Investido', value: EUR(capitalNecessario), total: true },
  ])
  b.space(6)

  b.subheader('Retornos')
  b.simpleTable([
    { label: 'Valor de Venda Alvo', value: EUR(vvr) },
    { label: 'Lucro Estimado (Bruto)', value: EUR(a.lucro_bruto), total: true },
    { label: `Impostos (${a.regime_fiscal || 'IRC'})`, value: EUR(a.impostos) },
    { label: 'Lucro Estimado Líquido', value: EUR(a.lucro_liquido), total: true },
  ])
  b.space(4)

  b.bigNumbers([
    { label: 'Retorno Total', value: PCT(a.retorno_total) },
    { label: 'Cash-on-Cash', value: PCT(a.cash_on_cash) },
    { label: 'Retorno Anualizado', value: PCT(a.retorno_anualizado) },
  ])
  b.space(4)

  b.note(`Pressupostos: ${a.perc_financiamento ? `Financiamento ${a.perc_financiamento}%` : '100% capitais próprios'} · Regime fiscal: ${a.regime_fiscal || 'Empresa'} · Prazo: ${meses} meses`)

  renderStressTests(b, a, { newPage: true })

  b.newPage()
  b.header('CONCLUSÃO E RECOMENDAÇÃO')
  const raVal = a.retorno_anualizado || 0
  const rtVal = a.retorno_total || 0
  let stParsed = a.stress_tests
  if (typeof stParsed === 'string') try { stParsed = JSON.parse(stParsed) } catch { stParsed = null }
  let conclusao = `O projecto apresenta um perfil de risco-retorno atractivo: no cenário base conservador, o investimento gera um retorno total de ${rtVal}% e anualizado de ${raVal}% num prazo de ${meses} meses.`
  if (stParsed) {
    if (stParsed.pior?.lucro_liquido > 0) {
      conclusao += ` O investimento mantém lucro positivo mesmo no pior cenário (${EUR(stParsed.pior.lucro_liquido)}), o que valida a solidez estrutural do projecto.`
    } else if (stParsed.pior?.lucro_liquido != null) {
      conclusao += ` No pior cenário, o lucro estimado é de ${EUR(stParsed.pior.lucro_liquido)}, o que requer atenção ao risco.`
    }
  }
  if (im.zona) conclusao += ` A localização na zona de ${im.zona}, Coimbra, sustenta os valores de venda projectados.`
  b.textBlock(conclusao)

  b.space(4)
  b.header('MODELO DE PARCERIA')
  let caep = a.caep
  if (typeof caep === 'string') try { caep = JSON.parse(caep) } catch { caep = null }
  if (caep?.quota_somnium !== undefined) {
    b.simpleTable([
      { label: 'Investidor(es) passivo(s)', value: `${100 - (caep.perc_somnium || 40)}% do lucro` },
      { label: 'Somnium Properties', value: `${caep.perc_somnium || 40}% (gestão operacional + obra)` },
    ])
  } else {
    b.simpleTable([
      { label: 'Investidor(es) passivo(s)', value: '50% do lucro' },
      { label: 'Somnium Properties', value: '50% (gestão operacional + obra)' },
    ])
  }
  b.space(4)

  b.header('TRANSPARÊNCIA E COMUNICAÇÃO')
  b.simpleTable([
    { label: 'Google Drive exclusivo com toda a documentação do negócio', value: '' },
    { label: 'Canal Slack dedicado para comunicação em tempo real', value: '' },
    { label: 'Relatórios semanais de obra com fotos e vídeos', value: '' },
    { label: 'Acesso a orçamentos, facturas e contratos', value: '' },
    { label: 'Acesso vitalício aos documentos do negócio', value: '' },
  ])

  b.space(6)
  b.note('Os valores apresentados são estimativas conservadoras baseadas em análise de mercado e podem variar. A Somnium Properties utiliza stress tests automáticos em todos os negócios para protecção do investidor. Investimento imobiliário envolve risco de capital.')
}

function renderFichaDescarte(b, im) {
  b.header('DADOS DO IMÓVEL')
  b.simpleTable([
    { label: 'Nome / Referência', value: im.nome },
    { label: 'Zona', value: im.zona },
    { label: 'Tipologia', value: im.tipologia },
    { label: 'Ask Price', value: EUR(im.ask_price) },
    { label: 'Valor Proposta', value: EUR(im.valor_proposta) },
    { label: 'Modelo de Negócio', value: im.modelo_negocio },
    { label: 'Origem', value: im.origem },
    { label: 'Consultor', value: im.nome_consultor },
  ])
  b.space(4)

  b.header('MOTIVO DO DESCARTE')
  b.bigNumbers([
    { label: 'Motivo', value: im.motivo_descarte || 'Não especificado' },
  ])
  b.space(4)

  b.header('TIMELINE')
  b.simpleTable([
    { label: 'Data Adicionado', value: FDATE(im.data_adicionado || im.created_at) },
    { label: 'Data da Chamada', value: FDATE(im.data_chamada) },
    { label: 'Data da Visita', value: FDATE(im.data_visita) },
    { label: 'Data de Descarte', value: NOW() },
  ])
  b.space(4)

  b.header('VALORES FINANCEIROS (NA DATA DE DESCARTE)')
  b.simpleTable([
    { label: 'Ask Price', value: EUR(im.ask_price) },
    { label: 'VVR Estimado', value: EUR(im.valor_venda_remodelado) },
    { label: 'Custo Estimado Obra', value: EUR(im.custo_estimado_obra) },
    { label: 'ROI Estimado', value: PCT(im.roi) },
  ])
  b.space(4)

  if (im.notas) {
    b.header('NOTAS')
    b.textBlock(im.notas)
    b.space(4)
  }
}

// ══════════════════════════════════════════════════════════════
// DOCUMENT GENERATORS — capa especifica + render + disclaimer
// ══════════════════════════════════════════════════════════════

const GENERATORS = {
  ficha_imovel: (im) => {
    const b = new DocBuilder('Ficha do Imóvel', im.zona || '', im)
    renderFichaImovel(b, im)
    b.disclaimer()
    return b.end()
  },

  ficha_visita: (im) => {
    const b = new DocBuilder('Ficha de Visita', `${im.zona || ''} · ${im.tipologia || ''}`, im)
    renderFichaVisita(b, im)
    b.disclaimer()
    return b.end()
  },

  analise_rentabilidade: (im, analise) => {
    const b = new DocBuilder('Análise de Rentabilidade', im.zona || '', im)
    renderAnaliseRentabilidade(b, im, analise || {})
    b.disclaimer()
    return b.end()
  },

  estudo_comparaveis: (im, analise) => {
    const b = new DocBuilder('Estudo de Mercado — Comparáveis', im.zona || '', im)
    renderEstudoComparaveis(b, im, analise || {})
    b.disclaimer()
    return b.end()
  },

  proposta_formal: (im) => {
    const b = new DocBuilder('Proposta ao Proprietário', im.zona || '', im)
    renderPropostaFormal(b, im)
    b.disclaimer()
    return b.end()
  },

  dossier_investidor: (im, analise) => {
    const b = new DocBuilder('Dossier de Investimento', `Oportunidade · ${im.zona || ''}`, im)
    renderDossierInvestidor(b, im, analise || {})
    b.disclaimer()
    return b.end()
  },

  resumo_negociacao: (im) => {
    const b = new DocBuilder('Resumo de Negociação', im.zona || '', im)
    renderResumoNegociacao(b, im)
    b.disclaimer()
    return b.end()
  },

  resumo_acordo: (im) => {
    const b = new DocBuilder('Resumo de Acordo', im.zona || '', im)
    renderResumoAcordo(b, im)
    b.disclaimer()
    return b.end()
  },

  ficha_follow_up: (im) => {
    const b = new DocBuilder('Ficha de Follow Up', im.zona || '', im)
    renderFichaFollowUp(b, im)
    b.disclaimer()
    return b.end()
  },

  ficha_cedencia: (im) => {
    const b = new DocBuilder('Ficha de Cedência de Posição', im.zona || '', im)
    renderFichaCedencia(b, im)
    b.disclaimer()
    return b.end()
  },

  ficha_acompanhamento_obra: (im) => {
    const b = new DocBuilder('Acompanhamento de Obra', im.zona || '', im)
    renderFichaAcompanhamentoObra(b, im)
    b.disclaimer()
    return b.end()
  },

  // ══════════════════════════════════════════════════════════════
  // RELATÓRIOS PARA INVESTIDOR (estilo limpo, arejado)
  // ══════════════════════════════════════════════════════════════

  relatorio_investimento: (im, an) => {
    const b = new DocBuilder('Análise de Investimento', im.zona || '', im)
    renderRelatorioInvestimento(b, im, an)
    b.disclaimer()
    return b.end()
  },

  relatorio_comparaveis: (im, an) => {
    const b = new DocBuilder('Estudo de Mercado', im.zona || '', im)
    renderRelatorioComparaveis(b, im, an)
    b.disclaimer()
    return b.end()
  },

  relatorio_caep: (im, an) => {
    const b = new DocBuilder('Parceria CAEP — Distribuição de Lucro', im.zona || '', im)
    renderRelatorioCaep(b, im, an)
    b.disclaimer()
    return b.end()
  },

  relatorio_stress: (im, an) => {
    const b = new DocBuilder('Análise de Risco', im.zona || '', im)
    renderRelatorioStress(b, im, an)
    b.disclaimer()
    return b.end()
  },

  proposta_investimento_anonima: (im, analise) => {
    const b = new DocBuilder('Proposta de Investimento', '', {
      ...im,
      nome: 'OPORTUNIDADE DE INVESTIMENTO',
      zona: im.zona ? `Zona de ${im.zona}` : 'Coimbra',
    })
    renderPropostaInvestimentoAnonima(b, im, analise || {})
    b.disclaimer()
    return b.end()
  },

  ficha_descarte: (im) => {
    const b = new DocBuilder('Ficha de Descarte', im.zona || '', im)
    renderFichaDescarte(b, im)
    b.disclaimer()
    return b.end()
  },
}

// ══════════════════════════════════════════════════════════════
// RENDERERS — mapa de seccao → render(b, im, a) usado pelo
// generateCompiledReport para combinar varias seccoes inline.
// ══════════════════════════════════════════════════════════════

const RENDERERS = {
  ficha_imovel: renderFichaImovel,
  ficha_visita: renderFichaVisita,
  analise_rentabilidade: renderAnaliseRentabilidade,
  estudo_comparaveis: renderEstudoComparaveis,
  proposta_formal: renderPropostaFormal,
  dossier_investidor: renderDossierInvestidor,
  proposta_investimento_anonima: renderPropostaInvestimentoAnonima,
  resumo_negociacao: renderResumoNegociacao,
  resumo_acordo: renderResumoAcordo,
  ficha_follow_up: renderFichaFollowUp,
  ficha_cedencia: renderFichaCedencia,
  ficha_acompanhamento_obra: renderFichaAcompanhamentoObra,
  ficha_descarte: renderFichaDescarte,
  // Aliases compativeis com o formato antigo
  investimento: renderRelatorioInvestimento,
  comparaveis: renderRelatorioComparaveis,
  caep: renderRelatorioCaep,
  stress_tests: renderRelatorioStress,
}

// Mapa de chave compilavel → nome do GENERATOR (usado para
// despachar 1-seccao para o gerador completo, com a sua capa).
const COMPILAVEL_TO_GENERATOR = {
  investimento: 'relatorio_investimento',
  comparaveis: 'relatorio_comparaveis',
  caep: 'relatorio_caep',
  stress_tests: 'relatorio_stress',
}

// Gera um PDF compilado para investidor. Quando ha apenas uma
// seccao, devolve o gerador completo (com a sua capa especifica).
// Para multiplas, faz capa "Dossier" + render inline de cada
// seccao via RENDERERS, separadas por newPage.
export function generateCompiledReport(imovel, analise, seccoes = []) {
  if (seccoes.length === 1) {
    const tipo = COMPILAVEL_TO_GENERATOR[seccoes[0]] || seccoes[0]
    if (GENERATORS[tipo]) return GENERATORS[tipo](imovel, analise)
  }

  const b = new DocBuilder('Dossier de Investimento', imovel.zona || '', imovel)
  const an = analise || {}
  let hasContent = false
  for (const seccao of seccoes) {
    const render = RENDERERS[seccao]
    if (!render) continue
    if (hasContent) b.newPage()
    hasContent = true
    render(b, imovel, an)
  }
  if (!hasContent) b.text('Nenhuma secção com dados disponíveis para compilar.')
  b.disclaimer()
  return b.end()
}

