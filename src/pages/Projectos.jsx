import { useState, useEffect, useRef, Fragment } from 'react'
import { X, Trash2, Plus, Filter, ArrowUpDown, ChevronDown, ChevronUp, Check } from 'lucide-react'
import { Header } from '../components/layout/Header.jsx'
import { apiFetch } from '../lib/api.js'

const EUR = v => new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(v ?? 0)

const CAT_COLORS = {
  'Wholesalling':         '#6366f1',
  'Mediação Imobiliária': '#10b981',
  'CAEP':                 '#f59e0b',
  'Fix and Flip':         '#ef4444',
}

const FASE_COLOR = {
  'Fase de obras': 'bg-blue-100 text-blue-700',
  'Fase de venda': 'bg-yellow-100 text-yellow-700',
  'Vendido':       'bg-green-100 text-green-700',
}

const CATEGORIAS = ['Wholesalling', 'CAEP', 'Mediação Imobiliária', 'Fix and Flip']
const FASES = ['Fase de obras', 'Fase de venda', 'Vendido']

function CatBadge({ cat }) {
  const color = CAT_COLORS[cat] ?? '#6366f1'
  return (
    <span className="px-2 py-0.5 rounded-full text-xs font-medium"
      style={{ backgroundColor: color + '22', color }}>
      {cat}
    </span>
  )
}

export function Projectos() {
  const [kpis, setKpis] = useState(null)
  const [projectos, setProjectos] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [editing, setEditing] = useState(null)
  const [expanded, setExpanded] = useState(null)

  async function load() {
    setLoading(true); setError(null)
    try {
      const safe = (p) => p.then(r => r.ok ? r.json() : null).catch(() => null)
      const [k, n] = await Promise.all([
        safe(apiFetch('/api/kpis/financeiro')),
        safe(apiFetch('/api/crm/negocios?limit=200')),
      ])
      if (!k) throw new Error('Erro ao carregar projectos')
      setKpis(k)
      setProjectos(n?.data ?? [])
    } catch (err) { setError(err.message) }
    finally { setLoading(false) }
  }

  async function save(form) {
    try {
      const isNew = !form.id
      const url = isNew ? '/api/crm/negocios' : `/api/crm/negocios/${form.id}`
      const r = await apiFetch(url, { method: isNew ? 'POST' : 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
      if (!r.ok) { const err = await r.json().catch(() => ({})); throw new Error(err.error || `Erro ${r.status}`) }
      setEditing(null); setError(null); load()
    } catch (e) { console.error('[saveProjecto]', e); setError(e.message) }
  }

  async function remove(id) {
    if (!confirm('Apagar este projecto?')) return
    await apiFetch(`/api/crm/negocios/${id}`, { method: 'DELETE' })
    load()
  }

  async function confirmarPagamento(negocioId, trancheIndex, descricao) {
    if (!confirm(`Confirmar recebimento: ${descricao || 'Pagamento'}?`)) return
    try {
      const r = await apiFetch(`/api/crm/negocios/${negocioId}/confirmar-pagamento`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trancheIndex }),
      })
      if (!r.ok) { const err = await r.json().catch(() => ({})); throw new Error(err.error || `Erro ${r.status}`) }
      load()
    } catch (e) { console.error('[confirmarPagamento]', e); setError(e.message) }
  }

  useEffect(() => { load() }, [])

  const lista = kpis?.negociosLista ?? []

  // Filters & sort
  const [filterCat, setFilterCat] = useState('')
  const [filterFase, setFilterFase] = useState('')
  const [sortKey, setSortKey] = useState('movimento')
  const [sortDir, setSortDir] = useState('asc')
  const toggleSort = (key) => { if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc'); else { setSortKey(key); setSortDir('asc') } }

  const filtered = lista
    .filter(n => !filterCat || n.categoria === filterCat)
    .filter(n => !filterFase || n.fase === filterFase)
    .sort((a, b) => {
      let va = a[sortKey] ?? '', vb = b[sortKey] ?? ''
      if (typeof va === 'number') return sortDir === 'asc' ? va - vb : vb - va
      return sortDir === 'asc' ? String(va).localeCompare(String(vb)) : String(vb).localeCompare(String(va))
    })

  const SortHeader = ({ label, field, className = '' }) => (
    <th className={`py-2 px-3 cursor-pointer hover:text-gray-600 select-none ${className}`} onClick={() => toggleSort(field)}>
      <span className="inline-flex items-center gap-1">{label} {sortKey === field && <ArrowUpDown className="w-3 h-3" />}</span>
    </th>
  )

  return (
    <>
      <Header title="Projectos" subtitle="Gestão de projectos activos" onRefresh={load} loading={loading} />

      <div className="p-4 sm:p-6 flex flex-col gap-4 sm:gap-6">
        {error && <div className="p-4 bg-red-50 border border-red-200 text-red-700 rounded-xl text-sm">Erro: {error}</div>}

        {/* Toolbar */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <button onClick={() => setEditing({})} className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-xl hover:bg-indigo-700 transition-colors">
            <Plus className="w-4 h-4" /> Novo Projecto
          </button>
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-gray-400" />
            <select value={filterCat} onChange={e => setFilterCat(e.target.value)} className="text-xs border rounded-lg px-2 py-1.5">
              <option value="">Todas categorias</option>
              {CATEGORIAS.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <select value={filterFase} onChange={e => setFilterFase(e.target.value)} className="text-xs border rounded-lg px-2 py-1.5">
              <option value="">Todas fases</option>
              {FASES.map(f => <option key={f} value={f}>{f}</option>)}
            </select>
          </div>
        </div>

        {/* Edit form */}
        {editing !== null && <ProjectoForm item={editing} onSave={save} onCancel={() => setEditing(null)} />}

        {/* KPIs por categoria */}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4">
          {(kpis?.categorias ?? []).map(c => (
            <div key={c.categoria} className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
              <div className="flex items-center gap-2 mb-1">
                <span className="w-3 h-3 rounded-full inline-block flex-shrink-0" style={{ background: CAT_COLORS[c.categoria] ?? '#6366f1' }} />
                <span className="text-xs text-gray-500 font-medium truncate">{c.categoria}</span>
              </div>
              <p className="text-xl font-bold text-gray-900">
                {c.count} <span className="text-sm font-normal text-gray-400">projecto{c.count !== 1 ? 's' : ''}</span>
              </p>
              <p className="text-sm text-indigo-600 font-mono">{EUR(c.lucroEst)} expectável</p>
              {c.lucroReal > 0 && <p className="text-xs text-green-600 font-mono">{EUR(c.lucroReal)} recebido</p>}
            </div>
          ))}
        </div>

        {/* Tabela de projectos */}
        <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-gray-700 mb-3">
            Todos os Projectos
            <span className="text-xs text-gray-400 font-normal ml-2">({filtered.length}{filterCat || filterFase ? ` de ${lista.length}` : ''})</span>
          </h2>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-gray-400 text-xs uppercase tracking-wide">
                  <SortHeader label="Projecto" field="movimento" className="text-left" />
                  <SortHeader label="Categoria" field="categoria" className="text-left" />
                  <th className="text-left py-2 px-3">Imóvel</th>
                  <th className="text-left py-2 px-3">Consultor</th>
                  <SortHeader label="Fase" field="fase" className="text-left" />
                  <SortHeader label="Comissão" field="comissaoPct" className="text-right" />
                  <SortHeader label="Faturação Expectável" field="lucroEstimado" className="text-right" />
                  <SortHeader label="Faturação Real" field="lucroReal" className="text-right" />
                  <th className="text-left py-2 px-3">Pagamento</th>
                  <th className="py-2 px-3"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(n => {
                  const pags = n.pagamentosFaseados || []
                  const temFaseados = pags.length > 0
                  const pagsRecebidos = pags.filter(p => p.recebido)
                  const totalFaseados = pags.reduce((s, p) => s + (parseFloat(p.valor) || 0), 0)
                  const totalRecebido = pagsRecebidos.reduce((s, p) => s + (parseFloat(p.valor) || 0), 0)
                  const crm = projectos.find(x => x.id === n.id)
                  const comPct = crm?.comissao_pct
                  const isExpanded = expanded === n.id
                  return (
                  <Fragment key={n.id}>
                  <tr onClick={() => setExpanded(isExpanded ? null : n.id)}
                    className={`border-b border-gray-50 cursor-pointer transition-colors ${isExpanded ? 'bg-indigo-50' : 'hover:bg-gray-50'}`}>
                    <td className="py-2 px-3 font-medium text-gray-800">
                      <span className="flex items-center gap-1.5">
                        {isExpanded ? <ChevronUp className="w-3.5 h-3.5 text-indigo-500" /> : <ChevronDown className="w-3.5 h-3.5 text-gray-400" />}
                        {n.movimento}
                      </span>
                    </td>
                    <td className="py-2 px-3"><CatBadge cat={n.categoria} /></td>
                    <td className="py-2 px-3 text-xs text-gray-500 max-w-[120px] truncate">{n.imovelNome || '—'}</td>
                    <td className="py-2 px-3 text-xs text-gray-500 max-w-[100px] truncate">{n.consultorNome || '—'}</td>
                    <td className="py-2 px-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${FASE_COLOR[n.fase] ?? 'bg-gray-100 text-gray-600'}`}>{n.fase ?? '—'}</span>
                    </td>
                    <td className="py-2 px-3 text-right text-xs font-mono text-gray-500">{comPct ? `${comPct}%` : '—'}</td>
                    <td className="py-2 px-3 text-right font-mono text-indigo-600 font-semibold">{EUR(n.lucroEstimado)}</td>
                    <td className="py-2 px-3 text-right font-mono text-green-600">
                      {n.lucroReal > 0 ? EUR(n.lucroReal) : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="py-2 px-3 text-xs">
                      {temFaseados ? (
                        <div>
                          <span className={`px-2 py-0.5 rounded-full font-medium ${pagsRecebidos.length === pags.length ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                            {pagsRecebidos.length}/{pags.length} tranches
                          </span>
                          <p className="text-[10px] text-gray-400 mt-0.5 font-mono">{EUR(totalRecebido)} / {EUR(totalFaseados)}</p>
                        </div>
                      ) : n.pagamentoEmFalta
                        ? <span className="px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-700 font-medium">Pendente</span>
                        : <span className="px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-medium">Recebido</span>}
                    </td>
                    <td className="py-2 px-3" onClick={e => e.stopPropagation()}>
                      <button onClick={() => remove(n.id)} className="px-2 py-1 text-xs bg-red-50 text-red-600 rounded hover:bg-red-100">Apagar</button>
                    </td>
                  </tr>
                  {isExpanded && (
                    <tr>
                      <td colSpan={10} className="p-0">
                        <DetailPanel
                          negocio={n} crm={crm}
                          onEdit={() => { setExpanded(null); setEditing(crm || n) }}
                          onClose={() => setExpanded(null)}
                          confirmarPagamento={confirmarPagamento}
                        />
                      </td>
                    </tr>
                  )}
                  </Fragment>
                )})}
                {!filtered.length && (
                  <tr><td colSpan={10} className="py-8 text-center text-gray-400 text-xs">Sem projectos registados</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  )
}

// ══════════════════════════════════════════════════════════════
// DETAIL PANEL
// ══════════════════════════════════════════════════════════════
function DetailPanel({ negocio: n, crm, onEdit, onClose, confirmarPagamento }) {
  const pags = n.pagamentosFaseados || []
  const pagsRecebidos = pags.filter(p => p.recebido)
  const totalFaseados = pags.reduce((s, p) => s + (parseFloat(p.valor) || 0), 0)
  const totalRecebido = pagsRecebidos.reduce((s, p) => s + (parseFloat(p.valor) || 0), 0)
  const pctRecebido = totalFaseados > 0 ? Math.round((totalRecebido / totalFaseados) * 100) : 0
  const comPct = crm?.comissao_pct

  return (
    <div className="border-t-2 border-indigo-200">
      <div className="flex items-center justify-between px-5 py-3" style={{ background: '#0d0d0d' }}>
        <div className="flex items-center gap-3">
          <span className="text-sm font-bold" style={{ color: '#C9A84C' }}>{n.categoria || 'Projecto'}</span>
          <span className="text-white font-semibold text-sm">{n.movimento}</span>
          {n.fase && <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${FASE_COLOR[n.fase] ?? 'bg-gray-700 text-gray-300'}`}>{n.fase}</span>}
        </div>
        <div className="flex items-center gap-2">
          <button onClick={onEdit} className="px-3 py-1.5 text-xs font-medium rounded-lg bg-white/10 text-white hover:bg-white/20 transition-colors">Editar</button>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-white transition-colors"><X className="w-4 h-4" /></button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 p-5 bg-gray-50">
        <div className="space-y-3">
          <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Resumo</h4>
          <div className="space-y-2 text-sm">
            {n.imovelNome && <div className="flex justify-between"><span className="text-gray-500">Imóvel</span><span className="font-medium text-gray-800">{n.imovelNome}</span></div>}
            {n.consultorNome && <div className="flex justify-between"><span className="text-gray-500">Consultor</span><span className="font-medium text-gray-800">{n.consultorNome}</span></div>}
            {n.dataCompra && <div className="flex justify-between"><span className="text-gray-500">Data compra</span><span className="text-gray-700">{n.dataCompra}</span></div>}
            {n.dataEstimada && <div className="flex justify-between"><span className="text-gray-500">Venda estimada</span><span className="text-gray-700">{n.dataEstimada}</span></div>}
            {n.dataVenda && <div className="flex justify-between"><span className="text-gray-500">Data venda</span><span className="text-gray-700">{n.dataVenda}</span></div>}
            {n.notas && <div className="mt-2 text-xs text-gray-500 bg-white rounded-lg p-2.5 border border-gray-100">{n.notas}</div>}
          </div>
        </div>

        <div className="space-y-3">
          <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Financeiro</h4>
          <div className="space-y-2">
            <div className="bg-white rounded-lg p-3 border border-gray-100">
              <span className="text-xs text-gray-400 block">Faturação Expectável</span>
              <span className="text-xl font-bold font-mono text-indigo-600">{EUR(n.lucroEstimado)}</span>
            </div>
            <div className="bg-white rounded-lg p-3 border border-gray-100">
              <span className="text-xs text-gray-400 block">Faturação Real</span>
              <span className="text-xl font-bold font-mono text-green-600">{EUR(n.lucroReal)}</span>
            </div>
            {comPct > 0 && (
              <div className="bg-white rounded-lg p-3 border border-gray-100">
                <span className="text-xs text-gray-400 block">Comissão</span>
                <span className="text-lg font-bold text-gray-700">{comPct}%</span>
              </div>
            )}
          </div>
        </div>

        <div className="space-y-3">
          <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Tranches</h4>
          {pags.length > 0 ? (
            <>
              <div className="bg-white rounded-lg p-3 border border-gray-100">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-gray-500">{pagsRecebidos.length}/{pags.length} recebidas</span>
                  <span className="text-xs font-mono font-semibold text-gray-700">{EUR(totalRecebido)} / {EUR(totalFaseados)}</span>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-2.5">
                  <div className="h-full rounded-full bg-green-500 transition-all" style={{ width: `${pctRecebido}%` }} />
                </div>
                <p className="text-xs text-gray-400 text-right mt-1">{pctRecebido}%</p>
              </div>
              <div className="space-y-1.5">
                {pags.map((p, idx) => (
                  <div key={idx} className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm ${
                    p.recebido ? 'bg-green-50 border-green-100' :
                    (p.data && new Date(p.data) < new Date()) ? 'bg-red-50 border-red-100' :
                    'bg-yellow-50 border-yellow-100'
                  }`}>
                    {p.recebido
                      ? <Check className="w-4 h-4 text-green-600 shrink-0" />
                      : <div className="w-4 h-4 rounded-full border-2 border-gray-300 shrink-0" />
                    }
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-gray-800 truncate">{p.descricao || 'Pagamento'}</p>
                      <p className="text-[10px] text-gray-400">{p.data || 'Sem data'}</p>
                    </div>
                    <span className={`text-xs font-mono font-semibold shrink-0 ${p.recebido ? 'text-green-700' : 'text-gray-700'}`}>{EUR(p.valor)}</span>
                    {!p.recebido && (
                      <button onClick={() => confirmarPagamento(n.id, idx, `${n.movimento} — ${p.descricao || 'Pagamento'} (${EUR(p.valor)})`)}
                        className="px-2 py-1 text-[10px] font-medium bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors shrink-0">
                        Confirmar
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </>
          ) : (
            <p className="text-xs text-gray-400 bg-white rounded-lg p-3 border border-gray-100">Sem tranches definidas.</p>
          )}
        </div>
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════
// FORM
// ══════════════════════════════════════════════════════════════
function ProjectoForm({ item, onSave, onCancel }) {
  const isNew = !item.id
  const normalized = { ...item }
  if (normalized.lucroEstimado !== undefined && normalized.lucro_estimado === undefined) normalized.lucro_estimado = normalized.lucroEstimado
  if (normalized.lucroReal !== undefined && normalized.lucro_real === undefined) normalized.lucro_real = normalized.lucroReal
  if (normalized.custoRealObra !== undefined && normalized.custo_real_obra === undefined) normalized.custo_real_obra = normalized.custoRealObra
  if (normalized.capitalTotal !== undefined && normalized.capital_total === undefined) normalized.capital_total = normalized.capitalTotal
  if (normalized.dataVenda !== undefined && normalized.data_venda === undefined) normalized.data_venda = normalized.dataVenda
  if (normalized.dataCompra !== undefined && normalized.data_compra === undefined) normalized.data_compra = normalized.dataCompra
  const initPag = normalized.pagamentos_faseados ?? normalized.pagamentosFaseados ?? '[]'
  const pagStr = typeof initPag === 'string' ? initPag : JSON.stringify(initPag)
  const [f, setF] = useState({
    movimento: '', categoria: '', fase: '', lucro_estimado: '', lucro_real: '',
    custo_real_obra: '', capital_total: '', n_investidores: '', pagamento_em_falta: 1,
    data: '', data_compra: '', data_estimada_venda: '', data_venda: '', notas: '',
    ...normalized,
    pagamentos_faseados: pagStr,
  })
  const set = (k, v) => setF(p => ({ ...p, [k]: v }))
  const inputClass = "w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"

  const pagamentos = (() => { try { const raw = f.pagamentos_faseados; return typeof raw === 'string' ? JSON.parse(raw || '[]') : Array.isArray(raw) ? raw : [] } catch { return [] } })()
  const setPagamentos = (pags) => set('pagamentos_faseados', JSON.stringify(pags))
  const addPagamento = () => setPagamentos([...pagamentos, { descricao: '', valor: 0, data: '', recebido: false }])
  const removePagamento = (i) => setPagamentos(pagamentos.filter((_, j) => j !== i))
  const updatePagamento = (i, field, value) => setPagamentos(pagamentos.map((p, j) => j === i ? { ...p, [field]: value } : p))

  const totalFaseados = pagamentos.reduce((s, p) => s + (parseFloat(p.valor) || 0), 0)
  const totalRecebido = pagamentos.filter(p => p.recebido).reduce((s, p) => s + (parseFloat(p.valor) || 0), 0)

  return (
    <div className="bg-white rounded-xl border-2 border-indigo-200 p-4 sm:p-6 shadow-md">
      <h3 className="text-sm font-semibold text-gray-700 mb-4">{isNew ? 'Novo Projecto' : 'Editar Projecto'}</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 sm:gap-4">
        <div className="sm:col-span-2 xl:col-span-1">
          <label className="text-xs text-gray-500 block mb-1">Nome do Projecto *</label>
          <input value={f.movimento} onChange={e => set('movimento', e.target.value)} className={inputClass} placeholder="Ex: M3 Eiras" />
        </div>
        <div>
          <label className="text-xs text-gray-500 block mb-1">Categoria</label>
          <select value={f.categoria} onChange={e => set('categoria', e.target.value)} className={inputClass}>
            <option value="">—</option>
            {CATEGORIAS.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs text-gray-500 block mb-1">Fase</label>
          <select value={f.fase} onChange={e => set('fase', e.target.value)} className={inputClass}>
            <option value="">—</option>
            {FASES.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs text-gray-500 block mb-1">Faturação Expectável (€)</label>
          <input type="number" value={f.lucro_estimado} onChange={e => set('lucro_estimado', +e.target.value)} className={inputClass} />
        </div>
        <div>
          <label className="text-xs text-gray-500 block mb-1">Faturação Real (€)</label>
          {pagamentos.length > 0
            ? <div className="w-full px-3 py-2 rounded-lg border border-gray-100 bg-gray-50 text-sm font-mono text-green-600 font-semibold">{EUR(totalRecebido)}</div>
            : <input type="number" value={f.lucro_real} onChange={e => set('lucro_real', +e.target.value)} className={inputClass} />
          }
        </div>
        <div>
          <label className="text-xs text-gray-500 block mb-1">Data</label>
          <input type="date" value={f.data} onChange={e => set('data', e.target.value)} className={inputClass} />
        </div>
        <div>
          <label className="text-xs text-gray-500 block mb-1">Data Compra</label>
          <input type="date" value={f.data_compra} onChange={e => set('data_compra', e.target.value)} className={inputClass} />
        </div>
        <div>
          <label className="text-xs text-gray-500 block mb-1">Data Estimada Venda</label>
          <input type="date" value={f.data_estimada_venda} onChange={e => set('data_estimada_venda', e.target.value)} className={inputClass} />
        </div>
        <div>
          <label className="text-xs text-gray-500 block mb-1">Data Venda</label>
          <input type="date" value={f.data_venda} onChange={e => set('data_venda', e.target.value)} className={inputClass} />
        </div>
        <div className="sm:col-span-2 xl:col-span-3">
          <label className="text-xs text-gray-500 block mb-1">Notas</label>
          <textarea value={f.notas ?? ''} onChange={e => set('notas', e.target.value)} rows={2} className={inputClass} />
        </div>
      </div>

      {/* Pagamentos Faseados */}
      <div className="mt-5 pt-4 border-t border-gray-100">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h4 className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Pagamentos Faseados</h4>
            {pagamentos.length > 0 && (
              <div className="flex items-center gap-3 mt-1">
                <span className="text-xs text-gray-400">{EUR(totalRecebido)} / {EUR(totalFaseados)}</span>
                <div className="flex-1 max-w-[140px] bg-gray-100 rounded-full h-2">
                  <div className="h-full rounded-full bg-green-500 transition-all" style={{ width: `${totalFaseados > 0 ? Math.min(100, (totalRecebido / totalFaseados) * 100) : 0}%` }} />
                </div>
                <span className="text-xs text-gray-400">{pagamentos.filter(p => p.recebido).length}/{pagamentos.length} tranches</span>
              </div>
            )}
          </div>
          <button onClick={addPagamento} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-indigo-50 text-indigo-600 hover:bg-indigo-100 transition-colors">
            <Plus className="w-3.5 h-3.5" /> Adicionar
          </button>
        </div>
        {pagamentos.length > 0 ? (
          <div className="space-y-2">
            {pagamentos.map((p, i) => (
              <div key={i} className="grid grid-cols-12 gap-2 items-center">
                <div className="col-span-4">
                  <input value={p.descricao} placeholder="Ex: Sinal, 2ª tranche..."
                    onChange={e => updatePagamento(i, 'descricao', e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" />
                </div>
                <div className="col-span-2">
                  <input type="number" value={p.valor || ''} placeholder="€"
                    onChange={e => updatePagamento(i, 'valor', parseFloat(e.target.value) || 0)}
                    className="w-full px-2.5 py-1.5 rounded-lg border border-gray-200 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-300" />
                </div>
                <div className="col-span-3">
                  <input type="date" value={p.data || ''}
                    onChange={e => updatePagamento(i, 'data', e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" />
                </div>
                <div className="col-span-2 flex items-center gap-1.5">
                  <label className="flex items-center gap-1 cursor-pointer">
                    <input type="checkbox" checked={!!p.recebido}
                      onChange={e => updatePagamento(i, 'recebido', e.target.checked)}
                      className="w-4 h-4 rounded border-gray-300 text-green-600 focus:ring-green-300" />
                    <span className="text-xs text-gray-500 hidden sm:inline">{p.recebido ? 'Recebido' : 'Pendente'}</span>
                  </label>
                </div>
                <div className="col-span-1 flex justify-end">
                  <button onClick={() => removePagamento(i)} className="p-1 text-gray-300 hover:text-red-500 transition-colors">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-gray-400 py-2">Sem pagamentos faseados.</p>
        )}
      </div>

      <div className="flex gap-3 mt-4">
        <button onClick={() => {
          const autoFields = pagamentos.length > 0
            ? { lucro_real: totalRecebido, pagamento_em_falta: pagamentos.some(p => !p.recebido) ? 1 : 0 }
            : {}
          onSave({ ...f, ...autoFields })
        }} disabled={!f.movimento?.trim()} className="px-5 py-2 bg-indigo-600 text-white text-sm font-medium rounded-xl hover:bg-indigo-700 disabled:opacity-40">
          {isNew ? 'Criar' : 'Guardar'}
        </button>
        <button onClick={onCancel} className="px-5 py-2 bg-gray-100 text-gray-600 text-sm font-medium rounded-xl hover:bg-gray-200">Cancelar</button>
      </div>
    </div>
  )
}
