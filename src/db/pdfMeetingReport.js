/**
 * Relatório PDF de reunião com investidor.
 * Layout empresarial Somnium Properties com capa.
 */
import PDFDocument from 'pdfkit'
import { readFileSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const LOGO_PATH = path.resolve(__dirname, '../../public/logo-transparent.png')

const GOLD = '#C9A84C'
const BLACK = '#0d0d0d'
const DARK = '#1a1a1a'
const GRAY = '#666666'
const LIGHT = '#f5f5f0'
const WHITE = '#ffffff'
const RED = '#ef4444'
const GREEN = '#22c55e'
const BLUE = '#6366f1'

export function generateMeetingPDF(reuniao, analise, investidor) {
  const doc = new PDFDocument({ size: 'A4', margins: { top: 40, bottom: 40, left: 50, right: 50 } })
  const pw = doc.page.width
  const ph = doc.page.height
  const cw = pw - 100

  // ══════════════════════════════════════════════════════════
  // CAPA
  // ══════════════════════════════════════════════════════════
  doc.rect(0, 0, pw, ph).fill(BLACK)

  // Linha dourada topo
  doc.rect(0, 0, pw, 4).fill(GOLD)

  // Logo centrado
  try {
    const logo = readFileSync(LOGO_PATH)
    doc.image(logo, (pw - 180) / 2, 120, { width: 180 })
  } catch {
    doc.fontSize(28).fillColor(GOLD).text('SOMNIUM PROPERTIES', 0, 150, { align: 'center' })
  }

  // Linhas decorativas
  doc.rect(pw / 2 - 40, 280, 80, 1).fill(GOLD)

  // Tipo de documento
  doc.fontSize(11).fillColor(GOLD)
    .text('RELATÓRIO DE REUNIÃO', 0, 310, { align: 'center', characterSpacing: 4 })

  // Nome do investidor
  const investName = investidor?.nome || reuniao.titulo || 'Investidor'
  doc.fontSize(28).fillColor(WHITE)
    .text(investName, 60, 370, { align: 'center', width: pw - 120 })

  // Data e duração
  const dataStr = reuniao.data ? new Date(reuniao.data).toLocaleDateString('pt-PT', { day: '2-digit', month: 'long', year: 'numeric' }) : '—'
  doc.fontSize(12).fillColor(GRAY)
    .text(dataStr, 0, 430, { align: 'center' })
  if (reuniao.duracao_min) {
    doc.fontSize(10).fillColor(GRAY)
      .text(`Duração: ${reuniao.duracao_min} minutos`, 0, 450, { align: 'center' })
  }

  // Participantes
  if (reuniao.participantes) {
    let parts
    try { parts = JSON.parse(reuniao.participantes) } catch { parts = [] }
    if (parts.length > 0) {
      doc.fontSize(9).fillColor(GRAY)
        .text(`Participantes: ${parts.join(' · ')}`, 60, 490, { align: 'center', width: pw - 120 })
    }
  }

  // Classificação sugerida
  if (analise?.classificacao_sugerida) {
    const cls = analise.classificacao_sugerida
    const clsColor = cls === 'A' ? GREEN : cls === 'B' ? GOLD : cls === 'C' ? '#f59e0b' : RED
    doc.circle(pw / 2, 560, 28).fill(clsColor)
    doc.fontSize(22).fillColor(WHITE)
      .text(cls, pw / 2 - 10, 548, { width: 20, align: 'center' })
    doc.fontSize(8).fillColor(GRAY)
      .text('CLASSIFICAÇÃO SUGERIDA', 0, 598, { align: 'center' })
  }

  // Linha dourada fundo
  doc.rect(0, ph - 80, pw, 1).fill(GOLD)
  doc.fontSize(8).fillColor(GRAY)
    .text('Documento confidencial · Somnium Properties', 0, ph - 60, { align: 'center' })
  doc.fontSize(7).fillColor('#444444')
    .text(`Gerado em ${new Date().toLocaleDateString('pt-PT')}`, 0, ph - 45, { align: 'center' })

  // ══════════════════════════════════════════════════════════
  // PÁGINA 2: RESUMO EXECUTIVO
  // ══════════════════════════════════════════════════════════
  doc.addPage()
  let y = 40

  y = pageHeader(doc, 'RESUMO EXECUTIVO', y, cw)

  if (analise?.resumo_executivo) {
    doc.fontSize(10).fillColor('#333333')
      .text(analise.resumo_executivo, 50, y + 5, { width: cw, lineGap: 4 })
    y = doc.y + 20
  }

  // Pontos-chave
  if (analise?.pontos_chave?.length > 0) {
    y = sectionTitle(doc, 'Pontos-Chave', y, cw)
    for (const p of analise.pontos_chave) {
      y = checkPage(doc, y, 25)
      doc.fontSize(9).fillColor(GOLD).text('●', 55, y)
      doc.fontSize(9).fillColor('#333333').text(p, 70, y, { width: cw - 25 })
      y = doc.y + 6
    }
    y += 10
  }

  // Próximos passos
  if (analise?.proximos_passos?.length > 0) {
    y = checkPage(doc, y, 60)
    y = sectionTitle(doc, 'Próximos Passos', y, cw)
    analise.proximos_passos.forEach((p, i) => {
      y = checkPage(doc, y, 25)
      doc.roundedRect(50, y, 18, 18, 3).fill(BLUE)
      doc.fontSize(9).fillColor(WHITE).text(`${i + 1}`, 53, y + 4, { width: 12, align: 'center' })
      doc.fontSize(9).fillColor('#333333').text(p, 76, y + 3, { width: cw - 30 })
      y = doc.y + 8
    })
    y += 10
  }

  // ══════════════════════════════════════════════════════════
  // DADOS EXTRAÍDOS DO INVESTIDOR
  // ══════════════════════════════════════════════════════════
  if (analise?.investidor_dados) {
    y = checkPage(doc, y, 120)
    y = sectionTitle(doc, 'Dados do Investidor (extraídos da reunião)', y, cw)

    const dados = analise.investidor_dados
    const fields = [
      ['Capital Mínimo', dados.capital_min ? `€ ${dados.capital_min.toLocaleString('pt-PT')}` : null],
      ['Capital Máximo', dados.capital_max ? `€ ${dados.capital_max.toLocaleString('pt-PT')}` : null],
      ['Estratégia', Array.isArray(dados.estrategia) ? dados.estrategia.join(', ') : dados.estrategia],
      ['Perfil de Risco', dados.perfil_risco],
      ['Tipo Investidor', Array.isArray(dados.tipo_investidor) ? dados.tipo_investidor.join(', ') : dados.tipo_investidor],
      ['Experiência', dados.experiencia_imobiliario],
      ['Motivação', dados.motivacao],
      ['Objeções', dados.objecoes],
      ['Profissão', dados.profissao],
      ['Localização', dados.localizacao],
    ].filter(([, v]) => v)

    for (let i = 0; i < fields.length; i += 2) {
      y = checkPage(doc, y, 35)
      if (i % 4 === 0) doc.rect(50, y, cw, 30).fill(LIGHT)

      drawFieldPair(doc, fields[i], fields[i + 1], y, cw)
      y += 32
    }
    y += 10
  }

  // Probabilidade
  if (analise?.probabilidade_investimento != null) {
    y = checkPage(doc, y, 50)
    doc.rect(50, y, cw, 40).fill(LIGHT)
    doc.fontSize(8).fillColor(GRAY).text('PROBABILIDADE DE INVESTIMENTO', 62, y + 6)
    const pct = analise.probabilidade_investimento
    const barW = cw - 24
    doc.rect(62, y + 22, barW, 10).fill('#e5e7eb')
    const pctColor = pct >= 70 ? GREEN : pct >= 40 ? GOLD : RED
    doc.rect(62, y + 22, barW * pct / 100, 10).fill(pctColor)
    doc.fontSize(9).fillColor('#333333').text(`${pct}%`, 62 + barW + 5, y + 22)
    y += 55
  }

  // ══════════════════════════════════════════════════════════
  // SUGESTÕES DE MELHORIA
  // ══════════════════════════════════════════════════════════
  if (analise?.sugestoes_melhoria?.length > 0) {
    y = checkPage(doc, y, 80)
    y = sectionTitle(doc, 'Sugestões de Melhoria', y, cw)

    for (const s of analise.sugestoes_melhoria) {
      y = checkPage(doc, y, 35)
      doc.rect(50, y, 3, 20).fill(GOLD)
      doc.fontSize(9).fillColor('#333333').text(s, 62, y + 3, { width: cw - 20, lineGap: 3 })
      y = doc.y + 10
    }
    y += 10
  }

  // ══════════════════════════════════════════════════════════
  // TRANSCRIÇÃO
  // ══════════════════════════════════════════════════════════
  if (reuniao.transcricao) {
    doc.addPage()
    let ty = 40
    ty = pageHeader(doc, 'TRANSCRIÇÃO COMPLETA', ty, cw)

    const lines = reuniao.transcricao.split('\n').filter(Boolean)
    for (const line of lines) {
      ty = checkPage(doc, ty, 18)
      const match = line.match(/^\[(.+?)\]:\s*(.+)/)
      if (match) {
        const speaker = match[1]
        const text = match[2]
        const isSomnium = /somnium|alexandre|jo[aã]o/i.test(speaker)
        doc.fontSize(7).fillColor(isSomnium ? BLUE : GOLD).text(speaker, 50, ty)
        ty = doc.y
        doc.fontSize(8).fillColor('#444444').text(text, 50, ty, { width: cw, lineGap: 2 })
        ty = doc.y + 5
      } else {
        doc.fontSize(8).fillColor('#444444').text(line, 50, ty, { width: cw, lineGap: 2 })
        ty = doc.y + 3
      }
    }
  }

  doc.end()
  return doc
}

// ── Helpers ──────────────────────────────────────────────────

function pageHeader(doc, title, y, cw) {
  doc.rect(50, y, cw, 30).fill(BLACK)
  doc.fontSize(10).fillColor(GOLD).text(title, 62, y + 9, { characterSpacing: 2 })
  return y + 40
}

function sectionTitle(doc, title, y, cw) {
  doc.rect(50, y, cw, 1).fill('#e5e7eb')
  doc.fontSize(10).fillColor(BLACK).text(title, 50, y + 8)
  return y + 28
}

function drawFieldPair(doc, left, right, y, cw) {
  const half = cw / 2
  if (left) {
    doc.fontSize(7).fillColor(GRAY).text(left[0].toUpperCase(), 62, y + 4)
    doc.fontSize(10).fillColor('#1a1a1a').text(left[1], 62, y + 15, { width: half - 20 })
  }
  if (right) {
    doc.fontSize(7).fillColor(GRAY).text(right[0].toUpperCase(), 50 + half + 12, y + 4)
    doc.fontSize(10).fillColor('#1a1a1a').text(right[1], 50 + half + 12, y + 15, { width: half - 20 })
  }
}

function checkPage(doc, y, needed) {
  if (y + needed > doc.page.height - 50) {
    doc.addPage()
    return 50
  }
  return y
}
