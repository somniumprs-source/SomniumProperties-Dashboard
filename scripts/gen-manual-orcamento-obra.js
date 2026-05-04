/**
 * Manual de utilização — Aba Orçamento de Obra
 * Layout institucional Somnium Properties (replica pdfRelatorioSemanal.js).
 * Saída: ./Manual_Orcamento_Obra_Somnium.pdf
 */
import PDFDocument from 'pdfkit'
import { readFileSync, createWriteStream, existsSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const LOGO_PATH = path.resolve(ROOT, 'public/logo-transparent.png')
const LOGO_DARK_PATH = path.resolve(ROOT, 'public/logo-dark.png')
const SHOTS_DIR = path.resolve(__dirname, 'manual-obra-screenshots')
const OUT_PATH = path.resolve(ROOT, 'Manual_Orcamento_Obra_Somnium.pdf')

const SHOTS = {
  header: path.join(SHOTS_DIR, 'shot-header.png'),
  pisos:  path.join(SHOTS_DIR, 'shot-pisos.png'),
  seccao: path.join(SHOTS_DIR, 'shot-seccao.png'),
  fiscal: path.join(SHOTS_DIR, 'shot-fiscal.png'),
  aviso:  path.join(SHOTS_DIR, 'shot-aviso.png'),
}

// ── Paleta institucional (copiada do pdfRelatorioSemanal) ──
const GOLD = '#C9A84C'
const GOLD_DARK = '#a88a3a'
const TEXT = '#1f2937'
const BODY = '#374151'
const MUTED = '#6b7280'
const LIGHT = '#9ca3af'
const BORDER = '#e0ddd5'
const BG = '#fbfaf7'
const RED = '#b91c1c'

const PT = 60
const PB = 70
const ML = 60
const PW = 595.28
const PH = 841.89
const CW = PW - ML * 2

const doc = new PDFDocument({
  size: 'A4',
  autoFirstPage: false,
  margins: { top: PT, bottom: PB, left: ML, right: ML },
})
doc.pipe(createWriteStream(OUT_PATH))

let y = PT

// ── Footer institucional ────────────────────────────────────
function drawFooter() {
  const fy = PH - PB + 30
  centeredText('SOMNIUM PROPERTIES', fy, 7, 'Helvetica-Bold', GOLD, { characterSpacing: 1.5 })
  centeredText('Excelência em Investimento Imobiliário', fy + 10, 7, 'Helvetica', MUTED)
  centeredText('Documento Confidencial — Manual interno do gestor de obra', fy + 22, 6.5, 'Helvetica-Oblique', LIGHT)
}

function centeredText(text, fy, fontSize, font, color, opts = {}) {
  doc.fontSize(fontSize).font(font).fillColor(color)
  const w = doc.widthOfString(text, { characterSpacing: opts.characterSpacing || 0 })
  doc.text(text, (PW - w) / 2, fy, { lineBreak: false, characterSpacing: opts.characterSpacing || 0 })
}

// Listener: cada nova página recebe footer e reset de y. Isto cobre tanto
// `addPage()` manual como auto-pagebreak interno do PDFKit.
let suppressFooter = false
doc.on('pageAdded', () => {
  y = PT
  if (!suppressFooter) drawFooter()
})

// ── needPage robusto ────────────────────────────────────────
function needPage(needed) {
  if (y + needed > PH - PB - 50) {
    doc.addPage({ size: 'A4', margins: { top: PT, bottom: PB, left: ML, right: ML } })
  }
}

// ════════════════════════════════════════════════════════════
// CAPA — cremosa, sem preto pesado
// ════════════════════════════════════════════════════════════
suppressFooter = true
doc.addPage({ size: 'A4', margins: { top: 0, bottom: 0, left: 0, right: 0 } })

// Fundo cremoso
doc.rect(0, 0, PW, PH).fill(BG)

// Moldura dourada interior
doc.lineWidth(0.5).strokeColor(GOLD).rect(40, 40, PW - 80, PH - 80).stroke()
doc.lineWidth(0.3).strokeColor(GOLD).rect(48, 48, PW - 96, PH - 96).stroke()

// Logo (versão escura, fica boa em fundo claro)
try {
  const logo = readFileSync(existsSync(LOGO_DARK_PATH) ? LOGO_DARK_PATH : LOGO_PATH)
  doc.image(logo, (PW - 180) / 2, 200, { width: 180 })
} catch {
  doc.fontSize(18).font('Helvetica-Bold').fillColor(TEXT)
     .text('SOMNIUM PROPERTIES', 0, 230, { align: 'center', width: PW, characterSpacing: 3 })
}

// Linha ornamental
doc.lineWidth(0.5).strokeColor(GOLD)
   .moveTo(PW / 2 - 60, 380).lineTo(PW / 2 + 60, 380).stroke()

// Etiqueta
doc.font('Helvetica').fontSize(9).fillColor(GOLD_DARK)
   .text('CRM SOMNIUM · MANUAL TÉCNICO', 0, 400, { align: 'center', width: PW, characterSpacing: 4 })

// Título
doc.font('Helvetica-Bold').fontSize(34).fillColor(TEXT)
   .text('Manual de Utilização', 0, 440, { align: 'center', width: PW })

// Subtítulo
doc.font('Helvetica').fontSize(18).fillColor(GOLD_DARK)
   .text('Orçamento de Obra', 0, 488, { align: 'center', width: PW })

// Linha ornamental inferior
doc.lineWidth(0.5).strokeColor(GOLD)
   .moveTo(PW / 2 - 40, 540).lineTo(PW / 2 + 40, 540).stroke()

// Descrição
doc.font('Helvetica-Oblique').fontSize(11).fillColor(MUTED)
   .text('Guia de utilização e referência fiscal', 0, 560, { align: 'center', width: PW })

// Rodapé da capa
doc.font('Helvetica').fontSize(9).fillColor(MUTED)
   .text('Para o Gestor de Obra', 0, 720, { align: 'center', width: PW })
doc.font('Helvetica').fontSize(8).fillColor(LIGHT)
   .text('Versão 3.0 · Maio 2026', 0, 736, { align: 'center', width: PW })

suppressFooter = false

// ════════════════════════════════════════════════════════════
// PRIMEIRA PÁGINA DE CONTEÚDO
// ════════════════════════════════════════════════════════════
doc.addPage({ size: 'A4', margins: { top: PT, bottom: PB, left: ML, right: ML } })

// Header institucional só na primeira página
drawHeader('Manual de Utilização', 'Orçamento de Obra · CRM Somnium', 'MAIO 2026')

// ════════════════════════════════════════════════════════════
// HELPERS DE CONTEÚDO
// ════════════════════════════════════════════════════════════

function drawHeader(titulo, subtitulo, dataStr) {
  const headerH = 92
  doc.lineWidth(0.5).strokeColor(BORDER).rect(ML, y, CW, headerH).stroke()
  doc.font('Helvetica').fontSize(8).fillColor(MUTED)
     .text('SOMNIUM PROPERTIES', ML + 18, y + 16, { characterSpacing: 2.5, lineBreak: false })
  doc.font('Helvetica').fontSize(7.5).fillColor(MUTED)
     .text('VERSÃO', ML + CW - 100, y + 16, { width: 80, align: 'right', characterSpacing: 2, lineBreak: false })
  doc.font('Helvetica').fontSize(9).fillColor(TEXT)
     .text(dataStr, ML + CW - 100, y + 30, { width: 80, align: 'right', lineBreak: false })
  doc.font('Helvetica-Bold').fontSize(20).fillColor(TEXT)
     .text(titulo, ML + 18, y + 36, { lineBreak: false })
  if (subtitulo) {
    doc.font('Helvetica').fontSize(9).fillColor(MUTED)
       .text(subtitulo, ML + 18, y + 64, { width: CW - 36, lineBreak: false })
  }
  doc.lineWidth(0.5).strokeColor(BORDER).moveTo(ML, y + headerH).lineTo(ML + CW, y + headerH).stroke()
  y += headerH + 18
}

function sectionNum(num, title) {
  needPage(50)
  doc.fillColor(GOLD).rect(ML, y, 3, 18).fill()
  doc.font('Helvetica-Bold').fontSize(13).fillColor(TEXT)
     .text(`${num}. ${title}`, ML + 12, y + 1, { lineBreak: false })
  y += 28
}

function subhead(text) {
  needPage(28)
  doc.font('Helvetica-Bold').fontSize(9).fillColor(GOLD_DARK)
     .text(String(text).toUpperCase(), ML, y, { characterSpacing: 1.2, lineBreak: false })
  y += 16
}

function paragraph(text, opts = {}) {
  if (!text) return
  needPage(30)
  doc.font('Helvetica').fontSize(10).fillColor(BODY)
  const h = doc.heightOfString(text, { width: CW, lineGap: 4, align: opts.align || 'justify' })
  needPage(h + 4)
  doc.text(text, ML, y, { width: CW, lineGap: 4, align: opts.align || 'justify' })
  y = doc.y + 8
}

function callout(label, text) {
  if (!text) return
  needPage(60)
  doc.font('Helvetica').fontSize(10).fillColor(BODY)
  const h = doc.heightOfString(text, { width: CW - 30, lineGap: 4 })
  const boxH = h + 32
  needPage(boxH + 12)
  doc.fillColor(BG).rect(ML, y, CW, boxH).fill()
  doc.fillColor(GOLD).rect(ML, y, 3, boxH).fill()
  doc.font('Helvetica-Bold').fontSize(8).fillColor(GOLD_DARK)
     .text(label, ML + 16, y + 10, { characterSpacing: 1.5, lineBreak: false })
  doc.font('Helvetica').fontSize(9.5).fillColor(BODY)
     .text(text, ML + 16, y + 22, { width: CW - 30, lineGap: 3 })
  y += boxH + 14
}

function calloutAlerta(label, text) {
  if (!text) return
  needPage(60)
  doc.font('Helvetica').fontSize(10).fillColor(BODY)
  const h = doc.heightOfString(text, { width: CW - 30, lineGap: 4 })
  const boxH = h + 32
  needPage(boxH + 12)
  doc.fillColor('#fdf2f2').rect(ML, y, CW, boxH).fill()
  doc.fillColor(RED).rect(ML, y, 3, boxH).fill()
  doc.font('Helvetica-Bold').fontSize(8).fillColor(RED)
     .text(label, ML + 16, y + 10, { characterSpacing: 1.5, lineBreak: false })
  doc.font('Helvetica').fontSize(9.5).fillColor(BODY)
     .text(text, ML + 16, y + 22, { width: CW - 30, lineGap: 3 })
  y += boxH + 14
}

function bulletList(items) {
  for (const it of items) {
    const txt = String(it).trim()
    if (!txt) continue
    needPage(20)
    doc.font('Helvetica').fontSize(10).fillColor(BODY)
    const h = doc.heightOfString(txt, { width: CW - 18, lineGap: 3 })
    needPage(h + 6)
    doc.fillColor(GOLD).circle(ML + 4, y + 5, 2).fill()
    doc.fontSize(10).fillColor(BODY)
       .text(txt, ML + 14, y, { width: CW - 18, lineGap: 3 })
    y += Math.max(h, 14) + 6
  }
  y += 4
}

function table2cols(headers, rows, widths = [0.5, 0.5]) {
  const colWs = widths.map(w => Math.floor(w * (CW - 16)))
  needPage(40)
  doc.lineWidth(1).strokeColor(GOLD).moveTo(ML, y).lineTo(ML + CW, y).stroke()
  y += 8
  doc.font('Helvetica').fontSize(8).fillColor(MUTED)
  let cx = ML + 8
  for (let i = 0; i < headers.length; i++) {
    doc.text(headers[i], cx, y, { width: colWs[i], lineBreak: false, characterSpacing: 0.5 })
    cx += colWs[i] + 8
  }
  y += 14
  doc.lineWidth(0.5).strokeColor(BORDER).moveTo(ML, y).lineTo(ML + CW, y).stroke()
  y += 6

  for (const row of rows) {
    doc.font('Helvetica').fontSize(9.5).fillColor(BODY)
    let maxH = 14
    for (let i = 0; i < row.length; i++) {
      const h = doc.heightOfString(String(row[i] || ''), { width: colWs[i], lineGap: 2 })
      if (h > maxH) maxH = h
    }
    const rowH = maxH + 10
    needPage(rowH + 4)
    cx = ML + 8
    for (let i = 0; i < row.length; i++) {
      const isFirst = i === 0
      doc.font(isFirst ? 'Helvetica-Bold' : 'Helvetica').fontSize(9.5).fillColor(isFirst ? TEXT : BODY)
         .text(String(row[i] || ''), cx, y + 4, { width: colWs[i], lineGap: 2 })
      cx += colWs[i] + 8
    }
    y += rowH
    doc.lineWidth(0.5).strokeColor(BORDER).moveTo(ML, y).lineTo(ML + CW, y).stroke()
  }
  y += 12
}

// Imagem com legenda — cabe sempre na página actual ou salta para a seguinte
function imagemLegendada(filePath, legenda) {
  if (!existsSync(filePath)) return
  const targetW = CW
  const ratio = obtemRatioImg(filePath)
  const imgH = targetW * ratio
  const totalH = imgH + (legenda ? 28 : 8)
  needPage(totalH + 6)
  doc.image(filePath, ML, y, { width: targetW })
  doc.lineWidth(0.5).strokeColor(BORDER).rect(ML, y, targetW, imgH).stroke()
  y += imgH + 6
  if (legenda) {
    doc.font('Helvetica-Oblique').fontSize(8).fillColor(MUTED)
    const lh = doc.heightOfString(legenda, { width: CW, align: 'center', lineGap: 2 })
    needPage(lh + 8)
    doc.text(legenda, ML, y, { width: CW, align: 'center', lineGap: 2 })
    y += lh + 14
  } else {
    y += 6
  }
}

// Lê tamanho real da imagem para preservar proporções
function obtemRatioImg(filePath) {
  try {
    const buffer = readFileSync(filePath)
    // PNG: bytes 16-23 são width/height big-endian
    if (buffer[0] === 0x89 && buffer[1] === 0x50) {
      const w = buffer.readUInt32BE(16)
      const h = buffer.readUInt32BE(20)
      return h / w
    }
  } catch {}
  return 0.55
}

// ════════════════════════════════════════════════════════════
// CONTEÚDO
// ════════════════════════════════════════════════════════════

// 1. Visão geral
sectionNum('1', 'Visão geral')
paragraph('A aba "Obra" do CRM Somnium é a ferramenta oficial para construir o orçamento detalhado de cada imóvel da carteira. Substitui o ficheiro Word tradicional e oferece três vantagens fundamentais.')
bulletList([
  'Cálculo automático em tempo real — sem erros aritméticos. O sistema soma cada linha, aplica o IVA correcto e produz o total bruto.',
  'Conformidade fiscal portuguesa — separa material e mão-de-obra, aplica autoliquidação e retenção IRS conforme o caso, prepara o orçamento para auditoria contabilística.',
  'Sincronização com o resto do CRM — o total geral alimenta automaticamente o campo "Custo estimado de obra" da ficha do imóvel e a aba "Análise Financeira".',
])
callout('IMPORTANTE',
  'O orçamento é guardado automaticamente à medida que escreve. Não existe botão "Guardar". Se vir o indicador "A guardar" no topo, significa que o sistema está a sincronizar — não feche a página antes de aparecer "Guardado".')

imagemLegendada(SHOTS.header,
  'Vista geral do topo da aba: header com nome do imóvel, regime fiscal, KPIs em tempo real e chips de navegação rápida.')

// 2. Acesso à aba Obra
sectionNum('2', 'Acesso à aba Obra')
bulletList([
  'Entrar no CRM e abrir o módulo "CRM > Pipeline Imóveis".',
  'Clicar no nome do imóvel para abrir a ficha de detalhe.',
  'Selecionar o separador "Obra" — está entre "Localização" e "Análise Financeira".',
])

// 3. Conceitos fundamentais
sectionNum('3', 'Conceitos fundamentais')

subhead('Pisos')
paragraph('Antes de preencher qualquer secção, defina os pisos do imóvel no topo do separador. Cada piso tem nome (R/C, 1º Andar, Sótão, Cave), área em m² e descrição opcional. Algumas secções (eletricidade, pavimento, pladur, pintura) replicam os campos por piso automaticamente.')

imagemLegendada(SHOTS.pisos,
  'Painel "Definições" (regime fiscal e BDI) e gestão de pisos. Cada piso adicionado fica disponível para todas as secções por m².')

subhead('Secções')
paragraph('O orçamento está dividido em 17 secções pré-definidas. Cada secção tem campos guiados e uma tabela de "linhas livres" onde pode adicionar tudo o que for específico desta obra.')

table2cols(
  ['Secção', 'Secção'],
  [
    ['1. Demolições e limpeza',           '10. Sistema VMC'],
    ['2. RCD — Resíduos',                  '11. Pintura'],
    ['3. Estrutura',                       '12. Casas de banho'],
    ['4. Eletricidade e canalização',      '13. Portas'],
    ['5. AVAC / Solar / AQS',              '14. Cozinhas'],
    ['6. Pavimento',                       '15. Capoto / ETICS'],
    ['7. Pladur tetos',                    '16. Cobertura'],
    ['8. Isolamento',                      '17. Licenciamento e seguros'],
    ['9. Caixilharias',                    ''],
  ]
)

subhead('Linhas')
paragraph('Cada linha pode ter componente material e/ou mão-de-obra, cada uma com a sua taxa de IVA. Material com bordas azuis e badge "Mat.", MO com bordas verdes e badge "MO".')

// 4. Regime fiscal
sectionNum('4', 'Regime fiscal e taxas de IVA')
paragraph('Antes de começar a preencher um orçamento, escolha o regime fiscal aplicável no painel "Definições". O regime determina a taxa de IVA por defeito da mão-de-obra.')

subhead('Normal — 23%')
paragraph('Aplicável a obras que não cumpram os requisitos das verbas reduzidas. IVA 23% generalizado em material e mão-de-obra.')

subhead('Reabilitação ARU — Verba 2.27 da Lista I do CIVA (6%)')
paragraph('Empreitadas de reabilitação urbana sobre imóveis em ARU (Áreas de Reabilitação Urbana). Coimbra tem várias ARU activas (Centro Histórico, Baixa, Santa Clara). A taxa 6% aplica-se a TODA a empreitada (material + mão-de-obra incorporados), desde que cumpridos os requisitos.')

calloutAlerta('REQUISITOS PARA APLICAR A VERBA 2.27',
  '1. Imóvel localizado dentro de uma ARU (verificar na Câmara Municipal). ' +
  '2. Operação enquadrada como "reabilitação urbana". ' +
  '3. Declaração escrita do dono da obra ao empreiteiro a atestar destino. ' +
  '4. Certificação municipal ou pelo IHRU. Sem estes documentos, a Verba 2.27 não pode ser invocada — IVA volta a 23%.')

subhead('Habitação — Verba 2.32 (6% com regra dos 20%)')
paragraph('Empreitadas de beneficiação ou remodelação em imóveis afectos a habitação. Taxa 6% no global SE o valor dos materiais incorporados não exceder 20% do valor total. O sistema calcula automaticamente o rácio material/empreitada e avisa quando ultrapassar 15% (laranja) ou 20% (vermelho — perda do benefício).')

imagemLegendada(SHOTS.aviso,
  'Aviso vermelho automático quando a regra dos 20% da Verba 2.32 é violada. O sistema recalcula tudo a 23%.')

calloutAlerta('PERDA DO BENEFÍCIO',
  'Se o rácio de materiais ultrapassar 20% em regime Habitação (Verba 2.32), o sistema recalcula tudo a 23% e marca o estado como "Benefício perdido". Para manter 6%, reduza a fracção de material ou separe linhas para outro orçamento.')

subhead('RJRU (DL 53/2014) — IMT/IMI sem alterar IVA')
paragraph('Regime Jurídico da Reabilitação Urbana. Não altera o IVA da empreitada (continua 23%) mas pode dar isenção/redução de IMT na compra e IMI no primeiro ano. Esta secção é informativa para o contabilista.')

subhead('Honorários sempre a 23%')
paragraph('Independentemente do regime escolhido, honorários (projecto, TRO, fiscalização, SCE, solicitador) são sempre a 23% — não estão abrangidos pelas verbas reduzidas. O sistema aplica esta regra automaticamente.')

subhead('Taxas e seguros')
paragraph('Taxas municipais e livro de obra: fora do campo IVA (artigo 2º nº 2 CIVA). Seguros (CAR — Construction All Risks): isentos pelo artigo 9º CIVA. O sistema aplica IVA 0% nestes itens automaticamente.')

// 5. Estrutura da aba
sectionNum('5', 'Estrutura da aba')
paragraph('A aba está organizada em 4 zonas, do topo para o fundo:')
bulletList([
  'Header sticky — nome do imóvel, regime fiscal, indicador "A guardar / Guardado", botões "Definições" e "Exportar PDF". Permanece visível durante a scroll.',
  'KPIs em barra — quatro indicadores actualizados em tempo real: Base, IVA liquidado, A pagar e Total bruto.',
  'Chips de navegação — clique num chip para ir directamente a essa secção. Os chips com bola indicam secções já preenchidas.',
  'Conteúdo principal — pisos, notas globais, 17 secções colapsáveis, decomposição por tipo, resumo fiscal.',
  'Total bruto sticky — barra preta no rodapé, sempre visível.',
])

// 6. Como preencher
sectionNum('6', 'Como preencher um orçamento')

subhead('Passo 1 — Configurar o regime fiscal')
paragraph('Clique em "Definições" no topo da aba e escolha o regime fiscal aplicável. Confira os documentos de suporte com o sócio responsável antes de aplicar Verba 2.27 ou 2.32.')

subhead('Passo 2 — Adicionar os pisos')
paragraph('Na secção "Pisos do imóvel" introduza cada piso (R/C, 1º Andar, etc.) com a respectiva área em m². Pode usar pré-sets clicando na seta do campo "Nome".')

subhead('Passo 3 — Preencher as secções')
paragraph('Para cada secção pode usar duas formas, em alternativa ou em conjunto:')
bulletList([
  'Campos guiados — preencher os campos pré-definidos (m², €/m², dias × €/dia). Cada campo tem badge "Mat." (azul) ou "MO" (verde) que indica se é material ou mão-de-obra. O sistema aplica a taxa IVA automaticamente.',
  'Linhas livres — usar a tabela "Linhas livres" no fim de cada secção para adicionar itens específicos desta obra que não cabem nos campos guiados. Cada linha permite escolher livremente o IVA do material e da MO.',
])

imagemLegendada(SHOTS.seccao,
  'Exemplo de secção aberta (Pavimento). Em cima: campos guiados por piso com inputs separados material e MO. Em baixo: tabela de linhas livres com IVA configurável por componente, autoliquidação e retenção IRS.')

subhead('Passo 4 — BDI (opcional)')
paragraph('Em "Definições" introduza percentagens de imprevistos e margem do empreiteiro. O sistema aplica sobre a base da obra (excluindo licenciamento) e adiciona ao total.')

subhead('Passo 5 — Validar avisos fiscais')
paragraph('Se aparecerem avisos no topo (caixas amarelas, laranjas ou vermelhas), leia-os e tome a acção sugerida.')

subhead('Passo 6 — Exportar PDF')
paragraph('Clique em "Exportar PDF" no topo. O documento gerado replica fielmente o formato tradicional do gestor de obra com o cabeçalho da Somnium.')

// 7. Linhas livres
sectionNum('7', 'Linhas livres editáveis')
paragraph('No fundo de cada uma das 17 secções existe uma "Tabela de linhas livres". Esta tabela permite total liberdade ao gestor: pode adicionar quantas linhas quiser, com qualquer descrição, quantidade, unidade, preço unitário e taxa de IVA.')

subhead('Estrutura de cada linha livre')
table2cols(
  ['Coluna', 'Descrição'],
  [
    ['Descrição', 'Texto livre. Ex: "Carpinteiro especializado".'],
    ['Qtd', 'Quantidade — usar 1 para itens fixos.'],
    ['Unidade', 'un, m², m, m³, h, dias, vg (verba global), kg.'],
    ['€/un mat', 'Preço unitário do componente material (sem IVA).'],
    ['IVA mat', '0 / 6 / 13 / 23% — IVA aplicado ao material.'],
    ['€/un MO', 'Preço unitário da componente mão-de-obra (sem IVA).'],
    ['IVA MO', '0 / 6 / 13 / 23% — IVA da MO (default segue regime).'],
    ['Auto.', 'Marcar se a MO está em autoliquidação.'],
    ['Ret. IRS', '0 / 11.5 / 25% — retenção se prestador singular.'],
  ],
  [0.18, 0.82]
)

subhead('Quando usar linhas livres')
bulletList([
  'O item não tem campo guiado pré-definido (ex: "Recuperação de cantaria histórica").',
  'Quer separar uma despesa em sub-itens com IVAs diferentes.',
  'Tem um fornecedor específico com factura própria (ex: "Equipamento Bosch importado, IVA 23%").',
  'Tem um sub-empreiteiro com regime especial (autoliquidação, retenção 11.5%).',
])

callout('LIBERDADE TOTAL',
  'Os campos guiados são uma comodidade. Toda a obra pode ser feita exclusivamente com linhas livres se preferir esse método. O motor de cálculo trata ambos exactamente da mesma forma.')

// 8. IVA por linha
sectionNum('8', 'IVA por linha — material vs mão-de-obra')
paragraph('Esta é a regra fiscal mais importante a compreender. Cada linha do orçamento pode ter dois componentes — material e mão-de-obra — e cada um pode ter a sua própria taxa de IVA.')

subhead('Convenção visual')
bulletList([
  'Inputs com contorno azul + badge "Mat." → componente material.',
  'Inputs com contorno verde + badge "MO" → componente mão-de-obra.',
])

subhead('Taxas por defeito')
table2cols(
  ['Componente', 'Normal · ARU · Habitação · Honorários'],
  [
    ['Material',   '23% · 6%* · 6%* (regra 20%) · —'],
    ['MO',         '23% · 6% · 6% · —'],
    ['Honorários', '— · — · — · 23% (sempre)'],
    ['Taxas',      '— · — · — · 0% (fora IVA)'],
    ['Seguros',    '— · — · — · 0% (isento)'],
  ],
  [0.25, 0.75]
)
paragraph('* Em ARU, a Verba 2.27 aplica 6% a toda a empreitada. Em Habitação Verba 2.32, 6% mantido apenas se o material não exceder 20%.', { align: 'left' })

subhead('Quando alterar manualmente o IVA')
bulletList([
  'Equipamento importado por empresa exterior à empreitada — fica a 23% mesmo em ARU.',
  'Subcontratação especial não enquadrada na verba reduzida.',
  'Honorários esporádicos no meio de uma secção (mantêm sempre 23%).',
])

callout('REGRA PRÁTICA',
  'Em caso de dúvida, deixe os IVAs como o sistema sugere por defeito. Confirme posteriormente com o contabilista no fecho do orçamento.')

// 9. Autoliquidação e retenções
sectionNum('9', 'Autoliquidação e retenções IRS')

subhead('Autoliquidação (CIVA art 2º nº 1 al. j)')
paragraph('Aplica-se em serviços de construção civil prestados entre dois sujeitos passivos de IVA. A factura sai sem IVA com a menção "IVA — autoliquidação" e é o adquirente (a Somnium) que liquida e deduz o IVA.')
paragraph('Para marcar uma linha em autoliquidação:')
bulletList([
  'Linhas livres — checkbox "Auto." na coluna respectiva.',
  'Campos guiados — checkbox "Autoliquidação MO" no painel "Override secção" no topo de cada secção.',
])

subhead('Retenções IRS (CIRS art 101º)')
paragraph('Aplica-se quando o prestador é uma pessoa singular em regime de categoria B (serviços). A retenção é descontada ao pagamento e entregue à Autoridade Tributária mensalmente.')

table2cols(
  ['Taxa', 'Aplicação típica'],
  [
    ['0%',     'Prestador colectivo (Lda, SA) ou singular isento'],
    ['11.5%',  'Sub-empreiteiro singular em construção civil'],
    ['25%',    'Honorários singulares (categoria B)'],
  ],
  [0.15, 0.85]
)

callout('IMPORTANTE',
  'A obrigação declarativa (DMR mensal, Modelo 30) é da contabilidade. As retenções calculadas pelo sistema devem ser confirmadas com o contabilista antes da emissão de facturas.')

// 10. Decomposição
sectionNum('10', 'Decomposição por tipo fiscal')
paragraph('Abaixo das 17 secções, o sistema apresenta um quadro "Decomposição por tipo fiscal" que agrega todas as linhas do orçamento por categoria. É a forma mais rápida de identificar onde está a maior fatia do orçamento e validar conformidade fiscal.')

imagemLegendada(SHOTS.fiscal,
  'Quadro "Decomposição por tipo fiscal" e "Resumo fiscal" com total bruto sticky no rodapé.')

subhead('Categorias agregadas')
bulletList([
  'Material (azul) — todas as linhas marcadas como material.',
  'Mão-de-obra (verde) — todas as linhas marcadas como MO.',
  'Serviços auxiliares (âmbar) — demolições, RCD, andaimes.',
  'Honorários (roxo) — projecto, TRO, fiscalização, SCE, solicitador.',
  'Taxas (cinzento) — taxas municipais, livro de obra (sem IVA).',
  'Isento (cinzento) — seguros (art 9º CIVA).',
])

subhead('Rácio material / empreitada')
paragraph('Indicador percentual no fundo do quadro. Verde até 15%, âmbar 15-20%, vermelho >20% em regime Habitação (benefício perdido).')

// 11. BDI
sectionNum('11', 'BDI — imprevistos e margem')
paragraph('BDI (Benefícios e Despesas Indirectas) é a percentagem aplicada sobre a base de obra para cobrir riscos não previstos e a margem comercial. No painel "Definições" introduza:')
bulletList([
  'Imprevistos (%) — tipicamente 8 a 15% para reabilitações.',
  'Margem (%) — varia consoante a operação.',
])
paragraph('O cálculo aplica sobre a base de obra (excluindo licenciamento) e tem o IVA do regime aplicado por cima. Aparece no quadro "Resumo fiscal" e no PDF como linha autónoma.')

// 12. Exportação
sectionNum('12', 'Exportação para PDF')
paragraph('Ao clicar em "Exportar PDF" no topo da aba, o sistema gera um documento profissional com cabeçalho Somnium, composição por piso, notas globais, avisos fiscais activos, todas as secções com linhas, subtotais por secção e por tipo, resumo fiscal final e total bruto destacado.')
paragraph('O PDF abre numa nova aba do navegador. Pode descarregar, imprimir ou enviar por email aos investidores e fornecedores.')

// 13. Boas práticas
sectionNum('13', 'Boas práticas')
bulletList([
  'Comece sempre pelos pisos. Sem pisos definidos, secções como pavimento, pladur e eletricidade não conseguem replicar campos por piso.',
  'Use linhas livres para tudo o que for específico. Os campos guiados servem como template; a flexibilidade está nas linhas livres.',
  'Confirme o regime fiscal com o contabilista ANTES de finalizar. Mudar de regime após várias horas de preenchimento é trivial mas pode mudar todos os totais.',
  'Documente decisões nos campos "Notas". Cada secção tem campo de notas livres — use-o para registar premissas, fornecedores escolhidos, datas-chave.',
  'Verifique o rácio material/empreitada se for usar Verba 2.32. Se a estimativa inicial for >18%, considere antes a Verba 2.27 (ARU) que não tem este tecto.',
  'Aproveite a coluna "Ret. IRS" para sub-empreiteiros singulares. Sem isto, a contabilidade tem de fazer ajustes manuais no fecho.',
  'Revise os cálculos antes de exportar PDF. O resumo fiscal mostra todos os números em destaque.',
])

// 14. Erros comuns
sectionNum('14', 'Erros comuns a evitar')
calloutAlerta('ERRO 1 — Verba 2.27 sem documentação',
  'Aplicar regime ARU sem ter declaração do dono da obra ou certificação ARU. Em inspecção da AT, o IVA reduzido é desclassificado e a empresa paga o diferencial 17% (de 6% para 23%) com juros e coima.')
calloutAlerta('ERRO 2 — Esquecer autoliquidação em sub-empreiteiros',
  'Pagar IVA 23% a um sub-empreiteiro de construção civil que devia estar em autoliquidação. Resultado: IVA pago duas vezes (factura + Estado pelo adquirente).')
calloutAlerta('ERRO 3 — Não separar honorários',
  'Misturar honorários (projecto, TRO) com IVA 6%. Honorários são sempre 23% e nunca abrangidos pelas verbas reduzidas. Use sempre a secção 17 "Licenciamento" para estes itens.')
calloutAlerta('ERRO 4 — Materiais isolados em ARU',
  'Material adquirido isoladamente sem MO incorporada não beneficia da Verba 2.27. Se compra electrodomésticos por fornecedor distinto do empreiteiro, fica a 23%. O sistema permite override no IVA do material.')
calloutAlerta('ERRO 5 — Esquecer o BDI',
  'Apresentar orçamento ao investidor sem imprevistos nem margem. O total fica subestimado e a derrapagem é quase certa. Use sempre 8-15% de imprevistos como mínimo.')

// 15. Glossário
sectionNum('15', 'Glossário fiscal')
const termos = [
  ['ARU', 'Área de Reabilitação Urbana — zona delimitada pelo município onde se aplica a Verba 2.27 (IVA 6%).'],
  ['Autoliquidação', 'Regime do CIVA art 2º nº1 al. j) onde, em serviços de construção civil entre sujeitos passivos, é o adquirente que liquida o IVA. Factura sem IVA, com menção expressa.'],
  ['BDI', 'Benefícios e Despesas Indirectas — percentagem sobre a base para cobrir imprevistos e margem do empreiteiro.'],
  ['Bruto fiscal', 'Soma da base com todo o IVA liquidado (incluindo o autoliquidado). Não é o que se paga aos prestadores.'],
  ['CAR', 'Construction All Risks — seguro obrigatório de obra. Isento de IVA pelo art 9º CIVA.'],
  ['CIVA', 'Código do Imposto sobre o Valor Acrescentado.'],
  ['Honorários', 'Pagamentos a profissionais por serviços técnicos. IVA sempre 23%, nunca abrangidos pelas verbas reduzidas.'],
  ['IHRU', 'Instituto da Habitação e da Reabilitação Urbana — entidade certificadora para a Verba 2.27.'],
  ['Lista I do CIVA', 'Anexo do CIVA com bens e serviços tributados à taxa reduzida (6%). Inclui as verbas 2.27, 2.32, etc.'],
  ['MO', 'Mão-de-obra. Componente de trabalho de uma linha do orçamento.'],
  ['NCRF 18', 'Norma contabilística sobre inventários. Para fix-and-flip, custos capitalizam em existências.'],
  ['Regra dos 20%', 'Limite da Verba 2.32: se materiais > 20% da empreitada, perde-se a taxa reduzida.'],
  ['Retenção na fonte', 'Desconto IRS na factura de prestador singular cat B. Tipicamente 25% (serviços) ou 11.5% (sub-empreiteiro construção).'],
  ['RJRU', 'Regime Jurídico da Reabilitação Urbana (DL 53/2014). Pode dar isenções IMT/IMI mas não altera IVA.'],
  ['SCE', 'Sistema de Certificação Energética — certificado obrigatório antes da venda.'],
  ['Sujeito passivo', 'Empresa ou empresário em nome individual com NIF e regime IVA activo.'],
  ['TRO', 'Técnico Responsável de Obra — assinatura obrigatória em obras com licenciamento.'],
  ['Verba 2.27', 'Taxa IVA 6% para empreitadas de reabilitação urbana em ARU. Aplica-se a material + MO.'],
  ['Verba 2.32', 'Taxa IVA 6% para empreitadas em imóveis afectos a habitação. Sujeita à regra dos 20% de materiais.'],
]
table2cols(
  ['Termo', 'Definição'],
  termos,
  [0.18, 0.82]
)

// Fecho
needPage(120)
y += 20
doc.lineWidth(0.5).strokeColor(GOLD)
   .moveTo(PW / 2 - 60, y).lineTo(PW / 2 + 60, y).stroke()
y += 16
doc.font('Helvetica-Bold').fontSize(11).fillColor(TEXT)
   .text('SOMNIUM PROPERTIES', ML, y, { align: 'center', width: CW, lineBreak: false })
y += 16
doc.font('Helvetica').fontSize(9).fillColor(MUTED)
   .text('Coimbra, Portugal', ML, y, { align: 'center', width: CW, lineBreak: false })
y += 28
doc.font('Helvetica-Oblique').fontSize(8).fillColor(LIGHT)
   .text('Versão 3.0 — Maio 2026 · Documento interno · Não redistribuir externamente sem autorização',
         ML, y, { align: 'center', width: CW })

doc.end()
console.log(`✓ Manual gerado: ${OUT_PATH}`)
