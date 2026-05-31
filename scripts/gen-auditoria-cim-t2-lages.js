/**
 * Relatório interno de auditoria — Proposta T2+1 Sub-Cave Lages (CIM SP-2026-018).
 * Linguagem executiva para sócio: o que estava mal e como vai ficar corrigido.
 * Output: /tmp/auditoria-cim-t2-lages.pdf
 */
import PDFDocument from 'pdfkit'
import { readFileSync, createWriteStream } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const LOGO = path.resolve(ROOT, 'public/logo-dark.png')
const OUT = '/tmp/auditoria-cim-t2-lages.pdf'

const C = {
  gold: '#C9A84C', dark: '#0d0d0d', white: '#ffffff',
  body: '#2a2a2a', muted: '#888888', border: '#e0ddd5',
  light: '#f6f4ec', green: '#2d6a2d', red: '#8b2020', amber: '#b87a1f',
  redBg: '#fbeeee', greenBg: '#eef5ee', amberBg: '#fbf3e6',
}
const ML = 50, MR = 50, PW = 595.28, PH = 841.89, CW = PW - ML - MR
const NOW = () => new Date().toLocaleDateString('pt-PT', { day: '2-digit', month: 'long', year: 'numeric' })
const TOTAL_PAGES = 6

const doc = new PDFDocument({ size: 'A4', margin: 0, autoFirstPage: false, bufferPages: true })
doc.pipe(createWriteStream(OUT))

const state = { page: 0 }
function newPage(opts = {}) {
  doc.addPage({ size: 'A4', margin: 0 })
  state.page++
  if (!opts.cover) {
    try { doc.image(readFileSync(LOGO), ML, 18, { height: 18 }) } catch {}
    doc.fontSize(7).fillColor(C.muted).text(
      `Auditoria interna  ·  pág. ${state.page}/${TOTAL_PAGES}`,
      ML, 22, { width: CW, align: 'right', lineBreak: false }
    )
    doc.rect(ML, 44, CW, 1.2).fill(C.gold)
    doc.rect(ML, PH - 50, CW, 0.5).fill(C.gold)
    doc.fontSize(6.5).fillColor(C.muted).text(
      `Documento interno · Sócios Somnium Properties · Emitido em ${NOW()}`,
      ML, PH - 42, { width: CW, align: 'center', lineBreak: false }
    )
  }
}

const T = (size, color, text, x, y, w, opts = {}) =>
  doc.fontSize(size).fillColor(color).text(text, x, y, { width: w, lineBreak: false, ...opts })

function header(y, title, subtitle) {
  T(11, C.body, title.toUpperCase(), ML, y, CW, { characterSpacing: 0.4 })
  y += 14
  doc.rect(ML, y, CW, 1.2).fill(C.gold)
  y += 7
  if (subtitle) { T(8, C.muted, subtitle, ML, y, CW); y += 12 }
  return y
}

// ═══════════════════════════════════════════════════════════════════
// PÁG 1 — CAPA
// ═══════════════════════════════════════════════════════════════════
newPage({ cover: true })
doc.rect(0, 0, PW, 6).fill(C.dark)
try { doc.image(readFileSync(LOGO), (PW - 130) / 2, 90, { width: 130 }) } catch {}

T(8, C.muted, 'SOMNIUM PROPERTIES', ML, 200, CW, { align: 'center', characterSpacing: 2.5 })
T(8, C.muted, 'Auditoria interna  ·  Documento confidencial', ML, 214, CW, { align: 'center' })

doc.rect(ML + 80, 244, CW - 160, 0.5).fill(C.gold)

T(26, C.body, 'Auditoria à proposta', ML, 280, CW, { align: 'center' })
T(26, C.body, 'T2+1 Sub-Cave Lages', ML, 312, CW, { align: 'center' })
T(9, C.gold, 'CIM SP-2026-018  ·  REVISÃO ANTES DE ENVIO AO INVESTIDOR', ML, 354, CW, { align: 'center', characterSpacing: 1.5 })

// Hero
const hbY = 400, hbH = 130
doc.roundedRect(ML + 30, hbY, CW - 60, hbH, 6).lineWidth(1).stroke(C.dark)
doc.rect(ML + 30, hbY, CW - 60, 4).fill(C.gold)
T(46, C.body, '5', ML + 30, hbY + 22, CW - 60, { align: 'center' })
T(8, C.muted, 'CORRECÇÕES CRÍTICAS', ML + 30, hbY + 78, CW - 60, { align: 'center', characterSpacing: 2 })
T(8, C.muted, 'identificadas antes do envio', ML + 30, hbY + 95, CW - 60, { align: 'center' })

T(9, C.body, 'A aritmética dos custos está correcta.', ML, 560, CW, { align: 'center' })
T(9, C.body, 'O problema são os números de retorno apresentados ao investidor.', ML, 575, CW, { align: 'center' })

doc.rect(ML + 80, 615, CW - 160, 0.5).fill(C.gold)
T(8, C.muted, 'DESTINATÁRIO', ML, 630, CW, { align: 'center', characterSpacing: 2 })
T(10, C.body, 'Sócios Somnium Properties', ML, 645, CW, { align: 'center' })
T(8, C.muted, `Emitido em ${NOW()}`, ML, 662, CW, { align: 'center' })

doc.rect(0, PH - 6, PW, 6).fill(C.gold)

// ═══════════════════════════════════════════════════════════════════
// PÁG 2 — RESUMO EM 1 PÁGINA
// ═══════════════════════════════════════════════════════════════════
newPage()
let y = 60
y = header(y, 'Resumo', 'O que aconteceu, qual o impacto, qual a acção')

// Bloco "O que aconteceu"
doc.roundedRect(ML, y, CW, 100, 4).fill(C.light)
T(8, C.gold, 'O QUE ACONTECEU', ML + 14, y + 12, CW - 28, { characterSpacing: 1.5 })
doc.fontSize(10).fillColor(C.body).text(
  'O PDF do deal Sub-Cave Lages (8 páginas, design profissional) está graficamente impecável e a aritmética dos custos confere ao cêntimo. Mas os números de retorno apresentados ao investidor estavam errados em duas frentes: (1) deduzimos um IRS que, pela nossa regra, não devíamos deduzir; e (2) apresentámos na capa o retorno do PROJECTO em vez do retorno que o INVESTIDOR vai realmente realizar.',
  ML + 14, y + 28, { width: CW - 28, lineGap: 2 }
)
y += 110

// Bloco "Implicação"
doc.roundedRect(ML, y, CW, 90, 4).fill(C.redBg)
T(8, C.red, 'SE TIVESSE SIDO ENVIADO ASSIM', ML + 14, y + 12, CW - 28, { characterSpacing: 1.5 })
doc.fontSize(10).fillColor(C.body).text(
  'O investidor leria 52,7% de retorno anualizado na capa e esperaria isso. A realidade é 39,3%. A narrativa de "investimento resiliente, sempre positivo" também cai: no pior cenário combinado o lucro fica negativo (−293€), não positivo.',
  ML + 14, y + 28, { width: CW - 28, lineGap: 2 }
)
y += 100

// Bloco "Acção"
doc.roundedRect(ML, y, CW, 90, 4).fill(C.greenBg)
T(8, C.green, 'O QUE VAI SER CORRIGIDO', ML + 14, y + 12, CW - 28, { characterSpacing: 1.5 })
doc.fontSize(10).fillColor(C.body).text(
  'Identificámos 5 correcções críticas, todas listadas nas páginas seguintes em formato "antes / depois". Após correcção, o documento apresenta números honestos: lucro bruto 60.777€, retorno anualizado do investidor 39,3%, e pior cenário realista (−293€) com mitigações claras.',
  ML + 14, y + 28, { width: CW - 28, lineGap: 2 }
)
y += 110

// KPIs lado-a-lado: ANTES vs DEPOIS
y = header(y, 'O número-chave que muda na capa')
doc.roundedRect(ML, y, CW, 90, 4).lineWidth(0.5).stroke(C.border)
const halfW = CW / 2
// Antes
doc.rect(ML, y, halfW, 90).fill(C.redBg)
T(8, C.red, 'CAPA ACTUAL  (incorrecto)', ML + 14, y + 14, halfW - 28, { characterSpacing: 1 })
T(30, C.body, '52,7%', ML + 14, y + 32, halfW - 28)
T(8, C.muted, 'retorno anualizado', ML + 14, y + 70, halfW - 28)
// Depois
doc.rect(ML + halfW, y, halfW, 90).fill(C.greenBg)
T(8, C.green, 'CAPA CORRIGIDA  (honesto)', ML + halfW + 14, y + 14, halfW - 28, { characterSpacing: 1 })
T(30, C.body, '39,3%', ML + halfW + 14, y + 32, halfW - 28)
T(8, C.muted, 'retorno anualizado do investidor', ML + halfW + 14, y + 70, halfW - 28)

// ═══════════════════════════════════════════════════════════════════
// PÁG 3 — OS 5 ERROS CORRIGIDOS (cards antes/depois)
// ═══════════════════════════════════════════════════════════════════
newPage()
y = 60
y = header(y, 'Os 5 erros corrigidos', 'Em cada bloco: o que estava no PDF · o que vai ficar · porquê')

const errors = [
  {
    title: '1. Lucro do investimento',
    antes: '43.424€ "líquido após IRS"',
    depois: '60.777€ lucro bruto',
    porque: 'A nossa regra é apresentar o lucro BRUTO ao investidor. A fiscalidade fica a cargo dele, conforme a estrutura jurídica que adoptar. O PDF estava a deduzir ~17.353€ de IRS Cat. G que não devíamos sequer mencionar.',
  },
  {
    title: '2. Retorno anualizado na capa',
    antes: '52,7% (retorno do projecto)',
    depois: '39,3% (retorno real do investidor)',
    porque: 'A capa mostrava o retorno do PROJECTO inteiro. Mas, depois da partilha de lucro entre Somnium e investidor, o investidor não recebe o lucro todo: recebe metade. O número honesto a destacar é o que ele vai realmente realizar.',
  },
  {
    title: '3. Multiplicador do capital (MOIC)',
    antes: '1,24× na capa',
    depois: '1,180× na capa',
    porque: 'Mesmo problema que o ponto 2. O 1,24× era o multiplicador do projecto inteiro. O investidor, depois da partilha, leva 1,180× do capital investido. É um número "menos vendedor" mas honesto.',
  },
  {
    title: '4. Pior cenário e "investimento resiliente"',
    antes: '+1.353€ resiliente (sempre positivo)',
    depois: '−293€ no pior cenário combinado',
    porque: 'O "sempre positivo" só funcionava com o IRS fictício a amortecer a queda. Sem essa dedução, no pior cenário combinado (preço de venda −20%, obra +20%, atraso de 6 meses), o investimento perde dinheiro. O documento corrigido apresenta isto honestamente, com as medidas de mitigação que temos.',
  },
  {
    title: '5. "Waterfall com 12% preferred return"',
    antes: 'Estrutura sofisticada com 4 tiers',
    depois: 'Partilha de lucro 50/50 (declarado tal qual)',
    porque: 'A estrutura apresentada com 12% preferred return + catch-up + carry parecia oferecer protecção adicional ao investidor — mas a matemática, na prática, é 50/50 do lucro. Ou aplicamos um waterfall verdadeiro (com protecção real em cenários adversos) ou removemos o storytelling e dizemos "50/50" claramente.',
  },
]

errors.forEach((e) => {
  const cardH = 86
  doc.roundedRect(ML, y, CW, cardH, 4).lineWidth(0.5).stroke(C.border)

  // Título
  T(10, C.body, e.title, ML + 12, y + 10, CW - 24)

  // Antes / Depois — duas colunas
  const colY = y + 28
  const colW = (CW - 24) / 2 - 6

  doc.rect(ML + 12, colY, colW, 22).fill(C.redBg)
  T(7, C.red, 'ANTES', ML + 18, colY + 4, colW - 12, { characterSpacing: 1 })
  T(9, C.body, e.antes, ML + 18, colY + 12, colW - 12)

  doc.rect(ML + 12 + colW + 12, colY, colW, 22).fill(C.greenBg)
  T(7, C.green, 'DEPOIS', ML + 18 + colW + 12, colY + 4, colW - 12, { characterSpacing: 1 })
  T(9, C.body, e.depois, ML + 18 + colW + 12, colY + 12, colW - 12)

  // Porquê
  doc.fontSize(8).fillColor(C.muted).text(
    e.porque, ML + 12, y + 56, { width: CW - 24, lineGap: 1.5 }
  )

  y += cardH + 8
})

// ═══════════════════════════════════════════════════════════════════
// PÁG 4 — O QUE JÁ ESTAVA CORRECTO (tranquilizar o sócio)
// ═══════════════════════════════════════════════════════════════════
newPage()
y = 60
y = header(y, 'O que já estava correcto', 'A parte mais difícil — a aritmética dos custos — confere ao cêntimo')

doc.fontSize(10).fillColor(C.body).text(
  'Antes de listar o que falta corrigir, vale a pena destacar que toda a estrutura de custos do deal está correctamente calculada. Confirmámos linha a linha contra o motor de cálculo oficial da dashboard.',
  ML, y, { width: CW, lineGap: 2 }
)
y = doc.y + 12

const ok = [
  ['Preço de aquisição',                   '110.000€'],
  ['IMT (isenção Lei 56/2023, SPV)',       '0€'],
  ['Imposto de Selo (0,8% × 110k)',        '880€'],
  ['Escritura + CPCV + registos',          '900€'],
  ['Subtotal aquisição',                   '111.780€'],
  ['Obra (mão-de-obra 65% + materiais 35%)', '50.000€'],
  ['IVA da obra (MO 6% + materiais 23%)',  '5.975€'],
  ['Subtotal obra com IVA',                '55.975€'],
  ['Custos de detenção (6 meses)',         '900€'],
  ['Comissão venda (5% + IVA)',            '15.068€'],
  ['CPCV venda + certificado energético',  '500€'],
  ['Subtotal venda',                       '15.568€'],
]

doc.rect(ML, y, CW, 16).fill(C.light)
T(7.5, C.gold, 'LINHA', ML + 8, y + 4, CW - 100, { characterSpacing: 1 })
T(7.5, C.gold, 'VALOR', ML + CW - 100, y + 4, 80, { align: 'right', characterSpacing: 1 })
T(7.5, C.gold, 'OK', ML + CW - 20, y + 4, 16, { align: 'right', characterSpacing: 1 })
y += 18

ok.forEach(([k, v], i) => {
  if (i % 2 === 1) doc.rect(ML, y - 2, CW, 16).fill(C.light)
  T(8.5, C.body, k, ML + 8, y + 2, CW - 100)
  T(8.5, C.body, v, ML + CW - 100, y + 2, 80, { align: 'right' })
  T(10, C.green, '✓', ML + CW - 20, y + 1, 16, { align: 'right' })
  y += 16
})
y += 4

doc.rect(ML, y, CW, 22).fill(C.dark)
T(9, C.gold, 'TOTAL DE CUSTOS  (PDF vs motor de cálculo)', ML + 8, y + 6, CW - 130, { characterSpacing: 1 })
T(9, C.gold, '184.223€ = 184.223€', ML + CW - 130, y + 6, 120, { align: 'right' })
y += 30

doc.roundedRect(ML, y, CW, 60, 4).fill(C.greenBg)
T(8, C.green, 'CONCLUSÃO', ML + 14, y + 12, CW - 28, { characterSpacing: 1.5 })
doc.fontSize(10).fillColor(C.body).text(
  'A engenharia financeira do deal está correctamente capturada. O problema não é a estimativa dos custos nem do preço de venda. O problema é apenas como apresentamos o RESULTADO ao investidor — e isso é uma correcção de texto e fórmulas finais, não de fundamentos.',
  ML + 14, y + 28, { width: CW - 28, lineGap: 2 }
)

// ═══════════════════════════════════════════════════════════════════
// PÁG 5 — DECISÕES PENDENTES (não erros, escolhas a fazer)
// ═══════════════════════════════════════════════════════════════════
newPage()
y = 60
y = header(y, 'Decisões que precisam alinhamento', 'Não são erros — são escolhas a fazer antes de regerar o PDF')

const decisions = [
  {
    title: 'Estrutura de partilha — waterfall ou 50/50?',
    desc: 'A nossa proposta actual diz "waterfall com 12% preferred return", mas a matemática que apresentamos é equivalente a um split 50/50 do lucro. Temos duas opções honestas:',
    options: [
      'A) Manter o split 50/50 e renomear como "Profit split 50/50 sobre lucro bruto" — simples, claro, sem storytelling.',
      'B) Aplicar verdadeiramente um waterfall com 12% pref — dá protecção adicional ao investidor em cenários adversos, é mais sofisticado, mas precisa de explicação cuidada.',
    ],
  },
  {
    title: 'Capital exposto — qual o número correcto?',
    desc: 'Aparecem três valores diferentes para o capital que o investidor tem de pôr:',
    options: [
      'PDF apresenta 168.655€ (inclui custos pagos até venda, mas exclui comissão de mediação e CPCV venda)',
      'Motor de cálculo da dashboard diz 169.155€ (exclui apenas a comissão)',
      'CRM ainda tem 181.384€ (snapshot antigo, com pressupostos diferentes)',
    ],
  },
  {
    title: 'Área útil — qual é a real?',
    desc: 'O CRM diz 70m² mas o preço por metro quadrado apresentado no PDF (3.936€/m²) implica 62,25m². Antes de enviar, precisamos confirmar a área útil real do imóvel para alinhar com a vistoria.',
    options: [],
  },
  {
    title: 'Amostra de comparáveis — 4 ou 6+?',
    desc: 'O preço de venda alvo de 245.000€ está baseado em apenas 4 comparáveis, com elevada dispersão (CV 23,6%). O próprio PDF reconhece e sugere expandir. Antes de envio, recomenda-se chegar a pelo menos 6 comparáveis para reforçar a tese de preço.',
    options: [],
  },
]

decisions.forEach(d => {
  doc.roundedRect(ML, y, CW, 12 + 14 * (d.options.length || 0) + (d.desc ? 28 : 14), 4).lineWidth(0.5).stroke(C.border)
  T(10, C.body, d.title, ML + 12, y + 8, CW - 24)
  if (d.desc) {
    doc.fontSize(8).fillColor(C.muted).text(d.desc, ML + 12, y + 24, { width: CW - 24, lineGap: 1.5 })
    let yi = doc.y + 4
    d.options.forEach(opt => {
      T(8, C.gold, '▸', ML + 14, yi, 10)
      doc.fontSize(8).fillColor(C.body).text(opt, ML + 26, yi - 1, { width: CW - 38, lineGap: 1.5 })
      yi = doc.y + 4
    })
    y = yi + 8
  } else {
    y += 40
  }
})

// ═══════════════════════════════════════════════════════════════════
// PÁG 6 — CONCLUSÃO + PRÓXIMO PASSO
// ═══════════════════════════════════════════════════════════════════
newPage()
y = 80

T(20, C.body, 'Em síntese', ML, y, CW, { align: 'center' }); y += 32

doc.roundedRect(ML, y, CW, 110, 6).fill(C.light)
doc.fontSize(12).fillColor(C.body).text(
  'O documento entregue ao investidor mostrava-se profissional e numericamente consistente à primeira vista, mas continha 5 questões críticas que faziam com que o número visível na capa (52,7%) sobre-estimasse o retorno real do investidor em cerca de 13 pontos percentuais.',
  ML + 18, y + 18, { width: CW - 36, lineGap: 3, align: 'center' }
)
y += 130

doc.roundedRect(ML, y, CW, 80, 6).fill(C.dark)
T(8, C.gold, 'RESULTADO DA CORRECÇÃO', ML + 18, y + 14, CW - 36, { align: 'center', characterSpacing: 2 })
doc.fontSize(11).fillColor(C.white).text(
  'O documento corrigido apresenta o retorno real do investidor (39,3% anualizado, 1,180× do capital), o pior cenário honesto (−293€) e remove um IRS fictício que não devíamos deduzir.',
  ML + 18, y + 30, { width: CW - 36, lineGap: 2.5, align: 'center' }
)
y += 100

T(11, C.body, 'Próximo passo', ML, y, CW, { align: 'center' }); y += 18
doc.fontSize(10).fillColor(C.muted).text(
  'Alinhar a estrutura de partilha (50/50 vs waterfall), reconciliar o capital exposto e confirmar a área útil. Depois, regerar o CIM SP-2026-018 antes de o entregar ao investidor.',
  ML + 30, y, { width: CW - 60, lineGap: 2, align: 'center' }
)
y = doc.y + 30

doc.rect(ML + 100, y, CW - 200, 0.5).fill(C.gold); y += 14
T(8, C.muted, 'Auditoria realizada por Alexandre Mendes (CFO)', ML, y, CW, { align: 'center', characterSpacing: 0.5 }); y += 12
T(7, C.muted, `Somnium Properties  ·  ${NOW()}  ·  Documento interno`, ML, y, CW, { align: 'center' })

// ─── Fecho ───
const range = doc.bufferedPageRange()
if (range.count > TOTAL_PAGES) {
  console.warn(`Auto-pagination: ${range.count} páginas vs ${TOTAL_PAGES} esperadas.`)
}
doc.flushPages()
doc.end()
console.log(`PDF gerado: ${OUT} (${range.count} páginas)`)
