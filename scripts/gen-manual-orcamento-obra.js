/**
 * Gera PDF "Manual de utilização — Aba Orçamento de Obra"
 * Documento de onboarding para o gestor de obra.
 * Saída: ./Manual_Orcamento_Obra_Somnium.pdf
 */
import PDFDocument from 'pdfkit'
import { readFileSync, createWriteStream } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const LOGO_PATH = path.resolve(ROOT, 'public/logo-transparent.png')
const OUT_PATH = path.resolve(ROOT, 'Manual_Orcamento_Obra_Somnium.pdf')

const GOLD  = '#C9A84C'
const BLACK = '#0d0d0d'
const GRAY  = '#666666'
const LIGHT = '#F0EDE5'
const BLUE  = '#2563eb'
const GREEN = '#16a34a'
const RED   = '#b91c1c'

const PAGE_W = 595.28  // A4
const PAGE_H = 841.89
const MARGIN = 50

const doc = new PDFDocument({ size: 'A4', margins: { top: 50, bottom: 60, left: MARGIN, right: MARGIN }, autoFirstPage: false })
doc.pipe(createWriteStream(OUT_PATH))

// ── Helpers de layout ───────────────────────────────────────
function novaPagina(comHeader = true) {
  doc.addPage()
  if (comHeader) drawPageHeader()
  drawPageFooter()
  doc.y = 110
}

function drawPageHeader() {
  doc.rect(0, 0, PAGE_W, 90).fill(BLACK)
  try {
    const logo = readFileSync(LOGO_PATH)
    doc.image(logo, MARGIN, 22, { height: 44 })
  } catch {
    doc.fontSize(14).fillColor(GOLD).text('SOMNIUM PROPERTIES', MARGIN, 35)
  }
  doc.rect(0, 88, PAGE_W, 2).fill(GOLD)
  doc.fontSize(8).fillColor(GOLD)
     .text('MANUAL DE UTILIZAÇÃO', MARGIN, 60, { align: 'right', width: PAGE_W - MARGIN * 2 })
  doc.fontSize(7).fillColor('#888')
     .text('Orçamento de Obra · CRM Somnium', MARGIN, 72, { align: 'right', width: PAGE_W - MARGIN * 2 })
}

function drawPageFooter() {
  const y = PAGE_H - 40
  doc.rect(0, y - 6, PAGE_W, 40).fill(BLACK)
  doc.rect(0, y - 6, PAGE_W, 2).fill(GOLD)
  doc.fontSize(7).fillColor(GOLD)
     .text('SOMNIUM PROPERTIES · Coimbra, Portugal · Documento interno', MARGIN, y + 6, { align: 'center', width: PAGE_W - MARGIN * 2 })
}

function checkSpace(needed) {
  if (doc.y + needed > PAGE_H - 70) novaPagina()
}

function h1(texto) {
  checkSpace(50)
  doc.moveDown(0.5)
  doc.fontSize(18).fillColor(BLACK).text(texto, MARGIN, doc.y)
  doc.moveTo(MARGIN, doc.y + 4).lineTo(MARGIN + 50, doc.y + 4).strokeColor(GOLD).lineWidth(2).stroke()
  doc.moveDown(1.2)
}

function h2(texto) {
  checkSpace(40)
  doc.moveDown(0.6)
  doc.fontSize(13).fillColor(BLACK).text(texto, MARGIN, doc.y)
  doc.moveDown(0.4)
}

function h3(texto) {
  checkSpace(28)
  doc.moveDown(0.4)
  doc.fontSize(10).fillColor(GOLD).text(texto.toUpperCase(), MARGIN, doc.y, { characterSpacing: 1 })
  doc.moveDown(0.3)
}

function p(texto, opts = {}) {
  checkSpace(20)
  doc.fontSize(10).fillColor('#222').text(texto, MARGIN, doc.y, {
    align: 'justify',
    width: PAGE_W - MARGIN * 2,
    lineGap: 2,
    ...opts,
  })
  doc.moveDown(0.5)
}

function pSmall(texto) {
  checkSpace(16)
  doc.fontSize(9).fillColor(GRAY).text(texto, MARGIN, doc.y, {
    width: PAGE_W - MARGIN * 2,
    lineGap: 2,
  })
  doc.moveDown(0.4)
}

function bullet(texto, opts = {}) {
  checkSpace(20)
  const startY = doc.y
  doc.fontSize(10).fillColor(GOLD).text('•', MARGIN, startY)
  doc.fontSize(10).fillColor(opts.cor || '#222').text(texto, MARGIN + 14, startY, {
    width: PAGE_W - MARGIN * 2 - 14,
    lineGap: 2,
  })
  doc.moveDown(0.3)
}

function callout(titulo, texto, cor = GOLD) {
  checkSpace(60)
  const startY = doc.y
  const altura = doc.heightOfString(texto, { width: PAGE_W - MARGIN * 2 - 24, fontSize: 10 }) + 30
  doc.rect(MARGIN, startY, PAGE_W - MARGIN * 2, altura).fillAndStroke('#FFF8E7', cor)
  doc.fontSize(9).fillColor(cor).text(titulo.toUpperCase(), MARGIN + 12, startY + 8, { characterSpacing: 1 })
  doc.fontSize(10).fillColor('#444').text(texto, MARGIN + 12, startY + 22, {
    width: PAGE_W - MARGIN * 2 - 24,
    lineGap: 2,
  })
  doc.y = startY + altura + 8
}

function box(titulo, linhas, cor = BLACK) {
  checkSpace(80)
  const startY = doc.y
  doc.rect(MARGIN, startY, PAGE_W - MARGIN * 2, 24).fill(cor)
  doc.fontSize(10).fillColor(GOLD).text(titulo, MARGIN + 12, startY + 7, { characterSpacing: 1 })
  doc.y = startY + 28
  doc.fillColor('#222').strokeColor('#ddd').lineWidth(0.5)
  for (const l of linhas) {
    checkSpace(18)
    if (l.tipo === 'header') {
      doc.fontSize(9).fillColor(GOLD).text(l.texto.toUpperCase(), MARGIN, doc.y, { characterSpacing: 0.8 })
      doc.moveDown(0.3)
    } else {
      doc.fontSize(10).fillColor('#222').text('  ' + l.texto, MARGIN, doc.y, {
        width: PAGE_W - MARGIN * 2,
        lineGap: 2,
      })
      doc.moveDown(0.25)
    }
  }
  doc.moveDown(0.5)
}

function tabela(rows, larguraColunas) {
  // larguraColunas: array de larguras (soma deve ser ≤ pageW - 2*margin)
  const totalW = PAGE_W - MARGIN * 2
  const widths = larguraColunas.map(w => w * totalW)
  const rowH = 22
  const headerH = 24

  checkSpace(headerH + rows.length * rowH + 10)

  let y = doc.y
  let x = MARGIN

  // Header
  doc.rect(MARGIN, y, totalW, headerH).fill(BLACK)
  for (let i = 0; i < rows[0].length; i++) {
    doc.fontSize(8).fillColor(GOLD).text(rows[0][i], x + 6, y + 8, { width: widths[i] - 12, characterSpacing: 0.5 })
    x += widths[i]
  }
  y += headerH

  // Body
  for (let r = 1; r < rows.length; r++) {
    if (y + rowH > PAGE_H - 70) {
      novaPagina()
      y = doc.y
    }
    if (r % 2 === 1) {
      doc.rect(MARGIN, y, totalW, rowH).fill(LIGHT)
    }
    x = MARGIN
    for (let i = 0; i < rows[r].length; i++) {
      const cell = rows[r][i] || ''
      doc.fontSize(8.5).fillColor('#222').text(cell, x + 6, y + 6, { width: widths[i] - 12 })
      x += widths[i]
    }
    y += rowH
  }
  doc.moveTo(MARGIN, y).lineTo(MARGIN + totalW, y).strokeColor('#ccc').lineWidth(0.5).stroke()
  doc.y = y + 10
}

// ── Capa ────────────────────────────────────────────────────
doc.addPage()
doc.rect(0, 0, PAGE_W, PAGE_H).fill(BLACK)

try {
  const logo = readFileSync(LOGO_PATH)
  doc.image(logo, (PAGE_W - 200) / 2, 180, { width: 200 })
} catch {}

doc.fontSize(10).fillColor(GOLD).text('CRM SOMNIUM', 0, 380, { align: 'center', width: PAGE_W, characterSpacing: 4 })

doc.fontSize(34).fillColor('#FFF').text('Manual de Utilização', 0, 420, { align: 'center', width: PAGE_W })
doc.fontSize(20).fillColor(GOLD).text('Orçamento de Obra', 0, 470, { align: 'center', width: PAGE_W })

doc.moveTo(PAGE_W / 2 - 40, 520).lineTo(PAGE_W / 2 + 40, 520).strokeColor(GOLD).lineWidth(1).stroke()

doc.fontSize(11).fillColor('#999')
   .text('Guia de utilização e referência fiscal', 0, 540, { align: 'center', width: PAGE_W })

doc.fontSize(9).fillColor('#666')
   .text('Para o Gestor de Obra', 0, 730, { align: 'center', width: PAGE_W })
doc.fontSize(8).fillColor('#666')
   .text('Versão 3.0 · Maio 2026', 0, 745, { align: 'center', width: PAGE_W })

// ── Página 1: Índice ────────────────────────────────────────
novaPagina()
h1('Índice')

const indice = [
  ['1.', 'Visão geral',                                 '3'],
  ['2.', 'Acesso à aba Obra',                           '3'],
  ['3.', 'Conceitos fundamentais',                      '4'],
  ['4.', 'Regime fiscal e taxas de IVA',                '5'],
  ['5.', 'Estrutura da aba',                            '7'],
  ['6.', 'Como preencher um orçamento',                 '8'],
  ['7.', 'Linhas livres editáveis (campo aberto)',      '10'],
  ['8.', 'IVA por linha — material vs mão-de-obra',     '11'],
  ['9.', 'Autoliquidação e retenções IRS',              '12'],
  ['10.', 'Decomposição por tipo fiscal',               '13'],
  ['11.', 'BDI — imprevistos e margem',                 '14'],
  ['12.', 'Exportação para PDF',                        '14'],
  ['13.', 'Boas práticas',                              '15'],
  ['14.', 'Erros comuns a evitar',                      '16'],
  ['15.', 'Glossário fiscal',                           '17'],
]

for (const [num, titulo, pag] of indice) {
  checkSpace(18)
  doc.fontSize(10).fillColor(GOLD).text(num, MARGIN, doc.y, { width: 30 })
  doc.fontSize(10).fillColor('#222').text(titulo, MARGIN + 30, doc.y - 12, { width: PAGE_W - MARGIN * 2 - 60 })
  doc.fontSize(9).fillColor(GRAY).text(pag, PAGE_W - MARGIN - 30, doc.y - 12, { width: 30, align: 'right' })
  doc.moveDown(0.5)
}

// ── 1. Visão geral ──────────────────────────────────────────
novaPagina()
h1('1. Visão geral')

p('A aba "Obra" do CRM Somnium é a ferramenta oficial para construir o orçamento detalhado de cada imóvel da carteira. Substitui o ficheiro Word tradicional e oferece três vantagens fundamentais.')

bullet('Cálculo automático em tempo real — sem erros aritméticos. O sistema soma cada linha, aplica o IVA correcto e produz o total bruto.')
bullet('Conformidade fiscal portuguesa — separa material e mão-de-obra, aplica autoliquidação e retenção IRS conforme o caso, prepara o orçamento para auditoria contabilística.')
bullet('Sincronização com o resto do CRM — o total geral alimenta automaticamente o campo "Custo estimado de obra" da ficha do imóvel e a aba "Análise Financeira".')

callout('IMPORTANTE',
  'O orçamento é guardado automaticamente à medida que escreve. Não existe botão "Guardar". Se vir o indicador "A guardar" no topo, significa que o sistema está a sincronizar com o servidor — não feche a página antes de aparecer "Guardado".',
  GOLD)

// ── 2. Acesso à aba Obra ────────────────────────────────────
h1('2. Acesso à aba Obra')

p('Para abrir o orçamento de um imóvel:')
bullet('Entrar no CRM e abrir o módulo "CRM > Pipeline Imóveis".')
bullet('Clicar no nome do imóvel para abrir a ficha de detalhe.')
bullet('Selecionar o separador "Obra" — está entre "Localização" e "Análise Financeira".')

p('Cada imóvel tem um único orçamento, identificado pelo nome do imóvel. Quando o orçamento é actualizado, o total propaga automaticamente para a ficha do imóvel.')

// ── 3. Conceitos fundamentais ──────────────────────────────
novaPagina()
h1('3. Conceitos fundamentais')

h3('Pisos')
p('Antes de preencher qualquer secção, defina os pisos do imóvel no topo do separador. Cada piso tem nome (R/C, 1º Andar, Sótão, Cave, etc.), área em m² e uma descrição opcional. Algumas secções (eletricidade, pavimento, pladur, pintura) replicam os campos por piso.')

h3('Secções')
p('O orçamento está dividido em 17 secções pré-definidas, organizadas pela ordem natural da obra. Cada secção tem campos guiados (pré-definidos) e uma tabela de "linhas livres" onde pode adicionar tudo o que for específico desta obra.')

const seccoesLista = [
  ['1.', 'Demolições e limpeza'],
  ['2.', 'RCD — Resíduos (DL 102-D/2020)'],
  ['3.', 'Estrutura (lajes, vigas, pilares)'],
  ['4.', 'Eletricidade e canalização'],
  ['5.', 'AVAC / Solar / AQS'],
  ['6.', 'Pavimento'],
  ['7.', 'Pladur tetos'],
  ['8.', 'Isolamento térmico/acústico'],
  ['9.', 'Caixilharias'],
  ['10.', 'Sistema VMC'],
  ['11.', 'Pintura'],
  ['12.', 'Casas de banho'],
  ['13.', 'Portas'],
  ['14.', 'Cozinhas'],
  ['15.', 'Capoto / ETICS exterior'],
  ['16.', 'Cobertura'],
  ['17.', 'Licenciamento, fiscalização e seguros'],
]
checkSpace(seccoesLista.length * 14 + 20)
const colW = (PAGE_W - MARGIN * 2) / 2
let colY = doc.y
for (let i = 0; i < seccoesLista.length; i++) {
  const col = i < 9 ? 0 : 1
  if (col === 1 && i === 9) colY = doc.y - 14 * 9
  const [num, label] = seccoesLista[i]
  const x = MARGIN + col * colW
  const y = col === 0 ? doc.y : colY + (i - 9) * 14
  doc.fontSize(9).fillColor(GOLD).text(num, x, y, { width: 22 })
  doc.fontSize(9).fillColor('#333').text(label, x + 22, y, { width: colW - 30 })
  if (col === 0) doc.moveDown(0.2)
}
doc.y = Math.max(doc.y, colY + 14 * 8)
doc.moveDown(0.8)

h3('Linhas')
p('Cada linha do orçamento tem uma componente material e/ou uma componente de mão-de-obra. Cada componente tem o seu IVA — material a 23% (regra geral) e mão-de-obra na taxa do regime escolhido (6% ou 23%).')

// ── 4. Regime fiscal ────────────────────────────────────────
novaPagina()
h1('4. Regime fiscal e taxas de IVA')

p('Antes de começar a preencher um orçamento, escolha o regime fiscal aplicável no painel "Definições" no topo da aba. O regime determina a taxa de IVA por defeito da mão-de-obra.')

h3('Os quatro regimes disponíveis')

box('Normal (23%)', [
  { tipo: 'normal', texto: 'Aplicável a obras que não cumpram os requisitos das verbas reduzidas. IVA 23% generalizado em material e mão-de-obra.' },
])

box('Reabilitação ARU — Verba 2.27 da Lista I do CIVA (6%)', [
  { tipo: 'normal', texto: 'Aplica-se a empreitadas de reabilitação urbana sobre imóveis localizados em Áreas de Reabilitação Urbana (ARU). Coimbra tem várias ARU activas (Centro Histórico, Baixa, Santa Clara, etc.).' },
  { tipo: 'normal', texto: 'A taxa reduzida 6% aplica-se a TODA a empreitada (material + mão-de-obra incorporados), desde que cumpridos os requisitos abaixo.' },
])

callout('REQUISITOS PARA APLICAR A VERBA 2.27',
  '1. O imóvel tem de estar localizado dentro de uma ARU (verificar com a Câmara Municipal).\n' +
  '2. A operação deve estar enquadrada como "reabilitação urbana" (não substituição/reconstrução).\n' +
  '3. Declaração escrita do dono da obra ao empreiteiro a atestar o destino do imóvel.\n' +
  '4. Certificação municipal ou pelo IHRU.\n\n' +
  'Sem estes documentos, a Verba 2.27 não pode ser invocada — o IVA volta automaticamente a 23%.',
  RED)

box('Habitação — Verba 2.32 (6% com regra dos 20%)', [
  { tipo: 'normal', texto: 'Empreitadas de beneficiação ou remodelação em imóveis afectos a habitação. Taxa 6% no global da empreitada SE o valor dos materiais incorporados não exceder 20% do valor total.' },
  { tipo: 'normal', texto: 'O sistema calcula automaticamente o rácio material/empreitada e avisa quando ultrapassar 15% (zona laranja) ou 20% (zona vermelha — perda do benefício).' },
])

callout('PERDA DO BENEFÍCIO',
  'Se o rácio de materiais ultrapassar 20% do valor da empreitada em regime Habitação (Verba 2.32), o sistema recalcula automaticamente todo o orçamento a 23% e marca o estado como "Benefício perdido". Para manter a taxa 6%, reduza a fracção de material ou separe linhas para outro orçamento.',
  RED)

novaPagina()

box('RJRU (DL 53/2014) — IMT/IMI sem alterar IVA', [
  { tipo: 'normal', texto: 'Regime Jurídico da Reabilitação Urbana. Não altera o IVA da empreitada (continua 23%) mas pode dar isenção/redução de IMT na compra e IMI no primeiro ano. Esta secção é informativa para o contabilista.' },
])

h3('Honorários sempre a 23%')
p('Independentemente do regime escolhido, honorários (projecto, TRO, fiscalização, SCE, solicitador) são sempre a 23% — não estão abrangidos pelas verbas reduzidas. O sistema aplica esta regra automaticamente.')

h3('Taxas e seguros')
p('Taxas municipais e livro de obra estão fora do campo do IVA (artigo 2º nº 2 do CIVA — receitas tributárias). Seguros (CAR — Construction All Risks) são isentos pelo artigo 9º do CIVA. O sistema aplica IVA 0% nestes itens automaticamente.')

// ── 5. Estrutura da aba ─────────────────────────────────────
h1('5. Estrutura da aba')

p('A aba está organizada em 4 zonas do topo para o fundo:')

bullet('Header sticky — nome do imóvel, regime fiscal, indicador "A guardar / Guardado", botão "Definições" e botão "Exportar PDF". Permanece visível durante a scroll.')
bullet('KPIs em barra — quatro indicadores financeiros chave actualizados em tempo real: Base, IVA liquidado, A pagar e Total bruto.')
bullet('Chips de navegação — clique num chip para ir directamente a essa secção. Os chips com bola indicam secções já preenchidas.')
bullet('Conteúdo principal — pisos, notas globais, 17 secções colapsáveis, decomposição por tipo, resumo fiscal.')
bullet('Total bruto sticky — barra preta no rodapé com o total geral, sempre visível.')

callout('DICA',
  'Use os chips de navegação no topo para saltar directamente para a secção que quer editar. As secções já preenchidas aparecem destacadas a preto.',
  GOLD)

// ── 6. Como preencher um orçamento ─────────────────────────
novaPagina()
h1('6. Como preencher um orçamento')

h3('Passo 1 — Configurar o regime fiscal')
p('Clique em "Definições" no topo da aba e escolha o regime fiscal aplicável. Confira os documentos de suporte com o sócio responsável antes de aplicar Verba 2.27 ou 2.32.')

h3('Passo 2 — Adicionar os pisos')
p('Na secção "Pisos do imóvel" introduza cada piso (R/C, 1º Andar, etc.) com a respectiva área em m². Pode usar os pré-sets clicando na seta do campo "Nome".')

h3('Passo 3 — Preencher as secções')
p('Para cada secção pode usar duas formas de preenchimento, em alternativa ou em conjunto:')
bullet('Campos guiados — preencher os campos pré-definidos (m², €/m², dias × €/dia, etc.). Cada campo tem uma badge "Mat." (azul) ou "MO" (verde) que indica se é material ou mão-de-obra. O sistema aplica a taxa de IVA automaticamente.')
bullet('Linhas livres — usar a tabela "Linhas livres" no fim de cada secção para adicionar itens específicos desta obra que não cabem nos campos guiados. Cada linha permite escolher livremente o IVA do material e o IVA da MO.')

h3('Passo 4 — BDI (opcional)')
p('Em "Definições", introduza percentagens de imprevistos e margem do empreiteiro. O sistema aplica sobre a base da obra (excluindo licenciamento) e adiciona ao total.')

h3('Passo 5 — Validar avisos fiscais')
p('Se aparecerem avisos no topo (caixas amarelas, laranjas ou vermelhas), leia-os e tome a acção sugerida.')

h3('Passo 6 — Exportar PDF')
p('Clique em "Exportar PDF" no topo. O documento gerado replica fielmente o formato tradicional do gestor de obra com o cabeçalho da Somnium.')

// ── 7. Linhas livres ────────────────────────────────────────
novaPagina()
h1('7. Linhas livres editáveis (campo aberto)')

p('No fundo de cada uma das 17 secções existe uma "Tabela de linhas livres". Esta tabela permite total liberdade ao gestor de obra: pode adicionar quantas linhas quiser, com qualquer descrição, quantidade, unidade, preço unitário e taxa de IVA.')

h3('Estrutura de cada linha livre')

const tabLinha = [
  ['Coluna', 'Tipo', 'Descrição'],
  ['Descrição', 'Texto livre', 'Nome do item, ex: "Carpinteiro especializado"'],
  ['Qtd', 'Número', 'Quantidade — usar 1 para itens fixos'],
  ['Unidade', 'Lista', 'un, m², m, m³, h (horas), dias, vg (verba global), kg'],
  ['€/un mat', 'Número', 'Preço unitário do componente material (sem IVA)'],
  ['IVA mat', 'Lista', '0 / 6 / 13 / 23% — IVA aplicado ao material'],
  ['€/un MO', 'Número', 'Preço unitário da componente mão-de-obra (sem IVA)'],
  ['IVA MO', 'Lista', '0 / 6 / 13 / 23% — IVA aplicado à MO (default segue regime)'],
  ['Auto.', 'Checkbox', 'Marcar se a MO está em autoliquidação (entre sujeitos passivos)'],
  ['Ret. IRS', 'Lista', '0 / 11.5 / 25% — retenção IRS se prestador singular'],
]
tabela(tabLinha, [0.18, 0.16, 0.66])

h3('Quando usar linhas livres')
bullet('O item não tem campo guiado pré-definido (ex: "Recuperação de cantaria histórica")')
bullet('Quer separar uma despesa em sub-itens com IVAs diferentes')
bullet('Tem um fornecedor específico com factura própria (ex: "Equipamento Bosch importado, IVA 23%")')
bullet('Tem um sub-empreiteiro com regime especial (ex: autoliquidação ou retenção 11.5%)')

callout('LIBERDADE TOTAL',
  'Os campos guiados são uma comodidade — toda a obra pode ser feita exclusivamente com linhas livres se preferir esse método. O motor de cálculo trata ambos exactamente da mesma forma.',
  GOLD)

// ── 8. IVA por linha ────────────────────────────────────────
novaPagina()
h1('8. IVA por linha — material vs mão-de-obra')

p('Esta é a regra fiscal mais importante a compreender. Cada linha do orçamento pode ter dois componentes — material e mão-de-obra — e cada um pode ter a sua própria taxa de IVA.')

h3('Convenção visual')
bullet('Inputs com contorno azul + badge "Mat." → componente material', { cor: BLUE })
bullet('Inputs com contorno verde + badge "MO" → componente mão-de-obra', { cor: GREEN })

h3('Taxas por defeito')
const tabIva = [
  ['Componente', 'Regime Normal', 'Regime ARU', 'Regime Habitação', 'Honorários'],
  ['Material', '23%', '6%*', '6%* (regra 20%)', '—'],
  ['MO', '23%', '6%', '6%', '—'],
  ['Honorários', '—', '—', '—', '23% (sempre)'],
  ['Taxas', '—', '—', '—', '0% (fora IVA)'],
  ['Seguros', '—', '—', '—', '0% (isento)'],
]
tabela(tabIva, [0.20, 0.20, 0.20, 0.20, 0.20])

pSmall('* Em ARU, a Verba 2.27 aplica 6% a toda a empreitada (material + MO). Em Habitação Verba 2.32, 6% é mantido apenas se o material não exceder 20% do valor total.')

h3('Quando alterar manualmente o IVA')
p('O selector de IVA em cada linha permite override quando a regra geral não se aplica:')
bullet('Equipamento importado por uma empresa exterior à empreitada — fica a 23% mesmo em ARU.')
bullet('Subcontratação especial não enquadrada na verba reduzida.')
bullet('Honorários esporádicos no meio de uma secção (mantêm sempre 23%).')

callout('REGRA PRÁTICA',
  'Em caso de dúvida, deixe os IVAs como o sistema sugere por defeito. Confirme posteriormente com o contabilista no fecho do orçamento. Mudanças de última hora podem ser feitas a qualquer momento.',
  GOLD)

// ── 9. Autoliquidação e retenções ──────────────────────────
novaPagina()
h1('9. Autoliquidação e retenções IRS')

h3('Autoliquidação (al. j) art 2º nº 1 CIVA)')
p('Aplica-se em serviços de construção civil prestados entre dois sujeitos passivos de IVA. A factura sai sem IVA com a menção "IVA — autoliquidação" e é o adquirente (a Somnium) que liquida e deduz o IVA.')

p('Para marcar uma linha em autoliquidação:')
bullet('Linhas livres — checkbox "Auto." na coluna respectiva.')
bullet('Campos guiados — checkbox "Autoliquidação MO" no painel "Override secção" no topo de cada secção.')

p('No total a pagar ao prestador, o IVA autoliquidado é descontado (passa para o adquirente). Continua, no entanto, contabilizado no IVA total do orçamento — apenas não é desembolsado para o prestador.')

h3('Retenções IRS (art 101º CIRS)')
p('Aplica-se quando o prestador é uma pessoa singular em regime de categoria B (serviços). A retenção é descontada ao pagamento e entregue à Autoridade Tributária mensalmente.')

const tabRet = [
  ['Taxa', 'Aplicação típica'],
  ['0%', 'Prestador colectivo (Lda, SA) ou singular isento'],
  ['11.5%', 'Sub-empreiteiro singular em construção civil (verificar tabela actual)'],
  ['25%', 'Honorários singulares (categoria B serviços profissionais)'],
]
tabela(tabRet, [0.15, 0.85])

p('Para marcar retenção numa linha:')
bullet('Linhas livres — coluna "Ret. IRS" com selector de 0/11.5/25%.')
bullet('Campos guiados de licenciamento — checkbox "Singular" ao lado de cada honorário (projecto, TRO, SCE, solicitador) aplica automaticamente 25%.')

callout('IMPORTANTE',
  'A obrigação declarativa (DMR mensal, Modelo 30) é da contabilidade. O orçamento serve como referência prévia. As retenções calculadas pelo sistema devem ser confirmadas com o contabilista antes da emissão de facturas.',
  GOLD)

// ── 10. Decomposição por tipo ──────────────────────────────
novaPagina()
h1('10. Decomposição por tipo fiscal')

p('Abaixo das 17 secções, o sistema apresenta um quadro "Decomposição por tipo fiscal" que agrega todas as linhas do orçamento por categoria:')

bullet('Material (azul) — todas as linhas marcadas como material', { cor: BLUE })
bullet('Mão-de-obra (verde) — todas as linhas marcadas como MO', { cor: GREEN })
bullet('Serviços auxiliares (âmbar) — demolições, RCD, andaimes')
bullet('Honorários roxo — projecto, TRO, fiscalização, SCE, solicitador')
bullet('Taxas (cinzento) — taxas municipais, livro de obra (sem IVA)')
bullet('Isento (cinzento) — seguros (art 9º CIVA)')
bullet('Misto (cinzento) — linhas legadas não decompostas')

p('Cada categoria mostra: base, IVA liquidado, IVA autoliquidado (se aplicável), retenções IRS (se aplicável). É a forma mais rápida de identificar onde está a maior fatia do orçamento e validar conformidade fiscal.')

h3('Rácio material / empreitada')
p('Indicador percentual no fundo do quadro. Verde (até 15%), âmbar (15-20%) e vermelho (>20% em regime Habitação — benefício perdido).')

// ── 11. BDI ─────────────────────────────────────────────────
h1('11. BDI — imprevistos e margem')

p('BDI (Benefícios e Despesas Indirectas) é a percentagem aplicada sobre a base de obra para cobrir riscos não previstos e a margem comercial. No painel "Definições" introduza:')
bullet('Imprevistos (%) — tipicamente 8 a 15% para reabilitações.')
bullet('Margem (%) — varia consoante a operação.')

p('O cálculo é aplicado SOBRE a base de obra (excluindo licenciamento) e tem o IVA do regime aplicado por cima. Aparece no quadro "Resumo fiscal" e no PDF como linha autónoma.')

// ── 12. Exportação ──────────────────────────────────────────
h1('12. Exportação para PDF')

p('Ao clicar em "Exportar PDF" no topo da aba, o sistema gera um documento profissional com:')
bullet('Cabeçalho Somnium Properties com logo')
bullet('Composição por piso')
bullet('Notas globais')
bullet('Avisos fiscais activos')
bullet('Cada secção com todas as suas linhas (incluindo linhas livres)')
bullet('Subtotais por secção e por tipo fiscal')
bullet('Resumo fiscal final (base, IVA, autoliquidação, retenções, total a pagar)')
bullet('Total bruto destacado em barra dourada')

p('O PDF abre numa nova aba do navegador. Pode descarregá-lo, imprimir ou enviar por email aos investidores e fornecedores.')

// ── 13. Boas práticas ───────────────────────────────────────
novaPagina()
h1('13. Boas práticas')

bullet('Comece sempre pelos pisos. Sem pisos definidos, secções como pavimento, pladur e eletricidade não conseguem replicar os campos por piso.')
bullet('Use linhas livres para tudo o que for específico. Os campos guiados servem como template; a flexibilidade está nas linhas livres.')
bullet('Confirme o regime fiscal com o contabilista ANTES de finalizar. Mudar de regime após várias horas de preenchimento é trivial mas pode mudar todos os totais.')
bullet('Documente decisões nos campos "Notas". Cada secção tem um campo de notas livres — use-o para registar premissas, fornecedores escolhidos, datas-chave.')
bullet('Verifique o rácio material/empreitada se for usar Verba 2.32. Se a sua estimativa inicial for >18%, considere antes a Verba 2.27 (ARU) que não tem este tecto.')
bullet('Aproveite a coluna "Ret. IRS" para sub-empreiteiros singulares. Sem isto, a contabilidade vai ter de fazer ajustes manuais no fecho.')
bullet('Revise os cálculos antes de exportar PDF. O resumo fiscal no fundo da aba mostra todos os números em destaque.')

// ── 14. Erros comuns ───────────────────────────────────────
h1('14. Erros comuns a evitar')

callout('ERRO 1 — Verba 2.27 sem documentação',
  'Aplicar regime ARU sem ter declaração do dono da obra ou certificação ARU. Em caso de inspecção da AT, o IVA reduzido é desclassificado e a empresa paga o diferencial 17% (de 6% para 23%) com juros e coima. Confirme sempre os documentos antes.',
  RED)

callout('ERRO 2 — Esquecer autoliquidação em sub-empreiteiros',
  'Pagar IVA 23% a um sub-empreiteiro de construção civil que devia estar em autoliquidação. Resultado: IVA pago duas vezes (uma na factura, outra ao Estado pelo adquirente). Confirme sempre o regime do prestador antes de marcar autoliquidação.',
  RED)

callout('ERRO 3 — Não separar honorários',
  'Misturar honorários (projecto, TRO) na secção de obra com IVA 6%. Honorários são sempre 23% e nunca abrangidos pelas verbas reduzidas. Use sempre a secção 17 "Licenciamento" para estes itens.',
  RED)

callout('ERRO 4 — Materiais isolados em ARU',
  'Material adquirido isoladamente (sem MO incorporada) não beneficia da Verba 2.27. Se compra electrodomésticos para uma cozinha através de um fornecedor distinto do empreiteiro, fica a 23%. O sistema permite override no IVA do material quando isto acontece.',
  RED)

callout('ERRO 5 — Esquecer o BDI',
  'Apresentar orçamento ao investidor sem imprevistos nem margem. O total fica subestimado e a derrapagem na fase de obra é quase certa. Use sempre 8-15% de imprevistos como mínimo.',
  RED)

// ── 15. Glossário ──────────────────────────────────────────
novaPagina()
h1('15. Glossário fiscal')

const termos = [
  ['ARU', 'Área de Reabilitação Urbana — zona delimitada pelo município onde se aplica a Verba 2.27 (IVA 6%).'],
  ['Autoliquidação', 'Regime do CIVA art 2º nº1 al. j) onde, em serviços de construção civil entre sujeitos passivos, é o adquirente que liquida o IVA em vez do prestador. Factura sem IVA, com menção expressa.'],
  ['BDI', 'Benefícios e Despesas Indirectas — percentagem sobre a base de obra para cobrir imprevistos e margem do empreiteiro. Tipicamente 10-20%.'],
  ['Bruto fiscal', 'Soma da base tributável com todo o IVA liquidado (incluindo o autoliquidado). Não é o que se paga aos prestadores — é o "valor para a Autoridade Tributária".'],
  ['CAR', 'Construction All Risks — seguro obrigatório de obra. Isento de IVA pelo art 9º CIVA.'],
  ['CIVA', 'Código do Imposto sobre o Valor Acrescentado.'],
  ['Honorários', 'Pagamentos a profissionais por serviços técnicos (projecto, TRO, fiscalização, SCE, solicitador). IVA sempre 23% e nunca abrangidos pelas verbas reduzidas.'],
  ['IHRU', 'Instituto da Habitação e da Reabilitação Urbana — entidade certificadora para a Verba 2.27.'],
  ['Lista I do CIVA', 'Anexo do CIVA que enumera os bens e serviços tributados à taxa reduzida (6%). Inclui as verbas 2.27, 2.32, etc.'],
  ['MO', 'Mão-de-obra. Componente de trabalho de uma linha do orçamento, distinta do material.'],
  ['NCRF 18', 'Norma contabilística sobre inventários. Para fix-and-flip, custos de obra capitalizam em existências.'],
  ['Regra dos 20%', 'Limite da Verba 2.32 (Habitação): se materiais > 20% da empreitada, perde-se a taxa reduzida e tudo passa a 23%.'],
  ['Retenção na fonte', 'Desconto IRS na factura de prestador singular cat B (serviços). Tipicamente 25% (serviços profissionais) ou 11.5% (sub-empreiteiro construção). Entregue mensalmente à AT.'],
  ['RJRU', 'Regime Jurídico da Reabilitação Urbana (DL 53/2014). Pode dar isenções IMT/IMI mas não altera IVA.'],
  ['SCE', 'Sistema de Certificação Energética — certificado obrigatório antes da venda.'],
  ['Sujeito passivo', 'Empresa ou empresário em nome individual com NIF e regime de IVA activo.'],
  ['TRO', 'Técnico Responsável de Obra — assinatura obrigatória em obras com licenciamento.'],
  ['Verba 2.27', 'Taxa IVA 6% para empreitadas de reabilitação urbana em ARU. Aplica-se a material + MO.'],
  ['Verba 2.32', 'Taxa IVA 6% para empreitadas em imóveis afectos a habitação. Sujeita à regra dos 20% de materiais.'],
]

for (const [termo, def] of termos) {
  checkSpace(28)
  doc.fontSize(10).fillColor(GOLD).text(termo, MARGIN, doc.y, { continued: false })
  doc.fontSize(9).fillColor('#222').text(def, MARGIN, doc.y, {
    width: PAGE_W - MARGIN * 2,
    lineGap: 1.5,
  })
  doc.moveDown(0.5)
}

// ── Página final: Contactos ────────────────────────────────
novaPagina()

doc.y = 200
doc.fontSize(20).fillColor(BLACK).text('Suporte e dúvidas', MARGIN, doc.y, { align: 'center', width: PAGE_W - MARGIN * 2 })
doc.moveDown(1)

doc.fontSize(11).fillColor('#444').text(
  'Este manual cobre o uso típico da aba Orçamento de Obra. Para situações fiscais complexas (regimes especiais, isenções IMT, verba reduzida em casos limítrofes), consulte sempre o contabilista oficial da empresa antes de finalizar o orçamento.',
  MARGIN, doc.y,
  { align: 'center', width: PAGE_W - MARGIN * 2, lineGap: 3 }
)

doc.moveDown(2)
doc.moveTo(PAGE_W / 2 - 60, doc.y).lineTo(PAGE_W / 2 + 60, doc.y).strokeColor(GOLD).lineWidth(1).stroke()
doc.moveDown(1)

doc.fontSize(11).fillColor(BLACK).text('SOMNIUM PROPERTIES', { align: 'center', width: PAGE_W - MARGIN * 2 })
doc.fontSize(9).fillColor(GRAY)
   .text('Coimbra, Portugal', { align: 'center', width: PAGE_W - MARGIN * 2 })

doc.moveDown(3)
doc.fontSize(8).fillColor('#999')
   .text('Versão 3.0 — Maio 2026 · Documento interno · Não redistribuir externamente sem autorização',
         MARGIN, doc.y, { align: 'center', width: PAGE_W - MARGIN * 2 })

doc.end()

console.log(`✓ Manual gerado: ${OUT_PATH}`)
