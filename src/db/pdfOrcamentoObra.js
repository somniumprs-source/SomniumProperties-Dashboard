/**
 * PDF do orçamento de obra. Replica o formato do documento Word
 * actual do gestor: cabeçalho do imóvel, secções com inputs e
 * fórmulas linha-a-linha, subtotal por secção, acumulado progressivo
 * e total geral. Pipeable para qualquer res/writeStream.
 */
import PDFDocument from 'pdfkit'
import { readFileSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { calcOrcamentoObra } from './orcamentoObraEngine.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const LOGO_PATH = path.resolve(__dirname, '../../public/logo-transparent.png')

const GOLD  = '#C9A84C'
const BLACK = '#0d0d0d'
const GRAY  = '#666666'
const LIGHT = '#F0EDE5'

const EUR = v => {
  if (v == null || !Number.isFinite(Number(v))) return '—'
  return new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(v)
}

const num = (v) => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

export function generateOrcamentoObraPDF(imovel, orcamentoRow, stream) {
  const doc = new PDFDocument({ size: 'A4', margins: { top: 40, bottom: 50, left: 50, right: 50 } })
  doc.pipe(stream)

  // Normalizar input vindo da BD (jsonb pode chegar como string)
  const pisos   = parseJson(orcamentoRow.pisos, [])
  const seccoes = parseJson(orcamentoRow.seccoes, {})
  const ivaPerc = num(orcamentoRow.iva_perc ?? 23)
  const orcamento = { pisos, seccoes, iva_perc: ivaPerc }

  const calc = calcOrcamentoObra(orcamento)

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

  // ── Título do imóvel ───────────────────────────────────────
  doc.fontSize(20).fillColor(BLACK).text(imovel.nome || 'Sem nome', 50, y)
  y += 28
  if (imovel.morada) {
    doc.fontSize(10).fillColor(GRAY).text(imovel.morada, 50, y)
    y += 18
  }

  // ── Pisos ──────────────────────────────────────────────────
  if (pisos.length > 0) {
    y = drawSectionHeader(doc, 'COMPOSIÇÃO POR PISO', y)
    for (const p of pisos) {
      const linha = `${p.nome || 'Piso'} — ${num(p.area_m2)} m²${p.descricao ? ' · ' + p.descricao : ''}`
      doc.fontSize(10).fillColor(BLACK).text(linha, 60, y)
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

  // ── Secções ────────────────────────────────────────────────
  const renderers = [
    ['DEMOLIÇÕES E LIMPEZA',           'demolicoes',    () => linhasDemolicoes(seccoes.demolicoes, ivaPerc)],
    ['ELETRICIDADE E CANALIZAÇÃO',     'eletricidade',  () => linhasPorPiso(seccoes.eletricidade, pisos, ivaPerc)],
    ['PAVIMENTO',                      'pavimento',     () => linhasPorPiso(seccoes.pavimento, pisos, ivaPerc)],
    ['PLADUR TETOS',                   'pladur',        () => linhasPorPiso(seccoes.pladur, pisos, ivaPerc)],
    ['CAIXILHARIAS',                   'caixilharias',  () => linhasCaixilharias(seccoes.caixilharias, pisos, ivaPerc)],
    ['SISTEMA VMC',                    'vmc',           () => linhasVmc(seccoes.vmc, pisos)],
    ['PINTURA',                        'pintura',       () => linhasPintura(seccoes.pintura, pisos, ivaPerc)],
    ['CASAS DE BANHO',                 'casas_banho',   () => linhasUnitario(seccoes.casas_banho, 'casas de banho')],
    ['PORTAS',                         'portas',        () => linhasUnitario(seccoes.portas, 'portas')],
    ['COZINHAS',                       'cozinhas',      () => linhasUnitario(seccoes.cozinhas, 'cozinhas')],
    ['CAPOTO EXTERIOR',                'capoto',        () => linhasCapoto(seccoes.capoto, ivaPerc)],
    ['COBERTURA',                      'cobertura',     () => linhasCobertura(seccoes.cobertura)],
  ]

  for (const [titulo, key, getLinhas] of renderers) {
    y = checkPage(doc, y, 80)
    y = drawSectionHeader(doc, titulo, y)
    const linhas = getLinhas() || []
    for (const linha of linhas) {
      y = checkPage(doc, y, 16)
      desenhaLinha(doc, linha, y)
      y += 14
    }
    // Subtotal
    y += 4
    desenhaSubtotal(doc, `Subtotal ${titulo.toLowerCase()}`, calc.subtotais[key], y)
    y += 14
    // Acumulado
    doc.fontSize(8).fillColor(GRAY)
       .text(`Acumulado: ${EUR(calc.acumulado[key])}`, 50, y, { width: 500, align: 'right' })
    y += 18
  }

  // ── Total obra ─────────────────────────────────────────────
  y = checkPage(doc, y, 60)
  doc.rect(50, y, 500, 28).fill(LIGHT)
  doc.fontSize(11).fillColor(BLACK).text('TOTAL OBRA', 60, y + 9)
  doc.fontSize(13).fillColor(BLACK).text(EUR(calc.total_obra), 50, y + 7, { width: 490, align: 'right' })
  y += 38

  // ── Licenciamento (se houver) ──────────────────────────────
  if (calc.total_licenciamento > 0) {
    y = checkPage(doc, y, 80)
    y = drawSectionHeader(doc, 'LICENCIAMENTO', y)
    const lic = seccoes.licenciamento || {}
    const linhasLic = [
      lic.projeto > 0 ? formatLinha('Projecto especialidade/arquitectura', `${EUR(num(lic.projeto))} + ${ivaPerc}% IVA`, num(lic.projeto) * (1 + ivaPerc/100)) : null,
      lic.taxas > 0 ? formatLinha('Taxas e solicitador', `${EUR(num(lic.taxas))} + ${ivaPerc}% IVA`, num(lic.taxas) * (1 + ivaPerc/100)) : null,
    ].filter(Boolean)
    for (const linha of linhasLic) {
      desenhaLinha(doc, linha, y); y += 14
    }
    y += 4
    desenhaSubtotal(doc, 'Subtotal licenciamento', calc.total_licenciamento, y)
    y += 24
  }

  // ── Total geral ────────────────────────────────────────────
  y = checkPage(doc, y, 60)
  doc.rect(50, y, 500, 36).fill(BLACK)
  doc.fontSize(13).fillColor(GOLD).text('TOTAL GERAL', 60, y + 12)
  doc.fontSize(16).fillColor(GOLD).text(EUR(calc.total_geral), 50, y + 10, { width: 490, align: 'right' })
  y += 50

  // ── Footer ─────────────────────────────────────────────────
  const footerY = doc.page.height - 40
  doc.rect(0, footerY - 8, doc.page.width, 40).fill(BLACK)
  doc.rect(0, footerY - 8, doc.page.width, 2).fill(GOLD)
  doc.fontSize(7).fillColor(GOLD)
     .text('SOMNIUM PROPERTIES · Coimbra, Portugal · Documento confidencial',
           50, footerY + 4, { align: 'center', width: doc.page.width - 100 })

  doc.end()
}

// ── Helpers de desenho ─────────────────────────────────────
function drawSectionHeader(doc, title, y) {
  y = checkPage(doc, y, 36)
  doc.rect(50, y, 500, 22).fill(BLACK)
  doc.fontSize(9).fillColor(GOLD).text(title, 60, y + 7, { characterSpacing: 1.2 })
  return y + 30
}

function desenhaLinha(doc, linha, y) {
  doc.fontSize(9).fillColor(BLACK).text(linha.label, 60, y, { width: 280 })
  doc.fontSize(8).fillColor(GRAY).text(linha.formula || '', 60 + 280 + 10, y + 1, { width: 130 })
  doc.fontSize(9).fillColor(BLACK).text(EUR(linha.valor), 50, y, { width: 490, align: 'right' })
}

function desenhaSubtotal(doc, label, valor, y) {
  doc.fontSize(9).fillColor(GOLD).text(label, 60, y)
  doc.fontSize(10).fillColor(BLACK).text(EUR(valor), 50, y - 1, { width: 490, align: 'right' })
}

function checkPage(doc, y, needed) {
  if (y + needed > doc.page.height - 60) {
    doc.addPage()
    return 50
  }
  return y
}

function parseJson(v, fallback) {
  if (v == null) return fallback
  if (typeof v === 'object') return v
  try { return JSON.parse(v) } catch { return fallback }
}

const formatLinha = (label, formula, valor) => ({ label, formula, valor })

// ── Geradores de linhas por secção ─────────────────────────
function linhasDemolicoes(s, ivaPerc) {
  s = s || {}
  const linhas = []
  if (num(s.entulhos) > 0)
    linhas.push(formatLinha('Entrega de entulhos', `${EUR(num(s.entulhos))} + ${ivaPerc}% IVA`, num(s.entulhos) * (1 + ivaPerc/100)))
  if (num(s.remocao_dias) > 0)
    linhas.push(formatLinha('Remoção e transporte', `${num(s.remocao_dias)} dias × ${EUR(num(s.remocao_eur_dia))} + IVA`, num(s.remocao_dias) * num(s.remocao_eur_dia) * (1 + ivaPerc/100)))
  if (num(s.nivel_m2) > 0)
    linhas.push(formatLinha('Nivelamento (toutvenant)', `${num(s.nivel_m2)}m² × ${num(s.nivel_altura)}m × ${EUR(num(s.nivel_eur_m3))}/m³`, num(s.nivel_m2) * num(s.nivel_altura) * num(s.nivel_eur_m3)))
  if (num(s.limpeza_dias) > 0)
    linhas.push(formatLinha('Limpeza interior + terreno', `${num(s.limpeza_dias)} dias × ${EUR(num(s.limpeza_eur_dia))}`, num(s.limpeza_dias) * num(s.limpeza_eur_dia)))
  if (num(s.paredes_dias) > 0)
    linhas.push(formatLinha('Demolição paredes / roços', `${num(s.paredes_dias)} dias × ${EUR(num(s.paredes_eur_dia))}`, num(s.paredes_dias) * num(s.paredes_eur_dia)))
  return linhas
}

function linhasPorPiso(s, pisos, ivaPerc) {
  if (!Array.isArray(pisos)) return []
  return pisos.map(p => {
    const piso = s?.por_piso?.[p.nome] || {}
    const m2 = num(piso.area_m2 ?? p.area_m2)
    const eur = num(piso.eur_m2)
    return formatLinha(p.nome, `${m2}m² × ${EUR(eur)} + ${ivaPerc}% IVA`, m2 * eur * (1 + ivaPerc/100))
  }).filter(l => l.valor > 0)
}

function linhasCaixilharias(s, pisos, ivaPerc) {
  s = s || {}
  const linhas = []
  if (Array.isArray(pisos)) {
    for (const p of pisos) {
      const piso = s.por_piso?.[p.nome] || {}
      const n = num(piso.n_janelas), area = num(piso.area_janela_m2), eur = num(piso.eur_m2)
      if (n > 0) linhas.push(formatLinha(`${p.nome} — janelas`, `${n} × ${area}m² × ${EUR(eur)}/m² + IVA`, n * area * eur * (1 + ivaPerc/100)))
    }
  }
  if (num(s.cb_un) > 0)
    linhas.push(formatLinha('Janelas casa de banho', `${num(s.cb_un)} × ${EUR(num(s.cb_eur_un))} (c/ IVA)`, num(s.cb_un) * num(s.cb_eur_un)))
  if (num(s.pedreiro) > 0)
    linhas.push(formatLinha('Trabalho pedreiro', `${EUR(num(s.pedreiro))} + ${ivaPerc}% IVA`, num(s.pedreiro) * (1 + ivaPerc/100)))
  if (num(s.soleiras_un) > 0)
    linhas.push(formatLinha('Soleiras', `${num(s.soleiras_un)} × ${EUR(num(s.soleiras_eur_un))} + IVA`, num(s.soleiras_un) * num(s.soleiras_eur_un) * (1 + ivaPerc/100)))
  return linhas
}

function linhasVmc(s, pisos) {
  if (!Array.isArray(pisos)) return []
  return pisos.map(p => {
    const piso = s?.por_piso?.[p.nome] || {}
    return formatLinha(`${p.nome} — VMC`, `valor com IVA`, num(piso.valor_com_iva))
  }).filter(l => l.valor > 0)
}

function linhasPintura(s, pisos, ivaPerc) {
  if (!Array.isArray(pisos)) return []
  return pisos.map(p => {
    const piso = s?.por_piso?.[p.nome] || {}
    const paredes = num(piso.m2_paredes), teto = num(piso.m2_teto), eur = num(piso.eur_m2)
    const total = (paredes + teto) * eur * (1 + ivaPerc/100)
    return formatLinha(p.nome, `${paredes}+${teto}m² × ${EUR(eur)}/m² + IVA`, total)
  }).filter(l => l.valor > 0)
}

function linhasUnitario(s, label) {
  s = s || {}
  if (num(s.un) <= 0) return []
  return [formatLinha(`${num(s.un)} × ${label}`, `${num(s.un)} × ${EUR(num(s.eur_un))}`, num(s.un) * num(s.eur_un))]
}

function linhasCapoto(s, ivaPerc) {
  s = s || {}
  const trecos = Array.isArray(s.trecos) ? s.trecos : []
  return trecos.map((t, i) => {
    const total = num(t.perimetro) * num(t.altura) * num(t.eur_m2) * (1 + ivaPerc/100)
    return formatLinha(t.label || `Troço ${i + 1}`, `${num(t.perimetro)}m × ${num(t.altura)}m × ${EUR(num(t.eur_m2))}/m² + IVA`, total)
  }).filter(l => l.valor > 0)
}

function linhasCobertura(s) {
  s = s || {}
  if (num(s.m2) <= 0) return []
  return [formatLinha('Cobertura', `${num(s.m2)}m² × ${EUR(num(s.eur_m2))}/m² (c/ IVA)`, num(s.m2) * num(s.eur_m2))]
}
