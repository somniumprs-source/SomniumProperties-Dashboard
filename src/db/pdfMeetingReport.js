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

const PAGE_TOP = 50
const PAGE_BOTTOM = 60

export function generateMeetingPDF(reuniao, analise, investidor) {
  const doc = new PDFDocument({ size: 'A4', margins: { top: PAGE_TOP, bottom: PAGE_BOTTOM, left: 55, right: 55 } })
  const pw = doc.page.width
  const ph = doc.page.height
  const ml = 55
  const cw = pw - 110

  const perfil = analise?.perfil_investidor || analise?.investidor_dados || {}
  const investName = perfil?.nome || investidor?.nome || reuniao.titulo?.replace(/\s+e\s+alexandre\s+mendes/i, '').trim() || 'Investidor'
  const dataStr = reuniao.data ? new Date(reuniao.data).toLocaleDateString('pt-PT', { day: '2-digit', month: 'long', year: 'numeric' }) : '—'

  // Track current Y position across pages
  let y = PAGE_TOP

  // Helper: ensure space, add page only if truly needed
  function ensureSpace(needed) {
    if (y + needed > ph - PAGE_BOTTOM && y > PAGE_TOP + 10) {
      doc.addPage()
      y = PAGE_TOP
    }
  }

  // ══════════════════════════════════════════════════════════
  // CAPA (page 1)
  // ══════════════════════════════════════════════════════════
  doc.rect(0, 0, pw, ph).fill(BLACK)
  doc.rect(0, 0, pw, 5).fill(GOLD)
  doc.rect(35, 80, 2, ph - 160).fill(GOLD).opacity(0.3)
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

  doc.rect(0, ph - 65, pw, 65).fill(DARK)
  doc.rect(0, ph - 65, pw, 1).fill(GOLD).opacity(0.5)
  doc.opacity(1)
  doc.fontSize(7).fillColor(GOLD).text('SOMNIUM PROPERTIES · CONFIDENCIAL', 0, ph - 45, { align: 'center', characterSpacing: 2 })
  doc.fontSize(7).fillColor('#444444').text(`Ref. ${reuniao.id?.slice(0, 8)} · Gerado a ${new Date().toLocaleDateString('pt-PT')}`, 0, ph - 30, { align: 'center' })

  // ══════════════════════════════════════════════════════════
  // CONTEÚDO (page 2+)
  // ══════════════════════════════════════════════════════════
  doc.addPage()
  y = PAGE_TOP

  // 1. INFORMAÇÕES DA REUNIÃO
  if (analise?.informacoes_reuniao?.contexto) {
    ensureSpace(80)
    y = drawHeader(doc, 'INFORMAÇÕES DA REUNIÃO', y, cw, ml)
    doc.fontSize(10).fillColor(BODY).text(analise.informacoes_reuniao.contexto, ml, y, { width: cw, lineGap: 4 })
    y = doc.y + 8
  }

  // 2. RESUMO EXECUTIVO
  if (analise?.resumo_executivo) {
    ensureSpace(80)
    y = drawHeader(doc, 'RESUMO EXECUTIVO', y, cw, ml)
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
    ['Timeline Disponibilidade', perfil.timeline_disponibilidade],
  ].filter(([, v]) => v)

  if (profileFields.length > 0) {
    ensureSpace(60)
    y = drawSection(doc, 'Perfil do Investidor — ' + investName, y, cw, ml)
    for (let i = 0; i < profileFields.length; i++) {
      ensureSpace(32)
      if (i % 2 === 0) doc.rect(ml, y, cw, 28).fill(LIGHT)
      doc.fontSize(7).fillColor(MUTED).text(profileFields[i][0].toUpperCase(), ml + 12, y + 4, { width: 150 })
      doc.fontSize(9).fillColor(BODY).text(String(profileFields[i][1]), ml + 170, y + 4, { width: cw - 185, lineGap: 2 })
      y = Math.max(y + 28, doc.y + 2)
    }
    y += 4
  }

  // Objeções
  if (perfil.objecoes?.length > 0) {
    ensureSpace(40)
    y = drawSection(doc, 'Objeções e Preocupações Identificadas', y, cw, ml)
    for (const obj of perfil.objecoes) {
      ensureSpace(18)
      doc.fontSize(9).fillColor('#ef4444').text('⚠ ', ml, y, { continued: true })
      doc.fillColor(BODY).text(obj, { width: cw - 16, lineGap: 2 })
      y = doc.y + 4
    }
    y += 4
  }

  // 4. PONTOS-CHAVE
  if (analise?.pontos_chave?.length > 0) {
    ensureSpace(40)
    y = drawSection(doc, 'Pontos-Chave da Reunião', y, cw, ml)
    for (const p of analise.pontos_chave) {
      ensureSpace(18)
      doc.fontSize(9).fillColor(GOLD).text('▸ ', ml, y, { continued: true })
      doc.fillColor(BODY).text(p, { width: cw - 16, lineGap: 2 })
      y = doc.y + 4
    }
    y += 4
  }

  // 5. OPORTUNIDADES APRESENTADAS
  if (analise?.oportunidades_apresentadas?.length > 0) {
    ensureSpace(50)
    y = drawSection(doc, 'Oportunidades Apresentadas', y, cw, ml)
    for (const op of analise.oportunidades_apresentadas) {
      ensureSpace(40)
      doc.rect(ml, y, cw, 0.5).fill(BORDER)
      y += 6
      doc.fontSize(10).fillColor(BLACK).text(op.nome, ml, y)
      y = doc.y + 2
      const meta = [op.tipo, op.valor].filter(Boolean).join(' · ')
      if (meta) { doc.fontSize(8).fillColor(GOLD).text(meta, ml, y); y = doc.y + 2 }
      if (op.detalhes) { doc.fontSize(8).fillColor(MUTED).text(op.detalhes, ml, y, { width: cw, lineGap: 2 }); y = doc.y + 6 }
    }
    y += 4
  }

  // 6. MODELO DE PARCERIA
  if (analise?.modelo_parceria_discutido) {
    ensureSpace(50)
    y = drawSection(doc, 'Modelo de Parceria Discutido', y, cw, ml)
    doc.fontSize(9).fillColor(BODY).text(analise.modelo_parceria_discutido, ml, y, { width: cw, lineGap: 4 })
    y = doc.y + 8
  }

  // 7. IMPRESSÃO DO INVESTIDOR
  if (analise?.impressao_investidor) {
    ensureSpace(50)
    y = drawSection(doc, 'Impressão do Investidor', y, cw, ml)
    const textH = doc.heightOfString(analise.impressao_investidor, { width: cw - 20, lineGap: 4, fontSize: 9 })
    doc.rect(ml, y, 3, Math.min(textH + 4, 120)).fill(GOLD)
    doc.fontSize(9).fillColor(BODY).text(analise.impressao_investidor, ml + 14, y + 2, { width: cw - 20, lineGap: 4 })
    y = doc.y + 8
  }

  // 8. PROBABILIDADE
  if (analise?.probabilidade_investimento != null) {
    ensureSpace(45)
    doc.rect(ml, y, cw, 36).fill(LIGHT)
    doc.fontSize(8).fillColor(MUTED).text('PROBABILIDADE DE INVESTIMENTO', ml + 12, y + 5, { characterSpacing: 1 })
    const pct = analise.probabilidade_investimento
    const barW = cw - 100
    doc.rect(ml + 12, y + 20, barW, 8).fill('#e5e7eb')
    const pctColor = pct >= 70 ? '#22c55e' : pct >= 40 ? GOLD : '#ef4444'
    doc.rect(ml + 12, y + 20, barW * pct / 100, 8).fill(pctColor)
    doc.fontSize(11).fillColor(BLACK).text(`${pct}%`, ml + barW + 18, y + 16)
    y += 44
  }

  // 9. PRÓXIMOS PASSOS
  if (analise?.proximos_passos?.length > 0) {
    ensureSpace(40)
    y = drawSection(doc, 'Próximos Passos', y, cw, ml)
    analise.proximos_passos.forEach((p, i) => {
      ensureSpace(20)
      doc.circle(ml + 8, y + 6, 7).fill(GOLD)
      doc.fontSize(7).fillColor(WHITE).text(`${i + 1}`, ml + 4, y + 3, { width: 8, align: 'center' })
      doc.fontSize(9).fillColor(BODY).text(p, ml + 22, y + 1, { width: cw - 28, lineGap: 2 })
      y = Math.max(y + 18, doc.y + 4)
    })
    y += 4
  }

  // 10. SUGESTÕES DE MELHORIA
  if (analise?.sugestoes_melhoria?.length > 0) {
    ensureSpace(60)
    y = drawHeader(doc, 'RECOMENDAÇÕES PARA PRÓXIMAS REUNIÕES', y, cw, ml)
    for (const s of analise.sugestoes_melhoria) {
      ensureSpace(24)
      const sH = doc.heightOfString(s, { width: cw - 20, lineGap: 3, fontSize: 9 })
      doc.rect(ml, y, 3, Math.min(sH + 2, 40)).fill(GOLD)
      doc.fontSize(9).fillColor(BODY).text(s, ml + 14, y + 1, { width: cw - 20, lineGap: 3 })
      y = doc.y + 6
    }
  }

  // Footer final
  doc.fontSize(7).fillColor(MUTED).text('Somnium Properties · Documento confidencial · www.somniumproperties.pt', ml, ph - 40, { width: cw, align: 'center' })

  doc.end()
  return doc
}

// ── Drawing helpers ──────────────────────────────────────────

function drawHeader(doc, title, y, cw, ml) {
  doc.rect(ml, y, cw, 30).fill(BLACK)
  doc.rect(ml, y, 4, 30).fill(GOLD)
  doc.fontSize(9).fillColor(GOLD).text(title, ml + 14, y + 9, { characterSpacing: 3 })
  return y + 38
}

function drawSection(doc, title, y, cw, ml) {
  doc.fontSize(11).fillColor(BLACK).text(title, ml, y)
  y = doc.y + 3
  doc.rect(ml, y, 40, 2).fill(GOLD)
  doc.rect(ml + 42, y + 0.5, cw - 42, 0.5).fill('#e0ddd5')
  return y + 12
}
