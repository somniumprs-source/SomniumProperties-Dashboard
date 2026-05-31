import { useState, useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { ChevronDown, ChevronRight, History, Search, RefreshCcw } from 'lucide-react'
import { apiFetch } from '../lib/api.js'

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
  INSERT: { label: 'Criado', cls: 'bg-emerald-100 text-emerald-700' },
  UPDATE: { label: 'Alterado', cls: 'bg-blue-100 text-blue-700' },
  DELETE: { label: 'Eliminado', cls: 'bg-red-100 text-red-700' },
}

function formatValor(v) {
  if (v === null || v === undefined) return <span className="text-gray-400 italic">vazio</span>
  if (typeof v === 'object') return <code className="text-[11px]">{JSON.stringify(v)}</code>
  const s = String(v)
  return s.length > 80 ? s.slice(0, 80) + '…' : s
}

function entidadeLink(row) {
  const nome = row.entidade_nome || row.entidade_id
  if (row.entidade === 'imoveis') return <Link to={`/crm?aba=imoveis&id=${row.entidade_id}`} className="text-brand-gold hover:underline">{nome}</Link>
  if (row.entidade === 'investidores') return <Link to={`/crm?aba=investidores&id=${row.entidade_id}`} className="text-brand-gold hover:underline">{nome}</Link>
  if (row.entidade === 'negocios') return <Link to={`/financeiro?id=${row.entidade_id}`} className="text-brand-gold hover:underline">{nome}</Link>
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
      setError('Erro a carregar: ' + e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [offset])

  useEffect(() => {
    apiFetch('/api/crm/auditoria/utilizadores').then(r => r.ok ? r.json() : []).then(setUtilizadores).catch(() => {})
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
    <div className="p-6 max-w-7xl mx-auto">
      <header className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-brand-gold/10 flex items-center justify-center">
          <History className="w-5 h-5 text-brand-gold" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-brand-dark">Auditoria</h1>
          <p className="text-sm text-gray-500">Histórico de alterações em imóveis, investidores e negócios</p>
        </div>
      </header>

      <form onSubmit={aplicarFiltros} className="bg-white border border-gray-200 rounded-2xl p-4 mb-4 grid grid-cols-1 md:grid-cols-5 gap-3">
        <div>
          <label className="text-[11px] uppercase tracking-wider text-gray-500 font-semibold">Entidade</label>
          <select value={filtros.entidade} onChange={e => setFiltros(f => ({ ...f, entidade: e.target.value }))}
            className="mt-1 w-full text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white focus:border-brand-gold focus:outline-none">
            {ENTIDADES.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        <div>
          <label className="text-[11px] uppercase tracking-wider text-gray-500 font-semibold">Utilizador</label>
          <input type="text" list="audit-users" value={filtros.user_email}
            onChange={e => setFiltros(f => ({ ...f, user_email: e.target.value }))}
            placeholder="email"
            className="mt-1 w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:border-brand-gold focus:outline-none" />
          <datalist id="audit-users">
            {utilizadores.map(u => <option key={u} value={u} />)}
          </datalist>
        </div>
        <div>
          <label className="text-[11px] uppercase tracking-wider text-gray-500 font-semibold">Desde</label>
          <input type="date" value={filtros.from} onChange={e => setFiltros(f => ({ ...f, from: e.target.value }))}
            className="mt-1 w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:border-brand-gold focus:outline-none" />
        </div>
        <div>
          <label className="text-[11px] uppercase tracking-wider text-gray-500 font-semibold">Até</label>
          <input type="date" value={filtros.to} onChange={e => setFiltros(f => ({ ...f, to: e.target.value }))}
            className="mt-1 w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:border-brand-gold focus:outline-none" />
        </div>
        <div className="flex items-end gap-2">
          <button type="submit" disabled={loading}
            className="flex-1 bg-brand-gold text-brand-dark font-semibold text-sm rounded-lg px-3 py-2 hover:bg-brand-gold/90 disabled:opacity-50 flex items-center justify-center gap-2">
            <Search className="w-4 h-4" /> Filtrar
          </button>
          <button type="button" onClick={() => { setFiltros({ entidade: '', user_email: '', from: '', to: '' }); setOffset(0); setTimeout(load, 0) }}
            className="p-2 text-gray-500 hover:bg-gray-100 rounded-lg" title="Limpar filtros">
            <RefreshCcw className="w-4 h-4" />
          </button>
        </div>
      </form>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl p-4 mb-4">{error}</div>
      )}

      <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr className="text-[11px] uppercase tracking-wider text-gray-500">
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
              <tr><td colSpan={7} className="text-center text-gray-400 py-8">A carregar...</td></tr>
            )}
            {!loading && rows.length === 0 && !error && (
              <tr><td colSpan={7} className="text-center text-gray-400 py-8">Sem registos para os filtros aplicados.</td></tr>
            )}
            {rows.map(row => {
              const isOpen = expanded.has(row.id)
              const op = OPERACAO_STYLE[row.operacao] || { label: row.operacao, cls: 'bg-gray-100 text-gray-700' }
              const nCampos = Array.isArray(row.alteracoes) ? row.alteracoes.length : 0
              return (
                <RowAuditoria key={row.id} row={row} isOpen={isOpen} op={op} nCampos={nCampos} onToggle={() => toggleExpand(row.id)} />
              )
            })}
          </tbody>
        </table>
        <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 text-xs text-gray-500">
          <span>{total} registos · página {paginaActual} de {totalPaginas}</span>
          <div className="flex items-center gap-2">
            <button disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - limit))}
              className="px-3 py-1 rounded border border-gray-200 disabled:opacity-30">Anterior</button>
            <button disabled={offset + limit >= total} onClick={() => setOffset(offset + limit)}
              className="px-3 py-1 rounded border border-gray-200 disabled:opacity-30">Seguinte</button>
          </div>
        </div>
      </div>
    </div>
  )
}

function RowAuditoria({ row, isOpen, op, nCampos, onToggle }) {
  return (
    <>
      <tr className="border-b border-gray-100 hover:bg-gray-50 cursor-pointer" onClick={onToggle}>
        <td className="px-3 py-2 text-gray-400">
          {nCampos > 0 ? (isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />) : null}
        </td>
        <td className="px-3 py-2 whitespace-nowrap text-gray-700">
          {new Date(row.created_at).toLocaleString('pt-PT', { dateStyle: 'short', timeStyle: 'medium' })}
        </td>
        <td className="px-3 py-2 text-gray-700">{row.user_email || <span className="text-gray-400 italic">sistema</span>}</td>
        <td className="px-3 py-2 text-gray-500 text-[11px] uppercase tracking-wider">{ENTIDADE_LABEL[row.entidade] || row.entidade}</td>
        <td className="px-3 py-2">{entidadeLink(row)}</td>
        <td className="px-3 py-2">
          <span className={`text-[10px] uppercase tracking-wider font-semibold px-2 py-0.5 rounded ${op.cls}`}>{op.label}</span>
        </td>
        <td className="px-3 py-2 text-gray-500">{nCampos}</td>
      </tr>
      {isOpen && (
        <tr className="bg-gray-50/60 border-b border-gray-100">
          <td></td>
          <td colSpan={6} className="px-3 py-3">
            {row.operacao === 'DELETE' ? (
              <div className="text-xs text-gray-600">
                <p className="font-semibold mb-1">Snapshot eliminado:</p>
                <pre className="bg-white border border-gray-200 rounded p-2 overflow-x-auto text-[11px]">{JSON.stringify(row.alteracoes?.[0]?.antes, null, 2)}</pre>
              </div>
            ) : (
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-[10px] uppercase tracking-wider text-gray-400">
                    <th className="text-left px-2 py-1">Campo</th>
                    <th className="text-left px-2 py-1">Antes</th>
                    <th className="text-left px-2 py-1">Depois</th>
                  </tr>
                </thead>
                <tbody>
                  {(row.alteracoes || []).map((a, i) => (
                    <tr key={i} className="border-t border-gray-200">
                      <td className="px-2 py-1.5 font-mono text-[11px] text-brand-gold">{a.campo}</td>
                      <td className="px-2 py-1.5 text-gray-600">{formatValor(a.antes)}</td>
                      <td className="px-2 py-1.5 text-gray-900 font-medium">{formatValor(a.depois)}</td>
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
