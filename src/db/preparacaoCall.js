
/**
 * Preparação automática das calls com investidores (SOP 4).
 *
 * Sempre que há uma call com investidor na Agenda (tarefa com origem_tipo =
 * 'investidor' e categoria Cold Call / Follow-up / Discovery Call a
 * Investidores), junta-se todo o contexto do investidor e gera-se um documento
 * de preparação:
 *   - o TIPO de call é calculado pelo histórico (nunca pelo que se escolheu ao
 *     agendar): houve conversa antes => follow-up; senão cold call. A Discovery
 *     Call (reunião online ou presencial) não é reclassificada. Uma correção
 *     manual (tipo_origem = 'manual') nunca é sobrescrita;
 *   - as secções com números e datas (cabeçalho, perfil, historial, o que mudou
 *     na Somnium, dados em falta) são montadas aqui, a partir do CRM;
 *   - o texto (quem é, o que ficou combinado, objeções, abertura, perguntas,
 *     correções) é escrito pelo Claude no Mac, pela fila IA (plano Claude, sem
 *     API paga). Sem resposta da IA, o documento mostra só os dados do CRM.
 *   - transcrições de reuniões sem resumo são resumidas uma única vez
 *     (reunioes.resumo_ia) antes de gerar a preparação.
 *
 * Gémeo Deno em supabase/functions/_shared/preparacaoCall.ts — o código é o mesmo, só mudam os
 * imports. Portar qualquer alteração para os dois.
 */
import { enfileirarIA, estadoIA, emFilaIA, jsonDaResposta } from "./filaIA.js"
import { definirTipoContacto } from "./contactoPessoa.js"

export const CATEGORIAS_CALL_INV = {
  'Cold Call a Investidores': 'cold_call',
  'Follow-up de Investidores': 'follow_up',
  'Discovery Call a Investidores': 'discovery_call',
}
export const TIPO_CALL_LABEL = { cold_call: 'Cold Call', follow_up: 'Follow-up', discovery_call: 'Discovery Call', a_confirmar: 'A confirmar' }
export const TIPOS_CALL = ['cold_call', 'follow_up', 'discovery_call']
export const TIPO_FILA_PREPARACAO = 'preparacao_call'
export const TIPO_FILA_RESUMO = 'resumo_reuniao'
const VERSAO_PROMPT = 'v3'
const MIN_TRANSCRICAO_RESUMO = 1500
const DIAS_JANELA = 14

const agora = () => new Date().toISOString()
const ABERTA = "status NOT IN ('Concluída', 'Concluida') AND COALESCE(arquivada, false) = false AND tarefa NOT LIKE 'Cancelada:%'"
const NORMALIZA = (col) => `translate(lower(${col}), 'áàâãäéèêëíìîïóòôõöúùûüç', 'aaaaaeeeeiiiiooooouuuuc')`
const normaliza = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim()

let _tabelas = false
export async function ensurePreparacaoTables(pool) {
  if (_tabelas) return
  await pool.query(`
    CREATE TABLE IF NOT EXISTS preparacao_calls (
      id TEXT PRIMARY KEY,
      tarefa_id TEXT NOT NULL UNIQUE,
      investidor_id TEXT NOT NULL REFERENCES investidores(id) ON DELETE CASCADE,
      tipo_agendado TEXT, tipo_calculado TEXT, tipo_final TEXT,
      tipo_origem TEXT NOT NULL DEFAULT 'calculado',
      lead_quente BOOLEAN NOT NULL DEFAULT false,
      motivo_classificacao TEXT, tipo_corrigido_em TEXT,
      secoes_base JSONB, conteudo_json JSONB, conteudo_md TEXT,
      fontes_usadas JSONB, fontes_hash TEXT, hash_gerado TEXT, modelo TEXT,
      estado TEXT NOT NULL DEFAULT 'pendente', erro TEXT, gerado_em TEXT,
      created_at TEXT DEFAULT (NOW()::TEXT), updated_at TEXT DEFAULT (NOW()::TEXT)
    );
    CREATE INDEX IF NOT EXISTS idx_preparacao_calls_investidor ON preparacao_calls(investidor_id);
    CREATE INDEX IF NOT EXISTS idx_preparacao_calls_estado ON preparacao_calls(estado);
    ALTER TABLE reunioes ADD COLUMN IF NOT EXISTS resumo_ia JSONB;
    ALTER TABLE reunioes ADD COLUMN IF NOT EXISTS resumo_ia_em TEXT;
  `)
  _tabelas = true
}

// ── Formatação ─────────────────────────────────────────────────
const dia = (v) => {
  const s = v instanceof Date ? (Number.isNaN(v.getTime()) ? '' : v.toISOString()) : String(v || '')
  return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : null
}
export function fmtData(v) {
  const d = dia(v)
  return d ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}` : 'não registado'
}
export function fmtEur(v) {
  const n = Number(v)
  if (!Number.isFinite(n) || n <= 0) return null
  if (n >= 1_000_000) return `${String(Math.round(n / 100_000) / 10).replace('.', ',')} M€`
  if (n >= 1000) return `${String(Math.round(n / 100) / 10).replace('.', ',')} mil €`
  return `${String(n).replace('.', ',')} €`
}
export function fmtCapital(min, max) {
  const a = fmtEur(min), b = fmtEur(max)
  if (a && b && a !== b) return `${a} a ${b}`
  if (b) return `até ${b}`
  if (a) return `a partir de ${a}`
  return 'não indicado'
}
const lista = (v) => {
  if (v == null || v === '') return []
  if (Array.isArray(v)) return v.filter(Boolean)
  const s = String(v).trim()
  if (s.startsWith('[')) { try { const a = JSON.parse(s); if (Array.isArray(a)) return a.filter(Boolean) } catch { /* texto */ } }
  return s.split(/[;,]\s*/).filter(Boolean)
}
const texto = (v) => { const l = lista(v); return l.length ? l.join(', ') : null }
const vazio = (v) => v == null || v === '' || v === 0 || (Array.isArray(v) && !v.length) || String(v).trim() === '[]'

// Instante em Lisboa (para "hoje", "amanhã" e a hora da call).
function lisboa(d = new Date()) {
  const f = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Lisbon', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })
  const p = Object.fromEntries(f.formatToParts(d).map(x => [x.type, x.value]))
  return { dia: `${p.year}-${p.month}-${p.day}`, hora: `${p.hour}:${p.minute}` }
}
// inicio pode vir como só dia, hora local sem fuso ("2026-11-19T12:30") ou ISO em UTC.
export function quandoDaTarefa(t) {
  const v = String(t?.inicio || t?.data_limite || '')
  if (!v) return { dia: null, hora: null }
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return { dia: v, hora: null }
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(v)) return { dia: v.slice(0, 10), hora: v.slice(11, 16) }
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? { dia: dia(v), hora: null } : lisboa(d)
}

// ── Tarefas de call com investidor ────────────────────────────
export function ehCallInvestidor(t) {
  return !!t && t.origem_tipo === 'investidor' && !!t.origem_id && !!CATEGORIAS_CALL_INV[t.categoria]
    && !String(t.origem_campo || '').startsWith('contacto:') && !String(t.tarefa || '').startsWith('Cancelada:')
}

// ── Recolha do contexto ───────────────────────────────────────
export async function recolherContexto(pool, tarefa) {
  const invId = tarefa.origem_id
  const { rows: [investidor] } = await pool.query('SELECT * FROM investidores WHERE id = $1', [invId])
  if (!investidor) return null
  const [inter, reun, grav, docs, part] = await Promise.all([
    pool.query(`SELECT id, data_hora, canal, direcao, finalidade, notas, resultado, proxima_data, autor, origem_ref, updated_at
                FROM investidor_interacoes WHERE investidor_id = $1 ORDER BY data_hora ASC`, [invId]),
    pool.query(`SELECT id, titulo, data, duracao_min, organizador, resumo, action_items, analise_completa, resumo_ia,
                       COALESCE(length(transcricao), 0) AS tr_len, COALESCE(length(resumo), 0) AS resumo_len
                FROM reunioes WHERE entidade_tipo = 'investidores' AND entidade_id = $1 ORDER BY data ASC`, [invId]),
    pool.query(`SELECT id, tipo_chamada, data_chamada, realizada_por, estado, resultado, proximo_passo, temperatura, data_follow_up,
                       notas, analise, nota_sop, updated_at, (COALESCE(btrim(transcricao), '') <> '') AS tem_transcricao
                FROM investidor_gravacoes WHERE investidor_id = $1 ORDER BY data_chamada ASC`, [invId]).catch(() => ({ rows: [] })),
    pool.query(`SELECT id, tipo, nome, notas, direcao, created_at FROM documentos_investidor WHERE investidor_id = $1 ORDER BY created_at ASC`, [invId]).catch(() => ({ rows: [] })),
    pool.query(`SELECT pi.negocio_id, pi.capital, pi.percentagem, n.movimento, n.fase, n.categoria
                FROM projeto_investidores pi JOIN negocios n ON n.id = pi.negocio_id
                WHERE pi.investidor_id = $1 AND n.deleted_at IS NULL`, [invId]).catch(() => ({ rows: [] })),
  ])
  // Tarefas antigas: pelo origem_id e pelo nome completo no título (há tarefas
  // como "Otimizar proposta para apresentar ao Luis Gouveia" sem origem_id).
  const nome = normaliza(investidor.nome)
  const porNome = nome.length >= 6 && nome.includes(' ')
  const { rows: tarefas } = await pool.query(
    `SELECT id, tarefa, categoria, status, inicio, data_limite, concluida_em, origem_campo, origem_id, arquivada, funcionario
     FROM tarefas
     WHERE id <> $1 AND (origem_id = $2 ${porNome ? `OR ${NORMALIZA('tarefa')} LIKE '%' || $3 || '%'` : ''})
     ORDER BY COALESCE(inicio, data_limite, created_at) ASC`,
    porNome ? [tarefa.id, invId, nome] : [tarefa.id, invId])

  const ultimo = ultimoContacto(investidor, inter.rows, reun.rows, grav.rows)
  const desde = ultimo || dia(investidor.data_primeiro_contacto) || dia(investidor.created_at)
  const mudancas = desde ? await mudancasSomnium(pool, desde) : []
  return {
    tarefa, investidor, interacoes: inter.rows, reunioes: reun.rows, gravacoes: grav.rows,
    tarefas, documentos: docs.rows, participacoes: part.rows, ultimo_contacto: ultimo, mudancas, mudancas_desde: desde,
  }
}

function ultimoContacto(inv, interacoes, reunioes, gravacoes) {
  const datas = [dia(inv.data_ultimo_contacto)]
  for (const x of interacoes) if (x.resultado === 'Feito' && x.canal !== 'Nota') datas.push(dia(x.data_hora))
  for (const r of reunioes) datas.push(dia(r.data))
  for (const g of gravacoes) if (!['nao_atendeu', 'numero_errado'].includes(g.resultado)) datas.push(dia(g.data_chamada))
  return datas.filter(Boolean).sort().pop() || null
}

// Negócios criados ou que mudaram de fase depois do último contacto. Só dados
// do próprio negócio (nome do imóvel, modelo, fase, datas): nunca investidores
// nem montantes de terceiros.
export async function mudancasSomnium(pool, desde) {
  const { rows: negocios } = await pool.query(
    `SELECT id, movimento, categoria, fase, regiao, created_at, data_compra, data_venda, data_estimada_venda, data_inicio_obra
     FROM negocios WHERE deleted_at IS NULL AND COALESCE(movimento, '') NOT LIKE '\\_\\_%'`)
  const { rows: fases } = await pool.query(
    `SELECT entidade_id, created_at, alteracoes FROM historico_alteracoes
     WHERE entidade = 'negocios' AND operacao = 'UPDATE' AND created_at::date > $1::date AND alteracoes::text LIKE '%"fase"%'`, [desde]).catch(() => ({ rows: [] }))
  const out = []
  for (const n of negocios) {
    const eventos = []
    if (dia(n.created_at) > desde) eventos.push({ data: dia(n.created_at), texto: 'novo negócio' })
    if (dia(n.data_compra) > desde) eventos.push({ data: dia(n.data_compra), texto: 'imóvel comprado' })
    if (dia(n.data_inicio_obra) > desde) eventos.push({ data: dia(n.data_inicio_obra), texto: 'obra iniciada' })
    if (dia(n.data_venda) > desde) eventos.push({ data: dia(n.data_venda), texto: 'vendido' })
    for (const h of fases.filter(f => f.entidade_id === n.id)) {
      const alt = (Array.isArray(h.alteracoes) ? h.alteracoes : []).find(a => a.campo === 'fase')
      if (alt?.depois) eventos.push({ data: dia(h.created_at), texto: `passou a "${alt.depois}"` })
    }
    if (!eventos.length) continue
    out.push({
      negocio_id: n.id, nome: n.movimento, modelo: n.categoria, fase: n.fase, regiao: n.regiao,
      venda_prevista: dia(n.data_estimada_venda), eventos: eventos.sort((a, b) => String(a.data).localeCompare(String(b.data))),
    })
  }
  return out
}

// ── Classificação do tipo de call ─────────────────────────────
// Nota que mostra que houve conversa: relata a conversa, cita o investidor ou
// regista o que ele disse da sua situação (capital, prazos, preferências).
const RE_CONVERSA = /(reuni[aã]o|\bcall\b|chamada|liguei|ligou|falei|fal[aá]mos|conversa|\bdisse|respondeu|refer(e|iu)|combin|contactar em|analis|\btem at[eé]|sem capital|capital dispon|n[aã]o quer|\bquer\b|preocupa|^(bom dia|boa tarde|boa noite|ol[aá])\b)/i
// Nota interna (tarefa a fazer, no imperativo): não é conversa.
const RE_NOTA_INTERNA = /^(esclarecer|confirmar|verificar|perguntar|ligar|enviar|aguarda|pedir|rever|preparar)\b/i
const RE_SUBMISSAO = /^(submiss[aã]o (landing|do forms|forms)|aguarda preenchimento|formul[aá]rio|forms )/i
const RE_TAREFA_CONVERSA = /reuni|proposta|call|chamada|follow|apresenta|discovery|visita|entrevista/i

export function classificarTipo(ctx) {
  const { investidor: inv, tarefa } = ctx
  const limite = quandoDaTarefa(tarefa).dia || '9999-12-31'
  const antes = (d) => !d || d <= limite
  const sinais = []

  for (const r of ctx.reunioes) if (antes(dia(r.data))) sinais.push(`reunião gravada a ${fmtData(r.data)}`)
  for (const g of ctx.gravacoes) {
    if (['nao_atendeu', 'numero_errado'].includes(g.resultado)) continue
    if (antes(dia(g.data_chamada)) && (g.tem_transcricao || g.resultado === 'atendeu')) sinais.push(`chamada gravada a ${fmtData(g.data_chamada)}`)
  }
  for (const x of ctx.interacoes) {
    if (x.origem_ref || !antes(dia(x.data_hora))) continue
    const notas = String(x.notas || '').trim()
    const conversa = (['Chamada', 'Reunião', 'WhatsApp'].includes(x.canal) && x.resultado === 'Feito')
      || (x.canal === 'Email' && x.direcao === 'Recebido')
      || (x.canal === 'Nota' && notas && !RE_SUBMISSAO.test(notas) && !RE_NOTA_INTERNA.test(notas) && RE_CONVERSA.test(notas))
    if (conversa) sinais.push(`${x.canal === 'Nota' ? 'nota de conversa' : x.canal.toLowerCase()} a ${fmtData(x.data_hora)}`)
  }
  for (const t of ctx.tarefas) {
    const fechada = ['Concluída', 'Concluida'].includes(t.status) && !String(t.tarefa).startsWith('Cancelada:')
    const quando = dia(t.inicio || t.data_limite || t.concluida_em)
    if (fechada && antes(quando) && RE_TAREFA_CONVERSA.test(`${t.categoria || ''} ${t.tarefa || ''}`)) {
      sinais.push(`tarefa concluída "${t.tarefa}" (${fmtData(quando)})`)
    }
  }
  if (dia(inv.data_reuniao) && inv.classificacao) sinais.push(`data de reunião ${fmtData(inv.data_reuniao)} e classe ${inv.classificacao} atribuída`)

  const leadQuente = /landing|forms/i.test(inv.origem || '')
    || ctx.interacoes.some(x => /^submiss[aã]o (landing|do forms|forms)/i.test(String(x.notas || '').trim()))
  const unicos = [...new Set(sinais)]
  if (unicos.length) {
    return { tipo: 'follow_up', lead_quente: leadQuente, sinais: unicos, motivo: `Já houve conversa: ${unicos.slice(0, 3).join('; ')}${unicos.length > 3 ? ` (+${unicos.length - 3})` : ''}.` }
  }
  if (dia(inv.data_reuniao)) {
    return {
      tipo: 'a_confirmar', lead_quente: leadQuente, sinais: [],
      motivo: `A ficha tem reunião a ${fmtData(inv.data_reuniao)}, mas não há gravação, notas, classificação nem tarefa concluída que provem que aconteceu (estado "${inv.status || 'sem estado'}").`,
    }
  }
  return {
    tipo: 'cold_call', lead_quente: leadQuente, sinais: [],
    motivo: leadQuente
      ? `Primeiro contacto. Lead quente: preencheu ${/forms/i.test(inv.origem || '') ? 'o Forms' : 'a landing page'}${inv.data_primeiro_contacto ? ` a ${fmtData(inv.data_primeiro_contacto)}` : ''}.`
      : 'Primeiro contacto: não há reunião, chamada, conversa registada nem tarefa concluída com este investidor.',
  }
}

// ── Secções montadas a partir do CRM (sem IA) ─────────────────
// Campos do Forms 1 do SOP 4 (Anexo 9, fase 2).
const CAMPOS_FORMS = [
  ['tipo_principal', 'Tipo de investidor (ativo ou passivo)'],
  ['capital_min', 'Capital mínimo'],
  ['capital_max', 'Capital máximo'],
  ['horizonte_investimento', 'Quando o capital fica disponível'],
  ['roi_pretendido', 'ROI pretendido'],
  ['roi_anualizado_pretendido', 'ROI anualizado pretendido'],
  ['estrategia', 'Estratégia'],
  ['tipo_imovel_preferido', 'Tipo de imóvel'],
  ['regioes_preferidas', 'Zonas de investimento'],
  ['experiencia_imobiliario', 'Experiência imobiliária'],
  ['numero_negocios', 'Histórico de negócios'],
  ['equipa_obras', 'Equipa de obras'],
  ['perfil_risco', 'Perfil de risco'],
  ['origem_capital', 'Origem do capital'],
  ['profissao', 'Profissão'],
  // Campos do autopreenchimento (migração 0102): o que a call ainda não respondeu.
  ['zona_residencia', 'Onde vive'],
  ['capital_disponivel_em', 'Quando o capital fica disponível (concreto)'],
  ['capital_proprio_ou_financiado', 'Capital próprio ou financiado'],
  ['ticket_por_operacao', 'Ticket por operação'],
  ['prazo_maximo_retencao_meses', 'Prazo máximo de retenção'],
  ['roi_minimo_aceitavel', 'ROI mínimo aceitável (depois de alinhar expectativas)'],
  ['tolerancia_imprevistos', 'Tolerância a imprevistos'],
  ['grau_interferencia', 'Grau de interferência que quer ter'],
  ['motivacao', 'Motivação para investir'],
  ['decisores', 'Quem decide'],
]

function perfilDeclarado(inv) {
  const partes = [
    texto(inv.tipo_principal) || texto(inv.tipo_investidor),
    texto(inv.estrategia),
    fmtCapital(inv.capital_min, inv.capital_max) !== 'não indicado' ? fmtCapital(inv.capital_min, inv.capital_max) : null,
    inv.perfil_risco ? `risco ${String(inv.perfil_risco).toLowerCase()}` : null,
    inv.experiencia_imobiliario ? `experiência: ${inv.experiencia_imobiliario}` : null,
    inv.equipa_obras ? `equipa de obras: ${inv.equipa_obras}` : null,
    texto(inv.tipo_imovel_preferido),
    texto(inv.regioes_preferidas) || inv.localizacao_preferida,
    inv.roi_pretendido ? `ROI ${inv.roi_pretendido}${inv.roi_anualizado_pretendido ? ` (anualizado ${inv.roi_anualizado_pretendido})` : ''}` : null,
    inv.preferencia_contacto ? `prefere contacto por ${String(inv.preferencia_contacto).toLowerCase()}` : null,
  ].filter(Boolean)
  return partes.length ? partes.join(', ') : 'não registado'
}

// Incoerências que se veem só com os dados da ficha.
function incoerenciasFicha(inv) {
  const out = []
  for (const k of ['capital_min', 'capital_max']) {
    const n = Number(inv[k])
    if (Number.isFinite(n) && n > 0 && n < 1000) out.push({ campo: k, atual: `${String(n).replace('.', ',')} €`, problema: 'Valor demasiado baixo: provavelmente está em milhares. Confirmar.' })
  }
  if (Number(inv.capital_min) > 0 && Number(inv.capital_max) > 0 && Number(inv.capital_min) > Number(inv.capital_max)) {
    out.push({ campo: 'capital_min', atual: fmtCapital(inv.capital_min, inv.capital_max), problema: 'Capital mínimo maior do que o máximo.' })
  }
  const principal = texto(inv.tipo_principal), tipo = texto(inv.tipo_investidor)
  if (principal && tipo && !normaliza(tipo).includes(normaliza(principal)) && !normaliza(principal).includes(normaliza(tipo))) {
    out.push({ campo: 'tipo_investidor', atual: `${tipo} / principal ${principal}`, problema: 'Tipo de investidor e tipo principal não coincidem.' })
  }
  return out
}

function historialBase(ctx) {
  const ev = []
  if (ctx.investidor.data_primeiro_contacto) ev.push({ data: dia(ctx.investidor.data_primeiro_contacto), canal: 'Primeiro contacto', texto: ctx.investidor.origem ? `Origem: ${ctx.investidor.origem}` : '' })
  for (const x of ctx.interacoes) {
    if (x.origem_ref) continue // o contacto automático repete a reunião ou a gravação
    ev.push({ data: dia(x.data_hora), canal: x.canal || 'Nota', texto: String(x.notas || '').replace(/\s+/g, ' ').slice(0, 240) + (x.resultado === 'Sem sucesso' ? ' (sem sucesso)' : '') })
  }
  for (const r of ctx.reunioes) {
    const resumo = r.resumo_ia?.resumo || r.resumo || (r.tr_len ? 'Transcrição completa no CRM.' : 'Sem resumo nem transcrição.')
    ev.push({ data: dia(r.data), canal: 'Reunião', texto: `${r.titulo || ''}${r.organizador ? ` (${r.organizador})` : ''}: ${String(resumo).replace(/\s+/g, ' ').slice(0, 300)}` })
  }
  for (const g of ctx.gravacoes) {
    ev.push({ data: dia(g.data_chamada), canal: `Chamada gravada (${TIPO_CALL_LABEL[g.tipo_chamada] || g.tipo_chamada})`, texto: String(g.analise?.resumo || g.notas || g.resultado || '').slice(0, 300) })
  }
  for (const t of ctx.tarefas) {
    if (!['Concluída', 'Concluida'].includes(t.status) || String(t.origem_campo || '').startsWith('contacto:')) continue
    ev.push({ data: dia(t.inicio || t.data_limite || t.concluida_em), canal: 'Tarefa concluída', texto: t.tarefa })
  }
  for (const d of ctx.documentos) ev.push({ data: dia(d.created_at), canal: d.direcao === 'Recebido' ? 'Documento recebido' : 'Documento enviado', texto: `${d.tipo || ''} ${d.nome || ''}`.trim() })
  return ev.filter(e => e.data || e.texto).sort((a, b) => String(a.data || '').localeCompare(String(b.data || '')))
}

export function montarSecoesBase(ctx, cls, tipoFinal) {
  const inv = ctx.investidor
  const q = quandoDaTarefa(ctx.tarefa)
  const emFalta = CAMPOS_FORMS.filter(([k]) => vazio(inv[k])).map(([, l]) => l)
  return {
    cabecalho: {
      investidor_id: inv.id, nome: inv.nome, dia: q.dia, hora: q.hora,
      tipo: tipoFinal, tipo_label: TIPO_CALL_LABEL[tipoFinal] || tipoFinal, lead_quente: cls.lead_quente,
      tipo_calculado: cls.tipo, motivo: cls.motivo,
      classe: inv.classificacao || null, pontuacao: inv.pontuacao ?? null, status: inv.status || null,
      capital: fmtCapital(inv.capital_min, inv.capital_max), responsavel: ctx.tarefa.funcionario || 'não atribuído',
      origem: inv.origem || null, primeiro_contacto: dia(inv.data_primeiro_contacto), ultimo_contacto: ctx.ultimo_contacto,
    },
    perfil_declarado: perfilDeclarado(inv),
    historial: historialBase(ctx),
    mudou_somnium: { desde: ctx.mudancas_desde, itens: ctx.mudancas },
    participacoes: ctx.participacoes.map(p => ({ negocio: p.movimento, fase: p.fase, modelo: p.categoria })),
    dados_em_falta: emFalta,
    incoerencias: incoerenciasFicha(inv),
  }
}

// Impressão digital do contexto: se não mudou, não se gera de novo.
async function hashFontes(ctx, tipoFinal) {
  const base = {
    v: VERSAO_PROMPT, tipo: tipoFinal, inicio: ctx.tarefa.inicio || ctx.tarefa.data_limite, func: ctx.tarefa.funcionario,
    inv: ctx.investidor.updated_at,
    i: ctx.interacoes.map(x => [x.id, x.updated_at]),
    r: ctx.reunioes.map(r => [r.id, r.tr_len, r.resumo_len, !!r.resumo_ia]),
    g: ctx.gravacoes.map(g => [g.id, g.updated_at]),
    t: ctx.tarefas.map(t => [t.id, t.status]),
    d: ctx.documentos.map(d => d.id),
    p: ctx.participacoes.map(p => [p.negocio_id, p.fase]),
    m: ctx.mudancas.map(m => [m.negocio_id, m.fase, m.eventos.length]),
  }
  const bytes = new TextEncoder().encode(JSON.stringify(base))
  const h = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(h)).map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 32)
}

function fontesUsadas(ctx) {
  return {
    interacoes: ctx.interacoes.map(x => x.id), reunioes: ctx.reunioes.map(r => r.id), gravacoes: ctx.gravacoes.map(g => g.id),
    tarefas: ctx.tarefas.map(t => t.id), documentos: ctx.documentos.map(d => d.id), negocios: ctx.mudancas.map(m => m.negocio_id),
  }
}

// ── Prompts ────────────────────────────────────────────────────
function promptResumoReuniao(r, transcricao, nomeInvestidor) {
  return `És analista comercial da Somnium Properties (investimento imobiliário em Coimbra e no Grande Porto: CAEP, Fix and Flip, cedência de posição). Resume a transcrição de uma reunião com o potencial investidor ${nomeInvestidor}. O resumo vai ser usado para preparar a próxima call com ele, por isso guarda os factos e as frases exatas que importam.

REGRAS
- Só o que foi dito. Não infiras nem completes. Se algo não aparece, usa null ou lista vazia.
- Distingue o que o INVESTIDOR disse do que a equipa Somnium disse (a transcrição indica quem fala).
- Citações curtas e literais (máximo 20 palavras), tal como estão na transcrição.
- Não incluas dados de saúde nem dados pessoais sensíveis. Situação familiar só se o próprio a referiu e for relevante para a disponibilidade ou o capital.
- Português de Portugal.

TÍTULO: ${r.titulo || ''}
DATA: ${fmtData(r.data)}

Responde APENAS com JSON válido:
{
  "resumo": "3-5 frases: o que aconteceu, como ficou o investidor, como terminou",
  "quem_e": ["factos sobre a pessoa ditos por ela: profissão, onde vive, investimentos atuais, experiência"],
  "dados": { "capital": "texto ou null", "capital_disponivel_quando": "texto ou null", "roi_pretendido": "texto ou null", "estrategia": "texto ou null", "tipo_investidor": "Ativo|Passivo|null", "zona_residencia": "texto ou null", "zonas_investimento": "texto ou null", "horizonte": "texto ou null", "experiencia": "texto ou null" },
  "compromissos": [{ "quem": "investidor|somnium", "o_que": "o que ficou combinado", "quando": "prazo ou null", "citacao": "frase literal ou null" }],
  "objecoes": [{ "objecao": "dúvida ou objeção do investidor", "citacao": "frase literal ou null", "resolvida": true|false }],
  "sinais_alerta": ["expectativas irrealistas, contradições, pouco tempo disponível, etc."],
  "interesse": "alto|medio|baixo|null"
}

--- TRANSCRIÇÃO ---
${transcricao}`
}

function resumoGravacao(g) {
  const a = g.analise || {}
  return {
    data: dia(g.data_chamada), tipo: g.tipo_chamada, resumo: a.resumo || null, objeccoes: a.objeccoes || [],
    dados_recolhidos: a.dados_recolhidos || null, proximo_passo: g.proximo_passo || a.sugestao_proximo_passo || a.proximo_passo || null,
    data_follow_up: g.data_follow_up || a.sugestao_data_follow_up || null, temperatura: g.temperatura || a.sugestao_temperatura || null, notas: g.notas || null,
  }
}

function promptPreparacao(ctx, base, transcricoesBrutas) {
  const inv = ctx.investidor
  const ficha = {}
  for (const k of ['nome', 'status', 'classificacao', 'pontuacao', 'origem', 'tipo_principal', 'tipo_investidor', 'estrategia', 'capital_min', 'capital_max',
    'capital_confirmado', 'perfil_risco', 'roi_pretendido', 'roi_anualizado_pretendido', 'experiencia_imobiliario', 'numero_negocios', 'regioes_preferidas',
    'localizacao_preferida', 'tipo_imovel_preferido', 'equipa_obras', 'preferencia_contacto', 'profissao', 'horizonte_investimento', 'origem_capital',
    'data_primeiro_contacto', 'data_ultimo_contacto', 'data_reuniao', 'motivo_inatividade', 'motivo_nao_aprovacao', 'proxima_acao', 'notas',
    'zona_residencia', 'horario_contacto', 'capital_disponivel_em', 'capital_proprio_ou_financiado', 'ticket_por_operacao',
    'prazo_maximo_retencao_meses', 'roi_minimo_aceitavel', 'tolerancia_imprevistos', 'tolerancia_imprevistos_nota', 'grau_interferencia',
    'investimentos_atuais', 'negocios_concluidos', 'negocios_concluidos_nota', 'motivacao', 'objecoes', 'compromissos', 'decisores',
    'contexto_relacional', 'data_entrevista_estrategica']) {
    if (!vazio(inv[k])) ficha[k] = inv[k]
  }
  const reunioes = ctx.reunioes.map(r => ({
    data: dia(r.data), titulo: r.titulo, organizador: r.organizador, duracao_min: r.duracao_min,
    resumo_estruturado: r.resumo_ia || null, resumo_fireflies: r.resumo || null, action_items: r.action_items || null,
  }))
  const dados = {
    call: { dia: base.cabecalho.dia, hora: base.cabecalho.hora, tipo: base.cabecalho.tipo, lead_quente: base.cabecalho.lead_quente, motivo_tipo: base.cabecalho.motivo, responsavel: base.cabecalho.responsavel },
    hoje: lisboa().dia,
    ficha,
    historial: base.historial,
    reunioes,
    chamadas_gravadas: ctx.gravacoes.map(resumoGravacao),
    tarefas_antigas: ctx.tarefas.map(t => ({ tarefa: t.tarefa, categoria: t.categoria, estado: t.status, data: dia(t.inicio || t.data_limite) })),
    documentos: ctx.documentos.map(d => ({ tipo: d.tipo, nome: d.nome, direcao: d.direcao, data: dia(d.created_at) })),
    participacoes_deste_investidor: ctx.participacoes,
    o_que_mudou_na_somnium: base.mudou_somnium,
    campos_forms_em_falta: base.dados_em_falta,
    incoerencias_detetadas: base.incoerencias,
  }
  const objetivoPadrao = /qualificado em carteira|parceria|negocia/i.test(inv.status || '')
    ? 'O investidor já está qualificado: o objetivo é apresentar um negócio concreto (SOP 11).'
    : 'O objetivo normal é marcar a Entrevista Estratégica com os dois sócios (Alexandre Mendes, CFO, e João Abreu, CEO).'
  return `És o diretor comercial da Somnium Properties (investimento imobiliário em Coimbra e no Grande Porto: CAEP/Cedência de Posição Contratual, Fix and Flip, parcerias). Prepara a ${TIPO_CALL_LABEL[base.cabecalho.tipo] || 'call'} de ${fmtData(base.cabecalho.dia)}${base.cabecalho.hora ? ` às ${base.cabecalho.hora}` : ''} com o investidor ${inv.nome}, segundo o SOP 4 (Procura, registo e classificação de Investidores).

REGRAS OBRIGATÓRIAS
- Usa só os dados abaixo. Não inventes factos, números, datas nem citações. Quando um dado não existe, escreve "não registado".
- Os números (capital, ROI, datas) vêm do CRM, tal como estão.
- Nunca menciones nomes nem montantes de outros investidores. Nunca prometas rentabilidades.
- Citações só se estiverem literalmente nos resumos ou nas notas.
- Num follow-up, a abertura faz referência ao último contacto e ao que ficou combinado. Numa cold call com lead quente, a abertura faz referência ao formulário/landing page que ele preencheu (e, se passou muito tempo, assume a demora). Numa cold call fria, apresenta a Somnium em uma frase.
- ${objetivoPadrao}
- Follow-up estratégico, nunca repetitivo: traz um motivo real (o que mudou na Somnium).
- "correcoes_crm": só valores errados ou incoerentes (ex.: ficha diz Coimbra, a pessoa vive na Maia; capital "30,0005 €") e reuniões sem notas. NÃO incluas campos vazios: esses já vão para "perguntas".
- No "historial", o canal é o que está nos dados: o primeiro contacto usa a origem da ficha (Skool, Landing Page, Grupos Whatsapp...). Não inventes canais nem contactos.
- Português de Portugal, direto, frases curtas. Sem emojis. Sem travessões longos.

DADOS DO CRM (JSON)
${JSON.stringify(dados)}
${transcricoesBrutas ? `\nEXCERTOS DE TRANSCRIÇÕES SEM RESUMO\n${transcricoesBrutas}\n` : ''}
Responde APENAS com JSON válido, sem markdown:
{
  "objetivo_curto": "objetivo da call em até 8 palavras, para a tabela-resumo",
  "quem_e": "o que sabemos da pessoa (profissão, onde vive, investimentos atuais, situação familiar só se foi ela a contar e for relevante) ou \\"não registado\\"",
  "historial": [{ "data": "YYYY-MM-DD", "canal": "Reunião|Chamada|Email|WhatsApp|Nota|Tarefa|Landing page|Forms", "essencial": "o essencial do que foi dito ou feito, 1-2 frases" }],
  "combinado": [{ "quem": "investidor|somnium", "o_que": "compromisso", "quando": "prazo ou null", "citacao": "frase literal ou null" }],
  "objecoes_alertas": [{ "tipo": "objecao|alerta|contradicao", "texto": "descrição concreta" }],
  "abertura": "1 ou 2 frases para abrir a call, entre aspas, na voz de quem liga",
  "antes_de_ligar": ["o que preparar ou confirmar internamente antes da call"],
  "perguntas": ["perguntas a fazer, pela ordem, para preencher os dados em falta e esclarecer contradições"],
  "objetivo": "objetivo da call segundo o SOP 4",
  "proximo_passo": "próximo passo concreto a propor no fim da call",
  "correcoes_crm": [{ "campo": "campo da ficha ou 'reunião'", "atual": "valor atual ou null", "correto": "valor provável ou ação", "fonte": "de onde vem (reunião de DD/MM, nota, landing page)" }]
}`
}

// ── Markdown (exportação e descrição) ─────────────────────────
export function renderMarkdown(base, conteudo) {
  const c = conteudo || {}
  const h = base.cabecalho
  const L = []
  L.push(`# Preparação da call: ${h.nome}`)
  L.push(`**${fmtData(h.dia)}${h.hora ? ` às ${h.hora}` : ''}** · ${h.tipo_label}${h.lead_quente && h.tipo === 'cold_call' ? ' (lead quente)' : ''} · Classe ${h.classe || 's/ classe'}${h.pontuacao != null ? ` (${h.pontuacao} pts)` : ''} · Capital ${h.capital} · Responsável: ${h.responsavel}`)
  L.push(`> Tipo: ${h.motivo}`)
  L.push(`\n## Quem é\n${c.quem_e || 'não registado'}\n\n**Perfil declarado:** ${base.perfil_declarado}`)
  L.push('\n## Historial')
  const hist = Array.isArray(c.historial) && c.historial.length ? c.historial.map(e => `- ${fmtData(e.data)} · ${e.canal}: ${e.essencial}`) : base.historial.map(e => `- ${fmtData(e.data)} · ${e.canal}: ${e.texto}`)
  L.push(hist.length ? hist.join('\n') : 'não registado')
  L.push('\n## O que ficou combinado')
  L.push(Array.isArray(c.combinado) && c.combinado.length ? c.combinado.map(x => `- ${x.quem === 'somnium' ? 'Somnium' : 'Investidor'}: ${x.o_que}${x.quando ? ` (${x.quando})` : ''}${x.citacao ? ` "${x.citacao}"` : ''}`).join('\n') : 'não registado')
  L.push('\n## Objeções e sinais de alerta')
  L.push(Array.isArray(c.objecoes_alertas) && c.objecoes_alertas.length ? c.objecoes_alertas.map(x => `- ${x.texto}`).join('\n') : 'não registado')
  L.push(`\n## O que mudou na Somnium desde ${fmtData(base.mudou_somnium.desde)}`)
  L.push(base.mudou_somnium.itens.length ? base.mudou_somnium.itens.map(m => `- ${m.nome} (${m.modelo || 'negócio'}${m.regiao ? `, ${m.regiao}` : ''}): ${m.eventos.map(e => `${e.texto} a ${fmtData(e.data)}`).join('; ')}`).join('\n') : 'Sem negócios novos nem mudanças de fase registadas no CRM.')
  L.push(`\n## Abertura sugerida\n${c.abertura || 'não gerada'}`)
  if (Array.isArray(c.antes_de_ligar) && c.antes_de_ligar.length) L.push(`\n## Antes de ligar\n${c.antes_de_ligar.map(x => `- ${x}`).join('\n')}`)
  L.push('\n## Perguntas e dados em falta')
  const perg = Array.isArray(c.perguntas) && c.perguntas.length ? c.perguntas : base.dados_em_falta.map(x => `${x}?`)
  L.push(perg.length ? perg.map(x => `- ${x}`).join('\n') : 'Ficha completa.')
  L.push(`\n## Objetivo e próximo passo\n${c.objetivo || 'Marcar a Entrevista Estratégica com os dois sócios.'}${c.proximo_passo ? `\n\nPróximo passo: ${c.proximo_passo}` : ''}`)
  const corr = [...(Array.isArray(c.correcoes_crm) ? c.correcoes_crm.map(x => `${x.campo}: ${x.atual ?? '—'} → ${x.correto}${x.fonte ? ` (${x.fonte})` : ''}`) : []),
    ...base.incoerencias.map(x => `${x.campo}: ${x.atual}. ${x.problema}`)]
  L.push(`\n## Correções ao CRM\n${corr.length ? corr.map(x => `- [ ] ${x}`).join('\n') : 'Nenhuma.'}`)
  return L.join('\n')
}

// ── Gerar / atualizar a preparação de uma tarefa ──────────────
async function lerPrep(pool, tarefaId) {
  const { rows: [p] } = await pool.query('SELECT * FROM preparacao_calls WHERE tarefa_id = $1', [tarefaId])
  return p || null
}

// opcoes.gerar: pôr o texto na fila da IA se o contexto mudou (sem ela, só
//   atualiza a classificação e os dados do CRM e marca "desatualizado").
// opcoes.forcar: gerar mesmo sem mudanças (botão "Regenerar").
export async function prepararCall(pool, tarefaId, { gerar = true, forcar = false } = {}) {
  await ensurePreparacaoTables(pool)
  const { rows: [tarefa] } = await pool.query('SELECT * FROM tarefas WHERE id = $1', [tarefaId])
  if (!ehCallInvestidor(tarefa)) return null
  let ctx = await recolherContexto(pool, tarefa)
  if (!ctx) return null
  let prep = await lerPrep(pool, tarefaId)

  // 1. Tipo de call.
  const cls = classificarTipo(ctx)
  const tipoAgendado = CATEGORIAS_CALL_INV[tarefa.categoria]
  let tipoFinal
  if (prep?.tipo_origem === 'manual' && TIPOS_CALL.includes(prep.tipo_final)) tipoFinal = prep.tipo_final
  else if (tipoAgendado === 'discovery_call') tipoFinal = 'discovery_call' // reunião: não se reclassifica
  else if (cls.tipo === 'a_confirmar') tipoFinal = tipoAgendado
  else tipoFinal = cls.tipo
  let corrigido = null
  const rotulo = TIPO_CALL_LABEL[tipoFinal]
  if (tarefa.origem_campo === 'proximo_contacto'
    && (tipoAgendado !== tipoFinal || !String(tarefa.tarefa || '').startsWith(`${rotulo} — `))) {
    if (await definirTipoContacto(pool, 'investidor', tarefa.origem_id, tarefa.id, tipoFinal)) {
      corrigido = tipoAgendado !== tipoFinal ? agora() : null
      const { rows: [t2] } = await pool.query('SELECT * FROM tarefas WHERE id = $1', [tarefaId])
      ctx = { ...ctx, tarefa: t2 }
    }
  }

  // 2. Dados do CRM e impressão digital.
  const base = montarSecoesBase(ctx, cls, tipoFinal)
  const hash = await hashFontes(ctx, tipoFinal)
  const comum = [tarefa.origem_id, tipoAgendado, cls.tipo, tipoFinal, cls.lead_quente, cls.motivo, JSON.stringify(base), JSON.stringify(fontesUsadas(ctx)), hash, agora()]
  if (!prep) {
    const { rows: [novo] } = await pool.query(
      `INSERT INTO preparacao_calls (id, tarefa_id, investidor_id, tipo_agendado, tipo_calculado, tipo_final, lead_quente, motivo_classificacao,
         secoes_base, fontes_usadas, fontes_hash, tipo_corrigido_em, estado, created_at, updated_at)
       VALUES ($11, $12, $1, $2, $3, $4, $5, $6, $7, $8, $9, $13, 'pendente', $10, $10)
       ON CONFLICT (tarefa_id) DO NOTHING RETURNING *`,
      [...comum, crypto.randomUUID(), tarefaId, corrigido])
    prep = novo || await lerPrep(pool, tarefaId)
  } else {
    const { rows: [atual] } = await pool.query(
      `UPDATE preparacao_calls SET investidor_id = $1, tipo_calculado = $3, tipo_final = $4, lead_quente = $5, motivo_classificacao = $6,
         secoes_base = $7, fontes_usadas = $8, fontes_hash = $9, updated_at = $10,
         tipo_agendado = CASE WHEN $12::text IS NOT NULL THEN $2 ELSE tipo_agendado END,
         tipo_corrigido_em = COALESCE($12, tipo_corrigido_em)
       WHERE tarefa_id = $11 RETURNING *`,
      [...comum, tarefaId, corrigido])
    prep = atual
  }

  // 3. Texto pela IA (só se o contexto mudou).
  const jaPedido = prep.hash_gerado === hash && ['gerado', 'a_gerar', 'aguarda_resumos'].includes(prep.estado)
  if (jaPedido && !forcar) return prep
  if (!gerar && prep.conteudo_json && !forcar) {
    if (prep.estado !== 'desatualizado') prep = (await pool.query(`UPDATE preparacao_calls SET estado = 'desatualizado' WHERE id = $1 RETURNING *`, [prep.id])).rows[0]
    return prep
  }

  // Transcrições ainda sem resumo: resumir primeiro (uma única vez por reunião).
  const semResumo = ctx.reunioes.filter(r => !r.resumo_ia && Number(r.tr_len) >= MIN_TRANSCRICAO_RESUMO)
  const aEsperar = []
  const falhados = []
  for (const r of semResumo) {
    const est = await estadoIA(pool, TIPO_FILA_RESUMO, r.id)
    if (est?.estado === 'erro') { falhados.push(r); continue }
    aEsperar.push(r)
    if (!emFilaIA(est)) {
      const { rows: [comTexto] } = await pool.query('SELECT transcricao FROM reunioes WHERE id = $1', [r.id])
      await enfileirarIA(pool, { tipo: TIPO_FILA_RESUMO, ref_id: r.id, prompt: promptResumoReuniao(r, comTexto?.transcricao || '', ctx.investidor.nome), contexto: { investidor_id: tarefa.origem_id } })
    }
  }
  if (aEsperar.length) {
    return (await pool.query(`UPDATE preparacao_calls SET estado = 'aguarda_resumos', hash_gerado = $2, erro = NULL, updated_at = $3 WHERE id = $1 RETURNING *`,
      [prep.id, hash, agora()])).rows[0]
  }
  let brutas = ''
  for (const r of falhados) {
    const { rows: [x] } = await pool.query('SELECT left(transcricao, 6000) AS t FROM reunioes WHERE id = $1', [r.id])
    brutas += `\n[Reunião ${fmtData(r.data)}]\n${x?.t || ''}\n`
  }
  const pedido = await enfileirarIA(pool, { tipo: TIPO_FILA_PREPARACAO, ref_id: tarefaId, prompt: promptPreparacao(ctx, base, brutas), contexto: { hash } })
  return (await pool.query(`UPDATE preparacao_calls SET estado = 'a_gerar', hash_gerado = $2, modelo = $3, erro = NULL, updated_at = $4 WHERE id = $1 RETURNING *`,
    [prep.id, hash, pedido.modelo || 'sonnet', agora()])).rows[0]
}

// ── Aplicadores da fila IA ────────────────────────────────────
export async function aplicarResumoReuniao(pool, pedido, textoResposta) {
  await ensurePreparacaoTables(pool)
  const resumo = jsonDaResposta(textoResposta)
  const { rows: [r] } = await pool.query(
    `UPDATE reunioes SET resumo_ia = $2, resumo_ia_em = $3 WHERE id = $1 RETURNING entidade_id`,
    [pedido.ref_id, JSON.stringify(resumo), agora()])
  // Preparações que estavam à espera deste resumo seguem para a geração.
  if (r?.entidade_id) {
    const { rows } = await pool.query(`SELECT tarefa_id FROM preparacao_calls WHERE investidor_id = $1 AND estado = 'aguarda_resumos'`, [r.entidade_id])
    for (const p of rows) await prepararCall(pool, p.tarefa_id, { gerar: true, forcar: true })
  }
  return { reuniao_id: pedido.ref_id }
}

export async function aplicarPreparacao(pool, pedido, textoResposta) {
  await ensurePreparacaoTables(pool)
  const conteudo = jsonDaResposta(textoResposta)
  const prep = await lerPrep(pool, pedido.ref_id)
  if (!prep) return { ignorado: true }
  const md = renderMarkdown(prep.secoes_base || { cabecalho: {}, historial: [], mudou_somnium: { itens: [] }, dados_em_falta: [], incoerencias: [] }, conteudo)
  const hashPedido = pedido.contexto?.hash || null
  const estado = hashPedido && prep.fontes_hash && hashPedido !== prep.fontes_hash ? 'desatualizado' : 'gerado'
  await pool.query(
    `UPDATE preparacao_calls SET conteudo_json = $2, conteudo_md = $3, estado = $4, erro = NULL, gerado_em = $5, modelo = COALESCE($6, modelo), updated_at = $5 WHERE id = $1`,
    [prep.id, JSON.stringify(conteudo), md, estado, agora(), pedido.modelo || null])
  return { preparacao_id: prep.id, estado }
}

// ── Leitura ───────────────────────────────────────────────────
async function comEstadoIA(pool, p) {
  if (!p) return null
  if (['a_gerar', 'aguarda_resumos'].includes(p.estado)) {
    const est = await estadoIA(pool, TIPO_FILA_PREPARACAO, p.tarefa_id)
    if (p.estado === 'a_gerar' && est?.estado === 'erro') return { ...p, estado: 'erro', erro: est.erro || 'A IA falhou' }
  }
  if (!p.conteudo_md && p.secoes_base) p.conteudo_md = renderMarkdown(p.secoes_base, null)
  return p
}

export async function lerPreparacao(pool, tarefaId, { criar = true } = {}) {
  await ensurePreparacaoTables(pool)
  let p = await lerPrep(pool, tarefaId)
  if (!p && criar) p = await prepararCall(pool, tarefaId, { gerar: true })
  if (!p) return null
  const { rows: [t] } = await pool.query('SELECT id, tarefa, categoria, inicio, data_limite, funcionario, status, gcal_event_id FROM tarefas WHERE id = $1', [tarefaId])
  return { ...(await comEstadoIA(pool, p)), tarefa: t || null }
}

export async function preparacoesDoInvestidor(pool, investidorId) {
  await ensurePreparacaoTables(pool)
  // Calls abertas deste investidor sem preparação: criar agora.
  const { rows: abertas } = await pool.query(
    `SELECT id FROM tarefas t WHERE origem_tipo = 'investidor' AND origem_id = $1 AND categoria = ANY($2) AND ${ABERTA}
       AND NOT EXISTS (SELECT 1 FROM preparacao_calls p WHERE p.tarefa_id = t.id)`, [investidorId, Object.keys(CATEGORIAS_CALL_INV)])
  for (const t of abertas) await prepararCall(pool, t.id, { gerar: true }).catch(e => console.error('[preparacao]', e.message))
  const { rows } = await pool.query(
    `SELECT p.*, t.tarefa AS tarefa_titulo, t.inicio AS tarefa_inicio, t.data_limite AS tarefa_data, t.status AS tarefa_status, t.funcionario AS tarefa_funcionario
     FROM preparacao_calls p LEFT JOIN tarefas t ON t.id = p.tarefa_id
     WHERE p.investidor_id = $1 ORDER BY COALESCE(t.inicio, t.data_limite) DESC NULLS LAST`, [investidorId])
  return Promise.all(rows.map(r => comEstadoIA(pool, r)))
}

// Calls de investidores entre duas datas (vista da semana e PDF).
// agendadoPor: só as calls que esse utilizador agendou (tarefas.user_id); as
// tarefas sem autor registado aparecem a todos. Sem ele: todas.
export async function preparacoesSemana(pool, { desde, ate, agendadoPor = null }) {
  await ensurePreparacaoTables(pool)
  const { rows: tarefas } = await pool.query(
    `SELECT id FROM tarefas WHERE origem_tipo = 'investidor' AND categoria = ANY($1)
       AND COALESCE(arquivada, false) = false AND tarefa NOT LIKE 'Cancelada:%'
       AND left(COALESCE(inicio, data_limite), 10) BETWEEN $2 AND $3
       ${agendadoPor ? 'AND (user_id = $4 OR user_id IS NULL)' : ''}`,
    agendadoPor ? [Object.keys(CATEGORIAS_CALL_INV), desde, ate, agendadoPor] : [Object.keys(CATEGORIAS_CALL_INV), desde, ate])
  for (const t of tarefas) {
    const p = await lerPrep(pool, t.id)
    if (!p) await prepararCall(pool, t.id, { gerar: true }).catch(e => console.error('[preparacao]', e.message))
  }
  const { rows } = await pool.query(
    `SELECT p.*, t.tarefa AS tarefa_titulo, t.inicio AS tarefa_inicio, t.data_limite AS tarefa_data, t.status AS tarefa_status, t.funcionario AS tarefa_funcionario,
            i.nome AS investidor_nome, i.classificacao, i.pontuacao
     FROM preparacao_calls p JOIN tarefas t ON t.id = p.tarefa_id JOIN investidores i ON i.id = p.investidor_id
     WHERE p.tarefa_id = ANY($1)`, [tarefas.map(t => t.id)])
  const lista = await Promise.all(rows.map(r => comEstadoIA(pool, r)))
  const chave = (p) => { const q = quandoDaTarefa({ inicio: p.tarefa_inicio, data_limite: p.tarefa_data }); return `${q.dia || '9'} ${q.hora || '99:99'}` }
  lista.sort((a, b) => chave(a).localeCompare(chave(b)))
  // "O que mudou" da semana: desde o último contacto mais antigo dos follow-ups.
  const desdes = lista.filter(p => p.tipo_final !== 'cold_call').map(p => p.secoes_base?.mudou_somnium?.desde).filter(Boolean).sort()
  const mudou = desdes.length ? { desde: desdes[0], itens: await mudancasSomnium(pool, desdes[0]) } : { desde: null, itens: [] }
  return { periodo: { desde, ate }, filtro: agendadoPor ? 'minhas' : 'todas', preparacoes: lista, mudou_somnium: mudou }
}

// Correção manual do tipo (nunca mais é recalculado).
export async function corrigirTipoCall(pool, tarefaId, tipo) {
  await ensurePreparacaoTables(pool)
  if (!TIPOS_CALL.includes(tipo)) throw new Error('Tipo de call inválido')
  let p = await lerPrep(pool, tarefaId)
  if (!p) p = await prepararCall(pool, tarefaId, { gerar: false })
  if (!p) throw new Error('Esta tarefa não é uma call com investidor')
  await pool.query(`UPDATE preparacao_calls SET tipo_final = $2, tipo_origem = 'manual', tipo_corrigido_em = NULL, updated_at = $3 WHERE tarefa_id = $1`, [tarefaId, tipo, agora()])
  return prepararCall(pool, tarefaId, { gerar: true, forcar: true })
}

// Tipo a pré-selecionar ao carregar a gravação de uma chamada deste investidor:
// o da call mais próxima de hoje (passada há ≤3 dias ou futura); sem ela, o histórico.
export async function tipoChamadaSugerido(pool, investidorId) {
  await ensurePreparacaoTables(pool)
  const { rows } = await pool.query(
    `SELECT p.tipo_final, p.motivo_classificacao, COALESCE(t.inicio, t.data_limite) AS quando
     FROM preparacao_calls p JOIN tarefas t ON t.id = p.tarefa_id WHERE p.investidor_id = $1`, [investidorId])
  const hoje = lisboa().dia
  const tresDias = new Date(Date.now() - 3 * 86400000).toISOString().slice(0, 10)
  const perto = rows.filter(r => dia(r.quando) >= tresDias).sort((a, b) => String(a.quando).localeCompare(String(b.quando)))
  const daCall = perto.find(r => dia(r.quando) <= hoje) || perto[0]
  const mapa = (t) => (t === 'discovery_call' ? 'follow_up' : t)
  if (daCall && ['cold_call', 'follow_up', 'discovery_call'].includes(daCall.tipo_final)) return { tipo: mapa(daCall.tipo_final), motivo: daCall.motivo_classificacao, fonte: 'preparacao' }
  const ctx = await recolherContexto(pool, { id: '__nenhuma__', origem_id: investidorId, inicio: null })
  if (!ctx) return { tipo: 'cold_call', motivo: null, fonte: 'padrao' }
  const cls = classificarTipo(ctx)
  return { tipo: cls.tipo === 'follow_up' ? 'follow_up' : 'cold_call', motivo: cls.motivo, fonte: 'historico' }
}

// ── Cron (de hora a hora) ─────────────────────────────────────
// Calls dos próximos 14 dias: sem preparação => gera; véspera ou próprio dia
// com contexto alterado => regenera (D-1, SOP 10); mais à frente => só marca
// "desatualizado" (regenera na véspera, ou pelo botão).
export async function sincronizarPreparacoes(pool) {
  await ensurePreparacaoTables(pool)
  const hoje = lisboa().dia
  const amanha = lisboa(new Date(Date.now() + 86400000)).dia
  const fim = lisboa(new Date(Date.now() + DIAS_JANELA * 86400000)).dia
  const { rows } = await pool.query(
    `SELECT id, inicio, data_limite FROM tarefas WHERE origem_tipo = 'investidor' AND categoria = ANY($1) AND ${ABERTA}
       AND left(COALESCE(inicio, data_limite), 10) BETWEEN $2 AND $3`,
    [Object.keys(CATEGORIAS_CALL_INV), hoje, fim])
  const res = { total: rows.length, geradas: 0, desatualizadas: 0, erros: 0 }
  for (const t of rows) {
    try {
      const antes = await lerPrep(pool, t.id)
      const d = quandoDaTarefa(t).dia
      const p = await prepararCall(pool, t.id, { gerar: !antes || !antes.conteudo_json || d <= amanha })
      if (p && ['a_gerar', 'aguarda_resumos'].includes(p.estado) && p.hash_gerado !== antes?.hash_gerado) res.geradas++
      if (p?.estado === 'desatualizado') res.desatualizadas++
    } catch (e) { res.erros++; console.error('[preparacao cron]', t.id, e.message) }
  }
  return res
}
