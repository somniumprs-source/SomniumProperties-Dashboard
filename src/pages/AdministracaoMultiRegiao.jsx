import { useEffect, useState, useMemo, useId } from 'react'
import { SummaryStat } from '../components/ui/SummaryStat.jsx'
import { Modal } from '../components/ui/Modal.jsx'
import { Button } from '../components/ui/Button.jsx'
import { Scale, Trophy, Plus, Save, X, Globe2, Gauge, LineChart, Flame } from 'lucide-react'
import { apiFetch } from '../lib/api.js'
import { useRegiaoGate } from '../contexts/RegiaoContext.jsx'
import { RegiaoModal } from '../components/RegiaoModal.jsx'
import { RegiaoBadge } from '../components/RegiaoBadge.jsx'
import { REGIAO_LABEL, REGIAO_COR, concelhosDe, EUR, PCT } from '../constants.js'
import { confirmar } from '../components/ui/ConfirmDialog.jsx'
import { AnimatePresence } from 'framer-motion'

const TABS = [
  { key: 'kpis', label: 'KPIs', Icon: Gauge },
  { key: 'mercado', label: 'Mercado de Referência', Icon: LineChart },
  { key: 'hotzones', label: 'Hot Zones', Icon: Flame },
  { key: 'compliance', label: 'Compliance', Icon: Scale },
  { key: 'benchmarking', label: 'Benchmarking', Icon: Trophy },
]

export function AdministracaoMultiRegiao() {
  const gate = useRegiaoGate('administracao-regiao')
  const regiaoAtiva = gate.regiao
  const [tab, setTab] = useState('kpis')

  if (!regiaoAtiva) {
    return (
      <>
        <RegiaoModal gate={gate} contexto="Esta área de Regiões" />
        <div className="text-center py-12 text-sm text-ink-muted">
          Escolha uma região para ver os dados.
        </div>
      </>
    )
  }


  const concelhosCount = concelhosDe(regiaoAtiva).length
  return (
    <div className="space-y-6">
      <RegiaoModal gate={gate} contexto="Esta área de Regiões" />

      {/* Hero banner — identidade Somnium */}
      <div className="rounded-xl border border-line bg-surface-raised p-5 sm:p-6 shadow-xs">
        <div className="relative flex items-center justify-between mb-5">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-surface-muted flex items-center justify-center">
              <Globe2 className="w-4 h-4 text-ink-muted" />
            </div>
            <div>
              <h2 className="text-overline uppercase text-ink-muted">Regiões</h2>
              <p className="text-ui font-semibold text-ink">Coimbra · AMP · Configurações regionais</p>
            </div>
          </div>
          <RegiaoBadge regiao={regiaoAtiva} onTrocar={gate.abrirModal} />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <SummaryStat label="Região ativa" value={REGIAO_LABEL[regiaoAtiva]} sub="filtro principal" />
          <SummaryStat label="Concelhos" value={concelhosCount} sub="cobertos" />
        </div>
      </div>

      <div className="flex flex-wrap gap-2 border-b border-line  pb-2">
        {TABS.map(t => {
          const I = t.Icon
          const active = tab === t.key
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg transition-colors
                ${active
                  ? 'bg-ink text-surface  '
                  : 'text-ink-muted hover:text-ink '}`}
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

// helper local para todas as chamadas multi-região passarem o filtro
function fetchR(url, regiao, options = {}) {
  return apiFetch(url, { ...options, regiao })
}

// ─────────────────────────────────────────────────────────────
// KPIs por região
// ─────────────────────────────────────────────────────────────
function KpisPanel({ regiao }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    fetchR('/api/crm/regiao/kpis', regiao).then(r => r.json()).then(d => { setData(d); setLoading(false) })
  }, [regiao])

  if (loading) return <div className="text-sm text-ink-muted">A carregar…</div>
  if (!data || data.error) return <div className="text-sm text-danger">{data?.error || 'Sem dados'}</div>

  const cards = [
    { label: 'Imóveis no pipeline', v: data.imoveis.em_pipeline, sub: `${data.imoveis.total} totais` },
    { label: 'Investidores compatíveis', v: data.investidores.total, sub: 'pool unificado' },
    { label: 'Consultores ativos', v: data.consultores.ativos, sub: `${data.consultores.total} totais` },
    { label: 'Negócios vendidos', v: data.negocios.vendidos, sub: `${data.negocios.total} no pipeline` },
    { label: 'Faturação real', v: EUR(data.negocios.receita_real), sub: 'fecho concretizado' },
    { label: 'Faturação estimada', v: EUR(data.negocios.receita_estimada), sub: 'pipeline total' },
    { label: 'Despesa anual', v: EUR(data.despesas.anual), sub: `${data.despesas.total} despesas` },
    { label: 'Margem estimada', v: EUR(data.margem_estimada), sub: 'receita - despesa anual' },
    { label: 'ROI médio', v: data.imoveis.roi_medio != null ? PCT(data.imoveis.roi_medio) : '—', sub: 'anualizado' },
  ]

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {cards.map((c, i) => (
        <div key={i} className="p-4 bg-surface-raised  rounded-xl border border-line ">
          <p className="text-xs text-ink-muted">{c.label}</p>
          <p className="text-2xl font-semibold text-ink  mt-1">{c.v}</p>
          <p className="text-xs text-ink-muted mt-1">{c.sub}</p>
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
    fetchR('/api/crm/regiao/mercado', regiao).then(r => r.json()).then(d => { setData(d.data || []); setLoading(false) })
  }

  useEffect(() => { reload() }, [regiao])

  async function remover(id) {
    if (!(await confirmar('Eliminar entrada de mercado?'))) return
    await fetchR(`/api/crm/regiao/mercado/${id}`, regiao, { method: 'DELETE' })
    reload()
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-ink-muted">
          Preços médios por concelho e tipologia. Base para análises de wholesaling e estudos de comparáveis.
        </p>
        <button
          onClick={() => { setEditing(null); setShowForm(true) }}
          className="flex items-center gap-2 px-3 py-2 text-sm rounded-lg bg-ink text-surface hover:opacity-90"
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

      {loading ? <p className="text-sm text-ink-muted">A carregar…</p> : (
        <div className="overflow-x-auto bg-surface-raised  rounded-xl border border-line ">
          <table className="w-full text-sm">
            <thead className="bg-surface  text-xs text-ink-muted">
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
                <tr><td colSpan="9" className="text-center text-sm text-ink-muted py-8">Sem entradas. Adiciona a primeira referência para esta região.</td></tr>
              )}
              {data.map(r => (
                <tr key={r.id} className="border-t border-line ">
                  <td className="px-4 py-2 font-medium">{r.concelho}</td>
                  <td className="px-4 py-2 text-ink-muted">{r.freguesia || '—'}</td>
                  <td className="px-4 py-2">{r.tipologia || '—'}</td>
                  <td className="px-4 py-2 text-right">{r.eur_m2_compra ? EUR(r.eur_m2_compra) : '—'}</td>
                  <td className="px-4 py-2 text-right">{r.eur_m2_venda ? EUR(r.eur_m2_venda) : '—'}</td>
                  <td className="px-4 py-2 text-right">{r.tempo_medio_venda_dias ? `${r.tempo_medio_venda_dias}d` : '—'}</td>
                  <td className="px-4 py-2 text-right">{r.taxa_absorcao_pct ? PCT(r.taxa_absorcao_pct) : '—'}</td>
                  <td className="px-4 py-2 text-ink-muted">{r.fonte || '—'}</td>
                  <td className="px-4 py-2 text-right">
                    <button onClick={() => { setEditing(r); setShowForm(true) }} className="text-xs text-ink hover:underline mr-2">Editar</button>
                    <button onClick={() => remover(r.id)} className="text-xs text-danger hover:underline">Eliminar</button>
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
    await apiFetch(url, { regiao, method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    setSaving(false)
    onSaved()
  }

  function f(k) { return e => setForm({ ...form, [k]: e.target.value }) }
  const ipt = 'px-3 py-2 rounded-lg border border-line  bg-surface-raised  text-sm w-full'

  return (
    <form onSubmit={submit} className="bg-surface  p-4 rounded-xl border border-line  space-y-3">
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
        <button type="button" onClick={onCancel} className="flex items-center gap-1 px-3 py-2 text-sm rounded-lg text-ink-muted hover:bg-surface-muted ">
          <X className="w-4 h-4" /> Cancelar
        </button>
        <button type="submit" disabled={saving} className="flex items-center gap-1 px-3 py-2 text-sm rounded-lg bg-ink text-surface hover:opacity-90">
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
    fetchR('/api/crm/regiao/hot-zones', regiao).then(r => r.json()).then(d => { setData(d.data || []); setLoading(false) })
  }, [regiao])

  const maxTotal = useMemo(() => Math.max(...data.map(d => Number(d.total)), 1), [data])

  if (loading) return <p className="text-sm text-ink-muted">A carregar…</p>

  return (
    <div className="space-y-4">
      <p className="text-sm text-ink-muted">
        Distribuição de imóveis por concelho — onde estão as oportunidades, onde o pipeline está ativo, qual o ticket médio.
      </p>
      <div className="space-y-2">
        {data.length === 0 && <p className="text-sm text-ink-muted py-4">Sem dados na região.</p>}
        {data.map(z => {
          const pct = (Number(z.total) / maxTotal) * 100
          return (
            <div key={z.concelho} className="bg-surface-raised  rounded-xl border border-line  p-4">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <p className="font-medium text-ink ">{z.concelho}</p>
                  <p className="text-xs text-ink-muted">
                    {z.total} imóveis · {z.oportunidades} oportunidades ativas
                  </p>
                </div>
                <div className="text-right text-xs text-ink-muted">
                  <p>ROI médio: <strong className="text-ink ">{z.roi_medio ? PCT(z.roi_medio) : '—'}</strong></p>
                  <p>Ticket médio: <strong className="text-ink ">{z.ticket_medio ? EUR(z.ticket_medio) : '—'}</strong></p>
                </div>
              </div>
              <div className="h-2 bg-surface-muted  rounded-full overflow-hidden">
                <div className="h-full transition-[background-color,border-color,color,box-shadow,opacity,transform]" style={{ width: `${pct}%`, backgroundColor: REGIAO_COR[regiao] }} />
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
    fetchR('/api/crm/regiao/compliance', regiao).then(r => r.json()).then(d => setData(d.data || []))
  }
  useEffect(() => { reload() }, [regiao])

  async function save(form) {
    await apiFetch(`/api/crm/regiao/compliance/${encodeURIComponent(form.concelho)}`, {
      regiao,
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    setEditing(null)
    reload()
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-ink-muted">
        Regras municipais por concelho: IMT base, IMI, AIMI, zonas ARU, notas legais e contactos úteis. Usado nas análises de rentabilidade.
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {data.length === 0 && <p className="text-sm text-ink-muted">Sem entradas para esta região.</p>}
        {data.map(c => (
          <div key={c.concelho} className="bg-surface-raised  rounded-xl border border-line  p-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="font-medium text-ink ">{c.concelho}</p>
                <p className="text-xs text-ink-muted">{REGIAO_LABEL[c.regiao]}</p>
              </div>
              {c.zona_aru && <span className="text-xs px-2 py-0.5 rounded-full bg-warning/15 text-warning">ARU</span>}
            </div>
            <div className="grid grid-cols-3 gap-2 mt-3 text-center">
              <div><p className="text-xs text-ink-muted">IMT</p><p className="text-sm font-medium">{c.imt_perc_base ? PCT(c.imt_perc_base) : '—'}</p></div>
              <div><p className="text-xs text-ink-muted">IMI</p><p className="text-sm font-medium">{c.imi_perc ? PCT(c.imi_perc) : '—'}</p></div>
              <div><p className="text-xs text-ink-muted">AIMI</p><p className="text-sm font-medium">{c.aimi_perc ? PCT(c.aimi_perc) : '—'}</p></div>
            </div>
            {c.notas_legais && <p className="text-xs text-ink-muted mt-3">{c.notas_legais}</p>}
            <button onClick={() => setEditing(c)} className="mt-3 text-xs text-ink hover:underline">Editar</button>
          </div>
        ))}
      </div>
      <AnimatePresence>{editing && <ComplianceForm initial={editing} onCancel={() => setEditing(null)} onSaved={save} />}</AnimatePresence>
    </div>
  )
}

function ComplianceForm({ open = true, initial, onCancel, onSaved }) {
  const [form, setForm] = useState({ ...initial })
  const formId = useId()
  function f(k) { return e => setForm({ ...form, [k]: e.target.value }) }
  const ipt = 'px-3 py-2 rounded-lg border border-line bg-surface-raised text-ink text-sm w-full placeholder:text-ink-muted/70 focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/30 transition-colors duration-fast'

  return (
    <Modal open={open} onClose={onCancel} size="md" title={`${form.concelho} · Compliance`}
      footer={
        <Modal.Footer>
          <Button type="button" variant="secondary" onClick={onCancel}>Cancelar</Button>
          <Button type="submit" form={formId} variant="primary">Guardar</Button>
        </Modal.Footer>
      }>
      <form
        id={formId}
        onSubmit={e => { e.preventDefault(); onSaved({ ...form, imt_perc_base: parseFloat(form.imt_perc_base) || null, imi_perc: parseFloat(form.imi_perc) || null, aimi_perc: parseFloat(form.aimi_perc) || null }) }}
        className="space-y-3"
      >
        <div className="grid grid-cols-3 gap-2">
          <input type="number" step="any" placeholder="IMT %" value={form.imt_perc_base || ''} onChange={f('imt_perc_base')} className={ipt} />
          <input type="number" step="any" placeholder="IMI %" value={form.imi_perc || ''} onChange={f('imi_perc')} className={ipt} />
          <input type="number" step="any" placeholder="AIMI %" value={form.aimi_perc || ''} onChange={f('aimi_perc')} className={ipt} />
        </div>
        <label className="flex items-center gap-2 text-sm text-ink">
          <input type="checkbox" className="w-4 h-4 accent-accent" checked={!!form.zona_aru} onChange={e => setForm({ ...form, zona_aru: e.target.checked })} /> Zona ARU
        </label>
        <textarea placeholder="Notas legais" value={form.notas_legais || ''} onChange={f('notas_legais')} className={ipt} rows="3" />
        <textarea placeholder="Contactos úteis (cartório, finanças, câmara)" value={form.contactos_uteis || ''} onChange={f('contactos_uteis')} className={ipt} rows="2" />
      </form>
    </Modal>
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
    fetchR('/api/crm/regiao/benchmarking/consultores', regiao).then(r => r.json()).then(d => { setData(d.data || []); setLoading(false) })
  }, [regiao])

  if (loading) return <p className="text-sm text-ink-muted">A carregar…</p>

  return (
    <div className="space-y-4">
      <p className="text-sm text-ink-muted">
        Leaderboard de consultores nesta região. Ordenado por score de prioridade e lucro gerado.
      </p>
      <div className="overflow-x-auto bg-surface-raised  rounded-xl border border-line ">
        <table className="w-full text-sm">
          <thead className="bg-surface  text-xs text-ink-muted">
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
            {data.length === 0 && <tr><td colSpan="9" className="text-center py-8 text-ink-muted">Sem consultores nesta região.</td></tr>}
            {data.map((c, i) => (
              <tr key={c.id} className="border-t border-line ">
                <td className="px-4 py-2">{i + 1}</td>
                <td className="px-4 py-2 font-medium">{c.nome}</td>
                <td className="px-4 py-2 text-ink-muted">{c.estatuto}</td>
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


