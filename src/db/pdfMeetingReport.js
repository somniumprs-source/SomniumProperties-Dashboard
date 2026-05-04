/**
 * Relatorio PDF executivo de reuniao com investidor.
 * Layout institucional Somnium Properties — estilo corporativo formal.
 */
import PDFDocument from 'pdfkit'
import { readFileSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const LOGO_PATH = path.resolve(__dirname, '../../public/logo-transparent.png')

const GOLD = '#C9A84C'
const GOLD_DARK = '#a88a3a'
const BLACK = '#0d0d0d'
const TEXT = '#1f2937'
const BODY = '#374151'
const MUTED = '#6b7280'
const LIGHT = '#9ca3af'
const BORDER = '#e0ddd5'
const BG = '#fbfaf7'

const PT = 60   // top margin
const PB = 70   // bottom margin
const ML = 60   // left margin
const PW = 595.28
const PH = 841.89
const CW = PW - ML * 2

export function generateMeetingPDF(reuniao, analise, investidor) {
  const doc = new PDFDocument({ size: 'A4', autoFirstPage: false, margins: { top: PT, bottom: PB, left: ML, right: ML } })

  const perfil = analise?.perfil_investidor || analise?.investidor_dados || {}
  const investName = perfil?.nome || investidor?.nome || cleanTitle(reuniao.titulo) || 'Investidor'
  const dataStr = reuniao.data
    ? new Date(reuniao.data).toLocaleDateString('pt-PT', { day: '2-digit', month: 'short', year: 'numeric' }).toUpperCase().replace(/\./g, '')
    : '—'
  const participantes = parseParticipantes(reuniao.participantes)
  const participantesStr = participantes.length
    ? participantes.map(p => extractName(p)).filter(Boolean).slice(0, 6).join(' · ')
    : '—'

  let y = PT

  // Centra texto numa coordenada Y sem usar `width` (que dispara LineWrapper
  // e causa pageBreak automatico quando se desenha fora da content area).
  function centeredText(text, fy, fontSize, font, color, opts = {}) {
    doc.fontSize(fontSize).font(font).fillColor(color)
    const w = doc.widthOfString(text, { characterSpacing: opts.characterSpacing || 0 })
    doc.text(text, (PW - w) / 2, fy, { lineBreak: false, characterSpacing: opts.characterSpacing || 0 })
  }

  function drawFooter() {
    const fy = PH - PB + 30
    centeredText('SOMNIUM PROPERTIES', fy, 7, 'Helvetica-Bold', GOLD, { characterSpacing: 1.5 })
    centeredText('Excelência em Investimento Imobiliário', fy + 10, 7, 'Helvetica', MUTED)
    centeredText('Documento Confidencial — Uso Interno Somnium Properties', fy + 22, 6.5, 'Helvetica-Oblique', LIGHT)
  }

  // Quando pdfkit cria nova pagina (manual ou autopaging), reset y + footer
  doc.on('pageAdded', () => { y = PT; drawFooter() })

  function needPage(needed) {
    if (y + needed > PH - PB - 50) doc.addPage({ size: 'A4', margins: { top: PT, bottom: PB, left: ML, right: ML } })
  }

  // ─── Page 1 ────────────────────────────────────────────────────
  doc.addPage({ size: 'A4', margins: { top: PT, bottom: PB, left: ML, right: ML } })

  // Header box institucional
  drawHeader('Relatório de Reunião', `Análise Estratégica — ${investName}`, dataStr)

  // Metadata bar
  drawMetadataBar(participantesStr, reuniao.duracao_min)

  // 1. Sumario executivo
  if (analise?.resumo_executivo) {
    sectionNum('1', 'Sumário Executivo')
    paragraph(analise.resumo_executivo)
  }

  // Decisao chave / classificacao
  const cls = analise?.classificacao_sugerida || perfil?.classificacao
  const probInv = analise?.probabilidade_investimento
  if (cls || probInv != null) {
    const labels = { A: 'ELEVADO POTENCIAL', B: 'BOM POTENCIAL', C: 'POTENCIAL MODERADO', D: 'BAIXO POTENCIAL' }
    let txt = ''
    if (cls) txt = `Classificação ${cls} — ${labels[cls] || ''}.`
    if (probInv != null) txt += `${txt ? ' ' : ''}Probabilidade de investimento estimada em ${probInv}%.`
    callout('AVALIAÇÃO ESTRATÉGICA', txt)
  }

  // 2. Indicadores da reuniao (se houver)
  const indicadores = buildIndicadores(reuniao, analise, perfil)
  if (indicadores.length > 0) {
    sectionNum('2', 'Indicadores da Reunião')
    table(indicadores)
  }

  let secNum = indicadores.length > 0 ? 3 : 2

  // 3. Perfil do investidor
  const perfilRows = buildPerfilRows(perfil)
  if (perfilRows.length > 0) {
    sectionNum(String(secNum++), 'Perfil do Investidor')
    table(perfilRows)
  }

  // Objeccoes
  if (perfil?.objecoes) {
    const obs = Array.isArray(perfil.objecoes) ? perfil.objecoes : [perfil.objecoes]
    if (obs.filter(Boolean).length > 0) {
      subhead('Objeções e Preocupações')
      bulletList(obs.filter(Boolean), { color: '#b91c1c' })
    }
  }

  // 4. Pontos chave
  if (Array.isArray(analise?.pontos_chave) && analise.pontos_chave.length > 0) {
    sectionNum(String(secNum++), 'Pontos-Chave da Reunião')
    bulletList(analise.pontos_chave)
  }

  // 5. Oportunidades
  if (Array.isArray(analise?.oportunidades_apresentadas) && analise.oportunidades_apresentadas.length > 0) {
    sectionNum(String(secNum++), 'Oportunidades Apresentadas')
    for (const op of analise.oportunidades_apresentadas) {
      needPage(50)
      doc.font('Helvetica-Bold').fontSize(10.5).fillColor(TEXT).text(op.nome || 'Oportunidade', ML, y, { width: CW, lineBreak: true })
      y = doc.y + 1
      const meta = [op.tipo, op.valor].filter(Boolean).join(' · ')
      if (meta) {
        doc.font('Helvetica').fontSize(8.5).fillColor(GOLD).text(meta, ML, y, { width: CW, characterSpacing: 0.3 })
        y = doc.y + 2
      }
      if (op.detalhes) {
        doc.font('Helvetica').fontSize(9.5).fillColor(BODY).text(op.detalhes, ML, y, { width: CW, lineGap: 3, align: 'justify' })
        y = doc.y + 6
      }
      doc.lineWidth(0.5).strokeColor(BORDER).moveTo(ML, y).lineTo(ML + CW, y).stroke()
      y += 8
    }
  }

  // 6. Modelo de parceria
  if (analise?.modelo_parceria_discutido) {
    sectionNum(String(secNum++), 'Modelo de Parceria Discutido')
    paragraph(analise.modelo_parceria_discutido)
  }

  // Impressao
  if (analise?.impressao_investidor) {
    callout('IMPRESSÃO DO INVESTIDOR', analise.impressao_investidor)
  }

  // 7. Plano de accao / proximos passos
  if (Array.isArray(analise?.proximos_passos) && analise.proximos_passos.length > 0) {
    sectionNum(String(secNum++), 'Plano de Ação — Próximos Passos')
    actionTable(analise.proximos_passos)
  }

  // 8. Recomendacoes
  if (Array.isArray(analise?.sugestoes_melhoria) && analise.sugestoes_melhoria.length > 0) {
    sectionNum(String(secNum++), 'Recomendações para Próximas Reuniões')
    bulletList(analise.sugestoes_melhoria)
  }

  // Conclusao
  if (analise?.notas_adicionais) {
    sectionNum(String(secNum++), 'Notas Adicionais')
    paragraph(analise.notas_adicionais)
  }

  doc.end()
  return doc

  // ─── Drawing helpers (closures) ─────────────────────────────────
  function drawHeader(titulo, subtitulo, dataStr) {
    // Container box
    const headerH = 92
    doc.lineWidth(0.5).strokeColor(BORDER).rect(ML, y, CW, headerH).stroke()

    // Brand label (top-left)
    doc.font('Helvetica').fontSize(8).fillColor(MUTED)
      .text('SOMNIUM PROPERTIES', ML + 18, y + 16, { characterSpacing: 2.5, lineBreak: false })

    // Date label (top-right)
    doc.font('Helvetica').fontSize(7.5).fillColor(MUTED)
      .text('DATA', ML + CW - 100, y + 16, { width: 80, align: 'right', characterSpacing: 2, lineBreak: false })
    doc.font('Helvetica').fontSize(9).fillColor(TEXT)
      .text(dataStr, ML + CW - 100, y + 30, { width: 80, align: 'right', lineBreak: false })

    // Title
    doc.font('Helvetica-Bold').fontSize(20).fillColor(TEXT)
      .text(titulo, ML + 18, y + 36, { lineBreak: false })

    // Subtitle
    if (subtitulo) {
      doc.font('Helvetica').fontSize(9).fillColor(MUTED)
        .text(subtitulo, ML + 18, y + 64, { width: CW - 36, lineBreak: false })
    }

    // Bottom gold separator inside box
    doc.lineWidth(0.5).strokeColor(BORDER).moveTo(ML, y + headerH).lineTo(ML + CW, y + headerH).stroke()
    y += headerH + 8
  }

  function drawMetadataBar(participantesStr, duracaoMin) {
    const h = 32
    doc.lineWidth(0.5).strokeColor(BORDER).rect(ML, y, CW, h).stroke()
    let x = ML + 14
    const py = y + 11
    doc.font('Helvetica-Bold').fontSize(8).fillColor(TEXT).text('Participantes:', x, py, { lineBreak: false, continued: false })
    x += 64
    doc.font('Helvetica').fontSize(8).fillColor(BODY).text(participantesStr, x, py, { width: 200, lineBreak: false, ellipsis: true })
    x = ML + 290
    doc.font('Helvetica-Bold').fontSize(8).fillColor(TEXT).text('Fonte:', x, py, { lineBreak: false })
    x += 32
    doc.font('Helvetica').fontSize(8).fillColor(BODY).text('Transcrição Fireflies', x, py, { lineBreak: false })
    x = ML + 415
    doc.font('Helvetica-Bold').fontSize(8).fillColor(TEXT).text('Duração:', x, py, { lineBreak: false })
    x += 42
    doc.font('Helvetica').fontSize(8).fillColor(BODY).text(duracaoMin ? `${duracaoMin} min` : '—', x, py, { lineBreak: false })
    y += h + 18
  }

  function sectionNum(num, title) {
    needPage(50)
    // Gold bar | numeric+title
    doc.lineWidth(0).fillColor(GOLD).rect(ML, y, 3, 18).fill()
    doc.font('Helvetica-Bold').fontSize(13).fillColor(TEXT)
      .text(`${num}. ${title}`, ML + 12, y + 1, { lineBreak: false })
    y += 28
  }

  function subhead(text) {
    needPage(28)
    doc.font('Helvetica-Bold').fontSize(9).fillColor(GOLD_DARK)
      .text(text.toUpperCase(), ML, y, { characterSpacing: 1.2, lineBreak: false })
    y += 16
  }

  function paragraph(text) {
    const clean = String(text).replace(/\*\*/g, '').trim()
    needPage(30)
    doc.font('Helvetica').fontSize(10).fillColor(BODY)
      .text(clean, ML, y, { width: CW, lineGap: 4, align: 'justify' })
    y = doc.y + 10
  }

  function callout(label, text) {
    if (!text) return
    needPage(60)
    const txt = String(text).replace(/\*\*/g, '').trim()
    doc.font('Helvetica').fontSize(10).fillColor(BODY)
    const h = doc.heightOfString(txt, { width: CW - 30, lineGap: 4 })
    const boxH = h + 32
    // Background subtle
    doc.fillColor(BG).rect(ML, y, CW, boxH).fill()
    // Gold left bar
    doc.fillColor(GOLD).rect(ML, y, 3, boxH).fill()
    // Label
    doc.font('Helvetica-Bold').fontSize(8).fillColor(GOLD_DARK)
      .text(label, ML + 16, y + 10, { characterSpacing: 1.5, lineBreak: false })
    // Body italic
    doc.font('Helvetica-Oblique').fontSize(9.5).fillColor(BODY)
      .text(txt, ML + 16, y + 22, { width: CW - 30, lineGap: 3 })
    y += boxH + 12
  }

  function bulletList(items, opts = {}) {
    const color = opts.color || GOLD
    for (const it of items) {
      const txt = String(it).replace(/\*\*/g, '').trim()
      if (!txt) continue
      needPage(20)
      doc.font('Helvetica').fontSize(10).fillColor(BODY)
      const h = doc.heightOfString(txt, { width: CW - 18, lineGap: 3 })
      // Bullet circle
      doc.fillColor(color).circle(ML + 4, y + 5, 2).fill()
      doc.fontSize(10).fillColor(BODY)
        .text(txt, ML + 14, y, { width: CW - 18, lineGap: 3 })
      y += Math.max(h, 14) + 6
    }
    y += 4
  }

  function table(rows) {
    // rows: [[label, value], ...]
    const labelW = 180
    const valueW = CW - labelW - 24
    // Header underline gold
    doc.lineWidth(1).strokeColor(GOLD).moveTo(ML, y).lineTo(ML + CW, y).stroke()
    y += 8
    doc.font('Helvetica').fontSize(8).fillColor(MUTED)
      .text('Indicador', ML + 12, y, { lineBreak: false })
      .text('Posição / Valor', ML + 12 + labelW, y, { lineBreak: false })
    y += 14
    doc.lineWidth(0.5).strokeColor(BORDER).moveTo(ML, y).lineTo(ML + CW, y).stroke()
    y += 6

    for (let i = 0; i < rows.length; i++) {
      const [label, value] = rows[i]
      if (value == null || value === '') continue
      const valStr = String(value)
      doc.font('Helvetica').fontSize(9.5).fillColor(BODY)
      const valH = doc.heightOfString(valStr, { width: valueW, lineGap: 2 })
      const rowH = Math.max(valH, 14) + 10
      needPage(rowH + 4)
      // Label
      doc.font('Helvetica-Bold').fontSize(9.5).fillColor(TEXT)
        .text(label, ML + 12, y + 4, { width: labelW - 12, lineBreak: false, ellipsis: true })
      // Value
      doc.font('Helvetica').fontSize(9.5).fillColor(BODY)
        .text(valStr, ML + 12 + labelW, y + 4, { width: valueW, lineGap: 2 })
      y += rowH
      // Separator
      doc.lineWidth(0.5).strokeColor(BORDER).moveTo(ML, y).lineTo(ML + CW, y).stroke()
      y += 0
    }
    y += 14
  }

  function actionTable(items) {
    // items: array of strings or { responsavel, tarefa, prazo }
    const numW = 30
    const respW = 110
    const prazoW = 90
    const taskW = CW - numW - respW - prazoW - 24

    doc.lineWidth(1).strokeColor(GOLD).moveTo(ML, y).lineTo(ML + CW, y).stroke()
    y += 8
    doc.font('Helvetica').fontSize(8).fillColor(MUTED)
      .text('#', ML + 8, y, { lineBreak: false })
      .text('Responsável', ML + numW + 8, y, { lineBreak: false })
      .text('Tarefa', ML + numW + respW + 12, y, { lineBreak: false })
      .text('Prazo', ML + numW + respW + taskW + 16, y, { lineBreak: false })
    y += 14
    doc.lineWidth(0.5).strokeColor(BORDER).moveTo(ML, y).lineTo(ML + CW, y).stroke()
    y += 6

    items.forEach((it, i) => {
      const obj = typeof it === 'string' ? parseAcao(it) : it
      const tarefa = obj.tarefa || (typeof it === 'string' ? it : '')
      const responsavel = obj.responsavel || 'Equipa'
      const prazo = obj.prazo || '—'

      doc.font('Helvetica').fontSize(9.5).fillColor(BODY)
      const taskH = doc.heightOfString(tarefa, { width: taskW, lineGap: 2 })
      const rowH = Math.max(taskH, 14) + 10
      needPage(rowH + 4)

      doc.font('Helvetica-Bold').fontSize(9).fillColor(TEXT).text(String(i + 1), ML + 8, y + 4, { lineBreak: false })
      doc.font('Helvetica-Bold').fontSize(9).fillColor(TEXT).text(responsavel, ML + numW + 8, y + 4, { width: respW - 4, lineBreak: false, ellipsis: true })
      doc.font('Helvetica').fontSize(9.5).fillColor(BODY).text(tarefa, ML + numW + respW + 12, y + 4, { width: taskW, lineGap: 2 })
      doc.font('Helvetica').fontSize(9).fillColor(MUTED).text(prazo, ML + numW + respW + taskW + 16, y + 4, { width: prazoW, lineBreak: false })

      y += rowH
      doc.lineWidth(0.5).strokeColor(BORDER).moveTo(ML, y).lineTo(ML + CW, y).stroke()
    })
    y += 14
  }
}

// ─── Pure helpers ────────────────────────────────────────────────
function parseParticipantes(p) {
  if (!p) return []
  if (Array.isArray(p)) return p
  try { return JSON.parse(p) } catch { return [] }
}

function extractName(p) {
  if (!p) return null
  if (typeof p === 'string') {
    if (p.includes('@')) return p.split('@')[0].replace(/[._-]/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
    return p
  }
  return p.name || p.displayName || p.email || null
}

function cleanTitle(t) {
  return String(t || '').replace(/\s+e\s+alexandre\s+mendes/i, '').trim()
}

function parseAcao(s) {
  // tenta extrair "[Responsavel] tarefa (prazo)" ou padroes simples
  const m = String(s).match(/^([^:—-]+?)[:—-]\s*(.+?)(?:\s*\(([^)]+)\))?$/)
  if (m && m[1].length < 25) return { responsavel: m[1].trim(), tarefa: m[2].trim(), prazo: m[3]?.trim() || '—' }
  return { responsavel: 'Equipa', tarefa: s, prazo: '—' }
}

function buildIndicadores(reuniao, analise, perfil) {
  const rows = []
  if (analise?.classificacao_sugerida) {
    const labels = { A: 'ELEVADO POTENCIAL', B: 'BOM POTENCIAL', C: 'POTENCIAL MODERADO', D: 'BAIXO POTENCIAL' }
    rows.push(['Classificação', `${analise.classificacao_sugerida} — ${labels[analise.classificacao_sugerida] || ''}`])
  }
  if (analise?.probabilidade_investimento != null) rows.push(['Probabilidade de investimento', `${analise.probabilidade_investimento}%`])
  const cap = perfil?.capital_disponivel
  if (cap) {
    if (typeof cap === 'object') {
      const min = cap.min, max = cap.max
      if (min && max) rows.push(['Capital disponível', `€ ${formatNum(min)} – € ${formatNum(max)}`])
      else if (max) rows.push(['Capital disponível', `Até € ${formatNum(max)}`])
      else if (cap.notas) rows.push(['Capital disponível', cap.notas])
    } else {
      rows.push(['Capital disponível', String(cap)])
    }
  }
  if (perfil?.timeline_disponibilidade) rows.push(['Timeline', perfil.timeline_disponibilidade])
  if (reuniao.duracao_min) rows.push(['Duração da reunião', `${reuniao.duracao_min} minutos`])
  return rows
}

function buildPerfilRows(perfil) {
  if (!perfil) return []
  const fields = [
    ['Localização', perfil.localizacao],
    ['Profissão', perfil.profissao],
    ['Experiência Imobiliária', perfil.experiencia_imobiliario || perfil.experiencia_imobiliaria],
    ['Motivação', perfil.motivacao],
    ['Estratégia Preferida', Array.isArray(perfil.estrategia_preferida) ? perfil.estrategia_preferida.join(', ') : (Array.isArray(perfil.estrategia) ? perfil.estrategia.join(', ') : perfil.estrategia_preferida || perfil.estrategia)],
    ['Perfil de Risco', perfil.perfil_risco],
    ['Tipo de Investidor', Array.isArray(perfil.tipo_investidor) ? perfil.tipo_investidor.join(', ') : perfil.tipo_investidor],
  ]
  return fields.filter(([, v]) => v != null && v !== '')
}

function formatNum(n) {
  return Number(n).toLocaleString('pt-PT')
}
