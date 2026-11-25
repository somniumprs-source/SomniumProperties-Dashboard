/**
 * Relatório PDF das chamadas a investidores (Cold Call e Follow-up) avaliadas
 * contra o SOP 23 v2.1: indicadores, onde falhamos por passo, prioridades, objecções,
 * script recomendado e registo das chamadas do período.
 *
 * Gémeo Deno em supabase/functions/_shared/pdfChamadasInvestidores.ts — só
 * mudam os imports. Portar qualquer alteração para os dois.
 */
import PDFDocument from 'pdfkit'
import { LOGO_BLACK_PNG } from './logoBlack.js'
import { DOC_COLORS } from './docTheme.js'

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

const TIPO_LABEL = { cold_call: 'Cold Call', follow_up: 'Follow-up', discovery: 'Discovery' }
const RESULTADO_LABEL = { atendeu: 'Atendeu', nao_atendeu: 'Não atendeu', recusou: 'Recusou', numero_errado: 'Número errado' }
const PROXIMO_LABEL = { entrevista_marcada: 'Discovery/apresentação marcada', follow_up_agendado: 'Follow-up agendado', enviar_forms: 'Enviar Forms', sem_interesse: 'Sem interesse', nao_elegivel: 'Não elegível' }

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
  drawHeader('Relatório de Chamadas', 'Investidores · Chamada 1, Follow Up e Discovery · Avaliação SOP 23',
    `${fmtData(rel.periodo.desde)} a ${fmtData(rel.periodo.ate)}`)

  let n = 1
  const t = rel.totais
  const c = rel.conversao
  sectionNum(n++, 'Indicadores do Período')
  table([
    ['Chamadas registadas', `${t.chamadas} (${t.cold_call} Cold Call · ${t.follow_up} Follow-up)`],
    ['Chamadas analisadas', `${t.analisadas}${t.por_processar ? ` · ${t.por_processar} ainda em processamento` : ''}`],
    ['Nota SOP média', `${fmtNota(rel.nota_media.global)} (Cold Call ${fmtNota(rel.nota_media.cold_call)} · Follow-up ${fmtNota(rel.nota_media.follow_up)})`],
    ['Taxa de contacto', `${fmtPct(c.taxa_contacto)} (${t.nao_atendidas ?? 0} não atendidas de ${t.chamadas})`],
    ['Chamada 1 para Discovery', `${fmtPct(c.taxa_cold_entrevista)} (${c.cold_entrevista} de ${c.cold_atendidas} atendidas)`],
    ['Recontacto para Discovery', `${fmtPct(c.taxa_follow_entrevista)} (${c.follow_entrevista} de ${c.follow_atendidas} atendidas)`],
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

// ── Relatório de UMA chamada (SOP 23) ─────────────────────────
// g: linha de investidor_gravacoes (com analise); inv: ficha do investidor.
const TIPO_CALL_LABEL = { cold_call: 'Chamada 1 – Qualificação', follow_up: 'Recontacto de Follow Up', discovery: 'Discovery com bifurcação' }
const CRITERIOS_LABEL = { capital: 'Capital', via: 'Via', objetivo: 'Objetivo', urgencia: 'Urgência', experiencia: 'Experiência e confiança', decisor: 'Decisor' }
const PASSO_LABEL = {
  abertura: 'Abertura', gravacao: 'Permissão para gravar', experiencia: 'Experiência', montante: 'Montante', disponibilidade: 'Disponibilidade do capital',
  decisor: 'Decisor', sem_retornos: 'Sem oportunidades nem retornos', objeccoes: 'Objeções (secção 5)', fecho: 'Fecho e próximo passo',
  retoma: 'Retoma do que faltava', valor: 'Ângulo novo', qualifica_falta: 'Qualifica só o que faltava', objetivo: 'Bloco 1: Objetivo',
  porque: 'Bloco 2: Porquê e urgência', dor: 'Bloco 3: Desafios (a dor)', bifurcacao: 'Bifurcação', criterios_ativa: 'Critérios de compra (ativa)',
  confirmacao: 'Confirmar antes de terminar', regra_70_30: 'Regra 70/30',
}

export function generateChamadaInvestidorPDF(g, inv = {}) {
  const a = g?.analise || {}
  const doc = new PDFDocument({ size: 'A4', autoFirstPage: false, margins: { top: PT, bottom: PB, left: ML, right: ML } })
  let y = PT
  const novaPagina = () => doc.addPage({ size: 'A4', margins: { top: PT, bottom: PB, left: ML, right: ML } })
  function centrado(text, fy, size, font, color, cs = 0) {
    doc.fontSize(size).font(font).fillColor(color)
    const w = doc.widthOfString(text, { characterSpacing: cs })
    doc.text(text, (PW - w) / 2, fy, { lineBreak: false, characterSpacing: cs })
  }
  doc.on('pageAdded', () => {
    y = PT
    const fy = PH - PB + 30
    centrado('SOMNIUM PROPERTIES', fy, 7, 'Helvetica-Bold', GOLD, 1.5)
    centrado('Relatório de chamada · SOP 23 v2.1', fy + 10, 7, 'Helvetica', MUTED)
    centrado('Documento Confidencial — Uso Interno Somnium Properties', fy + 22, 6.5, 'Helvetica-Oblique', LIGHT)
  })
  const need = (h) => { if (y + h > PH - PB - 50) novaPagina() }
  const txt = (v) => (v == null || v === '' ? '—' : String(v))

  function secao(t) { need(46); doc.fillColor(GOLD).rect(ML, y, 3, 18).fill(); doc.font('Helvetica-Bold').fontSize(13).fillColor(TEXT).text(t, ML + 12, y + 1, { lineBreak: false }); y += 28 }
  function par(t, { size = 10, color = BODY, font = 'Helvetica' } = {}) {
    if (!t) return
    doc.font(font).fontSize(size); const h = doc.heightOfString(String(t), { width: CW, lineGap: 3 }); need(h + 8)
    doc.fillColor(color).text(String(t), ML, y, { width: CW, lineGap: 3 }); y = doc.y + 8
  }
  function lista(items) {
    for (const it of (items || []).filter(Boolean)) {
      const s = String(it); doc.font('Helvetica').fontSize(9.5); const h = doc.heightOfString(s, { width: CW - 18, lineGap: 2 }); need(h + 6)
      doc.fillColor(GOLD).circle(ML + 4, y + 5, 2).fill(); doc.fillColor(BODY).text(s, ML + 14, y, { width: CW - 18, lineGap: 2 }); y += h + 5
    }
    y += 4
  }
  function tabela(rows) {
    const lw = 170, vw = CW - lw - 24
    doc.lineWidth(1).strokeColor(GOLD).moveTo(ML, y).lineTo(ML + CW, y).stroke(); y += 6
    for (const [l, v] of rows) {
      const s = txt(v); doc.font('Helvetica').fontSize(9.5)
      const h = Math.max(doc.heightOfString(s, { width: vw, lineGap: 2 }), 14) + 8; need(h + 4)
      doc.font('Helvetica-Bold').fontSize(9.5).fillColor(TEXT).text(l, ML + 10, y + 4, { width: lw - 10, lineBreak: false, ellipsis: true })
      doc.font('Helvetica').fontSize(9.5).fillColor(BODY).text(s, ML + 10 + lw, y + 4, { width: vw, lineGap: 2 })
      y += h; doc.lineWidth(0.5).strokeColor(BORDER).moveTo(ML, y).lineTo(ML + CW, y).stroke()
    }
    y += 12
  }
  function barra(label, nota, comentario) {
    need(comentario ? 40 : 20)
    const lw = 190, bw = CW - lw - 50
    const pct = nota == null ? 0 : (Number(nota) / 2) * 100
    const cor = nota == null ? LIGHT : pct >= 75 ? DOC_COLORS.green : pct >= 50 ? DOC_COLORS.amber : DOC_COLORS.red
    doc.font('Helvetica').fontSize(9).fillColor(BODY).text(label, ML, y + 1, { width: lw - 8, lineBreak: false, ellipsis: true })
    doc.fillColor(DOC_COLORS.light).rect(ML + lw, y + 2, bw, 8).fill()
    if (nota != null) doc.fillColor(cor).rect(ML + lw, y + 2, Math.max(1, bw * pct / 100), 8).fill()
    doc.font('Helvetica-Bold').fontSize(9).fillColor(TEXT).text(nota == null ? 'n/a' : `${nota}/2`, ML + lw + bw + 8, y + 1, { lineBreak: false })
    y += 15
    if (comentario) { doc.font('Helvetica').fontSize(8).fillColor(MUTED).text(comentario, ML + 10, y, { width: CW - 10, lineGap: 1 }); y = doc.y + 6 }
  }

  novaPagina()
  // Cabeçalho
  const headerH = 92
  doc.lineWidth(0.5).strokeColor(BORDER).rect(ML, y, CW, headerH).stroke()
  try { doc.image(LOGO_BLACK_PNG, ML + 18, y + 14, { height: 16 }) } catch { doc.font('Helvetica').fontSize(8).fillColor(MUTED).text('SOMNIUM PROPERTIES', ML + 18, y + 16, { lineBreak: false }) }
  doc.font('Helvetica').fontSize(7.5).fillColor(MUTED).text('DATA DA CHAMADA', ML + CW - 180, y + 16, { width: 160, align: 'right', characterSpacing: 2, lineBreak: false })
  doc.font('Helvetica').fontSize(9).fillColor(TEXT).text(fmtData(g.data_chamada), ML + CW - 180, y + 30, { width: 160, align: 'right', lineBreak: false })
  doc.font('Helvetica-Bold').fontSize(18).fillColor(TEXT).text(`Relatório da chamada: ${inv.nome || ''}`, ML + 18, y + 38, { width: CW - 36, lineBreak: false, ellipsis: true })
  doc.font('Helvetica').fontSize(9).fillColor(MUTED).text(`${TIPO_CALL_LABEL[g.tipo_chamada] || 'Chamada'} · ${g.realizada_por || 'Somnium'} · Nota SOP 23: ${g.nota_sop ?? '—'}/100`, ML + 18, y + 64, { width: CW - 36, lineBreak: false })
  y += headerH + 18

  secao('1. Resumo')
  par(a.resumo)
  tabela([
    ['Interesse do investidor', a.interesse_investidor], ['Sentimento', a.sentimento],
    ['Resultado', RESULTADO_LABEL[g.resultado || a.sugestao_resultado]], ['Próximo passo registado', PROXIMO_LABEL[g.proximo_passo || a.sugestao_proximo_passo]],
    ['Temperatura', g.temperatura || a.sugestao_temperatura], ['Data de follow-up', g.data_follow_up || a.sugestao_data_follow_up],
    ['Próximo passo recomendado', a.proximo_passo],
  ])

  const conf = a.conformidade || {}
  const alertas = [
    conf.promessa_rentabilidade_garantida && 'Promessa de rentabilidade garantida.',
    conf.informacao_financeira_detalhada_cedo && 'Oportunidades, números ou retornos antes da apresentação.',
    conf.abriu_com_tem_2_minutos && 'Abriu com "tem 2 minutos?".',
    conf.fala_mais_de_metade && 'Quem ligou falou mais de metade do tempo (regra 70/30).',
    conf.urgencia_inventada && 'Urgência inventada.',
  ].filter(Boolean)
  secao('2. Conformidade com o SOP 23')
  if (alertas.length) lista(alertas); else par('Sem alertas de conformidade.', { color: MUTED })
  if (conf.comentario) par(conf.comentario, { size: 9, color: MUTED })

  secao('3. Avaliação por passo do guião')
  for (const [k, p] of Object.entries(a.passos || {})) barra(PASSO_LABEL[k] || k, p?.nota ?? null, p?.comentario || null)
  y += 6

  const sc = a.scorecard_discovery || {}
  if (Object.keys(sc).length) {
    secao('4. Scorecard de qualificação (prova desta chamada)')
    tabela(Object.entries(CRITERIOS_LABEL).map(([k, l]) => [l, sc[k]?.nota == null ? 'sem prova nesta chamada' : `${sc[k].nota}/2${sc[k].evidencia ? ` · "${sc[k].evidencia}"${sc[k].minuto ? ` (${sc[k].minuto})` : ''}` : ''}`]))
    par(`Classe actual do investidor: ${inv.classificacao || 'sem classe'}${inv.pontuacao_discovery != null ? ` (${inv.pontuacao_discovery}/12)` : ''}. A classe é automática: junta esta chamada aos contactos anteriores.`, { size: 9, color: MUTED })
  }

  const d = a.dados_recolhidos || {}
  secao('5. Dados recolhidos (Anexo B)')
  tabela([
    ['Experiência', d.experiencia], ['Intervalo de montante', ({ menos_50k: 'Menos de 50 mil', '50k_200k': '50 a 200 mil', '200k_300k': '200 a 300 mil', mais_300k: 'Mais de 300 mil' })[d.intervalo_montante] || d.intervalo_montante], ['Capital disponível', d.capital_disponivel],
    ['Decisor', d.decisor], ['Objetivo', d.objetivo], ['Motivo real', d.motivo_real], ['Urgência', d.urgencia],
    ['Capital hoje e rendimento', d.capital_hoje_rendimento], ['Desafio', d.desafio],
    ['Via', d.via ? `${d.via}${d.sinais_coerentes === false ? ' (sinais não batem)' : ''}` : null],
    ['O que falta', d.o_que_falta],
  ])
  if (Array.isArray(d.frases_investidor) && d.frases_investidor.length) { par('Frases do investidor', { font: 'Helvetica-Bold', size: 9.5, color: TEXT }); lista(d.frases_investidor.map(f => `"${f}"`)) }
  if (Array.isArray(d.dados_em_falta) && d.dados_em_falta.length) { par('Ficou por recolher', { font: 'Helvetica-Bold', size: 9.5, color: TEXT }); lista(d.dados_em_falta) }

  if (a.pontos_fortes?.length || a.pontos_fracos?.length) secao('6. Pontos fortes e a melhorar')
  if (a.pontos_fortes?.length) { par('Pontos fortes', { font: 'Helvetica-Bold', size: 9.5, color: TEXT }); lista(a.pontos_fortes) }
  if (a.pontos_fracos?.length) { par('A melhorar', { font: 'Helvetica-Bold', size: 9.5, color: TEXT }); lista(a.pontos_fracos) }

  if (Array.isArray(a.objeccoes) && a.objeccoes.length) {
    secao('7. Objeções')
    lista(a.objeccoes.map(o => `${o.objeccao}${o.resposta_dada ? `. Respondemos: ${o.resposta_dada}` : ''}${o.sugestao ? `. Melhor resposta: ${o.sugestao}` : ''}`))
  }
  if (Array.isArray(a.melhorias_script) && a.melhorias_script.length) {
    secao('8. Frases a usar da próxima vez')
    lista(a.melhorias_script.map(m => `${m.momento ? `[${m.momento}] ` : ''}${m.em_vez_de ? `Em vez de "${m.em_vez_de}", ` : ''}dizer: "${m.dizer}"`))
  }
  doc.end()
  return doc
}
