/**
 * Relatorio Semanal de Administracao — layout institucional Somnium Properties.
 * Replica o template corporativo formal: header bordered, seccoes numeradas,
 * tabelas com header underline gold, callouts e footer institucional.
 */
import PDFDocument from 'pdfkit'

const GOLD = '#C9A84C'
const GOLD_DARK = '#a88a3a'
const TEXT = '#1f2937'
const BODY = '#374151'
const MUTED = '#6b7280'
const LIGHT = '#9ca3af'
const BORDER = '#e0ddd5'
const BG = '#fbfaf7'
const RED = '#b91c1c'
const ORANGE = '#c2410c'
const GREEN = '#15803d'

const PT = 60
const PB = 70
const ML = 60
const PW = 595.28
const PH = 841.89
const CW = PW - ML * 2

export function generateRelatorioSemanalPDF(relatorio) {
  const doc = new PDFDocument({ size: 'A4', autoFirstPage: false, margins: { top: PT, bottom: PB, left: ML, right: ML } })

  const conteudo = parseConteudo(relatorio.conteudo_json)
  const dataStr = formatDataPT(relatorio.data_inicio)
  const titulo = relatorio.titulo || 'Relatório de Reunião Semanal'
  const subtitulo = relatorio.subtitulo || 'Estratégia Comercial e Captação de Capital'
  const participantes = (conteudo.participantes || []).join(' · ') || '—'

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

  function needPage(needed) {
    if (y + needed > PH - PB - 50) doc.addPage({ size: 'A4', margins: { top: PT, bottom: PB, left: ML, right: ML } })
  }

  // ─── Render ──────────────────────────────────────────────────────
  doc.addPage({ size: 'A4', margins: { top: PT, bottom: PB, left: ML, right: ML } })
  drawHeader(titulo, subtitulo, dataStr)
  drawMetadataBar(participantes, conteudo.distribuicao || 'Equipa Somnium')

  // 1. Sumario Executivo
  if (conteudo.sumario_executivo) {
    sectionNum('1', 'Sumário Executivo')
    paragraph(conteudo.sumario_executivo)
  }

  // Decisao chave
  if (conteudo.decisao_chave) {
    callout('DECISÃO-CHAVE', conteudo.decisao_chave)
  }

  let n = 2

  // 2. Indicadores
  if (Array.isArray(conteudo.indicadores) && conteudo.indicadores.length > 0) {
    sectionNum(String(n++), 'Indicadores da Reunião')
    indicadorTable(conteudo.indicadores)
  }

  // 3. Captacao de capital — Novo parceiro (estrutura livre)
  if (conteudo.captacao_capital) {
    sectionNum(String(n++), conteudo.captacao_capital.titulo || 'Captação de Capital')
    if (conteudo.captacao_capital.perfil_investidor) {
      subhead(conteudo.captacao_capital.perfil_titulo || 'Perfil do Investidor')
      bulletList(toArray(conteudo.captacao_capital.perfil_investidor))
    }
    if (Array.isArray(conteudo.captacao_capital.criterios) && conteudo.captacao_capital.criterios.length > 0) {
      subhead('Critérios de Decisão de Investimento')
      table2cols(conteudo.captacao_capital.criterios, 'Critério', 'Posição do Investidor')
    }
    if (conteudo.captacao_capital.proposta_estrutural) {
      subhead('Proposta Estrutural Apresentada')
      paragraph(conteudo.captacao_capital.proposta_estrutural)
    }
    if (conteudo.captacao_capital.pendencia) {
      callout('PENDÊNCIA', conteudo.captacao_capital.pendencia)
    }
    if (Array.isArray(conteudo.captacao_capital.proximos_passos_relacionais) && conteudo.captacao_capital.proximos_passos_relacionais.length > 0) {
      subhead('Próximos Passos Relacionais')
      bulletList(conteudo.captacao_capital.proximos_passos_relacionais)
    }
  }

  // 4. Pipeline de investidores
  if (Array.isArray(conteudo.pipeline_investidores) && conteudo.pipeline_investidores.length > 0) {
    sectionNum(String(n++), 'Pipeline de Investidores — Mapa de Capital')
    pipelineTable(conteudo.pipeline_investidores)
  }

  // 5. Cenarios de alocacao
  if (Array.isArray(conteudo.cenarios_alocacao) && conteudo.cenarios_alocacao.length > 0) {
    sectionNum(String(n++), 'Cenários de Alocação de Capital')
    for (const c of conteudo.cenarios_alocacao) {
      subhead(c.titulo || 'Cenário')
      if (c.descricao) paragraph(c.descricao)
      if (Array.isArray(c.composicao) && c.composicao.length > 0) {
        compositionTable(c.composicao)
      }
    }
  }

  // 6. Analise de ativos
  if (Array.isArray(conteudo.ativos) && conteudo.ativos.length > 0) {
    for (const ativo of conteudo.ativos) {
      sectionNum(String(n++), `Análise do Ativo — ${ativo.nome || 'Ativo'}`)
      if (Array.isArray(ativo.estado_pipeline) && ativo.estado_pipeline.length > 0) {
        subhead('Estado do Pipeline')
        bulletList(ativo.estado_pipeline)
      }
      if (Array.isArray(ativo.analise_financeira) && ativo.analise_financeira.length > 0) {
        subhead('Análise Financeira')
        financialTable(ativo.analise_financeira)
      }
      if (ativo.posicao_negocial) callout('POSIÇÃO NEGOCIAL', ativo.posicao_negocial)
      if (ativo.risco_critico) {
        subhead('Risco Crítico')
        if (Array.isArray(ativo.risco_critico_tabela) && ativo.risco_critico_tabela.length > 0) {
          financialTable(ativo.risco_critico_tabela)
        }
        if (ativo.risco_critico_impacto) paragraph(ativo.risco_critico_impacto)
      }
      if (Array.isArray(ativo.riscos) && ativo.riscos.length > 0) {
        subhead('Riscos do Projeto')
        riskTable(ativo.riscos)
      }
    }
  }

  // 7. Compliance / posicionamento
  if (conteudo.compliance) {
    sectionNum(String(n++), conteudo.compliance.titulo || 'Posicionamento Estratégico e Compliance')
    if (Array.isArray(conteudo.compliance.seccoes)) {
      for (const sec of conteudo.compliance.seccoes) {
        subhead(sec.titulo)
        if (sec.texto) paragraph(sec.texto)
        if (Array.isArray(sec.bullets)) bulletList(sec.bullets)
        if (sec.principio) callout('PRINCÍPIO', sec.principio)
      }
    }
  }

  // 8. Plano de accao
  if (Array.isArray(conteudo.plano_accao) && conteudo.plano_accao.length > 0) {
    sectionNum(String(n++), 'Plano de Ação — Próxima Semana')
    actionTable(conteudo.plano_accao)
  }

  // 9. Conclusao
  if (conteudo.conclusao) {
    sectionNum(String(n++), 'Conclusão')
    paragraph(conteudo.conclusao)
  }

  doc.end()
  return doc

  // ─── Drawing helpers ──────────────────────────────────────────────
  function drawHeader(titulo, subtitulo, dataStr) {
    const headerH = 92
    doc.lineWidth(0.5).strokeColor(BORDER).rect(ML, y, CW, headerH).stroke()

    doc.font('Helvetica').fontSize(8).fillColor(MUTED)
      .text('SOMNIUM PROPERTIES', ML + 18, y + 16, { characterSpacing: 2.5, lineBreak: false })

    doc.font('Helvetica').fontSize(7.5).fillColor(MUTED)
      .text('DATA', ML + CW - 100, y + 16, { width: 80, align: 'right', characterSpacing: 2, lineBreak: false })
    doc.font('Helvetica').fontSize(9).fillColor(TEXT)
      .text(dataStr, ML + CW - 100, y + 30, { width: 80, align: 'right', lineBreak: false })

    doc.font('Helvetica-Bold').fontSize(20).fillColor(TEXT)
      .text(titulo, ML + 18, y + 36, { lineBreak: false })

    if (subtitulo) {
      doc.font('Helvetica').fontSize(9).fillColor(MUTED)
        .text(subtitulo, ML + 18, y + 64, { width: CW - 36, lineBreak: false })
    }

    doc.lineWidth(0.5).strokeColor(BORDER).moveTo(ML, y + headerH).lineTo(ML + CW, y + headerH).stroke()
    y += headerH + 8
  }

  function drawMetadataBar(participantesStr, distribuicao) {
    const h = 32
    doc.lineWidth(0.5).strokeColor(BORDER).rect(ML, y, CW, h).stroke()
    let x = ML + 14
    const py = y + 11
    doc.font('Helvetica-Bold').fontSize(8).fillColor(TEXT).text('Participantes:', x, py, { lineBreak: false })
    x += 64
    doc.font('Helvetica').fontSize(8).fillColor(BODY).text(participantesStr, x, py, { width: 200, lineBreak: false, ellipsis: true })
    x = ML + 290
    doc.font('Helvetica-Bold').fontSize(8).fillColor(TEXT).text('Fonte:', x, py, { lineBreak: false })
    x += 32
    doc.font('Helvetica').fontSize(8).fillColor(BODY).text('Transcrição Fireflies', x, py, { lineBreak: false })
    x = ML + 415
    doc.font('Helvetica-Bold').fontSize(8).fillColor(TEXT).text('Distribuição:', x, py, { lineBreak: false })
    x += 56
    doc.font('Helvetica').fontSize(8).fillColor(BODY).text(distribuicao, x, py, { lineBreak: false })
    y += h + 18
  }

  function sectionNum(num, title) {
    needPage(50)
    doc.fillColor(GOLD).rect(ML, y, 3, 18).fill()
    doc.font('Helvetica-Bold').fontSize(13).fillColor(TEXT)
      .text(`${num}. ${title}`, ML + 12, y + 1, { lineBreak: false })
    y += 28
  }

  function subhead(text) {
    needPage(28)
    doc.font('Helvetica-Bold').fontSize(9).fillColor(GOLD_DARK)
      .text(String(text).toUpperCase(), ML, y, { characterSpacing: 1.2, lineBreak: false })
    y += 16
  }

  function paragraph(text) {
    if (!text) return
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
    doc.fillColor(BG).rect(ML, y, CW, boxH).fill()
    doc.fillColor(GOLD).rect(ML, y, 3, boxH).fill()
    doc.font('Helvetica-Bold').fontSize(8).fillColor(GOLD_DARK)
      .text(label, ML + 16, y + 10, { characterSpacing: 1.5, lineBreak: false })
    doc.font('Helvetica-Oblique').fontSize(9.5).fillColor(BODY)
      .text(txt, ML + 16, y + 22, { width: CW - 30, lineGap: 3 })
    y += boxH + 12
  }

  function bulletList(items) {
    for (const it of items) {
      const txt = String(it).replace(/\*\*/g, '').trim()
      if (!txt) continue
      needPage(20)
      doc.font('Helvetica').fontSize(10).fillColor(BODY)
      const h = doc.heightOfString(txt, { width: CW - 18, lineGap: 3 })
      doc.fillColor(GOLD).circle(ML + 4, y + 5, 2).fill()
      doc.fontSize(10).fillColor(BODY)
        .text(txt, ML + 14, y, { width: CW - 18, lineGap: 3 })
      y += Math.max(h, 14) + 6
    }
    y += 4
  }

  // Tabela 2 colunas (label/valor) - usado em Indicadores
  function indicadorTable(rows) {
    drawTableHeader(['Indicador', 'Valor'])
    for (const r of rows) {
      const label = r.indicador || r.label || r[0]
      const value = r.valor || r.value || r[1]
      const highlight = r.highlight || (typeof value === 'string' && /risco|cri[ti]co|disparidade/i.test(value))
      drawRow2(label, value, { boldValue: true, valueColor: highlight ? RED : TEXT })
    }
    y += 10
  }

  // Tabela 2 colunas generica
  function table2cols(rows, h1, h2) {
    drawTableHeader([h1 || 'Coluna 1', h2 || 'Coluna 2'])
    for (const r of rows) {
      const a = r[0] || r.criterio || r.label
      const b = r[1] || r.posicao || r.value
      drawRow2(a, b)
    }
    y += 10
  }

  function drawTableHeader(headers) {
    needPage(30)
    doc.lineWidth(1).strokeColor(GOLD).moveTo(ML, y).lineTo(ML + CW, y).stroke()
    y += 8
    doc.font('Helvetica').fontSize(8).fillColor(MUTED)
    if (headers.length === 2) {
      doc.text(headers[0], ML + 12, y, { lineBreak: false })
      doc.text(headers[1], ML + 12 + Math.floor(CW / 2), y, { lineBreak: false })
    }
    y += 14
    doc.lineWidth(0.5).strokeColor(BORDER).moveTo(ML, y).lineTo(ML + CW, y).stroke()
    y += 6
  }

  function drawRow2(a, b, opts = {}) {
    if (a == null && b == null) return
    const aStr = String(a ?? '')
    const bStr = String(b ?? '')
    const colW = Math.floor(CW / 2) - 16
    doc.font('Helvetica').fontSize(9.5).fillColor(BODY)
    const h1 = doc.heightOfString(aStr, { width: colW, lineGap: 2 })
    const h2 = doc.heightOfString(bStr, { width: colW, lineGap: 2 })
    const rowH = Math.max(h1, h2, 14) + 10
    needPage(rowH + 4)
    doc.font(opts.boldValue ? 'Helvetica-Bold' : 'Helvetica').fontSize(9.5).fillColor(TEXT)
      .text(aStr, ML + 12, y + 4, { width: colW, lineGap: 2 })
    doc.font(opts.boldValue ? 'Helvetica-Bold' : 'Helvetica').fontSize(9.5).fillColor(opts.valueColor || BODY)
      .text(bStr, ML + 12 + Math.floor(CW / 2), y + 4, { width: colW, lineGap: 2 })
    y += rowH
    doc.lineWidth(0.5).strokeColor(BORDER).moveTo(ML, y).lineTo(ML + CW, y).stroke()
  }

  // Pipeline tabela 4 colunas
  function pipelineTable(rows) {
    const w1 = 100  // investidor
    const w2 = 100  // capital
    const w3 = 90   // estatuto
    const w4 = CW - w1 - w2 - w3 - 16  // observacoes
    needPage(30)
    doc.lineWidth(1).strokeColor(GOLD).moveTo(ML, y).lineTo(ML + CW, y).stroke()
    y += 8
    doc.font('Helvetica').fontSize(8).fillColor(MUTED)
      .text('Investidor', ML + 8, y, { lineBreak: false })
      .text('Capital', ML + w1 + 8, y, { lineBreak: false })
      .text('Estatuto', ML + w1 + w2 + 8, y, { lineBreak: false })
      .text('Observações', ML + w1 + w2 + w3 + 8, y, { lineBreak: false })
    y += 14
    doc.lineWidth(0.5).strokeColor(BORDER).moveTo(ML, y).lineTo(ML + CW, y).stroke()
    y += 6
    for (const r of rows) {
      doc.font('Helvetica').fontSize(9.5).fillColor(BODY)
      const obsH = doc.heightOfString(r.observacoes || '', { width: w4, lineGap: 2 })
      const rowH = Math.max(obsH, 14) + 10
      needPage(rowH + 4)
      const estatutoColor = /confirmad/i.test(r.estatuto || '') ? GREEN : /valida/i.test(r.estatuto || '') ? GOLD_DARK : MUTED
      doc.font('Helvetica-Bold').fontSize(9.5).fillColor(TEXT).text(r.investidor || '', ML + 8, y + 4, { width: w1 - 4, lineBreak: false })
      doc.font('Helvetica').fontSize(9.5).fillColor(BODY).text(r.capital || '', ML + w1 + 8, y + 4, { width: w2 - 4, lineBreak: false })
      doc.font('Helvetica-Bold').fontSize(9.5).fillColor(estatutoColor).text(r.estatuto || '', ML + w1 + w2 + 8, y + 4, { width: w3 - 4, lineBreak: false })
      doc.font('Helvetica').fontSize(9.5).fillColor(BODY).text(r.observacoes || '', ML + w1 + w2 + w3 + 8, y + 4, { width: w4, lineGap: 2 })
      y += rowH
      doc.lineWidth(0.5).strokeColor(BORDER).moveTo(ML, y).lineTo(ML + CW, y).stroke()
    }
    y += 14
  }

  function compositionTable(rows) {
    const w1 = 100, w3 = 80, w2 = CW - w1 - w3 - 16
    needPage(30)
    doc.lineWidth(1).strokeColor(GOLD).moveTo(ML, y).lineTo(ML + CW, y).stroke()
    y += 8
    doc.font('Helvetica').fontSize(8).fillColor(MUTED)
      .text('Fração', ML + 8, y, { lineBreak: false })
      .text('Composição de Capital', ML + w1 + 8, y, { lineBreak: false })
      .text('Total', ML + w1 + w2 + 8, y, { lineBreak: false })
    y += 14
    doc.lineWidth(0.5).strokeColor(BORDER).moveTo(ML, y).lineTo(ML + CW, y).stroke()
    y += 6
    for (const r of rows) {
      doc.font('Helvetica').fontSize(9.5).fillColor(BODY)
      const compH = doc.heightOfString(r.composicao || '', { width: w2, lineGap: 2 })
      const rowH = Math.max(compH, 14) + 10
      needPage(rowH + 4)
      doc.font('Helvetica-Bold').fontSize(9.5).fillColor(TEXT).text(r.fracao || '', ML + 8, y + 4, { width: w1 - 4, lineBreak: false })
      doc.font('Helvetica').fontSize(9.5).fillColor(BODY).text(r.composicao || '', ML + w1 + 8, y + 4, { width: w2, lineGap: 2 })
      doc.font('Helvetica-Bold').fontSize(9.5).fillColor(TEXT).text(r.total || '', ML + w1 + w2 + 8, y + 4, { width: w3 - 4, lineBreak: false })
      y += rowH
      doc.lineWidth(0.5).strokeColor(BORDER).moveTo(ML, y).lineTo(ML + CW, y).stroke()
    }
    y += 10
  }

  function financialTable(rows) {
    if (!rows || rows.length === 0) return
    const cols = Object.keys(rows[0])
    const colW = Math.floor((CW - 16) / cols.length)
    needPage(30)
    doc.lineWidth(1).strokeColor(GOLD).moveTo(ML, y).lineTo(ML + CW, y).stroke()
    y += 8
    cols.forEach((h, i) => {
      doc.font('Helvetica').fontSize(8).fillColor(MUTED)
        .text(humanize(h), ML + 8 + i * colW, y, { width: colW - 4, lineBreak: false })
    })
    y += 14
    doc.lineWidth(0.5).strokeColor(BORDER).moveTo(ML, y).lineTo(ML + CW, y).stroke()
    y += 6
    for (const r of rows) {
      const rowH = 22
      needPage(rowH + 4)
      cols.forEach((c, i) => {
        const v = String(r[c] ?? '')
        const highlight = /≈|disparidade|risco|cr[ií]tico/i.test(v) || c === 'disparidade'
        doc.font(i === 0 ? 'Helvetica-Bold' : 'Helvetica').fontSize(9.5)
          .fillColor(highlight ? RED : (i === 0 ? TEXT : BODY))
          .text(v, ML + 8 + i * colW, y + 4, { width: colW - 4, lineBreak: false })
      })
      y += rowH
      doc.lineWidth(0.5).strokeColor(BORDER).moveTo(ML, y).lineTo(ML + CW, y).stroke()
    }
    y += 10
  }

  function riskTable(rows) {
    const w1 = 200, w2 = 80, w3 = CW - w1 - w2 - 16
    needPage(30)
    doc.lineWidth(1).strokeColor(GOLD).moveTo(ML, y).lineTo(ML + CW, y).stroke()
    y += 8
    doc.font('Helvetica').fontSize(8).fillColor(MUTED)
      .text('Risco', ML + 8, y, { lineBreak: false })
      .text('Categoria', ML + w1 + 8, y, { lineBreak: false })
      .text('Mitigação', ML + w1 + w2 + 8, y, { lineBreak: false })
    y += 14
    doc.lineWidth(0.5).strokeColor(BORDER).moveTo(ML, y).lineTo(ML + CW, y).stroke()
    y += 6
    for (const r of rows) {
      doc.font('Helvetica').fontSize(9.5).fillColor(BODY)
      const mitH = doc.heightOfString(r.mitigacao || '', { width: w3, lineGap: 2 })
      const rowH = Math.max(mitH, 14) + 10
      needPage(rowH + 4)
      const cat = (r.categoria || '').toLowerCase()
      const catColor = cat === 'crítico' || cat === 'critico' ? RED : cat === 'moderado' ? ORANGE : MUTED
      doc.font('Helvetica').fontSize(9.5).fillColor(BODY).text(r.risco || '', ML + 8, y + 4, { width: w1 - 4, lineGap: 2 })
      doc.font('Helvetica-Bold').fontSize(9.5).fillColor(catColor).text(r.categoria || '', ML + w1 + 8, y + 4, { width: w2 - 4, lineBreak: false })
      doc.font('Helvetica').fontSize(9.5).fillColor(BODY).text(r.mitigacao || '', ML + w1 + w2 + 8, y + 4, { width: w3, lineGap: 2 })
      y += rowH
      doc.lineWidth(0.5).strokeColor(BORDER).moveTo(ML, y).lineTo(ML + CW, y).stroke()
    }
    y += 10
  }

  function actionTable(items) {
    const numW = 24, respW = 110, prazoW = 90
    const taskW = CW - numW - respW - prazoW - 16
    needPage(30)
    doc.lineWidth(1).strokeColor(GOLD).moveTo(ML, y).lineTo(ML + CW, y).stroke()
    y += 8
    doc.font('Helvetica').fontSize(8).fillColor(MUTED)
      .text('#', ML + 6, y, { lineBreak: false })
      .text('Responsável', ML + numW + 6, y, { lineBreak: false })
      .text('Tarefa', ML + numW + respW + 8, y, { lineBreak: false })
      .text('Prazo', ML + numW + respW + taskW + 12, y, { lineBreak: false })
    y += 14
    doc.lineWidth(0.5).strokeColor(BORDER).moveTo(ML, y).lineTo(ML + CW, y).stroke()
    y += 6
    items.forEach((it, i) => {
      doc.font('Helvetica').fontSize(9.5).fillColor(BODY)
      const taskH = doc.heightOfString(it.tarefa || '', { width: taskW, lineGap: 2 })
      const rowH = Math.max(taskH, 14) + 10
      needPage(rowH + 4)
      doc.font('Helvetica-Bold').fontSize(9).fillColor(TEXT).text(String(i + 1), ML + 6, y + 4, { lineBreak: false })
      doc.font('Helvetica-Bold').fontSize(9).fillColor(TEXT).text(it.responsavel || 'Equipa', ML + numW + 6, y + 4, { width: respW - 4, lineBreak: false, ellipsis: true })
      doc.font('Helvetica').fontSize(9.5).fillColor(BODY).text(it.tarefa || '', ML + numW + respW + 8, y + 4, { width: taskW, lineGap: 2 })
      doc.font('Helvetica').fontSize(9).fillColor(MUTED).text(it.prazo || '—', ML + numW + respW + taskW + 12, y + 4, { width: prazoW, lineBreak: false })
      y += rowH
      doc.lineWidth(0.5).strokeColor(BORDER).moveTo(ML, y).lineTo(ML + CW, y).stroke()
    })
    y += 10
  }
}

// ─── Helpers puros ────────────────────────────────────────────────
function parseConteudo(s) {
  if (!s) return {}
  if (typeof s === 'object') return s
  try { return JSON.parse(s) } catch { return {} }
}

function formatDataPT(d) {
  if (!d) return '—'
  const dt = new Date(d)
  if (isNaN(dt)) return '—'
  return dt.toLocaleDateString('pt-PT', { day: '2-digit', month: 'short', year: 'numeric' }).toUpperCase().replace(/\./g, '')
}

function toArray(v) {
  if (Array.isArray(v)) return v
  if (typeof v === 'string') return v.split(/\n+/).map(s => s.trim()).filter(Boolean)
  return []
}

function humanize(s) {
  return String(s).replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}
