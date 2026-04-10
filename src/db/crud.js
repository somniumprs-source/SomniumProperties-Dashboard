/**
 * CRUD genérico para todas as tabelas do CRM.
 * Cada tabela tem: list, getById, create, update, delete, search
 */
import db from './schema.js'
import { randomUUID } from 'crypto'

function round2(n) { return Math.round(n * 100) / 100 }

// ── Audit log ────────────────────────────────────────────────
function auditLog(tabela, registoId, acao, dadosAnteriores, dadosNovos) {
  db.prepare(`INSERT INTO audit_log (tabela, registo_id, acao, dados_anteriores, dados_novos) VALUES (?, ?, ?, ?, ?)`)
    .run(tabela, registoId, acao, dadosAnteriores ? JSON.stringify(dadosAnteriores) : null, dadosNovos ? JSON.stringify(dadosNovos) : null)
}

// ── Generic CRUD factory ─────────────────────────────────────
function createCRUD(table, { searchFields = ['nome'], defaultSort = 'created_at DESC' } = {}) {
  return {
    list({ limit = 100, offset = 0, sort = defaultSort, filter } = {}) {
      let query = `SELECT * FROM ${table}`
      const params = {}
      if (filter) {
        const conditions = Object.entries(filter)
          .filter(([, v]) => v !== undefined && v !== null && v !== '')
          .map(([k, v]) => { params[k] = v; return `${k} = @${k}` })
        if (conditions.length > 0) query += ` WHERE ${conditions.join(' AND ')}`
      }
      query += ` ORDER BY ${sort} LIMIT @limit OFFSET @offset`
      params.limit = limit
      params.offset = offset
      const rows = db.prepare(query).all(params)
      const total = db.prepare(`SELECT COUNT(*) as c FROM ${table}`).get().c
      return { data: rows, total, limit, offset }
    },

    getById(id) {
      return db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(id) ?? null
    },

    create(data) {
      const id = randomUUID()
      const now = new Date().toISOString()
      const cols = ['id', ...Object.keys(data), 'created_at', 'updated_at']
      const vals = cols.map(c => `@${c}`).join(', ')
      db.prepare(`INSERT INTO ${table} (${cols.join(', ')}) VALUES (${vals})`).run({
        id, ...data, created_at: now, updated_at: now,
      })
      auditLog(table, id, 'INSERT', null, { id, ...data })
      return { id, ...data, created_at: now, updated_at: now }
    },

    update(id, data) {
      const existing = db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(id)
      if (!existing) return null
      const now = new Date().toISOString()
      const sets = Object.keys(data).map(k => `${k} = @${k}`).join(', ')
      db.prepare(`UPDATE ${table} SET ${sets}, updated_at = @updated_at WHERE id = @id`).run({
        ...data, updated_at: now, id,
      })
      auditLog(table, id, 'UPDATE', existing, data)
      return { ...existing, ...data, updated_at: now }
    },

    delete(id) {
      const existing = db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(id)
      if (!existing) return false
      db.prepare(`DELETE FROM ${table} WHERE id = ?`).run(id)
      auditLog(table, id, 'DELETE', existing, null)
      return true
    },

    search(query, limit = 20) {
      const conditions = searchFields.map(f => `${f} LIKE @q`).join(' OR ')
      return db.prepare(`SELECT * FROM ${table} WHERE ${conditions} ORDER BY updated_at DESC LIMIT @limit`)
        .all({ q: `%${query}%`, limit })
    },

    count(filter) {
      if (!filter) return db.prepare(`SELECT COUNT(*) as c FROM ${table}`).get().c
      const conditions = Object.entries(filter)
        .filter(([, v]) => v !== undefined && v !== null)
        .map(([k, v]) => `${k} = @${k}`)
      if (conditions.length === 0) return db.prepare(`SELECT COUNT(*) as c FROM ${table}`).get().c
      return db.prepare(`SELECT COUNT(*) as c FROM ${table} WHERE ${conditions.join(' AND ')}`).all(filter)[0]?.c ?? 0
    },

    stats() {
      const total = db.prepare(`SELECT COUNT(*) as c FROM ${table}`).get().c
      const lastUpdate = db.prepare(`SELECT MAX(updated_at) as d FROM ${table}`).get().d
      return { table, total, lastUpdate }
    },
  }
}

// ── Exported CRUDs ───────────────────────────────────────────
export const Imoveis = createCRUD('imoveis', { searchFields: ['nome', 'zona', 'tipologia', 'origem'], defaultSort: 'data_adicionado DESC' })
export const Investidores = createCRUD('investidores', { searchFields: ['nome', 'email', 'telemovel', 'origem'], defaultSort: 'updated_at DESC' })
export const Consultores = createCRUD('consultores', { searchFields: ['nome', 'contacto', 'email'], defaultSort: 'updated_at DESC' })
export const Negocios = createCRUD('negocios', { searchFields: ['movimento', 'categoria'], defaultSort: 'data DESC' })
export const Despesas = createCRUD('despesas', { searchFields: ['movimento', 'categoria'], defaultSort: 'data DESC' })
export const Tarefas = createCRUD('tarefas', { searchFields: ['tarefa'], defaultSort: 'created_at DESC' })

// ── Dashboard stats ──────────────────────────────────────────
export function getDashboardStats() {
  return {
    imoveis: Imoveis.stats(),
    investidores: Investidores.stats(),
    consultores: Consultores.stats(),
    negocios: Negocios.stats(),
    despesas: Despesas.stats(),
  }
}

export { db, auditLog }
