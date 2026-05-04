/**
 * Gera 3 variantes de capa com o logo maior (240px, ~150% do actual)
 * mas com posicionamentos verticais diferentes, para comparação:
 *  - Variante A: logo centrado verticalmente na página
 *  - Variante B: logo na zona superior com mais respiração (y≈200)
 *  - Variante C: logo bem no topo (y≈70), liberta espaço para conteúdo
 *
 * Output: /tmp/test-logo-variants.pdf (3 páginas)
 */
import PDFDocument from 'pdfkit'
import { createWriteStream } from 'fs'
import { LOGO_BLACK_PNG } from '../src/db/logoBlack.js'

const C = {
  gold: '#C9A84C', black: '#0d0d0d', body: '#2a2a2a', muted: '#888888',
}
const ML = 50, MR = 50
const PW = 595.28, PH = 841.89
const CW = PW - ML - MR
const NOW = () => new Date().toLocaleDateString('pt-PT', { day: '2-digit', month: 'long', year: 'numeric' })

const LOGO_W = 480
const LOGO_H = LOGO_W / (1516 / 614)  // ≈ 194.4

const TITLE = 'Dossier de Investimento'
const SUB = 'T2 SUB-CAVE LAGES · COIMBRA'
const SUBTITLE = 'Relatório de Investimento'

// Centrar bloco (logo+accent+title+sub+subtitle+date) na área útil entre
// a barra gold do topo (y=6) e o footer (y=PH-65). Bloco ≈ 381px de altura.
const BLOCK_H = LOGO_H + 35 + 1.5 + 25 + 37 + 15 + 13 + 12 + 13 + 25 + 0.5 + 15 + 12
const TOP_BAND = 6
const BOTTOM_BAND = PH - 65
const LOGO_Y = TOP_BAND + ((BOTTOM_BAND - TOP_BAND) - BLOCK_H) / 2

const variants = [
  {
    label: `B (dobro) — logo ${LOGO_W}px, bloco centrado vertical`,
    logoY: LOGO_Y,
    accentY: LOGO_Y + LOGO_H + 35,
    titleY: LOGO_Y + LOGO_H + 35 + 1.5 + 25,
    subY:   LOGO_Y + LOGO_H + 35 + 1.5 + 25 + 37 + 15,
    subtitleY: LOGO_Y + LOGO_H + 35 + 1.5 + 25 + 37 + 15 + 13 + 12,
  },
]

const doc = new PDFDocument({ size: 'A4', margin: 0, autoFirstPage: false })
doc.pipe(createWriteStream('/tmp/test-logo-variants.pdf'))

variants.forEach((v, i) => {
  doc.addPage({ size: 'A4', margins: { top: 0, bottom: 0, left: 0, right: 0 } })

  // Topo gold bar
  doc.rect(0, 0, PW, 6).fill(C.gold)

  // Etiqueta da variante (debug overlay)
  doc.fontSize(9).fillColor(C.gold).text(v.label, ML, 18, { width: CW, align: 'center', characterSpacing: 1 })

  // Logo (240px wide — 150% do tamanho actual de 160px)
  doc.image(LOGO_BLACK_PNG, (PW - LOGO_W) / 2, v.logoY, { width: LOGO_W })

  // Linha gold sob logo
  doc.rect(PW / 2 - 30, v.accentY, 60, 1.5).fill(C.gold)

  // Título
  doc.fontSize(28).fillColor(C.body).text(TITLE, ML, v.titleY, { width: CW, align: 'center' })

  // Subtítulo (nome · zona)
  doc.fontSize(10).fillColor(C.gold).text(SUB, ML, v.subY, { width: CW, align: 'center', characterSpacing: 1.5 })

  // Subtitle
  doc.fontSize(10).fillColor(C.muted).text(SUBTITLE + ' · Coimbra · Portugal', ML, v.subtitleY, { width: CW, align: 'center' })

  // Data
  doc.fontSize(9).fillColor(C.muted).text(NOW(), ML, v.subtitleY + 35, { width: CW, align: 'center' })

  // Footer
  doc.rect(ML, PH - 65, CW, 0.5).fill(C.gold)
  doc.fontSize(7).fillColor(C.muted).text('Somnium Properties · Investimento Imobiliário', ML, PH - 52, { width: CW, align: 'center' })
  doc.fontSize(7).fillColor(C.muted).text(`Documento Confidencial · ${NOW()}`, ML, PH - 40, { width: CW, align: 'center' })
  doc.rect(0, PH - 6, PW, 6).fill(C.gold)
})

doc.end()
console.log('✓ /tmp/test-logo-variants.pdf gerado (3 páginas)')
