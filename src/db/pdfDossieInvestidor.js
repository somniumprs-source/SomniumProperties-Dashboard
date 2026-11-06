/**
 * Dossiê de Investidor (SOP 12, 8.7): documento consolidado de entrada de um
 * investidor num projecto. Capa, identificação (KYC), investimento, registo
 * de conformidade da Pré-aquisição e índice, seguidos dos anexos reais (CC,
 * comprovativos, certidão, CAEP assinado, parecer) juntos num só PDF.
 *
 * Código partilhado: este ficheiro é copiado tal e qual para
 * supabase/functions/_shared/pdfDossieInvestidor.ts (só muda a 1.ª linha).
 * Sem imports: pdfkit, pdf-lib, logótipo e cores chegam por injecção, para o
 * mesmo corpo correr em Node (Express) e em Deno (Edge Functions).
 */

const ROTULOS_DOC = {
  identificacao: 'Identificação (CC / Passaporte)',
  certidao_permanente: 'Certidão Permanente / Registo Comercial',
  comprovativo_morada: 'Comprovativo de morada',
  procuracao: 'Procuração',
  nda_assinado: 'NDA assinado',
  declaracao_risco: 'Declaração de risco',
  comprovativo_fundos: 'Declaração de origem dos fundos',
  contrato_assinado: 'Contrato assinado',
  comprovativo_transferencia: 'Comprovativo de transferência do capital',
}
// Documentos que só valem para o projecto em causa (mesma regra do checklist).
const POR_PROJETO = new Set(['declaracao_risco', 'comprovativo_fundos', 'contrato_assinado', 'comprovativo_transferencia'])

function json(v) {
  if (!v) return null
  if (typeof v === 'object') return v
  try { return JSON.parse(v) } catch { return null }
}
const txt = (v) => (v == null || String(v).trim() === '' ? '' : String(v).trim())
const DATA = (v) => (v ? new Date(v).toLocaleDateString('pt-PT') : '')
const EUR = (v) => new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2 }).format(Number(v) || 0)

// ── Dados ────────────────────────────────────────────────────
export async function carregarDadosDossie(pool, negocioId, investidorId) {
  const { rows: [negocio] } = await pool.query('SELECT * FROM negocios WHERE id = $1', [negocioId])
  if (!negocio) throw Object.assign(new Error('Projecto não encontrado'), { status: 404 })
  const { rows: [ligacao] } = await pool.query(
    'SELECT * FROM projeto_investidores WHERE negocio_id = $1 AND investidor_id = $2', [negocioId, investidorId])
  if (!ligacao) throw Object.assign(new Error('Investidor não está ligado a este projecto'), { status: 404 })
  const { rows: [investidor] } = await pool.query('SELECT * FROM investidores WHERE id = $1', [investidorId])
  const { rows: [imovel] } = negocio.imovel_id
    ? await pool.query('SELECT * FROM imoveis WHERE id = $1', [negocio.imovel_id])
    : { rows: [null] }
  const { rows: fases } = await pool.query(
    'SELECT id, fase_key, nome, ordem FROM projeto_fases WHERE negocio_id = $1 ORDER BY ordem', [negocioId])
  const fase = fases.find(f => f.fase_key === 'pre_aquisicao') || null
  const { rows: tarefas } = fase
    ? await pool.query('SELECT id, descricao, concluida, checklist, ordem, ativa FROM projeto_tarefas WHERE fase_id = $1 ORDER BY ordem', [fase.id])
    : { rows: [] }
  const { rows: docsInvestidor } = await pool.query(
    `SELECT * FROM documentos_investidor WHERE investidor_id = $1 AND storage_path IS NOT NULL
     ORDER BY created_at DESC`, [investidorId])
  const { rows: docsProjeto } = await pool.query(
    'SELECT * FROM projeto_documentos WHERE negocio_id = $1 ORDER BY created_at', [negocioId])
  return { negocio, ligacao, investidor, imovel, fase, tarefas, docsInvestidor, docsProjeto }
}

// Anexos a incorporar, por ordem: documentos do investidor (o mais recente de
// cada tipo, sem duplicar o mesmo ficheiro) e depois os do projecto (CAEP e os
// documentos ligados aos itens do checklist da Pré-aquisição).
export function escolherAnexos(dados) {
  const { investidorId, negocio, docsInvestidor, docsProjeto, tarefas } = { ...dados, investidorId: dados.investidor?.id }
  const anexos = []
  const nomesVistos = new Set()
  const empresa = json(dados.investidor?.dados_empresa)
  const tipos = Object.keys(ROTULOS_DOC)
  if (empresa && (txt(empresa.firma) || txt(empresa.nipc))) tipos.sort((a, b) => (b === 'certidao_permanente') - (a === 'certidao_permanente'))
  for (const tipo of tipos) {
    const d = docsInvestidor.find(x => x.tipo === tipo && (x.direcao || 'enviado') === 'recebido'
      && (!POR_PROJETO.has(tipo) || !x.imovel_id || x.imovel_id === negocio.imovel_id))
    if (!d) continue
    const chave = String(d.nome || '').toLowerCase()
    if (nomesVistos.has(chave)) continue
    nomesVistos.add(chave)
    anexos.push({ origem: 'investidor', titulo: ROTULOS_DOC[tipo], nome: d.nome, storage_path: d.storage_path, data: d.created_at })
  }
  const idsProjeto = new Set()
  for (const t of tarefas) {
    const ch = json(t.checklist)
    for (const e of Object.values(ch?.estado || {})) if (e?.doc?.id) idsProjeto.add(e.doc.id)
  }
  for (const d of docsProjeto) {
    const caep = /caep|associa[cç][aã]o em participa/i.test(d.nome || '')
    if (!caep && !idsProjeto.has(d.id)) continue
    anexos.push({
      origem: 'projeto',
      titulo: caep ? 'Contrato de Associação em Participação (CAEP)' : (d.tipo === 'relatorio' ? 'Parecer / relatório' : 'Documento do projecto'),
      nome: d.nome, url: d.url, data: d.created_at,
    })
  }
  return anexos
}

// Registo de conformidade: itens dos checklists da Pré-aquisição que dizem
// respeito ao investidor (os por investidor e os do CAEP e do capital).
export function registoConformidade(dados) {
  const invId = dados.investidor.id
  const linhas = []
  for (const t of dados.tarefas) {
    if (t.ativa === 0 || t.ativa === false) continue
    const ch = json(t.checklist)
    if (/dossi/i.test(t.descricao || '')) continue
    const relevante = ch?.por_investidor || /caep|minuta|capital/i.test(t.descricao || '')
    if (!relevante) continue
    if (!ch?.itens?.length) {
      linhas.push({ grupo: t.descricao, item: t.descricao, estado: t.concluida ? 'Concluído' : 'Pendente', registo: '' })
      continue
    }
    for (const it of ch.itens) {
      if (it.obrigatoria === false) continue
      const chave = ch.por_investidor ? `${invId}:${it.k}` : it.k
      const e = ch.estado?.[chave]
      let estado = 'Pendente'
      let registo = ''
      if (e?.feito && e.na) { estado = 'Não aplicável'; registo = e.na }
      else if (e?.feito) estado = 'Concluído'
      else if (t.concluida) estado = 'Concluído (tarefa fechada)'
      const autor = [e?.por, DATA(e?.em)].filter(Boolean).join(', ')
      if (autor) registo = registo ? `${registo} (${autor})` : autor
      if (e?.nota && e.nota !== e.na) registo = registo ? `${registo}. ${e.nota}` : e.nota
      linhas.push({ grupo: t.descricao, item: it.t, estado, registo })
    }
  }
  return linhas
}

// ── PDF ──────────────────────────────────────────────────────
function paraBytes(doc) {
  return new Promise((resolve, reject) => {
    const partes = []
    doc.on('data', (c) => partes.push(new Uint8Array(c)))
    doc.on('end', () => {
      const total = partes.reduce((s, p) => s + p.length, 0)
      const out = new Uint8Array(total)
      let o = 0
      for (const p of partes) { out.set(p, o); o += p.length }
      resolve(out)
    })
    doc.on('error', reject)
    doc.end()
  })
}

function tipoFicheiro(b) {
  if (!b || b.length < 4) return null
  if (b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46) return 'pdf'
  if (b[0] === 0xff && b[1] === 0xd8) return 'jpg'
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'png'
  return null
}

/**
 * deps = { PDFDocument (pdfkit), PDFLib (pdf-lib), logo (PNG para fundo preto), cores (DOC_COLORS) }
 * baixar = async (anexo) => Uint8Array | null
 */
export async function gerarDossieInvestidor(dados, { deps, baixar }) {
  const { PDFDocument, PDFLib, logo, cores } = deps
  const GOLD = cores.gold, BLACK = cores.black, TEXT = cores.body, MUTED = cores.muted, LINE = cores.border
  const { negocio, ligacao, investidor, imovel } = dados
  const empresa = json(investidor.dados_empresa)
  const titular = json(investidor.titular_capital)
  const temEmpresa = !!(empresa && (txt(empresa.firma) || txt(empresa.nipc)))
  const temTitular = !!(titular && txt(titular.nome))

  // 1) Descarregar anexos primeiro: o índice indica as páginas de cada um.
  const anexos = escolherAnexos(dados)
  for (const a of anexos) {
    try {
      a.bytes = await baixar(a)
      a.formato = tipoFicheiro(a.bytes)
      if (a.formato === 'pdf') {
        const src = await PDFLib.PDFDocument.load(a.bytes, { ignoreEncryption: true })
        a.paginas = src.getPageCount()
        a.src = src
      } else if (a.formato) a.paginas = 1
      else a.erro = 'formato não suportado para incorporação'
    } catch (e) { a.erro = 'ficheiro indisponível' }
  }
  // O mesmo ficheiro carregado em dois tipos (ex.: certidão também como
  // identificação) entra uma só vez, com os dois rótulos.
  const vistos = new Map()
  for (const a of anexos) {
    if (a.erro || !a.bytes) continue
    let h = 2166136261
    for (let i = 0; i < a.bytes.length; i += 7) h = Math.imul(h ^ a.bytes[i], 16777619)
    const k = `${a.bytes.length}:${h >>> 0}`
    const orig = vistos.get(k)
    if (orig) { orig.titulo = `${orig.titulo} (também registado como ${a.titulo})`; a.duplicado = true }
    else vistos.set(k, a)
  }
  for (let i = anexos.length - 1; i >= 0; i--) if (anexos[i].duplicado) anexos.splice(i, 1)
  const incorporados = anexos.filter(a => !a.erro)

  // 2) Corpo do dossiê (pdfkit)
  const doc = new PDFDocument({ size: 'A4', margins: { top: 50, bottom: 60, left: 50, right: 50 }, bufferPages: true,
    info: { Title: `Dossiê de Investidor - ${investidor.nome}`, Author: 'Somnium Properties' } })
  const W = doc.page.width - 100

  function header(titulo, sub) {
    doc.rect(0, 0, doc.page.width, 100).fill(BLACK)
    try { if (logo) doc.image(logo, 50, 30, { height: 40 }) } catch { /* sem logo */ }
    doc.fillColor('white').font('Helvetica-Bold').fontSize(11).text(titulo.toUpperCase(), 170, 38, { width: doc.page.width - 220 })
    if (sub) doc.fillColor(cores.mutedLight || '#cccccc').font('Helvetica').fontSize(8).text(sub, 170, 56, { width: doc.page.width - 220 })
    doc.moveTo(0, 100).lineTo(doc.page.width, 100).lineWidth(3).strokeColor(GOLD).stroke()
    doc.x = 50; doc.y = 120
  }
  function garantir(h) { if (doc.y + h > doc.page.height - 70) { doc.addPage(); doc.y = 50 } }
  function secao(t) {
    garantir(60)
    doc.moveDown(0.6)
    doc.fillColor(BLACK).font('Helvetica-Bold').fontSize(11).text(t.toUpperCase(), 50, doc.y, { width: W })
    doc.moveTo(50, doc.y + 2).lineTo(50 + W, doc.y + 2).lineWidth(1).strokeColor(GOLD).stroke()
    doc.moveDown(0.6)
  }
  function sub(t) {
    garantir(40)
    doc.moveDown(0.3)
    doc.fillColor(BLACK).font('Helvetica-Bold').fontSize(9.5).text(t, 50, doc.y, { width: W })
    doc.moveDown(0.25)
  }
  function kv(label, valor) {
    const v = txt(valor)
    if (!v) return
    doc.font('Helvetica').fontSize(9)
    const h = Math.max(doc.heightOfString(v, { width: W - 160 }), 12)
    garantir(h + 4)
    const y = doc.y
    doc.fillColor(MUTED).font('Helvetica').fontSize(8.5).text(label, 50, y, { width: 150 })
    doc.fillColor(TEXT).font('Helvetica').fontSize(9).text(v, 210, y, { width: W - 160 })
    doc.y = y + h + 4
  }
  function paragrafo(t, opts = {}) {
    doc.fillColor(opts.cor || TEXT).font(opts.bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(opts.size || 9)
    garantir(doc.heightOfString(t, { width: W }) + 4)
    doc.text(t, 50, doc.y, { width: W, align: opts.align || 'left' })
    doc.moveDown(0.4)
  }
  function pessoa(p) {
    kv('Nome', p.nome)
    kv('Estado civil', p.estado_civil)
    kv('Naturalidade', p.naturalidade)
    kv('NIF', p.nif)
    kv('Cartão de Cidadão', [txt(p.cartao_cidadao), txt(p.cartao_cidadao_validade) && `válido até ${txt(p.cartao_cidadao_validade)}`].filter(Boolean).join(', '))
    kv('Residência', p.morada)
    kv('Email', p.email)
    kv('IBAN', p.iban)
  }

  // Capa
  doc.rect(0, 0, doc.page.width, doc.page.height).fill(BLACK)
  try { if (logo) doc.image(logo, 50, 60, { height: 46 }) } catch { /* sem logo */ }
  doc.fillColor(GOLD).font('Helvetica').fontSize(10).text('DOCUMENTO CONFIDENCIAL · ACESSO RESTRITO', 50, 300, { width: W, characterSpacing: 1 })
  doc.fillColor('white').font('Helvetica-Bold').fontSize(30).text('Dossiê de Investidor', 50, 325, { width: W })
  doc.moveTo(50, doc.y + 8).lineTo(170, doc.y + 8).lineWidth(3).strokeColor(GOLD).stroke()
  doc.fillColor('white').font('Helvetica-Bold').fontSize(16).text(temEmpresa ? txt(empresa.firma) : investidor.nome, 50, doc.y + 24, { width: W })
  if (temEmpresa) doc.fillColor('#bbbbbb').font('Helvetica').fontSize(10).text(`Investidor: ${investidor.nome}`, 50, doc.y + 4, { width: W })
  if (temTitular) doc.fillColor('#bbbbbb').font('Helvetica').fontSize(10).text(`Titular do capital: ${titular.nome}`, 50, doc.y + 4, { width: W })
  doc.fillColor('#bbbbbb').font('Helvetica').fontSize(10)
    .text(`Projecto: ${negocio.movimento || ''}`, 50, 640, { width: W })
    .text(`Modelo: ${negocio.categoria || ''}`, 50, doc.y + 2, { width: W })
    .text(`Emitido em ${new Date().toLocaleDateString('pt-PT')}`, 50, doc.y + 2, { width: W })
  if (txt(investidor.ref_investidor)) doc.text(`Ref. ${investidor.ref_investidor}`, 50, doc.y + 2, { width: W })

  // 1. Identificação
  doc.addPage()
  header('Dossiê de Investidor', `${negocio.movimento || ''} · ${investidor.nome}`)
  secao('1. Identificação do investidor (KYC)')
  if (temEmpresa) {
    sub('Entidade')
    kv('Firma', empresa.firma)
    kv('Forma jurídica', empresa.forma_juridica)
    kv('NIPC', empresa.nipc)
    kv('NISS', empresa.niss)
    kv('Capital social', empresa.capital_social)
    kv('Sede', empresa.sede)
    kv('Email', empresa.email_empresa)
    kv('IBAN', empresa.iban)
    const socios = Array.isArray(empresa.socios) ? empresa.socios.filter(s => txt(s.nome)) : []
    socios.forEach((s, i) => { sub(`Representante legal ${socios.length > 1 ? i + 1 : ''}`.trim()); pessoa(s) })
    sub('Contacto no CRM')
  } else if (!temTitular) {
    sub('Pessoa singular')
  } else {
    sub('Investidor (representante)')
  }
  kv('Nome', investidor.nome)
  kv('Email', investidor.email)
  kv('Telemóvel', investidor.telemovel)
  kv('Origem do capital', investidor.origem_capital)
  if (temTitular) {
    sub('Titular do capital')
    if (txt(titular.relacao)) paragrafo(titular.relacao, { cor: MUTED, size: 8.5 })
    pessoa(titular)
  }

  // 2. Investimento
  secao('2. Investimento')
  kv('Projecto', negocio.movimento)
  kv('Imóvel', imovel ? [txt(imovel.nome), txt(imovel.zona)].filter(Boolean).join(' · ') : '')
  kv('Modelo', negocio.categoria)
  kv('Capital investido', EUR(ligacao.capital))
  const perc = Number(ligacao.percentagem) || 0
  if (perc) {
    if (negocio.categoria === 'CAEP') {
      const somnium = negocio.comissao_pct != null && negocio.comissao_pct !== '' ? Number(negocio.comissao_pct) : 40
      const quota = Math.round(((100 - somnium) * perc / 100) * 100) / 100
      kv('Participação', `${perc}% da parte dos investidores, ou seja ${quota}% do lucro do projecto (Somnium ${somnium}%)`)
    } else kv('Participação', `${perc}%`)
  }
  const caep = anexos.find(a => /CAEP/.test(a.titulo))
  if (caep) kv('Contrato', `${caep.nome}, arquivado em ${DATA(caep.data)}`)

  // 3. Conformidade
  secao('3. Registo de conformidade (Pré-aquisição)')
  paragrafo('Estado de cada item do checklist da Pré-aquisição aplicável a este investidor, tal como registado no CRM, com o motivo dos itens dados como não aplicáveis e o responsável pelo registo.', { cor: MUTED, size: 8.5 })
  const linhas = registoConformidade(dados)
  const cI = 215, cE = 95, cR = W - cI - cE
  let grupo = null
  for (const l of linhas) {
    if (l.grupo !== grupo) {
      grupo = l.grupo
      garantir(40)
      doc.moveDown(0.2)
      doc.rect(50, doc.y, W, 16).fill(cores.tableHeaderBg || '#EFE6C8')
      doc.fillColor(BLACK).font('Helvetica-Bold').fontSize(8.5).text(grupo, 56, doc.y + 4, { width: W - 12 })
      doc.y += 4
    }
    doc.font('Helvetica').fontSize(8.5)
    const h = Math.max(doc.heightOfString(l.item, { width: cI - 8 }), doc.heightOfString(l.registo || '-', { width: cR - 8 }), 11) + 6
    garantir(h)
    const y = doc.y
    const corEstado = l.estado.startsWith('Concluído') ? (cores.green || '#2D6A2D') : l.estado === 'Pendente' ? (cores.red || '#8B2020') : MUTED
    doc.fillColor(TEXT).text(l.item, 54, y + 3, { width: cI - 8 })
    doc.fillColor(corEstado).font('Helvetica-Bold').text(l.estado, 50 + cI, y + 3, { width: cE - 6 })
    doc.fillColor(MUTED).font('Helvetica').text(l.registo || '-', 50 + cI + cE, y + 3, { width: cR - 4 })
    doc.moveTo(50, y + h).lineTo(50 + W, y + h).lineWidth(0.5).strokeColor(LINE).stroke()
    doc.y = y + h
  }
  if (!linhas.length) paragrafo('Sem checklist da Pré-aquisição registado para este projecto.', { cor: MUTED })

  // 4. Índice de anexos
  secao('4. Anexos')
  if (!anexos.length) paragrafo('Sem documentos anexados.', { cor: MUTED })
  anexos.forEach((a, i) => {
    const estado = a.erro ? `não incorporado (${a.erro})` : `${a.paginas} pág.`
    kv(`Anexo ${i + 1}`, `${a.titulo}: ${a.nome} (${estado})`)
  })
  doc.moveDown(0.6)
  paragrafo('Este dossiê reúne a documentação de identificação, contratual e de conformidade do investidor neste projecto. Fica arquivado no CRM da Somnium Properties com acesso restrito, nos termos do RGPD.', { cor: MUTED, size: 8 })

  // Rodapés do corpo (a capa fica sem rodapé)
  const range = doc.bufferedPageRange()
  for (let i = 1; i < range.count; i++) {
    doc.switchToPage(i)
    const mb = doc.page.margins.bottom
    doc.page.margins.bottom = 0
    doc.fontSize(7).fillColor(MUTED).font('Helvetica')
      .text(`Somnium Properties · Dossiê de Investidor · ${investidor.nome} · Confidencial`, 50, doc.page.height - 35, { width: W, align: 'left', lineBreak: false })
    doc.text(`Página ${i + 1}`, 50, doc.page.height - 35, { width: W, align: 'right', lineBreak: false })
    doc.page.margins.bottom = mb
  }
  const corpo = await paraBytes(doc)

  // 3) Junção (pdf-lib): corpo + separador por anexo + páginas do anexo
  const { rgb, StandardFonts } = PDFLib
  const final = await PDFLib.PDFDocument.load(corpo)
  const helv = await final.embedFont(StandardFonts.Helvetica)
  const helvB = await final.embedFont(StandardFonts.HelveticaBold)
  const hex = (h) => { const n = parseInt(String(h).replace('#', ''), 16); return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255) }
  const limpar = (s) => String(s || '').replace(/[^\x20-\x7E -ÿ]/g, '')
  for (let i = 0; i < anexos.length; i++) {
    const a = anexos[i]
    if (a.erro) continue
    const sep = final.addPage([595.28, 841.89])
    sep.drawRectangle({ x: 0, y: 0, width: 595.28, height: 841.89, color: hex(BLACK) })
    sep.drawText(limpar(`ANEXO ${i + 1}`), { x: 50, y: 460, size: 12, font: helv, color: hex(GOLD) })
    sep.drawText(limpar(a.titulo), { x: 50, y: 425, size: 20, font: helvB, color: rgb(1, 1, 1), maxWidth: 495 })
    sep.drawText(limpar(a.nome), { x: 50, y: 395, size: 10, font: helv, color: rgb(0.75, 0.75, 0.75), maxWidth: 495 })
    let paginas = []
    if (a.formato === 'pdf') {
      paginas = await final.copyPages(a.src, a.src.getPageIndices())
      paginas.forEach(p => final.addPage(p))
    } else {
      const img = a.formato === 'jpg' ? await final.embedJpg(a.bytes) : await final.embedPng(a.bytes)
      const p = final.addPage([595.28, 841.89])
      const esc = Math.min(495 / img.width, 720 / img.height, 1.5)
      const w = img.width * esc, h = img.height * esc
      p.drawImage(img, { x: (595.28 - w) / 2, y: 841.89 - 60 - h, width: w, height: h })
      paginas = [p]
    }
    paginas.forEach((p, j) => {
      const { width } = p.getSize()
      p.drawText(limpar(`Dossiê de Investidor · Anexo ${i + 1} · ${j + 1}/${paginas.length}`), { x: 20, y: 12, size: 7, font: helv, color: rgb(0.45, 0.45, 0.45) })
      void width
    })
  }
  const bytes = await final.save()
  return { bytes, anexos: anexos.map(({ titulo, nome, paginas, erro }) => ({ titulo, nome, paginas, erro })), incorporados: incorporados.length }
}

// ── Pós-geração: marcar «Dossiê consolidado» e «Arquivado no CRM» ──
export async function marcarChecklistDossie(pool, negocioId, investidorId, autor, nomeFicheiro) {
  const { rows } = await pool.query(
    `SELECT t.id, t.fase_id, t.checklist FROM projeto_tarefas t JOIN projeto_fases f ON f.id = t.fase_id
     WHERE f.negocio_id = $1 AND t.checklist IS NOT NULL`, [negocioId])
  const fases = new Set()
  for (const t of rows) {
    const ch = json(t.checklist)
    if (!ch?.por_investidor || !ch.itens?.some(i => i.k === 'dossie')) continue
    const em = new Date().toISOString()
    // Projectos criados antes de o item pedir documento: passa a apontar para
    // o dossiê gerado (mesma regra do modelo em fasesFixFlip).
    for (const it of ch.itens) if (it.k === 'dossie' && !it.docInvestidor) { it.docInvestidor = 'dossie_investidor'; it.porProjeto = true }
    for (const k of ['dossie', 'arquivo']) {
      if (!ch.itens.some(i => i.k === k)) continue
      const chave = `${investidorId}:${k}`
      const ant = ch.estado?.[chave] || {}
      const nota = ant.nota || (k === 'dossie' ? `Gerado no CRM: ${nomeFicheiro}` : 'Arquivado no bucket privado Investidores')
      ch.estado = { ...(ch.estado || {}), [chave]: { ...ant, feito: true, por: autor || ant.por || null, em, nota } }
    }
    await pool.query('UPDATE projeto_tarefas SET checklist = $1 WHERE id = $2', [JSON.stringify(ch), t.id])
    fases.add(t.fase_id)
  }
  return [...fases]
}
