/**
 * Relatório PDF executivo de reunião com investidor.
 * Layout empresarial Somnium Properties.
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
const WHITE = '#ffffff'
const LIGHT = '#f7f6f2'
const BODY = '#333333'
const MUTED = '#888888'
const BORDER = '#e0ddd5'

const EUR = v => {
  if (v == null || v === 0) return '—'
  return new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(v)
}

export function generateMeetingPDF(reuniao, analise, investidor) {
  const doc = new PDFDocument({
    size: 'A4',
    margins: { top: 0, bottom: 0, left: 0, right: 0 },
    bufferPages: false,
  })
  const pw = doc.page.width   // 595
  const ph = doc.page.height  // 842
  const ml = 55, mr = 55
  const cw = pw - ml - mr     // content width

  // ══════════════════════════════════════════════════════════
  // CAPA
  // ══════════════════════════════════════════════════════════
  doc.rect(0, 0, pw, ph).fill(BLACK)

  // Barra dourada topo
  doc.rect(0, 0, pw, 5).fill(GOLD)

  // Linha fina lateral esquerda
  doc.rect(35, 80, 2, ph - 160).fill(GOLD).opacity(0.3)
  doc.opacity(1)

  // Logo
  try {
    const logo = readFileSync(LOGO_PATH)
    doc.image(logo, (pw - 200) / 2, 100, { width: 200 })
  } catch {
    doc.fontSize(30).fillColor(GOLD).text('SOMNIUM', 0, 130, { align: 'center' })
    doc.fontSize(12).fillColor(WHITE).text('PROPERTIES', 0, 165, { align: 'center', characterSpacing: 8 })
  }

  // Separador
  doc.rect(pw / 2 - 30, 270, 60, 1).fill(GOLD)

  // Tipo documento
  doc.fontSize(9).fillColor(GOLD)
    .text('RELATÓRIO DE REUNIÃO', 0, 295, { align: 'center', characterSpacing: 5 })

  // Nome investidor
  const investName = investidor?.nome || reuniao.titulo?.replace(/\s+e\s+alexandre\s+mendes/i, '').trim() || 'Investidor'
  doc.fontSize(32).fillColor(WHITE)
    .text(investName, ml, 340, { align: 'center', width: cw })

  // Linha sob o nome
  const nameW = Math.min(doc.widthOfString(investName), cw)
  doc.rect((pw - nameW) / 2, doc.y + 10, nameW, 1).fill(GOLD).opacity(0.4)
  doc.opacity(1)

  // Data e duração
  const dataStr = reuniao.data ? new Date(reuniao.data).toLocaleDateString('pt-PT', { day: '2-digit', month: 'long', year: 'numeric' }) : '—'
  doc.fontSize(11).fillColor(MUTED)
    .text(dataStr, 0, 420, { align: 'center' })

  if (reuniao.duracao_min > 0) {
    doc.fontSize(9).fillColor(MUTED)
      .text(`Duração: ${reuniao.duracao_min} minutos`, 0, 440, { align: 'center' })
  }

  // Participantes
  let parts = []
  try { parts = JSON.parse(reuniao.participantes || '[]') } catch {}
  if (parts.length > 0) {
    doc.fontSize(8).fillColor('#555555')
      .text(parts.join('  ·  '), ml, 475, { align: 'center', width: cw })
  }

  // Classificação badge
  if (analise?.classificacao_sugerida) {
    const cls = analise.classificacao_sugerida
    const clsColors = { A: '#22c55e', B: GOLD, C: '#f59e0b', D: '#ef4444' }
    const clsLabels = { A: 'ELEVADO POTENCIAL', B: 'BOM POTENCIAL', C: 'POTENCIAL MODERADO', D: 'BAIXO POTENCIAL' }
    const color = clsColors[cls] || GOLD

    doc.roundedRect(pw / 2 - 60, 530, 120, 50, 8).fill(color).opacity(0.15)
    doc.opacity(1)
    doc.roundedRect(pw / 2 - 60, 530, 120, 50, 8).lineWidth(1).stroke(color)
    doc.fontSize(28).fillColor(color)
      .text(cls, pw / 2 - 15, 535, { width: 30, align: 'center' })
    doc.fontSize(7).fillColor(color)
      .text(clsLabels[cls] || '', 0, 590, { align: 'center', characterSpacing: 1 })
  }

  // Confidencial
  doc.rect(0, ph - 65, pw, 65).fill(DARK)
  doc.rect(0, ph - 65, pw, 1).fill(GOLD).opacity(0.5)
  doc.opacity(1)
  doc.fontSize(7).fillColor(GOLD)
    .text('SOMNIUM PROPERTIES · CONFIDENCIAL', 0, ph - 45, { align: 'center', characterSpacing: 2 })
  doc.fontSize(7).fillColor('#444444')
    .text(`Ref. ${reuniao.id?.slice(0, 8)} · Gerado a ${new Date().toLocaleDateString('pt-PT')}`, 0, ph - 30, { align: 'center' })

  // ══════════════════════════════════════════════════════════
  // PÁGINA 2: SUMÁRIO EXECUTIVO
  // ══════════════════════════════════════════════════════════
  doc.addPage({ margins: { top: 50, bottom: 50, left: ml, right: mr } })
  let y = 50

  y = drawPageHeader(doc, 'SUMÁRIO EXECUTIVO', y, cw, ml)

  // Resumo executivo
  if (analise?.resumo_executivo) {
    const resumoClean = analise.resumo_executivo.replace(/\*\*/g, '').replace(/^-\s*/gm, '')
    doc.fontSize(10).fillColor(BODY).text(resumoClean, ml, y, { width: cw, lineGap: 5 })
    y = doc.y + 20
  }

  // KPIs em destaque
  if (analise?.investidor_dados) {
    const d = analise.investidor_dados
    const kpis = [
      d.capital_max ? ['Capital Disponível', EUR(d.capital_max)] : null,
      d.estrategia?.length ? ['Estratégia Preferida', Array.isArray(d.estrategia) ? d.estrategia.join(', ') : d.estrategia] : null,
      d.perfil_risco ? ['Perfil de Risco', d.perfil_risco] : null,
      analise.probabilidade_investimento != null ? ['Prob. Investimento', `${analise.probabilidade_investimento}%`] : null,
    ].filter(Boolean)

    if (kpis.length > 0) {
      y = cp(doc, y, 70)
      const kpiW = cw / kpis.length
      doc.rect(ml, y, cw, 55).fill(LIGHT)
      doc.rect(ml, y, cw, 1).fill(GOLD)

      kpis.forEach(([label, value], i) => {
        const x = ml + kpiW * i + 12
        doc.fontSize(7).fillColor(MUTED).text(label.toUpperCase(), x, y + 10, { width: kpiW - 24 })
        doc.fontSize(14).fillColor(BLACK).text(value, x, y + 24, { width: kpiW - 24 })
      })
      y += 70
    }
  }

  // ══════════════════════════════════════════════════════════
  // ANÁLISE DETALHADA
  // ══════════════════════════════════════════════════════════
  y = cp(doc, y, 40)
  y = drawSectionTitle(doc, 'ANÁLISE DO INVESTIDOR', y, cw, ml)

  if (analise?.investidor_dados) {
    const d = analise.investidor_dados
    const fields = [
      ['Capital Mínimo', d.capital_min ? EUR(d.capital_min) : null],
      ['Capital Máximo', d.capital_max ? EUR(d.capital_max) : null],
      ['Estratégia', Array.isArray(d.estrategia) ? d.estrategia.join(', ') : d.estrategia],
      ['Perfil de Risco', d.perfil_risco],
      ['Tipo de Investidor', Array.isArray(d.tipo_investidor) ? d.tipo_investidor.join(', ') : d.tipo_investidor],
      ['Experiência', d.experiencia_imobiliario],
      ['Motivação', d.motivacao],
      ['Objeções Identificadas', d.objecoes],
    ].filter(([, v]) => v)

    for (let i = 0; i < fields.length; i++) {
      y = cp(doc, y, 28)
      if (i % 2 === 0) doc.rect(ml, y, cw, 24).fill(LIGHT)
      doc.fontSize(7).fillColor(MUTED).text(fields[i][0].toUpperCase(), ml + 12, y + 4, { width: 140 })
      doc.fontSize(9).fillColor(BODY).text(fields[i][1], ml + 160, y + 4, { width: cw - 175 })
      y += 26
    }
    y += 10
  }

  // Barra de probabilidade
  if (analise?.probabilidade_investimento != null) {
    y = cp(doc, y, 45)
    doc.fontSize(8).fillColor(MUTED).text('PROBABILIDADE DE INVESTIMENTO', ml, y, { characterSpacing: 1 })
    y += 16
    const pct = analise.probabilidade_investimento
    doc.roundedRect(ml, y, cw, 12, 6).fill('#e5e7eb')
    const barColor = pct >= 70 ? '#22c55e' : pct >= 40 ? GOLD : '#ef4444'
    doc.roundedRect(ml, y, cw * pct / 100, 12, 6).fill(barColor)
    doc.fontSize(8).fillColor(BODY).text(`${pct}%`, ml + cw + 8, y + 1)
    y += 25
  }

  // ══════════════════════════════════════════════════════════
  // PRÓXIMOS PASSOS
  // ══════════════════════════════════════════════════════════
  const proxSteps = (analise?.proximos_passos || []).filter(p => !p.startsWith('**'))
  if (proxSteps.length > 0) {
    y = cp(doc, y, 60)
    y = drawSectionTitle(doc, 'PRÓXIMOS PASSOS', y, cw, ml)

    proxSteps.slice(0, 8).forEach((p, i) => {
      y = cp(doc, y, 25)
      const cleanP = p.replace(/\(\d{2}:\d{2}\)/g, '').trim()
      doc.circle(ml + 8, y + 7, 8).fill(GOLD)
      doc.fontSize(8).fillColor(WHITE).text(`${i + 1}`, ml + 3, y + 3, { width: 10, align: 'center' })
      doc.fontSize(9).fillColor(BODY).text(cleanP, ml + 24, y + 2, { width: cw - 30, lineGap: 3 })
      y = Math.max(y + 20, doc.y + 6)
    })
    y += 10
  }

  // ══════════════════════════════════════════════════════════
  // RECOMENDAÇÕES DE MELHORIA
  // ══════════════════════════════════════════════════════════
  if (analise?.sugestoes_melhoria?.length > 0) {
    y = cp(doc, y, 80)
    y = drawSectionTitle(doc, 'RECOMENDAÇÕES PARA PRÓXIMAS REUNIÕES', y, cw, ml)

    doc.rect(ml, y, 3, 0) // placeholder height
    const startY = y
    for (const s of analise.sugestoes_melhoria) {
      y = cp(doc, y, 30)
      doc.rect(ml, y, 3, 16).fill(GOLD)
      doc.fontSize(9).fillColor(BODY).text(s, ml + 14, y + 1, { width: cw - 20, lineGap: 3 })
      y = doc.y + 10
    }
    y += 5
  }

  // ══════════════════════════════════════════════════════════
  // PONTOS-CHAVE DA REUNIÃO
  // ══════════════════════════════════════════════════════════
  const pontosClean = (analise?.pontos_chave || []).filter(p => !p.startsWith('**') && p.length > 3).slice(0, 8)
  if (pontosClean.length > 0) {
    y = cp(doc, y, 60)
    y = drawSectionTitle(doc, 'PONTOS-CHAVE', y, cw, ml)

    for (const p of pontosClean) {
      y = cp(doc, y, 20)
      const cleanP = p.replace(/\(\d{2}:\d{2}\)/g, '').trim()
      doc.fontSize(8).fillColor(GOLD).text('▸', ml, y + 1)
      doc.fontSize(9).fillColor(BODY).text(cleanP, ml + 14, y, { width: cw - 20, lineGap: 2 })
      y = doc.y + 6
    }
    y += 10
  }

  // ══════════════════════════════════════════════════════════
  // TRANSCRIÇÃO (nova página)
  // ══════════════════════════════════════════════════════════
  if (reuniao.transcricao) {
    doc.addPage({ margins: { top: 50, bottom: 50, left: ml, right: mr } })
    let ty = 50

    ty = drawPageHeader(doc, 'TRANSCRIÇÃO DA REUNIÃO', ty, cw, ml)

    doc.fontSize(7).fillColor(MUTED)
      .text(`${reuniao.titulo} · ${dataStr} · ${reuniao.duracao_min || 0} min`, ml, ty)
    ty += 18

    doc.rect(ml, ty, cw, 1).fill(BORDER)
    ty += 8

    const lines = reuniao.transcricao.split('\n').filter(Boolean)
    let lastSpeaker = ''

    for (const line of lines) {
      ty = cp(doc, ty, 22)
      const match = line.match(/^\[(.+?)\]:\s*(.+)/)
      if (match) {
        const speaker = match[1]
        const text = match[2]
        const isSomnium = /somnium|alexandre|jo[aã]o/i.test(speaker)

        // Novo speaker = separador visual
        if (speaker !== lastSpeaker) {
          if (lastSpeaker) { ty += 4 }
          doc.fontSize(7).fillColor(isSomnium ? '#6366f1' : GOLD)
            .text(speaker.toUpperCase(), ml, ty, { characterSpacing: 0.5 })
          ty = doc.y + 2
          lastSpeaker = speaker
        }

        doc.fontSize(8).fillColor('#555555')
          .text(text, ml + 8, ty, { width: cw - 12, lineGap: 2 })
        ty = doc.y + 3
      }
    }
  }

  // ══════════════════════════════════════════════════════════
  // CONTRACAPA
  // ══════════════════════════════════════════════════════════
  doc.addPage({ margins: { top: 0, bottom: 0, left: 0, right: 0 } })
  doc.rect(0, 0, pw, ph).fill(BLACK)
  doc.rect(0, 0, pw, 5).fill(GOLD)

  try {
    const logo = readFileSync(LOGO_PATH)
    doc.image(logo, (pw - 140) / 2, ph / 2 - 60, { width: 140 })
  } catch {
    doc.fontSize(24).fillColor(GOLD).text('SOMNIUM PROPERTIES', 0, ph / 2 - 20, { align: 'center' })
  }

  doc.fontSize(8).fillColor('#444444')
    .text('Documento confidencial. Proibida a reprodução sem autorização.', 0, ph / 2 + 40, { align: 'center' })
  doc.fontSize(8).fillColor(MUTED)
    .text('www.somniumproperties.pt', 0, ph / 2 + 58, { align: 'center' })

  doc.rect(0, ph - 5, pw, 5).fill(GOLD)

  doc.end()
  return doc
}

// ── Helpers ──────────────────────────────────────────────────

function drawPageHeader(doc, title, y, cw, ml) {
  doc.rect(ml, y, cw, 32).fill(BLACK)
  doc.fontSize(9).fillColor(GOLD).text(title, ml + 14, y + 10, { characterSpacing: 3 })
  // Gold accent left
  doc.rect(ml, y, 4, 32).fill(GOLD)
  return y + 44
}

function drawSectionTitle(doc, title, y, cw, ml) {
  doc.fontSize(10).fillColor(BLACK).text(title, ml, y, { characterSpacing: 1 })
  y = doc.y + 4
  doc.rect(ml, y, 40, 2).fill(GOLD)
  doc.rect(ml + 42, y + 0.5, cw - 42, 0.5).fill(BORDER)
  return y + 14
}

function cp(doc, y, needed) {
  if (y + needed > doc.page.height - 60) {
    doc.addPage({ margins: { top: 50, bottom: 50, left: 55, right: 55 } })
    return 50
  }
  return y
}
