// @ts-nocheck
/**
 * Relatório PDF das chamadas a investidores (Cold Call e Follow-up) avaliadas
 * contra o SOP 4: indicadores, onde falhamos por passo, prioridades, objecções,
 * script recomendado e registo das chamadas do período.
 *
 * Gémeo Node em src/db/pdfChamadasInvestidores.js — só mudam os imports
 * (PDFDocument vem do pdfkitGuard.ts). Portar qualquer alteração para os dois.
 */
import PDFDocument from "./pdfkitGuard.ts"
import { LOGO_BLACK_PNG } from "./logoBlack.ts"
import { DOC_COLORS } from "./docTheme.ts"

const GOLD = DOC_COLORS.gold
const GOLD_DARK = DOC_COLORS.goldDark
const TEXT = DOC_COLORS.black
const BODY = DOC_COLORS.body
const MUTED = DOC_COLORS.muted
const LIGHT = DOC_COLORS.mutedLight
const BORDER = DOC_COLORS.border
const BG = DOC_COLORS.bg

const PT = 60
const PB = 70
const ML = 60
const PW = 595.28
const PH = 841.89
const CW = PW - ML * 2

const TIPO_LABEL = { cold_call: 'Cold Call', follow_up: 'Follow-up' }
const RESULTADO_LABEL = { atendeu: 'Atendeu', nao_atendeu: 'Não atendeu', recusou: 'Recusou', numero_errado: 'Número errado' }
const PROXIMO_LABEL = { entrevista_marcada: 'Entrevista marcada', follow_up_agendado: 'Follow-up agendado', enviar_forms: 'Enviar Forms', sem_interesse: 'Sem interesse', nao_elegivel: 'Não elegível' }

const fmtData = (d) => {
  if (!d) return '—'
  const dt = new Date(String(d).slice(0, 10) + 'T00:00:00')
  return Number.isNaN(dt.getTime()) ? String(d) : dt.toLocaleDateString('pt-PT')
}
const num = (v) => String(v).replace('.', ',')
const fmtPct = (v) => (v == null ? '—' : `${num(v)}%`)
const fmtNota = (v) => (v == null ? '—' : `${num(v)}/100`)

export function generateChamadasInvestidoresPDF(rel, sintese) {
  const doc = new PDFDocument({ size: 'A4', autoFirstPage: false, margins: { top: PT, bottom: PB, left: ML, right: ML } })
  let y = PT

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
  doc.on('pageAdded', () => { y = PT; drawFooter() })
  const needPage = (needed) => { if (y + needed > PH - PB - 50) doc.addPage({ size: 'A4', margins: { top: PT, bottom: PB, left: ML, right: ML } }) }

  doc.addPage({ size: 'A4', margins: { top: PT, bottom: PB, left: ML, right: ML } })
  drawHeader('Relatório de Chamadas', 'Investidores · Cold Call e Follow-up · Avaliação SOP 4',
    `${fmtData(rel.periodo.desde)} a ${fmtData(rel.periodo.ate)}`)

  let n = 1
  const t = rel.totais
  const c = rel.conversao
  sectionNum(n++, 'Indicadores do Período')
  table([
    ['Chamadas registadas', `${t.chamadas} (${t.cold_call} Cold Call · ${t.follow_up} Follow-up)`],
    ['Chamadas analisadas', `${t.analisadas}${t.por_processar ? ` · ${t.por_processar} ainda em processamento` : ''}`],
    ['Nota SOP média', `${fmtNota(rel.nota_media.global)} (Cold Call ${fmtNota(rel.nota_media.cold_call)} · Follow-up ${fmtNota(rel.nota_media.follow_up)})`],
    ['Taxa de contacto', fmtPct(c.taxa_contacto)],
    ['Cold Call para Entrevista', `${fmtPct(c.taxa_cold_entrevista)} (${c.cold_entrevista} de ${c.cold_atendidas} atendidas)`],
    ['Follow-up para Entrevista', `${fmtPct(c.taxa_follow_entrevista)} (${c.follow_entrevista} de ${c.follow_atendidas} atendidas)`],
    ['Sem interesse / não elegível', String(c.sem_interesse)],
    ['Follow-ups sem data definida', String(c.follow_up_sem_data)],
    ['Temperatura dos leads', `Quente ${rel.temperatura.quente} · Intermédio ${rel.temperatura.intermedio} · Frio ${rel.temperatura.frio}`],
    ['Alertas de conformidade', `${rel.conformidade.promessas_rentabilidade} promessa(s) de rentabilidade · ${rel.conformidade.info_financeira_cedo} com informação financeira cedo demais`],
  ])
  if (t.sem_registo_manual) {
    paragraph(`Nota: ${t.sem_registo_manual} chamada(s) sem registo manual confirmado. Nesses casos os indicadores usam a sugestão da IA.`, { size: 8.5, color: MUTED })
  }

  if (sintese?.diagnostico) {
    sectionNum(n++, 'Diagnóstico')
    callout('LEITURA DO PERÍODO', sintese.diagnostico)
  }

  sectionNum(n++, 'Onde Estamos a Falhar (Nota por Passo do SOP)')
  for (const tipo of ['cold_call', 'follow_up']) {
    const passos = (rel.passos[tipo] || []).filter(p => p.n > 0).sort((a, b) => a.pct - b.pct)
    if (!passos.length) continue
    subhead(TIPO_LABEL[tipo])
    for (const p of passos) barra(p.label, p.pct, p.n)
    y += 6
  }
  if (!rel.totais.analisadas) paragraph('Sem chamadas analisadas no período.')

  if (Array.isArray(sintese?.prioridades) && sintese.prioridades.length) {
    sectionNum(n++, 'Prioridades para a Próxima Semana')
    sintese.prioridades.forEach((p, i) => {
      needPage(60)
      doc.font('Helvetica-Bold').fontSize(10).fillColor(TEXT).text(`${i + 1}. ${p.titulo || ''}`, ML, y, { width: CW })
      y = doc.y + 3
      if (p.porque) { doc.font('Helvetica').fontSize(9).fillColor(MUTED).text(`Porquê: ${p.porque}`, ML + 14, y, { width: CW - 14, lineGap: 2 }); y = doc.y + 2 }
      if (p.accao) { doc.font('Helvetica').fontSize(9.5).fillColor(BODY).text(`Acção: ${p.accao}`, ML + 14, y, { width: CW - 14, lineGap: 2 }); y = doc.y + 10 }
    })
  }

  const objs = Array.isArray(sintese?.objeccoes_frequentes) ? sintese.objeccoes_frequentes : []
  if (objs.length) {
    sectionNum(n++, 'Objecções Frequentes e Melhor Resposta')
    for (const o of objs) {
      needPage(50)
      doc.font('Helvetica-Bold').fontSize(9.5).fillColor(TEXT)
        .text(`${o.objeccao || ''}${o.frequencia ? `  (${o.frequencia}x)` : ''}`, ML, y, { width: CW })
      y = doc.y + 3
      doc.font('Helvetica-Oblique').fontSize(9.5).fillColor(BODY).text(o.melhor_resposta || '', ML + 14, y, { width: CW - 14, lineGap: 2 })
      y = doc.y + 10
    }
  }

  const sc = sintese?.script_cold_call
  if (sc && (sc.abertura || sc.fecho || sc.qualificacao?.length)) {
    sectionNum(n++, 'Script Recomendado de Cold Call')
    if (sc.abertura) callout('ABERTURA', sc.abertura)
    if (Array.isArray(sc.qualificacao) && sc.qualificacao.length) { subhead('Perguntas de qualificação'); bulletList(sc.qualificacao) }
    if (sc.fecho) callout('FECHO', sc.fecho)
  }

  if (Array.isArray(sintese?.follow_up) && sintese.follow_up.length) {
    sectionNum(n++, 'Recomendações para os Follow-ups')
    bulletList(sintese.follow_up)
  }

  if (rel.evolucao.length > 1) {
    sectionNum(n++, 'Evolução Semanal da Nota SOP')
    gridTable(['Semana de', 'Nota média', 'Chamadas'], [180, 150, CW - 330],
      rel.evolucao.map(e => [fmtData(e.semana), fmtNota(e.nota_media), String(e.n)]))
  }

  if (rel.chamadas.length) {
    sectionNum(n++, 'Registo de Chamadas')
    gridTable(['Data', 'Investidor', 'Tipo', 'Resultado', 'Próximo passo', 'Nota'], [58, 130, 62, 70, 103, CW - 423],
      rel.chamadas.map(g => [
        fmtData(g.data_chamada), g.investidor_nome || '—', TIPO_LABEL[g.tipo_chamada] || '—',
        RESULTADO_LABEL[g.resultado] || '—', PROXIMO_LABEL[g.proximo_passo] || '—', g.nota_sop == null ? '—' : String(g.nota_sop),
      ]))
  }

  doc.end()
  return doc

  function drawHeader(titulo, subtitulo, dataStr) {
    const headerH = 92
    doc.lineWidth(0.5).strokeColor(BORDER).rect(ML, y, CW, headerH).stroke()
    try {
      doc.image(LOGO_BLACK_PNG, ML + 18, y + 14, { height: 16 })
    } catch {
      doc.font('Helvetica').fontSize(8).fillColor(MUTED).text('SOMNIUM PROPERTIES', ML + 18, y + 16, { characterSpacing: 2.5, lineBreak: false })
    }
    doc.font('Helvetica').fontSize(7.5).fillColor(MUTED)
      .text('PERÍODO', ML + CW - 180, y + 16, { width: 160, align: 'right', characterSpacing: 2, lineBreak: false })
    doc.font('Helvetica').fontSize(9).fillColor(TEXT)
      .text(dataStr, ML + CW - 180, y + 30, { width: 160, align: 'right', lineBreak: false })
    doc.font('Helvetica-Bold').fontSize(20).fillColor(TEXT).text(titulo, ML + 18, y + 36, { lineBreak: false })
    doc.font('Helvetica').fontSize(9).fillColor(MUTED).text(subtitulo, ML + 18, y + 64, { width: CW - 36, lineBreak: false })
    y += headerH + 18
  }

  function sectionNum(num, title) {
    needPage(50)
    doc.lineWidth(0).fillColor(GOLD).rect(ML, y, 3, 18).fill()
    doc.font('Helvetica-Bold').fontSize(13).fillColor(TEXT).text(`${num}. ${title}`, ML + 12, y + 1, { lineBreak: false })
    y += 28
  }

  function subhead(text) {
    needPage(28)
    doc.font('Helvetica-Bold').fontSize(9).fillColor(GOLD_DARK).text(text.toUpperCase(), ML, y, { characterSpacing: 1.2, lineBreak: false })
    y += 16
  }

  function paragraph(text, { size = 10, color = BODY } = {}) {
    needPage(30)
    doc.font('Helvetica').fontSize(size).fillColor(color).text(String(text).trim(), ML, y, { width: CW, lineGap: 3 })
    y = doc.y + 10
  }

  function callout(label, text) {
    const txt = String(text || '').trim()
    if (!txt) return
    doc.font('Helvetica-Oblique').fontSize(9.5)
    const h = doc.heightOfString(txt, { width: CW - 30, lineGap: 3 })
    const boxH = h + 32
    needPage(boxH + 12)
    doc.fillColor(BG).rect(ML, y, CW, boxH).fill()
    doc.fillColor(GOLD).rect(ML, y, 3, boxH).fill()
    doc.font('Helvetica-Bold').fontSize(8).fillColor(GOLD_DARK).text(label, ML + 16, y + 10, { characterSpacing: 1.5, lineBreak: false })
    doc.font('Helvetica-Oblique').fontSize(9.5).fillColor(BODY).text(txt, ML + 16, y + 22, { width: CW - 30, lineGap: 3 })
    y += boxH + 12
  }

  function bulletList(items) {
    for (const it of items) {
      const txt = String(it || '').trim()
      if (!txt) continue
      doc.font('Helvetica').fontSize(10)
      const h = doc.heightOfString(txt, { width: CW - 18, lineGap: 3 })
      needPage(h + 8)
      doc.fillColor(GOLD).circle(ML + 4, y + 5, 2).fill()
      doc.fontSize(10).fillColor(BODY).text(txt, ML + 14, y, { width: CW - 18, lineGap: 3 })
      y += Math.max(h, 14) + 6
    }
    y += 4
  }

  // Barra horizontal 0-100% com o label do passo à esquerda.
  function barra(label, valor, amostra) {
    needPage(20)
    const labelW = 190
    const barW = CW - labelW - 70
    const cor = valor >= 75 ? DOC_COLORS.green : valor >= 50 ? DOC_COLORS.amber : DOC_COLORS.red
    doc.font('Helvetica').fontSize(9).fillColor(BODY).text(label, ML, y + 1, { width: labelW - 8, lineBreak: false, ellipsis: true })
    doc.fillColor(DOC_COLORS.light).rect(ML + labelW, y + 2, barW, 8).fill()
    doc.fillColor(cor).rect(ML + labelW, y + 2, Math.max(1, barW * (valor || 0) / 100), 8).fill()
    doc.font('Helvetica-Bold').fontSize(9).fillColor(TEXT).text(`${valor}%`, ML + labelW + barW + 8, y + 1, { lineBreak: false })
    doc.font('Helvetica').fontSize(7.5).fillColor(MUTED).text(`n=${amostra}`, ML + labelW + barW + 38, y + 2, { lineBreak: false })
    y += 17
  }

  function table(rows) {
    const labelW = 200
    const valueW = CW - labelW - 24
    doc.lineWidth(1).strokeColor(GOLD).moveTo(ML, y).lineTo(ML + CW, y).stroke()
    y += 6
    for (const [label, value] of rows) {
      const valStr = String(value ?? '—')
      doc.font('Helvetica').fontSize(9.5)
      const rowH = Math.max(doc.heightOfString(valStr, { width: valueW, lineGap: 2 }), 14) + 10
      needPage(rowH + 4)
      doc.font('Helvetica-Bold').fontSize(9.5).fillColor(TEXT).text(label, ML + 12, y + 4, { width: labelW - 12, lineBreak: false, ellipsis: true })
      doc.font('Helvetica').fontSize(9.5).fillColor(BODY).text(valStr, ML + 12 + labelW, y + 4, { width: valueW, lineGap: 2 })
      y += rowH
      doc.lineWidth(0.5).strokeColor(BORDER).moveTo(ML, y).lineTo(ML + CW, y).stroke()
    }
    y += 14
  }

  function gridTable(headers, widths, rows) {
    const drawHead = () => {
      doc.fillColor(DOC_COLORS.tableHeaderBg).rect(ML, y, CW, 18).fill()
      let x = ML
      headers.forEach((h, i) => {
        doc.font('Helvetica-Bold').fontSize(8).fillColor(TEXT).text(h, x + 5, y + 5, { width: widths[i] - 8, lineBreak: false, ellipsis: true })
        x += widths[i]
      })
      y += 18
    }
    needPage(40)
    drawHead()
    rows.forEach((r, ri) => {
      if (y + 18 > PH - PB - 50) { doc.addPage({ size: 'A4', margins: { top: PT, bottom: PB, left: ML, right: ML } }); drawHead() }
      if (ri % 2) doc.fillColor(DOC_COLORS.tableRowAlt2).rect(ML, y, CW, 16).fill()
      let x = ML
      r.forEach((cell, i) => {
        doc.font('Helvetica').fontSize(8).fillColor(BODY).text(String(cell ?? '—'), x + 5, y + 4, { width: widths[i] - 8, lineBreak: false, ellipsis: true })
        x += widths[i]
      })
      y += 16
    })
    y += 12
  }
}
