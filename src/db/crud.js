/**
 * CRUD genérico para todas as tabelas do CRM (PostgreSQL).
 */
import pool from './pg.js'
import { randomUUID } from 'crypto'

// ── Audit log ────────────────────────────────────────────────
async function auditLog(tabela, registoId, acao, dadosAnteriores, dadosNovos) {
  await pool.query(
    `INSERT INTO audit_log (tabela, registo_id, acao, dados_anteriores, dados_novos) VALUES ($1, $2, $3, $4, $5)`,
    [tabela, registoId, acao, dadosAnteriores ? JSON.stringify(dadosAnteriores) : null, dadosNovos ? JSON.stringify(dadosNovos) : null]
  )
}

// ── Generic CRUD factory ─────────────────────────────────────
function createCRUD(table, { searchFields = ['nome'], defaultSort = 'created_at DESC' } = {}) {
  return {
    async list({ limit = 100, offset = 0, sort = defaultSort, filter } = {}) {
      let query = `SELECT * FROM ${table}`
      const params = []
      if (filter) {
        const conditions = Object.entries(filter)
          .filter(([, v]) => v !== undefined && v !== null && v !== '')
        if (conditions.length > 0) {
          const where = conditions.map(([k, v], i) => { params.push(v); return `${k} = $${i + 1}` })
          query += ` WHERE ${where.join(' AND ')}`
        }
      }
      query += ` ORDER BY ${sort} LIMIT $${params.length + 1} OFFSET $${params.length + 2}`
      params.push(limit, offset)
      const { rows } = await pool.query(query, params)
      const { rows: countRows } = await pool.query(`SELECT COUNT(*) as c FROM ${table}`)
      return { data: rows, total: parseInt(countRows[0].c), limit, offset }
    },

    async getById(id) {
      const { rows } = await pool.query(`SELECT * FROM ${table} WHERE id = $1`, [id])
      return rows[0] ?? null
    },

    async create(data) {
      const id = randomUUID()
      const now = new Date().toISOString()
      const entries = Object.entries(data).filter(([, v]) => v !== undefined)
      const cols = ['id', ...entries.map(([k]) => k), 'created_at', 'updated_at']
      const vals = cols.map((_, i) => `$${i + 1}`)
      const params = [id, ...entries.map(([, v]) => v), now, now]
      await pool.query(`INSERT INTO ${table} (${cols.join(', ')}) VALUES (${vals.join(', ')})`, params)
      auditLog(table, id, 'INSERT', null, { id, ...data })
      return { id, ...data, created_at: now, updated_at: now }
    },

    async update(id, data) {
      const { rows: existing } = await pool.query(`SELECT * FROM ${table} WHERE id = $1`, [id])
      if (!existing[0]) return null
      const now = new Date().toISOString()
      const entries = Object.entries(data).filter(([, v]) => v !== undefined)
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

    async stats() {
      const { rows } = await pool.query(`SELECT COUNT(*) as c, MAX(updated_at) as d FROM ${table}`)
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

export async function getDashboardStats() {
  return {
    imoveis: await Imoveis.stats(),
    investidores: await Investidores.stats(),
    consultores: await Consultores.stats(),
    negocios: await Negocios.stats(),
    despesas: await Despesas.stats(),
  }
}

export { auditLog }
export default pool
