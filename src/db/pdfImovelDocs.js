/**
 * Gerador de documentos PDF por fase do imóvel.
 * 14 documentos automáticos com layout Somnium Properties.
 */
import PDFDocument from 'pdfkit'
import { readFileSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const LOGO_PATH = path.resolve(__dirname, '../../public/logo-transparent.png')

const GOLD = '#C9A84C'
const BLACK = '#0d0d0d'
const WHITE = '#ffffff'
const LIGHT = '#f7f6f2'
const BODY = '#333333'
const MUTED = '#888888'
const BORDER = '#e0ddd5'

const EUR = v => v == null || v === 0 ? '—' : new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(v)
const PCT = v => v == null ? '—' : `${v}%`
const DATE = () => new Date().toLocaleDateString('pt-PT', { day: '2-digit', month: 'long', year: 'numeric' })

// ── Mapeamento estado → documento ────────────────────────────
const ESTADO_DOC_MAP = {
  'Adicionado': ['ficha_imovel'],
  'Necessidade de Visita': ['ficha_pre_visita'],
  'Visita Marcada': ['checklist_visita'],
  'Estudo de VVR': ['relatorio_visita', 'analise_rentabilidade', 'estudo_comparaveis'],
  'Criar Proposta ao Proprietário': ['proposta_formal'],
  'Enviar proposta ao Proprietário': ['apresentacao_investidor'],
  'Em negociação': ['resumo_negociacao'],
  'Proposta aceite': ['resumo_acordo'],
  'Enviar proposta ao investidor': ['dossier_investimento'],
  'Follow Up após proposta': ['ficha_follow_up'],
  'Follow UP': ['ficha_follow_up'],
  'Wholesaling': ['ficha_cedencia'],
  'CAEP': ['ficha_acompanhamento_obra'],
  'Fix and Flip': ['ficha_acompanhamento_obra'],
}

export function getDocsForEstado(estado) {
  return ESTADO_DOC_MAP[estado] || []
}

export function generateDoc(tipo, imovel, analise = null) {
  const generators = {
    ficha_imovel: genFichaImovel,
    ficha_pre_visita: genFichaPreVisita,
    checklist_visita: genChecklistVisita,
    relatorio_visita: genRelatorioVisita,
    analise_rentabilidade: genAnaliseRentabilidade,
    estudo_comparaveis: genEstudoComparaveis,
    proposta_formal: genPropostaFormal,
    apresentacao_investidor: genApresentacaoInvestidor,
    resumo_negociacao: genResumoNegociacao,
    resumo_acordo: genResumoAcordo,
    dossier_investimento: genDossierInvestimento,
    ficha_follow_up: genFichaFollowUp,
    ficha_cedencia: genFichaCedencia,
    ficha_acompanhamento_obra: genFichaAcompanhamentoObra,
  }
  const gen = generators[tipo]
  if (!gen) return null
  return gen(imovel, analise)
}

// ── Helpers de layout ────────────────────────────────────────

function newDoc() {
  return new PDFDocument({ size: 'A4', autoFirstPage: false })
}

function cover(doc, title, subtitle, imovel) {
  doc.addPage({ size: 'A4', margins: { top: 0, bottom: 0, left: 0, right: 0 } })
  const pw = 595.28, ph = 841.89
  doc.rect(0, 0, pw, ph).fill(BLACK)
  doc.rect(0, 0, pw, 4).fill(GOLD)
  try { doc.image(readFileSync(LOGO_PATH), (pw - 160) / 2, 140, { width: 160 }) } catch {}
  doc.rect(pw / 2 - 25, 280, 50, 1).fill(GOLD)
  doc.fontSize(9).fillColor(GOLD).text(title.toUpperCase(), 55, 305, { width: pw - 110, align: 'center', lineBreak: false })
  doc.fontSize(24).fillColor(WHITE).text(imovel.nome || 'Imóvel', 55, 350, { width: pw - 110, align: 'center', lineBreak: false })
  doc.fontSize(10).fillColor(MUTED).text(subtitle, 55, 400, { width: pw - 110, align: 'center', lineBreak: false })
  doc.fontSize(9).fillColor(MUTED).text(DATE(), 55, 430, { width: pw - 110, align: 'center', lineBreak: false })
  doc.rect(0, ph - 50, pw, 50).fill('#1a1a1a')
  doc.rect(0, ph - 50, pw, 1).fill(GOLD).opacity(0.4)
  doc.opacity(1)
  doc.fontSize(7).fillColor(GOLD).text('SOMNIUM PROPERTIES · CONFIDENCIAL', 55, ph - 30, { width: pw - 110, align: 'center', lineBreak: false })
}

function page(doc) {
  doc.addPage({ size: 'A4', margins: { top: 50, bottom: 50, left: 55, right: 55 } })
  return 50
}

function hdr(doc, title, y) {
  doc.rect(55, y, 485, 26).fill(BLACK)
  doc.rect(55, y, 3, 26).fill(GOLD)
  doc.fontSize(8).fillColor(GOLD).text(title.toUpperCase(), 66, y + 8, { lineBreak: false })
  return y + 32
}

function sec(doc, title, y) {
  doc.fontSize(10).fillColor(BLACK).text(title, 55, y, { lineBreak: false })
  const ny = y + 14
  doc.rect(55, ny, 35, 2).fill(GOLD)
  doc.rect(92, ny + 0.5, 448, 0.5).fill(BORDER)
  return ny + 10
}

function field(doc, label, value, y, halfRight = false) {
  const x = halfRight ? 300 : 55
  const w = halfRight ? 240 : 220
  doc.fontSize(7).fillColor(MUTED).text(label.toUpperCase(), x, y, { lineBreak: false })
  doc.fontSize(10).fillColor(BODY).text(String(value || '—'), x, y + 11, { width: w })
  return Math.max(y + 28, doc.y + 4)
}

function row(doc, label, value, y, alt = false) {
  if (alt) doc.rect(55, y, 485, 24).fill(LIGHT)
  doc.fontSize(7).fillColor(MUTED).text(label.toUpperCase(), 65, y + 4, { width: 150, lineBreak: false })
  doc.fontSize(9).fillColor(BODY).text(String(value || '—'), 220, y + 4, { width: 310 })
  return Math.max(y + 24, doc.y + 2)
}

function checkbox(doc, text, y) {
  doc.rect(60, y + 2, 10, 10).lineWidth(0.5).stroke('#999999')
  doc.fontSize(9).fillColor(BODY).text(text, 78, y + 2, { width: 450 })
  return doc.y + 6
}

function blankLine(doc, label, y) {
  doc.fontSize(8).fillColor(MUTED).text(label + ':', 55, y)
  const ly = doc.y + 2
  doc.rect(55, ly, 485, 0.5).fill(BORDER)
  return ly + 16
}

function np(doc, y, needed) {
  if (y > 60 && y + needed > 780) { return page(doc) }
  return y
}

// ── 1. FICHA DO IMÓVEL ──────────────────────────────────────

function genFichaImovel(im) {
  const doc = newDoc()
  cover(doc, 'Ficha do Imóvel', im.zona || '', im)
  let y = page(doc)

  y = hdr(doc, 'INFORMAÇÃO GERAL', y)
  const fields = [
    ['Nome', im.nome], ['Estado', (im.estado || '').replace(/^\d+-/, '')],
    ['Tipologia', im.tipologia], ['Zona', im.zona],
    ['Origem', im.origem], ['Consultor', im.nome_consultor],
    ['Modelo de Negócio', im.modelo_negocio], ['Link', im.link],
    ['Data Adicionado', im.data_adicionado],
  ]
  fields.forEach(([l, v], i) => { y = row(doc, l, v, y, i % 2 === 0) })

  y += 8
  y = hdr(doc, 'VALORES', y)
  const vals = [
    ['Ask Price', EUR(im.ask_price)], ['Valor Proposta', EUR(im.valor_proposta)],
    ['Custo Estimado Obra', EUR(im.custo_estimado_obra)], ['Valor Venda Remodelado', EUR(im.valor_venda_remodelado)],
    ['ROI', PCT(im.roi)], ['ROI Anualizado', PCT(im.roi_anualizado)],
    ['Área Útil', im.area_util ? `${im.area_util} m²` : '—'], ['Área Bruta', im.area_bruta ? `${im.area_bruta} m²` : '—'],
  ]
  vals.forEach(([l, v], i) => { y = row(doc, l, v, y, i % 2 === 0) })

  if (im.notas) {
    y += 8; y = sec(doc, 'Notas', y)
    doc.fontSize(9).fillColor(BODY).text(im.notas, 55, y, { width: 485, lineGap: 3 })
  }

  doc.end(); return doc
}

// ── 2. FICHA PRÉ-VISITA ────────────────────────────────────

function genFichaPreVisita(im) {
  const doc = newDoc()
  cover(doc, 'Ficha Pré-Visita', im.zona || '', im)
  let y = page(doc)

  y = hdr(doc, 'DADOS DO IMÓVEL', y)
  ;[['Nome', im.nome], ['Tipologia', im.tipologia], ['Zona', im.zona], ['Ask Price', EUR(im.ask_price)], ['Consultor', im.nome_consultor], ['Link', im.link]]
    .forEach(([l, v], i) => { y = row(doc, l, v, y, i % 2 === 0) })

  y += 8; y = hdr(doc, 'PONTOS A AVALIAR NA VISITA', y)
  const pontos = [
    'Estado geral da estrutura (paredes, tectos, pavimentos)',
    'Telhado e cobertura — sinais de infiltração ou degradação',
    'Instalação eléctrica — quadro, tomadas, iluminação',
    'Canalização — pressão de água, esgotos, humidade',
    'Caixilharia e janelas — estado, isolamento térmico',
    'Orientação solar e luminosidade natural',
    'Acessos e estacionamento',
    'Estado das zonas comuns (se apartamento)',
    'Vizinhança e envolvente urbana',
    'Possibilidade de ampliação ou alteração de layout',
  ]
  pontos.forEach(p => { y = np(doc, y, 20); y = checkbox(doc, p, y) })

  y += 8; y = np(doc, y, 60); y = hdr(doc, 'PERGUNTAS AO PROPRIETÁRIO', y)
  const perguntas = [
    'Há quanto tempo está à venda? Motivo da venda?',
    'Valor mínimo que aceita? Margem de negociação?',
    'Algum problema estrutural ou legal conhecido?',
    'Documentação em dia? (caderneta predial, certidão permanente)',
    'Existem ónus, hipotecas ou penhoras sobre o imóvel?',
    'Área real corresponde à área registada?',
    'Alguma obra recente? Quais e quando?',
  ]
  perguntas.forEach(p => { y = np(doc, y, 20); y = checkbox(doc, p, y) })

  y += 8; y = np(doc, y, 60); y = hdr(doc, 'DOCUMENTOS A SOLICITAR', y)
  ;['Caderneta predial urbana', 'Certidão permanente do registo predial', 'Licença de utilização', 'Plantas do imóvel', 'Certificado energético', 'Declaração de dívidas ao condomínio']
    .forEach(p => { y = np(doc, y, 20); y = checkbox(doc, p, y) })

  y += 8; y = np(doc, y, 80); y = sec(doc, 'Notas da Pré-Visita', y)
  for (let i = 0; i < 8; i++) { y = blankLine(doc, '', y) }

  doc.end(); return doc
}

// ── 3. CHECKLIST DE VISITA ──────────────────────────────────

function genChecklistVisita(im) {
  const doc = newDoc()
  cover(doc, 'Checklist de Visita', `${im.zona || ''} · ${im.tipologia || ''}`, im)
  let y = page(doc)

  y = hdr(doc, 'DADOS', y)
  ;[['Imóvel', im.nome], ['Zona', im.zona], ['Data Visita', im.data_visita || '___/___/______']]
    .forEach(([l, v], i) => { y = row(doc, l, v, y, i % 2 === 0) })

  const sections = {
    'ESTRUTURA E EXTERIOR': ['Fachada — estado geral, fissuras, humidade', 'Telhado / cobertura — telhas, isolamento', 'Fundações — sinais de assentamento', 'Terraço / varanda — impermeabilização', 'Garagem / estacionamento'],
    'INTERIOR — GERAL': ['Paredes — fissuras, humidade, bolor', 'Tectos — manchas, infiltrações', 'Pavimentos — estado, nivelamento', 'Portas interiores — funcionamento', 'Armários embutidos — estado'],
    'INSTALAÇÕES': ['Quadro eléctrico — disjuntores, estado', 'Tomadas e interruptores — funcionamento', 'Iluminação — natural e artificial', 'Canalização — pressão água quente e fria', 'Esgotos — cheiros, escoamento', 'Aquecimento — sistema, estado', 'Gás — instalação, segurança'],
    'COZINHA E WC': ['Cozinha — bancada, armários, equipamentos', 'Casa de banho — louças, torneiras, ventilação', 'Azulejos — estado, infiltrações atrás'],
    'ENVOLVENTE': ['Vizinhança — ruído, segurança, comércio', 'Transportes públicos — proximidade', 'Escolas / hospitais / serviços', 'Orientação solar — manhã/tarde', 'Estacionamento zona'],
  }

  for (const [secTitle, items] of Object.entries(sections)) {
    y += 6; y = np(doc, y, 40); y = sec(doc, secTitle, y)
    items.forEach(item => { y = np(doc, y, 18); y = checkbox(doc, item, y) })
  }

  y += 8; y = np(doc, y, 80); y = sec(doc, 'Impressão Geral', y)
  for (let i = 0; i < 6; i++) y = blankLine(doc, '', y)

  y += 4; y = np(doc, y, 40); y = sec(doc, 'Decisão', y)
  ;['Avançar para estudo de mercado', 'Necessita segunda visita', 'Descartar — motivo:'].forEach(p => { y = checkbox(doc, p, y) })

  doc.end(); return doc
}

// ── 4a. RELATÓRIO DE VISITA ─────────────────────────────────

function genRelatorioVisita(im) {
  const doc = newDoc()
  cover(doc, 'Relatório de Visita', im.zona || '', im)
  let y = page(doc)

  y = hdr(doc, 'DADOS DA VISITA', y)
  ;[['Imóvel', im.nome], ['Zona', im.zona], ['Tipologia', im.tipologia], ['Data Visita', im.data_visita || '—'], ['Consultor', im.nome_consultor]]
    .forEach(([l, v], i) => { y = row(doc, l, v, y, i % 2 === 0) })

  y += 8; y = sec(doc, 'Estado Real do Imóvel', y)
  for (let i = 0; i < 6; i++) y = blankLine(doc, '', y)

  y += 4; y = sec(doc, 'Obras Necessárias Identificadas', y)
  for (let i = 0; i < 6; i++) y = blankLine(doc, '', y)

  y = np(doc, y, 80)
  y += 4; y = sec(doc, 'Estimativa de Custos de Obra', y)
  ;['Demolições e remoção', 'Estrutura / alvenaria', 'Canalização', 'Electricidade', 'Revestimentos / acabamentos', 'Cozinha e WC', 'Caixilharia', 'Pintura', 'Outros']
    .forEach(item => { y = np(doc, y, 18); y = blankLine(doc, item, y) })

  y = np(doc, y, 60)
  y += 4; y = sec(doc, 'Impressões e Decisão', y)
  ;['GO — Avançar para análise de rentabilidade', 'SEGUNDA VISITA — Necessita validação adicional', 'NO GO — Descartar (motivo abaixo)'].forEach(p => { y = checkbox(doc, p, y) })
  y += 4; for (let i = 0; i < 3; i++) y = blankLine(doc, '', y)

  doc.end(); return doc
}

// ── 4b. ANÁLISE DE RENTABILIDADE ────────────────────────────

function genAnaliseRentabilidade(im, analise) {
  const doc = newDoc()
  cover(doc, 'Análise de Rentabilidade', im.zona || '', im)
  let y = page(doc)

  y = hdr(doc, 'DADOS DO NEGÓCIO', y)
  const dados = [
    ['Imóvel', im.nome], ['Zona', im.zona], ['Tipologia', im.tipologia],
    ['Ask Price', EUR(im.ask_price)], ['Valor Proposta', EUR(im.valor_proposta)],
    ['Custo Estimado Obra', EUR(im.custo_estimado_obra)], ['Valor Venda Remodelado', EUR(im.valor_venda_remodelado)],
  ]
  dados.forEach(([l, v], i) => { y = row(doc, l, v, y, i % 2 === 0) })

  y += 8; y = hdr(doc, 'ANÁLISE FINANCEIRA', y)
  const compra = im.ask_price || im.valor_proposta || 0
  const obra = im.custo_estimado_obra || 0
  const vvr = im.valor_venda_remodelado || 0
  const totalInv = compra + obra
  const lucro = vvr - totalInv
  const roi = totalInv > 0 ? ((lucro / totalInv) * 100).toFixed(1) : '—'

  ;[['Investimento Total', EUR(totalInv)], ['Lucro Estimado', EUR(lucro)], ['ROI', `${roi}%`], ['ROI CRM', PCT(im.roi)], ['ROI Anualizado CRM', PCT(im.roi_anualizado)]]
    .forEach(([l, v], i) => { y = row(doc, l, v, y, i % 2 === 0) })

  y += 8; y = hdr(doc, 'TESTES DE STRESS', y)
  const scenarios = [
    { nome: 'Cenário Base', vendaAdj: 1.0, obraAdj: 1.0 },
    { nome: 'Cenário Moderado (-5% venda, +10% obra)', vendaAdj: 0.95, obraAdj: 1.10 },
    { nome: 'Cenário Severo (-10% venda, +20% obra)', vendaAdj: 0.90, obraAdj: 1.20 },
  ]
  for (const sc of scenarios) {
    const v = vvr * sc.vendaAdj
    const o = obra * sc.obraAdj
    const inv = compra + o
    const l = v - inv
    const r = inv > 0 ? ((l / inv) * 100).toFixed(1) : '—'
    y = np(doc, y, 26)
    y = row(doc, sc.nome, `Venda: ${EUR(v)} | Obra: ${EUR(o)} | Lucro: ${EUR(l)} | ROI: ${r}%`, y, true)
  }

  if (analise) {
    y += 8; y = np(doc, y, 60); y = sec(doc, 'Dados da Calculadora', y)
    const aC = [
      ['Compra', EUR(analise.compra)], ['VVR', EUR(analise.vvr)], ['Obra', EUR(analise.obra)],
      ['Capital Necessário', EUR(analise.capital_necessario)], ['Lucro Líquido', EUR(analise.lucro_liquido)],
      ['Retorno Total', PCT(analise.retorno_total)], ['Retorno Anualizado', PCT(analise.retorno_anualizado)],
    ]
    aC.forEach(([l, v], i) => { y = row(doc, l, v, y, i % 2 === 0) })
  }

  doc.end(); return doc
}

// ── 4c. ESTUDO DE COMPARÁVEIS ───────────────────────────────

function genEstudoComparaveis(im) {
  const doc = newDoc()
  cover(doc, 'Estudo de Mercado — Comparáveis', im.zona || '', im)
  let y = page(doc)

  y = hdr(doc, 'IMÓVEL EM ANÁLISE', y)
  ;[['Nome', im.nome], ['Zona', im.zona], ['Tipologia', im.tipologia], ['VVR Estimado', EUR(im.valor_venda_remodelado)]]
    .forEach(([l, v], i) => { y = row(doc, l, v, y, i % 2 === 0) })

  y += 8; y = hdr(doc, 'COMPARÁVEIS IDENTIFICADOS', y)
  for (let i = 1; i <= 5; i++) {
    y = np(doc, y, 100)
    y = sec(doc, `Comparável ${i}`, y)
    ;['Endereço / Zona', 'Tipologia', 'Área (m²)', 'Valor de Venda', 'Valor por m²', 'Data de Venda', 'Fonte (Idealista, Imovirtual, etc.)', 'Notas']
      .forEach(l => { y = blankLine(doc, l, y) })
    y += 4
  }

  y = np(doc, y, 80)
  y += 4; y = sec(doc, 'Análise e Conclusão', y)
  for (let i = 0; i < 6; i++) y = blankLine(doc, '', y)

  doc.end(); return doc
}

// ── 5. PROPOSTA FORMAL AO PROPRIETÁRIO ──────────────────────

function genPropostaFormal(im) {
  const doc = newDoc()
  cover(doc, 'Proposta ao Proprietário', im.zona || '', im)
  let y = page(doc)

  y = hdr(doc, 'DADOS DO IMÓVEL', y)
  ;[['Imóvel', im.nome], ['Zona', im.zona], ['Consultor', im.nome_consultor], ['Ask Price', EUR(im.ask_price)]]
    .forEach(([l, v], i) => { y = row(doc, l, v, y, i % 2 === 0) })

  y += 8; y = hdr(doc, 'PROPOSTA', y)
  ;[['Valor Proposto', EUR(im.valor_proposta)], ['Condições de Pagamento', '—'], ['Prazo para CPCV', '—'], ['Prazo para Escritura', '—'], ['Condições Especiais', '—']]
    .forEach(([l, v], i) => { y = row(doc, l, v, y, i % 2 === 0) })

  y += 8; y = sec(doc, 'Justificação do Valor', y)
  for (let i = 0; i < 5; i++) y = blankLine(doc, '', y)

  y += 4; y = sec(doc, 'Notas', y)
  if (im.notas) { doc.fontSize(9).fillColor(BODY).text(im.notas, 55, y, { width: 485, lineGap: 3 }) }

  doc.end(); return doc
}

// ── 6. APRESENTAÇÃO AO INVESTIDOR ───────────────────────────

function genApresentacaoInvestidor(im, analise) {
  const doc = newDoc()
  cover(doc, 'Apresentação ao Investidor', `Oportunidade de Investimento · ${im.zona || ''}`, im)
  let y = page(doc)

  y = hdr(doc, 'OPORTUNIDADE DE INVESTIMENTO', y)
  ;[['Imóvel', im.nome], ['Zona', im.zona], ['Tipologia', im.tipologia], ['Modelo', im.modelo_negocio || 'CAEP 50/50']]
    .forEach(([l, v], i) => { y = row(doc, l, v, y, i % 2 === 0) })

  y += 8; y = hdr(doc, 'NÚMEROS DO NEGÓCIO', y)
  const compra = im.valor_proposta || im.ask_price || 0
  const obra = im.custo_estimado_obra || 0
  const vvr = im.valor_venda_remodelado || 0
  ;[['Valor de Aquisição', EUR(compra)], ['Custo de Obra', EUR(obra)], ['Investimento Total', EUR(compra + obra)], ['Valor Venda (conservador)', EUR(vvr)], ['Lucro Estimado', EUR(vvr - compra - obra)], ['ROI', PCT(im.roi)]]
    .forEach(([l, v], i) => { y = row(doc, l, v, y, i % 2 === 0) })

  y += 8; y = sec(doc, 'Modelo de Parceria', y)
  doc.fontSize(9).fillColor(BODY).text('Contrato de Associação em Participação (CAEP)\n• Investidor(es) passivo(s): 50% do lucro\n• Somnium Properties: 50% (gestão operacional + obra)\n• Acesso total a documentação via Google Drive\n• Relatórios semanais de obra\n• Plano B: arrendamento a estudantes', 55, y, { width: 485, lineGap: 4 })
  y = doc.y + 8

  y = np(doc, y, 80)
  y = sec(doc, 'Testes de Stress', y)
  for (const [label, adj] of [['Cenário Base', 1.0], ['Moderado (-5%)', 0.95], ['Severo (-10%)', 0.90]]) {
    const v = vvr * adj, l = v - compra - obra
    y = row(doc, label, `Venda: ${EUR(v)} → Lucro: ${EUR(l)}`, y, adj === 0.95)
  }

  y += 8; y = np(doc, y, 40); y = sec(doc, 'Estratégia de Saída', y)
  doc.fontSize(9).fillColor(BODY).text('1. Exclusividade 15 dias para consultor original\n2. Top consultores de Coimbra\n3. Ajuste de preço (-5%) após 2 meses\n4. Conversão para arrendamento (Plano B)', 55, y, { width: 485, lineGap: 3 })

  doc.end(); return doc
}

// ── 7. RESUMO DE NEGOCIAÇÃO ─────────────────────────────────

function genResumoNegociacao(im) {
  const doc = newDoc()
  cover(doc, 'Resumo de Negociação', im.zona || '', im)
  let y = page(doc)

  y = hdr(doc, 'DADOS', y)
  ;[['Imóvel', im.nome], ['Ask Price', EUR(im.ask_price)], ['Valor Proposta', EUR(im.valor_proposta)], ['Consultor', im.nome_consultor]]
    .forEach(([l, v], i) => { y = row(doc, l, v, y, i % 2 === 0) })

  y += 8; y = hdr(doc, 'HISTÓRICO DE PROPOSTAS', y)
  for (let i = 1; i <= 4; i++) {
    y = np(doc, y, 50)
    y = sec(doc, `Proposta ${i}`, y)
    ;['Data', 'Valor', 'Resposta do Proprietário', 'Notas'].forEach(l => { y = blankLine(doc, l, y) })
    y += 4
  }

  y = np(doc, y, 60)
  y += 4; y = sec(doc, 'Estado Actual da Negociação', y)
  for (let i = 0; i < 4; i++) y = blankLine(doc, '', y)

  doc.end(); return doc
}

// ── 8. RESUMO DE ACORDO ─────────────────────────────────────

function genResumoAcordo(im) {
  const doc = newDoc()
  cover(doc, 'Resumo de Acordo', im.zona || '', im)
  let y = page(doc)

  y = hdr(doc, 'TERMOS ACORDADOS', y)
  ;[['Imóvel', im.nome], ['Valor Final de Compra', EUR(im.valor_proposta || im.ask_price)], ['Data Proposta Aceite', im.data_proposta_aceite || '—'], ['Consultor', im.nome_consultor]]
    .forEach(([l, v], i) => { y = row(doc, l, v, y, i % 2 === 0) })

  y += 8; y = sec(doc, 'Condições do CPCV', y)
  ;['Sinal', 'Prazo para escritura', 'Condições suspensivas', 'Responsabilidade de custos', 'Penalizações'].forEach(l => { y = blankLine(doc, l, y) })

  y += 4; y = np(doc, y, 60); y = sec(doc, 'Timeline', y)
  ;['Data CPCV', 'Data prevista escritura', 'Data início obra', 'Data prevista conclusão obra', 'Data prevista venda'].forEach(l => { y = blankLine(doc, l, y) })

  y += 4; y = np(doc, y, 60); y = sec(doc, 'Passos Legais Pendentes', y)
  ;['Validação documental', 'Licenciamento (se necessário)', 'Aprovação bancária (se financiado)', 'Assinatura CPCV', 'Escritura'].forEach(p => { y = checkbox(doc, p, y) })

  doc.end(); return doc
}

// ── 9. DOSSIER DE INVESTIMENTO ──────────────────────────────

function genDossierInvestimento(im, analise) {
  // Combina ficha + análise + modelo numa versão final
  return genApresentacaoInvestidor(im, analise)
}

// ── 10. FICHA FOLLOW UP ─────────────────────────────────────

function genFichaFollowUp(im) {
  const doc = newDoc()
  cover(doc, 'Ficha de Follow Up', im.zona || '', im)
  let y = page(doc)

  y = hdr(doc, 'ESTADO ACTUAL', y)
  ;[['Imóvel', im.nome], ['Estado', (im.estado || '').replace(/^\d+-/, '')], ['Consultor', im.nome_consultor], ['Data Follow Up', im.data_follow_up || '—']]
    .forEach(([l, v], i) => { y = row(doc, l, v, y, i % 2 === 0) })

  y += 8; y = sec(doc, 'Ponto de Situação', y)
  for (let i = 0; i < 5; i++) y = blankLine(doc, '', y)

  y += 4; y = sec(doc, 'Próximas Ações', y)
  for (let i = 1; i <= 5; i++) { y = checkbox(doc, `Ação ${i}: _______________________________________________`, y) }

  y += 4; y = sec(doc, 'Datas', y)
  ;['Data próximo contacto', 'Data limite para decisão', 'Notas'].forEach(l => { y = blankLine(doc, l, y) })

  doc.end(); return doc
}

// ── 11. FICHA CEDÊNCIA DE POSIÇÃO ───────────────────────────

function genFichaCedencia(im) {
  const doc = newDoc()
  cover(doc, 'Ficha de Cedência de Posição', im.zona || '', im)
  let y = page(doc)

  y = hdr(doc, 'DADOS DO NEGÓCIO', y)
  ;[['Imóvel', im.nome], ['Zona', im.zona], ['Valor de Entrada (compra)', EUR(im.valor_proposta || im.ask_price)], ['Valor de Saída (cedência)', '—'], ['Margem', '—']]
    .forEach(([l, v], i) => { y = row(doc, l, v, y, i % 2 === 0) })

  y += 8; y = sec(doc, 'Comprador / Cessionário', y)
  ;['Nome', 'Contacto', 'Email', 'Capital confirmado', 'Data prevista cedência'].forEach(l => { y = blankLine(doc, l, y) })

  y += 4; y = sec(doc, 'Condições da Cedência', y)
  for (let i = 0; i < 4; i++) y = blankLine(doc, '', y)

  doc.end(); return doc
}

// ── 12. FICHA ACOMPANHAMENTO DE OBRA ────────────────────────

function genFichaAcompanhamentoObra(im) {
  const doc = newDoc()
  cover(doc, 'Ficha de Acompanhamento de Obra', im.zona || '', im)
  let y = page(doc)

  y = hdr(doc, 'DADOS DO PROJECTO', y)
  ;[['Imóvel', im.nome], ['Zona', im.zona], ['Modelo', im.modelo_negocio || 'CAEP'], ['Custo Estimado Obra', EUR(im.custo_estimado_obra)], ['Data Início Obra', '—'], ['Data Prevista Conclusão', '—']]
    .forEach(([l, v], i) => { y = row(doc, l, v, y, i % 2 === 0) })

  y += 8; y = sec(doc, 'Empreiteiro', y)
  ;['Nome / Empresa', 'Contacto', 'Orçamento acordado', 'Prazo acordado'].forEach(l => { y = blankLine(doc, l, y) })

  y += 4; y = np(doc, y, 120); y = hdr(doc, 'RELATÓRIO SEMANAL', y)
  for (let sem = 1; sem <= 4; sem++) {
    y = np(doc, y, 80)
    y = sec(doc, `Semana ${sem}`, y)
    ;['Data', 'Trabalhos realizados', 'Custos da semana', 'Custos acumulados', 'Problemas identificados', 'Próximos trabalhos'].forEach(l => { y = blankLine(doc, l, y) })
    y += 4
  }

  y = np(doc, y, 40)
  y += 4; y = sec(doc, 'Desvios ao Orçamento', y)
  ;['Orçamento inicial', 'Custos reais acumulados', 'Desvio (€)', 'Desvio (%)', 'Justificação'].forEach(l => { y = blankLine(doc, l, y) })

  doc.end(); return doc
}
