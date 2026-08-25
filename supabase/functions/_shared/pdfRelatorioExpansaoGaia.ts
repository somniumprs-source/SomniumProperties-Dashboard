// @ts-nocheck
// Gerador do Relatorio Executivo de Expansao para Vila Nova de Gaia.
// Reaproveita os helpers da classe DocBuilder em pdfImovelDocs.ts para
// manter consistencia visual com os restantes documentos Somnium.
//
// Uso:
//   import { generateRelatorioExpansaoGaia } from './pdfRelatorioExpansaoGaia.ts'
//   const doc = generateRelatorioExpansaoGaia()
//   doc.pipe(res) // ou streamToBuffer(doc)
//
// O dataset vive em expansaoGaiaData.ts para permitir actualizacoes sem
// tocar no codigo de renderizacao.

import PDFDocument from './pdfkitGuard.ts'
import { LOGO_BLACK_PNG } from './logoBlack.ts'
import { DADOS_EXPANSAO_GAIA } from './expansaoGaiaData.ts'
import { DOC_COLORS } from './docTheme.ts'

const C = {
  gold: DOC_COLORS.gold, black: DOC_COLORS.black, white: DOC_COLORS.white,
  body: DOC_COLORS.body, muted: DOC_COLORS.muted,
  border: DOC_COLORS.border, light: DOC_COLORS.light, headerBg: DOC_COLORS.tableHeaderBg, totalBg: DOC_COLORS.tableRowAlt1,
  green: DOC_COLORS.green, red: DOC_COLORS.red, amber: DOC_COLORS.amber,
}
const ML = 50, MR = 50
const PW = 595.28, PH = 841.89
const CW = PW - ML - MR

const EUR = v => v == null ? '—' : new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(v)
const NOW = () => new Date().toLocaleDateString('pt-PT', { day: '2-digit', month: 'long', year: 'numeric' })
const FMT_NUM = v => v == null ? '—' : new Intl.NumberFormat('pt-PT', { maximumFractionDigits: 0 }).format(v)
const FMT_PCT = (v, casas = 1) => v == null ? '—' : `${v >= 0 ? '+' : ''}${v.toFixed(casas)}%`

class Builder {
  constructor(meta) {
    this.doc = new PDFDocument({
      size: 'A4',
      autoFirstPage: false,
      bufferPages: true,
      info: {
        Title: meta.titulo,
        Author: 'Somnium Properties',
        Subject: `${meta.titulo} — ${meta.subtitulo}`,
        Keywords: 'Somnium Properties, Vila Nova de Gaia, Expansao, Wholesaling, Investimento Imobiliario',
        Producer: 'Somnium CRM',
        Creator: 'Somnium CRM',
      },
    })
    this.title = meta.titulo
    this.subtitulo = meta.subtitulo
    this.autor = meta.autor
    this.y = 0
    this._drawCover()
    this.newPage()
  }

  _drawCover() {
    const d = this.doc
    d.addPage({ size: 'A4', margins: { top: 0, bottom: 0, left: 0, right: 0 } })
    d.rect(0, 0, PW, 6).fill(C.gold)
    const LW = 450
    const LH = LW / (1516 / 614)
    const BLOCK_H = LH + 35 + 1.5 + 25 + 37 + 15 + 13 + 12 + 13 + 25 + 0.5 + 15 + 12
    const LY = 6 + ((PH - 65 - 6) - BLOCK_H) / 2
    try { d.image(LOGO_BLACK_PNG, (PW - LW) / 2, LY, { width: LW }) } catch {}
    const accent1Y = LY + LH + 35
    const titleY = accent1Y + 1.5 + 25
    const subY = titleY + 37 + 15
    const subtitleY = subY + 13 + 12
    const accent2Y = subtitleY + 13 + 25
    const dateY = accent2Y + 0.5 + 15
    d.rect(PW / 2 - 30, accent1Y, 60, 1.5).fill(C.gold)
    d.font('Helvetica-Bold').fontSize(26).fillColor(C.body).text(this.title, ML, titleY, { width: CW, align: 'center' })
    d.font('Helvetica').fontSize(10).fillColor(C.gold).text('VILA NOVA DE GAIA · DISTRITO DO PORTO', ML, subY, { width: CW, align: 'center', characterSpacing: 1.5 })
    d.fontSize(10).fillColor(C.muted).text(this.subtitulo, ML, subtitleY, { width: CW, align: 'center' })
    d.rect(ML + 80, accent2Y, CW - 160, 0.5).fill(C.gold)
    d.fontSize(9).fillColor(C.muted).text(NOW() + '  ·  ' + this.autor, ML, dateY, { width: CW, align: 'center' })
    d.rect(ML, PH - 65, CW, 0.5).fill(C.gold)
    d.fontSize(7).fillColor(C.muted).text('Somnium Properties · Investimento Imobiliario', ML, PH - 52, { width: CW, align: 'center' })
    d.fontSize(7).fillColor(C.muted).text(`Documento Confidencial · ${NOW()}`, ML, PH - 40, { width: CW, align: 'center' })
    d.rect(0, PH - 6, PW, 6).fill(C.gold)
  }

  newPage() {
    this.doc.addPage({ size: 'A4', margin: 0 })
    const d = this.doc
    try { d.image(LOGO_BLACK_PNG, ML, 15, { height: 22 }) } catch {}
    d.fontSize(7).fillColor(C.muted).text(this.title.toUpperCase(), ML, 22, { width: CW, align: 'right', lineBreak: false, characterSpacing: 1 })
    d.rect(ML, 45, CW, 1.5).fill(C.gold)
    d.rect(ML, PH - 45, CW, 0.5).fill(C.gold)
    this.y = 60
    this.doc.font('Helvetica').fontSize(9).fillColor(C.body)
    return this
  }

  ensure(needed) {
    if (this.y > 50 && this.y + needed > PH - 70) this.newPage()
    return this
  }

  space(px = 8) { this.y += px; return this }

  header(title) {
    const upper = (title || '').toUpperCase()
    const padX = 14, padY = 9
    this.doc.font('Helvetica-Bold').fontSize(13)
    const titleH = this.doc.heightOfString(upper, { width: CW - padX * 2, characterSpacing: 0.6 })
    const boxH = titleH + padY * 2
    this.ensure(boxH + 8 + 60)
    this.doc.rect(ML, this.y, CW, boxH).fill(C.black)
    this.doc.rect(ML, this.y, 5, boxH).fill(C.gold)
    this.doc.font('Helvetica-Bold').fontSize(13).fillColor(C.gold)
      .text(upper, ML + padX, this.y + padY, { width: CW - padX * 2, characterSpacing: 0.6, lineBreak: false })
    this.y += boxH + 12
    this.doc.font('Helvetica').fontSize(9).fillColor(C.body)
    return this
  }

  subheader(title) {
    const upper = (title || '').toUpperCase()
    this.doc.font('Helvetica-Bold').fontSize(9.5)
    const titleH = this.doc.heightOfString(upper, { width: CW, characterSpacing: 0.3 })
    this.ensure(titleH + 12 + 40)
    this.doc.fillColor(C.body).text(upper, ML, this.y, { width: CW, characterSpacing: 0.3 })
    this.y += titleH + 2
    this.doc.rect(ML, this.y, 40, 1).fill(C.gold)
    this.y += 8
    this.doc.font('Helvetica').fontSize(9).fillColor(C.body)
    return this
  }

  text(content, options = {}) {
    const fontSize = options.size || 9
    const lineGap = options.lineGap || 4
    this.doc.font('Helvetica').fontSize(fontSize)
    const h = this.doc.heightOfString(String(content || ''), { width: CW, lineGap, align: options.align || 'left' })
    this.ensure(h + 8)
    this.doc.fillColor(options.color || C.body).text(String(content || ''), ML, this.y, { width: CW, lineGap, align: options.align || 'left' })
    this.y += h + 6
    return this
  }

  bullet(t) {
    this.doc.font('Helvetica').fontSize(9)
    const h = this.doc.heightOfString(String(t || ''), { width: CW - 14, lineGap: 3 })
    this.ensure(h + 6)
    const tx = ML + 1, ty = this.y + 3
    this.doc.polygon([tx, ty], [tx + 4, ty + 3], [tx, ty + 6]).fill(C.gold)
    this.doc.fillColor(C.body).text(String(t || ''), ML + 14, this.y, { width: CW - 14, lineGap: 3 })
    this.y += h + 4
    return this
  }

  bigNumbers(items) {
    const colW = CW / items.length
    const fitSize = (line) => {
      const maxW = colW - 20
      let size = 16
      while (size >= 10) {
        const w = this.doc.font('Helvetica-Bold').fontSize(size).widthOfString(line)
        if (w <= maxW) return size
        size -= 1
      }
      return 10
    }
    let maxValueH = 22
    items.forEach(item => {
      const sz = Math.min(16, fitSize(String(item.value || '—')))
      if (sz + 4 > maxValueH) maxValueH = sz + 4
    })
    let maxSubH = 0
    items.forEach(item => {
      if (item.sub) {
        const h = this.doc.font('Helvetica').fontSize(7).heightOfString(item.sub, { width: colW - 20, lineGap: 2 })
        if (h > maxSubH) maxSubH = h
      }
    })
    const cellH = Math.max(50, 16 + maxValueH + 4 + maxSubH + 8)
    this.ensure(cellH + 6)
    this.doc.rect(ML, this.y, CW, cellH).lineWidth(0.5).stroke(C.border)
    items.forEach((item, i) => {
      const x = ML + i * colW
      if (i > 0) this.doc.rect(x, this.y, 0.5, cellH).fill(C.border)
      this.doc.font('Helvetica').fontSize(7).fillColor(C.muted).text((item.label || '').toUpperCase(), x + 10, this.y + 8, { width: colW - 20, lineBreak: false, characterSpacing: 0.3 })
      const valStr = String(item.value || '—')
      const sz = Math.min(16, fitSize(valStr))
      this.doc.font('Helvetica-Bold').fontSize(sz).fillColor(item.color || C.body).text(valStr, x + 10, this.y + 22, { width: colW - 20, lineBreak: false })
      if (item.sub) {
        this.doc.font('Helvetica').fontSize(7).fillColor(C.muted).text(item.sub, x + 10, this.y + 16 + maxValueH + 4, { width: colW - 20, lineGap: 2 })
      }
    })
    this.y += cellH + 6
    this.doc.font('Helvetica').fontSize(9).fillColor(C.body)
    return this
  }

  simpleTable(rows) {
    rows.forEach(row => {
      const isTotal = row.total
      const fontSize = isTotal ? 9.5 : 8.5
      const labelW = 310
      const valueW = CW - 330
      this.doc.font(isTotal ? 'Helvetica-Bold' : 'Helvetica').fontSize(fontSize)
      const labelH = this.doc.heightOfString(row.label || '', { width: labelW })
      const valueH = this.doc.heightOfString(String(row.value || '—'), { width: valueW })
      const contentH = Math.max(labelH, valueH)
      const rowH = Math.max(isTotal ? 26 : 22, contentH + 12)
      this.ensure(rowH + 1)
      if (isTotal) this.doc.rect(ML, this.y, CW, rowH).fill(C.totalBg)
      this.doc.fillColor(C.body).text(row.label || '', ML + 10, this.y + 6, { width: labelW })
      const valColor = row.color || (isTotal ? C.gold : C.body)
      this.doc.fillColor(valColor).text(String(row.value || '—'), ML + 320, this.y + 6, { width: valueW, align: 'right' })
      this.doc.rect(ML, this.y + rowH - 0.3, CW, 0.3).fill(C.border)
      this.y += rowH
    })
    this.y += 4
    this.doc.font('Helvetica').fontSize(9).fillColor(C.body)
    return this
  }

  colTable(headers, rows) {
    this.ensure(24)
    this.doc.rect(ML, this.y, CW, 22).fill(C.headerBg)
    let x = ML + 8
    for (const [label, w] of headers) {
      this.doc.font('Helvetica-Bold').fontSize(7.5).fillColor(C.gold).text(label, x, this.y + 7, { width: w, lineBreak: false, characterSpacing: 0.5 })
      x += w
    }
    this.y += 24
    rows.forEach((vals, idx) => {
      const fs = 8.2
      this.doc.font('Helvetica').fontSize(fs)
      const heights = vals.map((v, i) => this.doc.heightOfString(String(v == null ? '—' : v), { width: headers[i][1] - 8 }))
      const rowH = Math.max(20, Math.max(...heights) + 8)
      this.ensure(rowH + 1)
      if (idx % 2 === 1) this.doc.rect(ML, this.y, CW, rowH).fill(C.light)
      let xx = ML + 8
      vals.forEach((v, i) => {
        const colColor = (typeof v === 'object' && v && v.color) ? v.color : C.body
        const text = (typeof v === 'object' && v && v.text != null) ? v.text : (v == null ? '—' : v)
        const fontVariant = (typeof v === 'object' && v && v.bold) ? 'Helvetica-Bold' : 'Helvetica'
        this.doc.font(fontVariant).fontSize(fs).fillColor(colColor).text(String(text), xx, this.y + 5, { width: headers[i][1] - 8 })
        xx += headers[i][1]
      })
      this.doc.rect(ML, this.y + rowH - 0.3, CW, 0.3).fill(C.border)
      this.y += rowH
    })
    this.y += 4
    this.doc.font('Helvetica').fontSize(9).fillColor(C.body)
    return this
  }

  highlight(label, value, color = C.gold) {
    this.ensure(40)
    this.doc.roundedRect(ML, this.y, CW, 34, 4).fill(color).opacity(0.08)
    this.doc.opacity(1)
    this.doc.roundedRect(ML, this.y, CW, 34, 4).lineWidth(0.5).stroke(color)
    this.doc.font('Helvetica').fontSize(7).fillColor(C.muted).text(label.toUpperCase(), ML + 12, this.y + 5, { lineBreak: false })
    this.doc.font('Helvetica-Bold').fontSize(11).fillColor(C.body).text(String(value || '—'), ML + 12, this.y + 16, { lineBreak: false })
    this.y += 40
    this.doc.font('Helvetica').fontSize(9).fillColor(C.body)
    return this
  }

  applyFooter() {
    const range = this.doc.bufferedPageRange()
    const total = range.count
    const dateStr = new Date().toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit', year: 'numeric' })
    for (let i = 0; i < total; i++) {
      this.doc.switchToPage(range.start + i)
      const parts = ['Relatorio de Expansao Gaia', `v1.0`, dateStr, `Pag ${i + 1}/${total}`, 'Somnium Properties']
      this.doc.font('Helvetica').fontSize(6).fillColor(C.muted)
        .text(parts.join(' · '), ML, PH - 32, { width: CW, align: 'center', lineBreak: false })
    }
    return this
  }

  end() { this.doc.end(); return this.doc }
}

// ── Renderizadores das secoes ──────────────────────────────────

function renderSumarioExecutivo(b, dados) {
  const m = dados.macro
  b.header('Sumario Executivo')
  b.text(
    `Vila Nova de Gaia consolidou-se em 2024-2025 como o principal destino de investimento residencial do Grande Porto. A Camara aprovou 2.910 fogos novos em 2025 (4.170 licenciados) — um ritmo de 6.6 fogos por mil habitantes, o dobro da media nacional (3.3). Este pipeline confirma uma procura estrutural alimentada por reflexao do mercado do Porto, expansao da Linha Rubi do Metro e nova mobilidade Metrobus.`,
    { lineGap: 3 }
  )
  b.text(
    `Este relatorio avalia as 15 freguesias do concelho com cinco eixos de scoring (preco entrada, procura, servicos, revalorizacao, concorrencia) calibrados para o modelo de wholesaling Somnium (cedencia de posicao, ticket aquisicao 100-200 mil euros, tipologias T0-T3 e predios para reabilitacao). O objectivo e identificar as freguesias onde o produto-tipo Somnium tem maior probabilidade de captacao rapida + cedencia rentavel a investidor CAEP.`,
    { lineGap: 3 }
  )

  const totalRec = dados.freguesias.filter(f => f.classificacao === 'recomendar').length
  b.bigNumbers([
    { label: 'Preco medio (CI)', value: EUR(m.preco_medio_eur_m2) + '/m2', sub: `${m.preco_medio_fonte.split('(')[0].trim()} · ${m.preco_medio_data}` },
    { label: 'Variacao YoY', value: FMT_PCT(m.preco_idealista_yoy_pct), sub: `Idealista · ${m.preco_idealista_data}`, color: m.preco_idealista_yoy_pct >= 0 ? C.green : C.red },
    { label: 'Freguesias analisadas', value: FMT_NUM(m.n_freguesias), sub: 'Reorganizacao administrativa de 2013' },
    { label: 'Freguesias recomendadas', value: FMT_NUM(totalRec), sub: 'Score >= 7.5 no modelo Somnium', color: C.gold },
  ])

  const top5 = dados.freguesias.filter(f => f.classificacao === 'recomendar').slice(0, 5)
  b.subheader('Top 5 freguesias prioritarias')
  top5.forEach((f, idx) => {
    b.bullet(`${idx + 1}. ${f.nome} — ${EUR(f.preco_eur_m2)}/m2 · Ticket T2 tipico ${f.ticket_tipico_t2} EUR · Score ${f.score.toFixed(1)}`)
  })
}

function renderContextoMacro(b, dados) {
  const m = dados.macro
  b.header('Contexto Macro de Vila Nova de Gaia')
  b.text(
    `Com 303.824 habitantes (Censos 2021) distribuidos em 168 km2 e 15 freguesias, Vila Nova de Gaia e o 3.o concelho mais populoso de Portugal — atras de Lisboa e Sintra. Densidade media 1.803 hab/km2, fortemente concentrada na faixa norte (Mafamude, Santa Marinha, Vilar de Andorinho) e ao longo da costa atlantica (Canidelo, Madalena, Gulpilhares).`,
    { lineGap: 3 }
  )

  b.subheader('Mercado residencial — indicadores 2024-2026')
  b.simpleTable([
    { label: 'Preco medio (Observatorio Imobiliario de Gaia / CI)', value: `${EUR(m.preco_medio_eur_m2)}/m2 (${m.preco_medio_data})` },
    { label: 'Preco medio (Idealista, snapshot)', value: `${EUR(m.preco_idealista_eur_m2)}/m2 · ${FMT_PCT(m.preco_idealista_yoy_pct)} YoY (${m.preco_idealista_data})` },
    { label: 'Preco medio (Best Yield Finder, snapshot)', value: `${EUR(m.preco_byf_eur_m2)}/m2 · ${FMT_PCT(m.preco_byf_yoy_pct)} YoY (${m.preco_byf_data})` },
    { label: 'Nova construcao (Camara/CI)', value: `${EUR(m.preco_novo_eur_m2)}/m2` },
    { label: 'Habitacao existente (Camara/CI)', value: `${EUR(m.preco_existente_eur_m2)}/m2` },
    { label: 'Mediana de venda', value: EUR(m.mediana_venda_eur) },
    { label: 'Mediana de renda', value: `${EUR(m.mediana_renda_eur)}/mes` },
    { label: 'Yield bruto medio', value: `${m.yield_bruto_pct.toFixed(2)}%` },
    { label: 'Licenciamentos aprovados 2024 / 2025', value: `${FMT_NUM(m.aprovados_2024)} / ${FMT_NUM(m.aprovados_2025)} fogos` },
    { label: 'Fogos licenciados por 1000 hab (vs Grande Porto / nacional)', value: `${m.licenciamentos_por_1000_hab} / ${m.licenciamentos_porto_grande} / ${m.licenciamentos_nacional}` },
  ])

  b.subheader('Projectos estruturantes 2026-2028')
  b.bullet('Linha Rubi (H) do Metro do Porto — 6 novas estacoes em Gaia (Arrabida, Candal, Rotunda, Devesas, Soares dos Reis, Santo Ovidio). Conclusao adiada para Julho 2028. Impacto valorizativo concentrado em Mafamude e Vilar do Paraiso.')
  b.bullet('Ponte Ferreirinha — nova travessia exclusiva do Metro sobre o Douro, ligando Casa da Musica (Porto) a Arrabida (Gaia).')
  b.bullet('Metrobus Boavista-Praca do Imperio — BRT de 3.8 km com operacao iniciada em 2025. Reduz tempo de deslocacao Mafamude-Boavista.')
  b.bullet('Observatorio Imobiliario de Gaia — parceria com Confidencial Imobiliario, lancado no MIPIM 2025. Permite monitorizacao sistematica do mercado.')
  b.bullet('Pipeline de licenciamento 2024-2025 concentrado: Canidelo (36%), Mafamude e Vilar do Paraiso (25%), Santa Marinha (16%).')
}

function renderMetodologia(b, dados) {
  const s = dados.scoring
  b.header('Metodologia e Criterios de Scoring')
  b.text(
    `Cada freguesia foi avaliada em cinco eixos com pesos calibrados para o modelo de wholesaling Somnium (cedencia de posicao). O score global resulta da soma ponderada e e expresso numa escala 0-10.`,
    { lineGap: 3 }
  )
  b.subheader('Eixos e pesos')
  b.simpleTable([
    { label: '1. Preco de entrada — adequacao ao ticket 100-200 mil euros', value: `${s.pesos.preco_entrada}%` },
    { label: '2. Procura / liquidez — tempo medio de venda, absorcao do stock', value: `${s.pesos.procura_liquidez}%` },
    { label: '3. Servicos e amenidades — escolas, saude, transportes, comercio', value: `${s.pesos.servicos_amenidades}%` },
    { label: '4. Potencial de revalorizacao — projectos urbanos, demografia, pipeline', value: `${s.pesos.potencial_revalorizacao}%` },
    { label: '5. Concorrencia — densidade de outros operadores wholesale na zona', value: `${s.pesos.concorrencia}%` },
    { label: 'Total ponderado', value: '100%', total: true },
  ])
  b.subheader('Regras de classificacao')
  b.bullet(`Recomendar — ${s.classificacao_regras.recomendar} · zona accionavel imediata para captacao`)
  b.bullet(`Monitorizar — ${s.classificacao_regras.monitorizar} · zona com upside contextual, accionar caso-a-caso`)
  b.bullet(`Evitar — ${s.classificacao_regras.evitar} · ticket fora da gama ou liquidez insuficiente para wholesaling 100-200k`)
  b.text(
    `Notas: ranges de preco/m2 reflectem dispersao real do stock (anos 70 a construcao recente). Tempo de venda baseado em snapshots do Confidencial Imobiliario e listagens activas em Idealista/Casa SAPO. Score global e indicativo e deve ser revisitado a cada release do Observatorio Imobiliario de Gaia.`,
    { lineGap: 3, size: 8, color: C.muted }
  )
}

function renderAnaliseComparativa(b, dados) {
  b.header('Analise Comparativa das 15 Freguesias')
  b.text(
    `Tabela ordenada por score (descendente). Cores indicam classificacao: dourado = recomendar, neutro = monitorizar, vermelho = evitar.`,
    { lineGap: 3, size: 8 }
  )

  const headers = [
    ['Freguesia', 180],
    ['Pop.', 40],
    ['EUR/m2', 55],
    ['YoY', 38],
    ['Dias venda', 50],
    ['Score', 38],
    ['Classif.', 95],
  ]
  const classifColor = (cl) => cl === 'recomendar' ? C.gold : cl === 'evitar' ? C.red : C.body
  const classifLabel = (cl) => cl === 'recomendar' ? 'RECOMENDAR' : cl === 'evitar' ? 'EVITAR' : 'MONITORIZAR'

  const sorted = [...dados.freguesias].sort((a, b) => b.score - a.score)
  const rows = sorted.map(f => [
    { text: f.nome, bold: f.classificacao === 'recomendar', color: f.classificacao === 'recomendar' ? C.gold : C.body },
    FMT_NUM(f.populacao),
    EUR(f.preco_eur_m2),
    { text: FMT_PCT(f.var_yoy_pct, 1), color: f.var_yoy_pct >= 0 ? C.green : C.red },
    f.tempo_venda_dias + ' d',
    { text: f.score.toFixed(1), bold: true, color: classifColor(f.classificacao) },
    { text: classifLabel(f.classificacao), color: classifColor(f.classificacao), bold: true },
  ])
  b.colTable(headers, rows)
}

function renderFichaFreguesia(b, f, posicao) {
  b.header(`Top ${posicao} — ${f.nome}`)
  b.bigNumbers([
    { label: 'Score global', value: f.score.toFixed(1) + '/10', color: C.gold },
    { label: 'Preco medio', value: EUR(f.preco_eur_m2) + '/m2', sub: `Range ${f.preco_range}` },
    { label: 'Variacao YoY', value: FMT_PCT(f.var_yoy_pct), color: f.var_yoy_pct >= 0 ? C.green : C.red },
    { label: 'Ticket T2 tipico', value: f.ticket_tipico_t2 + ' EUR' },
  ])
  b.subheader('Caracterizacao')
  b.text(f.perfil, { lineGap: 3 })

  b.subheader('Indicadores chave')
  b.simpleTable([
    { label: 'Tipologia urbana', value: f.tipologia },
    { label: 'Populacao (Censos 2021)', value: FMT_NUM(f.populacao) + ' hab' },
    { label: 'Area', value: f.area_km2.toFixed(2) + ' km2' },
    { label: 'Densidade', value: FMT_NUM(Math.round(f.populacao / f.area_km2)) + ' hab/km2' },
    { label: 'Tempo medio de venda', value: f.tempo_venda_dias + ' dias' },
    { label: 'Eixo preco entrada (peso 35%)', value: f.criterios.preco_entrada + '/10' },
    { label: 'Eixo procura / liquidez (peso 25%)', value: f.criterios.procura_liquidez + '/10' },
    { label: 'Eixo servicos / amenidades (peso 15%)', value: f.criterios.servicos_amenidades + '/10' },
    { label: 'Eixo revalorizacao (peso 15%)', value: f.criterios.potencial_revalorizacao + '/10' },
    { label: 'Eixo concorrencia (peso 10%)', value: f.criterios.concorrencia + '/10' },
  ])

  b.subheader('Drivers de procura')
  f.drivers.forEach(d => b.bullet(d))

  b.subheader('Produto-alvo Somnium')
  b.text(f.target_imovel, { lineGap: 3 })
}

function renderDriversTransversais(b, dados) {
  b.header('Drivers Transversais e Servicos do Concelho')
  b.text(
    `Factores comuns a multiplas freguesias que influenciam decisoes de aquisicao e revenda em Vila Nova de Gaia. Util para construir o argumentario com investidor CAEP e para qualificar leads.`,
    { lineGap: 3 }
  )
  dados.drivers_transversais.forEach(group => {
    b.subheader(group.categoria)
    group.items.forEach(it => b.bullet(it))
  })
}

function renderRiscos(b, dados) {
  b.header('Riscos e Factores Criticos')
  dados.riscos.forEach(r => {
    b.subheader(r.titulo)
    b.text(r.descricao, { lineGap: 3 })
    b.text('Mitigacao: ' + r.mitigacao, { lineGap: 3, color: C.amber, size: 8.5 })
  })
}

function renderProximosPassos(b, dados) {
  b.header('Roadmap Operacional — 90 Dias')
  dados.proximos_passos.forEach(fase => {
    b.subheader(fase.fase)
    fase.accoes.forEach(a => b.bullet(a))
  })
}

function renderAnexoFontes(b, dados) {
  b.header('Anexo — Metodologia e Fontes')
  b.subheader('Notas metodologicas')
  b.bullet('Precos por freguesia: triangulacao entre Idealista, Casa SAPO, SuperCasa, Observatorio Imobiliario de Gaia e Confidencial Imobiliario. Ranges em vez de pontos unicos para reflectir dispersao real do stock.')
  b.bullet('Tempo medio de venda: estimativa baseada em snapshots do Confidencial Imobiliario e tempo medio de listagens activas em Idealista. Valores podem variar 15-25% em funcao do segmento.')
  b.bullet('Score global: modelo proprietario Somnium calibrado para wholesaling 100-200k. Nao substitui due diligence imovel a imovel.')
  b.bullet('Populacao por freguesia: Censos 2021 INE (publicacao definitiva, 2022-2023). Nao reflecte movimentos demograficos pos-pandemia.')
  b.bullet('Pipeline de licenciamento: Camara Municipal de Vila Nova de Gaia, comunicados de imprensa 2024-2025.')

  b.subheader('Fontes consultadas')
  dados.fontes.forEach(s => {
    b.bullet(`${s.nome} — ${s.url} (${s.data})`)
  })
  b.space(8)
  b.text(
    `Documento elaborado por Alexandre Mendes, CFO Somnium Properties. Confidencial. Para uso interno e apresentacao a investidores CAEP. Actualizar a cada release do Observatorio Imobiliario de Gaia (semestralmente) ou em caso de alteracao material nos eixos de scoring.`,
    { lineGap: 3, size: 8, color: C.muted }
  )
}

// ── API publica ────────────────────────────────────────────────

export function generateRelatorioExpansaoGaia(dadosInput) {
  const dados = dadosInput || DADOS_EXPANSAO_GAIA
  const b = new Builder(dados.meta)

  renderSumarioExecutivo(b, dados)
  renderContextoMacro(b, dados)
  renderMetodologia(b, dados)
  renderAnaliseComparativa(b, dados)

  const top5 = dados.freguesias.filter(f => f.classificacao === 'recomendar').slice(0, 5)
  top5.forEach((f, idx) => renderFichaFreguesia(b, f, idx + 1))

  renderDriversTransversais(b, dados)
  renderRiscos(b, dados)
  renderProximosPassos(b, dados)
  renderAnexoFontes(b, dados)

  b.applyFooter()
  return b.end()
}

export default generateRelatorioExpansaoGaia
