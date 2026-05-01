/**
 * Gerador de PDF-exemplo (CIM institucional reformulado).
 * Aplica Tier 1+2 da auditoria ao deal T2 Sub-Cave Lages.
 * Output: /tmp/cim-example-t2-lages.pdf
 */
import PDFDocument from 'pdfkit'
import { readFileSync, createWriteStream } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const LOGO = path.resolve(ROOT, 'public/logo-transparent.png')
const OUT = '/tmp/cim-example-t2-lages.pdf'

// ─── Design tokens ───
const C = {
  gold: '#C9A84C', dark: '#0d0d0d', white: '#ffffff',
  body: '#2a2a2a', muted: '#888888', border: '#e0ddd5',
  light: '#f0efe9', green: '#2d6a2d', red: '#8b2020', amber: '#b87a1f',
  totalBg: '#0d0d0d', totalFg: '#C9A84C',
}
const ML = 50, MR = 50, PW = 595.28, PH = 841.89, CW = PW - ML - MR
const TOP = 50, BOTTOM = 780  // safe vertical zone for content
const EUR = (v) => v == null ? '—' : new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(v)
const NOW = () => new Date().toLocaleDateString('pt-PT', { day: '2-digit', month: 'long', year: 'numeric' })
const DEAL_ID = 'SP-2026-018'
const VALID_UNTIL = '15 maio 2026'

// ─── PDF — bufferPages para controlar paginação ───
const doc = new PDFDocument({ size: 'A4', margin: 0, autoFirstPage: false, bufferPages: true })
doc.pipe(createWriteStream(OUT))

const state = { page: 0, totalPages: 8 }

function newPage(opts = {}) {
  doc.addPage({ size: 'A4', margin: 0 })
  state.page++
  if (!opts.cover) {
    try { doc.image(readFileSync(LOGO), ML, 18, { height: 18 }) } catch {}
    doc.fontSize(7).fillColor(C.muted).text(`${DEAL_ID}  ·  pág. ${state.page}/${state.totalPages}`, ML, 22, { width: CW, align: 'right', lineBreak: false })
    doc.rect(ML, 44, CW, 1.2).fill(C.gold)
    doc.rect(ML, PH - 50, CW, 0.5).fill(C.gold)
    doc.fontSize(6.5).fillColor(C.muted).text(`Confidencial · Somnium Properties · Emitido em ${NOW()} · Válido até ${VALID_UNTIL}`, ML, PH - 42, { width: CW, align: 'center', lineBreak: false })
  }
}

// helpers — todos com lineBreak: false e width estrito para nunca disparar auto-paginação
const T = (size, color, text, x, y, w, opts = {}) =>
  doc.fontSize(size).fillColor(color).text(text, x, y, { width: w, lineBreak: false, ...opts })

function header(y, title, subtitle) {
  T(11, C.body, title.toUpperCase(), ML, y, CW, { characterSpacing: 0.4 })
  y += 14
  doc.rect(ML, y, CW, 1.2).fill(C.gold)
  y += 7
  if (subtitle) {
    T(8, C.muted, subtitle, ML, y, CW)
    y += 12
  }
  return y
}

// ═══════════════════════════════════════════════════════════════════
// PÁG 1 — CAPA
// ═══════════════════════════════════════════════════════════════════
newPage({ cover: true })
doc.rect(0, 0, PW, 6).fill(C.dark)
try { doc.image(readFileSync(LOGO), (PW - 130) / 2, 70, { width: 130 }) } catch {}
T(8, C.muted, 'SOMNIUM PROPERTIES', ML, 180, CW, { align: 'center', characterSpacing: 2.5 })
T(8, C.muted, 'Real Estate Value-Add  ·  Coimbra', ML, 194, CW, { align: 'center' })

doc.rect(ML + 80, 220, CW - 160, 0.5).fill(C.gold)

T(7, C.muted, `DEAL ${DEAL_ID}`, ML + 30, 240, 200, { characterSpacing: 1.5 })
T(7, C.muted, 'CONFIDENCIAL', PW - ML - 230, 240, 200, { align: 'right', characterSpacing: 1.5 })
T(7, C.muted, `Emitido em ${NOW()}`, ML + 30, 253, 200)
T(7, C.muted, `Válido até ${VALID_UNTIL}`, PW - ML - 230, 253, 200, { align: 'right' })

T(28, C.body, 'T2+1 Sub-Cave Lages', ML, 295, CW, { align: 'center' })
T(10, C.gold, 'SANTA CLARA E CASTELO VIEGAS, COIMBRA', ML, 335, CW, { align: 'center', characterSpacing: 2 })

// Hero box
const hbY = 380, hbH = 130
doc.roundedRect(ML + 30, hbY, CW - 60, hbH, 6).lineWidth(1).stroke(C.dark)
doc.rect(ML + 30, hbY, CW - 60, 4).fill(C.gold)
T(36, C.body, '52,7%', ML + 30, hbY + 22, CW - 60, { align: 'center' })
T(8, C.muted, 'TIR ANUALIZADA  ·  APÓS IMPOSTOS', ML + 30, hbY + 70, CW - 60, { align: 'center', characterSpacing: 2 })
T(8, C.muted, `Capital  168.655€    ·    Prazo  6 meses    ·    MOIC  1,24×    ·    Pior cenário  +1.353€`, ML + 30, hbY + 100, CW - 60, { align: 'center' })

// Term sheet snippet
let y = 540
const rows = [
  ['ESTRATÉGIA', 'Compra · Remodelação · Revenda (fix & flip)'],
  ['MODELO PARCERIA', 'CAEP — Waterfall com 12% preferred return'],
  ['TICKET', 'Mínimo 50.000€  ·  Máximo 168.655€'],
  ['JANELA DE CAPITAL', '10 dias úteis após assinatura'],
]
rows.forEach(([k, v]) => {
  T(7, C.muted, k, ML + 60, y, 130, { characterSpacing: 1 })
  T(9, C.body, v, ML + 200, y - 1, 280)
  y += 18
})

doc.rect(ML + 80, 640, CW - 160, 0.5).fill(C.gold)
T(8, C.muted, 'PRÓXIMO PASSO', ML, 655, CW, { align: 'center', characterSpacing: 2 })
T(9, C.body, 'Reunião 30 min com Alexandre Mendes (CFO)', ML, 670, CW, { align: 'center' })
T(8, C.muted, 'somniumprs@gmail.com  ·  Calendly: somnium.pt/agendar', ML, 685, CW, { align: 'center' })

doc.rect(0, PH - 6, PW, 6).fill(C.gold)

// ═══════════════════════════════════════════════════════════════════
// PÁG 2 — DECISION SHEET
// ═══════════════════════════════════════════════════════════════════
newPage()
y = 60

T(16, C.body, 'T2+1 Sub-Cave Lages', ML, y, CW); y += 22
T(9, C.muted, 'Santa Clara e Castelo Viegas, Coimbra  ·  Off-market via Referência', ML, y, CW); y += 16

// 3 hero KPIs
doc.roundedRect(ML, y, CW, 70, 4).lineWidth(0.5).stroke(C.border)
const heroW = CW / 3
const hero = [
  { label: 'TIR ANUALIZADA', val: '52,7%', sub: 'após impostos' },
  { label: 'MOIC', val: '1,24×', sub: 'equity multiple' },
  { label: 'HOLD', val: '6 meses', sub: 'T0 → exit' },
]
hero.forEach((h, i) => {
  const x = ML + i * heroW
  if (i > 0) doc.rect(x, y + 8, 0.5, 54).fill(C.border)
  T(7, C.muted, h.label, x + 12, y + 12, heroW - 24, { characterSpacing: 1 })
  T(22, C.body, h.val, x + 12, y + 26, heroW - 24)
  T(7, C.muted, h.sub, x + 12, y + 54, heroW - 24)
})
y += 80

// 4 supporting metrics
const sup = [
  ['CAPITAL EXPOSTO', '168.655€'],
  ['LUCRO LÍQUIDO', '43.424€'],
  ['PIOR CENÁRIO', '+1.353€  resiliente'],
  ['BREAK-EVEN', '196.295€  (-19,9%)'],
]
sup.forEach(([k, v]) => {
  T(7, C.muted, k, ML, y, 200, { characterSpacing: 1 })
  T(10, C.body, v, ML + 200, y - 1, CW - 200)
  y += 14
})
y += 6

y = header(y, 'Porquê este deal')

const bullets = [
  'Aquisição 12% abaixo do ask price (110k vs 125k) por via off-market.',
  'Empresa em regime de isenção (Lei 56/2023) — IMT zero, vs 5,9k€ para particular.',
  'Margem de 19,9% sobre VVR antes de quebra de break-even — resiliência elevada.',
  'Comparáveis na zona Santa Clara: €/m² ajustado entre 2.878 e 4.995 (n=4, mediana 3.935). VVR aplica €/m² 3.936 — alinhado com mediana, não com P90.',
]
bullets.forEach(b => {
  T(9, C.gold, '▸', ML, y, 10)
  doc.fontSize(9).fillColor(C.body).text(b, ML + 14, y, { width: CW - 14, lineGap: 2 })
  y = doc.y + 4
})
y += 4

y = header(y, 'Benchmark comparativo', 'Spread sobre alternativas líquidas e ilíquidas')

const bench = [
  ['Obrigações Tesouro PT 10Y',     '3,2%',  '+49,5 pp'],
  ['Índice habitação INE Coimbra',  '6,8%',  '+45,9 pp'],
  ['FTSE EPRA Europa (REIT)',       '5,4%',  '+47,3 pp'],
  ['Depósito a prazo PT 12m',       '2,1%',  '+50,6 pp'],
]
doc.rect(ML, y, CW, 16).fill(C.light)
T(7.5, C.gold, 'Alternativa', ML + 8, y + 4, 250)
T(7.5, C.gold, 'Yield', ML + 280, y + 4, 80)
T(7.5, C.gold, 'Spread vs deal', ML + 380, y + 4, 120)
y += 18
bench.forEach(([k, v, s]) => {
  T(8.5, C.body, k, ML + 8, y + 2, 250)
  T(8.5, C.body, v, ML + 280, y + 2, 80)
  T(8.5, C.body, s, ML + 380, y + 2, 120)
  doc.rect(ML, y + 14, CW, 0.3).fill(C.border)
  y += 16
})
doc.rect(ML, y, CW, 20).fill(C.totalBg)
T(9, C.totalFg, 'T2+1 Sub-Cave Lages (TIR)', ML + 8, y + 5, 250)
T(9, C.totalFg, '52,7%', ML + 280, y + 5, 80)
T(9, C.totalFg, '—', ML + 380, y + 5, 120)

// ═══════════════════════════════════════════════════════════════════
// PÁG 3 — Sources & Uses + Calendário
// ═══════════════════════════════════════════════════════════════════
newPage()
y = 60
y = header(y, 'Estrutura de Capital', 'Sources & Uses · capital exposto na compra vs custos pagos no exit')

const colW = (CW - 20) / 2
const colSx = ML, colUx = ML + colW + 20
let sy = y, uy = y

T(8, C.gold, 'SOURCES', colSx, sy, colW, { characterSpacing: 1.5 }); sy += 12
doc.rect(colSx, sy, colW, 0.5).fill(C.border); sy += 5
const sources = [
  ['Equity Investidor', '168.655€', '100,0%'],
  ['Equity Somnium (GP)', 'a definir', 'pari passu'],
  ['Dívida sénior', '0€', '0,0%'],
  ['Dívida participativa', '0€', '0,0%'],
]
sources.forEach(([k, v, p]) => {
  T(8, C.body, k, colSx + 4, sy, 130)
  T(8, C.body, v, colSx + 130, sy, 70, { align: 'right' })
  T(7, C.muted, p, colSx + 205, sy + 1, 60, { align: 'right' })
  sy += 13
})
doc.rect(colSx, sy, colW, 0.5).fill(C.body); sy += 4
T(8.5, C.body, 'TOTAL SOURCES', colSx + 4, sy, 130)
T(8.5, C.gold, '168.655€', colSx + 130, sy, 70, { align: 'right' })
T(7, C.muted, '100,0%', colSx + 205, sy + 1, 60, { align: 'right' })

T(8, C.gold, 'USES', colUx, uy, colW, { characterSpacing: 1.5 }); uy += 12
doc.rect(colUx, uy, colW, 0.5).fill(C.border); uy += 5
const uses = [
  ['Compra (preço transmissão)', '110.000€', '65,2%'],
  ['  ▸ IMT (isento Lei 56/23)', '0€', ''],
  ['  ▸ Imposto Selo (0,8%)', '880€', ''],
  ['  ▸ Escritura + CPCV', '900€', ''],
  ['Subtotal aquisição', '111.780€', '66,3%'],
  ['Obra com IVA', '55.975€', '33,2%'],
  ['  ▸ Mão-de-obra (65%)', '32.500€', ''],
  ['  ▸ Materiais (35%)', '17.500€', ''],
  ['  ▸ IVA (mix 6/23%)', '5.975€', ''],
  ['Detenção (6 meses)', '900€', '0,5%'],
]
uses.forEach(([k, v, p]) => {
  T(8, C.body, k, colUx + 4, uy, 150)
  T(8, C.body, v, colUx + 150, uy, 60, { align: 'right' })
  if (p) T(7, C.muted, p, colUx + 215, uy + 1, 50, { align: 'right' })
  uy += 13
})
doc.rect(colUx, uy, colW, 0.5).fill(C.body); uy += 4
T(8.5, C.body, 'TOTAL USES', colUx + 4, uy, 150)
T(8.5, C.gold, '168.655€', colUx + 150, uy, 60, { align: 'right' })
T(7, C.muted, '100,0%', colUx + 215, uy + 1, 50, { align: 'right' })

y = Math.max(sy, uy) + 24

doc.fontSize(7.5).fillColor(C.muted).text(
  'NOTA · Custos de venda (15.568€: comissão 5% + IVA + CPCV venda + cert. energético) são deduzidos do produto da venda no exit, não fazem parte do capital call. Capital total alocado a este deal incluindo venda = 184.222€.',
  ML, y, { width: CW, lineGap: 2 })
y = doc.y + 12

y = header(y, 'Calendário de Fluxos', 'Capital call → escritura → obra → exit · 6 meses')

const tlY = y + 6, tlX = ML + 30, tlW = CW - 60
doc.rect(tlX, tlY, tlW, 1).fill(C.border)
const months = ['T0', 'T+1', 'T+2', 'T+3', 'T+4', 'T+5', 'T+6']
const stepW = tlW / (months.length - 1)
months.forEach((m, i) => {
  const x = tlX + i * stepW
  doc.circle(x, tlY, 3).fill(C.gold)
  T(7, C.body, m, x - 12, tlY + 8, 24, { align: 'center' })
})
y = tlY + 22

const phases = [
  { x: 0, w: 1, label: 'Capital call 168.655€', color: C.dark },
  { x: 0, w: 1, label: 'Escritura compra', color: C.muted },
  { x: 1, w: 4, label: 'Obra (4 meses, 3 tranches)', color: C.gold },
  { x: 5, w: 1, label: 'Marketing + visitas', color: C.muted },
  { x: 6, w: 0.05, label: 'Venda + waterfall', color: C.dark },
]
phases.forEach((p, i) => {
  const x1 = tlX + p.x * stepW
  const x2 = tlX + (p.x + Math.max(p.w, 0.05)) * stepW
  doc.rect(x1, y + i * 13, x2 - x1, 5).fill(p.color)
  T(7.5, C.body, p.label, x2 + 6, y + i * 13 - 1, 250)
})
y += phases.length * 13 + 12

doc.rect(ML, y, CW, 0.3).fill(C.border); y += 6
T(8.5, C.body, 'FLUXOS LÍQUIDOS DO INVESTIDOR', ML, y, CW, { characterSpacing: 1 })
y += 14
const cf = [
  ['T0', '−168.655€', 'Capital call (wire transfer)'],
  ['T+6', '+212.078€', 'Return of capital + preferred 12% + 50% do excedente'],
  ['TIR', '52,7%', 'Anualizada após impostos'],
  ['MOIC', '1,257×', 'Após waterfall (vs 1,236× em split 50/50 puro)'],
]
cf.forEach(([k, v, n]) => {
  T(8, C.muted, k, ML + 4, y, 50)
  T(9, C.body, v, ML + 60, y, 90)
  T(8, C.muted, n, ML + 160, y + 1, CW - 160)
  y += 13
})

// ═══════════════════════════════════════════════════════════════════
// PÁG 4 — Estudo de Mercado
// ═══════════════════════════════════════════════════════════════════
newPage()
y = 60
y = header(y, 'Estudo de Mercado', 'Comparáveis na zona Santa Clara e Castelo Viegas · n=4 · CV=23,6%')

doc.roundedRect(ML, y, CW, 50, 4).lineWidth(0.5).stroke(C.border)
const sw = CW / 4
const stats = [
  ['MEDIANA €/m²', '3.935 €/m²'],
  ['MÉDIA €/m²', '3.936 €/m²'],
  ['DESVIO-PADRÃO', '±929 €/m²'],
  ['VVR APLICADO', '3.936 €/m²'],
]
stats.forEach((s, i) => {
  const x = ML + i * sw
  if (i > 0) doc.rect(x, y + 8, 0.5, 34).fill(C.border)
  T(7, C.muted, s[0], x + 10, y + 10, sw - 20, { characterSpacing: 0.5 })
  T(13, C.body, s[1], x + 10, y + 24, sw - 20)
})
y += 60

doc.rect(ML, y, CW, 16).fill(C.light)
const comps = [
  [1, 49, 199000, 4061, 4499, 'kwportugal'],
  [2, 80, 240000, 3000, 2878, 'idealista'],
  [3, 46, 198500, 4315, 4995, 'idealista'],
  [4, 81.41, 260000, 3193, 3371, 'remax'],
]
const cols = [['#', 25], ['Preço', 70], ['Área', 50], ['€/m² bruto', 65], ['€/m² ajust.', 70], ['Δ ajuste', 60], ['Fonte', 155]]
let cx = ML + 6
cols.forEach(([l, w]) => { T(7, C.gold, l, cx, y + 4, w, { characterSpacing: 0.3 }); cx += w })
y += 18
comps.forEach((c, i) => {
  if (i % 2 === 1) doc.rect(ML, y - 2, CW, 16).fill(C.light)
  cx = ML + 6
  const ajPerc = ((c[4] / c[3] - 1) * 100).toFixed(1)
  const cells = [c[0], EUR(c[2]), `${c[1]} m²`, c[3], c[4], `${ajPerc >= 0 ? '+' : ''}${ajPerc}%`, c[5]]
  cells.forEach((v, j) => { T(8, C.body, String(v), cx, y + 2, cols[j][1]); cx += cols[j][1] })
  y += 16
})
y += 12

y = header(y, 'Distribuição de €/m² ajustado', 'Range observado vs VVR aplicado')

const barY = y + 8, barH = 16
const minV = 2878, maxV = 4995, vvrM2 = 3936, mediana = 3935
doc.rect(ML + 50, barY, CW - 100, barH).fill(C.light)
const px = (val) => ML + 50 + ((val - minV) / (maxV - minV)) * (CW - 100)
doc.rect(px(minV) - 1, barY - 2, 2, barH + 4).fill(C.muted)
doc.rect(px(maxV) - 1, barY - 2, 2, barH + 4).fill(C.muted)
doc.rect(px(mediana) - 1, barY - 4, 2, barH + 8).fill(C.body)
doc.rect(px(vvrM2) - 2, barY - 4, 4, barH + 8).fill(C.gold)
T(7, C.muted, `mín ${minV}`, ML, barY + 4, 48, { align: 'right' })
T(7, C.muted, `máx ${maxV}`, ML + CW - 50, barY + 4, 48)
T(7, C.body, 'mediana 3.935', px(mediana) - 30, barY + barH + 4, 60, { align: 'center' })
T(7, C.gold, 'VVR 3.936', px(vvrM2) - 25, barY - 12, 50, { align: 'center' })
y = barY + barH + 24

doc.fontSize(8).fillColor(C.muted).text(
  'INTERPRETAÇÃO · O VVR aplicado (3.936 €/m²) está alinhado com a mediana da amostra de 4 comparáveis ajustados, não com o P90 (4.995). CV de 23,6% indica amostra dispersa — recomendável aumentar n para >6 antes do envio definitivo. Snapshot dos comparáveis em folder Drive 17jtxC2gXVLECmLuRBHpld_pb6MhJfJNa.',
  ML, y, { width: CW, lineGap: 2 })

// ═══════════════════════════════════════════════════════════════════
// PÁG 5 — Análise Financeira
// ═══════════════════════════════════════════════════════════════════
newPage()
y = 60
y = header(y, 'Análise Financeira', 'Cenário base · IRS Particular · 100% capitais próprios')

function group(yIn, title, items, totLabel, totVal) {
  T(8, C.gold, title.toUpperCase(), ML, yIn, CW, { characterSpacing: 1 })
  yIn += 11
  doc.rect(ML, yIn, CW, 0.4).fill(C.border); yIn += 3
  items.forEach(([k, v]) => {
    T(8, C.body, k, ML + 6, yIn, 380)
    T(8, C.body, v, ML + 380, yIn, CW - 380, { align: 'right' })
    yIn += 12
  })
  doc.rect(ML, yIn, CW, 14).fill(C.light)
  T(8.5, C.body, totLabel, ML + 6, yIn + 3, 380)
  T(8.5, C.body, totVal, ML + 380, yIn + 3, CW - 380, { align: 'right' })
  return yIn + 18
}

y = group(y, 'Custos · Aquisição', [
  ['Preço de transmissão', EUR(110000)],
  ['Imposto Selo (0,8%)', EUR(880)],
  ['IMT (Empresa, isento Lei 56/2023)', EUR(0)],
  ['Escritura + CPCV + registos', EUR(900)],
], 'Subtotal aquisição', EUR(111780))

y = group(y, 'Custos · Obra', [
  ['Mão-de-obra (65% × 50.000€)', EUR(32500)],
  ['Materiais (35% × 50.000€)', EUR(17500)],
  ['IVA (MO 6% + materiais 23%)', EUR(5975)],
], 'Subtotal obra', EUR(55975))

y = group(y, 'Custos · Detenção (6 meses)', [
  ['Seguro (50€/m × 6)', EUR(300)],
  ['Utilidades (100€/m × 6)', EUR(600)],
  ['IMI proporcional', EUR(0)],
], 'Subtotal detenção', EUR(900))

y = group(y, 'Custos · Venda (deduzidos no exit)', [
  ['Comissão 5% × 245.000€', EUR(12250)],
  ['IVA da comissão (23%)', EUR(2818)],
  ['CPCV venda + cert. energético', EUR(500)],
], 'Subtotal venda', EUR(15568))

doc.rect(ML, y, CW, 20).fill(C.totalBg)
T(9, C.totalFg, 'TOTAL CUSTOS', ML + 6, y + 5, 380)
T(9, C.totalFg, EUR(184223), ML + 380, y + 5, CW - 380, { align: 'right' })
y += 26

T(8, C.gold, 'RECEITA', ML, y, CW, { characterSpacing: 1 }); y += 11
doc.rect(ML, y, CW, 0.4).fill(C.border); y += 3
T(8, C.body, 'Valor de venda alvo (VVR)', ML + 6, y, 380)
T(8, C.body, EUR(245000), ML + 380, y, CW - 380, { align: 'right' })
y += 16

doc.rect(ML, y, CW, 20).fill(C.dark)
T(9, C.gold, 'LUCRO LÍQUIDO  (após IRS)', ML + 6, y + 5, 380)
T(9, C.gold, EUR(43424), ML + 380, y + 5, CW - 380, { align: 'right' })
y += 26

T(8, C.gold, 'MÉTRICAS DE RETORNO', ML, y, CW, { characterSpacing: 1 }); y += 11
doc.rect(ML, y, CW, 0.4).fill(C.border); y += 3
const metrics = [
  ['MOIC (Equity Multiple)', '1,24×'],
  ['TIR anualizada', '52,7%  (após impostos, descontando cashflows)'],
  ['ROI total (não anualizado)', '32,99%'],
  ['Margem líquida sobre VVR', '17,7%'],
  ['Break-even price', '196.295€  (margem -19,9% face ao VVR)'],
]
metrics.forEach(([k, v]) => {
  T(8, C.muted, k, ML + 4, y, 200)
  T(9, C.body, v, ML + 210, y - 1, CW - 210)
  y += 13
})

// ═══════════════════════════════════════════════════════════════════
// PÁG 6 — Sensibilidade (Tornado)
// ═══════════════════════════════════════════════════════════════════
newPage()
y = 60
y = header(y, 'Análise de Sensibilidade', '16 cenários testados · pior cenário mantém-se positivo (+1.353€)')

doc.roundedRect(ML, y, CW, 26, 4).fill('#eef4ec')
T(10, C.green, '▸ INVESTIMENTO RESILIENTE', ML + 12, y + 5, 300)
T(8, C.body, 'Lucro líquido positivo em todos os 16 cenários testados', ML + 12, y + 17, CW - 24)
y += 36

const sens = [
  { label: 'VVR ±20%', down: -33110, up: 33110 },
  { label: 'VVR ±10%', down: -16555, up: 16555 },
  { label: 'Obra ±20%', down: -8060, up: 8060 },
  { label: 'Obra ±10%', down: -4030, up: 4030 },
  { label: 'Prazo ±6m', down: -900, up: 900 },
]
const tcCenter = ML + CW * 0.55
const tcMax = 35000
const tcW = CW * 0.4
const px2 = (val) => tcCenter + (val / tcMax) * tcW
sens.forEach(s => {
  T(8, C.body, s.label, ML, y + 5, 80)
  doc.rect(tcCenter - 0.5, y - 2, 1, 22).fill(C.body)
  const xd1 = px2(s.down), xd2 = tcCenter
  doc.rect(xd1, y + 2, xd2 - xd1, 12).fill(C.red)
  const xu1 = tcCenter, xu2 = px2(s.up)
  doc.rect(xu1, y + 2, xu2 - xu1, 12).fill(C.green)
  T(7, C.muted, EUR(s.down), xd1 - 50, y + 4, 48, { align: 'right' })
  T(7, C.muted, EUR(s.up), xu2 + 4, y + 4, 60)
  y += 20
})
T(7, C.muted, 'Cenário base 43.424€ ↑', tcCenter - 60, y + 2, 120, { align: 'center' })
y += 18

y = header(y, 'Interpretação')
const interp = [
  ['Variável dominante', 'VVR (preço de venda) — queda de 20% reduz lucro líquido em 76% (43.424€ → 10.314€).'],
  ['Variável secundária', 'Custo de obra — overrun de 20% reduz lucro em 19% (8.060€ menos).'],
  ['Variável insensível', 'Prazo — atraso de 6 meses reduz lucro em apenas 2% (900€).'],
  ['Pior combinado', 'VVR-20% + Obra+20% + 6m: positivo em 1.353€ (margem 0,7% sobre capital).'],
]
interp.forEach(([k, v]) => {
  T(8, C.gold, '▸ ' + k, ML, y, 130, { characterSpacing: 0.3 })
  doc.fontSize(8).fillColor(C.body).text(v, ML + 140, y - 1, { width: CW - 140, lineGap: 2 })
  y = doc.y + 4
})
y += 4

y = header(y, 'Mitigação')
const mit = [
  ['VVR ↓', 'Pricing escalonado (245k → 232k aos 60d) · plano B arrendamento estudantil (yield 5,5–6%).'],
  ['Obra ↑', 'Contrato preço fixo · retenção 10% até VC · 3 tranches por milestones · reserva 5% extra.'],
]
mit.forEach(([k, v]) => {
  T(8, C.amber, k, ML + 4, y, 60)
  doc.fontSize(8).fillColor(C.body).text(v, ML + 70, y - 1, { width: CW - 70, lineGap: 2 })
  y = doc.y + 4
})

// ═══════════════════════════════════════════════════════════════════
// PÁG 7 — Risk Factors + Adequação + Waterfall
// ═══════════════════════════════════════════════════════════════════
newPage()
y = 60
y = header(y, 'Factores de Risco', 'Taxonomia · impacto × probabilidade × mitigação')

const risks = [
  ['01', 'Mercado (preço venda)',  'Alto', 'Médio', 'Pricing escalonado · plano B arrendamento.'],
  ['02', 'Obra (overrun)',         'Médio', 'Médio', 'Contrato preço fixo · retenção 10% · 3 tranches.'],
  ['03', 'Prazo (delay)',          'Baixo', 'Médio', 'Detenção 150€/m · +6m apenas −900€ no LL.'],
  ['04', 'Fiscal (IRS m-valias)',  'Médio', 'Baixo', 'Ano fiscal 2026 fixado à escritura · OE 2027 não retroage.'],
  ['05', 'Liquidez (6+ meses)',    'Alto', 'Alto',  'Cessão mediante aprovação Somnium (não recusada sem causa).'],
  ['06', 'Contraparte',            'Médio', 'Baixo', 'Empreiteiro com track record · cláusula de substituição.'],
  ['07', 'Regulatório (IMT/IS)',   'Baixo', 'Baixo', 'Isenção Lei 56/2023 · alterações requerem >12m vacatio.'],
  ['08', 'Concentração',           'Alto', 'n/a',   'Single-asset · posicionar como satélite no portfolio.'],
]

doc.rect(ML, y, CW, 16).fill(C.light)
const rcols = [['#', 22], ['Risco', 130], ['Imp.', 50], ['Prob.', 50], ['Mitigação', CW - 22 - 130 - 50 - 50]]
cx = ML + 6
rcols.forEach(([l, w]) => { T(7, C.gold, l, cx, y + 4, w, { characterSpacing: 0.5 }); cx += w })
y += 18

risks.forEach(r => {
  cx = ML + 6
  T(8, C.muted, r[0], cx, y + 2, rcols[0][1]); cx += rcols[0][1]
  T(8, C.body, r[1], cx, y + 2, rcols[1][1]); cx += rcols[1][1]
  const impColor = r[2] === 'Alto' ? C.red : r[2] === 'Médio' ? C.amber : C.green
  T(8, impColor, r[2], cx, y + 2, rcols[2][1]); cx += rcols[2][1]
  const probColor = r[3] === 'Alto' ? C.red : r[3] === 'Médio' ? C.amber : C.green
  T(8, probColor, r[3], cx, y + 2, rcols[3][1]); cx += rcols[3][1]
  T(7.5, C.body, r[4], cx, y + 2, rcols[4][1] - 6)
  doc.rect(ML, y + 16, CW, 0.3).fill(C.border)
  y += 18
})
y += 8

y = header(y, 'Adequação de Perfil', 'Filtro inverso · qualifica investidor antes da chamada')

T(8, C.green, 'ADEQUADO A INVESTIDOR QUE:', ML, y, CW, { characterSpacing: 0.5 }); y += 12
const adq = [
  'Aceita iliquidez de 6+ meses sem opção de saída antecipada.',
  'Tem capacidade financeira para perda parcial (até 20% do capital).',
  'Tem portfolio diversificado e este é uma alocação satélite.',
]
adq.forEach(t => {
  T(8, C.gold, '▸', ML, y, 10)
  T(8, C.body, t, ML + 14, y, CW - 14)
  y += 12
})
y += 4
T(8, C.red, 'NÃO É ADEQUADO A:', ML, y, CW, { characterSpacing: 0.5 }); y += 12
const nao = [
  'Investidor que precisa de liquidez no horizonte 12 meses.',
  'Investidor com tolerância zero a perda nominal.',
  'Investidor sem outras posições além desta.',
]
nao.forEach(t => {
  T(8, C.red, '▸', ML, y, 10)
  T(8, C.body, t, ML + 14, y, CW - 14)
  y += 12
})

// ═══════════════════════════════════════════════════════════════════
// PÁG 8 — Waterfall + Asymmetric + Term Sheet + Declaração
// ═══════════════════════════════════════════════════════════════════
newPage()
y = 60
y = header(y, 'Modelo de Parceria', 'Distribution waterfall com 12% preferred return')

const tiers = [
  ['1', 'Return of Capital',    '100% do capital chamado é devolvido ao investidor antes de qualquer distribuição.', '168.655€', 'investidor'],
  ['2', 'Preferred Return 12%', 'Investidor recebe 12% anualizado pro-rata (= 6% em 6m).',                            '11.053€', 'investidor'],
  ['3', 'GP Catch-up',          'Somnium recebe 100% até atingir paridade com Tier 2.',                               '11.053€', 'Somnium'],
  ['4', 'Carry split 50/50',    'Restante distribuído 50/50 sobre 21.318€.',                                          '10.659€ + 10.659€', 'ambos'],
]
tiers.forEach(([t, name, desc, val, dest]) => {
  doc.roundedRect(ML, y, CW, 32, 3).lineWidth(0.5).stroke(C.border)
  doc.circle(ML + 14, y + 16, 8).fill(C.gold)
  T(9, C.white, t, ML + 8, y + 12, 12, { align: 'center' })
  T(9, C.body, name, ML + 32, y + 5, 200)
  T(7.5, C.muted, desc, ML + 32, y + 18, 280)
  T(10, C.gold, val, ML + 320, y + 6, CW - 320, { align: 'right' })
  T(7, C.muted, `→ ${dest}`, ML + 320, y + 20, CW - 320, { align: 'right' })
  y += 36
})

doc.rect(ML, y, CW, 24).fill(C.dark)
T(8, C.gold, 'RESULTADO LÍQUIDO', ML + 8, y + 4, 200, { characterSpacing: 1 })
T(9, C.white, 'Investidor 190.367€ (MOIC 1,129×)  ·  Somnium 21.712€ (carry total)', ML + 8, y + 14, CW - 16)
y += 30

y = header(y, 'Asymmetric Commitments')
const ac = [
  ['CLAWBACK',     'Se RA real < 50% do projectado (<26,4%), Somnium renuncia a 25% da sua quota.'],
  ['AUDIT RIGHT',  'Investidor pode pedir auditoria por TOC; custos da Somnium se discrepâncias >3%.'],
  ['REPORTING SLA','Sexta 18h: % obra · custo vs orçamento · fotos · marcos. Falha = -0,1% quota (max 2%).'],
  ['OVERRUNS',     'Derrapagens >5% absorvidas 100% Somnium até 15%. Acima: capital call adicional.'],
]
ac.forEach(([k, v]) => {
  T(7.5, C.gold, '▸ ' + k, ML, y, 110, { characterSpacing: 0.5 })
  doc.fontSize(8).fillColor(C.body).text(v, ML + 120, y - 1, { width: CW - 120, lineGap: 1 })
  y = doc.y + 4
})
y += 4

y = header(y, 'Term Sheet')
const ts = [
  ['ID · Estratégia',  `${DEAL_ID}  ·  Fix & Flip  ·  SPV única`],
  ['Capital · Ticket', '168.655€  ·  Mín 50k€  ·  Máx 168.655€'],
  ['Hold · Retorno',   'Esperado 6m  ·  TIR 52,7%  ·  MOIC 1,24×'],
  ['Pref · Carry',     '12% anualizado  ·  50/50 após preferred + catch-up'],
  ['Fees · Reporting', 'Sem mgmt fee  ·  Sexta 18h + trimestral DF + anual completo'],
]
ts.forEach(([k, v]) => {
  T(7, C.muted, k, ML + 4, y, 110, { characterSpacing: 0.8 })
  T(8.5, C.body, v, ML + 120, y - 1, CW - 120)
  y += 13
})
y += 8

T(8, C.body, 'CONTACTO · ', ML, y, 80, { characterSpacing: 0.5 })
T(8, C.muted, 'Alexandre Mendes (CFO) · somniumprs@gmail.com · Calendly: somnium.pt/agendar', ML + 80, y, CW - 80)
y += 18

doc.rect(ML, y, CW, 0.3).fill(C.border); y += 6
T(7, C.gold, 'DECLARAÇÃO TÉCNICA E AUDITÁVEL', ML, y, CW, { characterSpacing: 1 }); y += 10
const decl = 'MÉTODO VVR · Média ponderada €/m² ajustado de 4 comparáveis Idealista/Remax/KW, zona Santa Clara, 180 dias. · MÉTODO STRESS · 16 cenários algorítmicos (VVR ±10/20%, Obra ±10/20%, Prazo ±2/3/6m, combinados). · MÉTODO FISCAL · IRS Particular, mais-valias 50% englobamento, ano 2026, derrama Coimbra 1,5%, IMT zero por isenção Lei 56/2023. · FONTES · Snapshot Drive 17jtxC2gXVLECmLuRBHpld_pb6MhJfJNa, acesso ao investidor após NDA.'
doc.fontSize(6.5).fillColor(C.body).text(decl, ML, y, { width: CW, lineGap: 1.5 })
y = doc.y + 4
doc.fontSize(6.5).fillColor(C.muted).text(
  'Documento informativo. Não constitui aconselhamento financeiro ou fiscal. Estimativas baseadas na metodologia explicitada e podem variar. Investimento imobiliário envolve risco de capital. Consulte TOC/advogado antes de decidir. Somnium Properties — Confidencial.',
  ML, y, { width: CW, lineGap: 1.5 })

// ─── Remover páginas extras geradas por overflow (defensivo) ───
const range = doc.bufferedPageRange()
const expected = state.totalPages
if (range.count > expected) {
  console.warn(`Auto-pagination detectada: ${range.count} páginas geradas vs ${expected} esperadas.`)
}

doc.flushPages()
doc.end()
console.log(`PDF gerado em: ${OUT} (${range.count} páginas físicas)`)
