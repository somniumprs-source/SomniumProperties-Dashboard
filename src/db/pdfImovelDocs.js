/**
 * Documentos PDF profissionais por fase do imóvel.
 * Layout empresarial Somnium Properties — mobile-friendly.
 */
import PDFDocument from 'pdfkit'
import { readFileSync, existsSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { rasterizarSvgParaPng } from '../lib/estudoLocalizacao.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const LOGO_PATH = path.resolve(__dirname, '../../public/logo-transparent.png')
const STRESS_DIR = path.resolve(__dirname, '../../public/uploads/stress_tests')

// Design tokens (reference: Proposta de Investimento Somnium)
const C = {
  gold: '#C9A84C', black: '#0d0d0d', white: '#ffffff',
  bg: '#f7f6f2', body: '#2a2a2a', muted: '#888888',
  border: '#e0ddd5', light: '#f0efe9', accent: '#1a1a1a',
  headerBg: '#f0efe9', totalBg: '#f5f3ee',
  green: '#2d6a2d', red: '#8b2020', blue: '#6366f1',
}
const ML = 50, MR = 50 // margins
const PW = 595.28, PH = 841.89
const CW = PW - ML - MR // content width

const EUR = v => v == null || v === 0 ? '—' : new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(v)
const PCT = v => v == null ? '—' : `${v}%`
const FDATE = d => { if (!d) return '—'; try { return new Date(d).toLocaleDateString('pt-PT') } catch { return d } }
const NOW = () => new Date().toLocaleDateString('pt-PT', { day: '2-digit', month: 'long', year: 'numeric' })

// Limpa items de listas multi-linha (pontos_fortes, riscos, etc.):
// remove backticks/aspas residuais, numeracao "1." / "1)" e bullets
// pre-existentes ("•", "-", "*"). Devolve array de strings nao-vazias.
function parseListItems(text) {
  if (!text) return []
  return String(text)
    .split(/\r?\n/)
    .map(s => s
      .trim()
      .replace(/^[`'"\s]+/, '')
      .replace(/^[•▸▪◦*\-]+\s*/, '')
      .replace(/^\d+\s*[.)]\s*/, '')
      .replace(/^[`'"\s]+/, '')
      .trim()
    )
    .filter(Boolean)
}

// Parse fotos JSON from imovel — only images, max 6 for PDF
function parseFotos(im) {
  try {
    const all = typeof im.fotos === 'string' ? JSON.parse(im.fotos || '[]') : (im.fotos || [])
    return all
      .filter(f => f.folder !== 'documentos' && (f.type?.startsWith('image/') || f.path?.match(/\.(jpg|jpeg|png|webp)$/i)))
      .slice(0, 6) // max 6 photos in PDF
  } catch { return [] }
}

// ── Estado → Documentos ──────────────────────────────────────
const ESTADO_DOC_MAP = {
  'Adicionado':                      ['ficha_imovel'],
  'Necessidade de Visita':           ['ficha_visita'],
  'Estudo de VVR':                   ['analise_rentabilidade', 'estudo_comparaveis'],
  'Criar Proposta ao Proprietário':  ['proposta_formal'],
  'Enviar proposta ao Proprietário': ['proposta_formal'],
  'Em negociação':                   ['resumo_negociacao'],
  'Proposta aceite':                 ['resumo_acordo'],
  'Enviar proposta ao investidor':   ['dossier_investidor', 'proposta_investimento_anonima'],
  'Follow Up após proposta':         ['ficha_follow_up'],
  'Follow UP':                       ['ficha_follow_up'],
  'Wholesaling':                     ['ficha_cedencia'],
  'CAEP':                            ['ficha_acompanhamento_obra'],
  'Fix and Flip':                    ['ficha_acompanhamento_obra'],
  'Não interessa':                   ['ficha_descarte'],
}

export function getDocsForEstado(estado) { return ESTADO_DOC_MAP[estado] || [] }

const DOC_LABELS = {
  ficha_imovel: 'Ficha do Imóvel',
  ficha_visita: 'Ficha de Visita',
  analise_rentabilidade: 'Análise de Rentabilidade',
  estudo_comparaveis: 'Estudo de Comparáveis',
  proposta_formal: 'Proposta ao Proprietário',
  dossier_investidor: 'Dossier de Investimento',
  proposta_investimento_anonima: 'Proposta de Investimento (Anónima)',
  resumo_negociacao: 'Resumo de Negociação',
  resumo_acordo: 'Resumo de Acordo',
  ficha_follow_up: 'Ficha de Follow Up',
  ficha_cedencia: 'Ficha de Cedência',
  ficha_acompanhamento_obra: 'Acompanhamento de Obra',
  ficha_descarte: 'Ficha de Descarte',
}

// PNG magic number: 0x89 0x50 0x4E 0x47
function isPng(buf) { return buf.length >= 4 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47 }
// JPEG magic: FF D8 FF
function isJpeg(buf) { return buf.length >= 3 && buf[0] === 0xFF && buf[1] === 0xD8 && buf[2] === 0xFF }

// Le dimensoes do header PNG (IHDR chunk: bytes 16-19 width, 20-23 height, big-endian).
function pngDimensions(buf) {
  if (!isPng(buf) || buf.length < 24) return null
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) }
}

// Garante que o buffer e PNG ou JPEG (formatos aceites pelo PDFKit).
// Se for SVG (legacy estudo de localizacao), rasteriza on-the-fly.
function normalizarImagemParaPdf(buf) {
  if (!buf || buf.length === 0) return null
  if (isPng(buf) || isJpeg(buf)) return buf
  // Heuristica SVG: comeca com '<' (talvez apos BOM/whitespace)
  const head = buf.slice(0, 256).toString('utf8').trimStart()
  if (head.startsWith('<?xml') || head.startsWith('<svg')) {
    try { return rasterizarSvgParaPng(buf.toString('utf8')) } catch { return null }
  }
  return null
}

// Pré-carrega imagem de localização (URL Supabase ou path local) e
// devolve novo objecto imóvel com `_localizacaoImgData` (Buffer) injectado.
// Aceita SVG legacy: rasteriza para PNG antes de entregar ao renderer.
// Se a URL falhar, devolve o imóvel original — o renderer mostra fallback.
async function preloadLocalizacao(imovel) {
  const url = imovel?.localizacao_imagem
  if (!url) return imovel
  try {
    let buf = null
    if (url.startsWith('http')) {
      const r = await fetch(url)
      if (!r.ok) return imovel
      buf = Buffer.from(await r.arrayBuffer())
    } else {
      const localPath = path.resolve(__dirname, '../..', 'public', url.replace(/^\//, ''))
      if (existsSync(localPath)) buf = readFileSync(localPath)
    }
    const png = normalizarImagemParaPdf(buf)
    if (png) return { ...imovel, _localizacaoImgData: png }
  } catch { /* ignore — renderer mostra fallback */ }
  return imovel
}

export async function generateDoc(tipo, imovel, analise = null) {
  const fn = GENERATORS[tipo]
  if (!fn) return null
  // Tipos investidor precisam da imagem de localização pré-carregada
  // (Supabase URL exige fetch async; o resto do render é síncrono).
  const investidor = ['relatorio_investimento', 'dossier_investidor', 'proposta_investimento_anonima']
  const im = investidor.includes(tipo) ? await preloadLocalizacao(imovel) : imovel
  return fn(im, analise)
}

// ══════════════════════════════════════════════════════════════
// LAYOUT SYSTEM — Professional, mobile-friendly
// ══════════════════════════════════════════════════════════════

class DocBuilder {
  constructor(title, subtitle, imovel, opts = {}) {
    this.doc = new PDFDocument({ size: 'A4', autoFirstPage: false, bufferPages: true })
    this.y = 0
    this.imovel = imovel
    this.style = opts.style || 'default'
    this.title = title
    this.heroItems = opts.heroItems || null
    this._drawCover(title, subtitle)
    this.newPage()
  }

  _drawCover(title, subtitle) {
    const d = this.doc
    const im = this.imovel
    d.addPage({ size: 'A4', margins: { top: 0, bottom: 0, left: 0, right: 0 } })

    if (this.style === 'investor') {
      // Capa estilo CIM institucional: barra dark topo, hero box central, term-sheet snippet
      d.rect(0, 0, PW, 6).fill(C.black)
      try { d.image(readFileSync(LOGO_PATH), (PW - 130) / 2, 70, { width: 130 }) } catch {}
      d.fontSize(8).fillColor(C.muted).text('SOMNIUM PROPERTIES', ML, 180, { width: CW, align: 'center', characterSpacing: 2.5, lineBreak: false })
      d.fontSize(8).fillColor(C.muted).text('Real Estate Value-Add  ·  Coimbra', ML, 194, { width: CW, align: 'center', lineBreak: false })
      d.rect(ML + 80, 220, CW - 160, 0.5).fill(C.gold)

      d.fontSize(7).fillColor(C.muted).text('CONFIDENCIAL', ML + 30, 240, { width: 200, characterSpacing: 1.5, lineBreak: false })
      d.fontSize(7).fillColor(C.muted).text(`Emitido em ${NOW()}`, PW - ML - 230, 240, { width: 200, align: 'right', lineBreak: false })

      d.fontSize(28).fillColor(C.body).text(title, ML, 290, { width: CW, align: 'center', lineBreak: false })
      const sub = [im.nome, im.zona].filter(Boolean).join(' · ').toUpperCase()
      if (sub) d.fontSize(10).fillColor(C.gold).text(sub, ML, 340, { width: CW, align: 'center', characterSpacing: 2, lineBreak: false })

      // Hero box (KPIs centrais) — desenhado AQUI dentro da capa, não na página seguinte
      if (this.heroItems && this.heroItems.length > 0) {
        const items = this.heroItems
        const heroY = 400, heroH = 130
        d.roundedRect(ML + 30, heroY, CW - 60, heroH, 6).lineWidth(1).stroke(C.black)
        d.rect(ML + 30, heroY, CW - 60, 4).fill(C.gold)
        if (items.length === 1) {
          d.fontSize(36).fillColor(C.body).text(items[0].value, ML + 30, heroY + 22, { width: CW - 60, align: 'center', lineBreak: false })
          d.fontSize(8).fillColor(C.muted).text((items[0].label || '').toUpperCase(), ML + 30, heroY + 70, { width: CW - 60, align: 'center', characterSpacing: 2, lineBreak: false })
          if (items[0].sub) d.fontSize(8).fillColor(C.muted).text(items[0].sub, ML + 30, heroY + 100, { width: CW - 60, align: 'center', lineBreak: false })
        } else {
          const colW = (CW - 60) / items.length
          items.forEach((h, i) => {
            const x = ML + 30 + i * colW
            if (i > 0) d.rect(x, heroY + 20, 0.5, 90).fill(C.border)
            d.fontSize(7).fillColor(C.muted).text((h.label || '').toUpperCase(), x + 10, heroY + 28, { width: colW - 20, characterSpacing: 1, align: 'center', lineBreak: false })
            d.fontSize(22).fillColor(C.body).text(String(h.value), x + 10, heroY + 48, { width: colW - 20, align: 'center', lineBreak: false })
            if (h.sub) d.fontSize(7).fillColor(C.muted).text(h.sub, x + 10, heroY + 88, { width: colW - 20, align: 'center', lineBreak: false })
          })
        }
      }

      d.rect(ML + 80, 670, CW - 160, 0.5).fill(C.gold)
      d.fontSize(8).fillColor(C.muted).text('Somnium Properties · Investimento Imobiliário', ML, 690, { width: CW, align: 'center', characterSpacing: 2, lineBreak: false })
      d.fontSize(7).fillColor(C.muted).text(`Documento Confidencial · ${NOW()}`, ML, 706, { width: CW, align: 'center', lineBreak: false })
      d.rect(0, PH - 6, PW, 6).fill(C.gold)
      return
    }

    // Capa default
    d.rect(0, 0, PW, 6).fill(C.gold)
    try { d.image(readFileSync(LOGO_PATH), (PW - 160) / 2, 140, { width: 160 }) } catch {}
    d.rect(PW / 2 - 30, 310, 60, 1.5).fill(C.gold)
    d.fontSize(28).fillColor(C.body).text(title, ML, 340, { width: CW, align: 'center' })
    const sub = [im.nome, im.zona].filter(Boolean).join(' · ').toUpperCase()
    if (sub) d.fontSize(10).fillColor(C.gold).text(sub, ML, 390, { width: CW, align: 'center', characterSpacing: 1.5 })
    if (subtitle) d.fontSize(10).fillColor(C.muted).text(subtitle + ' · Coimbra · Portugal', ML, 415, { width: CW, align: 'center' })
    d.rect(ML + 80, 450, CW - 160, 0.5).fill(C.gold)
    d.fontSize(9).fillColor(C.muted).text(NOW(), ML, 465, { width: CW, align: 'center' })
    d.rect(ML, PH - 65, CW, 0.5).fill(C.gold)
    d.fontSize(7).fillColor(C.muted).text('Somnium Properties · Investimento Imobiliário', ML, PH - 52, { width: CW, align: 'center' })
    d.fontSize(7).fillColor(C.muted).text(`Documento Confidencial · ${NOW()}`, ML, PH - 40, { width: CW, align: 'center' })
    d.rect(0, PH - 6, PW, 6).fill(C.gold)
  }

  // No-op (compatibilidade): hero items agora são passados via opts.heroItems
  // no constructor e desenhados dentro de _drawCover.
  drawCoverHero() { return this }

  newPage() {
    // CRÍTICO: margin:0 impede o PDFKit de auto-paginar quando texto wrap
    // ultrapassa a margem inferior. Toda a paginação é controlada manualmente
    // via this.y + ensure() — nunca implícita pelo PDFKit. Isto elimina as
    // páginas pares em branco causadas por auto-page seguido de newPage manual.
    this.doc.addPage({ size: 'A4', margin: 0 })
    const d = this.doc
    if (this.style === 'investor') {
      try { d.image(readFileSync(LOGO_PATH), ML, 18, { height: 16 }) } catch {}
      d.fontSize(7).fillColor(C.muted).text(this.title || 'Relatório de Investimento', ML, 22, { width: CW, align: 'right', lineBreak: false })
      d.rect(ML, 42, CW, 1).fill(C.gold)
      d.rect(ML, PH - 42, CW, 0.4).fill(C.gold)
      d.fontSize(6.5).fillColor(C.muted).text(`Confidencial · Somnium Properties · ${NOW()}`, ML, PH - 35, { width: CW, align: 'center', lineBreak: false })
    } else {
      try { d.image(readFileSync(LOGO_PATH), ML, 15, { height: 22 }) } catch {}
      d.rect(ML, 45, CW, 1.5).fill(C.gold)
      d.rect(ML, PH - 45, CW, 0.5).fill(C.gold)
    }
    this.y = 60
    return this
  }

  // Bloco "Pontos fortes / Pontos fracos / Riscos" — usa campos do imóvel.
  // Renderiza apenas as colunas que tiverem conteúdo. Calcula altura
  // máxima das três colunas antes de desenhar para evitar sobreposição
  // e auto-paginação do PDFKit.
  pontosFortesFracosRiscos() {
    const im = this.imovel || {}
    const blocks = [
      { label: 'PONTOS FORTES',  text: im.pontos_fortes,  color: C.green },
      { label: 'PONTOS FRACOS',  text: im.pontos_fracos,  color: C.red },
      { label: 'RISCOS',         text: im.riscos,         color: C.gold },
    ].filter(b => b.text && String(b.text).trim())
    if (blocks.length === 0) return this

    const gap = 12
    const colW = (CW - (blocks.length - 1) * gap) / blocks.length
    const labelH = 18
    const itemLineGap = 3
    const itemFontSize = 8.5
    const bulletW = 12          // largura reservada para o triangulo
    const itemPadL = 2          // recuo do texto a partir do triangulo
    const textW = colW - bulletW - itemPadL
    const itemSpacing = 7       // espaco entre items
    const headerGap = 12        // gap entre header colorido e primeiro item

    // Pre-calculo: altura de cada coluna (cabecalho + items wrappable)
    this.doc.fontSize(itemFontSize)
    const colHeights = blocks.map(b => {
      const items = parseListItems(b.text)
      let h = labelH + headerGap
      items.forEach((it, idx) => {
        h += this.doc.heightOfString(it, { width: textW, lineGap: itemLineGap })
        if (idx < items.length - 1) h += itemSpacing
      })
      return { h, items }
    })
    const blockH = Math.max(...colHeights.map(c => c.h))

    this.header('PONTOS FORTES, PONTOS FRACOS E RISCOS')
    this.ensure(blockH + 6)
    const startY = this.y

    blocks.forEach((b, i) => {
      const x = ML + i * (colW + gap)
      const { items } = colHeights[i]
      // Header colorido
      this.doc.roundedRect(x, startY, colW, labelH, 4).fill(b.color)
      this.doc.fontSize(7.5).fillColor(C.white).text(b.label, x + 10, startY + 6, {
        width: colW - 20, characterSpacing: 1.2, lineBreak: false,
      })
      // Items
      let cy = startY + labelH + headerGap
      items.forEach((it, idx) => {
        this.doc.fontSize(itemFontSize).fillColor(C.body)
        const itemH = this.doc.heightOfString(it, { width: textW, lineGap: itemLineGap })
        // Triangulo desenhado a primitives (▸ nao existe na fonte default)
        const tx = x + 2, ty = cy + 3
        this.doc.polygon([tx, ty], [tx + 4, ty + 3], [tx, ty + 6]).fill(b.color)
        this.doc.fillColor(C.body).text(it, x + bulletW, cy, { width: textW, lineGap: itemLineGap })
        cy += itemH + (idx < items.length - 1 ? itemSpacing : 0)
      })
    })

    this.y = startY + blockH + 10
    return this
  }

  // Tabela "Risco → Estratégia de mitigação". Empareja linha-a-linha o
  // conteúdo de im.riscos com im.mitigacao_riscos. Linhas extra de qualquer
  // dos lados ficam isoladas (sem par). Só renderiza se houver mitigações
  // definidas — caso contrário a coluna 'Riscos' do bloco anterior basta.
  riscosMitigacao() {
    const im = this.imovel || {}
    const riscos = parseListItems(im.riscos)
    const mitig  = parseListItems(im.mitigacao_riscos)
    if (mitig.length === 0) return this

    const n = Math.max(riscos.length, mitig.length)
    const pairs = []
    for (let i = 0; i < n; i++) pairs.push({ r: riscos[i] || '—', m: mitig[i] || '—' })

    this.header('ANÁLISE DE RISCO E MITIGAÇÃO')
    const colR = Math.floor((CW - 12) * 0.42)
    const colM = CW - 12 - colR
    const padX = 10, padY = 7, gap = 12

    // Cabecalho
    this.ensure(24)
    this.doc.rect(ML, this.y, CW, 22).fill(C.headerBg)
    this.doc.fontSize(7.5).fillColor(C.gold).text('RISCO', ML + padX, this.y + padY, { width: colR - padX, characterSpacing: 1, lineBreak: false })
    this.doc.fontSize(7.5).fillColor(C.gold).text('ESTRATÉGIA DE MITIGAÇÃO', ML + colR + gap, this.y + padY, { width: colM, characterSpacing: 1, lineBreak: false })
    this.y += 24

    pairs.forEach(({ r, m }) => {
      this.doc.fontSize(8.5)
      const hR = this.doc.heightOfString(r, { width: colR - padX * 2 - 6, lineGap: 3 })
      const hM = this.doc.heightOfString(m, { width: colM - padX - 14, lineGap: 3 })
      const rowH = Math.max(hR, hM) + padY * 2
      this.ensure(rowH + 1)
      // Triangulo vermelho (risco)
      const tx1 = ML + 2, ty1 = this.y + padY + 2
      this.doc.polygon([tx1, ty1], [tx1 + 4, ty1 + 3], [tx1, ty1 + 6]).fill(C.red)
      this.doc.fillColor(C.body).fontSize(8.5).text(r, ML + padX, this.y + padY, { width: colR - padX * 2 - 6, lineGap: 3 })
      // Seta verde (mitigacao) — desenhada com primitives (-> nao renderiza)
      const ax = ML + colR + 2, ay = this.y + padY + 4
      this.doc.lineWidth(1.2).strokeColor(C.green)
      this.doc.moveTo(ax, ay).lineTo(ax + 7, ay).stroke()
      this.doc.polygon([ax + 5, ay - 2.5], [ax + 8.5, ay], [ax + 5, ay + 2.5]).fill(C.green)
      this.doc.fillColor(C.body).fontSize(8.5).text(m, ML + colR + gap, this.y + padY, { width: colM - padX - 14, lineGap: 3 })
      this.doc.rect(ML, this.y + rowH - 0.5, CW, 0.3).fill(C.border)
      this.y += rowH
    })
    this.y += 4
    return this
  }

  // Imagem de localizacao (estudo composto: mapa satelite + cards + tabela
  // de POIs). Renderiza a imagem ao tamanho natural maximizado: largura
  // CW completa, altura conforme aspect ratio real do PNG, encolhendo se
  // ultrapassar o espaco vertical disponivel ate ao fundo da pagina. O
  // SVG do estudo ja tem o seu proprio cabecalho — nao adicionamos um
  // header redundante.
  localizacao() {
    const im = this.imovel || {}
    const url = im.localizacao_imagem
    const cached = im._localizacaoImgData
    if (!url && !cached) return this

    let imgData = cached || null
    if (!imgData && url && !url.startsWith('http')) {
      const localPath = path.resolve(__dirname, '../..', 'public', url.replace(/^\//, ''))
      if (existsSync(localPath)) { try { imgData = readFileSync(localPath) } catch {} }
    }
    if (!imgData) {
      this.header('LOCALIZAÇÃO')
      this.note('Imagem de localização não disponível neste momento.')
      return this
    }

    // Aspect ratio real (h/w). Fallback ~1.4 cobre o estudo padrao quando
    // nao temos um PNG (improvavel — preloadLocalizacao normaliza tudo).
    const dims = pngDimensions(imgData)
    const ratio = dims ? dims.h / dims.w : 1.4

    // Caixa: largura CW, altura natural, encolhe se nao couber na pagina.
    const availH = PH - this.y - 50
    let drawW = CW
    let drawH = drawW * ratio
    if (drawH > availH) { drawH = availH; drawW = drawH / ratio }
    const x = ML + (CW - drawW) / 2

    let drawn = false
    this.doc.save()
    try {
      this.doc.roundedRect(x, this.y, drawW, drawH, 4).clip()
      this.doc.image(imgData, x, this.y, { width: drawW, height: drawH })
      drawn = true
    } catch {
      // PDFKit recusou o buffer (formato nao suportado e nao normalizado)
    }
    this.doc.restore()
    if (drawn) {
      this.doc.roundedRect(x, this.y, drawW, drawH, 4).lineWidth(0.5).stroke(C.border)
      this.y += drawH + 8
    } else {
      this.header('LOCALIZAÇÃO')
      this.note('Imagem de localização não disponível neste momento.')
    }
    return this
  }

  ensure(needed) {
    // Margem inferior de 70 (em vez de 50) para evitar que o PDFKit
    // auto-pagine entre a chamada ensure() e a escrita seguinte.
    if (this.y > 50 && this.y + needed > PH - 70) this.newPage()
    return this
  }

  // Section header — bold uppercase + gold underline (no numbering)
  header(title) {
    this.ensure(28)
    this.doc.fontSize(11).fillColor(C.body).text(title.toUpperCase(), ML, this.y, { width: CW, characterSpacing: 0.3, lineBreak: false })
    this.y += 14
    this.doc.rect(ML, this.y, CW, 1.5).fill(C.gold)
    this.y += 10
    return this
  }

  // Sub-header (lighter, smaller)
  subheader(title) {
    this.ensure(22)
    this.doc.fontSize(9.5).fillColor(C.body).text(title.toUpperCase(), ML, this.y, { width: CW, characterSpacing: 0.3, lineBreak: false })
    this.y += 12
    this.doc.rect(ML, this.y, 40, 1).fill(C.gold)
    this.y += 8
    return this
  }

  // Section subtitle (gold underline)
  section(title) {
    this.ensure(28)
    this.doc.fontSize(11).fillColor(C.body).text(title, ML, this.y, { lineBreak: false })
    this.y += 15
    this.doc.rect(ML, this.y, 30, 2).fill(C.gold)
    this.doc.rect(ML + 32, this.y + 0.5, CW - 32, 0.5).fill(C.border)
    this.y += 10
    return this
  }

  // Data row (label + value in a clean box)
  row(label, value, options = {}) {
    this.ensure(30)
    const alt = options.alt
    if (alt) this.doc.roundedRect(ML, this.y, CW, 26, 3).fill(C.light)
    this.doc.fontSize(7).fillColor(C.muted).text(label.toUpperCase(), ML + 12, this.y + 5, { width: 155, lineBreak: false })
    this.doc.fontSize(9).fillColor(C.body).text(String(value || '—'), ML + 175, this.y + 4, { width: CW - 190 })
    this.y = Math.max(this.y + 26, this.doc.y + 2)
    return this
  }

  // Editable field (label + rounded input box — mobile friendly)
  input(label, value, options = {}) {
    this.ensure(options.tall ? 60 : 38)
    const h = options.tall ? 50 : 26
    this.doc.fontSize(7).fillColor(C.muted).text(label.toUpperCase(), ML, this.y, { lineBreak: false })
    this.y += 11
    this.doc.roundedRect(ML, this.y, options.half ? CW / 2 - 5 : CW, h, 4).lineWidth(0.5).stroke(C.border)
    if (value) {
      this.doc.fontSize(9).fillColor(C.body).text(String(value), ML + 8, this.y + 6, { width: (options.half ? CW / 2 - 20 : CW - 16) })
    }
    this.y += h + 6
    return this
  }

  // Two inputs side by side
  inputRow(label1, value1, label2, value2) {
    this.ensure(38)
    const halfW = CW / 2 - 5
    // Left
    this.doc.fontSize(7).fillColor(C.muted).text(label1.toUpperCase(), ML, this.y, { lineBreak: false })
    this.doc.fontSize(7).fillColor(C.muted).text(label2.toUpperCase(), ML + halfW + 10, this.y, { lineBreak: false })
    this.y += 11
    this.doc.roundedRect(ML, this.y, halfW, 26, 4).lineWidth(0.5).stroke(C.border)
    this.doc.roundedRect(ML + halfW + 10, this.y, halfW, 26, 4).lineWidth(0.5).stroke(C.border)
    if (value1) this.doc.fontSize(9).fillColor(C.body).text(String(value1), ML + 8, this.y + 6, { width: halfW - 16, lineBreak: false })
    if (value2) this.doc.fontSize(9).fillColor(C.body).text(String(value2), ML + halfW + 18, this.y + 6, { width: halfW - 16, lineBreak: false })
    this.y += 32
    return this
  }

  // Checkbox item (large touch target for mobile)
  check(text, checked = false) {
    this.ensure(24)
    this.doc.roundedRect(ML + 2, this.y + 2, 14, 14, 3).lineWidth(0.5).stroke(C.border)
    if (checked) {
      // Check desenhado a primitives (✓ nao renderiza na fonte default)
      this.doc.lineWidth(1.4).strokeColor(C.green)
      this.doc.moveTo(ML + 5, this.y + 9).lineTo(ML + 8, this.y + 12).lineTo(ML + 13, this.y + 6).stroke()
    }
    this.doc.fontSize(9).fillColor(C.body).text(text, ML + 24, this.y + 3, { width: CW - 30 })
    this.y = Math.max(this.y + 22, this.doc.y + 4)
    return this
  }

  // Info text
  text(content, options = {}) {
    const fontSize = options.size || 9
    const lineGap = options.lineGap || 4
    this.doc.fontSize(fontSize)
    const h = this.doc.heightOfString(String(content || ''), { width: CW, lineGap })
    this.ensure(h + 8)
    this.doc.fillColor(options.color || C.body).text(String(content || ''), ML, this.y, { width: CW, lineGap })
    this.y += h + 6
    return this
  }

  // Highlighted box (for important info)
  highlight(label, value, color = C.gold) {
    this.ensure(40)
    this.doc.roundedRect(ML, this.y, CW, 34, 4).fill(color).opacity(0.08)
    this.doc.opacity(1)
    this.doc.roundedRect(ML, this.y, CW, 34, 4).lineWidth(0.5).stroke(color)
    this.doc.fontSize(7).fillColor(C.muted).text(label.toUpperCase(), ML + 12, this.y + 5, { lineBreak: false })
    this.doc.fontSize(12).fillColor(C.body).text(String(value || '—'), ML + 12, this.y + 16, { lineBreak: false })
    this.y += 40
    return this
  }

  // Spacing
  space(px = 8) { this.y += px; return this }

  // Numbered step
  step(num, text) {
    this.doc.fontSize(9)
    const h = this.doc.heightOfString(String(text || ''), { width: CW - 30 })
    this.ensure(Math.max(22, h + 8))
    this.doc.circle(ML + 8, this.y + 8, 8).fill(C.gold)
    this.doc.fontSize(8).fillColor(C.white).text(String(num), ML + 3, this.y + 4, { width: 10, align: 'center', lineBreak: false })
    this.doc.fontSize(9).fillColor(C.body).text(text, ML + 24, this.y + 3, { width: CW - 30 })
    this.y += Math.max(20, h + 4)
    return this
  }

  // Photo gallery — grid of property photos
  photos(fotos, title = 'GALERIA FOTOGRÁFICA') {
    if (!fotos || fotos.length === 0) return this
    this.header(title)
    const ROOT = path.resolve(__dirname, '../..')
    const imgSize = (CW - 10) / 2 // 2 columns
    const imgHeight = imgSize * 0.65 // 4:3ish ratio
    let col = 0
    for (const foto of fotos) {
      // Skip non-image files
      if (!foto.type?.startsWith('image/') && !foto.path?.match(/\.(jpg|jpeg|png|webp)$/i)) continue
      const filePath = path.join(ROOT, 'public', foto.path)
      try {
        const imgData = readFileSync(filePath)
        this.ensure(imgHeight + 20)
        const x = ML + col * (imgSize + 10)
        this.doc.save()
        this.doc.roundedRect(x, this.y, imgSize, imgHeight, 4).clip()
        this.doc.image(imgData, x, this.y, { width: imgSize, height: imgHeight, fit: [imgSize, imgHeight], align: 'center', valign: 'center' })
        this.doc.restore()
        // Border
        this.doc.roundedRect(x, this.y, imgSize, imgHeight, 4).lineWidth(0.5).stroke(C.border)
        col++
        if (col >= 2) {
          col = 0
          this.y += imgHeight + 8
        }
      } catch {
        // File not found — skip silently
      }
    }
    if (col > 0) this.y += imgHeight + 8 // close last row
    this.space(4)
    return this
  }

  // Bullet point
  bullet(text) {
    this.doc.fontSize(9)
    const h = this.doc.heightOfString(String(text || ''), { width: CW - 14, lineGap: 3 })
    this.ensure(h + 8)
    // Triangulo desenhado a primitives (▸ nao existe na fonte default)
    const tx = ML + 1, ty = this.y + 3
    this.doc.polygon([tx, ty], [tx + 4, ty + 3], [tx, ty + 6]).fill(C.gold)
    this.doc.fillColor(C.body).text(String(text || ''), ML + 14, this.y, { width: CW - 14, lineGap: 3 })
    this.y += h + 4
    return this
  }

  // Table header
  tableHeader(cols) {
    this.ensure(22)
    this.doc.rect(ML, this.y, CW, 20).fill(C.black)
    let x = ML + 8
    for (const [label, w] of cols) {
      this.doc.fontSize(7).fillColor(C.gold).text(label.toUpperCase(), x, this.y + 6, { width: w, lineBreak: false })
      x += w
    }
    this.y += 22
    return this
  }

  // Table row
  tableRow(values, widths, alt = false) {
    this.ensure(22)
    if (alt) this.doc.rect(ML, this.y, CW, 20).fill(C.light)
    let x = ML + 8
    for (let i = 0; i < values.length; i++) {
      this.doc.fontSize(8).fillColor(C.body).text(String(values[i] || '—'), x, this.y + 5, { width: widths[i], lineBreak: false })
      x += widths[i]
    }
    this.y += 22
    return this
  }

  // ── Metodos empresariais (minimalistas, sem caixas escuras) ─

  // KPI grid — thin bordered cells, like the reference document
  bigNumbers(items) {
    this.ensure(56)
    const colW = CW / items.length
    // Draw border around all cells
    this.doc.rect(ML, this.y, CW, 50).lineWidth(0.5).stroke(C.border)
    items.forEach((item, i) => {
      const x = ML + i * colW
      if (i > 0) this.doc.rect(x, this.y, 0.5, 50).fill(C.border)
      this.doc.fontSize(7).fillColor(C.muted).text((item.label || '').toUpperCase(), x + 10, this.y + 8, { width: colW - 20, lineBreak: false, characterSpacing: 0.3 })
      this.doc.fontSize(16).fillColor(C.body).text(String(item.value || '—'), x + 10, this.y + 22, { width: colW - 20, lineBreak: false })
      if (item.sub) this.doc.fontSize(7).fillColor(C.muted).text(item.sub, x + 10, this.y + 40, { width: colW - 20, lineBreak: false })
    })
    this.y += 56
    return this
  }

  // Dados inline — label: valor lado a lado, compacto
  inlineData(items) {
    this.ensure(16)
    const colW = CW / items.length
    items.forEach((item, i) => {
      const x = ML + i * colW
      this.doc.fontSize(7.5).fillColor(C.muted).text(`${item.label}: `, x, this.y + 2, { width: colW - 4, continued: true, lineBreak: false }).fillColor(C.body).text(String(item.value || '—'), { lineBreak: false })
    })
    this.y += 16
    return this
  }

  // Professional table — warm header, generous rows (reference style)
  // Cada linha é verificada individualmente para evitar overflow auto-paginado.
  simpleTable(rows) {
    rows.forEach(row => {
      const isTotal = row.total
      const rowH = isTotal ? 26 : 22
      this.ensure(rowH + 1)
      if (isTotal) this.doc.rect(ML, this.y, CW, 24).fill(C.totalBg)
      this.doc.fontSize(isTotal ? 9.5 : 8.5).fillColor(C.body).text(row.label || '', ML + 10, this.y + 6, { width: 310, lineBreak: false })
      this.doc.fontSize(isTotal ? 9.5 : 8.5).fillColor(isTotal ? C.gold : C.body).text(String(row.value || '—'), ML + 320, this.y + 6, { width: CW - 330, align: 'right', lineBreak: false })
      this.doc.rect(ML, this.y + (isTotal ? 24 : 22), CW, 0.3).fill(C.border)
      this.y += rowH
    })
    this.y += 4
    return this
  }

  // Column table — warm gray header with gold labels (reference style)
  // Cada linha verificada individualmente para evitar overflow auto-paginado.
  colTable(headers, rows) {
    this.ensure(24)
    this.doc.rect(ML, this.y, CW, 22).fill(C.headerBg)
    let x = ML + 8
    for (const [label, w] of headers) {
      this.doc.fontSize(7.5).fillColor(C.gold).text(label, x, this.y + 6, { width: w, lineBreak: false })
      x += w
    }
    this.y += 24
    rows.forEach(row => {
      const isTotal = row._total
      const rowH = isTotal ? 26 : 24
      this.ensure(rowH + 1)
      if (isTotal) this.doc.rect(ML, this.y, CW, 24).fill(C.totalBg)
      x = ML + 8
      const vals = row._values || row
      for (let i = 0; i < vals.length; i++) {
        const cell = vals[i]
        const val = cell?.value !== undefined ? cell.value : cell
        const clr = cell?.color || C.body
        this.doc.fontSize(isTotal ? 9 : 8.5).fillColor(clr).text(String(val || '—'), x, this.y + 6, { width: headers[i][1], lineBreak: false })
        x += headers[i][1]
      }
      this.doc.rect(ML, this.y + (isTotal ? 24 : 22), CW, 0.3).fill(C.border)
      this.y += rowH
    })
    this.y += 4
    return this
  }

  // Metrica simples — label + valor
  metric(label, value, options = {}) {
    this.ensure(16)
    const { total } = options
    if (total) { this.doc.rect(ML, this.y - 1, CW, 0.5).fill(C.body); this.y += 3 }
    this.doc.fontSize(total ? 9 : 8.5).fillColor(C.body).text(label, ML + 4, this.y + 1, { width: 320, lineBreak: false })
    this.doc.fontSize(total ? 9 : 8.5).fillColor(C.body).text(String(value || '—'), ML + 330, this.y + 1, { width: CW - 334, align: 'right', lineBreak: false })
    if (!total) this.doc.rect(ML, this.y + 13, CW, 0.2).fill('#e0ddd5')
    this.y += total ? 18 : 14
    return this
  }

  // Narrative text block
  textBlock(content) {
    this.doc.fontSize(9)
    const h = this.doc.heightOfString(String(content || ''), { width: CW, lineGap: 4 })
    this.ensure(h + 12)
    this.doc.fillColor(C.body).text(String(content || ''), ML, this.y, { width: CW, lineGap: 4, align: 'justify' })
    this.y += h + 8
    return this
  }

  // Note/pressuposto
  note(text) {
    this.doc.fontSize(7.5)
    const h = this.doc.heightOfString(String(text || ''), { width: CW, lineGap: 3 })
    this.ensure(h + 8)
    this.doc.fillColor(C.muted).text(String(text || ''), ML, this.y, { width: CW, lineGap: 3 })
    this.y += h + 4
    return this
  }

  verdict(text, isPositive) {
    this.doc.fontSize(9.5)
    const h = this.doc.heightOfString(String(text || ''), { width: CW, lineGap: 2 })
    this.ensure(h + 10)
    this.doc.fillColor(isPositive ? C.green : C.red).text(String(text || ''), ML, this.y, { width: CW, lineGap: 2 })
    this.y += h + 8
    return this
  }

  disclaimer() {
    const txt = 'Este documento é preparado para fins informativos e não constitui aconselhamento financeiro ou fiscal. Os valores são estimativas e podem variar. Somnium Properties — Confidencial.'
    this.doc.fontSize(6.5)
    const h = this.doc.heightOfString(txt, { width: CW, lineGap: 2 })
    this.ensure(h + 14)
    this.doc.rect(ML, this.y, CW, 0.3).fill(C.border)
    this.y += 6
    this.doc.fillColor(C.muted).text(txt, ML, this.y, { width: CW, lineGap: 2 })
    this.y += h + 4
    return this
  }

  end() { this.doc.end(); return this.doc }
}

// ══════════════════════════════════════════════════════════════
// STRESS TEST RENDERER — layout duas colunas (custos | retornos)
// ══════════════════════════════════════════════════════════════

function renderStressTests(b, a, opts = {}) {
  let st = a.stress_tests
  if (!st) return
  if (typeof st === 'string') try { st = JSON.parse(st) } catch { return }
  if (!st) return

  if (opts.newPage) b.newPage()
  b.header(opts.title || 'ANÁLISE DE SENSIBILIDADE — STRESS TESTS')

  // Tentar usar screenshot da UI (capturado pelo frontend)
  const screenshotPath = path.join(STRESS_DIR, `${a.id}.png`)
  if (a.id && existsSync(screenshotPath)) {
    try {
      const imgData = readFileSync(screenshotPath)
      // Calcular altura proporcional para a largura do conteudo
      const imgWidth = CW
      const imgHeight = imgWidth * 0.55 // ratio aproximado do componente
      b.ensure(imgHeight + 20)
      b.doc.image(imgData, ML, b.y, { width: imgWidth, fit: [imgWidth, imgHeight] })
      b.y += imgHeight + 10
      b.disclaimer()
      return
    } catch (e) {
      // Fallback para layout programatico se imagem falhar
    }
  }

  // Fallback: layout programatico
  const resiliente = st.veredicto === 'resiliente'
  b.verdict(
    resiliente ? 'Investimento resiliente — mantém resultado positivo em todos os cenários testados.' : 'Atenção — identificados cenários com risco de prejuízo.',
    resiliente
  )
  b.space(4)

  b.bigNumbers([
    { label: 'Pior Cenário', value: EUR(st.pior?.lucro_liquido) },
    { label: 'Cenário Base', value: EUR(st.base?.lucro_liquido) },
    { label: 'Melhor Cenário', value: EUR(st.melhor?.lucro_liquido) },
  ])
  b.space(4)

  b.simpleTable([
    ...(st.base ? [{ label: 'Base — RA', value: PCT(st.base.retorno_anualizado) }] : []),
    ...(st.pior ? [{ label: 'Pior Cenário — RA', value: PCT(st.pior.retorno_anualizado) }] : []),
    ...(st.melhor ? [{ label: 'Melhor Cenário — RA', value: PCT(st.melhor.retorno_anualizado) }] : []),
  ])

  if (st.downside?.length) {
    b.space(4)
    b.subheader('Cenários de Risco (Downside)')
    b.colTable(
      [['Cenário', 100], ['Descrição', 140], ['Lucro Líq.', 75], ['Delta', 65], ['RA', 55]],
      st.downside.map(s => ({ _values: [s.label, s.descricao || '', EUR(s.lucro_liquido), EUR(s.delta), PCT(s.retorno_anualizado)] }))
    )
  }

  if (st.upside?.length) {
    b.space(4)
    b.subheader('Cenários Favoráveis (Upside)')
    b.colTable(
      [['Cenário', 100], ['Descrição', 140], ['Lucro Líq.', 75], ['Delta', 65], ['RA', 55]],
      st.upside.map(s => ({ _values: [s.label, s.descricao || '', EUR(s.lucro_liquido), EUR(s.delta), PCT(s.retorno_anualizado)] }))
    )
  }
}

// ══════════════════════════════════════════════════════════════
// RENDER FUNCTIONS — desenham conteudo num DocBuilder existente.
// Os GENERATORS criam DocBuilder + capa e delegam aqui;
// generateCompiledReport chama-as inline para combinar seccoes.
// ══════════════════════════════════════════════════════════════

function renderFichaImovel(b, im) {
  const M2 = v => (v == null || v === '' ? '—' : `${v} m²`)
  const NUM = v => (v == null || v === '' ? '—' : String(v))
  const ARR = v => (Array.isArray(v) && v.length ? v.join(', ') : '—')
  const precoM2 = (im.ask_price && im.area_bruta) ? Math.round(im.ask_price / im.area_bruta) : null

  b.inlineData([
    { label: 'REF', value: im.ref_interna || im.id?.slice(0, 8) },
    { label: 'Estado', value: (im.estado || '').replace(/^\d+-/, '') },
    { label: 'Adicionado', value: FDATE(im.data_adicionado) },
  ])
  b.space(6)

  // 1. IDENTIFICAÇÃO REGISTRAL
  b.header('1. IDENTIFICAÇÃO REGISTRAL')
  b.simpleTable([
    { label: 'Designação', value: im.nome },
    { label: 'Morada', value: im.morada },
    { label: 'Freguesia', value: im.freguesia },
    { label: 'Concelho', value: im.concelho },
    { label: 'Distrito', value: im.distrito || 'Coimbra' },
    { label: 'Coordenadas', value: (im.coordenadas_lat && im.coordenadas_lng) ? `${im.coordenadas_lat}, ${im.coordenadas_lng}` : '—' },
    { label: 'Artigo Matricial', value: im.artigo_matricial },
    { label: 'Descrição Predial', value: im.descricao_predial },
    { label: 'Fração', value: im.fracao },
    { label: 'Regime de Propriedade', value: im.regime_propriedade },
  ])
  b.space(6)

  // 2. CARACTERIZAÇÃO FÍSICA
  b.header('2. CARACTERIZAÇÃO FÍSICA')
  b.simpleTable([
    { label: 'Tipologia', value: im.tipologia },
    { label: 'Área Bruta Privativa (ABP)', value: M2(im.area_bruta) },
    { label: 'Área Bruta Dependente (ABD)', value: M2(im.area_bruta_dependente) },
    { label: 'Andar', value: im.andar },
    { label: 'Nº Pisos do Prédio', value: NUM(im.numero_pisos_predio) },
    { label: 'Tipo de Prédio', value: im.predio_tipo },
    { label: 'Elevador', value: im.tem_elevador },
    { label: 'Ano de Construção', value: NUM(im.ano_construcao) },
    { label: 'Classificação Reg. Urbana (CRU)', value: im.cru },
    { label: 'Licença de Utilização', value: im.licenca_utilizacao },
  ])
  b.space(6)

  // 3. SITUAÇÃO LEGAL E FISCAL
  b.header('3. SITUAÇÃO LEGAL E FISCAL')
  b.simpleTable([
    { label: 'Certificado Energético', value: im.certificado_energetico },
    { label: 'Nº CE', value: im.numero_ce },
    { label: 'VPT (Valor Patrimonial Tributário)', value: EUR(im.vpt) },
    { label: 'IMI Anual', value: EUR(im.imi_anual) },
    { label: 'Condomínio Mensal (anunciado)', value: EUR(im.condominio_mensal_anunciado) },
    { label: 'Ónus / Encargos', value: ARR(im.onus_registados) },
  ])
  b.space(6)

  // 4. PROPRIETÁRIO E CAPTAÇÃO
  b.header('4. PROPRIETÁRIO E CAPTAÇÃO')
  b.simpleTable([
    { label: 'Proprietário', value: im.proprietario_nome },
    { label: 'NIF', value: im.proprietario_nif },
    { label: 'Contacto', value: im.proprietario_contacto },
    { label: 'Motivo de Venda Declarado', value: im.motivo_venda_declarado },
    { label: 'Data do Anúncio', value: FDATE(im.data_anuncio) },
    { label: 'Tempo no Mercado (dias)', value: NUM(im.tempo_no_mercado_dias) },
    { label: 'Origem', value: im.origem },
    { label: 'Tipo de Oportunidade', value: im.tipo_oportunidade },
    { label: 'Modelo de Negócio', value: im.modelo_negocio },
    { label: 'Data de Captação', value: FDATE(im.data_adicionado) },
    { label: 'Consultor', value: im.nome_consultor },
    { label: 'Link Anúncio', value: im.link },
  ])
  b.space(6)
  b.header('PREÇO DE AQUISIÇÃO')
  b.bigNumbers([
    { label: 'Preço Pedido', value: EUR(im.ask_price) },
    { label: '€/m² ABP', value: precoM2 ? EUR(precoM2) : '—' },
    { label: 'ABP', value: M2(im.area_bruta) },
  ])
  b.space(6)

  // 5. ANÁLISE PRELIMINAR
  if (im.pontos_fortes || im.pontos_fracos || im.riscos || im.mitigacao_riscos) {
    b.header('5. ANÁLISE PRELIMINAR')
    if (im.pontos_fortes) { b.subheader('Pontos Fortes'); b.text(im.pontos_fortes); b.space(4) }
    if (im.pontos_fracos) { b.subheader('Pontos Fracos'); b.text(im.pontos_fracos); b.space(4) }
    if (im.riscos) { b.subheader('Riscos'); b.text(im.riscos); b.space(4) }
    if (im.mitigacao_riscos) { b.subheader('Mitigação de Riscos'); b.text(im.mitigacao_riscos); b.space(4) }
  }

  if (im.notas) { b.space(4); b.header('NOTAS INTERNAS'); b.text(im.notas) }
}

function renderFichaVisita(b, im) {
  const fotos = parseFotos(im)
  b.header('IDENTIFICAÇÃO DO IMÓVEL')
  b.simpleTable([
    { label: 'Nome / Referência', value: im.nome },
    { label: 'Tipologia', value: im.tipologia },
    { label: 'Zona', value: im.zona },
    { label: 'Modelo de Negócio', value: im.modelo_negocio },
    { label: 'Origem do Lead', value: im.origem },
    { label: 'Consultor Responsável', value: im.nome_consultor },
    { label: 'Data Adicionado', value: FDATE(im.data_adicionado) },
    { label: 'Data da Chamada', value: FDATE(im.data_chamada) },
    { label: 'Data da Visita', value: FDATE(im.data_visita) },
    { label: 'Link do Anúncio', value: im.link || '—' },
  ])
  b.space(4)

  b.header('ÁREAS E CARACTERÍSTICAS')
  b.simpleTable([
    { label: 'Área Bruta', value: im.area_bruta ? `${im.area_bruta} m²` : '—' },
    { label: 'Preço por m² (Ask)', value: im.ask_price && im.area_bruta ? EUR(Math.round(im.ask_price / im.area_bruta)) + '/m²' : '—' },
  ])
  b.space(4)

  b.header('ENQUADRAMENTO FINANCEIRO')
  b.bigNumbers([
    { label: 'Ask Price', value: EUR(im.ask_price) },
    { label: 'Proposta Estimada', value: EUR(im.valor_proposta) },
    { label: 'VVR Estimado', value: EUR(im.valor_venda_remodelado) },
  ])
  b.simpleTable([
    { label: 'Custo Estimado de Obra', value: EUR(im.custo_estimado_obra) },
    { label: 'ROI Estimado', value: PCT(im.roi) },
    { label: 'ROI Anualizado Estimado', value: PCT(im.roi_anualizado) },
    { label: 'Desconto face ao Ask Price', value: im.ask_price && im.valor_proposta ? PCT(Math.round((1 - im.valor_proposta / im.ask_price) * 100)) : '—' },
  ])
  b.space(4)

  if (fotos.length > 0) b.photos(fotos, 'FOTOGRAFIAS DO ANÚNCIO')

  b.header('PONTOS A AVALIAR NA VISITA')
  b.subheader('Estrutural')
  b.simpleTable([
    'Fachada: fissuras, humidade, descasque de reboco, eflorescências',
    'Telhado / cobertura: telhas partidas, infiltrações, isolamento térmico',
    'Fundações: assentamentos visíveis, fissuras em escada',
    'Paredes interiores: fissuras, humidade ascendente, bolor',
    'Tectos: manchas de água, deformações, descasque',
    'Pavimentos: nivelamento, estado do revestimento, soalho podre',
    'Laje / estrutura: vigas expostas, ferrugem em armaduras, flexão',
  ].map(p => ({ label: `□  ${p}`, value: '' })))
  b.space(4)

  b.subheader('Instalações Técnicas')
  b.simpleTable([
    'Quadro eléctrico: disjuntores, terra, estado geral, potência contratada',
    'Tomadas e interruptores: quantidade e funcionamento',
    'Canalização de água: pressão, tubagens (cobre, PPR, ferro), fugas',
    'Esgotos: cheiros, escoamento lento, caixas de visita',
    'Aquecimento: tipo de sistema (central, esquentador, caldeira), estado',
    'Gás: tipo de instalação, certificação, segurança',
    'Ventilação: VMC, exaustores, ventilação natural nas casas de banho',
  ].map(p => ({ label: `□  ${p}`, value: '' })))
  b.space(4)

  b.subheader('Caixilharia e Isolamento')
  b.simpleTable([
    'Janelas: material (alumínio, PVC, madeira), vidro simples ou duplo',
    'Estores / portadas: funcionamento e estado',
    'Isolamento térmico: paredes exteriores, cobertura, pontes térmicas',
    'Isolamento acústico: ruído exterior, entre fracções',
  ].map(p => ({ label: `□  ${p}`, value: '' })))
  b.space(4)

  b.subheader('Espaços Húmidos')
  b.simpleTable([
    'Cozinha: bancada, armários, equipamentos, ventilação, ponto de água',
    'WC: louças sanitárias, torneiras, impermeabilização, ventilação',
    'Azulejos: estado, fissuras, descolamentos',
  ].map(p => ({ label: `□  ${p}`, value: '' })))
  b.space(4)

  b.subheader('Envolvente e Localização')
  b.simpleTable([
    'Orientação solar e luminosidade natural dos compartimentos',
    'Acessos ao imóvel: estrada, passeios, rampa, escadas',
    'Estacionamento: garagem, lugar de parqueamento, rua',
    'Vizinhança: tipo de zona, ruído, segurança, serviços próximos',
    'Transportes públicos e acessos rodoviários',
    'Possibilidade de ampliação ou alteração de layout (PDM)',
    'Existência de logradouro, quintal ou terraço',
  ].map(p => ({ label: `□  ${p}`, value: '' })))
  b.space(4)

  b.header('PERGUNTAS AO PROPRIETÁRIO / MEDIADOR')
  b.subheader('Motivação e Urgência')
  b.simpleTable([
    'Há quanto tempo está à venda? Já baixou o preço?',
    'Motivo da venda? (herança, divórcio, emigração, necessidade financeira)',
    'Existe urgência na venda? Prazo pretendido?',
    'Está aberto a CPCV com sinal reduzido?',
  ].map(p => ({ label: `□  ${p}`, value: '' })))
  b.space(4)
  b.subheader('Negociação e Valor')
  b.simpleTable([
    'Valor mínimo que aceita? Margem de negociação?',
    'Já recebeu outras propostas? Qual o valor?',
    'Aceita permuta ou pagamento faseado?',
    'Quem é o decisor? (um proprietário, vários herdeiros, tribunal)',
  ].map(p => ({ label: `□  ${p}`, value: '' })))
  b.space(4)
  b.subheader('Situação Jurídica e Técnica')
  b.simpleTable([
    'Algum problema estrutural ou legal conhecido?',
    'Documentação em dia? (caderneta, certidão permanente, licença)',
    'Existem ónus, hipotecas, penhoras ou litígios?',
    'Área real corresponde à área registada? Há áreas não licenciadas?',
    'Existem obras recentes não declaradas?',
    'O imóvel está arrendado ou ocupado?',
    'Condomínio: valor mensal, dívidas, obras previstas no prédio?',
  ].map(p => ({ label: `□  ${p}`, value: '' })))
  b.space(4)

  b.header('DOCUMENTOS A SOLICITAR')
  b.subheader('Obrigatórios')
  b.simpleTable([
    'Caderneta predial urbana (actualizada)',
    'Certidão permanente do registo predial (com encargos)',
    'Licença de utilização',
    'Certificado energético',
    'Plantas do imóvel (aprovadas pela Câmara)',
  ].map(p => ({ label: `□  ${p}`, value: '' })))
  b.space(4)
  b.subheader('Complementares')
  b.simpleTable([
    'Ficha técnica da habitação (pós-2004)',
    'Declaração de dívidas ao condomínio',
    'Certidão de teor (se herança)',
    'Habilitação de herdeiros (se herança)',
    'Planta de localização e extracto do PDM',
    'Projecto de arquitectura (se disponível)',
    'Certificado de conformidade das instalações de gás',
  ].map(p => ({ label: `□  ${p}`, value: '' })))
  b.space(4)

  if (im.notas) {
    b.header('NOTAS DO CRM')
    b.textBlock(im.notas)
    b.space(4)
  }

  b.header('NOTAS DE CAMPO (PRÉ-VISITA)')
  b.input('Impressão geral do contacto telefónico', '', { tall: true })
  b.input('Pontos críticos a confirmar na visita', '', { tall: true })
  b.input('Estratégia de negociação a adoptar', '', { tall: true })
  b.space(4)

  b.newPage()
  b.header('CHECKLIST DE VISITA')
  b.note('B = Bom (sem intervenção)  ·  R = Razoável (intervenção ligeira)  ·  M = Mau (intervenção profunda)  ·  N/A = Não aplicável')
  b.space(4)

  b.header('1. ESTRUTURA E EXTERIOR')
  b.colTable(
    [['Elemento', 250], ['B', 40], ['R', 40], ['M', 40], ['Observações', 100]],
    ['Fachada (reboco, pintura, fissuras)', 'Telhado / cobertura (telhas, isolamento)', 'Chaminés e saídas de ventilação', 'Terraço / varanda (impermeabilização)', 'Garagem / estacionamento coberto', 'Muros / vedação / portões', 'Logradouro / jardim / quintal', 'Fundações (assentamentos visíveis)', 'Caixas de estore exteriores'].map(item => ({ _values: [item, '□', '□', '□', ''] }))
  )
  b.space(4)

  b.header('2. INTERIOR — COMPARTIMENTOS')
  b.colTable(
    [['Elemento', 250], ['B', 40], ['R', 40], ['M', 40], ['Observações', 100]],
    ['Hall de entrada', 'Sala de estar', 'Sala de jantar', 'Cozinha', 'Quarto 1 (suite)', 'Quarto 2', 'Quarto 3', 'WC 1', 'WC 2', 'Despensa / arrecadação', 'Corredor / circulação'].map(item => ({ _values: [item, '□', '□', '□', ''] }))
  )
  b.space(4)

  b.header('3. PAREDES, TECTOS E PAVIMENTOS')
  b.colTable(
    [['Elemento', 250], ['B', 40], ['R', 40], ['M', 40], ['Observações', 100]],
    ['Paredes interiores (fissuras, humidade, bolor)', 'Tectos (manchas, infiltrações, deformações)', 'Pavimento sala / quartos (tipo e estado)', 'Pavimento cozinha (tipo e estado)', 'Pavimento WC (tipo e estado)', 'Rodapés e molduras', 'Portas interiores (funcionamento, estado)'].map(item => ({ _values: [item, '□', '□', '□', ''] }))
  )
  b.space(4)

  b.header('4. INSTALAÇÕES TÉCNICAS')
  b.colTable(
    [['Elemento', 250], ['B', 40], ['R', 40], ['M', 40], ['Observações', 100]],
    ['Quadro eléctrico (disjuntores, diferencial, terra)', 'Tomadas e interruptores (quantidade, estado)', 'Iluminação (pontos de luz, funcionamento)', 'Canalização de água fria (pressão, material)', 'Canalização de água quente (pressão, material)', 'Esgotos (cheiros, escoamento, caixas de visita)', 'Esquentador / caldeira / bomba de calor', 'Aquecimento central (radiadores, piso radiante)', 'Ar condicionado (unidades, estado)', 'Instalação de gás (tipo, certificação)', 'Telecomunicações (fibra, TV cabo, tomadas)'].map(item => ({ _values: [item, '□', '□', '□', ''] }))
  )
  b.space(4)

  b.header('5. CAIXILHARIA E ISOLAMENTO')
  b.colTable(
    [['Elemento', 250], ['B', 40], ['R', 40], ['M', 40], ['Observações', 100]],
    ['Janelas (material, vidro simples/duplo)', 'Estores / portadas (funcionamento)', 'Porta de entrada (segurança, estado)', 'Isolamento térmico (pontes térmicas visíveis)', 'Isolamento acústico (ruído exterior)', 'Humidade por condensação (paredes frias)'].map(item => ({ _values: [item, '□', '□', '□', ''] }))
  )
  b.space(4)

  b.header('6. COZINHA — DETALHE')
  b.colTable(
    [['Elemento', 250], ['B', 40], ['R', 40], ['M', 40], ['Observações', 100]],
    ['Bancada (material, estado)', 'Armários superiores e inferiores', 'Equipamentos (forno, placa, exaustor)', 'Ponto de água (torneira, lava-louça)', 'Revestimento de parede (azulejo, estado)', 'Ventilação / exaustão'].map(item => ({ _values: [item, '□', '□', '□', ''] }))
  )
  b.space(4)

  b.header('7. CASAS DE BANHO — DETALHE')
  b.colTable(
    [['Elemento', 250], ['B', 40], ['R', 40], ['M', 40], ['Observações', 100]],
    ['Louças sanitárias (sanita, bidé, lavatório)', 'Base de duche / banheira (impermeabilização)', 'Torneiras e misturadoras', 'Azulejos (estado, fissuras, juntas)', 'Ventilação (natural ou mecânica)', 'Espelho e acessórios'].map(item => ({ _values: [item, '□', '□', '□', ''] }))
  )
  b.space(4)

  b.header('8. ENVOLVENTE E LOCALIZAÇÃO')
  b.colTable(
    [['Elemento', 250], ['B', 40], ['R', 40], ['M', 40], ['Observações', 100]],
    ['Vizinhança (tipo de zona, comércio, serviços)', 'Segurança da zona', 'Ruído (tráfego, vizinhos, indústria)', 'Transportes públicos (proximidade)', 'Estacionamento na envolvente', 'Orientação solar (nascente, poente)', 'Luminosidade natural dos compartimentos', 'Estado do prédio / condomínio (se aplicável)', 'Elevador (se aplicável)', 'Zonas comuns (se aplicável)'].map(item => ({ _values: [item, '□', '□', '□', ''] }))
  )
  b.space(4)

  b.header('9. CONFIRMAÇÃO DE ÁREAS E MEDIÇÕES')
  b.note('Medir ou estimar as áreas reais e comparar com o anunciado / registado.')
  b.colTable(
    [['Compartimento', 200], ['Medição (m²)', 130], ['Observações', 150]],
    ['Sala', 'Cozinha', 'Quarto 1', 'Quarto 2', 'Quarto 3', 'WC 1', 'WC 2', 'Corredor', 'Varanda / Terraço', 'Garagem'].map(item => ({ _values: [item, '', ''] }))
  )
  b.space(2)
  b.simpleTable([
    { label: 'Área Bruta Anunciada', value: im.area_bruta ? `${im.area_bruta} m²` : '—' },
    { label: 'Área Bruta Medida / Estimada', value: '__________ m²' },
    { label: 'Discrepância', value: '□ Sim  □ Não' },
  ])
  b.space(4)

  b.header('10. ESTIMATIVA PRELIMINAR DE OBRA')
  b.note('Registo rápido dos trabalhos necessários observados na visita.')
  b.colTable(
    [['Trabalho', 230], ['Necessário?', 80], ['Grau', 80], ['Custo Est.', 90]],
    ['Demolições e remoção de entulho', 'Estrutura / alvenaria / paredes', 'Cobertura / telhado', 'Canalização (água e esgotos)', 'Electricidade (quadro e instalação)', 'Revestimentos (pavimentos e paredes)', 'Cozinha completa', 'Casa(s) de banho completa(s)', 'Caixilharia (janelas e portas)', 'Pintura interior e exterior', 'Isolamento térmico / acústico', 'Ar condicionado / aquecimento', 'Arranjos exteriores / jardim', 'Outros'].map(item => ({ _values: [item, '□ S  □ N', '□ L  □ P', '€ _____'] }))
  )
  b.note('L = Ligeira  ·  P = Profunda')
  b.space(2)
  b.highlight('Total Estimado de Obra (campo)', '€ _______________')
  b.space(4)

  b.newPage()
  b.header('RELATÓRIO DE VISITA')
  b.subheader('Estado Real do Imóvel')
  b.input('Descrição geral do estado encontrado', '', { tall: true })
  b.space(4)
  b.subheader('Obras Necessárias')
  b.colTable(
    [['Trabalho', 280], ['Custo Estimado', 200]],
    ['Demolições e remoção', 'Estrutura / alvenaria', 'Canalização', 'Electricidade', 'Revestimentos / acabamentos', 'Cozinha e WC', 'Caixilharia', 'Pintura', 'Outros'].map(item => ({ _values: [item, '________________'] }))
  )
  b.space(4)
  b.header('IMPRESSÃO GERAL')
  b.input('Pontos fortes do imóvel', '', { tall: true })
  b.input('Pontos fracos / riscos identificados', '', { tall: true })
  b.input('Potencial de valorização', '', { tall: true })
  b.space(4)
  b.header('DECISÃO')
  b.simpleTable([
    { label: '□  GO — Avançar para estudo de mercado e análise de rentabilidade', value: '' },
    { label: '□  SEGUNDA VISITA — Necessita validação adicional (especificar)', value: '' },
    { label: '□  PERITO — Necessita avaliação por engenheiro / arquitecto', value: '' },
    { label: '□  STAND-BY — Aguardar documentação ou informação adicional', value: '' },
    { label: '□  NO GO — Descartar (especificar motivo)', value: '' },
  ])
  b.space(4)
  b.input('Justificação da decisão', '', { tall: true })
  b.input('Próximos passos', '', { tall: true })
}

function renderAnaliseRentabilidade(b, im, a) {
  const compra = a.compra || im.valor_proposta || im.ask_price || 0
  const obra = a.obra_com_iva || a.obra || im.custo_estimado_obra || 0
  const vvr = a.vvr || im.valor_venda_remodelado || 0

  b.header('RESUMO DO INVESTIMENTO')
  b.bigNumbers([
    { label: 'Capital Necessário', value: EUR(a.capital_necessario || compra + obra) },
    { label: 'Lucro Líquido', value: EUR(a.lucro_liquido) },
    { label: 'Retorno Anualizado', value: PCT(a.retorno_anualizado) },
  ])
  b.space(4)

  b.header('A. CUSTOS DE AQUISIÇÃO')
  b.simpleTable([
    { label: 'Valor de Compra', value: EUR(compra) },
    { label: 'VPT', value: EUR(a.vpt) },
    { label: 'Finalidade', value: (a.finalidade || '').replace(/_/g, ' ') },
    { label: 'IMT', value: EUR(a.imt) },
    { label: 'Imposto de Selo', value: EUR(a.imposto_selo) },
    { label: 'Escritura', value: EUR(a.escritura) },
    { label: 'CPCV Compra', value: EUR(a.cpcv_compra) },
    { label: 'Due Diligence', value: EUR(a.due_diligence) },
    { label: 'Total Aquisição', value: EUR(a.total_aquisicao), total: true },
  ])
  b.space(4)

  if (a.perc_financiamento > 0) {
    b.header('B. FINANCIAMENTO')
    b.simpleTable([
      { label: '% Financiamento', value: PCT(a.perc_financiamento) },
      { label: 'Valor Financiado', value: EUR(a.valor_financiado) },
      { label: 'Prazo', value: `${a.prazo_anos || 30} anos` },
      { label: 'TAN', value: PCT(a.tan) },
      { label: 'Tipo Taxa', value: a.tipo_taxa },
      { label: 'Prestação Mensal', value: EUR(a.prestacao_mensal) },
      { label: 'Comissões Bancárias', value: EUR(a.comissoes_banco) },
      { label: 'IS Financiamento', value: EUR(a.is_financiamento) },
    ])
    b.space(4)
  }

  b.header('C. CUSTOS DE OBRA')
  b.simpleTable([
    { label: 'Obra', value: EUR(a.obra) },
    { label: 'PMO %', value: PCT(a.pmo_perc) },
    { label: 'ARU', value: a.aru ? 'Sim' : 'Não' },
    { label: 'Ampliação', value: a.ampliacao ? 'Sim' : 'Não' },
    { label: 'IVA Obra', value: EUR(a.iva_obra) },
    { label: 'Obra com IVA', value: EUR(a.obra_com_iva) },
    { label: 'Licenciamento', value: EUR(a.licenciamento) },
  ])
  b.space(4)

  b.header('D. CUSTOS DE DETENÇÃO')
  b.simpleTable([
    { label: 'Meses de Retenção', value: a.meses || '—' },
    { label: 'Seguro Mensal', value: EUR(a.seguro_mensal) },
    { label: 'Condomínio Mensal', value: EUR(a.condominio_mensal) },
    { label: 'Taxa IMI', value: PCT(a.taxa_imi) },
  ])
  b.space(4)

  b.header('E. VENDA')
  b.simpleTable([
    { label: 'VVR', value: EUR(vvr) },
    { label: 'Comissão %', value: PCT(a.comissao_perc) },
    { label: 'Comissão com IVA', value: EUR(a.comissao_com_iva) },
    { label: 'Total Custos Venda', value: EUR(a.total_venda), total: true },
  ])
  b.space(4)

  b.header('F. FISCALIDADE')
  const fiscRows = [
    { label: 'Regime', value: a.regime_fiscal || '—' },
    { label: 'Impostos', value: EUR(a.impostos) },
  ]
  if (a.regime_fiscal === 'Empresa') {
    fiscRows.push({ label: 'Derrama Municipal', value: PCT(a.derrama_perc) })
    fiscRows.push({ label: '% Distribuição Dividendos', value: PCT(a.perc_dividendos) })
    fiscRows.push({ label: 'Retenção Dividendos', value: EUR(a.retencao_dividendos) })
  }
  b.simpleTable(fiscRows)
  b.space(4)

  b.header('G. RESULTADO')
  b.bigNumbers([
    { label: 'Lucro Bruto', value: EUR(a.lucro_bruto) },
    { label: 'Impostos', value: EUR(a.impostos) },
    { label: 'Lucro Líquido', value: EUR(a.lucro_liquido) },
  ])
  b.simpleTable([
    { label: 'Retorno Total', value: PCT(a.retorno_total) },
    { label: 'Retorno Anualizado', value: PCT(a.retorno_anualizado) },
    { label: 'Cash-on-Cash', value: PCT(a.cash_on_cash) },
    { label: 'Break-Even', value: EUR(a.break_even) },
  ])
  b.space(4)

  renderStressTests(b, a, { title: 'H. TESTES DE STRESS' })
}

function renderEstudoComparaveis(b, im, a) {
  b.header('IMÓVEL EM ANÁLISE')
  b.simpleTable([
    { label: 'Imóvel', value: im.nome }, { label: 'Zona', value: im.zona },
    { label: 'Tipologia', value: im.tipologia }, { label: 'VVR Estimado', value: EUR(a.vvr || im.valor_venda_remodelado) },
  ])
  b.space(4)

  let comps = a.comparaveis || []
  if (typeof comps === 'string') try { comps = JSON.parse(comps) } catch { comps = [] }

  if (Array.isArray(comps) && comps.length > 0) {
    for (let t = 0; t < comps.length; t++) {
      const tip = comps[t]
      if (!tip) continue
      const tipLabel = tip.tipologia || tip.label || `Tipologia ${t + 1}`
      b.header(`TIPOLOGIA: ${tipLabel.toUpperCase()}`)

      if (tip.area || tip.renda || tip.yield_bruta) {
        b.simpleTable([
          { label: 'Área (m²)', value: tip.area },
          { label: 'Renda Mensal', value: EUR(tip.renda) },
          { label: 'Yield Bruta', value: PCT(tip.yield_bruta) },
          { label: 'VVR pelo Rendimento', value: EUR(tip.vvr_rendimento) },
        ])
        b.space(4)
      }

      if (tip.vvr_alvo) {
        b.bigNumbers([{ label: 'VVR Alvo', value: EUR(tip.vvr_alvo) }])
        b.space(4)
      }

      const items = tip.comparaveis || tip.items || []
      if (items.length > 0) {
        b.colTable(
          [['Comparável', 120], ['Área', 55], ['Preço', 70], ['€/m²', 70], ['Ajuste', 55], ['€/m² Aj.', 60], ['VVR Est.', 55]],
          items.map((c, i) => {
            const eurM2 = c.area > 0 ? Math.round((c.preco || c.preco_anuncio || 0) / c.area) : '—'
            const ajTotal = (c.ajuste_total || 0)
            const eurM2Aj = typeof eurM2 === 'number' ? Math.round(eurM2 * (1 + ajTotal / 100)) : '—'
            const vvrEst = typeof eurM2Aj === 'number' && tip.area ? eurM2Aj * tip.area : '—'
            return { _values: [
              c.notas || c.zona || `Comp. ${i+1}`,
              c.area ? `${c.area}m²` : '—',
              EUR(c.preco || c.preco_anuncio),
              typeof eurM2 === 'number' ? `€${eurM2}` : '—',
              ajTotal ? `${ajTotal > 0 ? '+' : ''}${ajTotal}%` : '0%',
              typeof eurM2Aj === 'number' ? `€${eurM2Aj}` : '—',
              typeof vvrEst === 'number' ? EUR(vvrEst) : '—',
            ] }
          })
        )

        const validVVRs = items.filter(c => c.vvr_estimado > 0).map(c => c.vvr_estimado)
        if (validVVRs.length > 0) {
          const media = Math.round(validVVRs.reduce((a, b) => a + b, 0) / validVVRs.length)
          b.space(4)
          b.metric('Média VVR Comparáveis', EUR(media), { total: true })
        }
      }
      b.space(4)
    }
  } else {
    for (let i = 1; i <= 5; i++) {
      b.header(`COMPARÁVEL ${i}`)
      b.simpleTable([
        { label: 'Endereço / Zona', value: '________________' }, { label: 'Tipologia', value: '________________' },
        { label: 'Área (m²)', value: '________________' }, { label: 'Valor de Venda', value: '________________' },
        { label: 'Valor por m²', value: '________________' }, { label: 'Data de Venda', value: '________________' },
        { label: 'Fonte', value: '________________' }, { label: 'Ajuste %', value: '________________' },
      ])
      b.metric('Notas', '________________')
      b.space(4)
    }
    b.header('CONCLUSÃO')
    b.metric('Análise comparativa e valor de mercado estimado', '________________')
  }

  b.space(4)
  b.text('Nota: Os valores apresentados são estimativas baseadas em comparáveis de mercado e podem não reflectir o valor exacto de transacção. A Somnium Properties recomenda validação com avaliação profissional certificada.', { size: 7, color: C.muted })
}

function renderPropostaFormal(b, im) {
  b.header('DADOS DO IMÓVEL')
  b.simpleTable([
    { label: 'Imóvel', value: im.nome }, { label: 'Zona', value: im.zona },
    { label: 'Consultor', value: im.nome_consultor }, { label: 'Ask Price', value: EUR(im.ask_price) },
  ])
  b.space(4)
  b.header('PROPOSTA')
  b.bigNumbers([{ label: 'Valor Proposto', value: EUR(im.valor_proposta) }])
  b.simpleTable([
    { label: 'Condições de Pagamento', value: '________________' },
    { label: 'Prazo para CPCV', value: '________________' },
    { label: 'Prazo para Escritura', value: '________________' },
    { label: 'Condições Especiais', value: '________________' },
  ])
  b.space(4)
  b.subheader('Justificação do Valor')
  b.metric('Fundamentos da proposta (comparáveis, estado, obra necessária)', '________________')
}

function renderDossierInvestidor(b, im, a) {
  const fotos = parseFotos(im)
  const compra = a.compra || im.valor_proposta || im.ask_price || 0
  const obra = a.obra_com_iva || a.obra || im.custo_estimado_obra || 0
  const vvr = a.vvr || im.valor_venda_remodelado || 0

  b.header('OPORTUNIDADE DE INVESTIMENTO')
  b.simpleTable([
    { label: 'Imóvel', value: im.nome }, { label: 'Zona', value: im.zona },
    { label: 'Tipologia', value: im.tipologia }, { label: 'Modelo', value: im.modelo_negocio || 'CAEP 50/50' },
    { label: 'Prazo Estimado', value: a.meses ? `${a.meses} meses` : '—' },
  ])
  if (fotos.length > 0) { b.space(4); b.photos(fotos, 'O IMÓVEL') }
  b.space(4)
  // Pros/contras/riscos sempre numa secção dedicada após a apresentação visual
  // do imóvel (fotos+localização) e antes dos números financeiros.
  if (im.localizacao_imagem || im._localizacaoImgData) { b.newPage(); b.localizacao() }
  if (im.pontos_fortes || im.pontos_fracos || im.riscos) { b.pontosFortesFracosRiscos() }
  if (im.mitigacao_riscos) { b.space(4); b.riscosMitigacao() }
  b.space(4)

  b.header('NÚMEROS DO NEGÓCIO')
  b.bigNumbers([
    { label: 'Capital Necessário', value: EUR(a.capital_necessario || compra + obra) },
    { label: 'Lucro Líquido', value: EUR(a.lucro_liquido) },
    { label: 'Retorno Anualizado', value: PCT(a.retorno_anualizado) },
  ])
  b.space(4)

  b.header('DECOMPOSIÇÃO DE CUSTOS')
  b.simpleTable([
    { label: 'Compra', value: EUR(compra) },
    { label: 'IMT + IS + Escritura', value: EUR((a.imt || 0) + (a.imposto_selo || 0) + (a.escritura || 0)) },
    { label: 'Total Aquisição', value: EUR(a.total_aquisicao), total: true },
    { label: 'Obra com IVA', value: EUR(a.obra_com_iva || obra) },
    { label: 'Custos Detenção', value: EUR(a.total_manutencao) },
    { label: 'VVR (conservador)', value: EUR(vvr) },
    { label: 'Comissão Venda', value: EUR(a.comissao_com_iva) },
    { label: `Impostos (${a.regime_fiscal || 'Empresa'})`, value: EUR(a.impostos) },
  ])
  b.space(4)

  b.header('RESULTADO')
  b.simpleTable([
    { label: 'Lucro Bruto', value: EUR(a.lucro_bruto) },
    { label: 'Impostos', value: EUR(a.impostos) },
    { label: 'Lucro Líquido', value: EUR(a.lucro_liquido), total: true },
    { label: 'Retorno Total', value: PCT(a.retorno_total) },
    { label: 'Retorno Anualizado', value: PCT(a.retorno_anualizado) },
    { label: 'Cash-on-Cash', value: PCT(a.cash_on_cash) },
  ])
  b.space(4)

  let caep = a.caep
  if (typeof caep === 'string') try { caep = JSON.parse(caep) } catch { caep = null }
  if (caep) {
    b.header('ESTRUTURA CAEP')
    b.inlineData([{ label: '% Somnium', value: PCT(caep.perc_somnium || 40) }, { label: 'Base Distribuição', value: caep.base_distribuicao || 'Lucro bruto' }])
    if (caep.investidores && caep.investidores.length > 0) {
      b.space(4)
      b.colTable(
        [['Investidor', 140], ['Capital', 90], ['%', 60], ['Lucro', 70], ['ROI', 60], ['RA', 60]],
        caep.investidores.map((inv, i) => ({ _values: [inv.nome || `Inv. ${i+1}`, EUR(inv.capital), PCT(inv.perc), EUR(inv.lucro), PCT(inv.roi), PCT(inv.ra)] }))
      )
    }
    b.space(4)
  } else {
    b.header('MODELO DE PARCERIA')
    b.simpleTable([
      { label: 'Investidor(es) passivo(s)', value: '50% do lucro' },
      { label: 'Somnium Properties', value: '50% (gestão operacional + obra)' },
      { label: 'Documentação', value: 'Acesso total via Google Drive' },
      { label: 'Relatórios', value: 'Semanais de obra com fotos e vídeos' },
      { label: 'Comunicação', value: 'Canal dedicado via Slack' },
    ])
    b.space(4)
  }

  renderStressTests(b, a)

  b.header('ESTRATÉGIA DE SAÍDA')
  b.simpleTable([
    { label: '1. Exclusividade 15 dias para consultor original', value: '' },
    { label: '2. Top 2-3 consultores de Coimbra', value: '' },
    { label: '3. Ajuste de preço (-5%) após 2 meses sem venda', value: '' },
    { label: '4. Plano B: conversão para arrendamento (estudantes)', value: '' },
  ])
  b.space(4)

  b.header('TRANSPARÊNCIA E COMUNICAÇÃO')
  b.simpleTable([
    { label: 'Google Drive exclusivo com toda a documentação do negócio', value: '' },
    { label: 'Canal Slack dedicado para comunicação em tempo real', value: '' },
    { label: 'Relatórios semanais de obra com fotos e vídeos', value: '' },
    { label: 'Acesso a orçamentos, faturas e contratos', value: '' },
    { label: 'Acesso vitalício aos documentos do negócio', value: '' },
  ])

  b.space(4)
  b.text('Os valores apresentados são estimativas conservadoras baseadas em análise de mercado e podem variar. A Somnium Properties utiliza stress tests automáticos em todos os negócios para protecção do investidor. Investimento imobiliário envolve risco de capital.', { size: 7, color: C.muted })
}

function renderResumoNegociacao(b, im) {
  b.header('DADOS')
  b.simpleTable([
    { label: 'Imóvel', value: im.nome }, { label: 'Ask Price', value: EUR(im.ask_price) },
    { label: 'Valor Proposta', value: EUR(im.valor_proposta) }, { label: 'Consultor', value: im.nome_consultor },
  ])
  b.space(4)

  for (let i = 1; i <= 4; i++) {
    b.subheader(`Proposta ${i}`)
    b.simpleTable([
      { label: 'Data', value: '________________' }, { label: 'Valor', value: '________________' },
      { label: 'Resposta do Proprietário', value: '________________' },
      { label: 'Notas', value: '________________' },
    ])
    b.space(4)
  }
  b.header('ESTADO ACTUAL')
  b.metric('Ponto de situação da negociação', '________________')
}

function renderResumoAcordo(b, im) {
  b.header('TERMOS ACORDADOS')
  b.bigNumbers([{ label: 'Valor Final de Compra', value: EUR(im.valor_proposta || im.ask_price) }])
  b.simpleTable([
    { label: 'Data Proposta Aceite', value: FDATE(im.data_proposta_aceite) },
    { label: 'Consultor', value: im.nome_consultor },
  ])
  b.space(4)
  b.header('CONDIÇÕES DO CPCV')
  b.simpleTable([
    { label: 'Sinal', value: '________________' },
    { label: 'Prazo para escritura', value: '________________' },
    { label: 'Condições suspensivas', value: '________________' },
    { label: 'Penalizações', value: '________________' },
  ])
  b.space(4)
  b.header('TIMELINE')
  b.simpleTable([
    { label: 'Data CPCV', value: '________________' }, { label: 'Data Escritura', value: '________________' },
    { label: 'Início Obra', value: '________________' }, { label: 'Conclusão Obra', value: '________________' },
    { label: 'Data Prevista Venda', value: '________________' },
  ])
  b.space(4)
  b.header('PASSOS LEGAIS')
  b.simpleTable([
    'Validação documental', 'Licenciamento (se necessário)', 'Aprovação bancária (se financiado)', 'Assinatura CPCV', 'Escritura',
  ].map(p => ({ label: `□  ${p}`, value: '' })))
}

function renderFichaFollowUp(b, im) {
  b.header('ESTADO ACTUAL')
  b.simpleTable([
    { label: 'Imóvel', value: im.nome }, { label: 'Estado', value: (im.estado || '').replace(/^\d+-/, '') },
    { label: 'Consultor', value: im.nome_consultor }, { label: 'Data Follow Up', value: FDATE(im.data_follow_up) },
  ])
  b.space(4)
  b.header('PONTO DE SITUAÇÃO')
  b.metric('O que aconteceu desde o último contacto?', '________________')
  b.space(4)
  b.header('PRÓXIMAS AÇÕES')
  b.simpleTable([1, 2, 3, 4, 5].map(i => ({ label: `□  Ação ${i}`, value: '' })))
  b.inlineData([{ label: 'Data próximo contacto', value: '________________' }, { label: 'Data limite decisão', value: '________________' }])
  b.metric('Notas', '________________')
}

function renderFichaCedencia(b, im) {
  b.header('DADOS DO NEGÓCIO')
  b.simpleTable([
    { label: 'Imóvel', value: im.nome }, { label: 'Zona', value: im.zona },
  ])
  b.bigNumbers([{ label: 'Valor de Entrada (compra)', value: EUR(im.valor_proposta || im.ask_price) }])
  b.simpleTable([
    { label: 'Valor de Saída (cedência)', value: '________________' },
    { label: 'Margem', value: '________________' },
  ])
  b.space(4)
  b.header('COMPRADOR / CESSIONÁRIO')
  b.simpleTable([
    { label: 'Nome', value: '________________' }, { label: 'Contacto', value: '________________' },
    { label: 'Email', value: '________________' }, { label: 'Capital confirmado', value: '________________' },
    { label: 'Data prevista cedência', value: '________________' },
  ])
  b.space(4)
  b.header('CONDIÇÕES DA CEDÊNCIA')
  b.metric('Termos e condições acordados', '________________')
}

function renderFichaAcompanhamentoObra(b, im) {
  b.header('DADOS DO PROJECTO')
  b.simpleTable([
    { label: 'Imóvel', value: im.nome }, { label: 'Zona', value: im.zona },
    { label: 'Modelo', value: im.modelo_negocio || 'CAEP' }, { label: 'Custo Estimado', value: EUR(im.custo_estimado_obra) },
    { label: 'Data Início Obra', value: '________________' }, { label: 'Data Prevista Conclusão', value: '________________' },
  ])
  b.space(4)
  b.header('EMPREITEIRO')
  b.simpleTable([
    { label: 'Nome / Empresa', value: '________________' }, { label: 'Contacto', value: '________________' },
    { label: 'Orçamento acordado', value: '________________' }, { label: 'Prazo acordado', value: '________________' },
  ])
  b.space(4)

  for (let sem = 1; sem <= 4; sem++) {
    b.header(`SEMANA ${sem}`)
    b.simpleTable([
      { label: 'Data', value: '________________' }, { label: 'Custos semana', value: '________________' },
      { label: 'Trabalhos realizados', value: '________________' },
      { label: 'Custos acumulados', value: '________________' }, { label: 'Problemas', value: '________________' },
      { label: 'Próximos trabalhos', value: '________________' },
    ])
    b.space(4)
  }

  b.header('DESVIOS AO ORÇAMENTO')
  b.simpleTable([
    { label: 'Orçamento inicial', value: EUR(im.custo_estimado_obra) },
    { label: 'Custos reais acumulados', value: '________________' },
    { label: 'Desvio (€)', value: '________________' },
    { label: 'Desvio (%)', value: '________________' },
    { label: 'Justificação do desvio', value: '________________' },
  ])
}

function renderRelatorioInvestimento(b, im, an) {
  if (!an || !Object.keys(an).length) { b.text('Sem análise financeira activa para este imóvel.'); return }

  const ra = an.retorno_anualizado || 0

  b.bigNumbers([
    { label: 'Lucro Líquido', value: EUR(an.lucro_liquido) },
    { label: 'Retorno Anualizado', value: `${ra}%` },
    { label: 'Capital Necessário', value: EUR(an.capital_necessario) },
  ])

  b.inlineData([
    { label: 'Zona', value: im.zona || '—' },
    { label: 'Tipologia', value: im.tipologia || '—' },
    { label: 'Prazo', value: `${an.meses || 6} meses` },
    { label: 'Regime', value: an.regime_fiscal || 'Empresa' },
  ])
  b.space(8)

  // Localização + pros/contras/riscos numa página dedicada antes da
  // análise financeira, depois da identificação do imóvel.
  if (im.localizacao_imagem || im._localizacaoImgData || im.pontos_fortes || im.pontos_fracos || im.riscos || im.mitigacao_riscos) {
    b.newPage()
    b.localizacao()
    b.pontosFortesFracosRiscos()
    if (im.mitigacao_riscos) { b.space(4); b.riscosMitigacao() }
    b.newPage()
  }

  b.header('CUSTOS DO INVESTIMENTO')
  b.simpleTable([
    { label: 'Preço de compra', value: EUR(an.compra) },
    { label: 'IMT', value: EUR(an.imt) },
    { label: 'Imposto de Selo', value: EUR(an.imposto_selo) },
    { label: 'Escritura + CPCV', value: EUR((an.escritura || 0) + (an.cpcv_compra || 0)) },
    { label: 'Total Aquisição', value: EUR(an.total_aquisicao), total: true },
    { label: 'Obra c/ IVA', value: EUR(an.obra_com_iva) },
    { label: 'Licenciamento', value: EUR(an.licenciamento) },
    { label: 'Total Obra', value: EUR(an.obra_com_iva), total: true },
    { label: `Detenção (${an.meses || 6} meses)`, value: EUR(an.total_detencao) },
    { label: `Comissão venda (${an.comissao_perc || 2.5}%)`, value: EUR(an.comissao_com_iva) },
    { label: 'Total Investimento', value: EUR(an.capital_necessario), total: true },
  ])
  b.space(6)

  b.header('RESULTADO')
  b.simpleTable([
    { label: 'Receita de venda (VVR)', value: EUR(an.vvr) },
    { label: 'Total de custos', value: EUR(an.capital_necessario) },
    { label: 'Lucro Bruto', value: EUR(an.lucro_bruto), total: true },
    { label: 'Impostos (IRC + Derrama)', value: EUR(an.impostos) },
    { label: 'Retenção dividendos', value: EUR(an.retencao_dividendos) },
    { label: 'Lucro Líquido', value: EUR(an.lucro_liquido), total: true },
  ])
  b.space(6)

  b.header('MÉTRICAS DE RETORNO')
  b.bigNumbers([
    { label: 'ROI Total', value: PCT(an.retorno_total) },
    { label: 'Retorno Anualizado', value: PCT(an.retorno_anualizado) },
    { label: 'Cash-on-Cash', value: PCT(an.cash_on_cash) },
    { label: 'Break-even', value: EUR(an.break_even) },
  ])
}

function renderRelatorioComparaveis(b, im, an) {
  const comps = an?.comparaveis
  const parsed = typeof comps === 'string' ? JSON.parse(comps || '[]') : (comps || [])
  if (!parsed.length) { b.text('Sem dados de comparáveis registados.'); return }

  b.inlineData([{ label: 'Imóvel', value: im.nome }, { label: 'Zona', value: im.zona }])
  b.space(6)

  for (const tip of parsed) {
    const items = tip.comparaveis || []
    const valid = items.filter(c => c.preco > 0 && c.area > 0)
    if (valid.length === 0) continue

    const precosM2 = valid.map(c => {
      const base = c.preco / c.area
      const ajTotal = Object.values(c.ajustes || {}).reduce((s, v) => s + (parseFloat(v) || 0), 0)
      return base * (1 + ajTotal / 100)
    })
    const media = Math.round(precosM2.reduce((a, b) => a + b, 0) / precosM2.length)
    const vvr = media * (tip.area || 0)

    b.header(`${tip.tipologia || 'Tipologia'} — ${tip.area || '?'} m²`)
    b.bigNumbers([
      { label: 'VVR Estimado', value: EUR(vvr) },
      { label: 'Média €/m²', value: `${media} €/m²` },
      { label: 'Amostra', value: `${valid.length} comparáveis` },
    ])

    b.colTable(
      [['#', 25], ['Preço', 70], ['Área', 45], ['€/m²', 50], ['Neg.', 45], ['Loc.', 45], ['Idade', 45], ['Cons.', 45], ['Total', 50]],
      valid.map((c, i) => {
        const aj = c.ajustes || {}
        const ajTotal = Object.values(aj).reduce((s, v) => s + (parseFloat(v) || 0), 0)
        return { _values: [`${i + 1}`, EUR(c.preco), `${c.area}m²`, `${Math.round(c.preco / c.area)}`, `${aj.neg || 0}%`, `${aj.loc || 0}%`, `${aj.idade || 0}%`, `${aj.conserv || 0}%`, `${ajTotal >= 0 ? '+' : ''}${ajTotal}%`] }
      })
    )
    b.space(10)
  }
}

function renderRelatorioCaep(b, im, an) {
  const caep = an?.caep
  const parsed = typeof caep === 'string' ? JSON.parse(caep || 'null') : caep
  if (!parsed || parsed.quota_somnium === undefined) { b.text('Sem dados CAEP configurados.'); return }

  const captado = parsed.capital_total || 0
  const necessario = an?.capital_necessario || captado
  const cobertura = necessario > 0 ? Math.round(captado / necessario * 100) : 100

  b.header('ENQUADRAMENTO DA PARCERIA')
  b.inlineData([
    { label: 'Estrutura', value: 'Associação em Participação' },
    { label: 'Base', value: parsed.base_distribuicao === 'liquido' ? 'Lucro Líquido (após IRC)' : 'Lucro Bruto' },
  ])
  b.space(6)

  b.header('CAPITAL DA OPERAÇÃO')
  b.bigNumbers([
    { label: 'Necessário', value: EUR(necessario) },
    { label: 'Captado', value: EUR(captado) },
    { label: 'Cobertura', value: `${cobertura}%` },
  ])

  if (parsed.investidores?.length) {
    b.colTable(
      [['#', 30], ['Investidor', 140], ['Tipo', 100], ['Capital', 100], ['% Capital', 80]],
      [
        ...parsed.investidores.map((inv, i) => ({
          _values: [`#${i + 1}`, inv.nome || `Investidor ${i + 1}`, inv.tipo === 'empresa' ? 'Empresa (IRC)' : 'Particular (IRS)', EUR(inv.capital), `${necessario > 0 ? ((inv.capital / necessario) * 100).toFixed(1) : 0}%`]
        })),
        { _values: ['', 'Total captado', '', EUR(captado), `${cobertura}%`], _total: true },
      ]
    )
    b.space(6)

    b.header('DISTRIBUIÇÃO DO LUCRO')
    b.colTable(
      [['#', 25], ['Parte', 95], ['Tipo', 70], ['%', 30], ['Lucro', 65], ['Imposto', 55], ['Líquido', 60], ['ROI', 50]],
      [
        { _values: ['S', 'Somnium Properties', 'Gestor', `${parsed.perc_somnium}%`, EUR(parsed.quota_somnium), '—', EUR(parsed.quota_somnium), '—'] },
        ...parsed.investidores.map((inv, i) => ({
          _values: [`#${i + 1}`, inv.nome || `Inv. ${i + 1}`, inv.tipo === 'empresa' ? 'Empresa' : 'Particular', `${inv.perc_lucro || 0}%`, EUR(inv.lucro_bruto), EUR(inv.impostos), EUR(inv.lucro_liquido), inv.roi ? `${inv.roi}%` : '—']
        })),
        { _values: ['', 'Total distribuído', '', '', '', '', EUR((parsed.investidores.reduce((s, inv) => s + (inv.lucro_liquido || 0), 0)) + parsed.quota_somnium), ''], _total: true },
      ]
    )
  }
}

function renderRelatorioStress(b, im, an) {
  const a = an || {}
  if (!a.stress_tests) { b.text('Sem stress tests calculados.'); return }
  renderStressTests(b, a, { title: 'ANÁLISE DE RISCO — STRESS TESTS' })
}

function renderPropostaInvestimentoAnonima(b, im, a) {
  const compra = a.compra || im.valor_proposta || im.ask_price || 0
  const obra = a.obra_com_iva || a.obra || im.custo_estimado_obra || 0
  const vvr = a.vvr || im.valor_venda_remodelado || 0
  const meses = a.meses || 6
  const capitalNecessario = a.capital_necessario || (compra + obra)

  b.header('SUMÁRIO EXECUTIVO')
  b.bigNumbers([
    { label: 'Valor de Aquisição', value: EUR(compra), sub: a.perc_financiamento ? `${a.perc_financiamento}% financiado` : '100% capitais próprios' },
    { label: 'Valor de Venda Alvo', value: EUR(vvr) },
    { label: 'Retorno Total', value: PCT(a.retorno_total), sub: 'lucro bruto / total investido' },
    { label: 'Retorno Anualizado', value: PCT(a.retorno_anualizado), sub: `base ${meses} meses` },
  ])
  b.space(2)
  b.bigNumbers([
    { label: 'Lucro Bruto Estimado', value: EUR(a.lucro_bruto), sub: 'antes de impostos' },
    { label: 'Lucro Líquido', value: EUR(a.lucro_liquido), sub: `${a.regime_fiscal || 'IRC'} sobre lucro` },
    { label: 'Total Investido', value: EUR(capitalNecessario), sub: 'aquisição + obra + custos' },
    { label: 'Prazo de Retenção', value: `${meses} meses`, sub: 'da compra à escritura de venda' },
  ])
  b.space(6)

  b.header('SOBRE O PROJECTO')
  const tipoDesc = im.tipologia ? `um ${im.tipologia}` : 'um imóvel'
  const areaDesc = im.area_bruta ? ` com uma área bruta de ${im.area_bruta} m²` : ''
  const zonaDesc = im.zona ? ` na zona de ${im.zona}, Coimbra` : ' em Coimbra'
  b.textBlock(
    `O projecto consiste na aquisição, remodelação integral e revenda de ${tipoDesc}${areaDesc}, localizado${zonaDesc}. ` +
    `O imóvel encontra-se num estado de conservação que exige remodelação total, o que justifica o preço de aquisição abaixo do valor de mercado e cria a margem de valorização identificada.`
  )
  b.space(4)

  b.header('IDENTIFICAÇÃO DO IMÓVEL')
  b.simpleTable([
    { label: 'Localização', value: im.zona ? `Zona de ${im.zona}, Coimbra` : 'Coimbra, Portugal' },
    { label: 'Tipologia', value: im.tipologia || '—' },
    { label: 'Área Bruta Privativa', value: im.area_bruta ? `${im.area_bruta} m²` : '—' },
    { label: 'Modelo de Negócio', value: im.modelo_negocio || 'CAEP 50/50' },
    { label: 'Prazo Estimado', value: `${meses} meses` },
  ])
  b.space(6)

  let comps = a.comparaveis
  if (typeof comps === 'string') try { comps = JSON.parse(comps || '[]') } catch { comps = [] }
  if (comps && comps.length > 0) {
    b.newPage()
    b.header('ESTUDO DE MERCADO — VALORES DE VENDA COMPARÁVEIS')

    for (const tip of comps) {
      const items = tip.comparaveis || []
      const valid = items.filter(c => c.preco > 0 && c.area > 0)
      if (valid.length === 0) continue

      const precosM2 = valid.map(c => {
        const base = c.preco / c.area
        const ajTotal = Object.values(c.ajustes || {}).reduce((s, v) => s + (parseFloat(v) || 0), 0)
        return base * (1 + ajTotal / 100)
      })
      const media = Math.round(precosM2.reduce((a, b) => a + b, 0) / precosM2.length)
      const vvrTip = media * (tip.area || 0)

      b.subheader(`${tip.tipologia || 'Tipologia'} — ${tip.area || '?'} m²`)
      b.bigNumbers([
        { label: 'VVR Estimado', value: EUR(vvrTip) },
        { label: 'Média €/m²', value: `${media} €/m²` },
        { label: 'Amostra', value: `${valid.length} comparáveis` },
      ])
      b.colTable(
        [['#', 25], ['Preço', 70], ['Área', 45], ['€/m²', 50], ['Neg.', 45], ['Loc.', 45], ['Idade', 45], ['Total', 50]],
        valid.map((c, i) => {
          const aj = c.ajustes || {}
          const ajTotal = Object.values(aj).reduce((s, v) => s + (parseFloat(v) || 0), 0)
          return { _values: [`${i + 1}`, EUR(c.preco), `${c.area}m²`, `${Math.round(c.preco / c.area)}`, `${aj.neg || 0}%`, `${aj.loc || 0}%`, `${aj.idade || 0}%`, `${ajTotal >= 0 ? '+' : ''}${ajTotal}%`] }
        })
      )
      b.space(8)
    }
  }

  b.newPage()
  b.header('ANÁLISE FINANCEIRA — CENÁRIO BASE')
  b.subheader('Estrutura de Custos')
  b.simpleTable([
    { label: 'Valor de Compra', value: EUR(compra) },
    { label: 'IMT + Imposto de Selo', value: EUR((a.imt || 0) + (a.imposto_selo || 0)) },
    { label: 'Escritura + Registos + CPCV', value: EUR((a.escritura || 0) + (a.cpcv_compra || 0)) },
    { label: 'Total Custos de Aquisição', value: EUR(a.total_aquisicao), total: true },
    { label: 'Obra + IVA', value: EUR(obra) },
    { label: `Manutenção (${meses} meses)`, value: EUR(a.total_detencao) },
    { label: 'Comissão Imobiliária', value: EUR(a.comissao_com_iva) },
    { label: 'Total Investido', value: EUR(capitalNecessario), total: true },
  ])
  b.space(6)

  b.subheader('Retornos')
  b.simpleTable([
    { label: 'Valor de Venda Alvo', value: EUR(vvr) },
    { label: 'Lucro Estimado (Bruto)', value: EUR(a.lucro_bruto), total: true },
    { label: `Impostos (${a.regime_fiscal || 'IRC'})`, value: EUR(a.impostos) },
    { label: 'Lucro Estimado Líquido', value: EUR(a.lucro_liquido), total: true },
  ])
  b.space(4)

  b.bigNumbers([
    { label: 'Retorno Total', value: PCT(a.retorno_total) },
    { label: 'Cash-on-Cash', value: PCT(a.cash_on_cash) },
    { label: 'Retorno Anualizado', value: PCT(a.retorno_anualizado) },
  ])
  b.space(4)

  b.note(`Pressupostos: ${a.perc_financiamento ? `Financiamento ${a.perc_financiamento}%` : '100% capitais próprios'} · Regime fiscal: ${a.regime_fiscal || 'Empresa'} · Prazo: ${meses} meses`)

  renderStressTests(b, a, { newPage: true })

  b.newPage()
  b.header('CONCLUSÃO E RECOMENDAÇÃO')
  const raVal = a.retorno_anualizado || 0
  const rtVal = a.retorno_total || 0
  let stParsed = a.stress_tests
  if (typeof stParsed === 'string') try { stParsed = JSON.parse(stParsed) } catch { stParsed = null }
  let conclusao = `O projecto apresenta um perfil de risco-retorno atractivo: no cenário base conservador, o investimento gera um retorno total de ${rtVal}% e anualizado de ${raVal}% num prazo de ${meses} meses.`
  if (stParsed) {
    if (stParsed.pior?.lucro_liquido > 0) {
      conclusao += ` O investimento mantém lucro positivo mesmo no pior cenário (${EUR(stParsed.pior.lucro_liquido)}), o que valida a solidez estrutural do projecto.`
    } else if (stParsed.pior?.lucro_liquido != null) {
      conclusao += ` No pior cenário, o lucro estimado é de ${EUR(stParsed.pior.lucro_liquido)}, o que requer atenção ao risco.`
    }
  }
  if (im.zona) conclusao += ` A localização na zona de ${im.zona}, Coimbra, sustenta os valores de venda projectados.`
  b.textBlock(conclusao)

  b.space(4)
  b.header('MODELO DE PARCERIA')
  let caep = a.caep
  if (typeof caep === 'string') try { caep = JSON.parse(caep) } catch { caep = null }
  if (caep?.quota_somnium !== undefined) {
    b.simpleTable([
      { label: 'Investidor(es) passivo(s)', value: `${100 - (caep.perc_somnium || 40)}% do lucro` },
      { label: 'Somnium Properties', value: `${caep.perc_somnium || 40}% (gestão operacional + obra)` },
    ])
  } else {
    b.simpleTable([
      { label: 'Investidor(es) passivo(s)', value: '50% do lucro' },
      { label: 'Somnium Properties', value: '50% (gestão operacional + obra)' },
    ])
  }
  b.space(4)

  b.header('TRANSPARÊNCIA E COMUNICAÇÃO')
  b.simpleTable([
    { label: 'Google Drive exclusivo com toda a documentação do negócio', value: '' },
    { label: 'Canal Slack dedicado para comunicação em tempo real', value: '' },
    { label: 'Relatórios semanais de obra com fotos e vídeos', value: '' },
    { label: 'Acesso a orçamentos, facturas e contratos', value: '' },
    { label: 'Acesso vitalício aos documentos do negócio', value: '' },
  ])

  // Localização + pontos fortes/fracos/riscos antes do disclaimer
  if (im.localizacao_imagem || im.pontos_fortes || im.pontos_fracos || im.riscos || im.mitigacao_riscos) {
    b.newPage()
    b.localizacao()
    b.pontosFortesFracosRiscos()
    if (im.mitigacao_riscos) { b.space(4); b.riscosMitigacao() }
  }

  b.space(6)
  b.note('Os valores apresentados são estimativas conservadoras baseadas em análise de mercado e podem variar. A Somnium Properties utiliza stress tests automáticos em todos os negócios para protecção do investidor. Investimento imobiliário envolve risco de capital.')
}

function renderFichaDescarte(b, im) {
  b.header('DADOS DO IMÓVEL')
  b.simpleTable([
    { label: 'Nome / Referência', value: im.nome },
    { label: 'Zona', value: im.zona },
    { label: 'Tipologia', value: im.tipologia },
    { label: 'Ask Price', value: EUR(im.ask_price) },
    { label: 'Valor Proposta', value: EUR(im.valor_proposta) },
    { label: 'Modelo de Negócio', value: im.modelo_negocio },
    { label: 'Origem', value: im.origem },
    { label: 'Consultor', value: im.nome_consultor },
  ])
  b.space(4)

  b.header('MOTIVO DO DESCARTE')
  b.bigNumbers([
    { label: 'Motivo', value: im.motivo_descarte || 'Não especificado' },
  ])
  b.space(4)

  b.header('TIMELINE')
  b.simpleTable([
    { label: 'Data Adicionado', value: FDATE(im.data_adicionado || im.created_at) },
    { label: 'Data da Chamada', value: FDATE(im.data_chamada) },
    { label: 'Data da Visita', value: FDATE(im.data_visita) },
    { label: 'Data de Descarte', value: NOW() },
  ])
  b.space(4)

  b.header('VALORES FINANCEIROS (NA DATA DE DESCARTE)')
  b.simpleTable([
    { label: 'Ask Price', value: EUR(im.ask_price) },
    { label: 'VVR Estimado', value: EUR(im.valor_venda_remodelado) },
    { label: 'Custo Estimado Obra', value: EUR(im.custo_estimado_obra) },
    { label: 'ROI Estimado', value: PCT(im.roi) },
  ])
  b.space(4)

  if (im.notas) {
    b.header('NOTAS')
    b.textBlock(im.notas)
    b.space(4)
  }
}

// ══════════════════════════════════════════════════════════════
// DOCUMENT GENERATORS — capa especifica + render + disclaimer
// ══════════════════════════════════════════════════════════════

const GENERATORS = {
  ficha_imovel: (im) => {
    const b = new DocBuilder('Ficha do Imóvel', im.zona || '', im)
    renderFichaImovel(b, im)
    b.disclaimer()
    return b.end()
  },

  ficha_visita: (im) => {
    const b = new DocBuilder('Ficha de Visita', `${im.zona || ''} · ${im.tipologia || ''}`, im)
    renderFichaVisita(b, im)
    b.disclaimer()
    return b.end()
  },

  analise_rentabilidade: (im, analise) => {
    const b = new DocBuilder('Análise de Rentabilidade', im.zona || '', im)
    renderAnaliseRentabilidade(b, im, analise || {})
    b.disclaimer()
    return b.end()
  },

  estudo_comparaveis: (im, analise) => {
    const b = new DocBuilder('Estudo de Mercado — Comparáveis', im.zona || '', im)
    renderEstudoComparaveis(b, im, analise || {})
    b.disclaimer()
    return b.end()
  },

  proposta_formal: (im) => {
    const b = new DocBuilder('Proposta ao Proprietário', im.zona || '', im)
    renderPropostaFormal(b, im)
    b.disclaimer()
    return b.end()
  },

  dossier_investidor: (im, analise) => {
    const a = analise || {}
    const b = new DocBuilder('Dossier de Investimento', `Oportunidade · ${im.zona || ''}`, im, {
      style: 'investor',
      heroItems: [
        { label: 'Capital Necessário', value: EUR(a.capital_necessario), sub: a.meses ? `Hold ${a.meses} meses` : '' },
        { label: 'Lucro Líquido',      value: EUR(a.lucro_liquido) },
        { label: 'Retorno Anualizado', value: PCT(a.retorno_anualizado) },
      ],
    })
    renderDossierInvestidor(b, im, a)
    b.disclaimer()
    return b.end()
  },

  resumo_negociacao: (im) => {
    const b = new DocBuilder('Resumo de Negociação', im.zona || '', im)
    renderResumoNegociacao(b, im)
    b.disclaimer()
    return b.end()
  },

  resumo_acordo: (im) => {
    const b = new DocBuilder('Resumo de Acordo', im.zona || '', im)
    renderResumoAcordo(b, im)
    b.disclaimer()
    return b.end()
  },

  ficha_follow_up: (im) => {
    const b = new DocBuilder('Ficha de Follow Up', im.zona || '', im)
    renderFichaFollowUp(b, im)
    b.disclaimer()
    return b.end()
  },

  ficha_cedencia: (im) => {
    const b = new DocBuilder('Ficha de Cedência de Posição', im.zona || '', im)
    renderFichaCedencia(b, im)
    b.disclaimer()
    return b.end()
  },

  ficha_acompanhamento_obra: (im) => {
    const b = new DocBuilder('Acompanhamento de Obra', im.zona || '', im)
    renderFichaAcompanhamentoObra(b, im)
    b.disclaimer()
    return b.end()
  },

  // ══════════════════════════════════════════════════════════════
  // RELATÓRIOS PARA INVESTIDOR (estilo limpo, arejado)
  // ══════════════════════════════════════════════════════════════

  relatorio_investimento: (im, an) => {
    const a = an || {}
    const b = new DocBuilder('Análise de Investimento', im.zona || '', im, {
      style: 'investor',
      heroItems: [
        { label: 'Lucro Líquido',      value: EUR(a.lucro_liquido) },
        { label: 'Retorno Anualizado', value: PCT(a.retorno_anualizado) },
        { label: 'Capital Necessário', value: EUR(a.capital_necessario) },
      ],
    })
    renderRelatorioInvestimento(b, im, a)
    b.disclaimer()
    return b.end()
  },

  relatorio_comparaveis: (im, an) => {
    const b = new DocBuilder('Estudo de Mercado', im.zona || '', im)
    renderRelatorioComparaveis(b, im, an)
    b.disclaimer()
    return b.end()
  },

  relatorio_caep: (im, an) => {
    const b = new DocBuilder('Parceria CAEP — Distribuição de Lucro', im.zona || '', im)
    renderRelatorioCaep(b, im, an)
    b.disclaimer()
    return b.end()
  },

  relatorio_stress: (im, an) => {
    const b = new DocBuilder('Análise de Risco', im.zona || '', im)
    renderRelatorioStress(b, im, an)
    b.disclaimer()
    return b.end()
  },

  proposta_investimento_anonima: (im, analise) => {
    const a = analise || {}
    const meses = a.meses || 6
    const b = new DocBuilder('Proposta de Investimento', '', {
      ...im,
      nome: 'OPORTUNIDADE DE INVESTIMENTO',
      zona: im.zona ? `Zona de ${im.zona}` : 'Coimbra',
    }, {
      style: 'investor',
      heroItems: [
        { label: 'Retorno Anualizado', value: PCT(a.retorno_anualizado), sub: `Base ${meses} meses` },
        { label: 'Lucro Líquido',      value: EUR(a.lucro_liquido) },
        { label: 'Total Investido',    value: EUR(a.capital_necessario) },
      ],
    })
    renderPropostaInvestimentoAnonima(b, im, a)
    b.disclaimer()
    return b.end()
  },

  ficha_descarte: (im) => {
    const b = new DocBuilder('Ficha de Descarte', im.zona || '', im)
    renderFichaDescarte(b, im)
    b.disclaimer()
    return b.end()
  },
}

// ══════════════════════════════════════════════════════════════
// RENDERERS — mapa de seccao → render(b, im, a) usado pelo
// generateCompiledReport para combinar varias seccoes inline.
// ══════════════════════════════════════════════════════════════

const RENDERERS = {
  ficha_imovel: renderFichaImovel,
  ficha_visita: renderFichaVisita,
  analise_rentabilidade: renderAnaliseRentabilidade,
  estudo_comparaveis: renderEstudoComparaveis,
  proposta_formal: renderPropostaFormal,
  dossier_investidor: renderDossierInvestidor,
  proposta_investimento_anonima: renderPropostaInvestimentoAnonima,
  resumo_negociacao: renderResumoNegociacao,
  resumo_acordo: renderResumoAcordo,
  ficha_follow_up: renderFichaFollowUp,
  ficha_cedencia: renderFichaCedencia,
  ficha_acompanhamento_obra: renderFichaAcompanhamentoObra,
  ficha_descarte: renderFichaDescarte,
  // Aliases compativeis com o formato antigo
  investimento: renderRelatorioInvestimento,
  comparaveis: renderRelatorioComparaveis,
  caep: renderRelatorioCaep,
  stress_tests: renderRelatorioStress,
}

// Mapa de chave compilavel → nome do GENERATOR (usado para
// despachar 1-seccao para o gerador completo, com a sua capa).
const COMPILAVEL_TO_GENERATOR = {
  investimento: 'relatorio_investimento',
  comparaveis: 'relatorio_comparaveis',
  caep: 'relatorio_caep',
  stress_tests: 'relatorio_stress',
}

// Seccoes que mostram a imagem de localizacao (precisam preload async)
const SECCOES_COM_LOCALIZACAO = new Set([
  'dossier_investidor', 'proposta_investimento_anonima', 'investimento',
])

// Gera um PDF compilado para investidor. Quando ha apenas uma
// seccao, devolve o gerador completo (com a sua capa especifica).
// Para multiplas, faz capa "Dossier" + render inline de cada
// seccao via RENDERERS, separadas por newPage.
export async function generateCompiledReport(imovel, analise, seccoes = []) {
  // 1-seccao: delega no generateDoc (async, ja faz preloadLocalizacao
  // para tipos investidor) — capa especifica + comportamento consistente.
  if (seccoes.length === 1) {
    const tipo = COMPILAVEL_TO_GENERATOR[seccoes[0]] || seccoes[0]
    if (GENERATORS[tipo]) return generateDoc(tipo, imovel, analise)
  }

  // Multi-seccao: pre-carrega localizacao se alguma seccao a usa, para
  // que o renderer sincrono ja receba o buffer de imagem em memoria.
  const precisaLocalizacao = seccoes.some(s => SECCOES_COM_LOCALIZACAO.has(s))
  const im = precisaLocalizacao ? await preloadLocalizacao(imovel) : imovel

  const b = new DocBuilder('Dossier de Investimento', im.zona || '', im)
  const an = analise || {}
  let hasContent = false
  for (const seccao of seccoes) {
    const render = RENDERERS[seccao]
    if (!render) continue
    if (hasContent) b.newPage()
    hasContent = true
    render(b, im, an)
  }
  if (!hasContent) b.text('Nenhuma secção com dados disponíveis para compilar.')
  b.disclaimer()
  return b.end()
}

