import { useState, useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { ChevronDown, ChevronRight, Search, RefreshCcw } from 'lucide-react'
import { apiFetch } from '../lib/api.js'
import { friendlyError } from '../lib/friendlyError.js'
import { ScrollableTable } from '../components/ui/ScrollableTable.jsx'
import { Header } from '../components/layout/Header.jsx'

const ENTIDADES = [
  { value: '', label: 'Todas' },
  { value: 'imoveis', label: 'Imóveis' },
  { value: 'investidores', label: 'Investidores' },
  { value: 'negocios', label: 'Negócios' },
]

const ENTIDADE_LABEL = {
  imoveis: 'Imóvel', investidores: 'Investidor', negocios: 'Negócio',
}

const OPERACAO_STYLE = {
  INSERT: { label: 'Criado', cls: 'bg-success/15 text-success' },
  UPDATE: { label: 'Alterado', cls: 'bg-surface-muted text-ink' },
  DELETE: { label: 'Eliminado', cls: 'bg-danger/15 text-danger' },
}

function formatValor(v) {
  if (v === null || v === undefined) return <span className="text-ink-muted italic">vazio</span>
  if (typeof v === 'object') return <code className="text-[11px]">{JSON.stringify(v)}</code>
  const s = String(v)
  return s.length > 80 ? s.slice(0, 80) + '…' : s
}

function entidadeLink(row) {
  const nome = row.entidade_nome || row.entidade_id
  if (row.entidade === 'imoveis') return <Link to={`/crm?aba=imoveis&id=${row.entidade_id}`} className="text-ink font-medium underline decoration-line underline-offset-2 hover:decoration-ink">{nome}</Link>
  if (row.entidade === 'investidores') return <Link to={`/crm?aba=investidores&id=${row.entidade_id}`} className="text-ink font-medium underline decoration-line underline-offset-2 hover:decoration-ink">{nome}</Link>
  if (row.entidade === 'negocios') return <Link to={`/financeiro?id=${row.entidade_id}`} className="text-ink font-medium underline decoration-line underline-offset-2 hover:decoration-ink">{nome}</Link>
  return nome
}

export default function Auditoria() {
  const [rows, setRows] = useState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [expanded, setExpanded] = useState(new Set())
  const [utilizadores, setUtilizadores] = useState([])

  const [filtros, setFiltros] = useState({
    entidade: '',
    user_email: '',
    from: '',
    to: '',
  })
  const [offset, setOffset] = useState(0)
  const limit = 100

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const qs = new URLSearchParams()
      if (filtros.entidade) qs.set('entidade', filtros.entidade)
      if (filtros.user_email) qs.set('user_email', filtros.user_email)
      if (filtros.from) qs.set('from', filtros.from)
      if (filtros.to) qs.set('to', filtros.to)
      qs.set('limit', String(limit))
      qs.set('offset', String(offset))
      const r = await apiFetch(`/api/crm/auditoria?${qs.toString()}`)
      if (r.status === 403) { setError('Apenas administradores podem ver o histórico de alterações.'); setRows([]); setTotal(0); return }
      if (!r.ok) throw new Error('HTTP ' + r.status)
      const j = await r.json()
      setRows(j.rows || [])
      setTotal(j.total || 0)
    } catch (e) {
      setError(friendlyError(e))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [offset])

  useEffect(() => {
    apiFetch('/api/crm/auditoria/utilizadores').then(r => r.ok ? r.json() : []).then(u => setUtilizadores(Array.isArray(u) ? u : [])).catch(() => {})
  }, [])

  function toggleExpand(id) {
    const n = new Set(expanded)
    if (n.has(id)) n.delete(id); else n.add(id)
    setExpanded(n)
  }

  function aplicarFiltros(e) {
    e?.preventDefault()
    setOffset(0)
    load()
  }

  const totalPaginas = Math.ceil(total / limit) || 1
  const paginaActual = Math.floor(offset / limit) + 1

  return (
    <>
    <Header title="Auditoria" subtitle="Histórico de alterações em imóveis, investidores e negócios" onRefresh={load} loading={loading} />
    <div className="p-4 sm:p-6 max-w-7xl mx-auto min-w-0 w-full">

      <form onSubmit={aplicarFiltros} className="bg-surface-raised border border-line rounded-2xl p-4 mb-4 grid grid-cols-1 md:grid-cols-5 gap-3">
        <div>
          <label className="text-overline uppercase text-ink-muted font-semibold">Entidade</label>
          <select value={filtros.entidade} onChange={e => setFiltros(f => ({ ...f, entidade: e.target.value }))}
            className="mt-1 w-full text-sm border border-line rounded-lg px-3 py-2 bg-surface-raised text-ink transition-colors duration-fast focus:border-accent focus:ring-2 focus:ring-accent/30 focus:outline-none">
            {ENTIDADES.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        <div>
          <label className="text-overline uppercase text-ink-muted font-semibold">Utilizador</label>
          <input type="text" list="audit-users" value={filtros.user_email}
            onChange={e => setFiltros(f => ({ ...f, user_email: e.target.value }))}
            placeholder="nome ou email"
            className="mt-1 w-full text-sm border border-line rounded-lg px-3 py-2 bg-surface-raised text-ink transition-colors duration-fast focus:border-accent focus:ring-2 focus:ring-accent/30 focus:outline-none" />
          <datalist id="audit-users">
            {utilizadores.map(u => <option key={u} value={u} />)}
          </datalist>
        </div>
        <div>
          <label className="text-overline uppercase text-ink-muted font-semibold">Desde</label>
          <input type="date" value={filtros.from} onChange={e => setFiltros(f => ({ ...f, from: e.target.value }))}
            className="mt-1 w-full text-sm border border-line rounded-lg px-3 py-2 bg-surface-raised text-ink transition-colors duration-fast focus:border-accent focus:ring-2 focus:ring-accent/30 focus:outline-none" />
        </div>
        <div>
          <label className="text-overline uppercase text-ink-muted font-semibold">Até</label>
          <input type="date" value={filtros.to} onChange={e => setFiltros(f => ({ ...f, to: e.target.value }))}
            className="mt-1 w-full text-sm border border-line rounded-lg px-3 py-2 bg-surface-raised text-ink transition-colors duration-fast focus:border-accent focus:ring-2 focus:ring-accent/30 focus:outline-none" />
        </div>
        <div className="flex items-end gap-2">
          <button type="submit" disabled={loading}
            className="flex-1 bg-accent text-accent-foreground font-semibold text-sm rounded-lg px-3 py-2 hover:bg-accent/90 transition-colors duration-fast disabled:opacity-50 flex items-center justify-center gap-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/50">
            <Search className="w-4 h-4" /> Filtrar
          </button>
          <button type="button" onClick={() => { setFiltros({ entidade: '', user_email: '', from: '', to: '' }); setOffset(0); setTimeout(load, 0) }}
            className="p-2 text-ink-muted hover:text-ink hover:bg-surface-muted rounded-lg transition-colors duration-fast" title="Limpar filtros" aria-label="Limpar filtros">
            <RefreshCcw className="w-4 h-4" />
          </button>
        </div>
      </form>

      {error && (
        <div className="bg-danger/10 border border-danger/30 text-danger text-sm rounded-xl p-4 mb-4">{error}</div>
      )}

      <div className="bg-surface-raised border border-line rounded-2xl overflow-hidden">
        <ScrollableTable>
        <table className="w-full text-sm min-w-[680px]">
          <thead className="bg-surface border-b border-line">
            <tr className="text-overline uppercase text-ink-muted">
              <th className="text-left px-3 py-2 w-8"></th>
              <th className="text-left px-3 py-2">Data/Hora</th>
              <th className="text-left px-3 py-2">Utilizador</th>
              <th className="text-left px-3 py-2">Entidade</th>
              <th className="text-left px-3 py-2">Registo</th>
              <th className="text-left px-3 py-2">Operação</th>
              <th className="text-left px-3 py-2">Campos</th>
            </tr>
          </thead>
          <tbody>
            {loading && rows.length === 0 && (
              <tr><td colSpan={7} className="text-center text-ink-muted py-8">A carregar...</td></tr>
            )}
            {!loading && rows.length === 0 && !error && (
              <tr><td colSpan={7} className="text-center text-ink-muted py-8">Sem registos para os filtros aplicados.</td></tr>
            )}
            {rows.map(row => {
              const isOpen = expanded.has(row.id)
              const op = OPERACAO_STYLE[row.operacao] || { label: row.operacao, cls: 'bg-surface-muted text-ink' }
              const nCampos = Array.isArray(row.alteracoes) ? row.alteracoes.length : 0
              return (
                <RowAuditoria key={row.id} row={row} isOpen={isOpen} op={op} nCampos={nCampos} onToggle={() => toggleExpand(row.id)} />
              )
            })}
          </tbody>
        </table>
        </ScrollableTable>
        <div className="flex items-center justify-between px-4 py-3 border-t border-line text-xs text-ink-muted">
          <span>{total} registos · página {paginaActual} de {totalPaginas}</span>
          <div className="flex items-center gap-2">
            <button disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - limit))}
              className="px-3 py-1 rounded-lg border border-line text-ink hover:bg-surface-muted transition-colors duration-fast disabled:opacity-30">Anterior</button>
            <button disabled={offset + limit >= total} onClick={() => setOffset(offset + limit)}
              className="px-3 py-1 rounded-lg border border-line text-ink hover:bg-surface-muted transition-colors duration-fast disabled:opacity-30">Seguinte</button>
          </div>
        </div>
      </div>
    </div>
    </>
  )
}

function RowAuditoria({ row, isOpen, op, nCampos, onToggle }) {
  return (
    <>
      <tr className="border-b border-line hover:bg-surface cursor-pointer" onClick={onToggle}>
        <td className="px-3 py-2 text-ink-muted">
          {nCampos > 0 ? (isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />) : null}
        </td>
        <td className="px-3 py-2 whitespace-nowrap text-ink num">
          {new Date(row.created_at).toLocaleString('pt-PT', { dateStyle: 'short', timeStyle: 'medium' })}
        </td>
        <td className="px-3 py-2 text-ink">
          {row.user_nome ? (
            <div>
              <div className="text-ink font-medium">{row.user_nome}</div>
              {row.user_email && <div className="text-[10px] text-ink-muted">{row.user_email}</div>}
            </div>
          ) : row.user_email ? (
            <span className="text-ink">{row.user_email}</span>
          ) : (
            <span className="text-ink-muted italic">sistema</span>
          )}
        </td>
        <td className="px-3 py-2 text-ink-muted text-caption">{ENTIDADE_LABEL[row.entidade] || row.entidade}</td>
        <td className="px-3 py-2">{entidadeLink(row)}</td>
        <td className="px-3 py-2">
          <span className={`text-caption font-medium px-2 py-0.5 rounded-full ${op.cls}`}>{op.label}</span>
        </td>
        <td className="px-3 py-2 text-ink-muted">{nCampos}</td>
      </tr>
      {isOpen && (
        <tr className="bg-surface/60 border-b border-line">
          <td></td>
          <td colSpan={6} className="px-3 py-3">
            {row.operacao === 'DELETE' ? (
              <div className="text-xs text-ink-muted">
                <p className="font-semibold mb-1">Snapshot eliminado:</p>
                <pre className="bg-surface-raised border border-line rounded p-2 overflow-x-auto text-[11px]">{JSON.stringify(row.alteracoes?.[0]?.antes, null, 2)}</pre>
              </div>
            ) : (
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-overline uppercase text-ink-muted">
                    <th className="text-left px-2 py-1">Campo</th>
                    <th className="text-left px-2 py-1">Antes</th>
                    <th className="text-left px-2 py-1">Depois</th>
                  </tr>
                </thead>
                <tbody>
                  {(row.alteracoes || []).map((a, i) => (
                    <tr key={i} className="border-t border-line">
                      <td className="px-2 py-1.5 text-caption text-ink-muted">{a.campo}</td>
                      <td className="px-2 py-1.5 text-ink-muted">{formatValor(a.antes)}</td>
                      <td className="px-2 py-1.5 text-ink font-medium">{formatValor(a.depois)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </td>
        </tr>
      )}
    </>
  )
}
