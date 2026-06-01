/**
 * CRUD genérico para todas as tabelas do CRM (PostgreSQL).
 */
import pool from './pg.js'
import { randomUUID } from 'crypto'

// ── Validacao de campos obrigatorios ─────────────────────────
const REQUIRED_FIELDS = {
  imoveis: ['nome'],
  investidores: ['nome'],
  consultores: ['nome'],
  negocios: ['movimento'],
  despesas: ['movimento'],
  tarefas: ['titulo'],
  visitas: ['imovel_id', 'data_hora'],
  empreiteiros: ['nome'],
}

function validateRequired(table, data) {
  const fields = REQUIRED_FIELDS[table]
  if (!fields) return null
  const missing = fields.filter(f => !data[f] || (typeof data[f] === 'string' && data[f].trim() === ''))
  if (missing.length > 0) return `Campos obrigatórios em falta: ${missing.join(', ')}`
  return null
}

// ROI é canónico: apenas escrito pela calculadora de análise (calcEngine →
// propagarParaImovel). Não há auto-calc em CRUD genérico — formulas naive
// (margem sobre custo) divergiam da definição lucroBruto/capitalNecessario
// usada pela análise activa, criando ROIs incoerentes nos cards e KPIs.

// ── Audit log ────────────────────────────────────────────────
// regiaoActiva: região seleccionada pelo operador no momento da acção
// (vinda do header X-Regiao). NULL = acção fora de contexto regional.
async function auditLog(tabela, registoId, acao, dadosAnteriores, dadosNovos, regiaoActiva = null) {
  await pool.query(
    `INSERT INTO audit_log (tabela, registo_id, acao, dados_anteriores, dados_novos, regiao_activa) VALUES ($1, $2, $3, $4, $5, $6)`,
    [tabela, registoId, acao, dadosAnteriores ? JSON.stringify(dadosAnteriores) : null, dadosNovos ? JSON.stringify(dadosNovos) : null, regiaoActiva || null]
  )
}

// ── Limpar dados do form antes de inserir/actualizar ─────────
// Campos TEXT cujo nome bate no regex de coerção numérica mas que guardam
// strings (selects, gamas). NUNCA passar por parseFloat — '<10%' → NaN → null.
const TEXT_FIELDS_KEEP_STRING = new Set(['roi_pretendido', 'roi_anualizado_pretendido'])

function cleanFormData(data) {
  const cleaned = { ...data }
  for (const [key, value] of Object.entries(cleaned)) {
    // Remover campos virtuais/enriched (prefixo _) — não existem na BD
    if (key.startsWith('_')) {
      delete cleaned[key]
      continue
    }
    // Converter strings vazias em null (evita erros de tipo no PostgreSQL)
    if (value === '' || value === undefined) {
      cleaned[key] = null
      continue
    }
    // Converter strings numéricas para número
    if (typeof value === 'string' && !TEXT_FIELDS_KEEP_STRING.has(key) && /^(custo|lucro|capital|ask_price|valor|roi|area|montante|score|comissao|pontuacao|tempo)/.test(key)) {
      const num = parseFloat(value)
      cleaned[key] = isNaN(num) ? null : num
    }
  }
  return cleaned
}

// ── Cache de colunas por tabela ──────────────────────────────
// Sanitiza filtros vindos do URL: chaves que não existam na tabela
// são silenciosamente descartadas (em vez de gerar SQL invalido + 500).
// Caso típico: a UI deixa filtros de outra tab no URL ao trocar de separador.
const _columnsCache = new Map()
async function getColumns(table) {
  if (_columnsCache.has(table)) return _columnsCache.get(table)
  const { rows } = await pool.query(
    `SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1`,
    [table]
  )
  const set = new Set(rows.map(r => r.column_name))
  _columnsCache.set(table, set)
  return set
}

// Colunas JSONB precisam de JSON.stringify antes de irem para o pool.query —
// o GET devolve já parsed (object/array) e o driver pg não auto-serializa para
// JSONB sem hint. Em contraste, colunas TEXT[] esperam array JS directo.
const _jsonbColsCache = new Map()
async function getJsonbColumns(table) {
  if (_jsonbColsCache.has(table)) return _jsonbColsCache.get(table)
  const { rows } = await pool.query(
    `SELECT column_name FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = $1 AND data_type IN ('json','jsonb')`,
    [table]
  )
  const set = new Set(rows.map(r => r.column_name))
  _jsonbColsCache.set(table, set)
  return set
}

function serializeForCol(value, isJsonb) {
  if (!isJsonb) return value
  if (value === null || value === undefined) return null
  if (typeof value === 'string') return value
  return JSON.stringify(value)
}

// ── Generic CRUD factory ─────────────────────────────────────
function createCRUD(table, { searchFields = ['nome'], defaultSort = 'created_at DESC' } = {}) {
  return {
    async list({ limit = 100, offset = 0, sort = defaultSort, filter } = {}) {
      const params = []
      const whereParts = []
      if (filter) {
        const cols = await getColumns(table)
        // Caso especial: investidores filtram por regioes_preferidas (JSON array)
        // em vez de coluna regiao igual. Pool unificado: investidor visível na
        // região X se "X" estiver no array regioes_preferidas.
        if (table === 'investidores' && filter.regiao && cols.has('regioes_preferidas')) {
          params.push(`%"${filter.regiao}"%`)
          whereParts.push(`regioes_preferidas LIKE $${params.length}`)
        }
        for (const [k, v] of Object.entries(filter)) {
          if (v === undefined || v === null || v === '') continue
          if (!cols.has(k)) continue
          if (table === 'investidores' && k === 'regiao') continue // já tratado acima
          params.push(v)
          whereParts.push(`${k} = $${params.length}`)
        }
      }
      const whereSql = whereParts.length > 0 ? ` WHERE ${whereParts.join(' AND ')}` : ''
      // Window function COUNT(*) OVER() devolve o total na mesma query — evita
      // 2º round-trip a Supabase para o COUNT (poupava ~50-150ms por list).
      const query = `SELECT *, COUNT(*) OVER() AS __total FROM ${table}${whereSql}
                     ORDER BY ${sort} LIMIT $${params.length + 1} OFFSET $${params.length + 2}`
      params.push(limit, offset)
      const { rows } = await pool.query(query, params)
      const total = rows.length > 0 ? parseInt(rows[0].__total) : 0
      // Remover __total dos rows antes de devolver ao cliente
      const data = rows.map(({ __total, ...r }) => r)
      return { data, total, limit, offset }
    },

    async getById(id) {
      const { rows } = await pool.query(`SELECT * FROM ${table} WHERE id = $1`, [id])
      return rows[0] ?? null
    },

    async create(rawData, { regiaoActiva = null } = {}) {
      const data = cleanFormData(rawData)
      const validationError = validateRequired(table, data)
      if (validationError) throw new Error(validationError)
      const id = randomUUID()
      const now = new Date().toISOString()
      const today = now.slice(0, 10)
      const SYSTEM_FIELDS = new Set(['id', 'created_at', 'updated_at', 'synced_at', 'notion_id'])

      // Auto-fill dates on create
      if (table === 'imoveis' && !data.data_adicionado) data.data_adicionado = today
      if (table === 'investidores' && !data.data_primeiro_contacto) data.data_primeiro_contacto = today
      if (table === 'consultores' && !data.data_inicio) data.data_inicio = today
      if (table === 'negocios' && !data.data) data.data = today

      // Filtrar colunas inexistentes (ex: middleware injecta `regiao` em tabelas sem essa coluna)
      const tableCols = await getColumns(table)
      const jsonbCols = await getJsonbColumns(table)
      const entries = Object.entries(data).filter(([k, v]) => v !== undefined && !SYSTEM_FIELDS.has(k) && tableCols.has(k))
      const cleanData = Object.fromEntries(entries)
      const cols = ['id', ...entries.map(([k]) => k), 'created_at', 'updated_at']
      const vals = cols.map((_, i) => `$${i + 1}`)
      const params = [id, ...entries.map(([k, v]) => serializeForCol(v, jsonbCols.has(k))), now, now]
      await pool.query(`INSERT INTO ${table} (${cols.join(', ')}) VALUES (${vals.join(', ')})`, params)
      auditLog(table, id, 'INSERT', null, { id, ...cleanData }, regiaoActiva)
      return { id, ...cleanData, created_at: now, updated_at: now }
    },

    async update(id, rawData, { regiaoActiva = null } = {}) {
      const data = cleanFormData(rawData)
      const { rows: existing } = await pool.query(`SELECT * FROM ${table} WHERE id = $1`, [id])
      if (!existing[0]) return null
      const now = new Date().toISOString()
      const SYSTEM_FIELDS = new Set(['id', 'created_at', 'updated_at', 'synced_at', 'notion_id'])

      const tableCols = await getColumns(table)
      const jsonbCols = await getJsonbColumns(table)
      const entries = Object.entries(data).filter(([k, v]) => v !== undefined && !SYSTEM_FIELDS.has(k) && tableCols.has(k))
      const cleanData = Object.fromEntries(entries)
      const sets = entries.map(([k], i) => `${k} = $${i + 1}`)
      sets.push(`updated_at = $${entries.length + 1}`)
      const params = [...entries.map(([k, v]) => serializeForCol(v, jsonbCols.has(k))), now, id]
      await pool.query(`UPDATE ${table} SET ${sets.join(', ')} WHERE id = $${entries.length + 2}`, params)
      auditLog(table, id, 'UPDATE', existing[0], cleanData, regiaoActiva)
      return { ...existing[0], ...cleanData, updated_at: now }
    },

    async delete(id, { regiaoActiva = null } = {}) {
      const { rows: existing } = await pool.query(`SELECT * FROM ${table} WHERE id = $1`, [id])
      if (!existing[0]) return false
      await pool.query(`DELETE FROM ${table} WHERE id = $1`, [id])
      auditLog(table, id, 'DELETE', existing[0], null, regiaoActiva)
      return true
    },

    async search(q, limit = 20, { regiao } = {}) {
      const conditions = searchFields.map(f => `${f} ILIKE $1`).join(' OR ')
      const params = [`%${q}%`]
      let regiaoClause = ''
      if (regiao) {
        const cols = await getColumns(table)
        // Caso especial: investidores (pool unificado por regioes_preferidas)
        if (table === 'investidores' && cols.has('regioes_preferidas')) {
          params.push(`%"${regiao}"%`)
          regiaoClause = ` AND regioes_preferidas LIKE $${params.length}`
        } else if (cols.has('regiao')) {
          params.push(regiao)
          regiaoClause = ` AND regiao = $${params.length}`
        }
      }
      params.push(limit)
      const { rows } = await pool.query(
        `SELECT * FROM ${table} WHERE (${conditions})${regiaoClause} ORDER BY updated_at DESC LIMIT $${params.length}`,
        params,
      )
      return rows
    },

    async stats({ regiao } = {}) {
      // Filtro especial para investidores: pool unificado por região via
      // regioes_preferidas (JSON array). Outras tabelas têm coluna regiao directa.
      let where = ''
      const params = []
      if (regiao) {
        const cols = await getColumns(table)
        if (table === 'investidores' && cols.has('regioes_preferidas')) {
          params.push(`%"${regiao}"%`)
          where = `WHERE regioes_preferidas LIKE $1`
        } else if (cols.has('regiao')) {
          params.push(regiao)
          where = `WHERE regiao = $1`
        }
      }
      const { rows } = await pool.query(`SELECT COUNT(*) as c, MAX(updated_at) as d FROM ${table} ${where}`, params)
      return { table, total: parseInt(rows[0].c), lastUpdate: rows[0].d }
    },
  }
}

// ── Exported CRUDs ───────────────────────────────────────────
export const Imoveis = createCRUD('imoveis', { searchFields: ['nome', 'zona', 'tipologia', 'origem'], defaultSort: 'data_adicionado DESC NULLS LAST' })
export const Investidores = createCRUD('investidores', { searchFields: ['nome', 'email', 'telemovel', 'origem'], defaultSort: 'updated_at DESC' })
export const Consultores = createCRUD('consultores', { searchFields: ['nome', 'contacto', 'email'], defaultSort: 'updated_at DESC' })
export const Negocios = createCRUD('negocios', { searchFields: ['movimento', 'categoria'], defaultSort: 'data DESC NULLS LAST' })
export const Despesas = createCRUD('despesas', { searchFields: ['movimento', 'categoria'], defaultSort: 'data DESC NULLS LAST' })
export const Tarefas = createCRUD('tarefas', { searchFields: ['tarefa'], defaultSort: 'created_at DESC' })
export const ConsultorInteracoes = createCRUD('consultor_interacoes', { searchFields: ['notas'], defaultSort: 'data_hora DESC' })
export const ConsultorFollowups = createCRUD('consultor_followups', { searchFields: ['motivo'], defaultSort: 'data DESC' })
export const DocumentosInvestidor = createCRUD('documentos_investidor', { searchFields: ['nome', 'tipo'], defaultSort: 'created_at DESC' })
export const Visitas = createCRUD('visitas', { searchFields: ['notas', 'resultado'], defaultSort: 'data_hora DESC' })
export const Empreiteiros = createCRUD('empreiteiros', { searchFields: ['nome', 'empresa', 'contacto', 'email', 'alvara'], defaultSort: 'updated_at DESC' })

export async function getDashboardStats({ regiao } = {}) {
  const opts = { regiao }
  const [imoveis, investidores, consultores, negocios, despesas] = await Promise.all([
    Imoveis.stats(opts),
    Investidores.stats(opts),
    Consultores.stats(opts),
    Negocios.stats(opts),
    Despesas.stats(opts),
  ])
  return { imoveis, investidores, consultores, negocios, despesas }
}

export { auditLog }
export default pool
