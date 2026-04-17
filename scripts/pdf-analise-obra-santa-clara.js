/**
 * Gera PDF profissional: Análise de Custo de Obra — Santa Clara, Rua do Clube
 * Layout empresarial Somnium Properties.
 *
 * Uso: node scripts/pdf-analise-obra-santa-clara.js
 * Saída: scripts/output/Analise_Custo_Obra_Santa_Clara.pdf
 */
import PDFDocument from 'pdfkit'
import { readFileSync, mkdirSync, createWriteStream } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const LOGO_PATH = path.resolve(__dirname, '../public/logo-transparent.png')
const OUTPUT_DIR = path.resolve(__dirname, 'output')
mkdirSync(OUTPUT_DIR, { recursive: true })
const OUTPUT = path.join(OUTPUT_DIR, 'Analise_Custo_Obra_Santa_Clara.pdf')

// ── Design tokens (Somnium Properties brand) ──
const C = {
  gold: '#C9A84C', black: '#0d0d0d', white: '#ffffff',
  bg: '#f7f6f2', body: '#2a2a2a', muted: '#888888',
  border: '#e0ddd5', light: '#f0efe9', accent: '#1a1a1a',
  headerBg: '#f0efe9', totalBg: '#f5f3ee',
  green: '#2d6a2d', red: '#8b2020',
}
const ML = 50, MR = 50
const PW = 595.28, PH = 841.89
const CW = PW - ML - MR

const EUR = v => v == null || v === 0 ? '—' : new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(v)
const NOW = () => new Date().toLocaleDateString('pt-PT', { day: '2-digit', month: 'long', year: 'numeric' })

// ══════════════════════════════════════════════════════════════
// BUILDER (subset do DocBuilder do CRM)
// ══════════════════════════════════════════════════════════════
class Builder {
  constructor() {
    this.doc = new PDFDocument({ size: 'A4', autoFirstPage: false })
    this.y = 0
  }

  // ── Capa ──
  cover(title, subtitle, location) {
    const d = this.doc
    d.addPage({ size: 'A4', margins: { top: 0, bottom: 0, left: 0, right: 0 } })
    d.rect(0, 0, PW, 6).fill(C.gold)
    try { d.image(readFileSync(LOGO_PATH), (PW - 160) / 2, 140, { width: 160 }) } catch {}
    d.rect(PW / 2 - 30, 310, 60, 1.5).fill(C.gold)
    d.fontSize(26).fillColor(C.body).text(title, ML, 340, { width: CW, align: 'center' })
    if (subtitle) d.fontSize(10).fillColor(C.gold).text(subtitle.toUpperCase(), ML, 390, { width: CW, align: 'center', characterSpacing: 1.5 })
    if (location) d.fontSize(10).fillColor(C.muted).text(location, ML, 415, { width: CW, align: 'center' })
    d.rect(ML + 80, 450, CW - 160, 0.5).fill(C.gold)
    d.fontSize(9).fillColor(C.muted).text(NOW(), ML, 465, { width: CW, align: 'center' })
    d.rect(ML, PH - 65, CW, 0.5).fill(C.gold)
    d.fontSize(7).fillColor(C.muted).text('Somnium Properties · Investimento Imobiliário', ML, PH - 52, { width: CW, align: 'center' })
    d.fontSize(7).fillColor(C.muted).text(`Documento Confidencial · ${NOW()}`, ML, PH - 40, { width: CW, align: 'center' })
    d.rect(0, PH - 6, PW, 6).fill(C.gold)
  }

  newPage() {
    this.doc.addPage({ size: 'A4', margins: { top: 60, bottom: 60, left: ML, right: MR } })
    try { this.doc.image(readFileSync(LOGO_PATH), ML, 15, { height: 22 }) } catch {}
    this.doc.rect(ML, 45, CW, 1.5).fill(C.gold)
    this.doc.rect(ML, PH - 45, CW, 0.5).fill(C.gold)
    this.y = 60
    return this
  }

  ensure(needed) {
    if (this.y > 50 && this.y + needed > PH - 60) this.newPage()
    return this
  }

  header(title) {
    this.ensure(28)
    this.doc.fontSize(11).fillColor(C.body).text(title.toUpperCase(), ML, this.y, { characterSpacing: 0.3 })
    this.y = this.doc.y + 4
    this.doc.rect(ML, this.y, CW, 1.5).fill(C.gold)
    this.y += 10
    return this
  }

  subheader(title) {
    this.ensure(22)
    this.doc.fontSize(9.5).fillColor(C.body).text(title.toUpperCase(), ML, this.y, { characterSpacing: 0.3 })
    this.y = this.doc.y + 3
    this.doc.rect(ML, this.y, 40, 1).fill(C.gold)
    this.y += 8
    return this
  }

  space(px = 8) { this.y += px; return this }

  text(content, opts = {}) {
    this.ensure(20)
    this.doc.fontSize(opts.size || 9).fillColor(opts.color || C.body).text(content, ML, this.y, { width: CW, lineGap: opts.lineGap || 4, align: opts.align || 'left' })
    this.y = this.doc.y + 6
    return this
  }

  note(content) {
    this.ensure(16)
    this.doc.fontSize(7.5).fillColor(C.muted).text(content, ML, this.y, { width: CW, lineGap: 3 })
    this.y = this.doc.y + 4
    return this
  }

  bigNumbers(items) {
    this.ensure(56)
    const colW = CW / items.length
    this.doc.rect(ML, this.y, CW, 50).lineWidth(0.5).stroke(C.border)
    items.forEach((item, i) => {
      const x = ML + i * colW
      if (i > 0) this.doc.rect(x, this.y, 0.5, 50).fill(C.border)
      this.doc.fontSize(7).fillColor(C.muted).text((item.label || '').toUpperCase(), x + 10, this.y + 8, { width: colW - 20, lineBreak: false, characterSpacing: 0.3 })
      this.doc.fontSize(16).fillColor(item.color || C.body).text(String(item.value || '—'), x + 10, this.y + 22, { width: colW - 20, lineBreak: false })
      if (item.sub) this.doc.fontSize(7).fillColor(C.muted).text(item.sub, x + 10, this.y + 40, { width: colW - 20, lineBreak: false })
    })
    this.y += 56
    return this
  }

  simpleTable(rows) {
    rows.forEach(row => {
      this.ensure(24)
      const isTotal = row.total
      if (isTotal) this.doc.rect(ML, this.y, CW, 24).fill(C.totalBg)
      this.doc.fontSize(isTotal ? 9.5 : 8.5).fillColor(C.body).text(row.label || '', ML + 10, this.y + 6, { width: 310, lineBreak: false })
      this.doc.fontSize(isTotal ? 9.5 : 8.5).fillColor(isTotal ? C.gold : C.body).text(String(row.value || '—'), ML + 320, this.y + 6, { width: CW - 330, align: 'right', lineBreak: false })
      this.doc.rect(ML, this.y + (isTotal ? 24 : 22), CW, 0.3).fill(C.border)
      this.y += isTotal ? 26 : 22
    })
    this.y += 4
    return this
  }

  // Tabela com sub-itens (detalhe indentado)
  detailTable(rows) {
    rows.forEach(row => {
      this.ensure(row.detail ? 20 : 24)
      if (row.detail) {
        // Sub-item indentado, mais pequeno, muted
        this.doc.fontSize(7.5).fillColor(C.muted).text(row.label, ML + 24, this.y + 4, { width: 296, lineBreak: false })
        this.doc.fontSize(7.5).fillColor(C.muted).text(String(row.value || ''), ML + 320, this.y + 4, { width: CW - 330, align: 'right', lineBreak: false })
        this.doc.rect(ML + 24, this.y + 18, CW - 24, 0.2).fill('#ece9e0')
        this.y += 18
      } else {
        const isTotal = row.total
        const isAccum = row.accum
        if (isTotal) this.doc.rect(ML, this.y, CW, 24).fill(C.totalBg)
        if (isAccum) this.doc.rect(ML, this.y, CW, 22).fill('#f9f8f5')
        this.doc.fontSize(isTotal ? 10 : isAccum ? 8 : 8.5).fillColor(isTotal ? C.body : isAccum ? C.gold : C.body)
          .text(row.label || '', ML + 10, this.y + 6, { width: 310, lineBreak: false })
        this.doc.fontSize(isTotal ? 10 : isAccum ? 8.5 : 8.5).fillColor(isTotal ? C.gold : isAccum ? C.gold : C.body)
          .text(String(row.value || '—'), ML + 320, this.y + 6, { width: CW - 330, align: 'right', lineBreak: false })
        this.doc.rect(ML, this.y + (isTotal ? 24 : 22), CW, isTotal ? 0.5 : 0.3).fill(isTotal ? C.gold : C.border)
        this.y += isTotal ? 26 : 22
      }
    })
    this.y += 4
    return this
  }

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

  bullet(text) {
    this.ensure(30)
    this.doc.fontSize(9).fillColor(C.gold).text('▸', ML, this.y, { lineBreak: false })
    this.doc.fontSize(9).fillColor(C.body).text(text, ML + 14, this.y, { width: CW - 14, lineGap: 3 })
    this.y = this.doc.y + 6
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

  save(path) {
    return new Promise((resolve, reject) => {
      const stream = createWriteStream(path)
      this.doc.pipe(stream)
      this.doc.end()
      stream.on('finish', resolve)
      stream.on('error', reject)
    })
  }
}

// ══════════════════════════════════════════════════════════════
// DADOS DA ANÁLISE DE CUSTO
// ══════════════════════════════════════════════════════════════

const OBRA = {
  nome: 'Santa Clara, Rua do Clube',
  tipo: 'Lote com moradia composta por rés do chão mais primeiro andar',
  areas: {
    rc: { bruta: 55, desc: '2 quartos (~9 m² cada), 1 WC (~3,5 m²), cozinha e sala. Acesso pela sala + porta secundária junto da cozinha.' },
    andar: { bruta: 55, extra: 40, desc: '2 quartos (~9 m² cada), 1 WC (~3,5 m²), cozinha, sala, 1 quarto maior (~20 m²), corredor e despensa.' },
  },
  alertas: [
    'No 1.º andar, os 40 m² de Área Bruta Independente são construção ilegal (sem registo). O quarto maior, corredor e despensa não se encontram legalizados.',
    'Existe um edificado em madeira e chapas (~40 m²) na frente da casa que terá de ser demolido.',
    'A análise considera a parte habitacional 100% legal e o 1.º andar como T3.',
  ],
  categorias: [
    {
      nome: 'Demolições e Limpeza', total: 3695,
      items: [
        { desc: 'Entrega de entulhos (450 € + IVA)', valor: 567 },
        { desc: 'Serviço de remoção e transporte (3 dias × 360 € + IVA)', valor: 1328 },
        { desc: 'Nivelamento terreno exterior (150 m² × 0,10 m × 32 €/m³)', valor: 473 },
        { desc: 'Remoção de lixo interior e limpeza (2 dias MO)', valor: 266 },
        { desc: 'Demolição paredes interiores, remoção revestimentos, roços (8 dias MO)', valor: 1062 },
      ]
    },
    {
      nome: 'Electricidade e Canalização', total: 11633,
      items: [
        { desc: 'R/C — 55 m² × 63 €/m² + IVA', valor: 4262 },
        { desc: '1.º Andar — 95 m² × 63 €/m² + IVA', valor: 7371 },
      ],
      nota: 'Custo médio de 54 €/m²'
    },
    {
      nome: 'Pavimento Geral', total: 9298,
      items: [
        { desc: 'R/C — 55 m² × 50 €/m² + IVA (mosaico 1.ª escolha retificado)', valor: 3409 },
        { desc: '1.º Andar — 95 m² × 50 €/m² + IVA', valor: 5889 },
      ],
      nota: 'Mosaico 22 €/m² + IVA, cola flexível C2T1S1 5 €/m², rejuntamento 2 €/m², MO 23 €/m²'
    },
    {
      nome: 'Pladur Interior nos Tectos', total: 7986,
      items: [
        { desc: 'R/C — 55 m² × 45 €/m² + IVA (placa hidrófuga Knauf, lã rocha 60 mm)', valor: 3044 },
        { desc: '1.º Andar — 95 m² × 42 €/m² + IVA (placa hidrófuga, lã mineral 60 mm)', valor: 4943 },
      ],
      nota: 'Inclui perfis, massas de acabamento, sancas e outros acabamentos'
    },
    {
      nome: 'Caixilharias', total: 12073,
      items: [
        { desc: 'R/C — 5 janelas de 1,5 m² × 405 €/m² + IVA', valor: 3736 },
        { desc: 'R/C — 1 janela WC (0,50 × 0,50) × 180 € + IVA', valor: 225 },
        { desc: '1.º Andar — 7 janelas de 1,5 m² × 405 €/m² + IVA', valor: 5230 },
        { desc: '1.º Andar — 1 janela WC (0,50 × 0,50) × 180 € + IVA', valor: 225 },
        { desc: 'Trabalho de pedreiro adjacente (900 € + IVA)', valor: 1107 },
        { desc: 'Soleiras novas — 14 unidades × 90 € + IVA', valor: 1550 },
      ],
      nota: 'Alumínio de qualidade, com corte térmico e vidro duplo'
    },
    {
      nome: 'Sistema VMC', total: 12150,
      items: [
        { desc: 'R/C — ventilação mecânica controlada', valor: 4500 },
        { desc: '1.º Andar — ventilação mecânica controlada', valor: 7650 },
      ],
      nota: 'Valores com IVA incluído'
    },
    {
      nome: 'Pintura', total: 9796,
      items: [
        { desc: 'R/C — ~215 m² (160 m² paredes + 55 m² tecto) × 14 €/m² + IVA', valor: 3569 },
        { desc: '1.º Andar — ~375 m² (280 m² paredes + 95 m² tecto) × 14 €/m² + IVA', valor: 6226 },
      ]
    },
    {
      nome: 'Casas de Banho', total: 10800,
      items: [
        { desc: '3 casas de banho completas × 3 600 € (com IVA)', valor: 10800 },
      ]
    },
    {
      nome: 'Portas', total: 2160,
      items: [
        { desc: '12 unidades × 158 € com aplicação (+ IVA)', valor: 2160 },
      ]
    },
    {
      nome: 'Cozinhas', total: 16200,
      items: [
        { desc: '2 cozinhas × 8 100 € (com IVA)', valor: 16200 },
      ],
      nota: '4,50 m comprimento, fogão, exaustor, forno, micro-ondas, frigorífico, máquina lavar louça e roupa'
    },
    {
      nome: 'Capoto Exterior (ETICS)', total: 12785,
      items: [
        { desc: 'R/C — 40 m perímetro × 3,00 m × 50 €/m² + IVA', valor: 7306 },
        { desc: '1.º Andar — 30 m perímetro × 3,00 m × 50 €/m² + IVA', valor: 5479 },
      ]
    },
    {
      nome: 'Cobertura', total: 12825,
      items: [
        { desc: '95 m² × 135 €/m² (com IVA)', valor: 12825 },
      ]
    },
  ],
  totalObra: 134293,
  licenciamento: {
    projecto: 6150,
    taxas: 3075,
    total: 9225,
  }
}

// ══════════════════════════════════════════════════════════════
// GERAÇÃO DO PDF
// ══════════════════════════════════════════════════════════════

async function generate() {
  const b = new Builder()

  // ── CAPA ──
  b.cover(
    'Análise de Custo de Obra',
    null,
    'Coimbra · Portugal'
  )

  // ── PÁGINA 1: Descrição do Imóvel ──
  b.newPage()

  b.header('DESCRIÇÃO DO IMÓVEL')
  b.text(OBRA.tipo, { size: 9.5 })
  b.space(6)

  b.subheader('Rés do Chão')
  b.simpleTable([
    { label: 'Área Bruta Privativa', value: `${OBRA.areas.rc.bruta} m²` },
  ])
  b.text(OBRA.areas.rc.desc)
  b.space(6)

  b.subheader('1.º Andar')
  b.simpleTable([
    { label: 'Área Bruta Privativa', value: `${OBRA.areas.andar.bruta} m²` },
    { label: 'Área adicional (ilegal / sem registo)', value: `${OBRA.areas.andar.extra} m²` },
  ])
  b.text(OBRA.areas.andar.desc)
  b.space(8)

  b.header('ÁREAS TOTAIS')
  b.bigNumbers([
    { label: 'R/C', value: `${OBRA.areas.rc.bruta} m²` },
    { label: '1.º Andar (registado)', value: `${OBRA.areas.andar.bruta} m²` },
    { label: 'Área Total Estimada', value: `${OBRA.areas.rc.bruta + OBRA.areas.andar.bruta + OBRA.areas.andar.extra} m²`, sub: `inclui ${OBRA.areas.andar.extra} m² ilegais` },
  ])
  b.space(8)

  b.header('ALERTAS E PRESSUPOSTOS')
  for (const alerta of OBRA.alertas) {
    b.bullet(alerta)
  }
  b.space(8)

  // ── PÁGINA 2+: Análise detalhada por categoria ──
  b.header('RESUMO DO INVESTIMENTO EM OBRA')
  b.bigNumbers([
    { label: 'Total Obra', value: EUR(OBRA.totalObra), color: C.body },
    { label: 'Licenciamento', value: EUR(OBRA.licenciamento.total) },
    { label: 'Total Global', value: EUR(OBRA.totalObra + OBRA.licenciamento.total), color: C.gold },
  ])
  b.space(4)
  b.note('Sendo reconstrução, parte da mão de obra poderá usufruir de IVA a 6% em vez de 23%, o que se reflectirá numa poupança considerável.')
  b.space(8)

  // ── Tabela resumo de categorias ──
  b.header('RESUMO POR CATEGORIA')
  let acumulado = 0
  const resumoRows = []
  for (const cat of OBRA.categorias) {
    acumulado += cat.total
    resumoRows.push({ label: cat.nome, value: EUR(cat.total) })
  }
  resumoRows.push({ label: 'Total Obra', value: EUR(OBRA.totalObra), total: true })
  b.simpleTable(resumoRows)
  b.space(8)

  // ── Detalhe por categoria ──
  b.header('DETALHE POR CATEGORIA')
  b.space(4)

  acumulado = 0
  for (const cat of OBRA.categorias) {
    acumulado += cat.total

    b.subheader(cat.nome)
    if (cat.nota) b.note(cat.nota)

    const rows = []
    for (const item of cat.items) {
      rows.push({ label: item.desc, value: EUR(item.valor), detail: true })
    }
    rows.push({ label: `Subtotal ${cat.nome}`, value: EUR(cat.total), total: false, accum: false })
    rows.push({ label: 'Acumulado', value: EUR(acumulado), accum: true })
    b.detailTable(rows)
    b.space(6)
  }

  // ── Licenciamento ──
  b.header('CUSTOS DE LICENCIAMENTO')
  b.note('Necessário colocação de projecto na Câmara para licenciamento de parte do 1.º andar.')
  b.detailTable([
    { label: 'Projecto de especialidade e arquitectura (5 000 € + IVA)', value: EUR(OBRA.licenciamento.projecto), detail: true },
    { label: 'Custos com taxas e solicitador (2 500 € + IVA)', value: EUR(OBRA.licenciamento.taxas), detail: true },
    { label: 'Total Licenciamento', value: EUR(OBRA.licenciamento.total), total: true },
  ])
  b.space(8)

  // ── Totais finais ──
  b.header('TOTAL GLOBAL')
  b.bigNumbers([
    { label: 'Obra', value: EUR(OBRA.totalObra) },
    { label: 'Licenciamento', value: EUR(OBRA.licenciamento.total) },
    { label: 'Investimento Total', value: EUR(OBRA.totalObra + OBRA.licenciamento.total), color: C.gold },
  ])
  b.space(4)
  b.highlight('Investimento Total em Obra', EUR(OBRA.totalObra + OBRA.licenciamento.total))
  b.space(4)

  b.note('Valores com IVA a 23% salvo indicação contrária. Em regime de reconstrução, a MO poderá beneficiar de IVA reduzido a 6%.')
  b.space(8)

  b.disclaimer()

  // ── Guardar ──
  await b.save(OUTPUT)
  console.log(`PDF gerado: ${OUTPUT}`)
}

generate().catch(e => { console.error(e); process.exit(1) })
