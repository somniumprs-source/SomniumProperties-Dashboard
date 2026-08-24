/**
 * Geradores PDF para projectos Fix and Flip — apresentação a investidores.
 *
 * 4 documentos:
 *  - Ficha de Acompanhamento de Obra (por fase, 1 página)
 *  - Relatório de Acompanhamento de Obra (executivo mensal)
 *  - Memória Descritiva de Acabamentos (pré-venda)
 *  - Relatório de Saída / Distribuição CAEP (pós-venda)
 *
 * Layout institucional Somnium Properties (brand gold + black).
 */
import PDFDocument from 'pdfkit'
import { readFileSync, existsSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const LOGO_PATH = path.resolve(__dirname, '../../public/logo-transparent.png')

const GOLD = '#C9A84C'
const BLACK = '#0d0d0d'
const TEXT = '#1f2937'
const MUTED = '#6b7280'
const LINE = '#e5e7eb'

const EUR = (v) => {
  if (v == null || !Number.isFinite(Number(v))) return '—'
  return new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(Number(v))
}
const PCT = (v) => (v == null ? '—' : `${Math.round(Number(v) || 0)}%`)
const DATE = (v) => v ? new Date(v).toLocaleDateString('pt-PT') : '—'

// ── HEADER institucional ─────────────────────────────────────
function header(doc, titulo, subtitulo) {
  doc.rect(0, 0, doc.page.width, 100).fill(BLACK)
  // Logo é um wordmark (já inclui "Somnium Properties" por extenso, proporção
  // ~2.47:1) — a 40px de altura ocupa até x≈148; o texto arranca depois disso
  // para não sobrepor. Sem texto "SOMNIUM PROPERTIES" redundante ao lado.
  if (existsSync(LOGO_PATH)) {
    try { doc.image(LOGO_PATH, 50, 30, { height: 40 }) } catch {}
  }
  doc.fillColor('white').font('Helvetica-Bold').fontSize(11).text(titulo.toUpperCase(), 170, 38, { width: doc.page.width - 220 })
  if (subtitulo) doc.fillColor('#aaaaaa').font('Helvetica').fontSize(8).text(subtitulo, 170, 56, { width: doc.page.width - 220 })
  // Linha dourada
  doc.moveTo(0, 100).lineTo(doc.page.width, 100).lineWidth(3).strokeColor(GOLD).stroke()
  doc.y = 120
  doc.x = 50
}

// ── FOOTER ───────────────────────────────────────────────────
function footer(doc, pageNum) {
  const bottomY = doc.page.height - 35
  doc.fontSize(7).fillColor(MUTED)
    .text(`Somnium Properties · Documento confidencial · Gerado ${new Date().toLocaleDateString('pt-PT')}`,
      50, bottomY, { width: doc.page.width - 100, align: 'left' })
  doc.text(`Página ${pageNum}`, 50, bottomY, { width: doc.page.width - 100, align: 'right' })
}

// ── Helpers de blocos ────────────────────────────────────────
function secaoTitulo(doc, texto) {
  if (doc.y > doc.page.height - 120) { doc.addPage() }
  doc.moveDown(0.5)
  doc.fillColor(BLACK).font('Helvetica-Bold').fontSize(11).text(texto.toUpperCase(), 50)
  doc.moveTo(50, doc.y + 2).lineTo(doc.page.width - 50, doc.y + 2).lineWidth(1).strokeColor(GOLD).stroke()
  doc.moveDown(0.5)
}

function kpiCard(doc, x, y, w, h, label, valor, cor = GOLD) {
  doc.roundedRect(x, y, w, h, 6).fillAndStroke('#f9fafb', LINE)
  doc.fillColor(MUTED).font('Helvetica').fontSize(7).text(label.toUpperCase(), x + 8, y + 8, { width: w - 16 })
  doc.fillColor(cor).font('Helvetica-Bold').fontSize(14).text(valor, x + 8, y + 22, { width: w - 16 })
}

function progBar(doc, x, y, w, perc, cor = GOLD) {
  doc.roundedRect(x, y, w, 6, 3).fill('#e5e7eb')
  const fill = Math.max(0, Math.min(100, perc)) / 100 * w
  if (fill > 0) doc.roundedRect(x, y, fill, 6, 3).fill(cor)
}

function texto(doc, str, opts = {}) {
  doc.fillColor(TEXT).font('Helvetica').fontSize(opts.size || 9).text(str, opts.x || 50, doc.y, { width: opts.width || doc.page.width - 100, ...opts })
}

// ── Helper: meter fotos numa grelha ──────────────────────────
function inserirFotos(doc, fotos, maxFotos = 6) {
  if (!fotos || fotos.length === 0) return
  const cols = 3
  const fotosShow = fotos.slice(0, maxFotos)
  const cellW = (doc.page.width - 100 - (cols - 1) * 8) / cols
  const cellH = cellW * 0.7
  for (let i = 0; i < fotosShow.length; i++) {
    const col = i % cols
    const row = Math.floor(i / cols)
    const x = 50 + col * (cellW + 8)
    if (col === 0 && row > 0) doc.y += cellH + 12
    const y = doc.y
    if (doc.y + cellH > doc.page.height - 60) { doc.addPage(); doc.y = 50 }
    const f = fotosShow[i]
    const filePath = path.resolve(__dirname, '../..', (f.url || '').replace(/^\//, ''))
    if (existsSync(filePath)) {
      try {
        doc.save()
        doc.roundedRect(x, doc.y, cellW, cellH, 4).clip()
        doc.image(filePath, x, doc.y, { fit: [cellW, cellH], align: 'center', valign: 'center' })
        doc.restore()
        doc.roundedRect(x, doc.y, cellW, cellH, 4).lineWidth(0.5).strokeColor(LINE).stroke()
        if (f.tipo) {
          const corTipo = f.tipo === 'antes' ? '#ef4444' : f.tipo === 'depois' ? '#22c55e' : BLACK
          doc.roundedRect(x + 4, doc.y + 4, 36, 12, 2).fill(corTipo)
          doc.fillColor('white').font('Helvetica-Bold').fontSize(6).text(f.tipo.toUpperCase(), x + 4, doc.y - cellH + 7, { width: 36, align: 'center' })
        }
      } catch (e) {
        doc.rect(x, doc.y, cellW, cellH).fill('#f3f4f6')
        doc.fillColor(MUTED).fontSize(7).text('(imagem)', x, doc.y - cellH + cellH/2, { width: cellW, align: 'center' })
      }
    }
  }
  doc.y += cellH + 12
}

// ════════════════════════════════════════════════════════════════
// 1. FICHA DE ACOMPANHAMENTO DE OBRA (por fase, 1 página)
// ════════════════════════════════════════════════════════════════
export function generateFichaAcompanhamento({ negocio, imovel, fase, tarefas, fotos }) {
  const doc = new PDFDocument({ size: 'A4', margin: 50, bufferPages: true })

  header(doc, `Ficha de Acompanhamento — ${fase.nome}`, negocio.movimento + (imovel?.nome ? ` · ${imovel.nome}` : ''))

  // KPIs em grelha 4 colunas
  const kpiW = (doc.page.width - 100 - 3 * 8) / 4
  const kpiY = doc.y
  kpiCard(doc, 50,                       kpiY, kpiW, 50, 'Execução',    PCT(fase.perc_execucao), GOLD)
  kpiCard(doc, 50 + (kpiW + 8) * 1,      kpiY, kpiW, 50, 'Estado',      (fase.estado || '—').replace('_', ' '), BLACK)
  kpiCard(doc, 50 + (kpiW + 8) * 2,      kpiY, kpiW, 50, 'Orçamento',   EUR(fase.orcamento_alocado), GOLD)
  kpiCard(doc, 50 + (kpiW + 8) * 3,      kpiY, kpiW, 50, 'Custo real',  EUR(fase.custo_real), '#ef4444')
  doc.y = kpiY + 65

  // Cronograma
  secaoTitulo(doc, 'Cronograma')
  doc.fontSize(8).fillColor(TEXT)
    .text(`Início previsto: ${DATE(fase.data_inicio_prevista)}    ·    Fim previsto: ${DATE(fase.data_fim_prevista)}`)
    .text(`Início real:     ${DATE(fase.data_inicio_real)}    ·    Fim real:     ${DATE(fase.data_fim_real)}`)
    .moveDown(0.5)
  progBar(doc, 50, doc.y, doc.page.width - 100, fase.perc_execucao || 0)
  doc.y += 12

  // Tarefas (concluídas vs pendentes)
  secaoTitulo(doc, `Tarefas (${tarefas.filter(t => t.concluida).length} de ${tarefas.length} concluídas)`)
  for (const t of tarefas) {
    if (doc.y > doc.page.height - 80) { doc.addPage(); doc.y = 50 }
    const mark = t.concluida ? '☑' : '☐'
    const cor = t.concluida ? '#22c55e' : MUTED
    doc.fillColor(cor).font('Helvetica').fontSize(8).text(`${mark}  ${t.descricao}`, 50, doc.y, { width: doc.page.width - 100 })
    doc.moveDown(0.15)
  }

  // Fotos
  if (fotos.length > 0) {
    if (doc.y > doc.page.height - 200) doc.addPage()
    secaoTitulo(doc, `Registo Fotográfico (${fotos.length} foto${fotos.length > 1 ? 's' : ''})`)
    inserirFotos(doc, fotos, 6)
  }

  // Notas
  if (fase.notas) {
    if (doc.y > doc.page.height - 100) doc.addPage()
    secaoTitulo(doc, 'Notas da fase')
    doc.fontSize(8).fillColor(TEXT).text(fase.notas, 50, doc.y, { width: doc.page.width - 100, align: 'justify' })
  }

  // Footer em todas as páginas
  const range = doc.bufferedPageRange()
  for (let i = 0; i < range.count; i++) { doc.switchToPage(i); footer(doc, i + 1) }

  doc.end()
  return doc
}

// ════════════════════════════════════════════════════════════════
// 2. RELATÓRIO DE ACOMPANHAMENTO DE OBRA (executivo mensal)
// ════════════════════════════════════════════════════════════════
export function generateRelatorioAcompanhamento({ negocio, imovel, fases, tarefas, fotos, percGlobal, orcAlocado, custoReal }) {
  const doc = new PDFDocument({ size: 'A4', margin: 50, bufferPages: true })
  const titulo = `Relatório de Acompanhamento de Obra`
  const sub = `${negocio.movimento}${imovel?.nome ? ' · ' + imovel.nome : ''}  ·  ${new Date().toLocaleDateString('pt-PT', { month: 'long', year: 'numeric' })}`

  header(doc, titulo, sub)

  // KPIs globais
  const kpiW = (doc.page.width - 100 - 3 * 8) / 4
  const kpiY = doc.y
  kpiCard(doc, 50,                  kpiY, kpiW, 56, 'Execução global', PCT(percGlobal), GOLD)
  kpiCard(doc, 50 + (kpiW + 8) * 1, kpiY, kpiW, 56, 'Faturação esperada', EUR(negocio.lucro_estimado), BLACK)
  kpiCard(doc, 50 + (kpiW + 8) * 2, kpiY, kpiW, 56, 'Orçamento total', EUR(orcAlocado || negocio.custo_real_obra), GOLD)
  kpiCard(doc, 50 + (kpiW + 8) * 3, kpiY, kpiW, 56, 'Custo real',     EUR(custoReal), '#ef4444')
  doc.y = kpiY + 72

  // Sumário executivo
  secaoTitulo(doc, 'Sumário Executivo')
  const concluidas = fases.filter(f => f.estado === 'concluida').length
  const emCurso = fases.find(f => f.estado === 'em_curso')
  const totalTarefas = tarefas.length
  const tarefasConcluidas = tarefas.filter(t => t.concluida).length
  texto(doc, `O projecto encontra-se a ${PCT(percGlobal)} de execução global. ${concluidas} de ${fases.length} fases concluídas. ` +
    (emCurso ? `Fase em curso: "${emCurso.nome}" (${PCT(emCurso.perc_execucao)}). ` : '') +
    `Total de ${tarefasConcluidas} tarefas concluídas em ${totalTarefas}.`, { size: 9 })
  doc.moveDown(0.3)

  // Cronograma por fase
  secaoTitulo(doc, 'Estado por Fase')
  for (const f of fases) {
    if (doc.y > doc.page.height - 80) { doc.addPage(); doc.y = 50 }
    const yIni = doc.y
    // Bullet de estado
    const corEstado = f.estado === 'concluida' ? '#22c55e' : f.estado === 'em_curso' ? '#3b82f6' : f.estado === 'bloqueada' ? '#ef4444' : '#9ca3af'
    doc.circle(56, yIni + 5, 3).fill(corEstado)
    doc.fillColor(TEXT).font('Helvetica-Bold').fontSize(9).text(f.nome, 65, yIni, { width: 220 })
    doc.fillColor(MUTED).font('Helvetica').fontSize(7)
      .text(`${DATE(f.data_inicio_prevista)} → ${DATE(f.data_fim_prevista)}`, 65, yIni + 12, { width: 220 })
    // Barra
    progBar(doc, 290, yIni + 4, 180, f.perc_execucao || 0)
    doc.fillColor(TEXT).font('Helvetica').fontSize(8).text(PCT(f.perc_execucao), 480, yIni, { width: 50, align: 'right' })
    doc.y = yIni + 24
  }

  // Reconciliação orçamento vs real
  if (orcAlocado > 0 || custoReal > 0) {
    secaoTitulo(doc, 'Reconciliação Financeira (Orçamento vs Real)')
    const headers = ['Fase', 'Orçamento alocado', 'Custo real', 'Desvio']
    const colW = [220, 100, 100, 80]
    let x = 50
    doc.fillColor(BLACK).font('Helvetica-Bold').fontSize(8)
    const yHead = doc.y
    headers.forEach((h, i) => { doc.text(h, x, yHead, { width: colW[i] }); x += colW[i] })
    doc.y = yHead + 12
    doc.moveTo(50, doc.y + 12).lineTo(doc.page.width - 50, doc.y + 12).strokeColor(LINE).stroke()
    doc.y += 18
    for (const f of fases) {
      if (doc.y > doc.page.height - 60) { doc.addPage(); doc.y = 50 }
      const desvio = (Number(f.custo_real) || 0) - (Number(f.orcamento_alocado) || 0)
      const yIni = doc.y
      doc.fillColor(TEXT).font('Helvetica').fontSize(8)
        .text(f.nome, 50, yIni, { width: colW[0] })
        .text(EUR(f.orcamento_alocado), 50 + colW[0], yIni, { width: colW[1] })
        .text(EUR(f.custo_real), 50 + colW[0] + colW[1], yIni, { width: colW[2] })
      doc.fillColor(desvio > 0 ? '#ef4444' : '#22c55e')
        .text(EUR(desvio), 50 + colW[0] + colW[1] + colW[2], yIni, { width: colW[3] })
      doc.y = yIni + 14
    }
  }

  // Fotos recentes (top 6)
  if (fotos.length > 0) {
    if (doc.y > doc.page.height - 200) doc.addPage()
    secaoTitulo(doc, 'Registo Fotográfico Recente')
    const fotosRecentes = [...fotos].sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0)).slice(0, 6)
    inserirFotos(doc, fotosRecentes, 6)
  }

  // Riscos e próximos passos
  if (doc.y > doc.page.height - 120) doc.addPage()
  secaoTitulo(doc, 'Próximos Passos')
  const proxima = fases.find(f => f.estado === 'pendente')
  if (proxima) texto(doc, `Próxima fase a iniciar: ${proxima.nome}.`)
  if (emCurso) {
    const tarefasPendEm = tarefas.filter(t => !t.concluida)
    if (tarefasPendEm.length > 0) {
      doc.moveDown(0.3)
      texto(doc, `Tarefas prioritárias em curso (${tarefasPendEm.length}):`)
      tarefasPendEm.slice(0, 5).forEach(t => {
        doc.fontSize(8).fillColor(TEXT).text(`  •  ${t.descricao}`, 50, doc.y, { width: doc.page.width - 100 })
        doc.moveDown(0.1)
      })
    }
  }

  const range = doc.bufferedPageRange()
  for (let i = 0; i < range.count; i++) { doc.switchToPage(i); footer(doc, i + 1) }
  doc.end()
  return doc
}

// ════════════════════════════════════════════════════════════════
// 2b. RELATÓRIO SEMANAL DE OBRA — gerado a partir da vistoria semanal do
// empreiteiro (Template A/B do documento de optimização do SOP 13).
// ════════════════════════════════════════════════════════════════
function semaforoDesvio(pct) {
  if (pct == null) return { cor: MUTED, label: '—' }
  const abs = Math.abs(pct)
  if (abs <= 5) return { cor: '#22c55e', label: 'Dentro do orçamento' }
  if (abs <= 10) return { cor: '#eab308', label: 'Atenção — investigar causa' }
  if (abs <= 15) return { cor: '#f97316', label: 'Reunião técnica recomendada' }
  return { cor: '#ef4444', label: 'Aviso formal — plano de acção necessário' }
}

export function generateRelatorioSemanalObra({ negocio, imovel, vistoria, fases, fotos, orcAlocado, custoReal, semanaAtual, semanaTotal }) {
  const doc = new PDFDocument({ size: 'A4', margin: 50, bufferPages: true })
  const dataSemana = new Date(vistoria.semana_data)
  const titulo = 'Relatório Semanal de Obra'
  const semanaLabel = semanaAtual && semanaTotal ? `Semana ${semanaAtual} de ${semanaTotal}  ·  ` : ''
  const sub = `${negocio.movimento}${imovel?.nome ? ' · ' + imovel.nome : ''}  ·  ${semanaLabel}${dataSemana.toLocaleDateString('pt-PT', { day: '2-digit', month: 'long', year: 'numeric' })}`
  header(doc, titulo, sub)

  const percGlobal = fases.length > 0
    ? Math.round(fases.reduce((s, f) => s + (Number(f.perc_execucao) || 0), 0) / fases.length)
    : 0
  const desvioPct = orcAlocado > 0 ? ((custoReal - orcAlocado) / orcAlocado) * 100 : null
  const semaforo = semaforoDesvio(desvioPct)

  // KPIs
  const kpiW = (doc.page.width - 100 - 3 * 8) / 4
  const kpiY = doc.y
  kpiCard(doc, 50,                  kpiY, kpiW, 56, 'Execução global', PCT(percGlobal), GOLD)
  kpiCard(doc, 50 + (kpiW + 8) * 1, kpiY, kpiW, 56, 'Orçamento', EUR(orcAlocado), BLACK)
  kpiCard(doc, 50 + (kpiW + 8) * 2, kpiY, kpiW, 56, 'Custo real', EUR(custoReal), '#ef4444')
  kpiCard(doc, 50 + (kpiW + 8) * 3, kpiY, kpiW, 56, 'Desvio', desvioPct == null ? '—' : `${desvioPct > 0 ? '+' : ''}${desvioPct.toFixed(1)}%`, semaforo.cor)
  doc.y = kpiY + 72

  // Resumo executivo com semáforo
  secaoTitulo(doc, 'Resumo Executivo')
  doc.roundedRect(50, doc.y, doc.page.width - 100, 24, 4).fill(semaforo.cor)
  doc.fillColor('white').font('Helvetica-Bold').fontSize(9).text(semaforo.label, 60, doc.y - 17)
  doc.y += 12
  if (vistoria.desvio_dias) {
    texto(doc, `Desvio de cronograma: ${vistoria.desvio_dias > 0 ? '+' : ''}${vistoria.desvio_dias} dias face ao planeado.${vistoria.desvio_causa ? ` Causa: ${vistoria.desvio_causa}.` : ''}`)
    doc.moveDown(0.2)
  }

  // Estado por rubrica (vistoria)
  if (Array.isArray(vistoria.rubricas) && vistoria.rubricas.length > 0) {
    secaoTitulo(doc, 'Progresso por Rubrica')
    const headers = ['Rubrica', 'Estado', '% Concl.', 'Observações']
    const colW = [140, 90, 60, 210]
    let x = 50
    doc.fillColor(BLACK).font('Helvetica-Bold').fontSize(8)
    const yHead = doc.y
    headers.forEach((h, i) => { doc.text(h, x, yHead, { width: colW[i] }); x += colW[i] })
    doc.y = yHead + 12
    doc.moveTo(50, doc.y + 12).lineTo(doc.page.width - 50, doc.y + 12).strokeColor(LINE).stroke()
    doc.y += 16
    for (const r of vistoria.rubricas) {
      if (!r.estado && !r.perc) continue
      if (doc.y > doc.page.height - 60) { doc.addPage(); doc.y = 50 }
      const yIni = doc.y
      doc.fillColor(TEXT).font('Helvetica').fontSize(8)
        .text(r.rubrica || '—', 50, yIni, { width: colW[0] })
        .text(r.estado || '—', 50 + colW[0], yIni, { width: colW[1] })
        .text(r.perc != null ? `${r.perc}%` : '—', 50 + colW[0] + colW[1], yIni, { width: colW[2] })
        .text(r.observacoes || '—', 50 + colW[0] + colW[1] + colW[2], yIni, { width: colW[3] })
      doc.y = Math.max(yIni + 14, doc.y)
    }
    doc.moveDown(0.3)
  }

  // Situação orçamental por fase
  if (orcAlocado > 0 || custoReal > 0) {
    secaoTitulo(doc, 'Situação Orçamental')
    const headers = ['Fase', 'Orçamento', 'Real acumulado', 'Desvio']
    const colW = [220, 100, 100, 80]
    let x = 50
    doc.fillColor(BLACK).font('Helvetica-Bold').fontSize(8)
    const yHead = doc.y
    headers.forEach((h, i) => { doc.text(h, x, yHead, { width: colW[i] }); x += colW[i] })
    doc.y = yHead + 12
    doc.moveTo(50, doc.y + 12).lineTo(doc.page.width - 50, doc.y + 12).strokeColor(LINE).stroke()
    doc.y += 18
    for (const f of fases) {
      if (doc.y > doc.page.height - 60) { doc.addPage(); doc.y = 50 }
      const desvio = (Number(f.custo_real) || 0) - (Number(f.orcamento_alocado) || 0)
      const yIni = doc.y
      doc.fillColor(TEXT).font('Helvetica').fontSize(8)
        .text(f.nome, 50, yIni, { width: colW[0] })
        .text(EUR(f.orcamento_alocado), 50 + colW[0], yIni, { width: colW[1] })
        .text(EUR(f.custo_real), 50 + colW[0] + colW[1], yIni, { width: colW[2] })
      doc.fillColor(desvio > 0 ? '#ef4444' : '#22c55e')
        .text(EUR(desvio), 50 + colW[0] + colW[1] + colW[2], yIni, { width: colW[3] })
      doc.y = yIni + 14
    }
  }

  // Fotos da semana
  if (fotos.length > 0) {
    if (doc.y > doc.page.height - 200) doc.addPage()
    secaoTitulo(doc, `Registo Fotográfico da Semana (${fotos.length})`)
    inserirFotos(doc, fotos, 6)
  }

  // Ocorrências
  if (vistoria.incidentes) {
    if (doc.y > doc.page.height - 100) doc.addPage()
    secaoTitulo(doc, 'Ocorrências')
    texto(doc, vistoria.incidentes, { align: 'justify' })
    doc.moveDown(0.3)
  }

  // Próximos 7 dias
  if (vistoria.proximos_passos) {
    if (doc.y > doc.page.height - 100) doc.addPage()
    secaoTitulo(doc, 'Próximos 7 Dias')
    texto(doc, vistoria.proximos_passos, { align: 'justify' })
  }

  const range = doc.bufferedPageRange()
  for (let i = 0; i < range.count; i++) { doc.switchToPage(i); footer(doc, i + 1) }
  doc.end()
  return doc
}

// ════════════════════════════════════════════════════════════════
// 3. MEMÓRIA DESCRITIVA DE ACABAMENTOS (pré-venda)
// ════════════════════════════════════════════════════════════════
export function generateMemoriaDescritiva({ negocio, imovel, fases, orcamento }) {
  const doc = new PDFDocument({ size: 'A4', margin: 50, bufferPages: true })

  header(doc, 'Memória Descritiva de Acabamentos', `${negocio.movimento}${imovel?.nome ? ' · ' + imovel.nome : ''}`)

  // Capa
  secaoTitulo(doc, 'Identificação do Imóvel')
  doc.fontSize(9).fillColor(TEXT)
  if (imovel?.nome) doc.text(`Imóvel: ${imovel.nome}`)
  if (imovel?.zona) doc.text(`Localização: ${imovel.zona}`)
  if (imovel?.tipologia) doc.text(`Tipologia: ${imovel.tipologia}`)
  doc.moveDown(0.3)

  // Acabamentos por categoria — baseado em secções de obra
  const seccoesAcabamento = [
    { key: 'pavimento', titulo: 'Pavimentos' },
    { key: 'pladur', titulo: 'Tetos' },
    { key: 'pintura', titulo: 'Pinturas' },
    { key: 'caixilharias', titulo: 'Caixilharias' },
    { key: 'casas_banho', titulo: 'Casas de Banho' },
    { key: 'cozinhas', titulo: 'Cozinha' },
    { key: 'portas', titulo: 'Portas' },
    { key: 'carpintarias', titulo: 'Carpintarias' },
    { key: 'avac', titulo: 'AVAC / AQS' },
    { key: 'capoto', titulo: 'Isolamento Exterior' },
    { key: 'cobertura', titulo: 'Cobertura' },
  ]

  for (const sec of seccoesAcabamento) {
    const dados = orcamento?.seccoes?.[sec.key]
    if (!dados) continue
    secaoTitulo(doc, sec.titulo)
    // Resumir campos relevantes
    let linhas = []
    if (Array.isArray(dados.linhas)) {
      for (const l of dados.linhas) {
        if (l.descricao && (l.quantidade || l.unitario || l.total)) {
          linhas.push(`${l.descricao}${l.quantidade ? ' — ' + l.quantidade : ''}${l.unitario ? ' @ ' + EUR(l.unitario) : ''}`)
        }
      }
    }
    if (linhas.length === 0) {
      doc.fontSize(8).fillColor(MUTED).text('Por especificar.', { width: doc.page.width - 100 })
    } else {
      doc.fontSize(8).fillColor(TEXT)
      linhas.slice(0, 8).forEach(l => doc.text(`  •  ${l}`, { width: doc.page.width - 100 }))
    }
    doc.moveDown(0.3)
  }

  // Garantias e ensaios
  secaoTitulo(doc, 'Garantias e Ensaios Realizados')
  doc.fontSize(8).fillColor(TEXT)
    .text('  •  Certificado energético (SCE)', { width: doc.page.width - 100 })
    .text('  •  Ficha Técnica da Habitação (FTH)', { width: doc.page.width - 100 })
    .text('  •  Ensaio de pressão da rede de águas', { width: doc.page.width - 100 })
    .text('  •  Certificação CERTIEL da rede eléctrica', { width: doc.page.width - 100 })
    .text('  •  Certificação ITG da rede de gás (se aplicável)', { width: doc.page.width - 100 })
    .text('  •  Telas finais (as-built)', { width: doc.page.width - 100 })
    .text('  •  Licença de utilização emitida', { width: doc.page.width - 100 })

  const range = doc.bufferedPageRange()
  for (let i = 0; i < range.count; i++) { doc.switchToPage(i); footer(doc, i + 1) }
  doc.end()
  return doc
}

// ════════════════════════════════════════════════════════════════
// 4. RELATÓRIO DE SAÍDA / DISTRIBUIÇÃO CAEP (pós-venda)
// ════════════════════════════════════════════════════════════════
export function generateRelatorioSaida({ negocio, imovel, fases, custoReal, investidores }) {
  const doc = new PDFDocument({ size: 'A4', margin: 50, bufferPages: true })

  header(doc, 'Relatório de Saída · CAEP', `${negocio.movimento}${imovel?.nome ? ' · ' + imovel.nome : ''}`)

  // Cálculos
  const valorVenda = Number(negocio.lucro_real) || 0
  const capitalTotal = Number(negocio.capital_total) || 0
  const lucroBruto = valorVenda - custoReal
  const nInv = Number(negocio.n_investidores) || (investidores?.length || 1)

  // KPIs financeiros
  const kpiW = (doc.page.width - 100 - 3 * 8) / 4
  const kpiY = doc.y
  kpiCard(doc, 50,                  kpiY, kpiW, 56, 'Valor de venda',  EUR(valorVenda), '#22c55e')
  kpiCard(doc, 50 + (kpiW + 8) * 1, kpiY, kpiW, 56, 'Capital investido', EUR(capitalTotal), BLACK)
  kpiCard(doc, 50 + (kpiW + 8) * 2, kpiY, kpiW, 56, 'Custo real obra', EUR(custoReal), '#ef4444')
  kpiCard(doc, 50 + (kpiW + 8) * 3, kpiY, kpiW, 56, 'Lucro bruto',     EUR(lucroBruto), GOLD)
  doc.y = kpiY + 72

  // TIR realizada (aproximação)
  if (capitalTotal > 0) {
    const dataCompra = negocio.data_compra ? new Date(negocio.data_compra) : null
    const dataVenda = negocio.data_venda ? new Date(negocio.data_venda) : new Date()
    const meses = dataCompra ? Math.max(1, (dataVenda - dataCompra) / (1000 * 60 * 60 * 24 * 30.44)) : 12
    const roi = capitalTotal > 0 ? (lucroBruto / capitalTotal) : 0
    const tirAnual = (Math.pow(1 + roi, 12 / meses) - 1) * 100

    secaoTitulo(doc, 'Performance')
    doc.fontSize(9).fillColor(TEXT)
      .text(`Período de investimento: ${Math.round(meses)} meses (${DATE(negocio.data_compra)} → ${DATE(negocio.data_venda || new Date().toISOString())})`)
      .text(`ROI total: ${(roi * 100).toFixed(1)}%`)
      .text(`TIR anualizada estimada: ${tirAnual.toFixed(1)}%`)
  }

  // Distribuição
  secaoTitulo(doc, 'Distribuição de Capital e Lucro')
  if (investidores && investidores.length > 0) {
    const headers = ['Investidor', 'Capital aportado', '%', 'Distribuição (capital + lucro)']
    const colW = [200, 100, 50, 150]
    let x = 50
    doc.fillColor(BLACK).font('Helvetica-Bold').fontSize(8)
    const yHead = doc.y
    headers.forEach((h, i) => { doc.text(h, x, yHead, { width: colW[i] }); x += colW[i] })
    doc.y = yHead + 12
    doc.moveTo(50, doc.y + 12).lineTo(doc.page.width - 50, doc.y + 12).strokeColor(LINE).stroke()
    doc.y += 18
    for (const inv of investidores) {
      const pct = capitalTotal > 0 ? (inv.capital / capitalTotal) : 1 / nInv
      const distribuicao = inv.capital + (lucroBruto * pct)
      const yIni = doc.y
      doc.fillColor(TEXT).font('Helvetica').fontSize(8)
        .text(inv.nome || '—', 50, yIni, { width: colW[0] })
        .text(EUR(inv.capital), 50 + colW[0], yIni, { width: colW[1] })
        .text(`${(pct * 100).toFixed(1)}%`, 50 + colW[0] + colW[1], yIni, { width: colW[2] })
        .fillColor('#22c55e').font('Helvetica-Bold')
        .text(EUR(distribuicao), 50 + colW[0] + colW[1] + colW[2], yIni, { width: colW[3] })
      doc.y = yIni + 14
    }
  } else {
    doc.fontSize(8).fillColor(MUTED).text('Sem lista detalhada de investidores. Adicione investidor_ids ao negócio para o detalhe individual.')
  }

  // Resumo final
  if (doc.y > doc.page.height - 120) doc.addPage()
  secaoTitulo(doc, 'Encerramento')
  doc.fontSize(9).fillColor(TEXT)
    .text(`Operação Fix and Flip concluída com sucesso.`)
    .text(`Todas as obrigações fiscais (IMT, IS, IRC/IRS) foram liquidadas previamente à distribuição.`)
    .text(`A documentação completa (escrituras, licenças, certificações) está arquivada no dossier do projecto.`)

  const range = doc.bufferedPageRange()
  for (let i = 0; i < range.count; i++) { doc.switchToPage(i); footer(doc, i + 1) }
  doc.end()
  return doc
}
