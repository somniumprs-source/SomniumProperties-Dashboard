/**
 * PDF do orçamento de obra v2 — auditável fiscalmente.
 * Mostra cada linha com base, taxa IVA, autoliquidação e retenção.
 * Cabeçalho indica regime fiscal (Normal / ARU 2.27 / Habitação 2.32 / RJRU).
 * Quadro fiscal final separa: total base, IVA liquidado, IVA autoliquidado,
 * retenções IRS, total a pagar.
 */
import PDFDocument from 'pdfkit'
import { readFileSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { calcOrcamentoObra, validarOrcamento, REGIMES_FISCAIS, SECCOES_ORDEM, SECCOES_LABELS } from './orcamentoObraEngine.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const LOGO_PATH = path.resolve(__dirname, '../../public/logo-transparent.png')

const GOLD  = '#C9A84C'
const BLACK = '#0d0d0d'
const GRAY  = '#666666'
const LIGHT = '#F0EDE5'
const RED   = '#b91c1c'

const EUR = v => {
  if (v == null || !Number.isFinite(Number(v))) return '—'
  return new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(v)
}
const num = v => Number.isFinite(Number(v)) ? Number(v) : 0
const parseJson = (v, fb) => {
  if (v == null) return fb
  if (typeof v === 'object') return v
  try { return JSON.parse(v) } catch { return fb }
}

export function generateOrcamentoObraPDF(imovel, orcamentoRow, stream) {
  const doc = new PDFDocument({ size: 'A4', margins: { top: 40, bottom: 50, left: 50, right: 50 } })
  doc.pipe(stream)

  const pisos   = parseJson(orcamentoRow.pisos, [])
  const seccoes = parseJson(orcamentoRow.seccoes, {})
  const bdi     = parseJson(orcamentoRow.bdi, {})
  const ivaPerc = num(orcamentoRow.iva_perc ?? 23)
  const regime  = orcamentoRow.regime_fiscal || 'normal'

  const orcamento = { pisos, seccoes, iva_perc: ivaPerc, regime_fiscal: regime, bdi }
  const calc = calcOrcamentoObra(orcamento)
  const avisos = validarOrcamento(orcamento)

  const regimeMeta = REGIMES_FISCAIS.find(r => r.key === regime) || REGIMES_FISCAIS[0]

  // ── Header ─────────────────────────────────────────────────
  doc.rect(0, 0, doc.page.width, 110).fill(BLACK)
  try {
    const logoData = readFileSync(LOGO_PATH)
    doc.image(logoData, 50, 25, { height: 50 })
  } catch {
    doc.fontSize(16).fillColor(GOLD).text('SOMNIUM PROPERTIES', 50, 40)
  }
  doc.rect(0, 108, doc.page.width, 2).fill(GOLD)
  doc.fontSize(10).fillColor(GOLD).text('ORÇAMENTO DE OBRA', 50, 80, { align: 'right' })
  doc.fontSize(8).fillColor('#999')
     .text(new Date().toLocaleDateString('pt-PT', { day: '2-digit', month: 'long', year: 'numeric' }), 50, 92, { align: 'right' })

  let y = 130

  // ── Título do imóvel + regime fiscal ───────────────────────
  doc.fontSize(20).fillColor(BLACK).text(imovel.nome || 'Sem nome', 50, y)
  y += 28
  if (imovel.morada) {
    doc.fontSize(10).fillColor(GRAY).text(imovel.morada, 50, y)
    y += 18
  }

  // Badge do regime fiscal
  const regimeLabel = `Regime fiscal: ${regimeMeta.label}`
  const regimeW = doc.widthOfString(regimeLabel) + 16
  doc.roundedRect(50, y, regimeW, 20, 3).fill(GOLD)
  doc.fontSize(9).fillColor(BLACK).text(regimeLabel, 58, y + 5)
  y += 32

  // ── Pisos ──────────────────────────────────────────────────
  if (pisos.length > 0) {
    y = drawSectionHeader(doc, 'COMPOSIÇÃO POR PISO', y)
    for (const p of pisos) {
      const linha = `${p.nome || 'Piso'} — ${num(p.area_m2)} m²${p.descricao ? ' · ' + p.descricao : ''}`
      doc.fontSize(10).fillColor(BLACK).text(linha, 60, y, { width: 500 })
      y += 14
    }
    y += 6
  }

  // ── Notas livres ───────────────────────────────────────────
  if (orcamentoRow.notas) {
    y = drawSectionHeader(doc, 'NOTAS', y)
    doc.fontSize(9).fillColor(GRAY).text(orcamentoRow.notas, 60, y, { width: 480 })
    y = doc.y + 8
  }

  // ── Avisos ─────────────────────────────────────────────────
  if (avisos.length > 0) {
    y = drawSectionHeader(doc, 'AVISOS', y)
    for (const a of avisos) {
      y = checkPage(doc, y, 24)
      doc.fontSize(8).fillColor(a.tipo === 'aritmetica' ? RED : GRAY)
         .text(`• ${a.msg}`, 60, y, { width: 480 })
      y = doc.y + 4
    }
    y += 4
  }

  // ── Secções ────────────────────────────────────────────────
  for (const key of SECCOES_ORDEM) {
    const calcS = calc.seccoes[key]
    if (!calcS || calcS.linhas.length === 0) continue
    const label = SECCOES_LABELS[key] || key

    y = checkPage(doc, y, 80)
    y = drawSectionHeader(doc, label.toUpperCase(), y)

    for (const linha of calcS.linhas) {
      y = checkPage(doc, y, 22)
      desenhaLinha(doc, linha, y)
      y += 16
    }

    // Subtotal da secção
    y += 2
    doc.fontSize(9).fillColor(GOLD).text(`Subtotal ${label.toLowerCase()}`, 60, y)
    doc.fontSize(10).fillColor(BLACK).text(`Base ${EUR(calcS.subtotal_base)}`, 50, y, { width: 490, align: 'right' })
    y += 13
    if (calcS.subtotal_iva > 0) {
      doc.fontSize(8).fillColor(GRAY).text(`IVA liquidado: ${EUR(calcS.subtotal_iva)}`, 50, y, { width: 490, align: 'right' })
      y += 11
    }
    if (calcS.iva_autoliq > 0) {
      doc.fontSize(8).fillColor(GRAY).text(`IVA autoliquidado (adquirente): ${EUR(calcS.iva_autoliq)}`, 50, y, { width: 490, align: 'right' })
      y += 11
    }
    if (calcS.retencoes > 0) {
      doc.fontSize(8).fillColor(GRAY).text(`Retenção IRS: -${EUR(calcS.retencoes)}`, 50, y, { width: 490, align: 'right' })
      y += 11
    }
    y += 8
  }

  // ── BDI / Imprevistos / Margem ─────────────────────────────
  if (calc.bdi.imprevistos_base > 0 || calc.bdi.margem_base > 0) {
    y = checkPage(doc, y, 60)
    y = drawSectionHeader(doc, 'IMPREVISTOS E MARGEM (BDI)', y)
    if (calc.bdi.imprevistos_base > 0) {
      doc.fontSize(9).fillColor(BLACK).text(`Imprevistos (${calc.bdi.imprevistos_perc}%)`, 60, y)
      doc.fontSize(9).fillColor(BLACK).text(EUR(calc.bdi.imprevistos_base), 50, y, { width: 490, align: 'right' })
      y += 14
    }
    if (calc.bdi.margem_base > 0) {
      doc.fontSize(9).fillColor(BLACK).text(`Margem do empreiteiro (${calc.bdi.margem_perc}%)`, 60, y)
      doc.fontSize(9).fillColor(BLACK).text(EUR(calc.bdi.margem_base), 50, y, { width: 490, align: 'right' })
      y += 14
    }
    if (calc.bdi.iva > 0) {
      doc.fontSize(8).fillColor(GRAY).text(`IVA sobre BDI (${calc.bdi.taxa_iva}%): ${EUR(calc.bdi.iva)}`, 50, y, { width: 490, align: 'right' })
      y += 11
    }
    y += 8
  }

  // ── Quadro fiscal final ────────────────────────────────────
  y = checkPage(doc, y, 200)
  doc.rect(50, y, 500, 32).fill(LIGHT)
  doc.fontSize(11).fillColor(BLACK).text('RESUMO FISCAL', 60, y + 11)
  y += 38

  const t = calc.totais
  const linhasFiscais = [
    ['Base tributável (obra)',                  t.base_obra_com_bdi],
    ['Base tributável (licenciamento)',         t.base_licenciamento],
    ['Base total',                              t.base_geral, true],
    ['IVA liquidado',                           t.iva_geral],
    ['Bruto fiscal',                            t.bruto_geral, true],
    ['(-) IVA autoliquidado p/ adquirente',     t.iva_autoliquidado],
    ['(-) Retenções IRS a entregar AT',         t.retencoes_irs],
    ['= TOTAL A PAGAR PRESTADORES',             t.a_pagar, true],
  ]
  for (const row of linhasFiscais) {
    const [label, valor, destaque] = row
    if (!Number.isFinite(valor) || valor === 0) continue
    if (destaque) {
      doc.rect(50, y - 2, 500, 18).fill(LIGHT)
      doc.fontSize(10).fillColor(BLACK).text(label, 60, y + 2)
      doc.fontSize(11).fillColor(BLACK).text(EUR(valor), 50, y, { width: 490, align: 'right' })
    } else {
      doc.fontSize(9).fillColor(GRAY).text(label, 60, y + 2)
      doc.fontSize(9).fillColor(BLACK).text(EUR(valor), 50, y + 2, { width: 490, align: 'right' })
    }
    y += 18
  }

  y += 6

  // ── Total geral destacado ──────────────────────────────────
  y = checkPage(doc, y, 50)
  doc.rect(50, y, 500, 36).fill(BLACK)
  doc.fontSize(13).fillColor(GOLD).text('TOTAL ORÇAMENTO (BRUTO FISCAL)', 60, y + 12)
  doc.fontSize(16).fillColor(GOLD).text(EUR(calc.total_geral), 50, y + 10, { width: 490, align: 'right' })
  y += 50

  // ── Rodapé ─────────────────────────────────────────────────
  const footerY = doc.page.height - 40
  doc.rect(0, footerY - 8, doc.page.width, 40).fill(BLACK)
  doc.rect(0, footerY - 8, doc.page.width, 2).fill(GOLD)
  doc.fontSize(7).fillColor(GOLD)
     .text('SOMNIUM PROPERTIES · Coimbra, Portugal · Documento confidencial · Cumpre CIVA art 2º (autoliquidação) e CIRS art 101º (retenções)',
           50, footerY + 4, { align: 'center', width: doc.page.width - 100 })

  doc.end()
}

// ── Helpers ────────────────────────────────────────────────
function drawSectionHeader(doc, title, y) {
  y = checkPage(doc, y, 36)
  doc.rect(50, y, 500, 22).fill(BLACK)
  doc.fontSize(9).fillColor(GOLD).text(title, 60, y + 7, { characterSpacing: 1.2 })
  return y + 30
}

function desenhaLinha(doc, linha, y) {
  // Coluna 1: descrição (220px)
  doc.fontSize(9).fillColor(BLACK).text(linha.descricao, 60, y, { width: 220 })
  // Coluna 2: fórmula (140px)
  doc.fontSize(8).fillColor(GRAY).text(linha.formula || '', 285, y + 1, { width: 130 })
  // Coluna 3: base (60px right)
  doc.fontSize(9).fillColor(BLACK).text(EUR(linha.base), 425, y, { width: 60, align: 'right' })
  // Coluna 4: IVA% + valor IVA (60px right)
  const ivaTxt = linha.autoliquidacao
    ? `autoliq.`
    : (linha.taxa_iva > 0 ? `${linha.taxa_iva}% ${EUR(linha.iva)}` : 'isento')
  doc.fontSize(8).fillColor(linha.autoliquidacao ? GOLD : GRAY).text(ivaTxt, 490, y + 1, { width: 60, align: 'right' })
  // Linha 2 (eventuais retenções)
  if (linha.retencao_irs > 0) {
    doc.fontSize(7).fillColor(GRAY)
       .text(`Retenção IRS ${linha.retencao_irs}%: -${EUR(linha.retencao_valor)}`, 60, y + 12, { width: 480 })
  }
}

function checkPage(doc, y, needed) {
  if (y + needed > doc.page.height - 60) {
    doc.addPage()
    return 50
  }
  return y
}
