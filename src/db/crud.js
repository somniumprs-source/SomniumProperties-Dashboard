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
async function auditLog(tabela, registoId, acao, dadosAnteriores, dadosNovos) {
  await pool.query(
    `INSERT INTO audit_log (tabela, registo_id, acao, dados_anteriores, dados_novos) VALUES ($1, $2, $3, $4, $5)`,
    [tabela, registoId, acao, dadosAnteriores ? JSON.stringify(dadosAnteriores) : null, dadosNovos ? JSON.stringify(dadosNovos) : null]
  )
}

// ── Limpar dados do form antes de inserir/actualizar ─────────
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
    if (typeof value === 'string' && /^(custo|lucro|capital|ask_price|valor|roi|area|montante|score|comissao|pontuacao|tempo)/.test(key)) {
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

// ── Generic CRUD factory ─────────────────────────────────────
function createCRUD(table, { searchFields = ['nome'], defaultSort = 'created_at DESC' } = {}) {
  return {
    async list({ limit = 100, offset = 0, sort = defaultSort, filter } = {}) {
      let query = `SELECT * FROM ${table}`
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
        if (whereParts.length > 0) {
          query += ` WHERE ${whereParts.join(' AND ')}`
        }
      }
      query += ` ORDER BY ${sort} LIMIT $${params.length + 1} OFFSET $${params.length + 2}`
      params.push(limit, offset)
      const { rows } = await pool.query(query, params)
      // Total respeita o filtro também (antes contava sempre a tabela inteira,
      // o que dava paginação errada quando filtros estavam activos)
      const countQuery = whereParts.length > 0
        ? `SELECT COUNT(*) as c FROM ${table} WHERE ${whereParts.join(' AND ')}`
        : `SELECT COUNT(*) as c FROM ${table}`
      const countParams = whereParts.length > 0 ? params.slice(0, -2) : []
      const { rows: countRows } = await pool.query(countQuery, countParams)
      return { data: rows, total: parseInt(countRows[0].c), limit, offset }
    },

    async getById(id) {
      const { rows } = await pool.query(`SELECT * FROM ${table} WHERE id = $1`, [id])
      return rows[0] ?? null
    },

    async create(rawData) {
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

      const entries = Object.entries(data).filter(([k, v]) => v !== undefined && !SYSTEM_FIELDS.has(k))
      const cols = ['id', ...entries.map(([k]) => k), 'created_at', 'updated_at']
      const vals = cols.map((_, i) => `$${i + 1}`)
      const params = [id, ...entries.map(([, v]) => v), now, now]
      await pool.query(`INSERT INTO ${table} (${cols.join(', ')}) VALUES (${vals.join(', ')})`, params)
      auditLog(table, id, 'INSERT', null, { id, ...data })
      return { id, ...data, created_at: now, updated_at: now }
    },

    async update(id, rawData) {
      const data = cleanFormData(rawData)
      const { rows: existing } = await pool.query(`SELECT * FROM ${table} WHERE id = $1`, [id])
      if (!existing[0]) return null
      const now = new Date().toISOString()
      const SYSTEM_FIELDS = new Set(['id', 'created_at', 'updated_at', 'synced_at', 'notion_id'])

      const entries = Object.entries(data).filter(([k, v]) => v !== undefined && !SYSTEM_FIELDS.has(k))
      const sets = entries.map(([k], i) => `${k} = $${i + 1}`)
      sets.push(`updated_at = $${entries.length + 1}`)
      const params = [...entries.map(([, v]) => v), now, id]
      await pool.query(`UPDATE ${table} SET ${sets.join(', ')} WHERE id = $${entries.length + 2}`, params)
      auditLog(table, id, 'UPDATE', existing[0], data)
      return { ...existing[0], ...data, updated_at: now }
    },

    async delete(id) {
      const { rows: existing } = await pool.query(`SELECT * FROM ${table} WHERE id = $1`, [id])
      if (!existing[0]) return false
      await pool.query(`DELETE FROM ${table} WHERE id = $1`, [id])
      auditLog(table, id, 'DELETE', existing[0], null)
      return true
    },

    async search(q, limit = 20) {
      const conditions = searchFields.map((f, i) => `${f} ILIKE $1`).join(' OR ')
      const { rows } = await pool.query(
        `SELECT * FROM ${table} WHERE ${conditions} ORDER BY updated_at DESC LIMIT $2`,
        [`%${q}%`, limit]
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
