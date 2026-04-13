/**
 * Gerador de relatório PDF profissional para imóveis.
 * Layout empresarial Somnium Properties com logo e dados completos.
 */
import PDFDocument from 'pdfkit'
import { readFileSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const LOGO_PATH = path.resolve(__dirname, '../../public/logo-transparent.png')

const GOLD = [201, 168, 76]
const BLACK = [13, 13, 13]
const WHITE = [255, 255, 255]
const GRAY = [100, 100, 100]
const LIGHT_GRAY = [240, 240, 236]

const EUR = v => {
  if (v == null || v === 0) return '—'
  return new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(v)
}

export function generateImovelPDF(imovel, analise = null) {
  const doc = new PDFDocument({ size: 'A4', margins: { top: 40, bottom: 40, left: 50, right: 50 } })
  const pageWidth = doc.page.width - 100 // margins

  // ── Header ────────────────────────────────────────────────
  doc.rect(0, 0, doc.page.width, 120).fill(rgbStr(BLACK))

  // Logo
  try {
    const logoData = readFileSync(LOGO_PATH)
    doc.image(logoData, 50, 20, { height: 50 })
  } catch {
    doc.fontSize(18).fillColor(rgbStr(GOLD)).text('SOMNIUM PROPERTIES', 50, 35)
  }

  // Gold line
  doc.rect(0, 118, doc.page.width, 2).fill(rgbStr(GOLD))

  // Title
  doc.fontSize(10).fillColor(rgbStr(GOLD)).text('RELATÓRIO DE IMÓVEL', 50, 80, { align: 'right' })
  doc.fontSize(8).fillColor('#666666').text(new Date().toLocaleDateString('pt-PT', { day: '2-digit', month: 'long', year: 'numeric' }), 50, 94, { align: 'right' })

  let y = 140

  // ── Property Name ─────────────────────────────────────────
  doc.fontSize(20).fillColor(rgbStr(BLACK)).text(imovel.nome || 'Sem nome', 50, y)
  y += 30

  // Subtitle with estado
  const estado = (imovel.estado || '').replace(/^\d+-/, '')
  if (estado) {
    doc.roundedRect(50, y, doc.widthOfString(estado) + 20, 22, 4).fill(rgbStr(GOLD))
    doc.fontSize(9).fillColor(rgbStr(BLACK)).text(estado.toUpperCase(), 60, y + 6)
    y += 35
  }

  // ── Info sections ─────────────────────────────────────────

  // Section: Informação Geral
  y = drawSectionHeader(doc, 'INFORMAÇÃO GERAL', y, pageWidth)
  const infoFields = [
    ['Tipologia', imovel.tipologia],
    ['Zona', imovel.zona],
    ['Zonas', tryParseJSON(imovel.zonas)],
    ['Origem', imovel.origem],
    ['Modelo de Negócio', imovel.modelo_negocio],
    ['Consultor', imovel.nome_consultor],
    ['Link', imovel.link],
  ].filter(([, v]) => v && v !== '—')
  y = drawFieldGrid(doc, infoFields, y, pageWidth)

  // Section: Valores
  y = drawSectionHeader(doc, 'VALORES', y + 10, pageWidth)
  const valFields = [
    ['Ask Price', EUR(imovel.ask_price)],
    ['Valor Proposta', EUR(imovel.valor_proposta)],
    ['Custo Estimado Obra', EUR(imovel.custo_estimado_obra)],
    ['Valor Venda Remodelado', EUR(imovel.valor_venda_remodelado)],
    ['ROI', imovel.roi > 0 ? `${imovel.roi}%` : '—'],
    ['ROI Anualizado', imovel.roi_anualizado > 0 ? `${imovel.roi_anualizado}%` : '—'],
    ['Área Útil', imovel.area_util > 0 ? `${imovel.area_util} m²` : '—'],
    ['Área Bruta', imovel.area_bruta > 0 ? `${imovel.area_bruta} m²` : '—'],
  ].filter(([, v]) => v && v !== '—')
  y = drawFieldGrid(doc, valFields, y, pageWidth)

  // Section: Datas
  const dateFields = [
    ['Data Adicionado', fmtDate(imovel.data_adicionado)],
    ['Data Chamada', fmtDate(imovel.data_chamada)],
    ['Data Visita', fmtDate(imovel.data_visita)],
    ['Data Estudo Mercado', fmtDate(imovel.data_estudo_mercado)],
    ['Data Proposta', fmtDate(imovel.data_proposta)],
    ['Data Proposta Aceite', fmtDate(imovel.data_proposta_aceite)],
    ['Data Follow Up', fmtDate(imovel.data_follow_up)],
  ].filter(([, v]) => v && v !== '—')

  if (dateFields.length > 0) {
    y = checkPage(doc, y, 100)
    y = drawSectionHeader(doc, 'CRONOLOGIA', y + 10, pageWidth)
    y = drawFieldGrid(doc, dateFields, y, pageWidth)
  }

  // Section: Análise de Rentabilidade
  if (analise) {
    y = checkPage(doc, y, 200)
    y = drawSectionHeader(doc, 'ANÁLISE DE RENTABILIDADE', y + 10, pageWidth)

    const anaFields = [
      ['Valor Compra', EUR(analise.compra)],
      ['Custo Obra', EUR(analise.obra)],
      ['VVR', EUR(analise.vvr)],
      ['Capital Necessário', EUR(analise.capital_necessario)],
      ['Lucro Bruto', EUR(analise.lucro_bruto)],
      ['Lucro Líquido', EUR(analise.lucro_liquido)],
      ['Retorno Total', analise.retorno_total > 0 ? `${analise.retorno_total}%` : '—'],
      ['Retorno Anualizado', analise.retorno_anualizado > 0 ? `${analise.retorno_anualizado}%` : '—'],
      ['Cash-on-Cash', analise.cash_on_cash > 0 ? `${analise.cash_on_cash}%` : '—'],
      ['Prazo (meses)', analise.meses > 0 ? `${analise.meses}` : '—'],
    ].filter(([, v]) => v && v !== '—')
    y = drawFieldGrid(doc, anaFields, y, pageWidth)
  }

  // Section: Notas
  if (imovel.notas) {
    y = checkPage(doc, y, 100)
    y = drawSectionHeader(doc, 'NOTAS', y + 10, pageWidth)
    doc.fontSize(9).fillColor('#333333')
    doc.text(imovel.notas, 50, y + 5, { width: pageWidth })
    y = doc.y + 10
  }

  // Section: Motivo de Descarte
  if (imovel.motivo_descarte) {
    y = checkPage(doc, y, 60)
    y = drawSectionHeader(doc, 'MOTIVO DE DESCARTE', y + 10, pageWidth)
    doc.fontSize(9).fillColor('#ef4444')
    doc.text(imovel.motivo_descarte, 50, y + 5, { width: pageWidth })
    y = doc.y + 10
  }

  // ── Footer ────────────────────────────────────────────────
  const footerY = doc.page.height - 40
  doc.rect(0, footerY - 5, doc.page.width, 45).fill(rgbStr(BLACK))
  doc.rect(0, footerY - 5, doc.page.width, 2).fill(rgbStr(GOLD))
  doc.fontSize(7).fillColor(rgbStr(GOLD))
    .text('SOMNIUM PROPERTIES', 50, footerY + 5)
  doc.fontSize(7).fillColor('#666666')
    .text('Documento gerado automaticamente · Confidencial', 50, footerY + 5, { align: 'right' })
  doc.fontSize(7).fillColor('#444444')
    .text(`Ref: ${imovel.id?.slice(0, 8) || '—'} · ${new Date().toISOString().slice(0, 10)}`, 50, footerY + 16)

  doc.end()
  return doc
}

// ── Drawing helpers ─────────────────────────────────────────

function drawSectionHeader(doc, title, y, pageWidth) {
  doc.rect(50, y, pageWidth, 24).fill(rgbStr(BLACK))
  doc.fontSize(9).fillColor(rgbStr(GOLD)).text(title, 62, y + 7, { characterSpacing: 1.5 })
  return y + 32
}

function drawFieldGrid(doc, fields, y, pageWidth) {
  const colWidth = pageWidth / 2
  const rowHeight = 36

  for (let i = 0; i < fields.length; i += 2) {
    y = checkPage(doc, y, rowHeight + 10)

    // Background alternado
    if (Math.floor(i / 2) % 2 === 0) {
      doc.rect(50, y, pageWidth, rowHeight).fill(rgbStr(LIGHT_GRAY))
    }

    // Coluna esquerda
    drawField(doc, fields[i][0], fields[i][1], 62, y + 6, colWidth - 20)

    // Coluna direita
    if (fields[i + 1]) {
      drawField(doc, fields[i + 1][0], fields[i + 1][1], 50 + colWidth + 12, y + 6, colWidth - 20)
    }

    y += rowHeight
  }

  return y
}

function drawField(doc, label, value, x, y, maxWidth) {
  doc.fontSize(7).fillColor('#999999').text(label.toUpperCase(), x, y, { width: maxWidth })
  doc.fontSize(10).fillColor('#1a1a1a').text(String(value || '—'), x, y + 12, { width: maxWidth, lineBreak: true })
}

function checkPage(doc, y, needed) {
  if (y + needed > doc.page.height - 60) {
    doc.addPage()
    return 50
  }
  return y
}

function rgbStr([r, g, b]) {
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`
}

function fmtDate(d) {
  if (!d) return '—'
  try {
    return new Date(d).toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit', year: 'numeric' })
  } catch { return d }
}

function tryParseJSON(s) {
  if (!s) return null
  try {
    const arr = JSON.parse(s)
    return Array.isArray(arr) ? arr.join(', ') : s
  } catch { return s }
}
