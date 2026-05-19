import { useEffect, useState, useMemo } from 'react'
import { Map, TrendingUp, Scale, Trophy, Plus, Save, X } from 'lucide-react'
import { apiFetch } from '../lib/api.js'
import { useRegiao } from '../contexts/RegiaoContext.jsx'
import { REGIAO_LABEL, REGIAO_COR, concelhosDe, EUR, PCT } from '../constants.js'

const TABS = [
  { key: 'kpis', label: 'KPIs', Icon: TrendingUp },
  { key: 'mercado', label: 'Mercado de Referência', Icon: TrendingUp },
  { key: 'hotzones', label: 'Hot Zones', Icon: Map },
  { key: 'compliance', label: 'Compliance', Icon: Scale },
  { key: 'benchmarking', label: 'Benchmarking', Icon: Trophy },
]

export function AdministracaoMultiRegiao() {
  const { regiaoAtiva } = useRegiao()
  const [tab, setTab] = useState('kpis')

  if (!regiaoAtiva) {
    return (
      <div className="text-center py-12 text-sm text-neutral-500">
        Escolhe uma região para ver os dados.
      </div>
    )
  }

  const cor = REGIAO_COR[regiaoAtiva]

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 pb-2">
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center text-white"
          style={{ backgroundColor: cor }}
        >
          <Map className="w-5 h-5" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">
            {REGIAO_LABEL[regiaoAtiva]}
          </h2>
          <p className="text-xs text-neutral-500">Dados específicos desta região</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 border-b border-neutral-200 dark:border-neutral-800 pb-2">
        {TABS.map(t => {
          const I = t.Icon
          const active = tab === t.key
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg transition-colors
                ${active
                  ? 'bg-neutral-900 text-white dark:bg-white dark:text-neutral-900'
                  : 'text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100'}`}
            >
              <I className="w-4 h-4" />
              {t.label}
            </button>
          )
        })}
      </div>

      {tab === 'kpis' && <KpisPanel regiao={regiaoAtiva} />}
      {tab === 'mercado' && <MercadoPanel regiao={regiaoAtiva} />}
      {tab === 'hotzones' && <HotZonesPanel regiao={regiaoAtiva} />}
      {tab === 'compliance' && <CompliancePanel regiao={regiaoAtiva} />}
      {tab === 'benchmarking' && <BenchmarkingPanel regiao={regiaoAtiva} />}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// KPIs por região
// ─────────────────────────────────────────────────────────────
function KpisPanel() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    apiFetch('/api/crm/regiao/kpis').then(r => r.json()).then(d => { setData(d); setLoading(false) })
  }, [])

  if (loading) return <div className="text-sm text-neutral-500">A carregar…</div>
  if (!data || data.error) return <div className="text-sm text-red-500">{data?.error || 'Sem dados'}</div>

  const cards = [
    { label: 'Imóveis no pipeline', v: data.imoveis.em_pipeline, sub: `${data.imoveis.total} totais` },
    { label: 'Investidores compatíveis', v: data.investidores.total, sub: 'pool unificado' },
    { label: 'Consultores activos', v: data.consultores.ativos, sub: `${data.consultores.total} totais` },
    { label: 'Negócios vendidos', v: data.negocios.vendidos, sub: `${data.negocios.total} no pipeline` },
    { label: 'Receita real', v: EUR(data.negocios.receita_real), sub: 'fecho concretizado' },
    { label: 'Receita estimada', v: EUR(data.negocios.receita_estimada), sub: 'pipeline total' },
    { label: 'Despesa anual', v: EUR(data.despesas.anual), sub: `${data.despesas.total} despesas` },
    { label: 'Margem estimada', v: EUR(data.margem_estimada), sub: 'receita - despesa anual' },
    { label: 'ROI médio', v: data.imoveis.roi_medio != null ? PCT(data.imoveis.roi_medio) : '—', sub: 'anualizado' },
  ]

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {cards.map((c, i) => (
        <div key={i} className="p-4 bg-white dark:bg-neutral-900 rounded-xl border border-neutral-200 dark:border-neutral-800">
          <p className="text-xs text-neutral-500">{c.label}</p>
          <p className="text-2xl font-semibold text-neutral-900 dark:text-white mt-1">{c.v}</p>
          <p className="text-xs text-neutral-400 mt-1">{c.sub}</p>
        </div>
      ))}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// Mercado de Referência
// ─────────────────────────────────────────────────────────────
function MercadoPanel({ regiao }) {
  const [data, setData] = useState([])
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState(null)
  const [loading, setLoading] = useState(true)
  const concelhos = concelhosDe(regiao)

  function reload() {
    setLoading(true)
    apiFetch('/api/crm/regiao/mercado').then(r => r.json()).then(d => { setData(d.data || []); setLoading(false) })
  }

  useEffect(() => { reload() }, [regiao])

  async function remover(id) {
    if (!confirm('Eliminar entrada de mercado?')) return
    await apiFetch(`/api/crm/regiao/mercado/${id}`, { method: 'DELETE' })
    reload()
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-neutral-500">
          Preços médios por concelho e tipologia. Base para análises de wholesaling e estudos de comparáveis.
        </p>
        <button
          onClick={() => { setEditing(null); setShowForm(true) }}
          className="flex items-center gap-2 px-3 py-2 text-sm rounded-lg bg-neutral-900 text-white hover:opacity-90"
        >
          <Plus className="w-4 h-4" /> Adicionar
        </button>
      </div>

      {showForm && (
        <MercadoForm
          regiao={regiao}
          concelhos={concelhos}
          initial={editing}
          onCancel={() => { setShowForm(false); setEditing(null) }}
          onSaved={() => { setShowForm(false); setEditing(null); reload() }}
        />
      )}

      {loading ? <p className="text-sm text-neutral-500">A carregar…</p> : (
        <div className="overflow-x-auto bg-white dark:bg-neutral-900 rounded-xl border border-neutral-200 dark:border-neutral-800">
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 dark:bg-neutral-800/50 text-xs text-neutral-500">
              <tr>
                <th className="text-left px-4 py-2">Concelho</th>
                <th className="text-left px-4 py-2">Freguesia</th>
                <th className="text-left px-4 py-2">Tipologia</th>
                <th className="text-right px-4 py-2">€/m² compra</th>
                <th className="text-right px-4 py-2">€/m² venda</th>
                <th className="text-right px-4 py-2">Tempo venda</th>
                <th className="text-right px-4 py-2">Absorção</th>
                <th className="text-left px-4 py-2">Fonte</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {data.length === 0 && (
                <tr><td colSpan="9" className="text-center text-sm text-neutral-400 py-8">Sem entradas. Adiciona a primeira referência para esta região.</td></tr>
              )}
              {data.map(r => (
                <tr key={r.id} className="border-t border-neutral-100 dark:border-neutral-800">
                  <td className="px-4 py-2 font-medium">{r.concelho}</td>
                  <td className="px-4 py-2 text-neutral-500">{r.freguesia || '—'}</td>
                  <td className="px-4 py-2">{r.tipologia || '—'}</td>
                  <td className="px-4 py-2 text-right">{r.eur_m2_compra ? EUR(r.eur_m2_compra) : '—'}</td>
                  <td className="px-4 py-2 text-right">{r.eur_m2_venda ? EUR(r.eur_m2_venda) : '—'}</td>
                  <td className="px-4 py-2 text-right">{r.tempo_medio_venda_dias ? `${r.tempo_medio_venda_dias}d` : '—'}</td>
                  <td className="px-4 py-2 text-right">{r.taxa_absorcao_pct ? PCT(r.taxa_absorcao_pct) : '—'}</td>
                  <td className="px-4 py-2 text-neutral-500">{r.fonte || '—'}</td>
                  <td className="px-4 py-2 text-right">
                    <button onClick={() => { setEditing(r); setShowForm(true) }} className="text-xs text-blue-600 hover:underline mr-2">Editar</button>
                    <button onClick={() => remover(r.id)} className="text-xs text-red-600 hover:underline">Eliminar</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function MercadoForm({ regiao, concelhos, initial, onCancel, onSaved }) {
  const [form, setForm] = useState(initial || {
    regiao, concelho: concelhos[0] || '', freguesia: '', tipologia: 'T2',
    eur_m2_compra: '', eur_m2_venda: '', tempo_medio_venda_dias: '', taxa_absorcao_pct: '',
    fonte: '', data_referencia: '', notas: ''
  })
  const [saving, setSaving] = useState(false)

  async function submit(e) {
    e.preventDefault()
    setSaving(true)
    const body = {
      ...form,
      eur_m2_compra: parseFloat(form.eur_m2_compra) || null,
      eur_m2_venda: parseFloat(form.eur_m2_venda) || null,
      tempo_medio_venda_dias: parseInt(form.tempo_medio_venda_dias) || null,
      taxa_absorcao_pct: parseFloat(form.taxa_absorcao_pct) || null,
    }
    const url = initial ? `/api/crm/regiao/mercado/${initial.id}` : '/api/crm/regiao/mercado'
    const method = initial ? 'PUT' : 'POST'
    await apiFetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    setSaving(false)
    onSaved()
  }

  function f(k) { return e => setForm({ ...form, [k]: e.target.value }) }
  const ipt = 'px-3 py-2 rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-sm w-full'

  return (
    <form onSubmit={submit} className="bg-neutral-50 dark:bg-neutral-900/50 p-4 rounded-xl border border-neutral-200 dark:border-neutral-800 space-y-3">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <select value={form.concelho} onChange={f('concelho')} className={ipt} required>
          {concelhos.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <input placeholder="Freguesia (opc)" value={form.freguesia} onChange={f('freguesia')} className={ipt} />
        <select value={form.tipologia} onChange={f('tipologia')} className={ipt}>
          {['T0','T1','T2','T3','T4','T5+','Moradia','Comercial','Outro'].map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <input placeholder="Fonte (Idealista, INE, ...)" value={form.fonte} onChange={f('fonte')} className={ipt} />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <input type="number" step="any" placeholder="€/m² compra" value={form.eur_m2_compra} onChange={f('eur_m2_compra')} className={ipt} />
        <input type="number" step="any" placeholder="€/m² venda" value={form.eur_m2_venda} onChange={f('eur_m2_venda')} className={ipt} />
        <input type="number" placeholder="Tempo venda (dias)" value={form.tempo_medio_venda_dias} onChange={f('tempo_medio_venda_dias')} className={ipt} />
        <input type="number" step="any" placeholder="Absorção (%)" value={form.taxa_absorcao_pct} onChange={f('taxa_absorcao_pct')} className={ipt} />
      </div>
      <input type="date" value={form.data_referencia || ''} onChange={f('data_referencia')} className={ipt} />
      <textarea placeholder="Notas" value={form.notas} onChange={f('notas')} className={ipt} rows="2" />
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="flex items-center gap-1 px-3 py-2 text-sm rounded-lg text-neutral-600 hover:bg-neutral-100 dark:hover:bg-neutral-800">
          <X className="w-4 h-4" /> Cancelar
        </button>
        <button type="submit" disabled={saving} className="flex items-center gap-1 px-3 py-2 text-sm rounded-lg bg-neutral-900 text-white hover:opacity-90">
          <Save className="w-4 h-4" /> {saving ? 'A guardar…' : 'Guardar'}
        </button>
      </div>
    </form>
  )
}

// ─────────────────────────────────────────────────────────────
// Hot Zones
// ─────────────────────────────────────────────────────────────
function HotZonesPanel({ regiao }) {
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    apiFetch('/api/crm/regiao/hot-zones').then(r => r.json()).then(d => { setData(d.data || []); setLoading(false) })
  }, [regiao])

  const maxTotal = useMemo(() => Math.max(...data.map(d => Number(d.total)), 1), [data])

  if (loading) return <p className="text-sm text-neutral-500">A carregar…</p>

  return (
    <div className="space-y-4">
      <p className="text-sm text-neutral-500">
        Distribuição de imóveis por concelho — onde estão as oportunidades, onde o pipeline está activo, qual o ticket médio.
      </p>
      <div className="space-y-2">
        {data.length === 0 && <p className="text-sm text-neutral-400 py-4">Sem dados na região.</p>}
        {data.map(z => {
          const pct = (Number(z.total) / maxTotal) * 100
          return (
            <div key={z.concelho} className="bg-white dark:bg-neutral-900 rounded-xl border border-neutral-200 dark:border-neutral-800 p-4">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <p className="font-medium text-neutral-900 dark:text-white">{z.concelho}</p>
                  <p className="text-xs text-neutral-500">
                    {z.total} imóveis · {z.oportunidades} oportunidades activas
                  </p>
                </div>
                <div className="text-right text-xs text-neutral-500">
                  <p>ROI médio: <strong className="text-neutral-900 dark:text-white">{z.roi_medio ? PCT(z.roi_medio) : '—'}</strong></p>
                  <p>Ticket médio: <strong className="text-neutral-900 dark:text-white">{z.ticket_medio ? EUR(z.ticket_medio) : '—'}</strong></p>
                </div>
              </div>
              <div className="h-2 bg-neutral-100 dark:bg-neutral-800 rounded-full overflow-hidden">
                <div className="h-full transition-all" style={{ width: `${pct}%`, backgroundColor: REGIAO_COR[regiao] }} />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// Compliance Regional
// ─────────────────────────────────────────────────────────────
function CompliancePanel({ regiao }) {
  const [data, setData] = useState([])
  const [editing, setEditing] = useState(null)

  function reload() {
    apiFetch('/api/crm/regiao/compliance').then(r => r.json()).then(d => setData(d.data || []))
  }
  useEffect(() => { reload() }, [regiao])

  async function save(form) {
    await apiFetch(`/api/crm/regiao/compliance/${encodeURIComponent(form.concelho)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    setEditing(null)
    reload()
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-neutral-500">
        Regras municipais por concelho: IMT base, IMI, AIMI, zonas ARU, notas legais e contactos úteis. Usado nas análises de rentabilidade.
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {data.length === 0 && <p className="text-sm text-neutral-400">Sem entradas para esta região.</p>}
        {data.map(c => (
          <div key={c.concelho} className="bg-white dark:bg-neutral-900 rounded-xl border border-neutral-200 dark:border-neutral-800 p-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="font-medium text-neutral-900 dark:text-white">{c.concelho}</p>
                <p className="text-xs text-neutral-500">{REGIAO_LABEL[c.regiao]}</p>
              </div>
              {c.zona_aru && <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">ARU</span>}
            </div>
            <div className="grid grid-cols-3 gap-2 mt-3 text-center">
              <div><p className="text-xs text-neutral-500">IMT</p><p className="text-sm font-medium">{c.imt_perc_base ? PCT(c.imt_perc_base) : '—'}</p></div>
              <div><p className="text-xs text-neutral-500">IMI</p><p className="text-sm font-medium">{c.imi_perc ? PCT(c.imi_perc) : '—'}</p></div>
              <div><p className="text-xs text-neutral-500">AIMI</p><p className="text-sm font-medium">{c.aimi_perc ? PCT(c.aimi_perc) : '—'}</p></div>
            </div>
            {c.notas_legais && <p className="text-xs text-neutral-500 mt-3">{c.notas_legais}</p>}
            <button onClick={() => setEditing(c)} className="mt-3 text-xs text-blue-600 hover:underline">Editar</button>
          </div>
        ))}
      </div>
      {editing && <ComplianceForm initial={editing} onCancel={() => setEditing(null)} onSaved={save} />}
    </div>
  )
}

function ComplianceForm({ initial, onCancel, onSaved }) {
  const [form, setForm] = useState({ ...initial })
  function f(k) { return e => setForm({ ...form, [k]: e.target.value }) }
  const ipt = 'px-3 py-2 rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-sm w-full'

  return (
    <div className="fixed inset-0 z-40 bg-black/50 flex items-center justify-center p-4" onClick={onCancel}>
      <form
        onClick={e => e.stopPropagation()}
        onSubmit={e => { e.preventDefault(); onSaved({ ...form, imt_perc_base: parseFloat(form.imt_perc_base) || null, imi_perc: parseFloat(form.imi_perc) || null, aimi_perc: parseFloat(form.aimi_perc) || null }) }}
        className="bg-white dark:bg-neutral-900 rounded-xl p-5 w-full max-w-lg space-y-3"
      >
        <h3 className="text-lg font-semibold">{form.concelho} · Compliance</h3>
        <div className="grid grid-cols-3 gap-2">
          <input type="number" step="any" placeholder="IMT %" value={form.imt_perc_base || ''} onChange={f('imt_perc_base')} className={ipt} />
          <input type="number" step="any" placeholder="IMI %" value={form.imi_perc || ''} onChange={f('imi_perc')} className={ipt} />
          <input type="number" step="any" placeholder="AIMI %" value={form.aimi_perc || ''} onChange={f('aimi_perc')} className={ipt} />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={!!form.zona_aru} onChange={e => setForm({ ...form, zona_aru: e.target.checked })} /> Zona ARU
        </label>
        <textarea placeholder="Notas legais" value={form.notas_legais || ''} onChange={f('notas_legais')} className={ipt} rows="3" />
        <textarea placeholder="Contactos úteis (cartório, finanças, câmara)" value={form.contactos_uteis || ''} onChange={f('contactos_uteis')} className={ipt} rows="2" />
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="px-3 py-2 text-sm rounded-lg text-neutral-600 hover:bg-neutral-100 dark:hover:bg-neutral-800">Cancelar</button>
          <button type="submit" className="px-3 py-2 text-sm rounded-lg bg-neutral-900 text-white">Guardar</button>
        </div>
      </form>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// Benchmarking de Consultores
// ─────────────────────────────────────────────────────────────
function BenchmarkingPanel({ regiao }) {
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    apiFetch('/api/crm/regiao/benchmarking/consultores').then(r => r.json()).then(d => { setData(d.data || []); setLoading(false) })
  }, [regiao])

  if (loading) return <p className="text-sm text-neutral-500">A carregar…</p>

  return (
    <div className="space-y-4">
      <p className="text-sm text-neutral-500">
        Leaderboard de consultores nesta região. Ordenado por score de prioridade e lucro gerado.
      </p>
      <div className="overflow-x-auto bg-white dark:bg-neutral-900 rounded-xl border border-neutral-200 dark:border-neutral-800">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 dark:bg-neutral-800/50 text-xs text-neutral-500">
            <tr>
              <th className="text-left px-4 py-2">#</th>
              <th className="text-left px-4 py-2">Consultor</th>
              <th className="text-left px-4 py-2">Estatuto</th>
              <th className="text-left px-4 py-2">Classe</th>
              <th className="text-right px-4 py-2">Score</th>
              <th className="text-right px-4 py-2">Qualidade</th>
              <th className="text-right px-4 py-2">Resp. (h)</th>
              <th className="text-right px-4 py-2">Imóveis</th>
              <th className="text-right px-4 py-2">Lucro</th>
            </tr>
          </thead>
          <tbody>
            {data.length === 0 && <tr><td colSpan="9" className="text-center py-8 text-neutral-400">Sem consultores nesta região.</td></tr>}
            {data.map((c, i) => (
              <tr key={c.id} className="border-t border-neutral-100 dark:border-neutral-800">
                <td className="px-4 py-2">{i + 1}</td>
                <td className="px-4 py-2 font-medium">{c.nome}</td>
                <td className="px-4 py-2 text-neutral-500">{c.estatuto}</td>
                <td className="px-4 py-2">{c.classificacao || '—'}</td>
                <td className="px-4 py-2 text-right">{c.score_prioridade != null ? Number(c.score_prioridade).toFixed(1) : '—'}</td>
                <td className="px-4 py-2 text-right">{c.taxa_qualidade != null ? PCT(c.taxa_qualidade) : '—'}</td>
                <td className="px-4 py-2 text-right">{c.tempo_medio_resposta != null ? `${Number(c.tempo_medio_resposta).toFixed(1)}h` : '—'}</td>
                <td className="px-4 py-2 text-right">{c.imoveis_no_pipeline}</td>
                <td className="px-4 py-2 text-right">{c.lucro_gerado ? EUR(c.lucro_gerado) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
