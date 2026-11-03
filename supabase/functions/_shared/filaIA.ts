// @ts-nocheck
/**
 * Fila de pedidos à IA corridos no Mac do worker (Claude Code, plano Claude),
 * para nenhuma funcionalidade do CRM usar a API paga da Anthropic.
 *
 * Cada funcionalidade põe na fila o prompt (e, se precisar, um ficheiro do
 * Storage para o Claude ler) e regista um aplicador por `tipo`: a função que
 * recebe o texto devolvido e grava o resultado onde a funcionalidade o espera.
 * O worker (scripts/transcrever-gravacoes.mjs) lê /ia-fila/pendentes, corre o
 * prompt e devolve a resposta em /ia-fila/:id/resposta.
 *
 * Gémeo Node em src/db/filaIA.js — o código é o mesmo. Portar qualquer
 * alteração para os dois.
 */

const agora = () => new Date().toISOString()
let _tabela = false

export async function ensureFilaIA(pool) {
  if (_tabela) return
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ia_fila (
      id TEXT PRIMARY KEY,
      tipo TEXT NOT NULL,
      ref_id TEXT NOT NULL,
      modelo TEXT,
      prompt TEXT NOT NULL,
      ficheiro JSONB,
      contexto JSONB,
      estado TEXT NOT NULL DEFAULT 'aguarda',
      resultado JSONB,
      erro TEXT,
      created_at TEXT DEFAULT (NOW()::TEXT),
      updated_at TEXT DEFAULT (NOW()::TEXT)
    );
    CREATE INDEX IF NOT EXISTS idx_ia_fila_estado ON ia_fila(estado);
    CREATE INDEX IF NOT EXISTS idx_ia_fila_ref ON ia_fila(tipo, ref_id);
  `)
  _tabela = true
}

// Extrai o objecto JSON da resposta (o Claude pode acrescentar texto à volta).
export function jsonDaResposta(texto) {
  const t = String(texto || '')
  const m = t.match(/\{[\s\S]*\}/)
  return JSON.parse(m?.[0] || t)
}

// ficheiro: { bucket, path, nome } no Supabase Storage, descarregado pelo worker.
// Um pedido ainda em fila para o mesmo tipo/ref é actualizado em vez de duplicado.
export async function enfileirarIA(pool, { tipo, ref_id, prompt, modelo = 'sonnet', ficheiro = null, contexto = null }: any) {
  await ensureFilaIA(pool)
  const { rows: [existente] } = await pool.query(
    `UPDATE ia_fila SET prompt = $3, modelo = $4, ficheiro = $5, contexto = $6, erro = NULL, updated_at = $7
     WHERE tipo = $1 AND ref_id = $2 AND estado = 'aguarda' RETURNING *`,
    [tipo, String(ref_id), prompt, modelo, ficheiro ? JSON.stringify(ficheiro) : null, contexto ? JSON.stringify(contexto) : null, agora()])
  if (existente) return existente
  const { rows: [novo] } = await pool.query(
    `INSERT INTO ia_fila (id, tipo, ref_id, modelo, prompt, ficheiro, contexto, estado, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'aguarda', $8, $8) RETURNING *`,
    [crypto.randomUUID(), tipo, String(ref_id), modelo, prompt, ficheiro ? JSON.stringify(ficheiro) : null, contexto ? JSON.stringify(contexto) : null, agora()])
  return novo
}

// Último pedido de um tipo/ref (para o frontend mostrar "em fila" ou o erro).
export async function estadoIA(pool, tipo, ref_id) {
  await ensureFilaIA(pool)
  const { rows: [r] } = await pool.query(
    `SELECT id, tipo, ref_id, estado, erro, resultado, created_at, updated_at FROM ia_fila
     WHERE tipo = $1 AND ref_id = $2 ORDER BY created_at DESC LIMIT 1`, [tipo, String(ref_id)])
  return r || null
}

export const emFilaIA = (r) => ['aguarda', 'a_processar'].includes(r?.estado)

// Worker: pedidos por correr (ou presos em a_processar há >30 min).
export async function pedidosIAPendentes(pool) {
  await ensureFilaIA(pool)
  const { rows } = await pool.query(
    `SELECT id, tipo, ref_id, modelo, prompt, ficheiro FROM ia_fila
     WHERE estado = 'aguarda' OR (estado = 'a_processar' AND updated_at < $1)
     ORDER BY created_at ASC LIMIT 5`, [new Date(Date.now() - 30 * 60_000).toISOString()])
  return rows
}

// Lock optimista: só um worker processa cada pedido.
export async function iniciarIA(pool, id) {
  const { rows: [r] } = await pool.query(
    `UPDATE ia_fila SET estado = 'a_processar', updated_at = $2
     WHERE id = $1 AND (estado = 'aguarda' OR (estado = 'a_processar' AND updated_at < $3)) RETURNING id`,
    [id, agora(), new Date(Date.now() - 30 * 60_000).toISOString()])
  return !!r
}

export async function falharIA(pool, id, erro) {
  await pool.query(`UPDATE ia_fila SET estado = 'erro', erro = $2, updated_at = $3 WHERE id = $1`,
    [id, String(erro || 'Falha na IA').slice(0, 500), agora()])
}

// Aplica a resposta com o aplicador do tipo; o que ele devolver fica em `resultado`.
export async function concluirIA(pool, id, texto, aplicadores) {
  const { rows: [p] } = await pool.query('SELECT * FROM ia_fila WHERE id = $1', [id])
  if (!p) throw new Error('Pedido nao encontrado')
  const aplicar = aplicadores[p.tipo]
  if (!aplicar) throw new Error(`Tipo de pedido desconhecido: ${p.tipo}`)
  try {
    const resultado = await aplicar(p, texto)
    await pool.query(`UPDATE ia_fila SET estado = 'concluido', resultado = $2, erro = NULL, updated_at = $3 WHERE id = $1`,
      [id, JSON.stringify(resultado ?? null), agora()])
    return { concluido: true }
  } catch (e) {
    await falharIA(pool, id, e.message)
    throw e
  }
}
