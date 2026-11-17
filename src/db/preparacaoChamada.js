/**
 * Preparação de chamada por investidor (SOP 23 v2.1), pedida no painel do
 * investidor com o botão "Preparar chamada". Independente de preparacaoCall.ts
 * (preparação por tarefa da Agenda).
 *
 * Fluxo: os dados são montados aqui, no servidor; o prompt (ficheiro
 * crm/prompts/preparacao_chamada_v1.md, com o Anexo A injetado) vai para a fila
 * IA e o Claude no Mac responde; o aplicador valida a resposta no código e
 * grava em preparacoes_chamada. Nunca bloqueia: o pedido responde logo.
 *
 * Regras puras em supabase/functions/_shared/preparacaoChamadaRegras.js. Gémeo Deno em
 * supabase/functions/_shared/preparacaoChamada.ts — o código é o mesmo, só mudam os imports.
 * Sem logs de conteúdo: os dados são pessoais.
 */
import { enfileirarIA, estadoIA, emFilaIA } from "./filaIA.js"
import { quandoDaTarefa } from "./preparacaoCall.js"
import {
  TIPO_FILA, VERSAO_PROMPT, LINHA_FORA_SOP23, TIPOS,
  montarEntradas, preencherPrompt, limparResposta, validarDocumento, preparacaoValida, tipoChamada, tipoValido,
} from "../../supabase/functions/_shared/preparacaoChamadaRegras.js"

let _tabela = false
export async function ensurePreparacoesChamada(pool) {
  if (_tabela) return
  const { rows: [ok] } = await pool.query(`SELECT to_regclass('public.preparacoes_chamada') IS NOT NULL AS t`)
  if (!ok?.t) {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS preparacoes_chamada (
        id TEXT PRIMARY KEY,
        investidor_id TEXT NOT NULL REFERENCES investidores(id) ON DELETE CASCADE,
        tipo_chamada TEXT NOT NULL CHECK (tipo_chamada IN ('qualificacao', 'discovery', 'recontacto', 'fora_sop23')),
        conteudo TEXT,
        alertas JSONB NOT NULL DEFAULT '[]'::jsonb,
        gerado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        gerado_por TEXT,
        versao_prompt TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_preparacoes_chamada_inv ON preparacoes_chamada(investidor_id, gerado_em DESC);
      ALTER TABLE public.preparacoes_chamada ENABLE ROW LEVEL SECURITY;
    `)
  }
  _tabela = true
}

const ABERTA = "status NOT IN ('Concluída', 'Concluida') AND COALESCE(arquivada, false) = false AND tarefa NOT LIKE 'Cancelada:%'"
const diaIso = (d) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Lisbon' }).format(d)
const vazioQ = { rows: [] }

// Junta tudo o que o prompt precisa. Lê só; nada vai para logs.
export async function recolherDados(pool, investidorId, quemConduz, agora = new Date()) {
  const { rows: [investidor] } = await pool.query('SELECT * FROM investidores WHERE id = $1', [investidorId])
  if (!investidor) return null
  const hoje = diaIso(agora), depois = diaIso(new Date(agora.getTime() + 48 * 3_600_000))
  const [inter, grav, reun, prox, user] = await Promise.all([
    pool.query(`SELECT id, data_hora, canal, direcao, finalidade, notas, resultado, autor, created_at
                FROM investidor_interacoes WHERE investidor_id = $1 ORDER BY data_hora ASC`, [investidorId]).catch(() => vazioQ),
    pool.query(`SELECT id, tipo_chamada, data_chamada, realizada_por, resultado, proximo_passo, temperatura, notas, analise,
                       LEFT(transcricao, 4000) AS transcricao, (COALESCE(btrim(transcricao), '') <> '') AS tem_transcricao, created_at
                FROM investidor_gravacoes WHERE investidor_id = $1 ORDER BY data_chamada ASC`, [investidorId]).catch(() => vazioQ),
    pool.query(`SELECT id, titulo, data, duracao_min, resumo, resumo_ia, LEFT(transcricao, 4000) AS transcricao, created_at
                FROM reunioes WHERE entidade_tipo = 'investidores' AND entidade_id = $1 ORDER BY data ASC`, [investidorId]).catch(() => vazioQ),
    pool.query(`SELECT id, tarefa, inicio FROM tarefas WHERE origem_id = $1 AND ${ABERTA} AND inicio IS NOT NULL AND inicio >= $2
                ORDER BY inicio ASC LIMIT 1`, [investidorId, hoje]).catch(() => vazioQ),
    quemConduz ? pool.query(`SELECT id FROM users WHERE nome = $1 LIMIT 1`, [quemConduz]).catch(() => vazioQ) : vazioQ,
  ])
  let blocos = [], ocupados = []
  const userId = user.rows[0]?.id
  if (userId) {
    const [b, a, t] = await Promise.all([
      pool.query(`SELECT data, hora_inicio, hora_fim FROM disponibilidade_blocos WHERE user_id = $1 AND data BETWEEN $2 AND $3`, [userId, hoje, depois]).catch(() => vazioQ),
      pool.query(`SELECT data, hora_inicio, hora_fim FROM agendamentos WHERE user_id = $1 AND data BETWEEN $2 AND $3
                  AND COALESCE(estado, '') NOT IN ('cancelado', 'recusado')`, [userId, hoje, depois]).catch(() => vazioQ),
      pool.query(`SELECT inicio, fim FROM tarefas WHERE user_id = $1 AND ${ABERTA} AND inicio >= $2 AND inicio <= $3`, [userId, hoje, `${depois}T23:59`]).catch(() => vazioQ),
    ])
    blocos = b.rows
    ocupados = [
      ...a.rows,
      ...t.rows.map((x) => {
        const i = quandoDaTarefa({ inicio: x.inicio }), f = quandoDaTarefa({ inicio: x.fim })
        return i.hora ? { data: i.dia, hora_inicio: i.hora, hora_fim: f.dia === i.dia && f.hora ? f.hora : null } : null
      }).filter(Boolean),
    ]
  }
  return {
    investidor, interacoes: inter.rows, gravacoes: grav.rows, reunioes: reun.rows,
    proximaTarefa: prox.rows[0] || null, blocos, ocupados,
    // O CRM não regista o Ponto de controlo 1 do SOP 12 nem "negócio disponível": sem dados.
    oportunidades: [],
  }
}

// Último registo novo (contacto, gravação ou reunião) do investidor.
async function ultimoContactoEm(pool, investidorId) {
  const { rows: [r] } = await pool.query(`
    SELECT GREATEST(
      (SELECT MAX(created_at::timestamptz) FROM investidor_interacoes WHERE investidor_id = $1),
      (SELECT MAX(created_at::timestamptz) FROM investidor_gravacoes WHERE investidor_id = $1),
      (SELECT MAX(created_at::timestamptz) FROM reunioes WHERE entidade_tipo = 'investidores' AND entidade_id = $1)
    ) AS em`, [investidorId]).catch(() => ({ rows: [{}] }))
  return r?.em || null
}

async function ultimaPreparacao(pool, investidorId) {
  const { rows: [p] } = await pool.query(
    `SELECT * FROM preparacoes_chamada WHERE investidor_id = $1 ORDER BY gerado_em DESC LIMIT 1`, [investidorId])
  return p || null
}

// Tipo pela etapa, com leituras leves (o painel mostra-o no selector).
async function tipoCalculadoDe(pool, investidorId) {
  const { rows: [investidor] } = await pool.query('SELECT status, origem FROM investidores WHERE id = $1', [investidorId])
  if (!investidor) return null
  const [i, g, r] = await Promise.all([
    pool.query(`SELECT canal, resultado FROM investidor_interacoes WHERE investidor_id = $1 AND canal IN ('Chamada', 'Reunião', 'Reuniao')`, [investidorId]).catch(() => vazioQ),
    pool.query(`SELECT resultado, (COALESCE(btrim(transcricao), '') <> '') AS tem_transcricao FROM investidor_gravacoes WHERE investidor_id = $1`, [investidorId]).catch(() => vazioQ),
    pool.query(`SELECT 1 FROM reunioes WHERE entidade_tipo = 'investidores' AND entidade_id = $1 LIMIT 1`, [investidorId]).catch(() => vazioQ),
  ])
  return tipoChamada({ investidor, interacoes: i.rows, gravacoes: g.rows, reunioes: r.rows })
}

// Estado para o painel: última preparação (do tipo pedido, se houver), se ainda serve, e a fila IA.
export async function lerPreparacaoChamada(pool, investidorId, { tipo = null } = {}) {
  await ensurePreparacoesChamada(pool)
  const [preparacao, ultimo, fila, tipoCalculado] = await Promise.all([
    ultimaPreparacao(pool, investidorId), ultimoContactoEm(pool, investidorId), estadoIA(pool, TIPO_FILA, investidorId),
    tipoCalculadoDe(pool, investidorId),
  ])
  return {
    preparacao,
    tipo_calculado: tipoCalculado,
    valida: preparacaoValida(preparacao, ultimo, new Date(), tipo),
    em_fila: emFilaIA(fila),
    erro: fila?.estado === 'erro' ? fila.erro : null,
    pedido_em: fila?.created_at || null,
  }
}

async function gravar(pool, { investidorId, tipo, conteudo, alertas, geradoPor }) {
  const { rows: [p] } = await pool.query(
    `INSERT INTO preparacoes_chamada (id, investidor_id, tipo_chamada, conteudo, alertas, gerado_em, gerado_por, versao_prompt)
     VALUES ($1, $2, $3, $4, $5, NOW(), $6, $7) RETURNING *`,
    [crypto.randomUUID(), investidorId, tipo, conteudo, JSON.stringify(alertas || []), geradoPor || null, VERSAO_PROMPT])
  return p
}

// Pedido do botão. Devolve logo: a preparação válida, a linha do SOP 11, ou "em fila".
export async function pedirPreparacao(pool, { investidorId, quemConduz, geradoPor, tipoChamada: tipoPedido = null, forcar = false, template, anexoA }) {
  await ensurePreparacoesChamada(pool)
  const tipoEscolhido = tipoValido(tipoPedido)
  const estado = await lerPreparacaoChamada(pool, investidorId, { tipo: tipoEscolhido })
  if (!forcar && estado.valida) return estado
  if (!forcar && estado.em_fila) return estado
  const dados = await recolherDados(pool, investidorId, quemConduz)
  if (!dados) return null
  const entradas = montarEntradas(dados, { quemConduz, tipoEscolhido })
  if (entradas.tipo === 'fora_sop23') {
    // Resultado igual ao do modelo, sem esperar pela fila.
    await gravar(pool, { investidorId, tipo: 'fora_sop23', conteudo: LINHA_FORA_SOP23, alertas: [], geradoPor })
    return lerPreparacaoChamada(pool, investidorId, { tipo: tipoEscolhido })
  }
  await enfileirarIA(pool, {
    tipo: TIPO_FILA, ref_id: investidorId, modelo: 'sonnet',
    prompt: preencherPrompt(template, anexoA, entradas),
    contexto: { tipo_chamada: entradas.tipo, tipo_manual: entradas.tipo_manual, quem_conduz: quemConduz || null, gerado_por: geradoPor || null, versao_prompt: VERSAO_PROMPT },
  })
  return lerPreparacaoChamada(pool, investidorId, { tipo: tipoEscolhido })
}

// Aplicador da fila IA: valida no código e grava. O conteúdo não fica em ia_fila.resultado.
export async function aplicarPreparacaoChamada(pool, pedido, texto) {
  await ensurePreparacoesChamada(pool)
  const tipo = TIPOS.includes(pedido.contexto?.tipo_chamada) ? pedido.contexto.tipo_chamada : 'qualificacao'
  const conteudo = limparResposta(texto)
  const alertas = validarDocumento(conteudo, tipo)
  const p = await gravar(pool, { investidorId: pedido.ref_id, tipo, conteudo, alertas, geradoPor: pedido.contexto?.gerado_por })
  return { id: p.id, alertas }
}
