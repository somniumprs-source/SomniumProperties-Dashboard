// @ts-nocheck
/**
 * Preparação de chamada por investidor (SOP 23 v2.1): regras puras, sem BD.
 * Usado pela Edge Function (preparacaoChamada.ts), pelo Express de dev
 * (src/db/preparacaoChamada.js) e pelos testes (scripts/preparacao-chamada.test.mjs).
 *
 * Nada aqui escreve logs: os dados são pessoais.
 */

export const TIPO_FILA = 'preparacao_chamada'
export const VERSAO_PROMPT = 'preparacao_chamada_v1.md'
export const FICHEIRO_ANEXO_A = 'anexo_a_sop23_v2.1.md'
export const SEM_DADOS = 'sem dados'
export const LINHA_FORA_SOP23 = 'Esta chamada não é do SOP 23. Usar o SOP 11.'
export const ALERTA_RETORNO = 'Possível número de retorno: rever antes de usar'
export const ALERTA_INCOMPLETO = 'Documento incompleto'
export const VALIDADE_HORAS = 24
export const LIMITE_NOTAS = 20_000
export const LIMITE_TRANSCRICAO = 4_000
export const TIPOS = ['qualificacao', 'discovery', 'recontacto', 'fora_sop23']
export const TIPO_LABEL = {
  qualificacao: 'Chamada 1 – Qualificação',
  discovery: 'Chamada 2 – Discovery',
  recontacto: 'Recontacto (Follow Up)',
  fora_sop23: 'Fora do SOP 23',
}
const CRITERIOS = [
  ['capital', 'Capital'], ['via', 'Via'], ['objetivo', 'Objetivo'], ['urgencia', 'Urgência'],
  ['experiencia', 'Experiência e confiança'], ['decisor', 'Decisor'],
]

// ── Utilitários ────────────────────────────────────────────────
export const normalizar = (s) => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[–—]/g, '-').replace(/\s+/g, ' ').trim()
const vazio = (v) => v == null || (typeof v === 'string' && (v.trim() === '' || v.trim() === '[]'))
  || (Array.isArray(v) && v.length === 0)
const valor = (v) => {
  if (vazio(v)) return SEM_DADOS
  if (Array.isArray(v)) return v.join(', ')
  if (typeof v === 'string' && v.trim().startsWith('[')) {
    try { const a = JSON.parse(v); if (Array.isArray(a)) return a.length ? a.join(', ') : SEM_DADOS } catch { /* texto */ }
  }
  if (typeof v === 'object') return JSON.stringify(v)
  return String(v).trim()
}

function partesLisboa(v) {
  const d = v instanceof Date ? v : new Date(v)
  if (Number.isNaN(d.getTime())) return null
  const f = new Intl.DateTimeFormat('pt-PT', {
    timeZone: 'Europe/Lisbon', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23', weekday: 'long',
  })
  const p = Object.fromEntries(f.formatToParts(d).map((x) => [x.type, x.value]))
  return { dia: `${p.day}/${p.month}/${p.year}`, hora: `${p.hour}:${p.minute}`, semana: p.weekday, iso: `${p.year}-${p.month}-${p.day}` }
}
// Data só dia ("2026-11-17") fica sem hora; data com hora vai para Lisboa.
export function fmtDataHora(v) {
  if (vazio(v)) return null
  const s = String(v)
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}`
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(s)) return `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)} ${s.slice(11, 16)}`
  const p = partesLisboa(s)
  return p ? `${p.dia} ${p.hora}` : s
}
const ordem = (v) => { const t = new Date(v || 0).getTime(); return Number.isNaN(t) ? 0 : t }

// ── Montante (SOP 23, 3.7): um valor no limite conta no escalão de cima ──
export function escalaoMontante(n) {
  if (!Number.isFinite(n) || n <= 0) return null
  if (n < 50_000) return 'menos de 50 mil €'
  if (n < 200_000) return '50 mil a menos de 200 mil €'
  if (n <= 300_000) return '200 a 300 mil €'
  return 'mais de 300 mil €'
}
const eur = (n) => `${Math.round(n).toLocaleString('pt-PT')} €`
export function montante(inv) {
  const vals = [Number(inv?.capital_min), Number(inv?.capital_max)].filter((n) => Number.isFinite(n) && n > 0)
  if (!vals.length) return { texto: SEM_DADOS, escalao: null }
  const min = Math.min(...vals), max = Math.max(...vals)
  const bruto = min === max ? eur(min) : `${eur(min)} a ${eur(max)}`
  if (min < 1000) return { texto: `${bruto} (valor muito baixo: provavelmente em milhares; confirmar)`, escalao: null }
  const a = escalaoMontante(min), b = escalaoMontante(max)
  if (a === b) return { texto: `${bruto} (escalão: ${a})`, escalao: a }
  return { texto: `${bruto} (o intervalo atravessa escalões: ${a} e ${b}; confirmar)`, escalao: null }
}

// ── Conversas e formulário ─────────────────────────────────────
const RE_SUBMISSAO = /^submiss[aã]o landing page/i
const RE_SEM_RESPOSTA = /n[aã]o atend|sem resposta|numero errado|n[uú]mero errado|falhad/i
export const ehSubmissaoFormulario = (i) => i?.canal === 'Nota' && RE_SUBMISSAO.test(String(i?.notas || '').trim())
const ehAutomatico = (i) => /autom[aá]tic/i.test(String(i?.autor || ''))

// Houve conversa de facto (chamada atendida, reunião, gravação atendida)?
export function temConversa({ interacoes = [], gravacoes = [], reunioes = [] }) {
  if (reunioes.length) return true
  if (gravacoes.some((g) => g.resultado ? g.resultado === 'atendeu' : !!g.tem_transcricao)) return true
  return interacoes.some((i) => ['Chamada', 'Reunião', 'Reuniao'].includes(i.canal) && !RE_SEM_RESPOSTA.test(String(i.resultado || '')))
}

// Etapa => tipo. Lead do formulário sem conversa = Chamada 1, seja qual for a etapa
// (o webhook cria-a em "Pendente de Aprovação").
export function tipoChamada(dados) {
  const status = String(dados?.investidor?.status || '').trim()
  if (status === 'Potencial Investidor' || status === 'Marcar call') return 'qualificacao'
  if (status === 'Discovery call marcada') return 'discovery'
  if (status === 'Follow Up') return 'recontacto'
  if (dados?.investidor?.origem === 'Landing Page' && !temConversa(dados)) return 'qualificacao'
  return 'fora_sop23'
}

// Linhas sobre retornos saem das respostas do formulário: o prompt proíbe-os.
const RE_LINHA_RETORNO = /(retorno|roi\b|rentabilidade|rendimento|%)/i
export function respostasFormulario(interacoes = []) {
  const subs = interacoes.filter(ehSubmissaoFormulario).sort((a, b) => ordem(a.data_hora) - ordem(b.data_hora))
  if (!subs.length) return SEM_DADOS
  return subs.map((s) => {
    const linhas = String(s.notas).split('\n').slice(1).map((l) => l.trim()).filter(Boolean)
      .map((l) => `- ${RE_LINHA_RETORNO.test(l) ? `${l.split(':')[0]}: (omitido: retorno)` : l}`)
    return `Entrada do formulário em ${fmtDataHora(s.data_hora)}:\n${linhas.join('\n')}`
  }).join('\n\n')
}

// ── Blocos de texto do prompt ──────────────────────────────────
function scorecardTexto(inv) {
  let sc = inv?.scorecard_discovery
  if (typeof sc === 'string') { try { sc = JSON.parse(sc) } catch { sc = null } }
  if (!sc || typeof sc !== 'object') return SEM_DADOS
  const quando = fmtDataHora(sc.preenchido_em)
  const linhas = CRITERIOS.map(([k, label]) => {
    const c = sc[k]
    const nota = c && typeof c === 'object' ? c.nota : c
    if (nota == null || nota === '') return `  - ${label}: em branco`
    const ev = c && typeof c === 'object' && c.evidencia ? ` (evidência: ${c.evidencia})` : ''
    return `  - ${label}: ${nota}${ev}`
  })
  return `registado${quando ? ` em ${quando}` : ''}${sc.preenchido_por ? ` por ${sc.preenchido_por}` : ''}\n${linhas.join('\n')}`
}

export function fichaInvestidor(dados) {
  const inv = dados.investidor || {}
  const ultimaTemp = [...(dados.gravacoes || [])].filter((g) => g.temperatura).sort((a, b) => ordem(b.data_chamada) - ordem(a.data_chamada))[0]
  const capitalDisp = [
    inv.capital_confirmado === true ? 'capital confirmado' : null,
    vazio(inv.capital_disponivel_em) ? null : `disponível em: ${valor(inv.capital_disponivel_em)}`,
    vazio(inv.horizonte_investimento) ? null : `horizonte: ${valor(inv.horizonte_investimento)}`,
  ].filter(Boolean).join('; ')
  const linhas = [
    ['Nome', inv.nome],
    ['Contacto', [inv.telemovel, inv.email].filter((x) => !vazio(x)).join(' · ')],
    ['Origem (fonte)', inv.origem],
    ['Entrada no CRM', fmtDataHora(inv.created_at)],
    ['Experiência', inv.experiencia_imobiliario],
    ['Negócios já feitos', Number(inv.numero_negocios) > 0 ? inv.numero_negocios : null],
    ['Intervalo de montante', montante(inv).texto],
    ['Capital disponível', capitalDisp],
    ['Decisor', inv.decisores],
    ['Motivação (objetivo e motivo real)', inv.motivacao],
    ['Capital hoje (onde está)', inv.investimentos_atuais],
    ['Via registada', inv.tipo_principal],
    ['Critérios de compra: tipologia', inv.tipo_imovel_preferido],
    ['Critérios de compra: zona', inv.regioes_preferidas],
    ['Ticket por operação', inv.ticket_por_operacao],
    ['Objeções registadas', inv.objecoes],
    ['Compromissos registados', inv.compromissos],
    ['Temperatura do Follow Up', ultimaTemp ? `${ultimaTemp.temperatura} (registada em ${fmtDataHora(ultimaTemp.data_chamada)})` : null],
    ['Data de reativação / follow up', fmtDataHora(inv.data_follow_up)],
    ['Último contacto', fmtDataHora(inv.data_ultimo_contacto)],
    ['Scorecard da discovery', scorecardTexto(inv)],
    ['Pontuação (0 a 12)', inv.pontuacao_discovery],
    ['Classe proposta', inv.classificacao_proposta ? `${inv.classificacao_proposta}${inv.classificacao_proposta_em ? ` (${fmtDataHora(inv.classificacao_proposta_em)})` : ''}` : null],
    ['Classe validada', inv.classificacao_estado === 'validada' ? `${inv.classificacao_proposta || inv.classificacao} por ${inv.classificacao_validada_por} em ${fmtDataHora(inv.classificacao_validada_em)}` : null],
    ['Apresentação marcada', fmtDataHora(inv.data_apresentacao_negocio)],
    ['NDA assinado', inv.nda_assinado ? 'sim' : null],
    ['Permissão de gravação', null],
    ['Urgência e gatilho', null],
    ['Desafio principal', null],
    ['Sinais da via', null],
    ['Margem mínima e prazo de decisão', null],
    ['Recontacto: o que faltava e ângulo seguinte', null],
  ]
  return linhas.map(([k, v]) => `- ${k}: ${valor(v)}`).join('\n')
}

export function historicoContactos(dados) {
  const itens = []
  for (const i of dados.interacoes || []) {
    if (i.canal === 'Nota') continue
    itens.push({ t: i.data_hora, linha: `${fmtDataHora(i.data_hora)} · ${valor(i.canal)} · ${valor(i.direcao)}${i.finalidade ? ` · ${i.finalidade}` : ''} · resultado: ${valor(i.resultado)}${i.autor && !ehAutomatico(i) ? ` · por ${i.autor}` : ''}${ehAutomatico(i) ? ' · envio automático' : ''}` })
  }
  for (const g of dados.gravacoes || []) {
    itens.push({ t: g.data_chamada, linha: `${fmtDataHora(g.data_chamada)} · Chamada gravada (${valor(g.tipo_chamada)}) · resultado: ${valor(g.resultado)}${g.proximo_passo ? ` · próximo passo: ${g.proximo_passo}` : ''}${g.realizada_por ? ` · por ${g.realizada_por}` : ''}` })
  }
  for (const r of dados.reunioes || []) {
    itens.push({ t: r.data, linha: `${fmtDataHora(r.data)} · Reunião${r.titulo ? ` "${r.titulo}"` : ''}${r.duracao_min ? ` · ${r.duracao_min} min` : ''}` })
  }
  if (!itens.length) return SEM_DADOS
  return itens.sort((a, b) => ordem(a.t) - ordem(b.t)).map((x) => `- ${x.linha}`).join('\n')
}

const corta = (s, n) => (s.length > n ? `${s.slice(0, n)} [...cortado]` : s)
const textoAnalise = (a) => {
  if (vazio(a)) return null
  if (typeof a === 'string') { try { a = JSON.parse(a) } catch { return a } }
  return a?.resumo || a?.sintese || JSON.stringify(a)
}
// Das mais recentes para as mais antigas, até LIMITE_NOTAS caracteres no total.
export function notasETranscricoes(dados) {
  const itens = []
  const inv = dados.investidor || {}
  if (!vazio(inv.notas)) itens.push({ t: inv.updated_at || inv.created_at, origem: 'Notas da ficha', texto: String(inv.notas) })
  for (const i of dados.interacoes || []) {
    if (i.canal !== 'Nota' || ehSubmissaoFormulario(i) || ehAutomatico(i) || vazio(i.notas)) continue
    itens.push({ t: i.data_hora, origem: `Nota${i.autor ? ` de ${i.autor}` : ''}`, texto: String(i.notas) })
  }
  for (const i of dados.interacoes || []) {
    if (i.canal === 'Nota' || vazio(i.notas)) continue
    itens.push({ t: i.data_hora, origem: `Notas do contacto (${i.canal})`, texto: String(i.notas) })
  }
  for (const g of dados.gravacoes || []) {
    const resumo = textoAnalise(g.analise)
    if (resumo) itens.push({ t: g.data_chamada, origem: 'Análise da chamada gravada', texto: resumo })
    else if (!vazio(g.transcricao)) itens.push({ t: g.data_chamada, origem: 'Transcrição da chamada gravada', texto: corta(String(g.transcricao), LIMITE_TRANSCRICAO) })
    if (!vazio(g.notas)) itens.push({ t: g.data_chamada, origem: 'Notas da chamada gravada', texto: String(g.notas) })
  }
  for (const r of dados.reunioes || []) {
    const resumo = textoAnalise(r.resumo_ia) || (vazio(r.resumo) ? null : String(r.resumo))
    if (resumo) itens.push({ t: r.data, origem: 'Resumo da reunião', texto: resumo })
    else if (!vazio(r.transcricao)) itens.push({ t: r.data, origem: 'Transcrição da reunião', texto: corta(String(r.transcricao), LIMITE_TRANSCRICAO) })
  }
  if (!itens.length) return SEM_DADOS
  itens.sort((a, b) => ordem(b.t) - ordem(a.t))
  const out = []
  let total = 0
  for (const x of itens) {
    const bloco = `[${fmtDataHora(x.t) || 'sem data'} · ${x.origem}]\n${x.texto.trim()}`
    if (total + bloco.length > LIMITE_NOTAS) { out.push(`[${itens.length - out.length} registo(s) mais antigo(s) omitido(s) pelo limite de ${LIMITE_NOTAS} caracteres]`); break }
    out.push(bloco); total += bloco.length
  }
  return out.join('\n\n')
}

export function referencia(inv) {
  if (!inv?.origem) return SEM_DADOS
  if (!/refer/i.test(inv.origem)) return `Não veio por referência (origem: ${inv.origem}).`
  return `Origem: ${inv.origem}. Quem referenciou: ${SEM_DADOS}. O que lhe foi dito: ${SEM_DADOS}.${vazio(inv.contexto_relacional) ? '' : ` Contexto relacional: ${inv.contexto_relacional}`}`
}

// Espaços livres = blocos de disponibilidade menos o que já está ocupado.
const minutos = (h) => { const [a, b] = String(h || '').split(':').map(Number); return a * 60 + (b || 0) }
const hhmm = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
export function calendarioLivre({ blocos = [], ocupados = [], agora = new Date() }) {
  if (!blocos.length) return SEM_DADOS
  const hoje = partesLisboa(agora)
  const fim = partesLisboa(new Date(agora.getTime() + 48 * 3_600_000))
  const out = []
  for (const b of [...blocos].sort((x, y) => `${x.data}${x.hora_inicio}`.localeCompare(`${y.data}${y.hora_inicio}`))) {
    let livres = [[minutos(b.hora_inicio), minutos(b.hora_fim)]]
    if (b.data === hoje.iso) livres = [[Math.max(livres[0][0], minutos(hoje.hora)), livres[0][1]]]
    if (b.data === fim.iso) livres = [[livres[0][0], Math.min(livres[0][1], minutos(fim.hora))]]
    for (const o of ocupados.filter((o) => o.data === b.data)) {
      const [oi, of] = [minutos(o.hora_inicio), minutos(o.hora_fim || o.hora_inicio) || minutos(o.hora_inicio) + 30]
      livres = livres.flatMap(([i, f]) => (of <= i || oi >= f ? [[i, f]] : [[i, oi], [of, f]]))
    }
    for (const [i, f] of livres) if (f - i >= 30) out.push(`- ${b.data.slice(8, 10)}/${b.data.slice(5, 7)} das ${hhmm(i)} às ${hhmm(f)}`)
  }
  return out.length ? out.join('\n') : SEM_DADOS
}

export function horaChamada(dados) {
  const t = dados.proximaTarefa
  if (t?.inicio) return `${fmtDataHora(t.inicio)}${t.tarefa ? ` (${t.tarefa})` : ''}`
  const inv = dados.investidor || {}
  if (!vazio(inv.data_proxima_acao)) return `${fmtDataHora(inv.data_proxima_acao)}${inv.proxima_acao ? ` (${inv.proxima_acao})` : ''}`
  return SEM_DADOS
}

// Variáveis do prompt. Campo que não existe passa como "sem dados".
export function montarEntradas(dados, { quemConduz, agora = new Date() } = {}) {
  const p = partesLisboa(agora)
  const tipo = tipoChamada(dados)
  const etapa = valor(dados.investidor?.status)
  const etapaTxt = tipo === 'qualificacao' && !['Potencial Investidor', 'Marcar call'].includes(dados.investidor?.status)
    ? `${etapa} (lead do formulário sem conversa: tratar como "Marcar call", Chamada 1 – Qualificação)`
    : etapa
  return {
    tipo,
    data_hoje: `Hoje: ${p.dia} ${p.hora} (${p.semana}, hora de Lisboa)`,
    hora_chamada: `Hora da chamada: ${horaChamada(dados)}`,
    quem_conduz: `Quem conduz: ${valor(quemConduz)}`,
    etapa_crm: `Etapa no CRM: ${etapaTxt}`,
    ficha_investidor: `FICHA DO INVESTIDOR (Anexo B)\n${fichaInvestidor(dados)}`,
    historico_contactos: `HISTÓRICO DE CONTACTOS\n${historicoContactos(dados)}`,
    notas_e_transcricoes: `NOTAS E TRANSCRIÇÕES (mais recentes primeiro)\n${notasETranscricoes(dados)}`,
    respostas_formulario: `RESPOSTAS AO FORMULÁRIO\n${respostasFormulario(dados.interacoes)}`,
    referencia: `REFERÊNCIA\n${referencia(dados.investidor)}`,
    calendario: `CALENDÁRIO (espaços livres de quem conduz nas próximas 48 horas)\n${calendarioLivre({ blocos: dados.blocos, ocupados: dados.ocupados, agora })}`,
    oportunidades_disponiveis: `OPORTUNIDADES DISPONÍVEIS\n${dados.oportunidades?.length ? dados.oportunidades.map((o) => `- ${o.nome} (${o.tipo})`).join('\n') : SEM_DADOS}`,
  }
}

export function preencherPrompt(template, anexoA, entradas) {
  return String(template).replace(/\{\{(\w+)\}\}/g, (m, k) => (k === 'anexo_a' ? String(anexoA).trim() : k in entradas && k !== 'tipo' ? entradas[k] : m))
}

// Resposta do Claude: tira cercas de código à volta do documento inteiro.
export function limparResposta(texto) {
  const t = String(texto || '').trim()
  const m = t.match(/^```(?:markdown|md)?\s*\n([\s\S]*?)\n```$/)
  return (m ? m[1] : t).trim()
}

// ── Validação depois da geração (no código, não no modelo) ─────
const RE_PERCENT = /\d+(?:[.,]\d+)?\s*%|\bpor\s+cento\b/i
const RE_PALAVRA_RETORNO = /(retorno|rendimento|rentabilidade|\bfee\b)/gi
const RE_REFERENCIA = /\b(parte|sec[cç][aã]o|sec[cç][oõ]es|chamada|anexo|sop|bloco|passo|etapa)\s+\d+(\.\d+)?(\s*(a|e)\s*\d+(\.\d+)?)?|\bD\+\d+|^\s*\d+[.)]\s|\b\d+\.\d+\b(?!\s*(%|mil|€))/gim
export function temNumeroRetorno(texto) {
  const t = String(texto || '')
  if (RE_PERCENT.test(t)) return true
  for (const m of t.matchAll(RE_PALAVRA_RETORNO)) {
    // Só a mesma linha, sem referências do SOP ("secção 5", "Chamada 1", "D+3", "3.5").
    const ini = t.lastIndexOf('\n', m.index) + 1
    const fimLinha = t.indexOf('\n', m.index)
    const linha = t.slice(ini, fimLinha === -1 ? t.length : fimLinha)
    const pos = m.index - ini
    const janela = linha.slice(Math.max(0, pos - 40), pos + m[0].length + 40).replace(RE_REFERENCIA, ' ')
    if (/\d/.test(janela)) return true
  }
  return false
}
const SECCOES_COMPLETO = ['parte 1', 'parte 2', 'parte 3', 'scorecard', 'proximo passo']
export function seccoesEmFalta(texto, tipo) {
  const t = normalizar(texto)
  if (tipo === 'fora_sop23') return t.includes(normalizar(LINHA_FORA_SOP23)) ? [] : [LINHA_FORA_SOP23]
  const exigidas = t.includes('primeiro contacto sem contexto') ? ['proximo passo'] : SECCOES_COMPLETO
  return exigidas.filter((s) => !t.includes(s))
}
export function validarDocumento(texto, tipo) {
  const alertas = []
  if (temNumeroRetorno(texto)) alertas.push(ALERTA_RETORNO)
  if (!String(texto || '').trim() || seccoesEmFalta(texto, tipo).length) alertas.push(ALERTA_INCOMPLETO)
  return alertas
}

// Preparação ainda serve: menos de 24 h e sem contactos registados depois dela.
export function preparacaoValida(prep, ultimoContactoEm, agora = new Date()) {
  if (!prep?.gerado_em) return false
  const g = ordem(prep.gerado_em)
  if (agora.getTime() - g >= VALIDADE_HORAS * 3_600_000) return false
  return !(ultimoContactoEm && ordem(ultimoContactoEm) > g)
}
