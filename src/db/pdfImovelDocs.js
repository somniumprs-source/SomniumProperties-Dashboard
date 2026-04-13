/**
 * Documentos PDF profissionais por fase do imóvel.
 * Layout empresarial Somnium Properties — mobile-friendly.
 */
import PDFDocument from 'pdfkit'
import { readFileSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const LOGO_PATH = path.resolve(__dirname, '../../public/logo-transparent.png')

// Design tokens
const C = {
  gold: '#C9A84C', black: '#0d0d0d', white: '#ffffff',
  bg: '#f7f6f2', body: '#2a2a2a', muted: '#999999',
  border: '#e0ddd5', light: '#f0efe9', accent: '#1a1a1a',
  green: '#22c55e', red: '#ef4444', blue: '#6366f1',
}
const ML = 50, MR = 50 // margins
const PW = 595.28, PH = 841.89
const CW = PW - ML - MR // content width

const EUR = v => v == null || v === 0 ? '—' : new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(v)
const PCT = v => v == null ? '—' : `${v}%`
const FDATE = d => { if (!d) return '—'; try { return new Date(d).toLocaleDateString('pt-PT') } catch { return d } }
const NOW = () => new Date().toLocaleDateString('pt-PT', { day: '2-digit', month: 'long', year: 'numeric' })

// ── Estado → Documentos ──────────────────────────────────────
const ESTADO_DOC_MAP = {
  'Adicionado': ['ficha_imovel'],
  'Necessidade de Visita': ['ficha_pre_visita'],
  'Visita Marcada': ['checklist_visita'],
  'Estudo de VVR': ['relatorio_visita', 'analise_rentabilidade', 'estudo_comparaveis'],
  'Criar Proposta ao Proprietário': ['proposta_formal'],
  'Enviar proposta ao Proprietário': ['proposta_formal'],
  'Enviar proposta ao investidor': ['apresentacao_investidor'],
  'Em negociação': ['resumo_negociacao'],
  'Proposta aceite': ['resumo_acordo'],
  'Enviar proposta ao investidor': ['dossier_investimento'],
  'Follow Up após proposta': ['ficha_follow_up'],
  'Follow UP': ['ficha_follow_up'],
  'Wholesaling': ['ficha_cedencia'],
  'CAEP': ['ficha_acompanhamento_obra'],
  'Fix and Flip': ['ficha_acompanhamento_obra'],
}

export function getDocsForEstado(estado) { return ESTADO_DOC_MAP[estado] || [] }

const DOC_LABELS = {
  ficha_imovel: 'Ficha do Imóvel', ficha_pre_visita: 'Ficha Pré-Visita', checklist_visita: 'Checklist de Visita',
  relatorio_visita: 'Relatório de Visita', analise_rentabilidade: 'Análise de Rentabilidade', estudo_comparaveis: 'Estudo de Comparáveis',
  proposta_formal: 'Proposta ao Proprietário', apresentacao_investidor: 'Apresentação ao Investidor',
  resumo_negociacao: 'Resumo de Negociação', resumo_acordo: 'Resumo de Acordo', dossier_investimento: 'Dossier de Investimento',
  ficha_follow_up: 'Ficha de Follow Up', ficha_cedencia: 'Ficha de Cedência', ficha_acompanhamento_obra: 'Acompanhamento de Obra',
}

export function generateDoc(tipo, imovel, analise = null) {
  const fn = GENERATORS[tipo]
  return fn ? fn(imovel, analise) : null
}

// ══════════════════════════════════════════════════════════════
// LAYOUT SYSTEM — Professional, mobile-friendly
// ══════════════════════════════════════════════════════════════

class DocBuilder {
  constructor(title, subtitle, imovel) {
    this.doc = new PDFDocument({ size: 'A4', autoFirstPage: false })
    this.y = 0
    this.imovel = imovel
    this._drawCover(title, subtitle)
    this.newPage()
  }

  _drawCover(title, subtitle) {
    const d = this.doc
    d.addPage({ size: 'A4', margins: { top: 0, bottom: 0, left: 0, right: 0 } })
    d.rect(0, 0, PW, PH).fill(C.black)
    d.rect(0, 0, PW, 4).fill(C.gold)
    try { d.image(readFileSync(LOGO_PATH), (PW - 150) / 2, 150, { width: 150 }) } catch {}
    d.rect(PW / 2 - 20, 280, 40, 1).fill(C.gold)
    d.fontSize(8).fillColor(C.gold).text(title.toUpperCase(), ML, 300, { width: CW, align: 'center', lineBreak: false, characterSpacing: 4 })
    d.fontSize(22).fillColor(C.white).text(this.imovel.nome || 'Imóvel', ML, 335, { width: CW, align: 'center', lineBreak: false })
    if (subtitle) d.fontSize(10).fillColor(C.muted).text(subtitle, ML, 375, { width: CW, align: 'center', lineBreak: false })
    d.fontSize(9).fillColor(C.muted).text(NOW(), ML, 400, { width: CW, align: 'center', lineBreak: false })
    // Footer
    d.rect(0, PH - 45, PW, 45).fill(C.accent)
    d.rect(0, PH - 45, PW, 1).fill(C.gold).opacity(0.3); d.opacity(1)
    d.fontSize(7).fillColor(C.gold).text('SOMNIUM PROPERTIES', ML, PH - 28, { width: CW, align: 'center', lineBreak: false })
  }

  newPage() {
    this.doc.addPage({ size: 'A4', margins: { top: 45, bottom: 45, left: ML, right: MR } })
    this.y = 45
    // Mini header
    this.doc.rect(0, 0, PW, 32).fill(C.black)
    this.doc.rect(0, 32, PW, 2).fill(C.gold)
    try { this.doc.image(readFileSync(LOGO_PATH), ML, 6, { height: 20 }) } catch {}
    this.doc.fontSize(7).fillColor(C.muted).text(this.imovel.nome || '', ML + 80, 12, { lineBreak: false })
    this.doc.fontSize(7).fillColor(C.gold).text(NOW(), PW - MR - 80, 12, { width: 80, align: 'right', lineBreak: false })
    this.y = 45
    return this
  }

  ensure(needed) {
    if (this.y > 50 && this.y + needed > PH - 50) this.newPage()
    return this
  }

  // Section header (dark bar with gold accent)
  header(title) {
    this.ensure(35)
    const d = this.doc
    d.rect(ML, this.y, CW, 28).fill(C.black)
    d.rect(ML, this.y, 3, 28).fill(C.gold)
    d.fontSize(8).fillColor(C.gold).text(title.toUpperCase(), ML + 14, this.y + 9, { characterSpacing: 2, lineBreak: false })
    this.y += 34
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
      this.doc.fontSize(10).fillColor(C.green).text('✓', ML + 4, this.y + 1, { lineBreak: false })
    }
    this.doc.fontSize(9).fillColor(C.body).text(text, ML + 24, this.y + 3, { width: CW - 30 })
    this.y = Math.max(this.y + 22, this.doc.y + 4)
    return this
  }

  // Info text
  text(content, options = {}) {
    this.ensure(20)
    this.doc.fontSize(options.size || 9).fillColor(options.color || C.body).text(content, ML, this.y, { width: CW, lineGap: options.lineGap || 4 })
    this.y = this.doc.y + 6
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
    this.ensure(22)
    this.doc.circle(ML + 8, this.y + 8, 8).fill(C.gold)
    this.doc.fontSize(8).fillColor(C.white).text(String(num), ML + 3, this.y + 4, { width: 10, align: 'center', lineBreak: false })
    this.doc.fontSize(9).fillColor(C.body).text(text, ML + 24, this.y + 3, { width: CW - 30 })
    this.y = Math.max(this.y + 20, this.doc.y + 4)
    return this
  }

  // Bullet point
  bullet(text) {
    this.ensure(18)
    this.doc.fontSize(9).fillColor(C.gold).text('▸ ', ML, this.y, { continued: true }).fillColor(C.body).text(text, { width: CW - 14, lineGap: 3 })
    this.y = this.doc.y + 4
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

  end() { this.doc.end(); return this.doc }
}

// ══════════════════════════════════════════════════════════════
// DOCUMENT GENERATORS
// ══════════════════════════════════════════════════════════════

const GENERATORS = {
  // ── 1. FICHA DO IMÓVEL ──────────────────────────────────────
  ficha_imovel: (im) => {
    const b = new DocBuilder('Ficha do Imóvel', im.zona || '', im)
    b.header('INFORMAÇÃO GERAL')
    b.row('Nome', im.nome, { alt: true }).row('Estado', (im.estado || '').replace(/^\d+-/, ''))
    b.row('Tipologia', im.tipologia, { alt: true }).row('Zona', im.zona)
    b.row('Origem', im.origem, { alt: true }).row('Consultor', im.nome_consultor)
    b.row('Modelo de Negócio', im.modelo_negocio, { alt: true }).row('Link', im.link)
    b.row('Data Adicionado', FDATE(im.data_adicionado), { alt: true })
    b.space()
    b.header('VALORES')
    b.row('Ask Price', EUR(im.ask_price), { alt: true }).row('Valor Proposta', EUR(im.valor_proposta))
    b.row('Custo Estimado Obra', EUR(im.custo_estimado_obra), { alt: true }).row('Valor Venda Remodelado', EUR(im.valor_venda_remodelado))
    b.row('ROI', PCT(im.roi), { alt: true }).row('ROI Anualizado', PCT(im.roi_anualizado))
    b.row('Área Útil', im.area_util ? `${im.area_util} m²` : '—', { alt: true }).row('Área Bruta', im.area_bruta ? `${im.area_bruta} m²` : '—')
    if (im.notas) { b.space().section('Notas').text(im.notas) }
    return b.end()
  },

  // ── 2. FICHA PRÉ-VISITA ────────────────────────────────────
  ficha_pre_visita: (im) => {
    const b = new DocBuilder('Ficha Pré-Visita', im.zona || '', im)
    b.header('DADOS DO IMÓVEL')
    b.row('Imóvel', im.nome, { alt: true }).row('Tipologia', im.tipologia)
    b.row('Zona', im.zona, { alt: true }).row('Ask Price', EUR(im.ask_price))
    b.row('Consultor', im.nome_consultor, { alt: true }).row('Link', im.link)
    b.space()
    b.header('PONTOS A AVALIAR NA VISITA')
    ;['Estado geral da estrutura (paredes, tectos, pavimentos)', 'Telhado e cobertura — infiltração ou degradação',
      'Instalação eléctrica — quadro, tomadas, iluminação', 'Canalização — pressão de água, esgotos, humidade',
      'Caixilharia e janelas — estado, isolamento térmico', 'Orientação solar e luminosidade natural',
      'Acessos, estacionamento e envolvente', 'Possibilidade de ampliação ou alteração de layout',
    ].forEach(p => b.check(p))
    b.space()
    b.header('PERGUNTAS AO PROPRIETÁRIO')
    ;['Há quanto tempo está à venda? Motivo da venda?', 'Valor mínimo que aceita? Margem de negociação?',
      'Algum problema estrutural ou legal conhecido?', 'Documentação em dia? (caderneta, certidão permanente)',
      'Existem ónus, hipotecas ou penhoras?', 'Área real corresponde à área registada?',
    ].forEach(p => b.check(p))
    b.space()
    b.header('DOCUMENTOS A SOLICITAR')
    ;['Caderneta predial urbana', 'Certidão permanente do registo predial', 'Licença de utilização',
      'Plantas do imóvel', 'Certificado energético', 'Declaração de dívidas ao condomínio',
    ].forEach(p => b.check(p))
    b.space()
    b.section('Notas').input('Observações', '', { tall: true })
    return b.end()
  },

  // ── 3. CHECKLIST DE VISITA ──────────────────────────────────
  checklist_visita: (im) => {
    const b = new DocBuilder('Checklist de Visita', `${im.zona || ''} · ${im.tipologia || ''}`, im)
    b.header('DADOS DA VISITA')
    b.inputRow('Data da Visita', FDATE(im.data_visita), 'Consultor Presente', im.nome_consultor)
    b.space()

    const secs = {
      'ESTRUTURA E EXTERIOR': ['Fachada — fissuras, humidade, degradação', 'Telhado / cobertura — telhas, isolamento', 'Terraço / varanda — impermeabilização', 'Garagem / estacionamento'],
      'INTERIOR': ['Paredes — fissuras, humidade, bolor', 'Tectos — manchas, infiltrações', 'Pavimentos — estado, nivelamento', 'Portas — funcionamento, estado'],
      'INSTALAÇÕES TÉCNICAS': ['Quadro eléctrico — disjuntores, estado', 'Tomadas e interruptores', 'Canalização — água quente e fria', 'Esgotos — cheiros, escoamento', 'Aquecimento — sistema, estado'],
      'COZINHA E CASAS DE BANHO': ['Cozinha — bancada, armários, equipamentos', 'WC — louças, torneiras, ventilação', 'Azulejos — estado geral'],
      'ENVOLVENTE': ['Vizinhança — ruído, segurança', 'Transportes e serviços próximos', 'Orientação solar', 'Estacionamento na zona'],
    }

    for (const [title, items] of Object.entries(secs)) {
      b.header(title)
      items.forEach(item => b.check(item))
      b.space(4)
    }

    b.header('IMPRESSÃO GERAL')
    b.input('Impressão geral do imóvel', '', { tall: true })
    b.space()
    b.section('Decisão')
    b.check('Avançar para estudo de mercado')
    b.check('Necessita segunda visita')
    b.check('Descartar')
    b.input('Motivo / Observações', '', { tall: true })
    return b.end()
  },

  // ── 4a. RELATÓRIO DE VISITA ─────────────────────────────────
  relatorio_visita: (im) => {
    const b = new DocBuilder('Relatório de Visita', im.zona || '', im)
    b.header('DADOS DA VISITA')
    b.row('Imóvel', im.nome, { alt: true }).row('Zona', im.zona)
    b.row('Data Visita', FDATE(im.data_visita), { alt: true }).row('Consultor', im.nome_consultor)
    b.space()
    b.header('ESTADO REAL DO IMÓVEL')
    b.input('Descrição geral do estado encontrado', '', { tall: true })
    b.space()
    b.header('OBRAS NECESSÁRIAS')
    ;['Demolições e remoção', 'Estrutura / alvenaria', 'Canalização', 'Electricidade',
      'Revestimentos / acabamentos', 'Cozinha e WC', 'Caixilharia', 'Pintura', 'Outros',
    ].forEach(item => b.inputRow(item, '', 'Custo estimado', ''))
    b.space()
    b.header('DECISÃO')
    b.check('GO — Avançar para análise de rentabilidade')
    b.check('SEGUNDA VISITA — Necessita validação adicional')
    b.check('NO GO — Descartar')
    b.input('Justificação', '', { tall: true })
    return b.end()
  },

  // ── 4b. ANÁLISE DE RENTABILIDADE (dados da calculadora) ────
  analise_rentabilidade: (im, analise) => {
    const b = new DocBuilder('Análise de Rentabilidade', im.zona || '', im)
    const a = analise || {}
    const compra = a.compra || im.valor_proposta || im.ask_price || 0
    const obra = a.obra_com_iva || a.obra || im.custo_estimado_obra || 0
    const vvr = a.vvr || im.valor_venda_remodelado || 0

    // KPIs em destaque
    b.header('RESUMO DO INVESTIMENTO')
    b.highlight('Capital Necessário', EUR(a.capital_necessario || compra + obra), C.blue)
    b.highlight('Lucro Líquido', EUR(a.lucro_liquido), a.lucro_liquido > 0 ? C.green : C.red)
    b.highlight('Retorno Anualizado', PCT(a.retorno_anualizado), C.gold)
    b.space()

    // A. Custos de Aquisição
    b.header('A. CUSTOS DE AQUISIÇÃO')
    b.row('Valor de Compra', EUR(compra), { alt: true })
    b.row('VPT', EUR(a.vpt))
    b.row('Finalidade', (a.finalidade || '').replace(/_/g, ' '), { alt: true })
    b.row('IMT', EUR(a.imt))
    b.row('Imposto de Selo', EUR(a.imposto_selo), { alt: true })
    b.row('Escritura', EUR(a.escritura))
    b.row('CPCV Compra', EUR(a.cpcv_compra), { alt: true })
    b.row('Due Diligence', EUR(a.due_diligence))
    b.row('Total Aquisição', EUR(a.total_aquisicao), { alt: true })
    b.space()

    // B. Financiamento
    if (a.perc_financiamento > 0) {
      b.header('B. FINANCIAMENTO')
      b.row('% Financiamento', PCT(a.perc_financiamento), { alt: true })
      b.row('Valor Financiado', EUR(a.valor_financiado))
      b.row('Prazo', `${a.prazo_anos || 30} anos`, { alt: true })
      b.row('TAN', PCT(a.tan))
      b.row('Tipo Taxa', a.tipo_taxa, { alt: true })
      b.row('Prestação Mensal', EUR(a.prestacao_mensal))
      b.row('Comissões Bancárias', EUR(a.comissoes_banco), { alt: true })
      b.row('IS Financiamento', EUR(a.is_financiamento))
      b.space()
    }

    // C. Custos de Obra
    b.header('C. CUSTOS DE OBRA')
    b.row('Obra', EUR(a.obra), { alt: true })
    b.row('PMO %', PCT(a.pmo_perc))
    b.row('ARU', a.aru ? 'Sim' : 'Não', { alt: true })
    b.row('Ampliação', a.ampliacao ? 'Sim' : 'Não')
    b.row('IVA Obra', EUR(a.iva_obra), { alt: true })
    b.row('Obra com IVA', EUR(a.obra_com_iva))
    b.row('Licenciamento', EUR(a.licenciamento), { alt: true })
    b.space()

    // D. Detenção
    b.header('D. CUSTOS DE DETENÇÃO')
    b.row('Meses de Retenção', a.meses || '—', { alt: true })
    b.row('Seguro Mensal', EUR(a.seguro_mensal))
    b.row('Condomínio Mensal', EUR(a.condominio_mensal), { alt: true })
    b.row('Taxa IMI', PCT(a.taxa_imi))
    b.space()

    // E. Venda
    b.header('E. VENDA')
    b.row('VVR', EUR(vvr), { alt: true })
    b.row('Comissão %', PCT(a.comissao_perc))
    b.row('Comissão com IVA', EUR(a.comissao_com_iva), { alt: true })
    b.row('Total Custos Venda', EUR(a.total_venda))
    b.space()

    // F. Fiscalidade
    b.header('F. FISCALIDADE')
    b.row('Regime', a.regime_fiscal || '—', { alt: true })
    b.row('Impostos', EUR(a.impostos))
    if (a.regime_fiscal === 'Empresa') {
      b.row('Derrama Municipal', PCT(a.derrama_perc), { alt: true })
      b.row('% Distribuição Dividendos', PCT(a.perc_dividendos))
      b.row('Retenção Dividendos', EUR(a.retencao_dividendos), { alt: true })
    }
    b.space()

    // G. Resultado Final
    b.header('G. RESULTADO')
    b.highlight('Lucro Bruto', EUR(a.lucro_bruto), C.green)
    b.highlight('Impostos', EUR(a.impostos), C.red)
    b.highlight('Lucro Líquido', EUR(a.lucro_liquido), a.lucro_liquido > 0 ? C.green : C.red)
    b.space()
    b.row('Retorno Total', PCT(a.retorno_total), { alt: true })
    b.row('Retorno Anualizado', PCT(a.retorno_anualizado))
    b.row('Cash-on-Cash', PCT(a.cash_on_cash), { alt: true })
    b.row('Break-Even', EUR(a.break_even))
    b.space()

    // H. Stress Tests
    if (a.stress_tests) {
      let st = a.stress_tests
      if (typeof st === 'string') try { st = JSON.parse(st) } catch { st = null }
      if (st) {
        b.header('H. TESTES DE STRESS')
        if (st.base) {
          b.row('Base — Lucro Líquido', EUR(st.base.lucro_liquido), { alt: true })
          b.row('Base — RA', PCT(st.base.retorno_anualizado))
        }
        if (st.pior) {
          b.row('Pior Cenário — Lucro', EUR(st.pior.lucro_liquido), { alt: true })
          b.row('Pior Cenário — RA', PCT(st.pior.retorno_anualizado))
        }
        if (st.melhor) {
          b.row('Melhor Cenário — Lucro', EUR(st.melhor.lucro_liquido), { alt: true })
          b.row('Melhor Cenário — RA', PCT(st.melhor.retorno_anualizado))
        }
        // Cenários individuais
        const cenarios = st.cenarios || st.downside || []
        if (Array.isArray(cenarios) && cenarios.length > 0) {
          b.space()
          const ws = [200, 100, 90, 90]
          b.tableHeader([['Cenário', 200], ['Lucro Líq.', 100], ['RT', 90], ['RA', 90]])
          cenarios.forEach((c, i) => {
            b.tableRow([c.nome || c.label || `Cenário ${i+1}`, EUR(c.lucro_liquido), PCT(c.retorno_total), PCT(c.retorno_anualizado)], ws, i % 2 === 0)
          })
        }
      }
    }

    return b.end()
  },

  // ── 4c. ESTUDO DE COMPARÁVEIS (dados da calculadora) ──────
  estudo_comparaveis: (im, analise) => {
    const b = new DocBuilder('Estudo de Mercado — Comparáveis', im.zona || '', im)
    const a = analise || {}

    b.header('IMÓVEL EM ANÁLISE')
    b.row('Imóvel', im.nome, { alt: true }).row('Zona', im.zona)
    b.row('Tipologia', im.tipologia, { alt: true }).row('VVR Estimado', EUR(a.vvr || im.valor_venda_remodelado))
    b.space()

    // Comparáveis da calculadora
    let comps = a.comparaveis || []
    if (typeof comps === 'string') try { comps = JSON.parse(comps) } catch { comps = [] }

    if (Array.isArray(comps) && comps.length > 0) {
      // Comparáveis organizados por tipologia
      for (let t = 0; t < comps.length; t++) {
        const tip = comps[t]
        if (!tip) continue

        // Tipologia header
        const tipLabel = tip.tipologia || tip.label || `Tipologia ${t + 1}`
        b.header(`TIPOLOGIA: ${tipLabel.toUpperCase()}`)

        if (tip.area || tip.renda || tip.yield_bruta) {
          b.row('Área (m²)', tip.area, { alt: true })
          b.row('Renda Mensal', EUR(tip.renda))
          b.row('Yield Bruta', PCT(tip.yield_bruta), { alt: true })
          b.row('VVR pelo Rendimento', EUR(tip.vvr_rendimento))
          b.space()
        }

        if (tip.vvr_alvo) {
          b.highlight('VVR Alvo', EUR(tip.vvr_alvo), C.gold)
          b.space()
        }

        // Comparáveis individuais
        const items = tip.comparaveis || tip.items || []
        if (items.length > 0) {
          const ws = [120, 55, 70, 70, 55, 60, 55]
          b.tableHeader([['Comparável', 120], ['Área', 55], ['Preço', 70], ['€/m²', 70], ['Ajuste', 55], ['€/m² Aj.', 60], ['VVR Est.', 55]])
          items.forEach((c, i) => {
            const eurM2 = c.area > 0 ? Math.round((c.preco || c.preco_anuncio || 0) / c.area) : '—'
            const ajTotal = (c.ajuste_total || 0)
            const eurM2Aj = typeof eurM2 === 'number' ? Math.round(eurM2 * (1 + ajTotal / 100)) : '—'
            const vvrEst = typeof eurM2Aj === 'number' && tip.area ? eurM2Aj * tip.area : '—'
            b.tableRow([
              c.notas || c.zona || `Comp. ${i+1}`,
              c.area ? `${c.area}m²` : '—',
              EUR(c.preco || c.preco_anuncio),
              typeof eurM2 === 'number' ? `€${eurM2}` : '—',
              ajTotal ? `${ajTotal > 0 ? '+' : ''}${ajTotal}%` : '0%',
              typeof eurM2Aj === 'number' ? `€${eurM2Aj}` : '—',
              typeof vvrEst === 'number' ? EUR(vvrEst) : '—',
            ], ws, i % 2 === 0)
          })

          // Média
          const validVVRs = items.filter(c => c.vvr_estimado > 0).map(c => c.vvr_estimado)
          if (validVVRs.length > 0) {
            const media = Math.round(validVVRs.reduce((a, b) => a + b, 0) / validVVRs.length)
            b.space(4)
            b.highlight('Média VVR Comparáveis', EUR(media), C.green)
          }
        }
        b.space()
      }
    } else {
      // Sem dados da calculadora — template vazio
      for (let i = 1; i <= 5; i++) {
        b.header(`COMPARÁVEL ${i}`)
        b.inputRow('Endereço / Zona', '', 'Tipologia', '')
        b.inputRow('Área (m²)', '', 'Valor de Venda', '')
        b.inputRow('Valor por m²', '', 'Data de Venda', '')
        b.inputRow('Fonte', '', 'Ajuste %', '')
        b.input('Notas', '')
        b.space(4)
      }
      b.header('CONCLUSÃO')
      b.input('Análise comparativa e valor de mercado estimado', '', { tall: true })
    }

    // Disclaimer
    b.space()
    b.text('Nota: Os valores apresentados são estimativas baseadas em comparáveis de mercado e podem não reflectir o valor exacto de transacção. A Somnium Properties recomenda validação com avaliação profissional certificada.', { size: 7, color: C.muted })

    return b.end()
  },

  // ── 5. PROPOSTA FORMAL ────────────────────────────────────
  proposta_formal: (im) => {
    const b = new DocBuilder('Proposta ao Proprietário', im.zona || '', im)
    b.header('DADOS DO IMÓVEL')
    b.row('Imóvel', im.nome, { alt: true }).row('Zona', im.zona)
    b.row('Consultor', im.nome_consultor, { alt: true }).row('Ask Price', EUR(im.ask_price))
    b.space()
    b.header('PROPOSTA')
    b.highlight('Valor Proposto', EUR(im.valor_proposta))
    b.input('Condições de Pagamento', '')
    b.inputRow('Prazo para CPCV', '', 'Prazo para Escritura', '')
    b.input('Condições Especiais', '', { tall: true })
    b.space()
    b.section('Justificação do Valor')
    b.input('Fundamentos da proposta (comparáveis, estado, obra necessária)', '', { tall: true })
    return b.end()
  },

  // ── 6. APRESENTAÇÃO AO INVESTIDOR (dossier completo com calculadora + CAEP)
  apresentacao_investidor: (im, analise) => {
    const b = new DocBuilder('Dossier de Investimento', `Oportunidade · ${im.zona || ''}`, im)
    const a = analise || {}
    const compra = a.compra || im.valor_proposta || im.ask_price || 0
    const obra = a.obra_com_iva || a.obra || im.custo_estimado_obra || 0
    const vvr = a.vvr || im.valor_venda_remodelado || 0

    // 1. Oportunidade
    b.header('OPORTUNIDADE DE INVESTIMENTO')
    b.row('Imóvel', im.nome, { alt: true }).row('Zona', im.zona)
    b.row('Tipologia', im.tipologia, { alt: true }).row('Modelo', im.modelo_negocio || 'CAEP 50/50')
    b.row('Prazo Estimado', a.meses ? `${a.meses} meses` : '—', { alt: true })
    b.space()

    // 2. KPIs em destaque
    b.header('NÚMEROS DO NEGÓCIO')
    b.highlight('Capital Necessário', EUR(a.capital_necessario || compra + obra), C.blue)
    b.highlight('Lucro Líquido', EUR(a.lucro_liquido), a.lucro_liquido > 0 ? C.green : C.red)
    b.highlight('Retorno Anualizado', PCT(a.retorno_anualizado), C.gold)
    b.space()

    // 3. Decomposição de custos
    b.header('DECOMPOSIÇÃO DE CUSTOS')
    b.row('Compra', EUR(compra), { alt: true }).row('IMT + IS + Escritura', EUR((a.imt || 0) + (a.imposto_selo || 0) + (a.escritura || 0)))
    b.row('Total Aquisição', EUR(a.total_aquisicao), { alt: true })
    b.row('Obra com IVA', EUR(a.obra_com_iva || obra))
    b.row('Custos Detenção', EUR(a.total_manutencao), { alt: true })
    b.row('VVR (conservador)', EUR(vvr))
    b.row('Comissão Venda', EUR(a.comissao_com_iva), { alt: true })
    b.row('Impostos (' + (a.regime_fiscal || 'Empresa') + ')', EUR(a.impostos))
    b.space()

    // 4. Resultado
    b.header('RESULTADO')
    b.row('Lucro Bruto', EUR(a.lucro_bruto), { alt: true })
    b.row('Impostos', EUR(a.impostos))
    b.row('Lucro Líquido', EUR(a.lucro_liquido), { alt: true })
    b.row('Retorno Total', PCT(a.retorno_total))
    b.row('Retorno Anualizado', PCT(a.retorno_anualizado), { alt: true })
    b.row('Cash-on-Cash', PCT(a.cash_on_cash))
    b.space()

    // 5. CAEP
    let caep = a.caep
    if (typeof caep === 'string') try { caep = JSON.parse(caep) } catch { caep = null }
    if (caep) {
      b.header('ESTRUTURA CAEP')
      b.row('% Somnium', PCT(caep.perc_somnium || 40), { alt: true })
      b.row('Base Distribuição', caep.base_distribuicao || 'Lucro bruto')
      if (caep.investidores && caep.investidores.length > 0) {
        b.space(4)
        const ws = [140, 90, 60, 70, 60, 60]
        b.tableHeader([['Investidor', 140], ['Capital', 90], ['%', 60], ['Lucro', 70], ['ROI', 60], ['RA', 60]])
        caep.investidores.forEach((inv, i) => {
          b.tableRow([inv.nome || `Inv. ${i+1}`, EUR(inv.capital), PCT(inv.perc), EUR(inv.lucro), PCT(inv.roi), PCT(inv.ra)], ws, i % 2 === 0)
        })
      }
      b.space()
    } else {
      b.header('MODELO DE PARCERIA')
      b.bullet('Investidor(es) passivo(s): 50% do lucro')
      b.bullet('Somnium Properties: 50% (gestão operacional + obra)')
      b.bullet('Acesso total a documentação via Google Drive')
      b.bullet('Relatórios semanais de obra com fotos e vídeos')
      b.bullet('Comunicação dedicada via Slack')
      b.space()
    }

    // 6. Stress Tests
    if (a.stress_tests) {
      let st = a.stress_tests
      if (typeof st === 'string') try { st = JSON.parse(st) } catch { st = null }
      if (st) {
        b.header('TESTES DE STRESS')
        if (st.pior) b.highlight('Pior Cenário — Lucro', EUR(st.pior.lucro_liquido), C.red)
        if (st.base) b.highlight('Cenário Base — Lucro', EUR(st.base.lucro_liquido), C.gold)
        if (st.melhor) b.highlight('Melhor Cenário — Lucro', EUR(st.melhor.lucro_liquido), C.green)
        b.space()
      }
    }

    // 7. Estratégia de saída
    b.header('ESTRATÉGIA DE SAÍDA')
    b.step(1, 'Exclusividade 15 dias para consultor original')
    b.step(2, 'Top 2-3 consultores de Coimbra')
    b.step(3, 'Ajuste de preço (-5%) após 2 meses sem venda')
    b.step(4, 'Plano B: conversão para arrendamento (estudantes)')
    b.space()

    // 8. Transparência
    b.header('TRANSPARÊNCIA E COMUNICAÇÃO')
    b.bullet('Google Drive exclusivo com toda a documentação do negócio')
    b.bullet('Canal Slack dedicado para comunicação em tempo real')
    b.bullet('Relatórios semanais de obra com fotos e vídeos')
    b.bullet('Acesso a orçamentos, faturas e contratos')
    b.bullet('Acesso vitalício aos documentos do negócio')

    // Disclaimer
    b.space()
    b.text('Os valores apresentados são estimativas conservadoras baseadas em análise de mercado e podem variar. A Somnium Properties utiliza stress tests automáticos em todos os negócios para protecção do investidor. Investimento imobiliário envolve risco de capital.', { size: 7, color: C.muted })

    return b.end()
  },

  // ── 7. RESUMO DE NEGOCIAÇÃO ───────────────────────────────
  resumo_negociacao: (im) => {
    const b = new DocBuilder('Resumo de Negociação', im.zona || '', im)
    b.header('DADOS')
    b.row('Imóvel', im.nome, { alt: true }).row('Ask Price', EUR(im.ask_price))
    b.row('Valor Proposta', EUR(im.valor_proposta), { alt: true }).row('Consultor', im.nome_consultor)
    b.space()

    for (let i = 1; i <= 4; i++) {
      b.section(`Proposta ${i}`)
      b.inputRow('Data', '', 'Valor', '')
      b.input('Resposta do Proprietário', '')
      b.input('Notas', '')
      b.space(4)
    }
    b.header('ESTADO ACTUAL')
    b.input('Ponto de situação da negociação', '', { tall: true })
    return b.end()
  },

  // ── 8. RESUMO DE ACORDO ───────────────────────────────────
  resumo_acordo: (im) => {
    const b = new DocBuilder('Resumo de Acordo', im.zona || '', im)
    b.header('TERMOS ACORDADOS')
    b.highlight('Valor Final de Compra', EUR(im.valor_proposta || im.ask_price))
    b.row('Data Proposta Aceite', FDATE(im.data_proposta_aceite), { alt: true })
    b.row('Consultor', im.nome_consultor)
    b.space()
    b.header('CONDIÇÕES DO CPCV')
    b.input('Sinal', '').input('Prazo para escritura', '')
    b.input('Condições suspensivas', '', { tall: true })
    b.input('Penalizações', '')
    b.space()
    b.header('TIMELINE')
    b.inputRow('Data CPCV', '', 'Data Escritura', '')
    b.inputRow('Início Obra', '', 'Conclusão Obra', '')
    b.input('Data Prevista Venda', '')
    b.space()
    b.header('PASSOS LEGAIS')
    ;['Validação documental', 'Licenciamento (se necessário)', 'Aprovação bancária (se financiado)', 'Assinatura CPCV', 'Escritura'].forEach(p => b.check(p))
    return b.end()
  },

  // ── 9. DOSSIER DE INVESTIMENTO (versão final = apresentação)
  dossier_investimento: (im, analise) => GENERATORS.apresentacao_investidor(im, analise),

  // ── 10. FICHA FOLLOW UP ───────────────────────────────────
  ficha_follow_up: (im) => {
    const b = new DocBuilder('Ficha de Follow Up', im.zona || '', im)
    b.header('ESTADO ACTUAL')
    b.row('Imóvel', im.nome, { alt: true }).row('Estado', (im.estado || '').replace(/^\d+-/, ''))
    b.row('Consultor', im.nome_consultor, { alt: true }).row('Data Follow Up', FDATE(im.data_follow_up))
    b.space()
    b.header('PONTO DE SITUAÇÃO')
    b.input('O que aconteceu desde o último contacto?', '', { tall: true })
    b.space()
    b.header('PRÓXIMAS AÇÕES')
    for (let i = 1; i <= 5; i++) b.check(`Ação ${i}`)
    b.inputRow('Data próximo contacto', '', 'Data limite decisão', '')
    b.input('Notas', '', { tall: true })
    return b.end()
  },

  // ── 11. FICHA CEDÊNCIA DE POSIÇÃO ─────────────────────────
  ficha_cedencia: (im) => {
    const b = new DocBuilder('Ficha de Cedência de Posição', im.zona || '', im)
    b.header('DADOS DO NEGÓCIO')
    b.row('Imóvel', im.nome, { alt: true }).row('Zona', im.zona)
    b.highlight('Valor de Entrada (compra)', EUR(im.valor_proposta || im.ask_price))
    b.inputRow('Valor de Saída (cedência)', '', 'Margem', '')
    b.space()
    b.header('COMPRADOR / CESSIONÁRIO')
    b.inputRow('Nome', '', 'Contacto', '')
    b.inputRow('Email', '', 'Capital confirmado', '')
    b.input('Data prevista cedência', '')
    b.space()
    b.header('CONDIÇÕES DA CEDÊNCIA')
    b.input('Termos e condições acordados', '', { tall: true })
    return b.end()
  },

  // ── 12. FICHA ACOMPANHAMENTO DE OBRA ──────────────────────
  ficha_acompanhamento_obra: (im) => {
    const b = new DocBuilder('Acompanhamento de Obra', im.zona || '', im)
    b.header('DADOS DO PROJECTO')
    b.row('Imóvel', im.nome, { alt: true }).row('Zona', im.zona)
    b.row('Modelo', im.modelo_negocio || 'CAEP', { alt: true }).row('Custo Estimado', EUR(im.custo_estimado_obra))
    b.inputRow('Data Início Obra', '', 'Data Prevista Conclusão', '')
    b.space()
    b.header('EMPREITEIRO')
    b.inputRow('Nome / Empresa', '', 'Contacto', '')
    b.inputRow('Orçamento acordado', '', 'Prazo acordado', '')
    b.space()

    for (let sem = 1; sem <= 4; sem++) {
      b.header(`SEMANA ${sem}`)
      b.inputRow('Data', '', 'Custos semana', '')
      b.input('Trabalhos realizados', '', { tall: true })
      b.inputRow('Custos acumulados', '', 'Problemas', '')
      b.input('Próximos trabalhos', '')
      b.space(4)
    }

    b.header('DESVIOS AO ORÇAMENTO')
    b.inputRow('Orçamento inicial', EUR(im.custo_estimado_obra), 'Custos reais acumulados', '')
    b.inputRow('Desvio (€)', '', 'Desvio (%)', '')
    b.input('Justificação do desvio', '', { tall: true })
    return b.end()
  },
}
