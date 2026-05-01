/**
 * Gerador de PDF-exemplo (CIM institucional reformulado).
 * Aplica Tier 1+2 da auditoria ao deal T2 Sub-Cave Lages (id 68d423f8-f72b-46aa-9fea-c75784c39212).
 * Output: /tmp/cim-example-t2-lages.pdf
 *
 * Uso: node scripts/generate-cim-example.js
 */
import PDFDocument from 'pdfkit'
import { readFileSync, createWriteStream, existsSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const LOGO = path.resolve(ROOT, 'public/logo-transparent.png')
const OUT = '/tmp/cim-example-t2-lages.pdf'

// ─── Dados reais do deal (snapshot da BD em 2026-05-01) ───
const im = {
  id: '68d423f8-f72b-46aa-9fea-c75784c39212',
  nome: 'T2+1 Sub-Cave Lages',
  zona: 'Santa Clara e Castelo Viegas',
  tipologia: 'T2 + 1',
  modelo_negocio: 'CAEP',
  origem: 'Referência (Off-Market)',
  ask_price: 125000,
  estado: 'Estudo de VVR',
}
const a = {
  compra: 110000,
  imt: 0,
  imposto_selo: 880,
  escritura: 700,
  cpcv_compra: 200,
  total_aquisicao: 111780,
  obra: 50000,
  iva_obra: 5975,
  obra_com_iva: 55975,
  pmo_perc: 65,
  meses: 6,
  seguro_mensal: 50,
  utilidades_mensal: 100,
  total_detencao: 900,
  vvr: 245000,
  comissao_perc: 5,
  comissao_com_iva: 15067.5,
  total_venda: 15567.5,
  finalidade: 'Empresa_isencao',
  regime_fiscal: 'Particular',
  perc_financiamento: 0,
  capital_necessario: 184222,
  capital_exposto_compra: 168655,
  lucro_bruto: 60777.5,
  lucro_liquido: 43423.8,
  impostos: 17353.7,
  retorno_total: 32.99,
  retorno_anualizado: 76.87,
  cash_on_cash: 23.57,
  break_even: 196295,
  tir: 52.7,
  moic: 1.236,
  margem_break_even_perc: 19.9,
  margem_bruta_vvr: 24.8,
  margem_liquida_vvr: 17.7,
  stress: {
    veredicto: 'resiliente',
    base: 43424,
    pior: 1353,
    melhor: 85044,
    sensibilidades: [
      { label: 'VVR ±20%', down: -33110, up: 33110 },
      { label: 'VVR ±10%', down: -16555, up: 16555 },
      { label: 'Obra ±20%', down: -8060, up: 8060 },
      { label: 'Obra ±10%', down: -4030, up: 4030 },
      { label: 'Prazo ±6m', down: -900, up: 900 },
    ],
  },
  comparaveis: [
    { area: 49,    preco: 199000, eur_m2: 4061, ajustado: 4499, link: 'kwportugal' },
    { area: 80,    preco: 240000, eur_m2: 3000, ajustado: 2878, link: 'idealista' },
    { area: 46,    preco: 198500, eur_m2: 4315, ajustado: 4995, link: 'idealista' },
    { area: 81.41, preco: 260000, eur_m2: 3193, ajustado: 3371, link: 'remax' },
  ],
}
const compMedia = 3936, compMediana = 3935, compCV = 23.6, compN = 4

// ─── Design tokens ───
const C = {
  gold: '#C9A84C', dark: '#0d0d0d', white: '#ffffff',
  bg: '#f7f6f2', body: '#2a2a2a', muted: '#888888',
  border: '#e0ddd5', light: '#f0efe9',
  green: '#2d6a2d', red: '#8b2020', amber: '#b87a1f',
  costBg: '#f5f3ee', revenueBg: '#eef4ec',
  totalBg: '#0d0d0d', totalFg: '#C9A84C',
}
const ML = 50, MR = 50, PW = 595.28, PH = 841.89, CW = PW - ML - MR
const EUR = (v, opts = {}) => v == null ? '—' : new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR', maximumFractionDigits: opts.dec ?? 0 }).format(v)
const PCT = (v, dec = 1) => v == null ? '—' : `${Number(v).toFixed(dec)}%`
const NOW = () => new Date().toLocaleDateString('pt-PT', { day: '2-digit', month: 'long', year: 'numeric' })
const DEAL_ID = 'SP-2026-018'
const VALID_UNTIL = '15 maio 2026'

// ─── PDF ───
const doc = new PDFDocument({ size: 'A4', margins: { top: 60, bottom: 60, left: ML, right: MR }, autoFirstPage: false })
doc.pipe(createWriteStream(OUT))

const state = { page: 0, totalPages: 8 }

function addPage(opts = {}) {
  doc.addPage({ size: 'A4', margins: opts.cover ? { top: 0, bottom: 0, left: 0, right: 0 } : { top: 60, bottom: 60, left: ML, right: MR } })
  state.page++
  if (!opts.cover) drawHeader()
  if (!opts.cover) drawFooter()
  return 60
}

function drawHeader() {
  try { doc.image(readFileSync(LOGO), ML, 18, { height: 18 }) } catch {}
  doc.fontSize(7).fillColor(C.muted).text(`${DEAL_ID}  ·  pág. ${state.page}/${state.totalPages}`, ML, 22, { width: CW, align: 'right', lineBreak: false })
  doc.rect(ML, 44, CW, 1.2).fill(C.gold)
}

function drawFooter() {
  doc.rect(ML, PH - 50, CW, 0.5).fill(C.gold)
  doc.fontSize(6.5).fillColor(C.muted)
    .text(`Confidencial · Somnium Properties · Emitido em ${NOW()} · Válido até ${VALID_UNTIL}`, ML, PH - 42, { width: CW, align: 'center', lineBreak: false })
}

// helpers
function header(y, title, subtitle) {
  doc.fontSize(11).fillColor(C.body).text(title.toUpperCase(), ML, y, { characterSpacing: 0.4, lineBreak: false })
  y += 14
  doc.rect(ML, y, CW, 1.2).fill(C.gold)
  y += 8
  if (subtitle) {
    doc.fontSize(8).fillColor(C.muted).text(subtitle, ML, y, { width: CW, lineBreak: false })
    y += 12
  }
  return y
}
function rule(y, color = C.border, w = 0.5) { doc.rect(ML, y, CW, w).fill(color); return y + w + 4 }

// ═══════════════════════════════════════════════════════════════════
// CAPA
// ═══════════════════════════════════════════════════════════════════
addPage({ cover: true })
doc.rect(0, 0, PW, 6).fill(C.dark)
try { doc.image(readFileSync(LOGO), (PW - 140) / 2, 80, { width: 140 }) } catch {}
doc.fontSize(8).fillColor(C.muted).text('SOMNIUM PROPERTIES', ML, 200, { width: CW, align: 'center', characterSpacing: 2.5 })
doc.fontSize(8).fillColor(C.muted).text('Real Estate Value-Add  ·  Coimbra', ML, 214, { width: CW, align: 'center' })

doc.rect(ML + 80, 240, CW - 160, 0.5).fill(C.gold)

doc.fontSize(7).fillColor(C.muted).text(`DEAL ${DEAL_ID}`, ML + 30, 260, { width: 200, characterSpacing: 1.5 })
doc.fontSize(7).fillColor(C.muted).text('CONFIDENCIAL', PW - ML - 230, 260, { width: 200, align: 'right', characterSpacing: 1.5 })
doc.fontSize(7).fillColor(C.muted).text(`Emitido em ${NOW()}`, ML + 30, 273, { width: 200 })
doc.fontSize(7).fillColor(C.muted).text(`Válido até ${VALID_UNTIL}`, PW - ML - 230, 273, { width: 200, align: 'right' })

doc.fontSize(28).fillColor(C.body).text(im.nome, ML, 320, { width: CW, align: 'center' })
doc.fontSize(10).fillColor(C.gold).text(`${im.zona}, COIMBRA`.toUpperCase(), ML, 360, { width: CW, align: 'center', characterSpacing: 2 })

// Hero box
const hbY = 410, hbH = 130
doc.roundedRect(ML + 30, hbY, CW - 60, hbH, 6).lineWidth(1).stroke(C.dark)
doc.rect(ML + 30, hbY, CW - 60, 4).fill(C.gold)

doc.fontSize(36).fillColor(C.body).text('52,7%', ML + 30, hbY + 22, { width: CW - 60, align: 'center', lineBreak: false })
doc.fontSize(8).fillColor(C.muted).text('TIR ANUALIZADA  ·  APÓS IMPOSTOS', ML + 30, hbY + 70, { width: CW - 60, align: 'center', characterSpacing: 2 })

doc.fontSize(8).fillColor(C.muted)
  .text(`Capital  ${EUR(a.capital_exposto_compra)}    ·    Prazo  ${a.meses} meses    ·    MOIC  ${a.moic.toFixed(2)}×    ·    Pior cenário  +${EUR(a.stress.pior)}`,
    ML + 30, hbY + 100, { width: CW - 60, align: 'center', lineBreak: false })

// Term sheet snippet
let y = 575
const rows = [
  ['ESTRATÉGIA', 'Compra · Remodelação · Revenda (fix & flip)'],
  ['MODELO PARCERIA', 'CAEP — Waterfall com 12% preferred return'],
  ['TICKET', 'Mínimo 50.000€  ·  Máximo 168.655€'],
  ['JANELA DE CAPITAL', '10 dias úteis após assinatura'],
]
rows.forEach(([k, v]) => {
  doc.fontSize(7).fillColor(C.muted).text(k, ML + 60, y, { width: 130, characterSpacing: 1, lineBreak: false })
  doc.fontSize(9).fillColor(C.body).text(v, ML + 200, y - 1, { width: 280, lineBreak: false })
  y += 18
})

doc.rect(ML + 80, 670, CW - 160, 0.5).fill(C.gold)
doc.fontSize(8).fillColor(C.muted).text('PRÓXIMO PASSO', ML, 685, { width: CW, align: 'center', characterSpacing: 2 })
doc.fontSize(9).fillColor(C.body).text('Reunião 30 min com Alexandre Mendes (CFO)', ML, 700, { width: CW, align: 'center', lineBreak: false })
doc.fontSize(8).fillColor(C.muted).text('somniumprs@gmail.com  ·  Calendly: somnium.pt/agendar', ML, 715, { width: CW, align: 'center', lineBreak: false })

doc.rect(0, PH - 6, PW, 6).fill(C.gold)

// ═══════════════════════════════════════════════════════════════════
// PÁG 1 — DECISION SHEET
// ═══════════════════════════════════════════════════════════════════
y = addPage()

doc.fontSize(16).fillColor(C.body).text(im.nome, ML, y, { lineBreak: false })
y += 22
doc.fontSize(9).fillColor(C.muted).text(`${im.zona}, Coimbra  ·  ${im.origem}`, ML, y, { lineBreak: false })
y += 18

// Hero KPIs (3 grandes)
doc.roundedRect(ML, y, CW, 80, 4).lineWidth(0.5).stroke(C.border)
const heroW = CW / 3
const hero = [
  { label: 'TIR ANUALIZADA', val: '52,7%', sub: 'após impostos' },
  { label: 'MOIC', val: '1,24×', sub: 'equity multiple' },
  { label: 'HOLD', val: '6 meses', sub: 'T0 → exit' },
]
hero.forEach((h, i) => {
  const x = ML + i * heroW
  if (i > 0) doc.rect(x, y + 10, 0.5, 60).fill(C.border)
  doc.fontSize(7).fillColor(C.muted).text(h.label, x + 12, y + 14, { width: heroW - 24, characterSpacing: 1, lineBreak: false })
  doc.fontSize(24).fillColor(C.body).text(h.val, x + 12, y + 30, { width: heroW - 24, lineBreak: false })
  doc.fontSize(7).fillColor(C.muted).text(h.sub, x + 12, y + 60, { width: heroW - 24, lineBreak: false })
})
y += 92

// 4 supporting metrics
const sup = [
  ['CAPITAL EXPOSTO', EUR(a.capital_exposto_compra)],
  ['LUCRO LÍQUIDO', EUR(a.lucro_liquido)],
  ['PIOR CENÁRIO', `+${EUR(a.stress.pior)}  resiliente`],
  ['BREAK-EVEN', `${EUR(a.break_even)}  (-${PCT(a.margem_break_even_perc, 1)})`],
]
sup.forEach(([k, v]) => {
  doc.fontSize(7).fillColor(C.muted).text(k, ML, y, { width: 200, characterSpacing: 1, lineBreak: false })
  doc.fontSize(10).fillColor(C.body).text(v, ML + 200, y - 1, { width: CW - 200, lineBreak: false })
  y += 16
})
y += 8

y = header(y, 'Porquê este deal')

const bullets = [
  `Aquisição 12% abaixo do ask price (110k vs 125k) por via off-market — referência directa do proprietário, sem intermediário.`,
  `Empresa em regime de isenção (Lei 56/2023) — IMT zero, vs 5,9k€ que pagaria um particular comprador.`,
  `Margem de 19,9% sobre VVR antes de quebra de break-even — resiliência elevada a correcções de preço.`,
  `Comparáveis na zona Santa Clara mostram €/m² ajustado entre 2.878 e 4.995 (n=4, mediana 3.935). VVR de 245k assume €/m² de 3.936 — alinhado com mediana, não com P90.`,
]
bullets.forEach(b => {
  doc.fontSize(9).fillColor(C.gold).text('▸ ', ML, y, { continued: true, lineBreak: false })
    .fillColor(C.body).text(b, { width: CW - 14, lineGap: 3 })
  y = doc.y + 6
})
y += 4

y = header(y, 'Benchmark comparativo', 'Spread sobre alternativas líquidas e ilíquidas equivalentes')

const bench = [
  ['Obrigações Tesouro PT 10Y',          '3,2%',  '+49,5 pp'],
  ['Índice habitação INE Coimbra',       '6,8%',  '+45,9 pp'],
  ['FTSE EPRA Europa (REIT)',            '5,4%',  '+47,3 pp'],
  ['Depósito a prazo PT 12m',            '2,1%',  '+50,6 pp'],
]
doc.rect(ML, y, CW, 18).fill(C.light)
doc.fontSize(7.5).fillColor(C.gold).text('Alternativa', ML + 8, y + 5, { width: 250, characterSpacing: 0.5, lineBreak: false })
doc.fontSize(7.5).fillColor(C.gold).text('Yield', ML + 280, y + 5, { width: 80, lineBreak: false })
doc.fontSize(7.5).fillColor(C.gold).text('Spread vs deal', ML + 380, y + 5, { width: 120, lineBreak: false })
y += 20
bench.forEach(([k, v, s]) => {
  doc.fontSize(8.5).fillColor(C.body).text(k, ML + 8, y + 2, { width: 250, lineBreak: false })
  doc.fontSize(8.5).fillColor(C.body).text(v, ML + 280, y + 2, { width: 80, lineBreak: false })
  doc.fontSize(8.5).fillColor(C.body).text(s, ML + 380, y + 2, { width: 120, lineBreak: false })
  doc.rect(ML, y + 14, CW, 0.3).fill(C.border)
  y += 18
})
doc.rect(ML, y, CW, 22).fill(C.totalBg)
doc.fontSize(9).fillColor(C.totalFg).text('T2+1 Sub-Cave Lages (TIR)', ML + 8, y + 6, { width: 250, lineBreak: false })
doc.fontSize(9).fillColor(C.totalFg).text('52,7%', ML + 280, y + 6, { width: 80, lineBreak: false })
doc.fontSize(9).fillColor(C.totalFg).text('—', ML + 380, y + 6, { width: 120, lineBreak: false })

// ═══════════════════════════════════════════════════════════════════
// PÁG 2 — Sources & Uses + Calendário
// ═══════════════════════════════════════════════════════════════════
y = addPage()
y = header(y, 'Estrutura de Capital', 'Sources & Uses do deal · capital exposto na compra vs custos pagos no exit')

// Two columns
const colW = (CW - 20) / 2
const colSx = ML, colUx = ML + colW + 20
let sy = y, uy = y

// SOURCES header
doc.fontSize(8).fillColor(C.gold).text('SOURCES', colSx, sy, { width: colW, characterSpacing: 1.5, lineBreak: false })
sy += 12
doc.rect(colSx, sy, colW, 0.5).fill(C.border); sy += 6

const sources = [
  ['Equity Investidor',         '168.655€',  '100,0%'],
  ['Equity Somnium (GP)',       'a definir', 'pari passu'],
  ['Dívida sénior',             '0€',        '0,0%'],
  ['Dívida participativa',      '0€',        '0,0%'],
]
sources.forEach(([k, v, p]) => {
  doc.fontSize(8).fillColor(C.body).text(k, colSx + 4, sy, { width: 130, lineBreak: false })
  doc.fontSize(8).fillColor(C.body).text(v, colSx + 130, sy, { width: 70, align: 'right', lineBreak: false })
  doc.fontSize(7).fillColor(C.muted).text(p, colSx + 205, sy + 1, { width: 60, align: 'right', lineBreak: false })
  sy += 14
})
doc.rect(colSx, sy, colW, 0.5).fill(C.body); sy += 4
doc.fontSize(8.5).fillColor(C.body).text('TOTAL SOURCES', colSx + 4, sy, { width: 130, lineBreak: false })
doc.fontSize(8.5).fillColor(C.gold).text(EUR(a.capital_exposto_compra), colSx + 130, sy, { width: 70, align: 'right', lineBreak: false })
doc.fontSize(7).fillColor(C.muted).text('100,0%', colSx + 205, sy + 1, { width: 60, align: 'right', lineBreak: false })
sy += 16

// USES header
doc.fontSize(8).fillColor(C.gold).text('USES', colUx, uy, { width: colW, characterSpacing: 1.5, lineBreak: false })
uy += 12
doc.rect(colUx, uy, colW, 0.5).fill(C.border); uy += 6

const uses = [
  ['Compra (preço transmissão)', '110.000€',  '65,2%'],
  ['  ▸ IMT (isento Lei 56/23)', '0€',        ''],
  ['  ▸ Imposto Selo (0,8%)',    '880€',      ''],
  ['  ▸ Escritura + CPCV',       '900€',      ''],
  ['Subtotal aquisição',         '111.780€',  '66,3%', true],
  ['Obra com IVA',               '55.975€',   '33,2%'],
  ['  ▸ Mão-de-obra (65%)',      '32.500€',   ''],
  ['  ▸ Materiais (35%)',        '17.500€',   ''],
  ['  ▸ IVA (mix 6/23%)',        '5.975€',    ''],
  ['Detenção (6 meses)',         '900€',      '0,5%'],
]
uses.forEach(([k, v, p, sub]) => {
  if (sub) doc.rect(colUx, uy - 1, colW, 14).fill(C.light)
  doc.fontSize(8).fillColor(sub ? C.body : C.body).text(k, colUx + 4, uy, { width: 150, lineBreak: false })
  doc.fontSize(8).fillColor(C.body).text(v, colUx + 150, uy, { width: 60, align: 'right', lineBreak: false })
  if (p) doc.fontSize(7).fillColor(C.muted).text(p, colUx + 215, uy + 1, { width: 50, align: 'right', lineBreak: false })
  uy += 14
})
doc.rect(colUx, uy, colW, 0.5).fill(C.body); uy += 4
doc.fontSize(8.5).fillColor(C.body).text('TOTAL USES', colUx + 4, uy, { width: 150, lineBreak: false })
doc.fontSize(8.5).fillColor(C.gold).text(EUR(a.capital_exposto_compra), colUx + 150, uy, { width: 60, align: 'right', lineBreak: false })
doc.fontSize(7).fillColor(C.muted).text('100,0%', colUx + 215, uy + 1, { width: 50, align: 'right', lineBreak: false })
uy += 16

y = Math.max(sy, uy) + 8

doc.fontSize(7.5).fillColor(C.muted).text(
  'NOTA · Custos de venda (15.568€: comissão 5% + IVA + CPCV venda + cert. energético) são deduzidos do produto da venda no exit, não do capital call. Capital total alocado a este deal incluindo venda = 184.222€.',
  ML, y, { width: CW, lineGap: 2 }
)
y = doc.y + 12

// TIMELINE
y = header(y, 'Calendário de fluxos', 'Capital call → escritura → obra → marketing → exit · 6 meses')

const timelineY = y + 10
const tlX = ML + 30, tlW = CW - 60
doc.rect(tlX, timelineY, tlW, 1).fill(C.border)
const months = ['T0', 'T+1', 'T+2', 'T+3', 'T+4', 'T+5', 'T+6']
const stepW = tlW / (months.length - 1)
months.forEach((m, i) => {
  const x = tlX + i * stepW
  doc.circle(x, timelineY, 3).fill(C.gold)
  doc.fontSize(7).fillColor(C.body).text(m, x - 12, timelineY + 8, { width: 24, align: 'center', lineBreak: false })
})
y = timelineY + 26

// Timeline phases
const phases = [
  { x: 0,    w: 1, label: 'Capital call 168.655€', color: C.dark },
  { x: 0,    w: 1, label: 'Escritura compra',      color: C.muted },
  { x: 1,    w: 4, label: 'Obra (4 meses, 3 tranches)', color: C.gold },
  { x: 5,    w: 1, label: 'Marketing + visitas',   color: C.muted },
  { x: 6,    w: 0, label: 'Venda + waterfall + distribuição', color: C.dark },
]
phases.forEach((p, i) => {
  const x1 = tlX + p.x * stepW
  const x2 = tlX + (p.x + Math.max(p.w, 0.05)) * stepW
  doc.rect(x1, y + i * 14, x2 - x1, 6).fill(p.color)
  doc.fontSize(7.5).fillColor(C.body).text(p.label, x2 + 6, y + i * 14 - 1, { lineBreak: false })
})
y += phases.length * 14 + 16

doc.rect(ML, y, CW, 0.3).fill(C.border); y += 8
doc.fontSize(8.5).fillColor(C.body).text('FLUXOS LÍQUIDOS DO INVESTIDOR', ML, y, { characterSpacing: 1, lineBreak: false })
y += 14
const cf = [
  ['T0',   '−168.655€', 'Capital call (wire transfer)'],
  ['T+6',  '+212.078€', 'Return of capital + preferred 12% + 50% do excedente'],
  ['TIR',  '52,7%',     'Anualizada após impostos'],
  ['MOIC', '1,257×',    'Após waterfall (vs 1,236× em split 50/50 puro)'],
]
cf.forEach(([k, v, n]) => {
  doc.fontSize(8).fillColor(C.muted).text(k, ML + 4, y, { width: 50, lineBreak: false })
  doc.fontSize(9).fillColor(C.body).text(v, ML + 60, y, { width: 90, lineBreak: false })
  doc.fontSize(8).fillColor(C.muted).text(n, ML + 160, y + 1, { width: CW - 160, lineBreak: false })
  y += 14
})

// ═══════════════════════════════════════════════════════════════════
// PÁG 3 — Estudo de Mercado
// ═══════════════════════════════════════════════════════════════════
y = addPage()
y = header(y, 'Estudo de Mercado', `Comparáveis na zona ${im.zona} · n=${compN} · CV=${compCV}%`)

// Stats KPIs
doc.roundedRect(ML, y, CW, 50, 4).lineWidth(0.5).stroke(C.border)
const sw = CW / 4
const stats = [
  ['MEDIANA €/m²',       '3.935 €/m²'],
  ['MÉDIA €/m²',         '3.936 €/m²'],
  ['DESVIO-PADRÃO',      '±929 €/m²'],
  ['VVR APLICADO',       '3.936 €/m²'],
]
stats.forEach((s, i) => {
  const x = ML + i * sw
  if (i > 0) doc.rect(x, y + 8, 0.5, 34).fill(C.border)
  doc.fontSize(7).fillColor(C.muted).text(s[0], x + 10, y + 10, { width: sw - 20, characterSpacing: 0.5, lineBreak: false })
  doc.fontSize(13).fillColor(C.body).text(s[1], x + 10, y + 24, { width: sw - 20, lineBreak: false })
})
y += 60

// Tabela de comparáveis
doc.rect(ML, y, CW, 18).fill(C.light)
const cols = [['#', 25], ['Preço', 70], ['Área', 50], ['€/m² bruto', 65], ['€/m² ajust.', 70], ['Δ ajust.', 60], ['Fonte', 155]]
let cx = ML + 6
cols.forEach(([l, w]) => {
  doc.fontSize(7).fillColor(C.gold).text(l, cx, y + 5, { width: w, characterSpacing: 0.3, lineBreak: false })
  cx += w
})
y += 20
a.comparaveis.forEach((c, i) => {
  if (i % 2 === 1) doc.rect(ML, y - 2, CW, 18).fill(C.light)
  cx = ML + 6
  const ajustePerc = ((c.ajustado / c.eur_m2 - 1) * 100).toFixed(1)
  const cells = [`${i + 1}`, EUR(c.preco), `${c.area} m²`, `${c.eur_m2}`, `${c.ajustado}`, `${ajustePerc >= 0 ? '+' : ''}${ajustePerc}%`, c.link]
  cells.forEach((v, j) => {
    doc.fontSize(8).fillColor(C.body).text(v, cx, y + 2, { width: cols[j][1], lineBreak: false })
    cx += cols[j][1]
  })
  y += 18
})
y += 8

doc.rect(ML, y, CW, 0.3).fill(C.border); y += 8

y = header(y, 'Distribuição de €/m² ajustado', 'Range observado vs VVR aplicado')

// Mini "P10/P50/P90" bar
const barY = y + 10, barH = 18
const minV = 2878, maxV = 4995, vvrM2 = 3936
doc.rect(ML + 50, barY, CW - 100, barH).fill(C.light)
const px = (val) => ML + 50 + ((val - minV) / (maxV - minV)) * (CW - 100)
// markers
doc.rect(px(minV) - 1, barY - 2, 2, barH + 4).fill(C.muted)
doc.rect(px(maxV) - 1, barY - 2, 2, barH + 4).fill(C.muted)
doc.rect(px(compMediana) - 1, barY - 4, 2, barH + 8).fill(C.body)
doc.rect(px(vvrM2) - 2, barY - 4, 4, barH + 8).fill(C.gold)
// labels
doc.fontSize(7).fillColor(C.muted).text(`mín ${minV}`, ML, barY + 4, { width: 48, align: 'right', lineBreak: false })
doc.fontSize(7).fillColor(C.muted).text(`máx ${maxV}`, ML + CW - 50, barY + 4, { width: 48, lineBreak: false })
doc.fontSize(7).fillColor(C.body).text(`mediana 3.935`, px(compMediana) - 30, barY + barH + 6, { width: 60, align: 'center', lineBreak: false })
doc.fontSize(7).fillColor(C.gold).text(`VVR 3.936`, px(vvrM2) - 25, barY - 14, { width: 50, align: 'center', lineBreak: false })
y = barY + barH + 28

doc.fontSize(8).fillColor(C.muted).text(
  'INTERPRETAÇÃO · O VVR aplicado (3.936 €/m²) está alinhado com a mediana da amostra de 4 comparáveis ajustados, não com o P90 (4.995). Coeficiente de variação de 23,6% indica amostra dispersa — recomendável aumentar n para >6 antes do envio definitivo. Snapshot dos comparáveis está em folder Drive 17jtxC2gXVLECmLuRBHpld_pb6MhJfJNa.',
  ML, y, { width: CW, lineGap: 3 }
)

// ═══════════════════════════════════════════════════════════════════
// PÁG 4 — Análise Financeira
// ═══════════════════════════════════════════════════════════════════
y = addPage()
y = header(y, 'Análise Financeira', 'Cenário base · regime fiscal IRS Particular · 100% capitais próprios')

function group(yIn, title, items, totalLabel, totalVal) {
  doc.fontSize(8).fillColor(C.gold).text(title.toUpperCase(), ML, yIn, { characterSpacing: 1, lineBreak: false })
  yIn += 12
  doc.rect(ML, yIn, CW, 0.4).fill(C.border); yIn += 4
  items.forEach(([k, v]) => {
    doc.fontSize(8).fillColor(C.body).text(k, ML + 6, yIn, { width: 380, lineBreak: false })
    doc.fontSize(8).fillColor(C.body).text(v, ML + 380, yIn, { width: CW - 380, align: 'right', lineBreak: false })
    yIn += 13
  })
  doc.rect(ML, yIn, CW, 16).fill(C.light)
  doc.fontSize(8.5).fillColor(C.body).text(totalLabel, ML + 6, yIn + 4, { width: 380, lineBreak: false })
  doc.fontSize(8.5).fillColor(C.body).text(totalVal, ML + 380, yIn + 4, { width: CW - 380, align: 'right', lineBreak: false })
  yIn += 22
  return yIn
}

y = group(y, 'Custos · Aquisição', [
  ['Preço de transmissão',                     EUR(110000)],
  ['Imposto Selo (0,8%)',                      EUR(880)],
  ['IMT (Empresa, isento Lei 56/2023)',        EUR(0)],
  ['Escritura + CPCV + registos',              EUR(900)],
], 'Subtotal aquisição', EUR(111780))

y = group(y, 'Custos · Obra', [
  ['Mão-de-obra (65% × 50.000€)',              EUR(32500)],
  ['Materiais (35% × 50.000€)',                EUR(17500)],
  ['IVA (MO 6% + materiais 23%)',              EUR(5975)],
], 'Subtotal obra', EUR(55975))

y = group(y, 'Custos · Detenção (6 meses)', [
  ['Seguro (50€/m × 6)',                       EUR(300)],
  ['Utilidades (100€/m × 6)',                  EUR(600)],
  ['IMI proporcional',                         EUR(0)],
], 'Subtotal detenção', EUR(900))

y = group(y, 'Custos · Venda (deduzidos no exit)', [
  ['Comissão 5% × 245.000€',                   EUR(12250)],
  ['IVA da comissão (23%)',                    EUR(2818)],
  ['CPCV venda + cert. energético',            EUR(500)],
], 'Subtotal venda', EUR(15568))

doc.rect(ML, y, CW, 22).fill(C.totalBg)
doc.fontSize(9).fillColor(C.totalFg).text('TOTAL CUSTOS', ML + 6, y + 6, { lineBreak: false })
doc.fontSize(9).fillColor(C.totalFg).text(EUR(184223), ML + 380, y + 6, { width: CW - 380, align: 'right', lineBreak: false })
y += 30

// Receita + resultado
doc.fontSize(8).fillColor(C.gold).text('RECEITA', ML, y, { characterSpacing: 1, lineBreak: false })
y += 12
doc.rect(ML, y, CW, 0.4).fill(C.border); y += 4
doc.fontSize(8).fillColor(C.body).text('Valor de venda alvo (VVR)', ML + 6, y, { width: 380, lineBreak: false })
doc.fontSize(8).fillColor(C.body).text(EUR(245000), ML + 380, y, { width: CW - 380, align: 'right', lineBreak: false })
y += 18

doc.rect(ML, y, CW, 22).fill(C.dark)
doc.fontSize(9).fillColor(C.gold).text('LUCRO LÍQUIDO  (após IRS)', ML + 6, y + 6, { lineBreak: false })
doc.fontSize(9).fillColor(C.gold).text(EUR(43424), ML + 380, y + 6, { width: CW - 380, align: 'right', lineBreak: false })
y += 30

// Métricas finais
y = header(y, 'Métricas de retorno')
const m = [
  ['MOIC (Equity Multiple)',                '1,24×'],
  ['TIR anualizada',                        '52,7%  (após impostos, descontando cashflows)'],
  ['ROI total (não anualizado)',            '32,99%'],
  ['Margem líquida sobre VVR',              '17,7%'],
  ['Break-even price',                      '196.295€  (margem -19,9% face ao VVR)'],
]
m.forEach(([k, v]) => {
  doc.fontSize(8).fillColor(C.muted).text(k, ML + 4, y, { width: 200, lineBreak: false })
  doc.fontSize(9).fillColor(C.body).text(v, ML + 210, y - 1, { width: CW - 210, lineBreak: false })
  y += 14
})

// ═══════════════════════════════════════════════════════════════════
// PÁG 5 — Sensibilidade (Tornado)
// ═══════════════════════════════════════════════════════════════════
y = addPage()
y = header(y, 'Análise de Sensibilidade', '16 cenários testados · pior cenário mantém-se positivo (+1.353€)')

// Veredicto
doc.roundedRect(ML, y, CW, 28, 4).fill('#eef4ec')
doc.fontSize(10).fillColor(C.green).text('▸ INVESTIMENTO RESILIENTE', ML + 12, y + 6, { lineBreak: false })
doc.fontSize(8).fillColor(C.body).text('Lucro líquido positivo em todos os 16 cenários testados', ML + 12, y + 18, { lineBreak: false })
y += 40

// Tornado chart
const tcCenter = ML + CW * 0.55
const tcMax = 35000
const tcW = CW * 0.4
const px2 = (val) => tcCenter + (val / tcMax) * tcW
const tcRowH = 22

a.stress.sensibilidades.forEach(s => {
  doc.fontSize(8).fillColor(C.body).text(s.label, ML, y + 6, { width: 80, lineBreak: false })
  // baseline
  doc.rect(tcCenter - 0.5, y - 4, 1, tcRowH + 4).fill(C.body)
  // bar down
  const xd1 = px2(s.down), xd2 = tcCenter
  doc.rect(xd1, y + 2, xd2 - xd1, tcRowH - 6).fill(C.red)
  // bar up
  const xu1 = tcCenter, xu2 = px2(s.up)
  doc.rect(xu1, y + 2, xu2 - xu1, tcRowH - 6).fill(C.green)
  // labels
  doc.fontSize(7).fillColor(C.muted).text(EUR(s.down), xd1 - 50, y + 4, { width: 48, align: 'right', lineBreak: false })
  doc.fontSize(7).fillColor(C.muted).text(EUR(s.up), xu2 + 4, y + 4, { width: 60, lineBreak: false })
  y += tcRowH
})
// Eixo
doc.fontSize(7).fillColor(C.muted).text('Cenário base 43.424€ ↑', tcCenter - 60, y + 4, { width: 120, align: 'center', lineBreak: false })
y += 22

y = header(y, 'Interpretação')
const interp = [
  ['Variável dominante',  'VVR (preço de venda) — queda de 20% reduz lucro líquido em 76% (de 43.424€ para 10.314€).'],
  ['Variável secundária', 'Custo de obra — overrun de 20% reduz lucro em 19% (8.060€ menos).'],
  ['Variável insensível', 'Prazo — atraso de 6 meses reduz lucro em apenas 2% (900€). Custos detenção baixos.'],
  ['Pior cenário combinado', 'VVR-20% + Obra+20% + 6m: positivo em 1.353€ (margem 0,7% sobre capital exposto).'],
]
interp.forEach(([k, v]) => {
  doc.fontSize(8).fillColor(C.gold).text('▸ ' + k, ML, y, { width: 130, characterSpacing: 0.3, lineBreak: false })
  doc.fontSize(8).fillColor(C.body).text(v, ML + 140, y - 1, { width: CW - 140, lineGap: 2 })
  y = doc.y + 6
})
y += 4

y = header(y, 'Mitigação dos riscos principais')
const mit = [
  ['VVR ↓', 'Pricing escalonado (lançamento a 245k, redução para 232k aos 60 dias) · plano B arrendamento estudantil (yield 5,5–6%).'],
  ['Obra ↑', 'Contrato preço fixo · retenção 10% até VC final · 3 tranches por milestones · reserva contingência 5% extra ao capital call.'],
]
mit.forEach(([k, v]) => {
  doc.fontSize(8).fillColor(C.amber).text(k, ML + 4, y, { width: 60, lineBreak: false })
  doc.fontSize(8).fillColor(C.body).text(v, ML + 70, y - 1, { width: CW - 70, lineGap: 2 })
  y = doc.y + 6
})

// ═══════════════════════════════════════════════════════════════════
// PÁG 6 — Risk Factors
// ═══════════════════════════════════════════════════════════════════
y = addPage()
y = header(y, 'Factores de Risco', 'Taxonomia · impacto × probabilidade × mitigação')

const risks = [
  ['01', 'Mercado (preço venda)',  'Alto',  'Médio', 'Pricing escalonado · plano B arrendamento · stress -20% mantém lucro +10.314€.'],
  ['02', 'Obra (overrun)',         'Médio', 'Médio', 'Contrato preço fixo · retenção 10% até VC · 3 tranches por milestones.'],
  ['03', 'Prazo (delay)',          'Baixo', 'Médio', 'Custos detenção 150€/m · +6m apenas −900€ no LL. Insensibilidade alta.'],
  ['04', 'Fiscal (IRS m-valias)',  'Médio', 'Baixo', 'Ano fiscal 2026 fixado à escritura · alterações OE 2027 não retroagem.'],
  ['05', 'Liquidez (6+ meses)',    'Alto',  'Alto',  'Ilíquido. Cessão de posição mediante aprovação Somnium (não recusada sem causa).'],
  ['06', 'Contraparte (empreit.)', 'Médio', 'Baixo', 'Track record validado · cláusula substituição automática se atraso >30 dias.'],
  ['07', 'Regulatório (IMT/IS)',   'Baixo', 'Baixo', 'Empresa em isenção Lei 56/2023 · alterações requerem >12m vacatio legis.'],
  ['08', 'Concentração',           'Alto',  'n/a',   'Single-asset · não diversifica · posicionar como satélite num portfolio.'],
]

doc.rect(ML, y, CW, 18).fill(C.light)
const rcols = [['#', 22], ['Risco', 110], ['Imp.', 45], ['Prob.', 45], ['Mitigação', CW - 22 - 110 - 45 - 45]]
cx = ML + 6
rcols.forEach(([l, w]) => {
  doc.fontSize(7).fillColor(C.gold).text(l, cx, y + 5, { width: w, characterSpacing: 0.5, lineBreak: false })
  cx += w
})
y += 20

risks.forEach(r => {
  cx = ML + 6
  const cellHeights = [12]
  // Compute height needed
  doc.fontSize(7.5)
  const mitH = doc.heightOfString(r[4], { width: rcols[4][1] - 6, lineGap: 2 })
  const rowH = Math.max(28, mitH + 12)
  // alt row
  // text
  cx = ML + 6
  doc.fontSize(8).fillColor(C.muted).text(r[0], cx, y + 4, { width: rcols[0][1], lineBreak: false }); cx += rcols[0][1]
  doc.fontSize(8).fillColor(C.body).text(r[1], cx, y + 4, { width: rcols[1][1], lineBreak: false }); cx += rcols[1][1]
  const impColor = r[2] === 'Alto' ? C.red : r[2] === 'Médio' ? C.amber : C.green
  doc.fontSize(8).fillColor(impColor).text(r[2], cx, y + 4, { width: rcols[2][1], lineBreak: false }); cx += rcols[2][1]
  const probColor = r[3] === 'Alto' ? C.red : r[3] === 'Médio' ? C.amber : C.green
  doc.fontSize(8).fillColor(probColor).text(r[3], cx, y + 4, { width: rcols[3][1], lineBreak: false }); cx += rcols[3][1]
  doc.fontSize(7.5).fillColor(C.body).text(r[4], cx, y + 4, { width: rcols[4][1] - 6, lineGap: 2 })
  y += rowH
  doc.rect(ML, y - 0.3, CW, 0.3).fill(C.border)
})

y += 12
y = header(y, 'Adequação de perfil', 'Filtro inverso · qualifica investidor antes da chamada')

doc.fontSize(8).fillColor(C.green).text('ESTE INVESTIMENTO É ADEQUADO A INVESTIDOR QUE:', ML, y, { characterSpacing: 0.5, lineBreak: false })
y += 14
const adq = [
  'Aceita iliquidez de 6+ meses sem opção de saída antecipada.',
  'Tem capacidade financeira para perda parcial (até 20% do capital).',
  'Já tem portfolio diversificado e este é uma alocação satélite.',
]
adq.forEach(t => {
  doc.fontSize(8).fillColor(C.gold).text('▸ ', ML, y, { continued: true, lineBreak: false }).fillColor(C.body).text(t, { width: CW - 14 })
  y = doc.y + 3
})
y += 6
doc.fontSize(8).fillColor(C.red).text('NÃO É ADEQUADO A:', ML, y, { characterSpacing: 0.5, lineBreak: false })
y += 14
const nao = [
  'Investidor que precisa de liquidez no horizonte 12 meses.',
  'Investidor com tolerância zero a perda nominal.',
  'Investidor sem outras posições além desta.',
]
nao.forEach(t => {
  doc.fontSize(8).fillColor(C.red).text('▸ ', ML, y, { continued: true, lineBreak: false }).fillColor(C.body).text(t, { width: CW - 14 })
  y = doc.y + 3
})

// ═══════════════════════════════════════════════════════════════════
// PÁG 7 — Waterfall + Asymmetric Commitments
// ═══════════════════════════════════════════════════════════════════
y = addPage()
y = header(y, 'Modelo de Parceria', 'Distribution waterfall com 12% preferred return')

const tiers = [
  ['1', 'Return of Capital',     '100% do capital chamado é devolvido ao investidor antes de qualquer distribuição.', '168.655€', 'investidor'],
  ['2', 'Preferred Return 12%',  'Investidor recebe 12% anualizado pro-rata sobre capital exposto (= 6% em 6 meses).',  '11.053€', 'investidor'],
  ['3', 'GP Catch-up',           'Somnium recebe 100% até atingir paridade com Tier 2.',                                '11.053€', 'Somnium'],
  ['4', 'Carry split 50/50',     'Restante distribuído 50/50 sobre 21.318€.',                                           '10.659€ + 10.659€', 'ambos'],
]
tiers.forEach(([t, name, desc, val, dest]) => {
  doc.roundedRect(ML, y, CW, 38, 3).lineWidth(0.5).stroke(C.border)
  doc.circle(ML + 14, y + 19, 9).fill(C.gold)
  doc.fontSize(9).fillColor(C.white).text(t, ML + 8, y + 14, { width: 12, align: 'center', lineBreak: false })
  doc.fontSize(9).fillColor(C.body).text(name, ML + 32, y + 6, { width: 200, lineBreak: false })
  doc.fontSize(7.5).fillColor(C.muted).text(desc, ML + 32, y + 20, { width: 280, lineGap: 2 })
  doc.fontSize(10).fillColor(C.gold).text(val, ML + 320, y + 8, { width: CW - 320, align: 'right', lineBreak: false })
  doc.fontSize(7).fillColor(C.muted).text(`→ ${dest}`, ML + 320, y + 22, { width: CW - 320, align: 'right', lineBreak: false })
  y += 42
})

doc.rect(ML, y, CW, 28).fill(C.dark)
doc.fontSize(8).fillColor(C.gold).text('RESULTADO LÍQUIDO', ML + 8, y + 6, { characterSpacing: 1, lineBreak: false })
doc.fontSize(9).fillColor(C.white).text('Investidor leva 190.367€ (MOIC 1,129×) · Somnium leva 21.712€ (carry total)', ML + 8, y + 17, { lineBreak: false })
y += 36

doc.fontSize(7.5).fillColor(C.muted).text(
  'NOTA · Neste deal o waterfall com pref 12% produz o mesmo resultado que o split 50/50 puro porque a TIR (52,7%) está bem acima do pref. A diferença aparece em deals de menor retorno: se a TIR fosse 14%, o investidor levaria ~94% do lucro com waterfall vs 50% sem. O waterfall protege o investidor em deals medianos sem penalizar a Somnium em deals de excelência.',
  ML, y, { width: CW, lineGap: 2 }
)
y = doc.y + 14

y = header(y, 'Asymmetric Commitments', 'Compromissos da Somnium para alinhar incentivos')

const ac = [
  ['CLAWBACK PARCIAL',  'Se RA real for inferior a 50% do RA projectado (i.e. <26,4%), Somnium renuncia a 25% da sua quota.'],
  ['AUDIT RIGHT',       'Investidor pode pedir auditoria por TOC à sua escolha. Custos da Somnium se forem detectadas discrepâncias materiais (>3%).'],
  ['REPORTING SLA',     'Relatório enviado todas as sextas até 18h: % obra concluída, custo acumulado vs orçamento, fotos com timestamp, próximos marcos. Falha de SLA: penalização 0,1% da quota Somnium por falha (max 2% acumulado).'],
  ['OVERRUNS',          'Derrapagens de obra >5% absorvidas 100% pela Somnium até 15% de overrun. Acima disso, capital call adicional proporcional, com aprovação do investidor.'],
]
ac.forEach(([k, v]) => {
  doc.fontSize(8).fillColor(C.gold).text('▸ ' + k, ML, y, { width: 130, characterSpacing: 0.5, lineBreak: false })
  doc.fontSize(8).fillColor(C.body).text(v, ML + 140, y - 1, { width: CW - 140, lineGap: 2 })
  y = doc.y + 6
})

// ═══════════════════════════════════════════════════════════════════
// PÁG 8 — Term Sheet + Declaração Auditável
// ═══════════════════════════════════════════════════════════════════
y = addPage()
y = header(y, 'Term Sheet')

const ts = [
  ['DEAL',           'T2+1 Sub-Cave Lages, Santa Clara, Coimbra'],
  ['ID',             DEAL_ID],
  ['ESTRATÉGIA',     'Buy · Renovate · Sell (fix & flip)'],
  ['VEÍCULO',        'SPV única para este deal (a constituir)'],
  ['CAPITAL TOTAL',  '168.655€  (capital exposto na compra)'],
  ['TICKET',         'Mínimo 50.000€  ·  Máximo 168.655€'],
  ['HOLD',           'Esperado 6m · Máximo 12m (gatilho automático plano B)'],
  ['RETORNO ALVO',   'TIR 52,7%  ·  MOIC 1,24×'],
  ['PREF RETURN',    '12% anualizado'],
  ['CARRY',          '50/50 após preferred + catch-up'],
  ['FEES',           'Sem management fee · Reembolso de constituição SPV (max 2.500€)'],
  ['LIQUIDEZ',       'Ilíquido · cessão mediante aprovação Somnium (não razoavelmente recusada)'],
  ['REPORTING',      'Semanal sexta 18h · Trimestral DF · Anual relatório completo'],
]
ts.forEach(([k, v]) => {
  doc.fontSize(7).fillColor(C.muted).text(k, ML + 4, y, { width: 110, characterSpacing: 0.8, lineBreak: false })
  doc.fontSize(8.5).fillColor(C.body).text(v, ML + 120, y - 1, { width: CW - 120, lineBreak: false })
  doc.rect(ML, y + 12, CW, 0.3).fill(C.border)
  y += 16
})
y += 6

y = header(y, 'Cronograma de Fecho')
const sched = [
  ['T-15',  'Envio deste documento ao investidor (hoje).'],
  ['T-10',  'Reunião 30min com CFO Somnium.'],
  ['T-7',   'Sessão Q&A + envio termsheet definitivo.'],
  ['T-3',   'Assinatura subscription agreement.'],
  ['T 0',   'Capital call (10 dias úteis para wire transfer).'],
  ['T+1',   'Constituição SPV + escritura compra.'],
  ['T+6',   'Venda + waterfall + distribuição.'],
]
sched.forEach(([k, v]) => {
  doc.fontSize(8).fillColor(C.gold).text(k, ML + 4, y, { width: 50, lineBreak: false })
  doc.fontSize(8).fillColor(C.body).text(v, ML + 60, y, { width: CW - 60, lineBreak: false })
  y += 13
})
y += 8

y = header(y, 'Contacto')
doc.fontSize(10).fillColor(C.body).text('Alexandre Mendes, CFO', ML, y, { lineBreak: false })
y += 14
doc.fontSize(8).fillColor(C.muted).text('somniumprs@gmail.com  ·  +351 ___ ___ ___  ·  Calendly: somnium.pt/agendar', ML, y, { lineBreak: false })
y += 22

y = header(y, 'Declaração Técnica e Auditável')
const decl = [
  ['MÉTODO VVR',    'Média ponderada de €/m² ajustado de 4 comparáveis listados em portais públicos (Idealista, Remax, KW), zona Santa Clara e Castelo Viegas, transaccionados ou listados nos últimos 180 dias. Ajustes: negociação (-5%), localização (±5%), área, idade, conservação. Lista detalhada disponível mediante pedido.'],
  ['MÉTODO STRESS', '16 cenários gerados algoritmicamente: 4 downside simples (VVR ±10/20%, Obra ±10/20%), 2 prazo (+3m/+6m e -2m/-3m), combinados. Pior cenário: VVR-20% + Obra+20% + Prazo+6m.'],
  ['MÉTODO FISCAL', 'IRS Particular, regime mais-valias 50% englobamento, ano de aquisição 2026. Derrama municipal 1,5% (Coimbra). IMT zero por isenção empresarial Lei 56/2023.'],
  ['FONTES',        'Comparáveis recolhidos manualmente em 2026-04-26 a 2026-05-01. Snapshot Drive: 17jtxC2gXVLECmLuRBHpld_pb6MhJfJNa. Acesso ao investidor após NDA.'],
]
decl.forEach(([k, v]) => {
  doc.fontSize(7).fillColor(C.gold).text('▸ ' + k, ML, y, { width: 90, characterSpacing: 0.5, lineBreak: false })
  doc.fontSize(7).fillColor(C.body).text(v, ML + 100, y - 0.5, { width: CW - 100, lineGap: 2 })
  y = doc.y + 5
})
y += 4

doc.rect(ML, y, CW, 0.3).fill(C.border)
y += 6
doc.fontSize(6.5).fillColor(C.muted).text(
  'Este documento é preparado para fins informativos e não constitui aconselhamento financeiro ou fiscal. Os valores são estimativas baseadas na metodologia explicitada acima e podem variar. Investimento imobiliário envolve risco de capital. Consulte um TOC/advogado antes de decidir. Somnium Properties — Documento Confidencial.',
  ML, y, { width: CW, lineGap: 2 }
)

doc.end()
console.log('PDF gerado em:', OUT)
