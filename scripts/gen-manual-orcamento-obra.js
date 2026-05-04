/**
 * Gera PDF "Manual de utilização — Aba Orçamento de Obra".
 * Layout fluido (sem páginas em branco) com screenshots reais da aba.
 * Saída: ./Manual_Orcamento_Obra_Somnium.pdf
 */
import PDFDocument from 'pdfkit'
import { readFileSync, createWriteStream, existsSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const LOGO_PATH = path.resolve(ROOT, 'public/logo-transparent.png')
const SHOTS_DIR = path.resolve(__dirname, 'manual-obra-screenshots')
const OUT_PATH = path.resolve(ROOT, 'Manual_Orcamento_Obra_Somnium.pdf')

const SHOTS = {
  header: path.join(SHOTS_DIR, 'shot-header.png'),
  pisos:  path.join(SHOTS_DIR, 'shot-pisos.png'),
  seccao: path.join(SHOTS_DIR, 'shot-seccao.png'),
  fiscal: path.join(SHOTS_DIR, 'shot-fiscal.png'),
  aviso:  path.join(SHOTS_DIR, 'shot-aviso.png'),
}

const GOLD  = '#C9A84C'
const BLACK = '#0d0d0d'
const GRAY  = '#666666'
const LIGHT = '#F0EDE5'
const RED   = '#b91c1c'

const PAGE_W = 595.28
const PAGE_H = 841.89
const MARGIN = 50
const CONTENT_W = PAGE_W - MARGIN * 2
const FOOTER_Y = PAGE_H - 50
const HEADER_H = 90

const doc = new PDFDocument({
  size: 'A4',
  margins: { top: HEADER_H + 20, bottom: 60, left: MARGIN, right: MARGIN },
  autoFirstPage: false,
})
doc.pipe(createWriteStream(OUT_PATH))

let pageHasHeader = false

// ── Layout helpers ────────────────────────────────────────
function drawPageHeader() {
  doc.rect(0, 0, PAGE_W, HEADER_H).fill(BLACK)
  try {
    const logo = readFileSync(LOGO_PATH)
    doc.image(logo, MARGIN, 22, { height: 44 })
  } catch {
    doc.fontSize(14).fillColor(GOLD).text('SOMNIUM PROPERTIES', MARGIN, 35)
  }
  doc.rect(0, HEADER_H - 2, PAGE_W, 2).fill(GOLD)
  doc.fontSize(8).fillColor(GOLD)
     .text('MANUAL DE UTILIZAÇÃO', MARGIN, 60, { align: 'right', width: CONTENT_W })
  doc.fontSize(7).fillColor('#888')
     .text('Orçamento de Obra · CRM Somnium', MARGIN, 72, { align: 'right', width: CONTENT_W })
}

function drawPageFooter() {
  doc.rect(0, FOOTER_Y - 6, PAGE_W, 50).fill(BLACK)
  doc.rect(0, FOOTER_Y - 6, PAGE_W, 2).fill(GOLD)
  doc.fontSize(7).fillColor(GOLD)
     .text('SOMNIUM PROPERTIES · Coimbra, Portugal · Documento interno',
           MARGIN, FOOTER_Y + 6, { align: 'center', width: CONTENT_W })
}

function newPage() {
  doc.addPage()
  drawPageHeader()
  drawPageFooter()
  doc.y = HEADER_H + 20
  pageHasHeader = true
}

// Pede `needed` pixels verticais. Se não couberem, abre nova página.
// Retorna o Y de partida para desenhar.
function ensureSpace(needed) {
  if (!pageHasHeader) {
    newPage()
  } else if (doc.y + needed > FOOTER_Y - 20) {
    newPage()
  }
  return doc.y
}

// ── Components ────────────────────────────────────────────
function h1(texto) {
  ensureSpace(50)
  doc.moveDown(0.3)
  const y = doc.y
  doc.fontSize(18).fillColor(BLACK).text(texto, MARGIN, y)
  doc.moveTo(MARGIN, doc.y + 4).lineTo(MARGIN + 50, doc.y + 4).strokeColor(GOLD).lineWidth(2).stroke()
  doc.moveDown(1)
}

function h2(texto) {
  ensureSpace(36)
  doc.moveDown(0.4)
  doc.fontSize(13).fillColor(BLACK).text(texto, MARGIN, doc.y)
  doc.moveDown(0.4)
}

function h3(texto) {
  ensureSpace(26)
  doc.moveDown(0.3)
  doc.fontSize(10).fillColor(GOLD).text(texto.toUpperCase(), MARGIN, doc.y, { characterSpacing: 1 })
  doc.moveDown(0.3)
}

function p(texto, opts = {}) {
  const altura = doc.heightOfString(texto, { width: CONTENT_W, fontSize: 10, ...opts })
  ensureSpace(altura + 6)
  doc.fontSize(10).fillColor('#222').text(texto, MARGIN, doc.y, {
    align: 'justify', width: CONTENT_W, lineGap: 2, ...opts,
  })
  doc.moveDown(0.5)
}

function pSmall(texto) {
  const altura = doc.heightOfString(texto, { width: CONTENT_W, fontSize: 9 })
  ensureSpace(altura + 4)
  doc.fontSize(9).fillColor(GRAY).text(texto, MARGIN, doc.y, { width: CONTENT_W, lineGap: 2 })
  doc.moveDown(0.4)
}

function bullet(texto, opts = {}) {
  const altura = doc.heightOfString(texto, { width: CONTENT_W - 14, fontSize: 10 })
  ensureSpace(altura + 6)
  const startY = doc.y
  doc.fontSize(10).fillColor(GOLD).text('•', MARGIN, startY)
  doc.fontSize(10).fillColor(opts.cor || '#222').text(texto, MARGIN + 14, startY, {
    width: CONTENT_W - 14, lineGap: 2,
  })
  doc.moveDown(0.3)
}

function callout(titulo, texto, cor = GOLD) {
  const textoH = doc.heightOfString(texto, { width: CONTENT_W - 24, fontSize: 10 })
  const altura = textoH + 32
  ensureSpace(altura + 8)
  const y = doc.y
  doc.rect(MARGIN, y, CONTENT_W, altura).fillAndStroke('#FFF8E7', cor)
  doc.fontSize(9).fillColor(cor).text(titulo.toUpperCase(), MARGIN + 12, y + 9, { characterSpacing: 1 })
  doc.fontSize(10).fillColor('#333').text(texto, MARGIN + 12, y + 24, {
    width: CONTENT_W - 24, lineGap: 2,
  })
  doc.y = y + altura + 8
}

function box(titulo, linhas) {
  // Pre-calcular altura
  let alt = 28
  for (const l of linhas) {
    alt += doc.heightOfString(l.texto, { width: CONTENT_W - 20, fontSize: 10 }) + 6
  }
  ensureSpace(alt + 10)
  const y = doc.y
  doc.rect(MARGIN, y, CONTENT_W, 24).fill(BLACK)
  doc.fontSize(10).fillColor(GOLD).text(titulo, MARGIN + 12, y + 7, { characterSpacing: 1 })
  doc.y = y + 28
  for (const l of linhas) {
    doc.fontSize(10).fillColor('#222').text(l.texto, MARGIN + 8, doc.y, { width: CONTENT_W - 16, lineGap: 2 })
    doc.moveDown(0.3)
  }
  doc.moveDown(0.5)
}

function tabela(rows, larguraColunas) {
  const widths = larguraColunas.map(w => w * CONTENT_W)
  const headerH = 24
  const rowH = 22

  ensureSpace(headerH + rowH + 4)

  let y = doc.y
  // Header
  doc.rect(MARGIN, y, CONTENT_W, headerH).fill(BLACK)
  let x = MARGIN
  for (let i = 0; i < rows[0].length; i++) {
    doc.fontSize(8).fillColor(GOLD).text(rows[0][i], x + 6, y + 8, { width: widths[i] - 12, characterSpacing: 0.5 })
    x += widths[i]
  }
  y += headerH

  for (let r = 1; r < rows.length; r++) {
    if (y + rowH > FOOTER_Y - 20) {
      newPage()
      y = doc.y
      // re-desenhar header em nova página
      doc.rect(MARGIN, y, CONTENT_W, headerH).fill(BLACK)
      x = MARGIN
      for (let i = 0; i < rows[0].length; i++) {
        doc.fontSize(8).fillColor(GOLD).text(rows[0][i], x + 6, y + 8, { width: widths[i] - 12, characterSpacing: 0.5 })
        x += widths[i]
      }
      y += headerH
    }
    if (r % 2 === 1) doc.rect(MARGIN, y, CONTENT_W, rowH).fill(LIGHT)
    x = MARGIN
    for (let i = 0; i < rows[r].length; i++) {
      doc.fontSize(8.5).fillColor('#222').text(rows[r][i] || '', x + 6, y + 6, { width: widths[i] - 12 })
      x += widths[i]
    }
    y += rowH
  }
  doc.moveTo(MARGIN, y).lineTo(MARGIN + CONTENT_W, y).strokeColor('#ccc').lineWidth(0.5).stroke()
  doc.y = y + 10
}

// Imagem com legenda — calcula altura, salta página se preciso
function imagemLegendada(filePath, legenda, opts = {}) {
  if (!existsSync(filePath)) {
    pSmall(`[imagem em falta: ${path.basename(filePath)}]`)
    return
  }
  const maxW = opts.maxW ?? CONTENT_W
  const ratio = opts.ratio ?? 0.55  // razão altura/largura (varia conforme shot)
  const imgH = maxW * ratio
  const totalH = imgH + (legenda ? 22 : 0) + 10
  ensureSpace(totalH + 4)
  const y = doc.y
  doc.image(filePath, MARGIN + (CONTENT_W - maxW) / 2, y, { width: maxW })
  doc.y = y + imgH + 4
  if (legenda) {
    doc.fontSize(8).fillColor(GRAY).text(legenda, MARGIN, doc.y, {
      align: 'center', width: CONTENT_W, oblique: true,
    })
    doc.moveDown(0.6)
  }
}

// ════════════════════════════════════════════════════════════
// CAPA (sem header/footer normal)
// ════════════════════════════════════════════════════════════
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
doc.fontSize(11).fillColor('#999').text('Guia de utilização e referência fiscal', 0, 540, { align: 'center', width: PAGE_W })
doc.fontSize(9).fillColor('#666').text('Para o Gestor de Obra', 0, 730, { align: 'center', width: PAGE_W })
doc.fontSize(8).fillColor('#666').text('Versão 3.0 · Maio 2026', 0, 745, { align: 'center', width: PAGE_W })
pageHasHeader = false  // capa não conta

// ════════════════════════════════════════════════════════════
// CONTEÚDO
// ════════════════════════════════════════════════════════════

// 1. Visão geral
h1('1. Visão geral')
p('A aba "Obra" do CRM Somnium é a ferramenta oficial para construir o orçamento detalhado de cada imóvel da carteira. Substitui o ficheiro Word tradicional e oferece três vantagens fundamentais.')
bullet('Cálculo automático em tempo real — sem erros aritméticos. O sistema soma cada linha, aplica o IVA correcto e produz o total bruto.')
bullet('Conformidade fiscal portuguesa — separa material e mão-de-obra, aplica autoliquidação e retenção IRS conforme o caso, prepara o orçamento para auditoria contabilística.')
bullet('Sincronização com o resto do CRM — o total geral alimenta automaticamente o campo "Custo estimado de obra" da ficha do imóvel e a aba "Análise Financeira".')

callout('IMPORTANTE',
  'O orçamento é guardado automaticamente à medida que escreve. Não existe botão "Guardar". Se vir o indicador "A guardar" no topo, significa que o sistema está a sincronizar — não feche a página antes de aparecer "Guardado".',
  GOLD)

imagemLegendada(SHOTS.header, 'Vista geral do topo da aba Obra: header com nome do imóvel, regime fiscal, KPIs em tempo real e chips de navegação rápida.', { maxW: CONTENT_W, ratio: 0.42 })

// 2. Acesso à aba Obra
h2('2. Acesso à aba Obra')
bullet('Entrar no CRM e abrir o módulo "CRM > Pipeline Imóveis".')
bullet('Clicar no nome do imóvel para abrir a ficha de detalhe.')
bullet('Selecionar o separador "Obra" — está entre "Localização" e "Análise Financeira".')

// 3. Conceitos fundamentais
h1('3. Conceitos fundamentais')

h3('Pisos')
p('Antes de preencher qualquer secção, defina os pisos do imóvel no topo do separador. Cada piso tem nome (R/C, 1º Andar, Sótão, Cave, etc.), área em m² e descrição opcional. Algumas secções (eletricidade, pavimento, pladur, pintura) replicam os campos por piso automaticamente.')

imagemLegendada(SHOTS.pisos, 'Painel "Definições" (regime fiscal e BDI) e gestão de pisos. Cada piso adicionado fica disponível para todas as secções por m².', { maxW: CONTENT_W, ratio: 0.55 })

h3('Secções')
p('O orçamento está dividido em 17 secções pré-definidas. Cada secção tem campos guiados e uma tabela de "linhas livres" onde pode adicionar tudo o que for específico desta obra.')

const seccoesLista = [
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
ensureSpace(seccoesLista.length * 14 + 12)
for (const [a, b] of seccoesLista) {
  const y = doc.y
  doc.fontSize(9).fillColor('#333').text(a, MARGIN, y, { width: CONTENT_W / 2 - 8 })
  if (b) doc.fontSize(9).fillColor('#333').text(b, MARGIN + CONTENT_W / 2, y, { width: CONTENT_W / 2 - 8 })
  doc.moveDown(0.2)
}
doc.moveDown(0.5)

h3('Linhas')
p('Cada linha pode ter componente material e/ou mão-de-obra, cada uma com a sua taxa de IVA. Material com bordas azuis e badge "Mat.", MO com bordas verdes e badge "MO".')

// 4. Regime fiscal
h1('4. Regime fiscal e taxas de IVA')
p('Antes de começar, escolha o regime fiscal aplicável no painel "Definições". O regime determina a taxa de IVA por defeito da mão-de-obra.')

box('Normal (23%)', [
  { texto: 'Aplicável a obras que não cumpram requisitos das verbas reduzidas. IVA 23% generalizado em material e MO.' },
])

box('Reabilitação ARU — Verba 2.27 da Lista I do CIVA (6%)', [
  { texto: 'Empreitadas de reabilitação urbana sobre imóveis em ARU (Áreas de Reabilitação Urbana). Coimbra tem várias ARU activas (Centro Histórico, Baixa, Santa Clara, etc.).' },
  { texto: 'A taxa 6% aplica-se a TODA a empreitada (material + MO incorporados), desde que cumpridos os requisitos.' },
])

callout('REQUISITOS PARA APLICAR A VERBA 2.27',
  '1. Imóvel localizado dentro de uma ARU (verificar na Câmara Municipal).\n' +
  '2. Operação enquadrada como "reabilitação urbana".\n' +
  '3. Declaração escrita do dono da obra ao empreiteiro a atestar destino.\n' +
  '4. Certificação municipal ou pelo IHRU.\n\n' +
  'Sem estes documentos, a Verba 2.27 não pode ser invocada — IVA volta a 23%.',
  RED)

box('Habitação — Verba 2.32 (6% com regra dos 20%)', [
  { texto: 'Empreitadas de beneficiação ou remodelação em imóveis afectos a habitação. Taxa 6% no global SE o valor dos materiais incorporados não exceder 20% do valor total.' },
  { texto: 'O sistema calcula automaticamente o rácio material/empreitada e avisa quando ultrapassar 15% (laranja) ou 20% (vermelho — perda do benefício).' },
])

imagemLegendada(SHOTS.aviso, 'Aviso vermelho automático quando a regra dos 20% da Verba 2.32 é violada. O sistema recalcula tudo a 23%.', { maxW: CONTENT_W, ratio: 0.45 })

callout('PERDA DO BENEFÍCIO',
  'Se o rácio de materiais ultrapassar 20% em regime Habitação (Verba 2.32), o sistema recalcula tudo a 23% e marca o estado como "Benefício perdido". Para manter 6%, reduza a fracção de material ou separe linhas para outro orçamento.',
  RED)

box('RJRU (DL 53/2014) — IMT/IMI sem alterar IVA', [
  { texto: 'Regime Jurídico da Reabilitação Urbana. Não altera o IVA da empreitada (continua 23%) mas pode dar isenção/redução de IMT na compra e IMI no primeiro ano. Esta secção é informativa para o contabilista.' },
])

h3('Honorários sempre a 23%')
p('Independentemente do regime, honorários (projecto, TRO, fiscalização, SCE, solicitador) são sempre a 23% — não estão abrangidos pelas verbas reduzidas. O sistema aplica esta regra automaticamente.')

h3('Taxas e seguros')
p('Taxas municipais e livro de obra: fora do campo IVA (artigo 2º nº 2 CIVA). Seguros (CAR — Construction All Risks): isentos pelo artigo 9º CIVA. O sistema aplica IVA 0% nestes itens automaticamente.')

// 5. Estrutura
h1('5. Estrutura da aba')
p('A aba está organizada em 4 zonas, do topo para o fundo:')
bullet('Header sticky — nome do imóvel, regime fiscal, indicador "A guardar / Guardado", botões "Definições" e "Exportar PDF". Permanece visível durante a scroll.')
bullet('KPIs em barra — quatro indicadores actualizados em tempo real: Base, IVA liquidado, A pagar e Total bruto.')
bullet('Chips de navegação — clique num chip para ir directamente a essa secção. Os chips com bola indicam secções já preenchidas.')
bullet('Conteúdo principal — pisos, notas globais, 17 secções colapsáveis, decomposição por tipo, resumo fiscal.')
bullet('Total bruto sticky — barra preta no rodapé, sempre visível.')

// 6. Como preencher
h1('6. Como preencher um orçamento')
h3('Passo 1 — Configurar o regime fiscal')
p('Clique em "Definições" e escolha o regime aplicável. Confira documentos de suporte com o sócio responsável antes de aplicar Verba 2.27 ou 2.32.')

h3('Passo 2 — Adicionar os pisos')
p('Na secção "Pisos do imóvel" introduza cada piso (R/C, 1º Andar, etc.) com a área em m². Pode usar pré-sets clicando na seta do campo "Nome".')

h3('Passo 3 — Preencher as secções')
p('Para cada secção pode usar duas formas, em alternativa ou em conjunto:')
bullet('Campos guiados — preencher os campos pré-definidos (m², €/m², dias × €/dia, etc.). Cada campo tem badge "Mat." (azul) ou "MO" (verde) que indica se é material ou mão-de-obra. O sistema aplica a taxa IVA automaticamente.')
bullet('Linhas livres — usar a tabela "Linhas livres" para adicionar itens que não cabem nos campos guiados. Cada linha permite escolher livremente o IVA do material e da MO.')

imagemLegendada(SHOTS.seccao, 'Exemplo de secção aberta (Pavimento). Em cima: campos guiados por piso (m², €/m² material, €/m² MO). Em baixo: tabela de linhas livres com IVA configurável por componente.', { maxW: CONTENT_W, ratio: 0.85 })

h3('Passo 4 — BDI (opcional)')
p('Em "Definições" introduza percentagens de imprevistos e margem do empreiteiro. O sistema aplica sobre a base de obra (excluindo licenciamento) e adiciona ao total.')

h3('Passo 5 — Validar avisos fiscais')
p('Se aparecerem avisos (caixas amarelas, laranjas ou vermelhas), leia-os e tome a acção sugerida.')

h3('Passo 6 — Exportar PDF')
p('Clique em "Exportar PDF" no topo. O documento gerado replica fielmente o formato tradicional do gestor de obra com o cabeçalho da Somnium.')

// 7. Linhas livres
h1('7. Linhas livres editáveis')
p('No fundo de cada uma das 17 secções existe uma "Tabela de linhas livres" — total liberdade ao gestor: adicionar quantas linhas quiser, com qualquer descrição, qtd, unidade, preço unitário e taxa IVA.')

h3('Estrutura de cada linha')
const tabLinha = [
  ['Coluna', 'Tipo', 'Descrição'],
  ['Descrição', 'Texto livre', 'Nome do item, ex: "Carpinteiro especializado"'],
  ['Qtd', 'Número', 'Quantidade — usar 1 para itens fixos'],
  ['Unidade', 'Lista', 'un, m², m, m³, h, dias, vg (verba global), kg'],
  ['€/un mat', 'Número', 'Preço unitário do componente material (sem IVA)'],
  ['IVA mat', 'Lista', '0 / 6 / 13 / 23% — IVA do material'],
  ['€/un MO', 'Número', 'Preço unitário da componente mão-de-obra (sem IVA)'],
  ['IVA MO', 'Lista', '0 / 6 / 13 / 23% — IVA da MO (default segue regime)'],
  ['Auto.', 'Checkbox', 'MO em autoliquidação (entre sujeitos passivos)'],
  ['Ret. IRS', 'Lista', '0 / 11.5 / 25% — retenção se prestador singular'],
]
tabela(tabLinha, [0.18, 0.16, 0.66])

h3('Quando usar linhas livres')
bullet('O item não tem campo guiado (ex: "Recuperação de cantaria histórica")')
bullet('Quer separar uma despesa em sub-itens com IVAs diferentes')
bullet('Tem um fornecedor com factura própria (ex: "Equipamento Bosch importado, IVA 23%")')
bullet('Tem um sub-empreiteiro com regime especial (autoliquidação, retenção 11.5%)')

callout('LIBERDADE TOTAL',
  'Os campos guiados são uma comodidade — toda a obra pode ser feita exclusivamente com linhas livres. O motor de cálculo trata ambos da mesma forma.',
  GOLD)

// 8. IVA por linha
h1('8. IVA por linha — material vs mão-de-obra')
p('Cada linha do orçamento pode ter dois componentes — material e mão-de-obra — e cada um pode ter a sua própria taxa IVA.')

h3('Convenção visual')
bullet('Inputs com contorno azul + badge "Mat." → componente material')
bullet('Inputs com contorno verde + badge "MO" → componente mão-de-obra')

h3('Taxas por defeito')
const tabIva = [
  ['Componente', 'Normal', 'ARU', 'Habitação', 'Honorários'],
  ['Material', '23%', '6%*', '6%* (regra 20%)', '—'],
  ['MO', '23%', '6%', '6%', '—'],
  ['Honorários', '—', '—', '—', '23% (sempre)'],
  ['Taxas', '—', '—', '—', '0% (fora IVA)'],
  ['Seguros', '—', '—', '—', '0% (isento)'],
]
tabela(tabIva, [0.20, 0.20, 0.20, 0.20, 0.20])
pSmall('* Em ARU, a Verba 2.27 aplica 6% a toda a empreitada. Em Habitação Verba 2.32, 6% é mantido apenas se o material não exceder 20%.')

h3('Quando alterar manualmente o IVA')
bullet('Equipamento importado por empresa exterior à empreitada — fica a 23% mesmo em ARU.')
bullet('Subcontratação especial não enquadrada na verba reduzida.')
bullet('Honorários esporádicos no meio de uma secção (mantêm sempre 23%).')

callout('REGRA PRÁTICA',
  'Em caso de dúvida, deixe os IVAs como o sistema sugere. Confirme com o contabilista no fecho do orçamento.',
  GOLD)

// 9. Autoliquidação e retenções
h1('9. Autoliquidação e retenções IRS')

h3('Autoliquidação (al. j) art 2º nº 1 CIVA)')
p('Aplica-se em serviços de construção civil entre dois sujeitos passivos de IVA. A factura sai sem IVA com a menção "IVA — autoliquidação" e é o adquirente (a Somnium) que liquida e deduz o IVA.')
p('Para marcar uma linha em autoliquidação:')
bullet('Linhas livres — checkbox "Auto." na coluna respectiva.')
bullet('Campos guiados — checkbox "Autoliquidação MO" no painel "Override secção" no topo de cada secção.')

h3('Retenções IRS (art 101º CIRS)')
p('Aplica-se quando o prestador é pessoa singular em regime categoria B (serviços). A retenção é descontada ao pagamento e entregue à AT mensalmente.')

const tabRet = [
  ['Taxa', 'Aplicação típica'],
  ['0%', 'Prestador colectivo (Lda, SA) ou singular isento'],
  ['11.5%', 'Sub-empreiteiro singular em construção civil (verificar tabela actual)'],
  ['25%', 'Honorários singulares (categoria B serviços profissionais)'],
]
tabela(tabRet, [0.15, 0.85])

callout('IMPORTANTE',
  'A obrigação declarativa (DMR mensal, Modelo 30) é da contabilidade. As retenções calculadas pelo sistema devem ser confirmadas com o contabilista antes da emissão de facturas.',
  GOLD)

// 10. Decomposição por tipo
h1('10. Decomposição por tipo fiscal')
p('Abaixo das 17 secções, o sistema apresenta um quadro "Decomposição por tipo fiscal" que agrega todas as linhas por categoria. É a forma mais rápida de identificar onde está a maior fatia do orçamento e validar conformidade.')

imagemLegendada(SHOTS.fiscal, 'Quadro "Decomposição por tipo fiscal" e "Resumo fiscal" com total bruto sticky no rodapé. Mostra simultaneamente bases por categoria, IVA, autoliquidação, retenções e o total final.', { maxW: CONTENT_W, ratio: 0.78 })

h3('Categorias agregadas')
bullet('Material (azul) — todas as linhas marcadas como material')
bullet('Mão-de-obra (verde) — todas as linhas marcadas como MO')
bullet('Serviços auxiliares (âmbar) — demolições, RCD, andaimes')
bullet('Honorários (roxo) — projecto, TRO, fiscalização, SCE, solicitador')
bullet('Taxas (cinzento) — taxas municipais, livro de obra (sem IVA)')
bullet('Isento (cinzento) — seguros (art 9º CIVA)')
bullet('Misto (cinzento) — linhas legadas não decompostas')

h3('Rácio material / empreitada')
p('Indicador percentual no fundo do quadro. Verde até 15%, âmbar 15-20%, vermelho >20% em regime Habitação (benefício perdido).')

// 11. BDI
h2('11. BDI — imprevistos e margem')
p('BDI (Benefícios e Despesas Indirectas) é a percentagem aplicada sobre a base de obra para cobrir riscos não previstos e margem comercial. No painel "Definições" introduza:')
bullet('Imprevistos (%) — tipicamente 8 a 15% para reabilitações.')
bullet('Margem (%) — varia consoante a operação.')
p('O cálculo aplica sobre a base de obra (excluindo licenciamento) e tem o IVA do regime aplicado por cima.')

// 12. Exportação
h2('12. Exportação para PDF')
p('Ao clicar em "Exportar PDF" o sistema gera um documento profissional com cabeçalho Somnium, composição por piso, notas globais, avisos fiscais activos, todas as secções com linhas, subtotais por secção e por tipo, resumo fiscal final e total bruto destacado.')
p('O PDF abre numa nova aba do navegador. Pode descarregar, imprimir ou enviar por email aos investidores e fornecedores.')

// 13. Boas práticas
h1('13. Boas práticas')
bullet('Comece sempre pelos pisos. Sem pisos definidos, secções como pavimento e pladur não conseguem replicar campos por piso.')
bullet('Use linhas livres para tudo o que for específico. Os campos guiados são template; a flexibilidade está nas linhas livres.')
bullet('Confirme o regime fiscal com o contabilista ANTES de finalizar. Mudar de regime no fim é trivial mas muda todos os totais.')
bullet('Documente decisões nos campos "Notas". Cada secção tem campo livre — registe premissas, fornecedores, datas-chave.')
bullet('Verifique o rácio material/empreitada se for usar Verba 2.32. Se >18% inicial, considere antes Verba 2.27 (ARU) que não tem este tecto.')
bullet('Aproveite a coluna "Ret. IRS" para sub-empreiteiros singulares. Sem isto, a contabilidade vai ter de fazer ajustes manuais.')
bullet('Revise os cálculos antes de exportar. O resumo fiscal mostra todos os números em destaque.')

// 14. Erros comuns
h1('14. Erros comuns a evitar')

callout('ERRO 1 — Verba 2.27 sem documentação',
  'Aplicar regime ARU sem ter declaração do dono da obra ou certificação ARU. Em inspecção da AT, o IVA reduzido é desclassificado e a empresa paga o diferencial 17% (de 6% para 23%) com juros e coima.',
  RED)

callout('ERRO 2 — Esquecer autoliquidação em sub-empreiteiros',
  'Pagar IVA 23% a um sub-empreiteiro de construção civil que devia estar em autoliquidação. Resultado: IVA pago duas vezes (factura + Estado pelo adquirente).',
  RED)

callout('ERRO 3 — Não separar honorários',
  'Misturar honorários (projecto, TRO) com IVA 6%. Honorários são sempre 23% e nunca abrangidos pelas verbas reduzidas. Use sempre a secção 17 "Licenciamento" para estes itens.',
  RED)

callout('ERRO 4 — Materiais isolados em ARU',
  'Material adquirido isoladamente (sem MO incorporada) não beneficia da Verba 2.27. Se compra electrodomésticos por fornecedor distinto do empreiteiro, fica a 23%. O sistema permite override no IVA do material.',
  RED)

callout('ERRO 5 — Esquecer o BDI',
  'Apresentar orçamento ao investidor sem imprevistos nem margem. O total fica subestimado e a derrapagem é quase certa. Use sempre 8-15% de imprevistos como mínimo.',
  RED)

// 15. Glossário
h1('15. Glossário fiscal')
const termos = [
  ['ARU', 'Área de Reabilitação Urbana — zona delimitada pelo município onde se aplica a Verba 2.27 (IVA 6%).'],
  ['Autoliquidação', 'Regime do CIVA art 2º nº1 al. j) onde, em serviços de construção civil entre sujeitos passivos, é o adquirente que liquida o IVA. Factura sem IVA.'],
  ['BDI', 'Benefícios e Despesas Indirectas — percentagem sobre a base para cobrir imprevistos e margem do empreiteiro.'],
  ['Bruto fiscal', 'Soma da base com todo o IVA liquidado (incluindo autoliquidado). Não é o que se paga aos prestadores — é o "valor fiscal".'],
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
  ['Verba 2.32', 'Taxa IVA 6% para empreitadas em imóveis de habitação. Sujeita à regra dos 20% de materiais.'],
]
for (const [termo, def] of termos) {
  ensureSpace(28)
  doc.fontSize(10).fillColor(GOLD).text(termo, MARGIN, doc.y)
  doc.fontSize(9).fillColor('#222').text(def, MARGIN, doc.y, { width: CONTENT_W, lineGap: 1.5 })
  doc.moveDown(0.4)
}

// Fecho
ensureSpace(120)
doc.moveDown(2)
doc.moveTo(PAGE_W / 2 - 60, doc.y).lineTo(PAGE_W / 2 + 60, doc.y).strokeColor(GOLD).lineWidth(1).stroke()
doc.moveDown(1)
doc.fontSize(11).fillColor(BLACK).text('SOMNIUM PROPERTIES', MARGIN, doc.y, { align: 'center', width: CONTENT_W })
doc.fontSize(9).fillColor(GRAY).text('Coimbra, Portugal', MARGIN, doc.y, { align: 'center', width: CONTENT_W })
doc.moveDown(2)
doc.fontSize(8).fillColor('#999')
   .text('Versão 3.0 — Maio 2026 · Documento interno · Não redistribuir externamente sem autorização',
         MARGIN, doc.y, { align: 'center', width: CONTENT_W })

doc.end()
console.log(`✓ Manual gerado: ${OUT_PATH}`)
