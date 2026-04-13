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

const EUR = v => {
  if (v == null || v === 0) return '—'
  return new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(v)
}

export function generateMeetingPDF(reuniao, analise, investidor) {
  const doc = new PDFDocument({ size: 'A4', margins: { top: 50, bottom: 50, left: 55, right: 55 } })
  const pw = doc.page.width
  const ml = 55
  const cw = pw - 110

  // Dados da análise (suporta ambos formatos: analise_completa ou meetingAnalysis)
  const perfil = analise?.perfil_investidor || analise?.investidor_dados || {}
  const investName = perfil?.nome || investidor?.nome || reuniao.titulo?.replace(/\s+e\s+alexandre\s+mendes/i, '').trim() || 'Investidor'
  const dataStr = reuniao.data ? new Date(reuniao.data).toLocaleDateString('pt-PT', { day: '2-digit', month: 'long', year: 'numeric' }) : '—'

  // ══════════════════════════════════════════════════════════
  // CAPA
  // ══════════════════════════════════════════════════════════
  doc.rect(0, 0, pw, doc.page.height).fill(BLACK)
  doc.rect(0, 0, pw, 5).fill(GOLD)
  doc.rect(35, 80, 2, doc.page.height - 160).fill(GOLD).opacity(0.3)
  doc.opacity(1)

  try {
    doc.image(readFileSync(LOGO_PATH), (pw - 200) / 2, 100, { width: 200 })
  } catch {
    doc.fontSize(30).fillColor(GOLD).text('SOMNIUM PROPERTIES', 0, 130, { align: 'center' })
  }

  doc.rect(pw / 2 - 30, 270, 60, 1).fill(GOLD)
  doc.fontSize(9).fillColor(GOLD).text('RELATÓRIO DE REUNIÃO', 0, 295, { align: 'center', characterSpacing: 5 })
  doc.fontSize(32).fillColor(WHITE).text(investName, ml, 340, { align: 'center', width: cw })

  const nameW = Math.min(doc.widthOfString(investName), cw)
  doc.rect((pw - nameW) / 2, doc.y + 10, nameW, 1).fill(GOLD).opacity(0.4)
  doc.opacity(1)

  doc.fontSize(11).fillColor(MUTED).text(dataStr, 0, 420, { align: 'center' })
  if (analise?.informacoes_reuniao?.duracao_min) {
    doc.fontSize(9).fillColor(MUTED).text(`Duração: ${analise.informacoes_reuniao.duracao_min} minutos`, 0, 440, { align: 'center' })
  }
  if (analise?.informacoes_reuniao?.participantes?.length) {
    doc.fontSize(8).fillColor('#555555').text(analise.informacoes_reuniao.participantes.join('  ·  '), ml, 475, { align: 'center', width: cw })
  }

  // Classificação badge
  const cls = analise?.classificacao_sugerida || perfil?.classificacao
  if (cls) {
    const clsColors = { A: '#22c55e', B: GOLD, C: '#f59e0b', D: '#ef4444' }
    const clsLabels = { A: 'ELEVADO POTENCIAL', B: 'BOM POTENCIAL', C: 'POTENCIAL MODERADO', D: 'BAIXO POTENCIAL' }
    const color = clsColors[cls] || GOLD
    doc.roundedRect(pw / 2 - 60, 530, 120, 50, 8).fill(color).opacity(0.15)
    doc.opacity(1)
    doc.roundedRect(pw / 2 - 60, 530, 120, 50, 8).lineWidth(1).stroke(color)
    doc.fontSize(28).fillColor(color).text(cls, pw / 2 - 15, 535, { width: 30, align: 'center' })
    doc.fontSize(7).fillColor(color).text(clsLabels[cls] || '', 0, 590, { align: 'center', characterSpacing: 1 })
  }

  // Footer capa
  doc.rect(0, doc.page.height - 65, pw, 65).fill(DARK)
  doc.rect(0, doc.page.height - 65, pw, 1).fill(GOLD).opacity(0.5)
  doc.opacity(1)
  doc.fontSize(7).fillColor(GOLD).text('SOMNIUM PROPERTIES · CONFIDENCIAL', 0, doc.page.height - 45, { align: 'center', characterSpacing: 2 })
  doc.fontSize(7).fillColor('#444444').text(`Ref. ${reuniao.id?.slice(0, 8)} · Gerado a ${new Date().toLocaleDateString('pt-PT')}`, 0, doc.page.height - 30, { align: 'center' })

  // ══════════════════════════════════════════════════════════
  // PÁGINA 2+: CONTEÚDO
  // ══════════════════════════════════════════════════════════
  doc.addPage()
  let y = 50

  // 1. INFORMAÇÕES DA REUNIÃO
  if (analise?.informacoes_reuniao?.contexto) {
    y = pageHeader(doc, 'INFORMAÇÕES DA REUNIÃO', y, cw, ml)
    doc.fontSize(10).fillColor(BODY).text(analise.informacoes_reuniao.contexto, ml, y, { width: cw, lineGap: 4 })
    y = doc.y + 20
  }

  // 2. RESUMO EXECUTIVO
  if (analise?.resumo_executivo) {
    y = cp(doc, y, 80)
    y = pageHeader(doc, 'RESUMO EXECUTIVO', y, cw, ml)
    doc.fontSize(10).fillColor(BODY).text(analise.resumo_executivo.replace(/\*\*/g, ''), ml, y, { width: cw, lineGap: 5 })
    y = doc.y + 20
  }

  // 3. PERFIL DO INVESTIDOR
  y = cp(doc, y, 100)
  y = sectionTitle(doc, 'Perfil do Investidor — ' + investName, y, cw, ml)
  const profileFields = [
    ['Localização', perfil.localizacao],
    ['Profissão', perfil.profissao],
    ['Experiência Imobiliária', perfil.experiencia_imobiliario],
    ['Motivação', perfil.motivacao],
    ['Capital Disponível', perfil.capital_disponivel?.notas || (perfil.capital_disponivel?.max ? EUR(perfil.capital_disponivel.max) : null)],
    ['Estratégia Preferida', Array.isArray(perfil.estrategia_preferida) ? perfil.estrategia_preferida.join(', ') : perfil.estrategia_preferida],
    ['Perfil de Risco', perfil.perfil_risco],
    ['Tipo de Investidor', perfil.tipo_investidor],
    ['Timeline Disponibilidade', perfil.timeline_disponibilidade],
  ].filter(([, v]) => v)

  for (let i = 0; i < profileFields.length; i++) {
    y = cp(doc, y, 35)
    if (i % 2 === 0) doc.rect(ml, y, cw, 30).fill(LIGHT)
    doc.fontSize(7).fillColor(MUTED).text(profileFields[i][0].toUpperCase(), ml + 12, y + 4, { width: 150 })
    doc.fontSize(9).fillColor(BODY).text(String(profileFields[i][1]), ml + 170, y + 4, { width: cw - 185, lineGap: 2 })
    y = Math.max(y + 30, doc.y + 4)
  }
  y += 10

  // Objeções
  if (perfil.objecoes?.length > 0) {
    y = cp(doc, y, 60)
    y = sectionTitle(doc, 'Objeções e Preocupações Identificadas', y, cw, ml)
    for (const obj of perfil.objecoes) {
      y = cp(doc, y, 20)
      doc.fontSize(8).fillColor('#ef4444').text('⚠', ml, y)
      doc.fontSize(9).fillColor(BODY).text(obj, ml + 16, y, { width: cw - 20, lineGap: 2 })
      y = doc.y + 6
    }
    y += 10
  }

  // 4. PONTOS-CHAVE
  if (analise?.pontos_chave?.length > 0) {
    y = cp(doc, y, 60)
    y = sectionTitle(doc, 'Pontos-Chave da Reunião', y, cw, ml)
    for (const p of analise.pontos_chave) {
      y = cp(doc, y, 20)
      doc.fontSize(8).fillColor(GOLD).text('▸', ml, y + 1)
      doc.fontSize(9).fillColor(BODY).text(p, ml + 14, y, { width: cw - 20, lineGap: 2 })
      y = doc.y + 6
    }
    y += 10
  }

  // 5. OPORTUNIDADES APRESENTADAS
  if (analise?.oportunidades_apresentadas?.length > 0) {
    y = cp(doc, y, 80)
    y = sectionTitle(doc, 'Oportunidades Apresentadas', y, cw, ml)
    for (const op of analise.oportunidades_apresentadas) {
      y = cp(doc, y, 50)
      doc.rect(ml, y, cw, 1).fill(BORDER)
      y += 8
      doc.fontSize(10).fillColor(BLACK).text(op.nome, ml, y)
      y = doc.y + 3
      const meta = [op.tipo, op.valor].filter(Boolean).join(' · ')
      if (meta) { doc.fontSize(8).fillColor(GOLD).text(meta, ml, y); y = doc.y + 3 }
      if (op.detalhes) { doc.fontSize(8).fillColor(MUTED).text(op.detalhes, ml, y, { width: cw, lineGap: 2 }); y = doc.y + 8 }
    }
    y += 10
  }

  // 6. MODELO DE PARCERIA
  if (analise?.modelo_parceria_discutido) {
    y = cp(doc, y, 60)
    y = sectionTitle(doc, 'Modelo de Parceria Discutido', y, cw, ml)
    doc.fontSize(9).fillColor(BODY).text(analise.modelo_parceria_discutido, ml, y, { width: cw, lineGap: 4 })
    y = doc.y + 15
  }

  // 7. IMPRESSÃO DO INVESTIDOR
  if (analise?.impressao_investidor) {
    y = cp(doc, y, 60)
    y = sectionTitle(doc, 'Impressão do Investidor', y, cw, ml)
    doc.rect(ml, y, 3, 0) // placeholder
    doc.rect(ml, y, 3, 60).fill(GOLD)
    doc.fontSize(9).fillColor(BODY).text(analise.impressao_investidor, ml + 14, y + 2, { width: cw - 20, lineGap: 4 })
    y = doc.y + 15
  }

  // 8. PROBABILIDADE
  if (analise?.probabilidade_investimento != null) {
    y = cp(doc, y, 50)
    doc.rect(ml, y, cw, 40).fill(LIGHT)
    doc.fontSize(8).fillColor(MUTED).text('PROBABILIDADE DE INVESTIMENTO', ml + 12, y + 6, { characterSpacing: 1 })
    const pct = analise.probabilidade_investimento
    const barW = cw - 100
    doc.rect(ml + 12, y + 22, barW, 10).fill('#e5e7eb')
    const pctColor = pct >= 70 ? '#22c55e' : pct >= 40 ? GOLD : '#ef4444'
    doc.rect(ml + 12, y + 22, barW * pct / 100, 10).fill(pctColor)
    doc.fontSize(12).fillColor(BLACK).text(`${pct}%`, ml + barW + 20, y + 18)
    y += 55
  }

  // 9. PRÓXIMOS PASSOS
  if (analise?.proximos_passos?.length > 0) {
    y = cp(doc, y, 60)
    y = sectionTitle(doc, 'Próximos Passos', y, cw, ml)
    analise.proximos_passos.forEach((p, i) => {
      y = cp(doc, y, 22)
      doc.circle(ml + 8, y + 7, 8).fill(GOLD)
      doc.fontSize(8).fillColor(WHITE).text(`${i + 1}`, ml + 3, y + 3, { width: 10, align: 'center' })
      doc.fontSize(9).fillColor(BODY).text(p, ml + 24, y + 2, { width: cw - 30, lineGap: 3 })
      y = Math.max(y + 20, doc.y + 6)
    })
    y += 10
  }

  // 10. SUGESTÕES DE MELHORIA
  if (analise?.sugestoes_melhoria?.length > 0) {
    y = cp(doc, y, 80)
    y = pageHeader(doc, 'RECOMENDAÇÕES PARA PRÓXIMAS REUNIÕES', y, cw, ml)
    for (const s of analise.sugestoes_melhoria) {
      y = cp(doc, y, 30)
      doc.rect(ml, y, 3, 16).fill(GOLD)
      doc.fontSize(9).fillColor(BODY).text(s, ml + 14, y + 1, { width: cw - 20, lineGap: 3 })
      y = doc.y + 10
    }
  }

  // CONTRACAPA
  doc.addPage({ margins: { top: 0, bottom: 0, left: 0, right: 0 } })
  doc.rect(0, 0, pw, doc.page.height).fill(BLACK)
  doc.rect(0, 0, pw, 5).fill(GOLD)
  try {
    doc.image(readFileSync(LOGO_PATH), (pw - 140) / 2, doc.page.height / 2 - 60, { width: 140 })
  } catch {}
  doc.fontSize(8).fillColor('#444444').text('Documento confidencial. Proibida a reprodução sem autorização.', 0, doc.page.height / 2 + 40, { align: 'center' })
  doc.fontSize(8).fillColor(MUTED).text('www.somniumproperties.pt', 0, doc.page.height / 2 + 58, { align: 'center' })
  doc.rect(0, doc.page.height - 5, pw, 5).fill(GOLD)

  doc.end()
  return doc
}

// ── Helpers ──────────────────────────────────────────────────

function pageHeader(doc, title, y, cw, ml) {
  doc.rect(ml, y, cw, 32).fill(BLACK)
  doc.rect(ml, y, 4, 32).fill(GOLD)
  doc.fontSize(9).fillColor(GOLD).text(title, ml + 14, y + 10, { characterSpacing: 3 })
  return y + 44
}

function sectionTitle(doc, title, y, cw, ml) {
  doc.fontSize(11).fillColor(BLACK).text(title, ml, y)
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
