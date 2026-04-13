/**
 * Relatório PDF executivo de reunião com investidor.
 * Layout empresarial Somnium Properties — interpretativo, sem transcrição.
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

const PT = 50  // page top margin
const PB = 60  // page bottom margin

export function generateMeetingPDF(reuniao, analise, investidor) {
  // autoFirstPage: false prevents PDFKit from creating an automatic first page
  const doc = new PDFDocument({ size: 'A4', autoFirstPage: false })
  const pw = 595.28  // A4 width
  const ph = 841.89  // A4 height
  const ml = 55
  const cw = pw - 110

  const perfil = analise?.perfil_investidor || analise?.investidor_dados || {}
  const investName = perfil?.nome || investidor?.nome || reuniao.titulo?.replace(/\s+e\s+alexandre\s+mendes/i, '').trim() || 'Investidor'
  const dataStr = reuniao.data ? new Date(reuniao.data).toLocaleDateString('pt-PT', { day: '2-digit', month: 'long', year: 'numeric' }) : '—'

  let y = PT

  function needsPage(needed) {
    if (y + needed > ph - PB) {
      doc.addPage({ size: 'A4', margins: { top: PT, bottom: PB, left: ml, right: ml } })
      y = PT
    }
  }

  // ══════════════════════════════════════════════════════════
  // PAGE 1: CAPA
  // ══════════════════════════════════════════════════════════
  doc.addPage({ size: 'A4', margins: { top: 0, bottom: 0, left: 0, right: 0 } })

  doc.rect(0, 0, pw, ph).fill(BLACK)
  doc.rect(0, 0, pw, 5).fill(GOLD)
  doc.rect(35, 80, 2, ph - 160).fill(GOLD).opacity(0.3)
  doc.opacity(1)

  try {
    doc.image(readFileSync(LOGO_PATH), (pw - 200) / 2, 100, { width: 200 })
  } catch {
    doc.fontSize(30).fillColor(GOLD).text('SOMNIUM PROPERTIES', 0, 130, { align: 'center', lineBreak: false })
  }

  doc.rect(pw / 2 - 30, 270, 60, 1).fill(GOLD)
  doc.fontSize(9).fillColor(GOLD).text('RELATÓRIO DE REUNIÃO', ml, 295, { width: cw, align: 'center', lineBreak: false })
  doc.fontSize(28).fillColor(WHITE).text(investName, ml, 340, { width: cw, align: 'center', lineBreak: false })
  doc.fontSize(11).fillColor(MUTED).text(dataStr, ml, 400, { width: cw, align: 'center', lineBreak: false })

  if (analise?.informacoes_reuniao?.duracao_min) {
    doc.fontSize(9).fillColor(MUTED).text(`Duração: ${analise.informacoes_reuniao.duracao_min} minutos`, ml, 420, { width: cw, align: 'center', lineBreak: false })
  }
  if (analise?.informacoes_reuniao?.participantes?.length) {
    doc.fontSize(8).fillColor('#555555').text(analise.informacoes_reuniao.participantes.join('  ·  '), ml, 455, { width: cw, align: 'center', lineBreak: false })
  }

  const cls = analise?.classificacao_sugerida || perfil?.classificacao
  if (cls) {
    const clsColors = { A: '#22c55e', B: GOLD, C: '#f59e0b', D: '#ef4444' }
    const clsLabels = { A: 'ELEVADO POTENCIAL', B: 'BOM POTENCIAL', C: 'POTENCIAL MODERADO', D: 'BAIXO POTENCIAL' }
    const color = clsColors[cls] || GOLD
    doc.roundedRect(pw / 2 - 55, 510, 110, 45, 8).fill(color).opacity(0.15)
    doc.opacity(1)
    doc.roundedRect(pw / 2 - 55, 510, 110, 45, 8).lineWidth(1).stroke(color)
    doc.fontSize(26).fillColor(color).text(cls, pw / 2 - 10, 515, { width: 20, align: 'center', lineBreak: false })
    doc.fontSize(7).fillColor(color).text(clsLabels[cls] || '', ml, 565, { width: cw, align: 'center', lineBreak: false })
  }

  doc.rect(0, ph - 60, pw, 60).fill(DARK)
  doc.rect(0, ph - 60, pw, 1).fill(GOLD).opacity(0.5)
  doc.opacity(1)
  doc.fontSize(7).fillColor(GOLD).text('SOMNIUM PROPERTIES · CONFIDENCIAL', ml, ph - 40, { width: cw, align: 'center', lineBreak: false })
  doc.fontSize(7).fillColor('#444444').text(`Ref. ${reuniao.id?.slice(0, 8)} · ${new Date().toLocaleDateString('pt-PT')}`, ml, ph - 26, { width: cw, align: 'center', lineBreak: false })

  // ══════════════════════════════════════════════════════════
  // PAGE 2+: CONTEÚDO
  // ══════════════════════════════════════════════════════════
  doc.addPage({ size: 'A4', margins: { top: PT, bottom: PB, left: ml, right: ml } })
  y = PT

  // 1. INFORMAÇÕES DA REUNIÃO
  if (analise?.informacoes_reuniao?.contexto) {
    y = hdr(doc, 'INFORMAÇÕES DA REUNIÃO', y, cw, ml)
    doc.fontSize(10).fillColor(BODY).text(analise.informacoes_reuniao.contexto, ml, y, { width: cw, lineGap: 4 })
    y = doc.y + 8
  }

  // 2. RESUMO EXECUTIVO
  if (analise?.resumo_executivo) {
    needsPage(80)
    y = hdr(doc, 'RESUMO EXECUTIVO', y, cw, ml)
    doc.fontSize(10).fillColor(BODY).text(analise.resumo_executivo.replace(/\*\*/g, ''), ml, y, { width: cw, lineGap: 5 })
    y = doc.y + 8
  }

  // 3. PERFIL DO INVESTIDOR
  const profileFields = [
    ['Localização', perfil.localizacao],
    ['Profissão', perfil.profissao],
    ['Experiência Imobiliária', perfil.experiencia_imobiliario],
    ['Motivação', perfil.motivacao],
    ['Capital Disponível', perfil.capital_disponivel?.notas || (perfil.capital_disponivel?.max ? `€ ${perfil.capital_disponivel.max.toLocaleString('pt-PT')}` : null)],
    ['Estratégia Preferida', Array.isArray(perfil.estrategia_preferida) ? perfil.estrategia_preferida.join(', ') : perfil.estrategia_preferida],
    ['Perfil de Risco', perfil.perfil_risco],
    ['Tipo de Investidor', perfil.tipo_investidor],
    ['Timeline', perfil.timeline_disponibilidade],
  ].filter(([, v]) => v)

  if (profileFields.length > 0) {
    needsPage(50)
    y = sec(doc, 'Perfil do Investidor — ' + investName, y, cw, ml)
    for (let i = 0; i < profileFields.length; i++) {
      needsPage(28)
      if (i % 2 === 0) doc.rect(ml, y, cw, 26).fill(LIGHT)
      doc.fontSize(7).fillColor(MUTED).text(profileFields[i][0].toUpperCase(), ml + 10, y + 4, { width: 145, lineBreak: false })
      doc.fontSize(9).fillColor(BODY).text(String(profileFields[i][1]), ml + 160, y + 3, { width: cw - 175, lineGap: 2 })
      y = Math.max(y + 26, doc.y + 2)
    }
    y += 4
  }

  // Objeções
  if (perfil.objecoes?.length > 0) {
    needsPage(35)
    y = sec(doc, 'Objeções e Preocupações', y, cw, ml)
    for (const obj of perfil.objecoes) {
      needsPage(16)
      doc.fontSize(9).fillColor('#ef4444').text('⚠ ', ml, y, { continued: true }).fillColor(BODY).text(obj, { width: cw - 16, lineGap: 2 })
      y = doc.y + 3
    }
    y += 4
  }

  // 4. PONTOS-CHAVE
  if (analise?.pontos_chave?.length > 0) {
    needsPage(35)
    y = sec(doc, 'Pontos-Chave da Reunião', y, cw, ml)
    for (const p of analise.pontos_chave) {
      needsPage(16)
      doc.fontSize(9).fillColor(GOLD).text('▸ ', ml, y, { continued: true }).fillColor(BODY).text(p, { width: cw - 16, lineGap: 2 })
      y = doc.y + 3
    }
    y += 4
  }

  // 5. OPORTUNIDADES APRESENTADAS
  if (analise?.oportunidades_apresentadas?.length > 0) {
    needsPage(40)
    y = sec(doc, 'Oportunidades Apresentadas', y, cw, ml)
    for (const op of analise.oportunidades_apresentadas) {
      needsPage(35)
      doc.rect(ml, y, cw, 0.5).fill(BORDER); y += 5
      doc.fontSize(10).fillColor(BLACK).text(op.nome, ml, y, { width: cw }); y = doc.y + 1
      const meta = [op.tipo, op.valor].filter(Boolean).join(' · ')
      if (meta) { doc.fontSize(8).fillColor(GOLD).text(meta, ml, y, { width: cw }); y = doc.y + 1 }
      if (op.detalhes) { doc.fontSize(8).fillColor(MUTED).text(op.detalhes, ml, y, { width: cw, lineGap: 2 }); y = doc.y + 5 }
    }
    y += 4
  }

  // 6. MODELO DE PARCERIA
  if (analise?.modelo_parceria_discutido) {
    needsPage(45)
    y = sec(doc, 'Modelo de Parceria Discutido', y, cw, ml)
    doc.fontSize(9).fillColor(BODY).text(analise.modelo_parceria_discutido, ml, y, { width: cw, lineGap: 4 })
    y = doc.y + 6
  }

  // 7. IMPRESSÃO DO INVESTIDOR
  if (analise?.impressao_investidor) {
    needsPage(45)
    y = sec(doc, 'Impressão do Investidor', y, cw, ml)
    doc.rect(ml, y, 3, 50).fill(GOLD)
    doc.fontSize(9).fillColor(BODY).text(analise.impressao_investidor, ml + 14, y + 2, { width: cw - 20, lineGap: 4 })
    y = doc.y + 6
  }

  // 8. PROBABILIDADE
  if (analise?.probabilidade_investimento != null) {
    needsPage(40)
    doc.rect(ml, y, cw, 34).fill(LIGHT)
    doc.fontSize(8).fillColor(MUTED).text('PROBABILIDADE DE INVESTIMENTO', ml + 10, y + 5, { lineBreak: false })
    const pct = analise.probabilidade_investimento
    const barW = cw - 90
    doc.rect(ml + 10, y + 19, barW, 8).fill('#e5e7eb')
    const pctColor = pct >= 70 ? '#22c55e' : pct >= 40 ? GOLD : '#ef4444'
    doc.rect(ml + 10, y + 19, barW * pct / 100, 8).fill(pctColor)
    doc.fontSize(11).fillColor(BLACK).text(`${pct}%`, ml + barW + 16, y + 15, { lineBreak: false })
    y += 42
  }

  // 9. PRÓXIMOS PASSOS
  if (analise?.proximos_passos?.length > 0) {
    needsPage(35)
    y = sec(doc, 'Próximos Passos', y, cw, ml)
    analise.proximos_passos.forEach((p, i) => {
      needsPage(18)
      doc.circle(ml + 7, y + 6, 7).fill(GOLD)
      doc.fontSize(7).fillColor(WHITE).text(`${i + 1}`, ml + 3, y + 3, { width: 8, align: 'center', lineBreak: false })
      doc.fontSize(9).fillColor(BODY).text(p, ml + 20, y + 1, { width: cw - 26, lineGap: 2 })
      y = Math.max(y + 16, doc.y + 3)
    })
    y += 4
  }

  // 10. RECOMENDAÇÕES
  if (analise?.sugestoes_melhoria?.length > 0) {
    needsPage(50)
    y = hdr(doc, 'RECOMENDAÇÕES PARA PRÓXIMAS REUNIÕES', y, cw, ml)
    for (const s of analise.sugestoes_melhoria) {
      needsPage(22)
      doc.rect(ml, y, 3, 14).fill(GOLD)
      doc.fontSize(9).fillColor(BODY).text(s, ml + 12, y + 1, { width: cw - 18, lineGap: 3 })
      y = doc.y + 5
    }
  }

  doc.end()
  return doc
}

function hdr(doc, title, y, cw, ml) {
  doc.rect(ml, y, cw, 28).fill(BLACK)
  doc.rect(ml, y, 4, 28).fill(GOLD)
  doc.fontSize(9).fillColor(GOLD).text(title, ml + 12, y + 8, { lineBreak: false })
  return y + 34
}

function sec(doc, title, y, cw, ml) {
  doc.fontSize(11).fillColor(BLACK).text(title, ml, y, { lineBreak: false })
  y += 14
  doc.rect(ml, y, 40, 2).fill(GOLD)
  doc.rect(ml + 42, y + 0.5, cw - 42, 0.5).fill(BORDER)
  return y + 10
}
