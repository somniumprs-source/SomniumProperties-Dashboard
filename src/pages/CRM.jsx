import { useState, useEffect, useCallback, useRef } from 'react'
import { Header } from '../components/layout/Header.jsx'
import { KanbanBoard } from '../components/crm/KanbanBoard.jsx'
import { DetailPanel } from '../components/crm/DetailPanel.jsx'
import { Filters } from '../components/crm/Filters.jsx'
import { TabKPIs } from '../components/crm/TabKPIs.jsx'
import { useToast } from '../components/ui/Toast.jsx'
import { MultiSelect } from '../components/ui/MultiSelect.jsx'
import { EUR, cleanLabel, fmtDate, fmtDateRelative, IMOVEL_ESTADO_COLOR, INV_STATUS_COLOR, CONS_ESTATUTO_COLOR, NEG_CAT_COLOR, NEG_FASE_COLOR, DESP_TIMING_COLOR, CLASS_COLOR } from '../constants.js'

const TABS = ['Imóveis', 'Investidores', 'Consultores', 'Negócios', 'Despesas', 'Tarefas']

function Badge({ text, colorMap }) {
  const clean = cleanLabel(text)
  const cls = colorMap?.[clean] ?? colorMap?.[text] ?? 'bg-gray-100 text-gray-600'
  return <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${cls}`}>{clean || '—'}</span>
}

function ClassBadge({ cls }) {
  if (!cls) return <span className="text-xs text-gray-300">—</span>
  return <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold text-white ${CLASS_COLOR[cls] ?? 'bg-gray-400'}`}>{cls}</span>
}

export function CRM() {
  const [tab, setTab] = useState('Imóveis')
  const [data, setData] = useState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState(null) // null = list view, object = edit/create
  const [detail, setDetail] = useState(null) // null = no detail, id = show detail panel
  const [stats, setStats] = useState(null)
  const [view, setView] = useState('table') // 'table' | 'kanban'
  const [filters, setFilters] = useState({})
  const [alertCount, setAlertCount] = useState(0)

  const toast = useToast()
  const searchTimer = useRef(null)
  const endpoint = { 'Imóveis': 'imoveis', 'Investidores': 'investidores', 'Consultores': 'consultores', 'Negócios': 'negocios', 'Despesas': 'despesas', 'Tarefas': 'tarefas' }[tab]

  const load = useCallback(async () => {
    setLoading(true)
    try {
      if (search) {
        const r = await fetch(`/api/crm/${endpoint}?search=${encodeURIComponent(search)}`)
        const d = await r.json()
        setData(d.data ?? []); setTotal(d.data?.length ?? 0)
      } else {
        const params = new URLSearchParams({ limit: '200' })
        for (const [k, v] of Object.entries(filters)) { if (v) params.set(k, v) }
        const r = await fetch(`/api/crm/${endpoint}?${params}`)
        const d = await r.json()
        setData(d.data ?? []); setTotal(d.total ?? 0)
      }
    } catch {}
    setLoading(false)
  }, [endpoint, search, filters])

  useEffect(() => { load() }, [load])
  useEffect(() => { fetch('/api/crm/stats').then(r => r.json()).then(setStats).catch(() => {}) }, [])
  useEffect(() => { fetch('/api/alertas').then(r => r.json()).then(d => setAlertCount(d.resumo?.total ?? 0)).catch(() => {}) }, [])

  // Kanban config por tab
  const KANBAN_CONFIG = {
    'Imóveis': {
      columns: ['Adicionado','Pendentes','Em Análise','Visita Marcada','Follow UP','Estudo de VVR','Enviar proposta ao investidor','Wholesaling','Negócio em Curso','Nao interessa'],
      groupField: 'estado',
      renderCard: (item) => (
        <div>
          <p className="text-sm font-semibold text-gray-800 truncate">{item.nome}</p>
          <p className="text-xs text-gray-500 mt-1">{item.zona ?? '—'} · {item.tipologia ?? '—'}</p>
          {item.ask_price > 0 && <p className="text-xs font-mono text-indigo-600 mt-1">{EUR(item.ask_price)}</p>}
          {item.roi > 0 && <p className="text-xs text-green-600">ROI: {item.roi}%</p>}
          {item.nome_consultor && <p className="text-xs text-gray-400 mt-1">{item.nome_consultor}</p>}
        </div>
      ),
    },
    'Investidores': {
      columns: ['Potencial Investidor','Marcar call','Call marcada','Follow Up','Investidor classificado','Investidor em parceria'],
      groupField: 'status',
      renderCard: (item) => (
        <div>
          <div className="flex items-center gap-2">
            <ClassBadge cls={item.classificacao} />
            <p className="text-sm font-semibold text-gray-800 truncate">{item.nome}</p>
          </div>
          <p className="text-xs text-gray-500 mt-1">{item.origem ?? '—'}</p>
          {item.capital_max > 0 && <p className="text-xs font-mono text-indigo-600 mt-1">até {EUR(item.capital_max)}</p>}
          {item.telemovel && <p className="text-xs text-gray-400 mt-1">{item.telemovel}</p>}
        </div>
      ),
    },
    'Consultores': {
      columns: ['Cold Call','Follow up','Aberto Parcerias','Acesso imoveis Off market','Consultores em Parceria'],
      groupField: 'estatuto',
      renderCard: (item) => {
        const imobs = (() => { try { return JSON.parse(item.imobiliaria || '[]').join(', ') } catch { return '' } })()
        return (
          <div>
            <div className="flex items-center gap-2">
              <ClassBadge cls={item.classificacao} />
              <p className="text-sm font-semibold text-gray-800 truncate">{item.nome}</p>
            </div>
            {imobs && <p className="text-xs text-gray-500 mt-1">{imobs}</p>}
            {item.contacto && <p className="text-xs text-gray-400 mt-1">{item.contacto}</p>}
            {item.imoveis_enviados > 0 && <p className="text-xs text-indigo-600 mt-1">{item.imoveis_enviados} leads</p>}
          </div>
        )
      },
    },
  }

  const kanbanConfig = KANBAN_CONFIG[tab]
  const hasKanban = !!kanbanConfig

  async function handleMove(id, newColumn) {
    if (!kanbanConfig) return
    const field = kanbanConfig.groupField
    const item = data.find(i => i.id === id)
    await fetch(`/api/crm/${endpoint}/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [field]: newColumn }),
    })
    // Auto-task on phase change
    fetch('/api/crm/auto-task', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entity: endpoint, entityId: id, entityName: item?.nome ?? item?.movimento ?? '', newPhase: newColumn }),
    }).catch(() => {})
    load()
  }

  async function handleSave(item) {
    // Validação básica
    const nameField = tab === 'Negócios' ? 'movimento' : tab === 'Despesas' ? 'movimento' : 'nome'
    if (!item[nameField]?.trim()) {
      toast('Preenche o nome/título', 'error')
      return
    }
    try {
      const isNew = !item.id
      const url = isNew ? `/api/crm/${endpoint}` : `/api/crm/${endpoint}/${item.id}`
      const method = isNew ? 'POST' : 'PUT'
      const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(item) })
      if (!r.ok) throw new Error('Erro ao guardar')
      toast(isNew ? 'Registo criado' : 'Registo atualizado', 'success')
      setEditing(null)
      load()
    } catch (e) {
      toast(e.message, 'error')
    }
  }

  async function handleDelete(id) {
    if (!confirm('Tens a certeza que queres apagar este registo?')) return
    try {
      await fetch(`/api/crm/${endpoint}/${id}`, { method: 'DELETE' })
      toast('Registo apagado', 'success')
      load()
    } catch (e) {
      toast('Erro ao apagar', 'error')
    }
  }

  function handleSearch(value) {
    setSearch(value)
    clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => load(), 300) // debounce 300ms
  }

  return (
    <>
      <Header title="CRM" subtitle="Gestão de dados — Base de dados local" onRefresh={load} loading={loading} />
      <div className="p-6 flex flex-col gap-4">

        {/* Stats banner */}
        {stats && (
          <div className="grid grid-cols-5 gap-3">
            {Object.entries(stats).map(([k, v]) => (
              <div key={k} className="bg-white rounded-xl border border-gray-200 p-3 shadow-sm text-center">
                <p className="text-lg font-bold text-gray-900">{v.total}</p>
                <p className="text-xs text-gray-400 capitalize">{k}</p>
              </div>
            ))}
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 border-b border-gray-200 bg-white sticky top-0 z-10 rounded-t-xl px-2 pt-2">
          {TABS.map(t => (
            <button key={t} onClick={() => { setTab(t); setSearch(''); setEditing(null) }}
              className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${
                tab === t ? 'bg-indigo-50 text-indigo-700 border-b-2 border-indigo-600' : 'text-gray-500 hover:text-gray-700'
              }`}>{t}</button>
          ))}
        </div>

        {/* KPIs integrados */}
        <TabKPIs tab={tab} />

        {/* Filtros dinâmicos */}
        <Filters tab={tab} filters={filters} onChange={f => { setFilters(f); setSearch('') }} />

        {/* Detail Panel */}
        {detail && ['Imóveis', 'Investidores', 'Consultores'].includes(tab) && (
          <DetailPanel type={tab} id={detail} onClose={() => setDetail(null)} />
        )}

        {/* Search + Actions */}
        <div className="flex gap-3 items-center">
          <input
            type="text" placeholder={`Pesquisar ${tab.toLowerCase()}...`}
            value={search} onChange={e => handleSearch(e.target.value)}
            className="flex-1 px-4 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
          />
          {hasKanban && (
            <div className="flex bg-gray-100 rounded-lg p-0.5">
              <button onClick={() => setView('table')}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${view === 'table' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500'}`}>
                Tabela
              </button>
              <button onClick={() => setView('kanban')}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${view === 'kanban' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500'}`}>
                Kanban
              </button>
            </div>
          )}
          <button onClick={() => setEditing({})} className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-xl hover:bg-indigo-700 transition-colors">
            + Novo
          </button>
          <a href={`/api/crm/backup?download=true`} className="px-3 py-2 bg-gray-100 text-gray-600 text-xs font-medium rounded-xl hover:bg-gray-200 transition-colors">
            Backup
          </a>
        </div>

        {/* Edit/Create form */}
        {editing !== null && (
          <FormPanel tab={tab} item={editing} onSave={handleSave} onCancel={() => setEditing(null)} />
        )}

        {/* Loading */}
        {loading && editing === null && (
          <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
            <div className="animate-spin w-8 h-8 border-2 border-indigo-600 border-t-transparent rounded-full mx-auto" />
            <p className="text-sm text-gray-400 mt-3">A carregar...</p>
          </div>
        )}

        {/* Kanban View */}
        {!loading && editing === null && view === 'kanban' && kanbanConfig && (
          <KanbanBoard
            columns={kanbanConfig.columns}
            items={data}
            groupField={kanbanConfig.groupField}
            renderCard={kanbanConfig.renderCard}
            onMove={handleMove}
            onCardClick={(id) => {
              const item = data.find(i => i.id === id)
              if (item) setEditing(item)
            }}
          />
        )}

        {/* Table View */}
        {!loading && editing === null && (view === 'table' || !hasKanban) && (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              {tab === 'Imóveis' && <ImoveisTable data={data} onEdit={setEditing} onDelete={handleDelete} onView={setDetail} />}
              {tab === 'Investidores' && <InvestidoresTable data={data} onEdit={setEditing} onDelete={handleDelete} onView={setDetail} />}
              {tab === 'Consultores' && <ConsultoresTable data={data} onEdit={setEditing} onDelete={handleDelete} onView={setDetail} />}
              {tab === 'Negócios' && <NegociosTable data={data} onEdit={setEditing} onDelete={handleDelete} />}
              {tab === 'Despesas' && <DespesasTable data={data} onEdit={setEditing} onDelete={handleDelete} />}
              {tab === 'Tarefas' && <TarefasTable data={data} onEdit={setEditing} onDelete={handleDelete} />}
            </div>
            <div className="px-4 py-2 bg-gray-50 text-xs text-gray-400 border-t">
              {total} registos {search && `(pesquisa: "${search}")`}
            </div>
          </div>
        )}
      </div>
    </>
  )
}

// ── Tables ────────────────────────────────────────────────────

function ActionButtons({ item, onEdit, onDelete, onView }) {
  return (
    <div className="flex gap-1">
      {onView && <button onClick={() => onView(item.id)} className="px-2 py-1 text-xs bg-gray-50 text-gray-600 rounded hover:bg-gray-100">Ver</button>}
      <button onClick={() => onEdit(item)} className="px-2 py-1 text-xs bg-indigo-50 text-indigo-600 rounded hover:bg-indigo-100">Abrir</button>
      <button onClick={() => onDelete(item.id)} className="px-2 py-1 text-xs bg-red-50 text-red-600 rounded hover:bg-red-100">Apagar</button>
    </div>
  )
}

function ClickableName({ name, item, onEdit }) {
  return (
    <button onClick={() => onEdit(item)} className="text-left font-medium text-gray-800 hover:text-indigo-600 hover:underline transition-colors">
      {name}
    </button>
  )
}

function ImoveisTable({ data, onEdit, onDelete, onView }) {
  return (
    <table className="min-w-full text-xs">
      <thead><tr className="border-b border-gray-100 text-gray-400 uppercase tracking-wide">
        <th className="text-left py-2 px-3">Imóvel</th><th className="text-left py-2 px-3">Estado</th>
        <th className="text-left py-2 px-3">Zona</th><th className="text-right py-2 px-3">Ask Price</th>
        <th className="text-right py-2 px-3">ROI</th><th className="text-left py-2 px-3">Origem</th>
        <th className="text-left py-2 px-3">Data</th><th className="py-2 px-3"></th>
      </tr></thead>
      <tbody>
        {data.map(r => (
          <tr key={r.id} className="border-b border-gray-50 hover:bg-gray-50">
            <td className="py-2 px-3"><ClickableName name={r.nome} item={r} onEdit={onEdit} /></td>
            <td className="py-2 px-3"><Badge text={r.estado} colorMap={IMOVEL_ESTADO_COLOR} /></td>
            <td className="py-2 px-3 text-gray-500">{r.zona ?? '—'}</td>
            <td className="py-2 px-3 text-right font-mono">{r.ask_price > 0 ? EUR(r.ask_price) : '—'}</td>
            <td className="py-2 px-3 text-right font-mono">{r.roi > 0 ? `${r.roi}%` : '—'}</td>
            <td className="py-2 px-3 text-gray-500">{r.origem ?? '—'}</td>
            <td className="py-2 px-3 text-gray-400">{fmtDate(r.data_adicionado)}</td>
            <td className="py-2 px-3"><ActionButtons item={r} onEdit={onEdit} onDelete={onDelete} onView={onView} /></td>
          </tr>
        ))}
        {!data.length && <tr><td colSpan={8} className="py-8 text-center text-gray-400">Sem registos</td></tr>}
      </tbody>
    </table>
  )
}

function InvestidoresTable({ data, onEdit, onDelete, onView }) {
  return (
    <table className="min-w-full text-xs">
      <thead><tr className="border-b border-gray-100 text-gray-400 uppercase tracking-wide">
        <th className="text-left py-2 px-3">Nome</th><th className="py-2 px-3">Class.</th>
        <th className="text-left py-2 px-3">Status</th><th className="text-left py-2 px-3">Origem</th>
        <th className="text-right py-2 px-3">Capital Max</th><th className="py-2 px-3">NDA</th>
        <th className="text-left py-2 px-3">Contacto</th><th className="text-left py-2 px-3">1º Contacto</th>
        <th className="py-2 px-3"></th>
      </tr></thead>
      <tbody>
        {data.map(r => (
          <tr key={r.id} className="border-b border-gray-50 hover:bg-gray-50">
            <td className="py-2 px-3"><ClickableName name={r.nome} item={r} onEdit={onEdit} /></td>
            <td className="py-2 px-3 text-center"><ClassBadge cls={r.classificacao} /></td>
            <td className="py-2 px-3"><Badge text={r.status} colorMap={INV_STATUS_COLOR} /></td>
            <td className="py-2 px-3 text-gray-500">{r.origem ?? '—'}</td>
            <td className="py-2 px-3 text-right font-mono">{r.capital_max > 0 ? EUR(r.capital_max) : '—'}</td>
            <td className="py-2 px-3 text-center">{r.nda_assinado ? '✓' : '—'}</td>
            <td className="py-2 px-3 text-gray-500">{r.telemovel ? <a href={`tel:${r.telemovel}`} className="text-green-600 hover:underline">{r.telemovel}</a> : r.email ? <a href={`mailto:${r.email}`} className="text-blue-600 hover:underline">{r.email}</a> : '—'}</td>
            <td className="py-2 px-3 text-gray-400">{fmtDate(r.data_primeiro_contacto)}</td>
            <td className="py-2 px-3"><ActionButtons item={r} onEdit={onEdit} onDelete={onDelete} onView={onView} /></td>
          </tr>
        ))}
        {!data.length && <tr><td colSpan={9} className="py-8 text-center text-gray-400">Sem registos</td></tr>}
      </tbody>
    </table>
  )
}

function ConsultoresTable({ data, onEdit, onDelete, onView }) {
  return (
    <table className="min-w-full text-xs">
      <thead><tr className="border-b border-gray-100 text-gray-400 uppercase tracking-wide">
        <th className="text-left py-2 px-3">Nome</th><th className="py-2 px-3">Class.</th>
        <th className="text-left py-2 px-3">Estatuto</th><th className="text-left py-2 px-3">Imobiliária</th>
        <th className="text-left py-2 px-3">Contacto</th><th className="text-right py-2 px-3">Leads</th>
        <th className="py-2 px-3"></th>
      </tr></thead>
      <tbody>
        {data.map(r => {
          const imobs = (() => { try { return JSON.parse(r.imobiliaria || '[]').join(', ') } catch { return '—' } })()
          return (
            <tr key={r.id} className="border-b border-gray-50 hover:bg-gray-50">
              <td className="py-2 px-3"><ClickableName name={r.nome} item={r} onEdit={onEdit} /></td>
              <td className="py-2 px-3 text-center"><ClassBadge cls={r.classificacao} /></td>
              <td className="py-2 px-3"><Badge text={r.estatuto} colorMap={CONS_ESTATUTO_COLOR} /></td>
              <td className="py-2 px-3 text-gray-500">{imobs}</td>
              <td className="py-2 px-3 text-gray-500">{r.contacto ?? '—'}</td>
              <td className="py-2 px-3 text-right font-mono">{r.imoveis_enviados || '—'}</td>
              <td className="py-2 px-3"><ActionButtons item={r} onEdit={onEdit} onDelete={onDelete} onView={onView} /></td>
            </tr>
          )
        })}
        {!data.length && <tr><td colSpan={7} className="py-8 text-center text-gray-400">Sem registos</td></tr>}
      </tbody>
    </table>
  )
}

function NegociosTable({ data, onEdit, onDelete }) {
  return (
    <table className="min-w-full text-xs">
      <thead><tr className="border-b border-gray-100 text-gray-400 uppercase tracking-wide">
        <th className="text-left py-2 px-3">Negócio</th><th className="text-left py-2 px-3">Categoria</th>
        <th className="text-left py-2 px-3">Fase</th><th className="text-right py-2 px-3">Lucro Est.</th>
        <th className="text-right py-2 px-3">Lucro Real</th><th className="text-left py-2 px-3">Data</th>
        <th className="py-2 px-3"></th>
      </tr></thead>
      <tbody>
        {data.map(r => (
          <tr key={r.id} className="border-b border-gray-50 hover:bg-gray-50">
            <td className="py-2 px-3"><ClickableName name={r.movimento} item={r} onEdit={onEdit} /></td>
            <td className="py-2 px-3"><Badge text={r.categoria} colorMap={NEG_CAT_COLOR} /></td>
            <td className="py-2 px-3"><Badge text={r.fase} colorMap={NEG_FASE_COLOR} /></td>
            <td className="py-2 px-3 text-right font-mono text-indigo-600">{EUR(r.lucro_estimado)}</td>
            <td className="py-2 px-3 text-right font-mono text-green-600">{r.lucro_real > 0 ? EUR(r.lucro_real) : '—'}</td>
            <td className="py-2 px-3 text-gray-400">{fmtDate(r.data)}</td>
            <td className="py-2 px-3"><ActionButtons item={r} onEdit={onEdit} onDelete={onDelete} /></td>
          </tr>
        ))}
        {!data.length && <tr><td colSpan={7} className="py-8 text-center text-gray-400">Sem registos</td></tr>}
      </tbody>
    </table>
  )
}

function DespesasTable({ data, onEdit, onDelete }) {
  return (
    <table className="min-w-full text-xs">
      <thead><tr className="border-b border-gray-100 text-gray-400 uppercase tracking-wide">
        <th className="text-left py-2 px-3">Despesa</th><th className="text-left py-2 px-3">Categoria</th>
        <th className="text-left py-2 px-3">Timing</th><th className="text-right py-2 px-3">€/mês</th>
        <th className="text-right py-2 px-3">€/ano</th><th className="text-left py-2 px-3">Data</th>
        <th className="py-2 px-3"></th>
      </tr></thead>
      <tbody>
        {data.map(r => (
          <tr key={r.id} className="border-b border-gray-50 hover:bg-gray-50">
            <td className="py-2 px-3"><ClickableName name={r.movimento} item={r} onEdit={onEdit} /></td>
            <td className="py-2 px-3 text-gray-500">{r.categoria ?? '—'}</td>
            <td className="py-2 px-3"><Badge text={r.timing} colorMap={DESP_TIMING_COLOR} /></td>
            <td className="py-2 px-3 text-right font-mono text-red-500">{r.custo_mensal > 0 ? EUR(r.custo_mensal) : '—'}</td>
            <td className="py-2 px-3 text-right font-mono">{r.custo_anual > 0 ? EUR(r.custo_anual) : '—'}</td>
            <td className="py-2 px-3 text-gray-400">{fmtDate(r.data)}</td>
            <td className="py-2 px-3"><ActionButtons item={r} onEdit={onEdit} onDelete={onDelete} /></td>
          </tr>
        ))}
        {!data.length && <tr><td colSpan={7} className="py-8 text-center text-gray-400">Sem registos</td></tr>}
      </tbody>
    </table>
  )
}

const TAREFA_STATUS_COLOR = { 'A fazer': 'bg-gray-100 text-gray-600', 'Em andamento': 'bg-blue-100 text-blue-700', 'Atrasada': 'bg-red-100 text-red-700', 'Concluida': 'bg-green-100 text-green-700' }

function TarefasTable({ data, onEdit, onDelete }) {
  return (
    <table className="min-w-full text-xs">
      <thead><tr className="border-b border-gray-100 text-gray-400 uppercase tracking-wide">
        <th className="text-left py-2 px-3">Tarefa</th><th className="text-left py-2 px-3">Status</th>
        <th className="text-left py-2 px-3">Início</th><th className="text-left py-2 px-3">Fim</th>
        <th className="text-left py-2 px-3">Funcionário</th><th className="py-2 px-3"></th>
      </tr></thead>
      <tbody>
        {data.map(r => (
          <tr key={r.id} className="border-b border-gray-50 hover:bg-gray-50">
            <td className="py-2 px-3"><ClickableName name={r.tarefa} item={r} onEdit={onEdit} /></td>
            <td className="py-2 px-3"><Badge text={r.status} colorMap={TAREFA_STATUS_COLOR} /></td>
            <td className="py-2 px-3 text-gray-400">{fmtDate(r.inicio)}</td>
            <td className="py-2 px-3 text-gray-400">{fmtDate(r.fim)}</td>
            <td className="py-2 px-3 text-gray-500">{r.funcionario ?? '—'}</td>
            <td className="py-2 px-3"><ActionButtons item={r} onEdit={onEdit} onDelete={onDelete} /></td>
          </tr>
        ))}
        {!data.length && <tr><td colSpan={6} className="py-8 text-center text-gray-400">Sem tarefas</td></tr>}
      </tbody>
    </table>
  )
}

// ── Form Panel ────────────────────────────────────────────────

// Freguesias do concelho de Coimbra + zonas centrais Condeixa e Mealhada
const FREGUESIAS = [
  // Concelho de Coimbra (18 freguesias oficiais pós-2013)
  'Assafarge e Antanhol',
  'Brasfemes',
  'Ceira',
  'Cernache',
  'Eiras e São Paulo de Frades',
  'Ribeira de Frades',
  'Santa Clara e Castelo Viegas',
  'Santo António dos Olivais',
  'São João do Campo',
  'São Martinho de Árvore e Lamarosa',
  'São Martinho do Bispo',
  'São Silvestre',
  'Sé Nova, Santa Cruz, Almedina e São Bartolomeu',
  'Souselas e Botão',
  'Taveiro, Ameal e Arzila',
  'Torres do Mondego',
  'Trouxemil e Torre de Vilela',
  'Vil de Matos',
  // Condeixa (centro)
  'Condeixa-a-Nova',
  'Condeixa-a-Velha',
  // Mealhada (centro)
  'Mealhada',
  'Pampilhosa',
].sort()

const FIELD_DEFS = {
  'Imóveis': [
    { key: 'nome', label: 'Nome do Imóvel', type: 'text', required: true },
    { key: 'estado', label: 'Estado', type: 'select', options: ['Adicionado','Pendentes','Em Análise','Visita Marcada','Follow UP','Estudo de VVR','Enviar proposta ao investidor','Wholesaling','Negócio em Curso','Nao interessa','Descartado'] },
    { key: 'tipologia', label: 'Tipologia', type: 'text' },
    { key: 'ask_price', label: 'Ask Price (€)', type: 'number' },
    { key: 'valor_proposta', label: 'Valor Proposta (€)', type: 'number' },
    { key: 'custo_estimado_obra', label: 'Custo Estimado Obra (€)', type: 'number' },
    { key: 'valor_venda_remodelado', label: 'Valor Venda Remodelado (€)', type: 'number' },
    { key: 'zona', label: 'Zona Principal', type: 'text' },
    { key: 'zonas', label: 'Zonas', type: 'multiselect', options: FREGUESIAS },
    { key: 'origem', label: 'Origem', type: 'select', options: ['Pesquisa em portais/sites','Referência por consultores','Idealista','Imovirtual','Supercasa','Consultor','Referência','Outro'] },
    { key: 'modelo_negocio', label: 'Modelo de Negócio', type: 'select', options: ['Wholesaling','Fix & Flip','CAEP','Mediação'] },
    { key: 'nome_consultor', label: 'Consultor', type: 'relation_name_or_new', endpoint: '/api/crm/lookup/consultores', display: r => `${r.nome} (${r.estatuto ?? '—'})`, createEndpoint: '/api/crm/consultores' },
    { key: 'link', label: 'Link do Imóvel', type: 'url' },
    { key: 'motivo_descarte', label: 'Motivo Descarte', type: 'select', options: ['Preço elevado','Produto final não vendável','Sem interesse do investidor','Zona fraca','ROI insuficiente','Já vendido','Outro'] },
    { key: 'data_adicionado', label: 'Data Adicionado', type: 'date' },
    { key: 'data_chamada', label: 'Data Chamada', type: 'date' },
    { key: 'data_visita', label: 'Data Visita', type: 'date' },
    { key: 'data_estudo_mercado', label: 'Data Estudo Mercado', type: 'date' },
    { key: 'data_proposta', label: 'Data Proposta', type: 'date' },
    { key: 'data_proposta_aceite', label: 'Data Proposta Aceite', type: 'date' },
    { key: 'data_follow_up', label: 'Data Follow Up', type: 'date' },
    { key: 'notas', label: 'Notas', type: 'textarea' },
  ],
  'Investidores': [
    { key: 'nome', label: 'Nome', type: 'text', required: true },
    { key: 'status', label: 'Status', type: 'select', options: ['Potencial Investidor','Marcar call','Call marcada','Follow Up','Investidor classificado','Investidor em parceria'] },
    { key: 'classificacao', label: 'Classificação', type: 'select', options: ['A','B','C','D'] },
    { key: 'origem', label: 'Origem', type: 'select', options: ['Skool','Grupos Whatsapp','Referenciação','LinkedIn','Outro'] },
    { key: 'telemovel', label: 'Telemóvel', type: 'tel' },
    { key: 'email', label: 'Email', type: 'email' },
    { key: 'capital_min', label: 'Capital Mínimo (€)', type: 'number' },
    { key: 'capital_max', label: 'Capital Máximo (€)', type: 'number' },
    { key: 'montante_investido', label: 'Montante Investido (€)', type: 'number' },
    { key: 'nda_assinado', label: 'NDA Assinado', type: 'checkbox' },
    { key: 'estrategia', label: 'Estratégia de Investimento', type: 'multiselect', options: ['Wholesaling','CAEP','Fix & Flip','Mediação','Capital Passivo','Construção'] },
    { key: 'tipo_investidor', label: 'Tipo de Investidor', type: 'multiselect', options: ['Ativo','Passivo','Institucional','Particular'] },
    { key: 'perfil_risco', label: 'Perfil de Risco', type: 'select', options: ['Conservador','Moderado','Agressivo'] },
    { key: 'data_primeiro_contacto', label: 'Data 1º Contacto', type: 'date' },
    { key: 'data_reuniao', label: 'Data Reunião', type: 'date' },
    { key: 'data_ultimo_contacto', label: 'Data Último Contacto', type: 'date' },
    { key: 'data_capital_transferido', label: 'Data Capital Transferido', type: 'date' },
    { key: 'data_follow_up', label: 'Data Follow Up', type: 'date' },
    { key: 'data_proxima_acao', label: 'Data Próxima Ação', type: 'date' },
    { key: 'proxima_acao', label: 'Próxima Ação', type: 'text' },
    { key: 'motivo_nao_aprovacao', label: 'Motivo Não Aprovação', type: 'text' },
    { key: 'motivo_inatividade', label: 'Motivo Inatividade', type: 'text' },
    { key: 'notas', label: 'Notas', type: 'textarea' },
  ],
  'Consultores': [
    { key: 'nome', label: 'Nome', type: 'text', required: true },
    { key: 'estatuto', label: 'Estatuto', type: 'select', options: ['Cold Call','Follow up','Aberto Parcerias','Acesso imoveis Off market','Consultores em Parceria'] },
    { key: 'classificacao', label: 'Classificação', type: 'select', options: ['A','B','C','D'] },
    { key: 'contacto', label: 'Contacto (telefone)', type: 'tel' },
    { key: 'email', label: 'Email', type: 'email' },
    { key: 'imobiliaria', label: 'Imobiliária', type: 'multiselect', options: ['Remax','ERA','KW','Century21','Coldwell Banker','IAD','Listoo','Impactus','Decisões e Soluções','RE/MAX','Outra'] },
    { key: 'zonas', label: 'Zonas de Atuação', type: 'multiselect', options: FREGUESIAS },
    { key: 'data_inicio', label: 'Data Início Parceria', type: 'date' },
    { key: 'data_follow_up', label: 'Data Follow Up', type: 'date' },
    { key: 'data_proximo_follow_up', label: 'Data Próximo Follow Up', type: 'date' },
    { key: 'motivo_follow_up', label: 'Motivo Follow Up', type: 'text' },
    { key: 'imoveis_enviados', label: 'Imóveis Enviados', type: 'number' },
    { key: 'imoveis_off_market', label: 'Imóveis Off-Market', type: 'number' },
    { key: 'meta_mensal_leads', label: 'Meta Mensal Leads', type: 'number' },
    { key: 'comissao', label: 'Comissão %', type: 'number' },
    { key: 'motivo_descontinuacao', label: 'Motivo Descontinuação', type: 'text' },
    { key: 'notas', label: 'Notas', type: 'textarea' },
  ],
  'Negócios': [
    { key: 'movimento', label: 'Nome do Negócio', type: 'text', required: true },
    { key: 'categoria', label: 'Categoria', type: 'select', options: ['Wholesalling','CAEP','Mediação Imobiliária','Fix and Flip'] },
    { key: 'fase', label: 'Fase', type: 'select', options: ['Fase de obras','Fase de venda','Vendido'] },
    { key: 'imovel_id', label: 'Imóvel', type: 'relation', endpoint: '/api/crm/lookup/imoveis', display: r => `${r.nome} (${r.estado})` },
    { key: 'lucro_estimado', label: 'Lucro Estimado (€)', type: 'number' },
    { key: 'lucro_real', label: 'Lucro Real (€)', type: 'number' },
    { key: 'custo_real_obra', label: 'Custo Real Obra (€)', type: 'number' },
    { key: 'capital_total', label: 'Capital Total (€)', type: 'number' },
    { key: 'n_investidores', label: 'Nº Investidores', type: 'number' },
    { key: 'pagamento_em_falta', label: 'Pagamento em Falta', type: 'checkbox' },
    { key: 'data', label: 'Data', type: 'date' },
    { key: 'data_compra', label: 'Data Compra', type: 'date' },
    { key: 'data_estimada_venda', label: 'Data Estimada Venda', type: 'date' },
    { key: 'data_venda', label: 'Data Venda', type: 'date' },
    { key: 'notas', label: 'Notas', type: 'textarea' },
  ],
  'Despesas': [
    { key: 'movimento', label: 'Despesa', type: 'text', required: true },
    { key: 'categoria', label: 'Categoria', type: 'select', options: ['Material Somnium','Deslocações','Refeições','Comissões Imobiliárias','Referências','Minuta CPCV','Minutas CAEP','Contabilista','Ferramentas','Subscrição Skool'] },
    { key: 'timing', label: 'Timing', type: 'select', options: ['Mensalmente','Anual','Único'] },
    { key: 'custo_mensal', label: 'Custo Mensal (€)', type: 'number' },
    { key: 'custo_anual', label: 'Custo Anual (€)', type: 'number' },
    { key: 'data', label: 'Data', type: 'date' },
    { key: 'notas', label: 'Notas', type: 'textarea' },
  ],
  'Tarefas': [
    { key: 'tarefa', label: 'Tarefa', type: 'text', required: true },
    { key: 'status', label: 'Status', type: 'select', options: ['A fazer', 'Em andamento', 'Atrasada', 'Concluida'] },
    { key: 'inicio', label: 'Data Início', type: 'date' },
    { key: 'fim', label: 'Data Fim', type: 'date' },
    { key: 'funcionario', label: 'Funcionário', type: 'text' },
  ],
}

function RelationOrNew({ value, options, display, createEndpoint, onChange, onCreated }) {
  const [mode, setMode] = useState('select') // 'select' | 'new'
  const [newName, setNewName] = useState('')
  const [creating, setCreating] = useState(false)
  const inputClass = "w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"

  async function handleCreate() {
    if (!newName.trim()) return
    setCreating(true)
    try {
      await fetch(createEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nome: newName.trim(), estatuto: 'Cold Call' }),
      })
      onChange(newName.trim())
      onCreated()
      setMode('select')
      setNewName('')
    } catch {}
    setCreating(false)
  }

  if (mode === 'new') {
    return (
      <div className="flex gap-2">
        <input type="text" value={newName} onChange={e => setNewName(e.target.value)} placeholder="Nome do novo consultor" className={inputClass} />
        <button onClick={handleCreate} disabled={creating} className="px-3 py-2 bg-green-600 text-white text-xs font-medium rounded-lg hover:bg-green-700 shrink-0">
          {creating ? '...' : 'Criar'}
        </button>
        <button onClick={() => setMode('select')} className="px-3 py-2 bg-gray-100 text-gray-600 text-xs rounded-lg shrink-0">Cancelar</button>
      </div>
    )
  }

  return (
    <div className="flex gap-2">
      <select value={value} onChange={e => onChange(e.target.value)} className={inputClass}>
        <option value="">— Selecionar —</option>
        {options.map(r => <option key={r.id} value={r.nome}>{display(r)}</option>)}
      </select>
      <button onClick={() => setMode('new')} className="px-3 py-2 bg-indigo-100 text-indigo-600 text-xs font-medium rounded-lg hover:bg-indigo-200 shrink-0">+ Novo</button>
    </div>
  )
}

function FormPanel({ tab, item, onSave, onCancel }) {
  const fields = FIELD_DEFS[tab] ?? []
  const [form, setForm] = useState({ ...item })
  const [lookups, setLookups] = useState({})
  const isNew = !item.id

  // Load relation lookups
  useEffect(() => {
    fields.filter(f => ['relation', 'relation_name', 'relation_name_or_new'].includes(f.type)).forEach(f => {
      fetch(f.endpoint).then(r => r.json()).then(data => {
        setLookups(prev => ({ ...prev, [f.key]: data }))
      }).catch(() => {})
    })
  }, [tab])

  function handleChange(key, value) {
    setForm(prev => ({ ...prev, [key]: value }))
  }

  const inputClass = "w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
      <h2 className="text-sm font-semibold text-gray-700 mb-4">{isNew ? 'Novo Registo' : 'Editar Registo'}</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {fields.map(f => (
          <div key={f.key} className={f.type === 'textarea' ? 'md:col-span-2 xl:col-span-3' : ''}>
            <label className="block text-xs text-gray-500 mb-1">{f.label}{f.required && ' *'}</label>
            {f.type === 'select' ? (
              <select value={form[f.key] ?? ''} onChange={e => handleChange(f.key, e.target.value)} className={inputClass}>
                <option value="">—</option>
                {f.options.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            ) : f.type === 'multiselect' ? (
              <MultiSelect value={form[f.key]} options={f.options} onChange={v => handleChange(f.key, v)} placeholder={`Selecionar ${f.label.toLowerCase()}...`} />
            ) : f.type === 'relation' ? (
              <select value={form[f.key] ?? ''} onChange={e => handleChange(f.key, e.target.value)} className={inputClass}>
                <option value="">— Selecionar —</option>
                {(lookups[f.key] ?? []).map(r => <option key={r.id} value={r.id}>{f.display(r)}</option>)}
              </select>
            ) : f.type === 'relation_name' ? (
              <select value={form[f.key] ?? ''} onChange={e => handleChange(f.key, e.target.value)} className={inputClass}>
                <option value="">— Selecionar —</option>
                {(lookups[f.key] ?? []).map(r => <option key={r.id} value={r.nome}>{f.display(r)}</option>)}
              </select>
            ) : f.type === 'relation_name_or_new' ? (
              <RelationOrNew
                value={form[f.key] ?? ''}
                options={lookups[f.key] ?? []}
                display={f.display}
                createEndpoint={f.createEndpoint}
                onChange={v => handleChange(f.key, v)}
                onCreated={() => {
                  fetch(f.endpoint).then(r => r.json()).then(data => setLookups(prev => ({ ...prev, [f.key]: data }))).catch(() => {})
                }}
              />
            ) : f.type === 'textarea' ? (
              <textarea value={form[f.key] ?? ''} onChange={e => handleChange(f.key, e.target.value)} rows={3} className={inputClass} />
            ) : f.type === 'checkbox' ? (
              <input type="checkbox" checked={!!form[f.key]} onChange={e => handleChange(f.key, e.target.checked ? 1 : 0)}
                className="w-5 h-5 rounded border-gray-300 text-indigo-600" />
            ) : f.type === 'url' ? (
              <div className="flex gap-2">
                <input type="url" value={form[f.key] ?? ''} onChange={e => handleChange(f.key, e.target.value)} className={inputClass} placeholder="https://..." />
                {form[f.key] && <a href={form[f.key]} target="_blank" rel="noopener noreferrer" className="px-3 py-2 bg-gray-100 rounded-lg text-xs text-indigo-600 hover:bg-gray-200 shrink-0">Abrir</a>}
              </div>
            ) : f.type === 'tel' ? (
              <div className="flex gap-2">
                <input type="tel" value={form[f.key] ?? ''} onChange={e => handleChange(f.key, e.target.value)} className={inputClass} />
                {form[f.key] && <a href={`tel:${form[f.key]}`} className="px-3 py-2 bg-green-50 rounded-lg text-xs text-green-600 hover:bg-green-100 shrink-0">Ligar</a>}
              </div>
            ) : f.type === 'email' ? (
              <div className="flex gap-2">
                <input type="email" value={form[f.key] ?? ''} onChange={e => handleChange(f.key, e.target.value)} className={inputClass} />
                {form[f.key] && <a href={`mailto:${form[f.key]}`} className="px-3 py-2 bg-blue-50 rounded-lg text-xs text-blue-600 hover:bg-blue-100 shrink-0">Email</a>}
              </div>
            ) : (
              <input type={f.type} value={form[f.key] ?? ''} onChange={e => handleChange(f.key, f.type === 'number' ? +e.target.value : e.target.value)} className={inputClass} />
            )}
          </div>
        ))}
      </div>
      <div className="flex gap-3 mt-6">
        <button onClick={() => onSave(form)} className="px-6 py-2 bg-indigo-600 text-white text-sm font-medium rounded-xl hover:bg-indigo-700">
          {isNew ? 'Criar' : 'Guardar'}
        </button>
        <button onClick={onCancel} className="px-6 py-2 bg-gray-100 text-gray-600 text-sm font-medium rounded-xl hover:bg-gray-200">
          Cancelar
        </button>
      </div>
    </div>
  )
}
