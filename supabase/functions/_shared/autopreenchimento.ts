// @ts-nocheck
/**
 * Preenchimento automático da ficha do investidor a partir das calls gravadas
 * (investidor_gravacoes) e das reuniões (reunioes), com prova.
 *
 * Fluxo:
 *   1. a análise SOP 23 de uma gravação termina (chamadasInvestidor) ou a
 *      análise de uma reunião é aplicada (meetingAnalysis) => põe na fila IA um
 *      pedido 'extracao_investidor' com a transcrição completa;
 *   2. o Claude no Mac devolve, campo a campo, valor + confiança + citação;
 *   3. aplicarExtracao escreve segundo as regras:
 *        - campo vazio + confiança alta/média => escreve e marca "preenchido por IA";
 *        - campo preenchido com outro valor => sugestão pendente (nunca sobrescreve);
 *        - confiança baixa => só sugestão;
 *        - campo apagado/editado à mão (historico_alteracoes) => só sugestão;
 *        - listas (objeções, compromissos, investimentos) => acrescenta, não apaga;
 *        - modo backfill => tudo fica como sugestão.
 *      Cada valor fica em investidor_campos_ia (proveniência, sugestões,
 *      reversão) e as escritas em historico_alteracoes com o autor "IA".
 *   4. para as gravações, o registo da call (resultado, próximo passo,
 *      temperatura, follow-up), o contacto feito e a próxima tarefa ficam
 *      registados sem intervenção (aplicarRegistoCall).
 *
 * Gémeo Node em src/db/autopreenchimento.js — o código é o mesmo, só mudam os
 * imports. Portar qualquer alteração para os dois.
 */
import { enfileirarIA, jsonDaResposta, compactarTranscricao } from "./filaIA.ts"
import { withAuditUser } from "./audit.ts"
import { registarContactoPessoa, agendarContactoPessoa, definirTipoContacto } from "./contactoPessoa.ts"
import { prepararCall } from "./preparacaoCall.ts"
import { CRITERIOS_DISCOVERY, normalizarNota } from "./classeInvestidor.js"
import { classificarAutomaticamente } from "./classificacaoInvestidor.ts"

export const TIPO_FILA_EXTRACAO = 'extracao_investidor'
const agora = () => new Date().toISOString()
const AUTOR_IA = { email: 'ia@somnium.local', id: 'ia' }

// ── Catálogo dos campos que a IA pode preencher ───────────────
// tipo: texto | numero | inteiro | data | enum | array (JSON de strings) | lista (JSONB de objetos)
export const CAMPOS_IA = {
  profissao: { label: 'Profissão', tipo: 'texto', guia: 'profissão ou área de trabalho' },
  zona_residencia: { label: 'Zona de residência', tipo: 'texto', guia: 'onde vive (não confundir com a zona onde quer investir)' },
  regioes_preferidas: { label: 'Zonas de investimento', tipo: 'array', guia: 'zonas onde quer investir: Coimbra, Porto, Gaia, Aveiro, AMP, Lisboa...' },
  horario_contacto: { label: 'Horário de contacto', tipo: 'texto', guia: 'quando prefere ser contactado (ex.: "só depois das 17:30")' },
  capital_min: { label: 'Capital mínimo', tipo: 'numero', guia: 'em euros' },
  capital_max: { label: 'Capital máximo', tipo: 'numero', guia: 'em euros' },
  capital_confirmado: { label: 'Capital confirmado', tipo: 'numero', guia: 'capital que disse ter de facto disponível, em euros' },
  capital_disponivel_em: { label: 'Capital disponível em', tipo: 'texto', guia: 'quando o capital fica disponível (ex.: "a partir de junho", "quando decidir a compra de casa")' },
  capital_proprio_ou_financiado: { label: 'Capital próprio ou financiado', tipo: 'enum', valores: ['proprio', 'financiamento', 'misto', 'nao_sabe'] },
  origem_capital: { label: 'Origem do capital', tipo: 'texto', guia: 'poupanças, venda de empresa, herança...' },
  ticket_por_operacao: { label: 'Ticket por operação', tipo: 'numero', guia: 'quanto quer pôr por operação, em euros' },
  prazo_maximo_retencao_meses: { label: 'Prazo máximo de retenção (meses)', tipo: 'inteiro' },
  horizonte_investimento: { label: 'Horizonte de investimento', tipo: 'texto' },
  roi_pretendido: { label: 'ROI pretendido', tipo: 'texto' },
  roi_minimo_aceitavel: { label: 'ROI mínimo aceitável', tipo: 'texto', guia: 'o valor depois de alinhar expectativas na call' },
  perfil_risco: { label: 'Perfil de risco', tipo: 'enum', valores: ['Conservador', 'Moderado', 'Agressivo'] },
  tolerancia_imprevistos: { label: 'Tolerância a imprevistos', tipo: 'enum', valores: ['baixa', 'media', 'alta'] },
  tolerancia_imprevistos_nota: { label: 'Tolerância a imprevistos (nota)', tipo: 'texto' },
  grau_interferencia: { label: 'Grau de interferência', tipo: 'enum', valores: ['nenhum', 'acompanha', 'quer_decidir'] },
  estrategia: { label: 'Estratégia', tipo: 'array', guia: 'CAEP, Fix and Flip, Cedência de posição, Wholesaling' },
  tipo_imovel_preferido: { label: 'Tipo de imóvel', tipo: 'array', guia: 'Apartamento, Moradia, Edifício, T1, T2...' },
  experiencia_imobiliario: { label: 'Experiência imobiliária', tipo: 'texto' },
  negocios_concluidos: { label: 'Negócios concluídos', tipo: 'inteiro', guia: 'número real de negócios imobiliários já feitos' },
  negocios_concluidos_nota: { label: 'Negócios concluídos (detalhe)', tipo: 'texto' },
  equipa_obras: { label: 'Equipa de obras', tipo: 'texto' },
  motivacao: { label: 'Motivação', tipo: 'texto', guia: 'porque quer investir ("diversificar", "não perder para a inflação")' },
  decisores: { label: 'Decisores', tipo: 'texto', guia: 'quem decide e a relação entre eles' },
  contexto_relacional: { label: 'Contexto relacional', tipo: 'texto', guia: 'só o que a pessoa partilhou e ajuda a relação (hobbies, ligação à zona). Nunca saúde nem finanças pessoais sensíveis' },
  data_entrevista_estrategica: { label: 'Entrevista Estratégica', tipo: 'data' },
  proxima_acao: { label: 'Próxima ação', tipo: 'texto' },
  // listas: acrescentam entradas
  investimentos_atuais: { label: 'Investimentos atuais', tipo: 'lista' },
  objecoes: { label: 'Objeções', tipo: 'lista' },
  compromissos: { label: 'Compromissos', tipo: 'lista' },
}
// Campos que aparecem como "por recolher" no ecrã Rever call e na preparação.
export const CAMPOS_A_RECOLHER = ['profissao', 'zona_residencia', 'capital_max', 'capital_disponivel_em', 'capital_proprio_ou_financiado',
  'origem_capital', 'ticket_por_operacao', 'prazo_maximo_retencao_meses', 'roi_minimo_aceitavel', 'tolerancia_imprevistos',
  'grau_interferencia', 'negocios_concluidos', 'motivacao', 'decisores', 'horizonte_investimento']

let _tabelas = false
export async function ensureAutopreenchimento(pool) {
  if (_tabelas) return
  // ALTER TABLE pede um bloqueio exclusivo mesmo com IF NOT EXISTS: só se faz se faltar.
  const { rows: [ok] } = await pool.query(
    `SELECT to_regclass('public.investidor_campos_ia') IS NOT NULL AS t,
            EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'reunioes' AND column_name = 'extracao_ia') AS c`)
  if (ok?.t && ok?.c) { _tabelas = true; return }
  await pool.query(`
    ALTER TABLE investidores ADD COLUMN IF NOT EXISTS capital_disponivel_em TEXT;
    ALTER TABLE investidores ADD COLUMN IF NOT EXISTS capital_proprio_ou_financiado TEXT;
    ALTER TABLE investidores ADD COLUMN IF NOT EXISTS ticket_por_operacao NUMERIC;
    ALTER TABLE investidores ADD COLUMN IF NOT EXISTS prazo_maximo_retencao_meses INTEGER;
    ALTER TABLE investidores ADD COLUMN IF NOT EXISTS roi_minimo_aceitavel TEXT;
    ALTER TABLE investidores ADD COLUMN IF NOT EXISTS tolerancia_imprevistos TEXT;
    ALTER TABLE investidores ADD COLUMN IF NOT EXISTS tolerancia_imprevistos_nota TEXT;
    ALTER TABLE investidores ADD COLUMN IF NOT EXISTS grau_interferencia TEXT;
    ALTER TABLE investidores ADD COLUMN IF NOT EXISTS investimentos_atuais JSONB;
    ALTER TABLE investidores ADD COLUMN IF NOT EXISTS negocios_concluidos INTEGER;
    ALTER TABLE investidores ADD COLUMN IF NOT EXISTS negocios_concluidos_nota TEXT;
    ALTER TABLE investidores ADD COLUMN IF NOT EXISTS motivacao TEXT;
    ALTER TABLE investidores ADD COLUMN IF NOT EXISTS objecoes JSONB;
    ALTER TABLE investidores ADD COLUMN IF NOT EXISTS compromissos JSONB;
    ALTER TABLE investidores ADD COLUMN IF NOT EXISTS decisores TEXT;
    ALTER TABLE investidores ADD COLUMN IF NOT EXISTS zona_residencia TEXT;
    ALTER TABLE investidores ADD COLUMN IF NOT EXISTS horario_contacto TEXT;
    ALTER TABLE investidores ADD COLUMN IF NOT EXISTS contexto_relacional TEXT;
    ALTER TABLE investidores ADD COLUMN IF NOT EXISTS data_entrevista_estrategica TEXT;
    CREATE TABLE IF NOT EXISTS investidor_campos_ia (
      id TEXT PRIMARY KEY,
      investidor_id TEXT NOT NULL REFERENCES investidores(id) ON DELETE CASCADE,
      campo TEXT NOT NULL, valor JSONB, valor_anterior JSONB, confianca TEXT, evidencia TEXT, minuto TEXT,
      origem_tipo TEXT NOT NULL, origem_id TEXT NOT NULL, origem_data TEXT,
      modo TEXT NOT NULL DEFAULT 'auto', estado TEXT NOT NULL, motivo TEXT,
      decidido_por TEXT, decidido_em TEXT, created_at TEXT DEFAULT (NOW()::TEXT)
    );
    CREATE INDEX IF NOT EXISTS idx_campos_ia_investidor ON investidor_campos_ia(investidor_id, estado);
    CREATE INDEX IF NOT EXISTS idx_campos_ia_origem ON investidor_campos_ia(origem_tipo, origem_id);
    ALTER TABLE investidor_gravacoes ADD COLUMN IF NOT EXISTS extracao JSONB;
    ALTER TABLE reunioes ADD COLUMN IF NOT EXISTS extracao_ia JSONB;
  `)
  _tabelas = true
}

// ── Utilitários ───────────────────────────────────────────────
const norm = (s) => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim()
const dia = (v) => (/^\d{4}-\d{2}-\d{2}/.test(String(v || '')) ? String(v).slice(0, 10) : null)
const fmtData = (v) => { const d = dia(v); return d ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}` : '' }
function parseArray(v) {
  if (v == null || v === '') return []
  if (Array.isArray(v)) return v
  const s = String(v).trim()
  if (s.startsWith('[')) { try { const a = JSON.parse(s); return Array.isArray(a) ? a : [] } catch { return [] } }
  return s.split(/[;,]\s*/).filter(Boolean)
}
function parseLista(v) {
  if (Array.isArray(v)) return v
  if (typeof v === 'string' && v.trim().startsWith('[')) { try { return JSON.parse(v) } catch { return [] } }
  return []
}
export function vazio(v) {
  if (v == null) return true
  if (typeof v === 'number') return v === 0
  if (Array.isArray(v)) return v.length === 0
  const s = String(v).trim()
  return s === '' || s === '[]' || s === '{}' || s === 'null'
}
function numero(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  const s = String(v ?? '').toLowerCase().replace(/€|eur(os)?/g, '').trim()
  const m = s.match(/(\d+(?:[.,]\d+)?)\s*(mil|k|m€|milh[oõ]es|m\b)?/)
  if (!m) return null
  let n = parseFloat(m[1].replace(/\.(?=\d{3}\b)/g, '').replace(',', '.'))
  if (/mil|k/.test(m[2] || '')) n *= 1000
  else if (/milh|m€|^m$/.test(m[2] || '')) n *= 1_000_000
  return Number.isFinite(n) ? n : null
}
const escolhe = (v, valores) => valores.find(x => norm(x) === norm(v).replace(/ /g, '_')) || valores.find(x => norm(x) === norm(v)) || null

// Valor da IA => valor a gravar na coluna (ou null se não serve).
export function normalizar(campo, valor) {
  const def = CAMPOS_IA[campo]
  if (!def || valor == null || valor === '') return null
  switch (def.tipo) {
    case 'numero': { const n = numero(valor); return n && n > 0 ? n : null }
    case 'inteiro': { const n = numero(valor); return n != null && n >= 0 ? Math.round(n) : null }
    case 'data': return dia(valor)
    case 'enum': return escolhe(valor, def.valores)
    case 'array': { const a = Array.isArray(valor) ? valor : parseArray(valor); const l = a.map(x => String(x).trim()).filter(Boolean); return l.length ? l : null }
    case 'texto': { const s = String(valor).trim(); return s ? s.slice(0, 600) : null }
    default: return null
  }
}
// Valor tal como a coluna o guarda (arrays em texto JSON, como o resto da ficha).
const paraColuna = (campo, v) => (CAMPOS_IA[campo]?.tipo === 'array' ? JSON.stringify(v) : CAMPOS_IA[campo]?.tipo === 'lista' ? JSON.stringify(v) : v)
function iguais(campo, atual, novo) {
  const def = CAMPOS_IA[campo]
  if (def.tipo === 'array') {
    const a = new Set(parseArray(atual).map(norm)); const b = parseArray(novo).map(norm)
    return b.every(x => a.has(x))
  }
  if (def.tipo === 'numero' || def.tipo === 'inteiro') return Number(atual) === Number(novo)
  return norm(atual) === norm(novo) || norm(atual).includes(norm(novo))
}
export function formatarValor(campo, v) {
  if (v == null) return '—'
  const def = CAMPOS_IA[campo]
  if (!def) return typeof v === 'object' ? JSON.stringify(v) : String(v)
  if (def.tipo === 'array') return parseArray(v).join(', ')
  if (def.tipo === 'numero') return `${Number(v).toLocaleString('pt-PT')} €`
  if (def.tipo === 'data') return fmtData(v)
  if (def.tipo === 'lista') {
    if (Array.isArray(v)) return v.map(x => x.objecao || x.o_que || x.descricao || '').filter(Boolean).join('; ')
    return v.objecao || v.o_que || v.descricao || JSON.stringify(v)
  }
  return String(v)
}

// ── Prompt de extração ────────────────────────────────────────
function fichaParaPrompt(inv) {
  const out = {}
  for (const k of [...Object.keys(CAMPOS_IA), 'nome', 'status', 'origem', 'tipo_principal', 'roi_anualizado_pretendido', 'classificacao', 'notas']) {
    if (!vazio(inv[k])) out[k] = inv[k]
  }
  return out
}

export function promptExtracao({ investidor, transcricao, origem, formularios }) {
  const camposTxt = Object.entries(CAMPOS_IA).filter(([, d]) => d.tipo !== 'lista')
    .map(([k, d]) => `- ${k} (${d.tipo}${d.valores ? `: ${d.valores.join(' | ')}` : ''})${d.guia ? `: ${d.guia}` : ''}`).join('\n')
  const objecoes = parseLista(investidor.objecoes).map((o, i) => ({ i, objecao: o.objecao, resolvida: !!o.resolvida }))
  const compromissos = parseLista(investidor.compromissos).map((c, i) => ({ i, quem: c.quem, o_que: c.o_que, cumprido: !!c.cumprido }))
  return `És analista da Somnium Properties (investimento imobiliário em Coimbra e no Grande Porto: CAEP, Fix and Flip, cedência de posição). Extrai da transcrição de uma ${origem.tipo === 'reuniao' ? 'reunião' : `chamada (${origem.tipo_chamada === 'follow_up' ? 'follow-up' : origem.tipo_chamada === 'discovery' ? 'discovery call' : 'cold call'})`} de ${fmtData(origem.data)} com o investidor ${investidor.nome} os dados que servem para preencher a ficha dele no CRM.

REGRAS
- Só o que foi DITO pelo investidor sobre si próprio, ou combinado explicitamente entre os dois lados. Não infiras, não completes, não deduzas.
- Distingue quem fala. ${origem.tipo === 'reuniao' ? 'As linhas da equipa começam por "[Somnium Properties]".' : 'Esta transcrição não identifica quem fala: deduz pelo conteúdo e, na dúvida, usa confiança baixa.'} O que o nosso comercial diz NÃO é dado do investidor.
- confianca "alta": há uma frase clara do investidor sobre esse dado. "media": dito de forma indireta mas inequívoca. "baixa": ambíguo, aproximado ou deduzido.
- evidencia: citação curta e literal (máximo 25 palavras). minuto: "mm:ss" se a transcrição tiver tempos, senão null.
- Valores numéricos em euros como número (100 mil => 100000). Datas em YYYY-MM-DD.
- contexto_relacional: só o que a pessoa partilhou e ajuda a relação. NUNCA dados de saúde, finanças pessoais sensíveis nem nada fora do âmbito do investimento (RGPD).
- Deteta contradições entre o que foi dito e a ficha atual ou os formulários (Forms/landing page).
- Não incluas campos sobre os quais nada foi dito.

CAMPOS POSSÍVEIS
${camposTxt}

FICHA ATUAL
${JSON.stringify(fichaParaPrompt(investidor))}

FORMULÁRIOS SUBMETIDOS (Forms / landing page)
${formularios || 'nenhum'}

OBJEÇÕES JÁ REGISTADAS (índice i)
${JSON.stringify(objecoes)}

COMPROMISSOS JÁ REGISTADOS (índice i)
${JSON.stringify(compromissos)}

Responde APENAS com JSON válido:
{
  "extracao": [{ "campo": "nome do campo", "valor": "valor", "confianca": "alta|media|baixa", "evidencia": "citação", "minuto": "mm:ss ou null" }],
  "investimentos_atuais": [{ "descricao": "ex.: 4 CAEPs", "valor": número em euros ou null, "confianca": "alta|media|baixa", "evidencia": "citação" }],
  "objecoes": [{ "objecao": "objeção nova do investidor", "resolvida": true|false, "confianca": "alta|media|baixa", "evidencia": "citação" }],
  "objecoes_resolvidas": [índices de objeções já registadas que esta conversa mostrou resolvidas],
  "compromissos": [{ "quem": "investidor|somnium", "o_que": "o que ficou combinado", "ate_quando": "YYYY-MM-DD ou texto ou null", "confianca": "alta|media|baixa", "evidencia": "citação" }],
  "compromissos_cumpridos": [índices de compromissos já registados que esta conversa mostra cumpridos],
  "contradicoes": [{ "campo": "campo", "ficha_ou_formulario": "o que lá está", "conversa": "o que foi dito", "evidencia": "citação" }],
  "entrevista_estrategica": { "marcada": true|false, "data": "YYYY-MM-DD ou null", "evidencia": "citação ou null" },
  "resumo": "2-3 frases sobre a conversa, para a linha do tempo do investidor"
}

--- TRANSCRIÇÃO ---
${transcricao}`
}

// Formulários do investidor (notas "Submissão Landing Page"/Forms), para contradições.
async function formulariosDe(pool, investidorId) {
  const { rows } = await pool.query(
    `SELECT left(notas, 1500) AS notas FROM investidor_interacoes WHERE investidor_id = $1 AND canal = 'Nota'
       AND (notas ILIKE 'Submiss%' OR notas ILIKE '%forms%' OR notas ILIKE '%questionário%') ORDER BY data_hora`, [investidorId])
  return rows.map(r => r.notas).join('\n---\n')
}

// ── Pedir a extração (fila IA no Mac) ─────────────────────────
// origem: 'gravacao:<id>' | 'reuniao:<id>'; modo: auto | backfill
export async function pedirExtracao(pool, origemRef, { modo = 'auto' } = {}) {
  await ensureAutopreenchimento(pool)
  const [tipo, id] = String(origemRef).split(':')
  let investidorId, transcricao, origem
  if (tipo === 'gravacao') {
    const { rows: [g] } = await pool.query('SELECT * FROM investidor_gravacoes WHERE id = $1', [id])
    if (!g?.transcricao?.trim()) return null
    investidorId = g.investidor_id; transcricao = g.transcricao
    origem = { tipo: 'gravacao', data: g.data_chamada, tipo_chamada: g.tipo_chamada }
  } else if (tipo === 'reuniao') {
    const { rows: [r] } = await pool.query('SELECT * FROM reunioes WHERE id = $1', [id])
    if (!r || r.entidade_tipo !== 'investidores' || !r.entidade_id || !r.transcricao?.trim()) return null
    investidorId = r.entidade_id; transcricao = r.transcricao
    origem = { tipo: 'reuniao', data: r.data, titulo: r.titulo }
  } else return null
  const { rows: [inv] } = await pool.query('SELECT * FROM investidores WHERE id = $1', [investidorId])
  if (!inv) return null
  const formularios = await formulariosDe(pool, investidorId)
  // Poupança de tokens: transcrição compactada, Haiku e sem repetir um pedido igual já feito.
  return enfileirarIA(pool, {
    tipo: TIPO_FILA_EXTRACAO, ref_id: origemRef, modelo: 'haiku', dedupe: true,
    prompt: promptExtracao({ investidor: inv, transcricao: compactarTranscricao(transcricao), origem, formularios }),
    contexto: { modo, investidor_id: investidorId, origem_data: dia(origem.data) },
  })
}

// Instruções da extração sem a transcrição: vão dentro do pedido da análise
// SOP 23 da gravação, para a transcrição só ser enviada uma vez à IA.
export async function instrucoesExtracaoGravacao(pool, g) {
  await ensureAutopreenchimento(pool)
  const { rows: [inv] } = await pool.query('SELECT * FROM investidores WHERE id = $1', [g.investidor_id])
  if (!inv) return null
  const formularios = await formulariosDe(pool, g.investidor_id)
  const txt = promptExtracao({ investidor: inv, transcricao: '', origem: { tipo: 'gravacao', data: g.data_chamada, tipo_chamada: g.tipo_chamada }, formularios })
  return txt.replace(/\n*--- TRANSCRIÇÃO ---\s*$/, '')
}

// Extração que veio junto com a análise: aplica-se como se viesse da fila.
export async function aplicarExtracaoDaGravacao(pool, g, extracao) {
  const pedido = { ref_id: `gravacao:${g.id}`, contexto: { modo: 'auto', investidor_id: g.investidor_id, origem_data: dia(g.data_chamada) } }
  return aplicarRespostaExtracao(pool, pedido, JSON.stringify(extracao))
}

// ── Aplicar a extração ───────────────────────────────────────
// Campos cuja última alteração foi feita por uma pessoa (não pela IA nem por
// processos sem autor, como o webhook da landing page).
async function camposEditadosAMao(pool, investidorId) {
  const { rows } = await pool.query(
    `SELECT alteracoes, user_id, user_email, user_nome FROM historico_alteracoes
     WHERE entidade = 'investidores' AND entidade_id = $1 AND operacao = 'UPDATE' ORDER BY created_at ASC`, [investidorId]).catch(() => ({ rows: [] }))
  const ultimo = {}
  for (const r of rows) {
    const humano = (r.user_id || r.user_email || r.user_nome) && r.user_id !== AUTOR_IA.id && r.user_email !== AUTOR_IA.email
    for (const a of (Array.isArray(r.alteracoes) ? r.alteracoes : [])) ultimo[a.campo] = !!humano
  }
  return new Set(Object.keys(ultimo).filter(k => ultimo[k]))
}

async function registar(pool, linha) {
  await pool.query(
    `INSERT INTO investidor_campos_ia (id, investidor_id, campo, valor, valor_anterior, confianca, evidencia, minuto, origem_tipo, origem_id, origem_data, modo, estado, motivo, created_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
    [crypto.randomUUID(), linha.investidor_id, linha.campo, JSON.stringify(linha.valor ?? null), JSON.stringify(linha.valor_anterior ?? null),
     linha.confianca || null, linha.evidencia || null, linha.minuto || null, linha.origem_tipo, linha.origem_id, linha.origem_data || null,
     linha.modo, linha.estado, linha.motivo || null, agora()])
}

const rotuloOrigem = (tipo, data) => `IA (${tipo === 'reuniao' ? 'reunião' : 'call'} de ${fmtData(data) || 'data desconhecida'})`

async function escreverNaFicha(pool, investidorId, updates, autorNome) {
  const campos = Object.keys(updates)
  if (!campos.length) return
  const sets = campos.map((k, i) => `${k} = $${i + 1}`)
  const params = [...campos.map(k => paraColuna(k, updates[k])), agora(), investidorId]
  await withAuditUser(AUTOR_IA.email, autorNome, () => pool.query(
    `UPDATE investidores SET ${sets.join(', ')}, updated_at = $${campos.length + 1} WHERE id = $${campos.length + 2}`, params), AUTOR_IA.id)
}

const semelhante = (a, b) => { const x = norm(a), y = norm(b); return !!x && !!y && (x === y || x.includes(y) || y.includes(x)) }

export async function aplicarExtracao(pool, { investidorId, origemTipo, origemId, origemData, extracao, modo = 'auto' }) {
  await ensureAutopreenchimento(pool)
  const { rows: [inv] } = await pool.query('SELECT * FROM investidores WHERE id = $1', [investidorId])
  if (!inv) return null
  // Reprocessar a mesma origem: as sugestões pendentes dela são substituídas.
  await pool.query(`DELETE FROM investidor_campos_ia WHERE origem_tipo = $1 AND origem_id = $2 AND estado = 'pendente'`, [origemTipo, origemId])
  const { rows: jaAplicados } = await pool.query(
    `SELECT campo FROM investidor_campos_ia WHERE origem_tipo = $1 AND origem_id = $2 AND estado IN ('aplicado', 'aceite')`, [origemTipo, origemId])
  const aplicadosDaOrigem = new Set(jaAplicados.map(r => r.campo))
  const editados = await camposEditadosAMao(pool, investidorId)
  const base = { investidor_id: investidorId, origem_tipo: origemTipo, origem_id: origemId, origem_data: origemData, modo }
  const res = { aplicados: [], sugestoes: [], ignorados: 0 }
  const updates = {}

  // 1. Campos simples.
  const vistos = new Set()
  for (const item of (Array.isArray(extracao?.extracao) ? extracao.extracao : [])) {
    const campo = String(item?.campo || '').trim()
    const def = CAMPOS_IA[campo]
    if (!def || def.tipo === 'lista' || vistos.has(campo)) { res.ignorados++; continue }
    const valor = normalizar(campo, item.valor)
    if (valor == null) { res.ignorados++; continue }
    vistos.add(campo)
    const atual = inv[campo]
    const confianca = ['alta', 'media', 'baixa'].includes(item.confianca) ? item.confianca : 'baixa'
    const linha = { ...base, campo, valor, valor_anterior: vazio(atual) ? null : atual, confianca, evidencia: item.evidencia, minuto: item.minuto }
    if (!vazio(atual) && iguais(campo, atual, valor)) { res.ignorados++; continue }
    if (aplicadosDaOrigem.has(campo)) { res.ignorados++; continue }
    let motivo = null
    if (modo === 'backfill') motivo = vazio(atual) ? 'backfill' : 'conflito'
    else if (confianca === 'baixa') motivo = 'confianca_baixa'
    else if (!vazio(atual)) motivo = 'conflito'
    else if (editados.has(campo)) motivo = 'editado_mao'
    if (motivo) { await registar(pool, { ...linha, estado: 'pendente', motivo }); res.sugestoes.push(campo); continue }
    updates[campo] = valor
    await registar(pool, { ...linha, estado: 'aplicado', motivo: 'vazio' })
    res.aplicados.push(campo)
  }

  // 2. Listas: acrescentar entradas novas (nunca apagar).
  const listas = {
    investimentos_atuais: { atual: parseLista(inv.investimentos_atuais), novos: extracao?.investimentos_atuais, chave: 'descricao',
      montar: (x) => ({ descricao: String(x.descricao || '').slice(0, 300), valor: numero(x.valor), data: origemData, origem: `${origemTipo}:${origemId}` }) },
    objecoes: { atual: parseLista(inv.objecoes), novos: extracao?.objecoes, chave: 'objecao',
      montar: (x) => ({ objecao: String(x.objecao || '').slice(0, 300), resolvida: !!x.resolvida, data: origemData, origem: `${origemTipo}:${origemId}` }) },
    compromissos: { atual: parseLista(inv.compromissos), novos: extracao?.compromissos, chave: 'o_que',
      montar: (x) => ({ quem: x.quem === 'somnium' ? 'somnium' : 'investidor', o_que: String(x.o_que || '').slice(0, 300), ate_quando: x.ate_quando || null, cumprido: false, data: origemData, origem: `${origemTipo}:${origemId}` }) },
  }
  for (const [campo, L] of Object.entries(listas)) {
    let lista = [...L.atual]
    let mudou = false
    for (const x of (Array.isArray(L.novos) ? L.novos : [])) {
      const entrada = L.montar(x)
      if (!entrada[L.chave] || lista.some(e => semelhante(e[L.chave], entrada[L.chave]))) continue
      const confianca = ['alta', 'media', 'baixa'].includes(x.confianca) ? x.confianca : 'baixa'
      const linha = { ...base, campo, valor: entrada, confianca, evidencia: x.evidencia }
      if (modo === 'backfill' || confianca === 'baixa') {
        await registar(pool, { ...linha, estado: 'pendente', motivo: modo === 'backfill' ? 'backfill' : 'confianca_baixa' }); res.sugestoes.push(campo); continue
      }
      lista.push(entrada); mudou = true
      await registar(pool, { ...linha, estado: 'aplicado', motivo: 'lista' }); res.aplicados.push(campo)
    }
    // Objeções resolvidas / compromissos cumpridos nesta conversa.
    const marcar = campo === 'objecoes' ? extracao?.objecoes_resolvidas : campo === 'compromissos' ? extracao?.compromissos_cumpridos : null
    const flag = campo === 'objecoes' ? 'resolvida' : 'cumprido'
    for (const i of (Array.isArray(marcar) ? marcar : [])) {
      const e = lista[Number(i)]
      if (!e || e[flag]) continue
      const marcado = { ...e, [flag]: true }
      if (modo === 'backfill') { await registar(pool, { ...base, campo, valor: marcado, valor_anterior: e, confianca: 'media', estado: 'pendente', motivo: 'backfill' }); continue }
      lista[Number(i)] = marcado; mudou = true
      await registar(pool, { ...base, campo, valor: marcado, valor_anterior: e, confianca: 'media', estado: 'aplicado', motivo: 'lista' })
      res.aplicados.push(campo)
    }
    if (mudou) updates[campo] = lista
  }

  await escreverNaFicha(pool, investidorId, updates, rotuloOrigem(origemTipo, origemData))
  return res
}

// Aplicador da fila IA ('extracao_investidor').
export async function aplicarRespostaExtracao(pool, pedido, texto) {
  await ensureAutopreenchimento(pool)
  const extracao = jsonDaResposta(texto)
  const [tipo, id] = String(pedido.ref_id).split(':')
  const ctx = pedido.contexto || {}
  if (tipo === 'gravacao') await pool.query('UPDATE investidor_gravacoes SET extracao = $2 WHERE id = $1', [id, JSON.stringify(extracao)])
  else await pool.query('UPDATE reunioes SET extracao_ia = $2 WHERE id = $1', [id, JSON.stringify(extracao)])
  const res = await aplicarExtracao(pool, {
    investidorId: ctx.investidor_id, origemTipo: tipo, origemId: id, origemData: ctx.origem_data, extracao, modo: ctx.modo || 'auto',
  })
  // Gravação: o resumo da conversa vai para o contacto da linha do tempo.
  if (tipo === 'gravacao' && extracao?.resumo && (ctx.modo || 'auto') === 'auto') {
    await pool.query(
      `UPDATE investidor_interacoes SET notas = $2, updated_at = $3
       WHERE id = (SELECT id FROM investidor_interacoes WHERE investidor_id = $1 AND autor = 'IA (análise da call)'
                     AND left(data_hora, 10) = $4 ORDER BY created_at DESC LIMIT 1)`,
      [ctx.investidor_id, String(extracao.resumo).slice(0, 1500), agora(), ctx.origem_data]).catch(() => {})
  }
  // Novos dados => a preparação das próximas calls fica desatualizada e é refeita.
  const { rows } = await pool.query(
    `SELECT id FROM tarefas WHERE origem_tipo = 'investidor' AND origem_id = $1 AND origem_campo = 'proximo_contacto'
       AND status NOT IN ('Concluída', 'Concluida') AND COALESCE(arquivada, false) = false`, [ctx.investidor_id])
  for (const t of rows) await prepararCall(pool, t.id, { gerar: false }).catch(() => {})
  return res
}

// ── Registo automático da call (gravações) ────────────────────
const DIAS_POR_TEMPERATURA = { quente: 30, intermedio: 60, frio: 90 }
const somaDias = (d, n) => { const x = new Date(`${d}T12:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10) }

export async function aplicarRegistoCall(pool, gravacaoId) {
  await ensureAutopreenchimento(pool)
  const { rows: [g] } = await pool.query('SELECT * FROM investidor_gravacoes WHERE id = $1', [gravacaoId])
  if (!g?.analise) return null
  const a = g.analise
  const res = { registo: false, contacto: null, proxima: null }
  const escolhe2 = (v, l) => (l.includes(v) ? v : null)
  const resultado = g.resultado || escolhe2(a.sugestao_resultado, ['atendeu', 'nao_atendeu', 'recusou', 'numero_errado'])
  const proximoPasso = g.proximo_passo || escolhe2(a.sugestao_proximo_passo, ['entrevista_marcada', 'follow_up_agendado', 'enviar_forms', 'sem_interesse', 'nao_elegivel'])
  const temperatura = g.temperatura || escolhe2(a.sugestao_temperatura, ['quente', 'intermedio', 'frio'])
  const dataCall = dia(g.data_chamada) || dia(g.created_at)
  // 0. Scorecard de qualificação (SOP 23, 4.10) em QUALQUER tipo de call:
  // notas por critério com prova nesta conversa. Corre mesmo com o registo da
  // call já feito à mão. A classe é automática (decisão de 17/11/2026): junta
  // estas notas às dos contactos anteriores e, com os 6 critérios, fica definida.
  if (a.scorecard_discovery && typeof a.scorecard_discovery === 'object') {
    await pool.query(`DELETE FROM investidor_campos_ia WHERE origem_tipo = 'gravacao' AND origem_id = $1 AND campo LIKE 'scorecard_discovery.%' AND estado = 'pendente'`, [g.id])
    const notasIA = {}
    for (const c of CRITERIOS_DISCOVERY) {
      const s = a.scorecard_discovery[c.chave]
      let nota = null
      try { nota = normalizarNota(s?.nota, c.chave) } catch { nota = null }
      if (nota != null) notasIA[c.chave] = { nota, evidencia: s?.evidencia || null, minuto: s?.minuto || null }
    }
    let proposta = { aplicado: false }
    const rotulo = { cold_call: 'Chamada 1', follow_up: 'Recontacto', discovery: 'Discovery' }[g.tipo_chamada] || 'Call'
    try {
      proposta = await classificarAutomaticamente(pool, g.investidor_id, notasIA,
        { tipo: 'gravacao', id: g.id, data: dataCall, descricao: `${rotulo} de ${dataCall}`, conduzidaPor: g.realizada_por })
    } catch (e) { console.error('[autopreenchimento] classificação:', e.message) }
    for (const [chave, s] of Object.entries(notasIA)) {
      await registar(pool, { investidor_id: g.investidor_id, campo: `scorecard_discovery.${chave}`, valor: { nota: s.nota }, confianca: 'media',
        evidencia: s.evidencia, minuto: s.minuto, origem_tipo: 'gravacao', origem_id: g.id, origem_data: dataCall,
        modo: 'auto', estado: 'aplicado', motivo: 'classificacao' })
    }
    res.classe_proposta = proposta.aplicado ? proposta.classe : null
  }
  let dataFollow = g.data_follow_up || dia(a.sugestao_data_follow_up)
  if (!dataFollow && ['follow_up_agendado', 'enviar_forms'].includes(proximoPasso) && dataCall) dataFollow = somaDias(dataCall, DIAS_POR_TEMPERATURA[temperatura] || 60)

  // 1. Registo da própria gravação: só os campos vazios (o manual manda sempre).
  if (!g.registo_fonte && !g.resultado && !g.proximo_passo) {
    await pool.query(
      `UPDATE investidor_gravacoes SET resultado = $2, proximo_passo = $3, temperatura = $4, data_follow_up = $5, registo_fonte = 'ia', updated_at = $6 WHERE id = $1`,
      [g.id, resultado, proximoPasso, temperatura, dataFollow, agora()])
    res.registo = true
  } else return res // já registado (à mão ou numa análise anterior): não repetir

  const invId = g.investidor_id
  const user = { nome: 'IA (análise da call)' }
  // 2. Próxima ação (texto) pelo motor: vazia => escreve; senão sugestão.
  if (a.proximo_passo) {
    await aplicarExtracao(pool, {
      investidorId: invId, origemTipo: 'gravacao', origemId: g.id, origemData: dataCall,
      extracao: { extracao: [{ campo: 'proxima_acao', valor: a.proximo_passo, confianca: 'media', evidencia: a.sugestao_justificacao || null }] },
    })
  }
  // 3. Reclassificação pelos 5 critérios: só sugestão (a classe é validada pelos dois sócios).
  const pc = a.pre_classificacao
  if (pc && ['capacidade_financeira', 'experiencia', 'alinhamento', 'credibilidade', 'compromisso'].some(k => Number(pc[k]) > 0)) {
    await pool.query(`DELETE FROM investidor_campos_ia WHERE origem_tipo = 'gravacao' AND origem_id = $1 AND campo = 'classificacao' AND estado = 'pendente'`, [g.id])
    await registar(pool, { investidor_id: invId, campo: 'classificacao', valor: pc, confianca: 'media', evidencia: pc.justificacao || null,
      origem_tipo: 'gravacao', origem_id: g.id, origem_data: dataCall, modo: 'auto', estado: 'pendente', motivo: 'classificacao' })
  }
  if (resultado !== 'atendeu' && !(resultado == null && g.transcricao)) return res

  // 4. Contacto feito + próxima tarefa (uma só por pessoa: contactoPessoa).
  const entrevista = proximoPasso === 'entrevista_marcada'
  const semSeguimento = ['sem_interesse', 'nao_elegivel'].includes(proximoPasso)
  const proxData = entrevista ? (dia(g.extracao?.entrevista_estrategica?.data) || dataFollow) : semSeguimento ? null : dataFollow
  const proxTipo = entrevista ? 'discovery_call' : 'follow_up'
  const { rows: [aberta] } = await pool.query(
    `SELECT id, COALESCE(inicio, data_limite) AS quando FROM tarefas WHERE origem_tipo = 'investidor' AND origem_id = $1 AND origem_campo = 'proximo_contacto'
       AND status NOT IN ('Concluída', 'Concluida') AND COALESCE(arquivada, false) = false ORDER BY created_at DESC LIMIT 1`, [invId])
  const diaAberta = dia(aberta?.quando)
  const limiteEstaCall = dataCall ? somaDias(dataCall, 1) : null
  if (aberta && diaAberta && limiteEstaCall && diaAberta > limiteEstaCall) {
    // Já há um contacto futuro marcado à mão: não se mexe; a data fica como sugestão.
    if (proxData) await registar(pool, { investidor_id: invId, campo: 'proximo_contacto', valor: { data: proxData, tipo: proxTipo }, valor_anterior: { data: diaAberta },
      confianca: 'media', evidencia: a.sugestao_justificacao || null, origem_tipo: 'gravacao', origem_id: g.id, origem_data: dataCall, modo: 'auto', estado: 'pendente', motivo: 'conflito' })
    return res
  }
  try {
    const r = await withAuditUser(AUTOR_IA.email, user.nome, () => registarContactoPessoa(pool, 'investidor', invId, {
      resultado: 'Feito', quando: dataCall, canal: 'Chamada', finalidade: 'follow_up',
      notas: a.resumo || 'Chamada gravada. Análise na aba Reuniões.', proximo: proxData ? { data: proxData, tipo: proxTipo } : null, user,
    }), AUTOR_IA.id)
    res.contacto = r?.interacao_id || null
    res.proxima = r?.tarefa_id || null
    if (r?.tarefa_id) {
      await definirTipoContacto(pool, 'investidor', invId, r.tarefa_id, proxTipo)
      await prepararCall(pool, r.tarefa_id, { gerar: true }).catch(() => {})
    }
  } catch (e) { console.error('[autopreenchimento] registo do contacto:', e.message) }
  if (entrevista && proxData) {
    await aplicarExtracao(pool, { investidorId: invId, origemTipo: 'gravacao', origemId: g.id, origemData: dataCall,
      extracao: { extracao: [{ campo: 'data_entrevista_estrategica', valor: proxData, confianca: 'alta', evidencia: g.extracao?.entrevista_estrategica?.evidencia || null }] } })
  }
  return res
}

// Depois da análise SOP 23 de uma gravação: registo + extração.
// Com `extracao` (veio no mesmo pedido da análise) aplica-a já; sem ela
// (respostas no formato antigo) põe a extração na fila, como antes.
export async function aposAnaliseGravacao(pool, gravacaoId, { extracao = null } = {}) {
  try { await aplicarRegistoCall(pool, gravacaoId) } catch (e) { console.error('[autopreenchimento] registo:', e.message) }
  try {
    if (extracao && typeof extracao === 'object') {
      const { rows: [g] } = await pool.query('SELECT id, investidor_id, data_chamada FROM investidor_gravacoes WHERE id = $1', [gravacaoId])
      if (g) await aplicarExtracaoDaGravacao(pool, g, extracao)
    } else await pedirExtracao(pool, `gravacao:${gravacaoId}`)
  } catch (e) { console.error('[autopreenchimento] extração:', e.message) }
}

// ── Decisões sobre sugestões ──────────────────────────────────
async function linhaIA(pool, id) {
  const { rows: [l] } = await pool.query('SELECT * FROM investidor_campos_ia WHERE id = $1', [id])
  if (!l) throw new Error('Sugestão não encontrada')
  return l
}
const autorUser = (u) => u?.nome || u?.email || 'utilizador'

export async function aceitarSugestao(pool, id, user) {
  const l = await linhaIA(pool, id)
  if (l.estado !== 'pendente') throw new Error('Esta sugestão já foi decidida')
  const { rows: [inv] } = await pool.query('SELECT * FROM investidores WHERE id = $1', [l.investidor_id])
  if (l.campo === 'classificacao') throw new Error('A classificação só muda pelo Scorecard: abre o separador Avaliação')
  if (String(l.campo).startsWith('scorecard_discovery.')) throw new Error('Confirma esta nota no scorecard da discovery (separador Avaliação)')
  if (l.campo === 'proximo_contacto') {
    await agendarContactoPessoa(pool, 'investidor', l.investidor_id, { data: l.valor?.data, tipoContacto: l.valor?.tipo || 'follow_up', user })
  } else {
    const def = CAMPOS_IA[l.campo]
    if (!def) throw new Error('Campo desconhecido')
    let novo = l.valor
    if (def.tipo === 'lista') {
      const lista = parseLista(inv[l.campo])
      const chave = l.campo === 'objecoes' ? 'objecao' : l.campo === 'compromissos' ? 'o_que' : 'descricao'
      const i = lista.findIndex(e => semelhante(e[chave], l.valor?.[chave]))
      if (i >= 0) lista[i] = l.valor; else lista.push(l.valor)
      novo = lista
    }
    const sets = `${l.campo} = $1, updated_at = $2`
    await pool.query(`UPDATE investidores SET ${sets} WHERE id = $3`, [paraColuna(l.campo, novo), agora(), l.investidor_id])
    await pool.query('UPDATE investidor_campos_ia SET valor_anterior = $2 WHERE id = $1', [id, JSON.stringify(vazio(inv[l.campo]) ? null : inv[l.campo])])
  }
  await pool.query(`UPDATE investidor_campos_ia SET estado = 'aceite', decidido_por = $2, decidido_em = $3 WHERE id = $1`, [id, autorUser(user), agora()])
  // Outras sugestões pendentes do mesmo campo deixam de fazer sentido.
  if (CAMPOS_IA[l.campo]?.tipo !== 'lista') {
    await pool.query(`UPDATE investidor_campos_ia SET estado = 'rejeitado', decidido_por = $3, decidido_em = $4 WHERE investidor_id = $1 AND campo = $2 AND estado = 'pendente'`,
      [l.investidor_id, l.campo, `${autorUser(user)} (substituída)`, agora()])
  }
  return linhaIA(pool, id)
}

export async function rejeitarSugestao(pool, id, user) {
  const l = await linhaIA(pool, id)
  if (l.estado !== 'pendente') throw new Error('Esta sugestão já foi decidida')
  await pool.query(`UPDATE investidor_campos_ia SET estado = 'rejeitado', decidido_por = $2, decidido_em = $3 WHERE id = $1`, [id, autorUser(user), agora()])
  return linhaIA(pool, id)
}

// Reverter um valor escrito pela IA (ou aceite): repõe o anterior, se o campo
// não foi entretanto alterado por outra via.
export async function reverterCampo(pool, id, user) {
  const l = await linhaIA(pool, id)
  if (!['aplicado', 'aceite'].includes(l.estado)) throw new Error('Só se reverte o que foi escrito na ficha')
  const def = CAMPOS_IA[l.campo]
  if (!def) throw new Error('Este registo não é revertível aqui')
  const { rows: [inv] } = await pool.query('SELECT * FROM investidores WHERE id = $1', [l.investidor_id])
  let novo
  if (def.tipo === 'lista') {
    const lista = parseLista(inv[l.campo])
    const chave = l.campo === 'objecoes' ? 'objecao' : l.campo === 'compromissos' ? 'o_que' : 'descricao'
    const i = lista.findIndex(e => semelhante(e[chave], l.valor?.[chave]))
    if (i < 0) throw new Error('Esta entrada já não está na ficha')
    if (l.valor_anterior) lista[i] = l.valor_anterior; else lista.splice(i, 1)
    novo = lista
  } else {
    if (!iguais(l.campo, inv[l.campo], l.valor)) throw new Error('O campo foi alterado depois: reverte à mão, na ficha')
    novo = l.valor_anterior ?? null
  }
  await pool.query(`UPDATE investidores SET ${l.campo} = $1, updated_at = $2 WHERE id = $3`,
    [novo == null ? null : paraColuna(l.campo, novo), agora(), l.investidor_id])
  await pool.query(`UPDATE investidor_campos_ia SET estado = 'revertido', decidido_por = $2, decidido_em = $3 WHERE id = $1`, [id, autorUser(user), agora()])
  return linhaIA(pool, id)
}

// ── Leitura (ficha e ecrã Rever call) ─────────────────────────
const ROTULO_DISCOVERY = Object.fromEntries(CRITERIOS_DISCOVERY.map(c => [`scorecard_discovery.${c.chave}`, `Scorecard discovery: ${c.label}`]))
const comLabel = (l) => ({ ...l, label: CAMPOS_IA[l.campo]?.label || ROTULO_DISCOVERY[l.campo] || (l.campo === 'classificacao' ? 'Reclassificação (5 critérios)' : l.campo === 'proximo_contacto' ? 'Próximo contacto' : l.campo),
  valor_txt: l.campo === 'classificacao' ? null : ROTULO_DISCOVERY[l.campo] ? `${l.valor?.nota ?? '—'}/2` : l.campo === 'proximo_contacto' ? `${fmtData(l.valor?.data)} (${l.valor?.tipo === 'discovery_call' ? 'Discovery Call' : 'Follow-up'})` : formatarValor(l.campo, l.valor),
  anterior_txt: l.campo === 'proximo_contacto' ? fmtData(l.valor_anterior?.data) : formatarValor(l.campo, l.valor_anterior) })

export async function camposIADoInvestidor(pool, investidorId) {
  await ensureAutopreenchimento(pool)
  const { rows } = await pool.query(
    `SELECT * FROM investidor_campos_ia WHERE investidor_id = $1 AND estado IN ('pendente', 'aplicado', 'aceite') ORDER BY created_at DESC`, [investidorId])
  const pendentes = rows.filter(r => r.estado === 'pendente').map(comLabel)
  // Último valor escrito pela IA por campo (marca "preenchido por IA" na ficha).
  const porCampo = {}
  for (const r of rows.filter(r => r.estado === 'aplicado')) if (!porCampo[r.campo]) porCampo[r.campo] = comLabel(r)
  return { pendentes, contador: pendentes.length, preenchidos: porCampo }
}

export async function revisaoGravacao(pool, gravacaoId) {
  await ensureAutopreenchimento(pool)
  const { rows: [g] } = await pool.query(
    `SELECT id, investidor_id, tipo_chamada, data_chamada, estado, resultado, proximo_passo, temperatura, data_follow_up, registo_fonte,
            registo_confirmado_em, analise, extracao FROM investidor_gravacoes WHERE id = $1`, [gravacaoId])
  if (!g) return null
  const { rows: linhas } = await pool.query(
    `SELECT * FROM investidor_campos_ia WHERE origem_tipo = 'gravacao' AND origem_id = $1 ORDER BY created_at`, [gravacaoId])
  const { rows: [inv] } = await pool.query('SELECT * FROM investidores WHERE id = $1', [g.investidor_id])
  const porRecolher = CAMPOS_A_RECOLHER.filter(k => vazio(inv?.[k])).map(k => ({ campo: k, label: CAMPOS_IA[k].label }))
  return {
    gravacao: { ...g, analise: undefined, resumo: g.analise?.resumo || null },
    extracao_pendente: !g.extracao,
    preenchidos: linhas.filter(l => ['aplicado', 'aceite'].includes(l.estado)).map(comLabel),
    conflitos: linhas.filter(l => l.estado === 'pendente').map(comLabel),
    decididos: linhas.filter(l => ['rejeitado', 'revertido'].includes(l.estado)).map(comLabel),
    contradicoes: Array.isArray(g.extracao?.contradicoes) ? g.extracao.contradicoes : [],
    por_recolher: porRecolher,
  }
}

export async function confirmarRegistoGravacao(pool, gravacaoId) {
  const { rows: [g] } = await pool.query(
    `UPDATE investidor_gravacoes SET registo_confirmado_em = $2,
       registo_fonte = CASE WHEN registo_fonte = 'ia' THEN 'ia_sugestao_confirmada' ELSE COALESCE(registo_fonte, 'manual') END, updated_at = $2
     WHERE id = $1 RETURNING id, registo_confirmado_em, registo_fonte`, [gravacaoId, agora()])
  return g || null
}

// ── Backfill (modo só-sugestões) e relatório ─────────────────
// modo 'backfill' (só sugestões, por defeito) ou 'auto' (preenche campos vazios).
// so: 'gravacoes' | 'reunioes' | null (ambos).
export async function pedirBackfill(pool, { modo = 'backfill', so = null } = {}) {
  await ensureAutopreenchimento(pool)
  if (!['backfill', 'auto'].includes(modo)) throw new Error('Modo inválido')
  const { rows: grav } = so === 'reunioes' ? { rows: [] } : await pool.query(`SELECT id FROM investidor_gravacoes WHERE estado = 'analisado' AND COALESCE(btrim(transcricao), '') <> ''`)
  const { rows: reun } = so === 'gravacoes' ? { rows: [] } : await pool.query(
    `SELECT id FROM reunioes WHERE entidade_tipo = 'investidores' AND entidade_id IS NOT NULL AND length(COALESCE(transcricao, '')) >= 1500`)
  let n = 0
  for (const g of grav) if (await pedirExtracao(pool, `gravacao:${g.id}`, { modo })) n++
  for (const r of reun) if (await pedirExtracao(pool, `reuniao:${r.id}`, { modo })) n++
  return { pedidos: n, gravacoes: grav.length, reunioes: reun.length }
}

export async function relatorioBackfill(pool) {
  await ensureAutopreenchimento(pool)
  const { rows } = await pool.query(
    `SELECT i.id, i.nome,
            count(*) FILTER (WHERE c.motivo = 'backfill') AS preencheria,
            count(*) FILTER (WHERE c.motivo = 'conflito') AS conflitos,
            array_agg(DISTINCT c.campo) AS campos
     FROM investidor_campos_ia c JOIN investidores i ON i.id = c.investidor_id
     WHERE c.modo = 'backfill' AND c.estado = 'pendente'
     GROUP BY i.id, i.nome ORDER BY count(*) DESC`)
  const { rows: [fila] } = await pool.query(
    `SELECT count(*) FILTER (WHERE estado IN ('aguarda', 'a_processar')) AS em_fila, count(*) FILTER (WHERE estado = 'erro') AS erros
     FROM ia_fila WHERE tipo = $1 AND contexto->>'modo' = 'backfill'`, [TIPO_FILA_EXTRACAO]).catch(() => ({ rows: [{}] }))
  return {
    em_fila: Number(fila?.em_fila || 0), erros: Number(fila?.erros || 0),
    totais: { investidores: rows.length, preencheria: rows.reduce((s, r) => s + Number(r.preencheria), 0), conflitos: rows.reduce((s, r) => s + Number(r.conflitos), 0) },
    investidores: rows.map(r => ({ ...r, preencheria: Number(r.preencheria), conflitos: Number(r.conflitos), campos: (r.campos || []).map(c => CAMPOS_IA[c]?.label || c) })),
  }
}
