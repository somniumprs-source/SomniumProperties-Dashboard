
/**
 * PDF "Preparação de calls com investidores" (uma semana ou uma só call).
 * Estrutura do documento de referência (Preparacao_Calls_Investidores_16-20nov2026):
 * capa escura com KPIs, tabela-resumo, bloco "O que mudou na Somnium", uma
 * página por dia com um cartão por investidor (borda dourada nos follow-ups)
 * e a checklist de correções ao CRM no fim.
 *
 * Gémeo Deno em supabase/functions/_shared/pdfPreparacaoCalls.ts — só mudam os imports.
 * Portar qualquer alteração para os dois.
 */
import PDFDocument from "pdfkit"
import { linhasScorecardMao } from '../../supabase/functions/_shared/classeInvestidor.js'
import { LOGO_BLACK_PNG } from "./logoBlack.js"
import { LOGO_WHITE_PNG } from "./logoWhite.js"
import { DOC_COLORS } from "./docTheme.js"

const GOLD = DOC_COLORS.gold
const DARK = DOC_COLORS.black
const CREAM = '#F8F3E6'
const CARD = '#FBF7EC'
const LINE = '#E3D9C0'
const BODY = '#2A2A2A'
const MUTED = '#8A8170'
const LOGO_RATIO = 614 / 1516

const PW = 595.28
const PH = 841.89
const ML = 48
const CW = PW - ML * 2
const PB = 56
const SERIF = 'Times-Roman'
const SERIF_IT = 'Times-Italic'
const SANS = 'Helvetica'
const SANS_B = 'Helvetica-Bold'

const DIAS_SEMANA = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado']
const DIAS_CURTO = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']

const dt = (d) => new Date(`${d}T12:00:00Z`)
const fmtData = (d) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}` : 'não registado')
const espacado = (s) => String(s).toUpperCase().split('').join(' ')
const tipoTag = (p) => (p.tipo_final === 'follow_up' ? 'FOLLOW-UP' : p.tipo_final === 'discovery_call' ? 'DISCOVERY' : 'COLD CALL')

function periodoTexto(desde, ate) {
  if (!desde) return ''
  const a = dt(desde), b = dt(ate || desde)
  if (desde === (ate || desde)) return `${a.getUTCDate()} de ${MESES[a.getUTCMonth()]} de ${a.getUTCFullYear()}`
  const mesmoMes = a.getUTCMonth() === b.getUTCMonth()
  return `Semana de ${a.getUTCDate()}${mesmoMes ? '' : ` de ${MESES[a.getUTCMonth()]}`} a ${b.getUTCDate()} de ${MESES[b.getUTCMonth()]} de ${b.getUTCFullYear()}`
}

// Linhas rotuladas do cartão de cada investidor.
export function linhasCartao(p) {
  const b = p.secoes_base || {}
  const h = b.cabecalho || {}
  const c = p.conteudo_json || {}
  const L = []
  const follow = p.tipo_final !== 'cold_call'
  const hist = Array.isArray(c.historial) && c.historial.length
    ? c.historial.slice(-4).map(e => `${fmtData(e.data)} · ${e.canal}: ${e.essencial}`).join('\n')
    : (b.historial || []).slice(-4).map(e => `${fmtData(e.data)} · ${e.canal}: ${e.texto}`).join('\n')
  L.push([follow ? 'Historial' : 'Origem', hist || `${h.origem || 'Origem não registada'}${h.primeiro_contacto ? `, primeiro contacto a ${fmtData(h.primeiro_contacto)}` : ''}. Sem conversa registada.`])
  L.push(['Tipo de call', h.motivo || ''])
  if (c.quem_e && c.quem_e !== 'não registado') L.push(['Quem é', c.quem_e])
  L.push(['Perfil declarado', b.perfil_declarado || 'não registado'])
  if (Array.isArray(c.combinado) && c.combinado.length) {
    L.push(['O que ficou combinado', c.combinado.map(x => `${x.quem === 'somnium' ? 'Somnium' : 'Investidor'}: ${x.o_que}${x.quando ? ` (${x.quando})` : ''}${x.citacao ? ` "${x.citacao}"` : ''}`).join('\n')])
  }
  if (Array.isArray(c.objecoes_alertas) && c.objecoes_alertas.length) L.push(['Atenção', c.objecoes_alertas.map(x => x.texto).join('\n')])
  if (c.abertura) L.push(['Abertura', c.abertura])
  if (Array.isArray(c.antes_de_ligar) && c.antes_de_ligar.length) L.push(['Antes de ligar', c.antes_de_ligar.join('\n')])
  const perg = Array.isArray(c.perguntas) && c.perguntas.length ? c.perguntas : (b.dados_em_falta || []).slice(0, 6).map(x => `${x}?`)
  if (perg.length) L.push(['Perguntas', perg.join('\n')])
  if (Array.isArray(c.scorecard_mao) && c.scorecard_mao.length) L.push(['Scorecard à mão (4.10)', linhasScorecardMao(c.scorecard_mao).join('\n')])
  L.push(['Objetivo', [c.objetivo, c.proximo_passo ? `Próximo passo: ${c.proximo_passo}` : null].filter(Boolean).join('\n') || (p.tipo_final === 'discovery_call' ? 'Discovery: via definida, classe A–D proposta e apresentação marcada.' : p.tipo_final === 'follow_up' ? 'Recontacto: ver se o que faltava mudou e marcar a discovery.' : 'Chamada 1: marcar a discovery no máximo a 48 horas, com o decisor.')])
  if (Array.isArray(b.guiao) && b.guiao.length) L.push(['Guião (Anexo A)', b.guiao.map(g => g.t === 'fala' ? `"${g.x}"` : g.t === 'titulo' ? g.x : `[${g.x}]`).join('\n')])
  if (!p.conteudo_json) L.push(['Nota', p.estado === 'erro' ? 'A IA falhou: só dados do CRM. Usar "Regenerar" na app.' : 'Texto ainda em geração: só dados do CRM.'])
  return L
}

export function correcoesCrm(preps) {
  const out = []
  for (const p of preps) {
    const nome = p.investidor_nome || p.secoes_base?.cabecalho?.nome || ''
    for (const x of p.conteudo_json?.correcoes_crm || []) out.push({ nome, texto: `${x.campo}: ${x.atual ?? '—'} → ${x.correto}${x.fonte ? ` (${x.fonte})` : ''}` })
    for (const x of p.secoes_base?.incoerencias || []) out.push({ nome, texto: `${x.campo}: ${x.atual}. ${x.problema}` })
  }
  return out
}

export function generatePreparacaoCallsPDF(dados, { preparadoPara = null, geradoEm = new Date() } = {}) {
  const preps = dados.preparacoes || []
  const doc = new PDFDocument({ size: 'A4', autoFirstPage: false, margins: { top: 0, bottom: 0, left: 0, right: 0 } })
  let pagina = 0
  let y = 0
  const totalFollow = preps.filter(p => p.tipo_final !== 'cold_call').length
  const totalCold = preps.length - totalFollow
  const classeA = preps.filter(p => (p.classificacao || p.secoes_base?.cabecalho?.classe) === 'A').length
  const periodo = periodoTexto(dados.periodo?.desde, dados.periodo?.ate)

  function novaPagina(fundo = CREAM) {
    doc.addPage({ size: 'A4', margins: { top: 0, bottom: 0, left: 0, right: 0 } })
    pagina++
    doc.rect(0, 0, PW, PH).fill(fundo)
    y = 48
    if (pagina > 1) {
      doc.font(SANS).fontSize(7).fillColor(MUTED)
        .text('Somnium Properties · Preparação de calls · Documento interno e confidencial', ML, PH - 34, { lineBreak: false })
      doc.text(String(pagina), PW - ML - 40, PH - 34, { width: 40, align: 'right', lineBreak: false })
    }
  }
  const precisa = (h) => { if (y + h > PH - PB) { novaPagina(); return true } return false }

  function cabecalhoSeccao(kicker, titulo) {
    doc.font(SANS_B).fontSize(7).fillColor(GOLD).text(espacado(kicker), ML, y, { characterSpacing: 0.5 })
    y += 14
    doc.font(SERIF).fontSize(20).fillColor(DARK).text(titulo, ML, y, { width: CW - 110 })
    doc.image(LOGO_BLACK_PNG, PW - ML - 90, y - 4, { width: 90 })
    y = Math.max(doc.y, y + 26) + 8
    doc.moveTo(ML, y).lineTo(PW - ML, y).lineWidth(0.6).strokeColor(LINE).stroke()
    y += 16
  }

  // ── Capa ──
  novaPagina(DARK)
  doc.image(LOGO_WHITE_PNG, ML + 4, 70, { width: 190 })
  let cy = 330
  doc.rect(ML + 4, cy, 70, 2).fill(GOLD)
  cy += 26
  doc.font(SANS_B).fontSize(7.5).fillColor(GOLD).text(espacado('Departamento comercial · SOP 23'), ML + 4, cy, { characterSpacing: 0.4 })
  cy += 22
  doc.font(SERIF).fontSize(30).fillColor('#FFFFFF').text('Preparação de calls', ML + 4, cy)
  cy += 36
  doc.font(SERIF).fontSize(30).fillColor('#FFFFFF').text('com ', ML + 4, cy, { continued: true }).font(SERIF_IT).fillColor(GOLD).text('investidores')
  cy += 50
  doc.font(SERIF).fontSize(12).fillColor('#E8D9A8').text(periodo, ML + 4, cy)
  cy += 50
  const kpis = [[preps.length, 'CALLS'], [totalFollow, 'FOLLOW-UPS'], [totalCold, 'COLD CALLS'], [classeA, 'CLASSE A']]
  doc.moveTo(ML + 4, cy).lineTo(PW - ML - 4, cy).lineWidth(0.5).strokeColor('#4A4434').stroke()
  const kw = (CW - 8) / 4
  kpis.forEach(([v, l], i) => {
    const x = ML + 4 + i * kw
    if (i) doc.moveTo(x, cy).lineTo(x, cy + 72).strokeColor('#4A4434').stroke()
    doc.font(SERIF).fontSize(26).fillColor(GOLD).text(String(v), x + (i ? 16 : 0), cy + 14, { lineBreak: false })
    doc.font(SANS).fontSize(7).fillColor('#BDB39C').text(espacado(l), x + (i ? 16 : 0), cy + 50, { lineBreak: false, characterSpacing: 0.3 })
  })
  doc.moveTo(ML + 4, cy + 72).lineTo(PW - ML - 4, cy + 72).strokeColor('#4A4434').stroke()
  const dataGer = `${String(geradoEm.getDate()).padStart(2, '0')}/${String(geradoEm.getMonth() + 1).padStart(2, '0')}/${geradoEm.getFullYear()}`
  doc.font(SANS).fontSize(7.5).fillColor('#8F8774')
    .text(`Preparado${preparadoPara ? ` para ${preparadoPara}` : ''} · ${dataGer}`, ML + 4, PH - 60, { lineBreak: false })
  doc.text('DOCUMENTO INTERNO · CONFIDENCIAL', PW - ML - 200, PH - 60, { width: 196, align: 'right', lineBreak: false, characterSpacing: 0.5 })

  if (!preps.length) {
    novaPagina()
    cabecalhoSeccao('Visão geral', 'Sem calls com investidores')
    doc.font(SANS).fontSize(10).fillColor(BODY).text('Não há calls com investidores agendadas neste período.', ML, y, { width: CW })
    doc.end()
    return doc
  }

  // ── Resumo da semana ──
  novaPagina()
  cabecalhoSeccao('Visão geral', preps.length > 1 ? 'Resumo da semana' : 'Resumo da call')
  const prioridades = preps.filter(p => ['A', 'B'].includes(p.classificacao)).map(p => p.investidor_nome)
  doc.font(SERIF).fontSize(11).fillColor(BODY).text(
    `${preps.length} call${preps.length === 1 ? '' : 's'}: ${totalFollow} follow-up${totalFollow === 1 ? '' : 's'} e ${totalCold} cold call${totalCold === 1 ? '' : 's'}.` +
    (prioridades.length ? ` Classes A e B: ${prioridades.join(', ')}.` : ''), ML, y, { width: CW, lineGap: 2 })
  y = doc.y + 14
  const cols = [['DIA', 46], ['HORA', 44], ['INVESTIDOR', 104], ['TIPO', 70], ['CLASSE', 46], ['CAPITAL', 86], ['OBJETIVO DA CALL', CW - 396]]
  const cabTabela = () => {
    doc.rect(ML, y, CW, 24).fill(DARK)
    let x = ML + 8
    for (const [l, w] of cols) { doc.font(SANS_B).fontSize(6.5).fillColor(GOLD).text(l, x, y + 9, { width: w - 6, lineBreak: false, characterSpacing: 0.6 }); x += w }
    y += 24
  }
  cabTabela()
  let diaAnterior = null
  preps.forEach((p, i) => {
    const h = p.secoes_base?.cabecalho || {}
    const obj = p.conteudo_json?.objetivo_curto || (p.tipo_final === 'cold_call' ? 'Chamada 1 e discovery marcada (48h)' : p.tipo_final === 'discovery_call' ? 'Discovery, classe e apresentação' : 'Recontacto e discovery marcada')
    doc.font(SANS).fontSize(7.5)
    const altura = Math.max(22, doc.heightOfString(obj, { width: cols[6][1] - 8 }) + 12, doc.heightOfString(h.capital || '', { width: cols[5][1] - 8 }) + 12)
    if (precisa(altura)) cabTabela()
    if (i % 2 === 0) doc.rect(ML, y, CW, altura).fill('#FBF8EF')
    doc.moveTo(ML, y + altura).lineTo(PW - ML, y + altura).lineWidth(0.4).strokeColor(LINE).stroke()
    let x = ML + 8
    const ty = y + 7
    const d = h.dia
    if (d && d !== diaAnterior) {
      const w = dt(d)
      doc.font(SERIF).fontSize(9).fillColor(GOLD).text(`${DIAS_CURTO[w.getUTCDay()]} ${w.getUTCDate()}`, x, ty, { width: cols[0][1] - 6, lineBreak: false })
      diaAnterior = d
    }
    x += cols[0][1]
    doc.font(SANS).fontSize(8).fillColor(BODY).text(h.hora || 'a confirmar', x, ty, { width: cols[1][1] - 6, lineBreak: false }); x += cols[1][1]
    doc.font(SANS_B).fontSize(8).fillColor(DARK).text(p.investidor_nome || h.nome || '', x, ty, { width: cols[2][1] - 6 }); x += cols[2][1]
    const tag = tipoTag(p)
    const follow = p.tipo_final !== 'cold_call'
    doc.roundedRect(x, ty - 2, 60, 13, 2).lineWidth(0.6)
    if (follow) doc.fillAndStroke(DARK, DARK); else doc.stroke(MUTED)
    doc.font(SANS_B).fontSize(6).fillColor(follow ? GOLD : DARK).text(tag, x, ty + 2, { width: 60, align: 'center', lineBreak: false })
    x += cols[3][1]
    const classe = p.classificacao || h.classe
    if (classe) {
      doc.roundedRect(x + 8, ty - 2, 13, 13, 2).fill(classe === 'A' ? GOLD : classe === 'B' ? '#E7CF8A' : '#ECE6D6')
      doc.font(SERIF).fontSize(7.5).fillColor(DARK).text(classe, x + 8, ty + 1, { width: 13, align: 'center', lineBreak: false })
    } else doc.font(SANS).fontSize(6).fillColor(MUTED).text('S/ CLASSE', x, ty + 2, { width: cols[4][1] - 4, lineBreak: false })
    x += cols[4][1]
    doc.font(SANS).fontSize(7.5).fillColor(BODY).text(h.capital || 'não indicado', x, ty, { width: cols[5][1] - 8 }); x += cols[5][1]
    doc.text(obj, x, ty, { width: cols[6][1] - 8 })
    y += altura
  })
  y += 10
  doc.font(SANS).fontSize(7).fillColor(MUTED).text('Ao carregar o áudio de cada call na app, o tipo indicado nesta tabela já vem pré-selecionado, para a análise usar o guião certo do SOP 23.', ML, y, { width: CW })
  y = doc.y + 18

  // ── O que mudou na Somnium ──
  const mud = dados.mudou_somnium || { itens: [] }
  if (totalFollow) {
    doc.font(SANS).fontSize(8.5)
    const linhas = mud.itens.length
      ? mud.itens.map(m => ({ t: `${m.nome}${m.modelo ? ` (${m.modelo}${m.regiao ? `, ${m.regiao}` : ''})` : ''}.`, d: `${m.eventos.map(e => `${e.texto[0].toUpperCase()}${e.texto.slice(1)} a ${fmtData(e.data)}`).join('; ')}.${m.venda_prevista ? ` Venda prevista para ${fmtData(m.venda_prevista)}.` : ''}` }))
      : [{ t: 'Sem mudanças registadas no CRM.', d: 'Não há negócios novos nem mudanças de fase desde o último contacto. Confirmar antes das calls.' }]
    const alturas = linhas.map(l => doc.heightOfString(`${l.t} ${l.d}`, { width: CW - 60 }) + 12)
    const hb = 86 + alturas.reduce((s, a) => s + a, 0)
    precisa(hb)
    doc.rect(ML, y, CW, hb).fill(DARK)
    let by = y + 22
    doc.font(SANS_B).fontSize(7).fillColor(GOLD).text(espacado('Motivos para o follow-up'), ML + 22, by, { characterSpacing: 0.3 })
    by += 14
    doc.font(SERIF).fontSize(14).fillColor('#FFFFFF').text(`O que mudou na Somnium${mud.desde ? ` desde ${fmtData(mud.desde)}` : ''}`, ML + 22, by)
    by += 26
    linhas.forEach((l, i) => {
      doc.moveTo(ML + 22, by - 5).lineTo(PW - ML - 22, by - 5).lineWidth(0.4).strokeColor('#3A3528').stroke()
      doc.save().translate(ML + 26, by + 4).rotate(45).rect(-2.5, -2.5, 5, 5).fill(GOLD).restore()
      doc.font(SANS_B).fontSize(8.5).fillColor('#E8D9A8').text(l.t + ' ', ML + 38, by, { width: CW - 60, continued: true }).font(SANS).fillColor('#E9E4D6').text(l.d)
      by += alturas[i]
    })
    doc.font(SANS).fontSize(7).fillColor('#A39A84').text('Só dados do CRM. Não dar nomes nem montantes de outros investidores.', ML + 22, by + 4, { width: CW - 44 })
    y += hb + 10
  }

  // ── Uma página por dia ──
  const porDia = []
  for (const p of preps) {
    const d = p.secoes_base?.cabecalho?.dia || 'sem data'
    let g = porDia.find(x => x.dia === d)
    if (!g) porDia.push(g = { dia: d, itens: [] })
    g.itens.push(p)
  }
  for (const g of porDia) {
    novaPagina()
    const w = g.dia !== 'sem data' ? dt(g.dia) : null
    doc.font(SANS_B).fontSize(7).fillColor(GOLD).text(espacado(w ? DIAS_SEMANA[w.getUTCDay()] : 'Sem data'), ML, y + 11, { lineBreak: false })
    doc.font(SERIF).fontSize(22).fillColor(DARK).text(w ? `${w.getUTCDate()} de ${MESES[w.getUTCMonth()]}` : '', ML + 64, y, { lineBreak: false })
    doc.font(SANS).fontSize(7).fillColor(MUTED).text(`${g.itens.length} CALL${g.itens.length === 1 ? '' : 'S'}`, PW - ML - 80, y + 11, { width: 80, align: 'right', lineBreak: false, characterSpacing: 0.6 })
    y += 32
    doc.rect(ML, y, CW, 1.5).fill(GOLD)
    y += 18
    for (const p of g.itens) cartao(p)
  }

  function cartao(p) {
    const h = p.secoes_base?.cabecalho || {}
    const follow = p.tipo_final !== 'cold_call'
    const linhas = linhasCartao(p)
    const LW = 118
    const TW = CW - LW - 30
    doc.font(SANS).fontSize(8.5)
    const alts = linhas.map(([, t]) => doc.heightOfString(t, { width: TW, lineGap: 1.5 }) + 10)
    const hTotal = 38 + alts.reduce((s, a) => s + a, 0) + 6
    precisa(Math.min(hTotal, 260))
    // Cabeçalho do cartão
    const y0 = y
    doc.rect(ML, y, CW, 36).fill(CARD)
    doc.font(SERIF).fontSize(14).fillColor(GOLD).text(h.hora || 'A confirmar', ML + 16, y + 11, { lineBreak: false })
    doc.font(SERIF).fontSize(14).fillColor(DARK).text(p.investidor_nome || h.nome || '', ML + 76, y + 11, { width: CW - 220, lineBreak: false })
    const tag = tipoTag(p)
    doc.roundedRect(PW - ML - 110, y + 11, 66, 14, 2).lineWidth(0.6)
    if (follow) doc.fillAndStroke(DARK, DARK); else doc.stroke(MUTED)
    doc.font(SANS_B).fontSize(6.5).fillColor(follow ? GOLD : DARK).text(tag, PW - ML - 110, y + 15.5, { width: 66, align: 'center', lineBreak: false })
    const classe = p.classificacao || h.classe
    if (classe) {
      doc.roundedRect(PW - ML - 30, y + 11, 14, 14, 2).fill(classe === 'A' ? GOLD : classe === 'B' ? '#E7CF8A' : '#ECE6D6')
      doc.font(SERIF).fontSize(8).fillColor(DARK).text(classe, PW - ML - 30, y + 14.5, { width: 14, align: 'center', lineBreak: false })
    } else doc.font(SANS).fontSize(6).fillColor(MUTED).text('S/ CLASSE', PW - ML - 36, y + 16, { width: 32, align: 'right', lineBreak: false })
    y += 36
    doc.moveTo(ML, y).lineTo(PW - ML, y).lineWidth(0.5).strokeColor(LINE).stroke()
    let topoSeg = y0
    const fecharSegmento = (ate) => {
      doc.rect(ML, topoSeg, 3, ate - topoSeg).fill(follow ? GOLD : '#8A8170')
      doc.rect(ML, topoSeg, CW, ate - topoSeg).lineWidth(0.5).strokeColor(LINE).stroke()
    }
    linhas.forEach(([rot, t], i) => {
      if (y + alts[i] > PH - PB) { fecharSegmento(y); novaPagina(); topoSeg = y }
      doc.rect(ML, y, CW, alts[i]).fill(CARD)
      doc.font(SANS_B).fontSize(6.5).fillColor(MUTED).text(rot.toUpperCase(), ML + 16, y + 6, { width: LW - 10, characterSpacing: 0.6 })
      doc.font(SANS).fontSize(8.5).fillColor(BODY).text(t, ML + 16 + LW, y + 5, { width: TW, lineGap: 1.5 })
      y += alts[i]
      if (i < linhas.length - 1) doc.moveTo(ML + 16, y).lineTo(PW - ML - 16, y).lineWidth(0.4).dash(1.5, { space: 1.5 }).strokeColor(LINE).stroke().undash()
    })
    y += 6
    doc.rect(ML, y - 6, CW, 6).fill(CARD)
    fecharSegmento(y)
    y += 14
  }

  // ── Correções ao CRM ──
  const corr = correcoesCrm(preps)
  novaPagina()
  cabecalhoSeccao('Depois das calls', 'Correções a fazer no CRM')
  if (!corr.length) doc.font(SANS).fontSize(9).fillColor(BODY).text('Nenhuma incoerência detetada.', ML, y)
  for (const c of corr) {
    doc.font(SANS).fontSize(8.5)
    const hh = doc.heightOfString(`${c.nome}: ${c.texto}`, { width: CW - 30 }) + 14
    precisa(hh)
    doc.rect(ML + 2, y + 3, 9, 9).lineWidth(0.8).strokeColor(GOLD).stroke()
    doc.font(SANS_B).fontSize(8.5).fillColor(DARK).text(`${c.nome}: `, ML + 24, y + 2, { width: CW - 30, continued: true }).font(SANS).fillColor(BODY).text(c.texto)
    y += hh
    doc.moveTo(ML, y - 4).lineTo(PW - ML, y - 4).lineWidth(0.5).strokeColor(LINE).stroke()
  }
  y += 10
  doc.font(SANS).fontSize(7).fillColor(MUTED).text(`Fontes: CRM Somnium (fichas, interações, tarefas, gravações e transcrições de reuniões), consultado a ${dataGer}.`, ML, y, { width: CW })

  doc.end()
  return doc
}
