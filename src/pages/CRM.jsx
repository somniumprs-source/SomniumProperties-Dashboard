import { useState, useEffect, useCallback, useRef } from 'react'
import { Header } from '../components/layout/Header.jsx'
import { KanbanBoard } from '../components/crm/KanbanBoard.jsx'
import { DetailPanel } from '../components/crm/DetailPanel.jsx'
import { Filters } from '../components/crm/Filters.jsx'
import { TabKPIs } from '../components/crm/TabKPIs.jsx'
import { useToast } from '../components/ui/Toast.jsx'
import { EUR, cleanLabel, IMOVEL_ESTADO_COLOR, INV_STATUS_COLOR, CONS_ESTATUTO_COLOR, NEG_CAT_COLOR, NEG_FASE_COLOR, DESP_TIMING_COLOR, CLASS_COLOR } from '../constants.js'

const TABS = ['Imóveis', 'Investidores', 'Consultores', 'Negócios', 'Despesas']

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
  const endpoint = { 'Imóveis': 'imoveis', 'Investidores': 'investidores', 'Consultores': 'consultores', 'Negócios': 'negocios', 'Despesas': 'despesas' }[tab]

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
            <td className="py-2 px-3 text-gray-400">{r.data_adicionado ?? '—'}</td>
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
            <td className="py-2 px-3 text-gray-500">{r.telemovel ?? r.email ?? '—'}</td>
            <td className="py-2 px-3 text-gray-400">{r.data_primeiro_contacto ?? '—'}</td>
            <td className="py-2 px-3"><ActionButtons item={r} onEdit={onEdit} onDelete={onDelete} onView={onView} /></td>
          </tr>
        ))}
        {!data.length && <tr><td colSpan={7} className="py-8 text-center text-gray-400">Sem registos</td></tr>}
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
            <td className="py-2 px-3 text-gray-400">{r.data ?? '—'}</td>
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
            <td className="py-2 px-3 text-gray-400">{r.data ?? '—'}</td>
            <td className="py-2 px-3"><ActionButtons item={r} onEdit={onEdit} onDelete={onDelete} /></td>
          </tr>
        ))}
        {!data.length && <tr><td colSpan={7} className="py-8 text-center text-gray-400">Sem registos</td></tr>}
      </tbody>
    </table>
  )
}

// ── Form Panel ────────────────────────────────────────────────

const FIELD_DEFS = {
  'Imóveis': [
    { key: 'nome', label: 'Nome do Imóvel', type: 'text', required: true },
    { key: 'estado', label: 'Estado', type: 'select', options: ['Adicionado','Pendentes','Em Análise','Visita Marcada','Follow UP','Estudo de VVR','Enviar proposta ao investidor','Wholesaling','Negócio em Curso','Nao interessa','Descartado'] },
    { key: 'tipologia', label: 'Tipologia', type: 'text' },
    { key: 'ask_price', label: 'Ask Price (€)', type: 'number' },
    { key: 'valor_proposta', label: 'Valor Proposta (€)', type: 'number' },
    { key: 'custo_estimado_obra', label: 'Custo Estimado Obra (€)', type: 'number' },
    { key: 'valor_venda_remodelado', label: 'Valor Venda Remodelado (€)', type: 'number' },
    { key: 'zona', label: 'Zona', type: 'text' },
    { key: 'origem', label: 'Origem', type: 'select', options: ['Idealista','Imovirtual','Supercasa','Consultor','Referência','Outro'] },
    { key: 'modelo_negocio', label: 'Modelo de Negócio', type: 'select', options: ['Wholesaling','Fix & Flip','CAEP','Mediação'] },
    { key: 'nome_consultor', label: 'Consultor', type: 'text' },
    { key: 'link', label: 'Link', type: 'text' },
    { key: 'data_adicionado', label: 'Data Adicionado', type: 'date' },
    { key: 'data_chamada', label: 'Data Chamada', type: 'date' },
    { key: 'data_visita', label: 'Data Visita', type: 'date' },
    { key: 'data_proposta', label: 'Data Proposta', type: 'date' },
    { key: 'notas', label: 'Notas', type: 'textarea' },
  ],
  'Investidores': [
    { key: 'nome', label: 'Nome', type: 'text', required: true },
    { key: 'status', label: 'Status', type: 'select', options: ['Potencial Investidor','Marcar call','Call marcada','Follow Up','Investidor classificado','Investidor em parceria'] },
    { key: 'classificacao', label: 'Classificação', type: 'select', options: ['A','B','C','D'] },
    { key: 'origem', label: 'Origem', type: 'select', options: ['Skool','Grupos Whatsapp','Referenciação','LinkedIn','Outro'] },
    { key: 'telemovel', label: 'Telemóvel', type: 'text' },
    { key: 'email', label: 'Email', type: 'email' },
    { key: 'capital_min', label: 'Capital Mínimo (€)', type: 'number' },
    { key: 'capital_max', label: 'Capital Máximo (€)', type: 'number' },
    { key: 'nda_assinado', label: 'NDA Assinado', type: 'checkbox' },
    { key: 'data_primeiro_contacto', label: 'Data 1º Contacto', type: 'date' },
    { key: 'data_reuniao', label: 'Data Reunião', type: 'date' },
    { key: 'data_follow_up', label: 'Data Follow Up', type: 'date' },
    { key: 'proxima_acao', label: 'Próxima Ação', type: 'text' },
    { key: 'notas', label: 'Notas', type: 'textarea' },
  ],
  'Consultores': [
    { key: 'nome', label: 'Nome', type: 'text', required: true },
    { key: 'estatuto', label: 'Estatuto', type: 'select', options: ['Cold Call','Follow up','Aberto Parcerias','Acesso imoveis Off market','Consultores em Parceria'] },
    { key: 'classificacao', label: 'Classificação', type: 'select', options: ['A','B','C','D'] },
    { key: 'contacto', label: 'Contacto', type: 'text' },
    { key: 'email', label: 'Email', type: 'email' },
    { key: 'data_follow_up', label: 'Data Follow Up', type: 'date' },
    { key: 'data_proximo_follow_up', label: 'Data Próximo Follow Up', type: 'date' },
    { key: 'motivo_follow_up', label: 'Motivo Follow Up', type: 'text' },
    { key: 'imoveis_enviados', label: 'Imóveis Enviados', type: 'number' },
    { key: 'imoveis_off_market', label: 'Imóveis Off-Market', type: 'number' },
    { key: 'comissao', label: 'Comissão %', type: 'number' },
    { key: 'notas', label: 'Notas', type: 'textarea' },
  ],
  'Negócios': [
    { key: 'movimento', label: 'Nome do Negócio', type: 'text', required: true },
    { key: 'categoria', label: 'Categoria', type: 'select', options: ['Wholesalling','CAEP','Mediação Imobiliária','Fix and Flip'] },
    { key: 'fase', label: 'Fase', type: 'select', options: ['Fase de obras','Fase de venda','Vendido'] },
    { key: 'lucro_estimado', label: 'Lucro Estimado (€)', type: 'number' },
    { key: 'lucro_real', label: 'Lucro Real (€)', type: 'number' },
    { key: 'data', label: 'Data', type: 'date' },
    { key: 'data_compra', label: 'Data Compra', type: 'date' },
    { key: 'data_estimada_venda', label: 'Data Estimada Venda', type: 'date' },
    { key: 'data_venda', label: 'Data Venda', type: 'date' },
    { key: 'pagamento_em_falta', label: 'Pagamento em Falta', type: 'checkbox' },
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
}

function FormPanel({ tab, item, onSave, onCancel }) {
  const fields = FIELD_DEFS[tab] ?? []
  const [form, setForm] = useState({ ...item })
  const isNew = !item.id

  function handleChange(key, value) {
    setForm(prev => ({ ...prev, [key]: value }))
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
      <h2 className="text-sm font-semibold text-gray-700 mb-4">{isNew ? 'Novo Registo' : 'Editar Registo'}</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {fields.map(f => (
          <div key={f.key} className={f.type === 'textarea' ? 'md:col-span-2 xl:col-span-3' : ''}>
            <label className="block text-xs text-gray-500 mb-1">{f.label}{f.required && ' *'}</label>
            {f.type === 'select' ? (
              <select value={form[f.key] ?? ''} onChange={e => handleChange(f.key, e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300">
                <option value="">—</option>
                {f.options.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            ) : f.type === 'textarea' ? (
              <textarea value={form[f.key] ?? ''} onChange={e => handleChange(f.key, e.target.value)} rows={3}
                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" />
            ) : f.type === 'checkbox' ? (
              <input type="checkbox" checked={!!form[f.key]} onChange={e => handleChange(f.key, e.target.checked ? 1 : 0)}
                className="w-5 h-5 rounded border-gray-300 text-indigo-600" />
            ) : (
              <input type={f.type} value={form[f.key] ?? ''} onChange={e => handleChange(f.key, f.type === 'number' ? +e.target.value : e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" />
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
