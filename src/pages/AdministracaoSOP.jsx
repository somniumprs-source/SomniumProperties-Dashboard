import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  BookOpen, Search, ExternalLink, Loader2, LayoutGrid,
  Briefcase, Wallet, Shield, RefreshCw,
} from 'lucide-react'
import { apiFetch } from '../lib/api.js'
import { Button } from '../components/ui/Button.jsx'
import { Card } from '../components/ui/Card.jsx'
import { Input } from '../components/ui/Input.jsx'

const DRIVE_FOLDER_URL = 'https://drive.google.com/drive/folders/1XCHqPJsnQGNoXsVC35W04vN4e1BR42hE'

const DEPARTAMENTOS = [
  { key: '',               nome: 'Todos',          Icon: LayoutGrid, cor: '#6b7280', desc: 'Todos os SOPs' },
  { key: 'comercial',      nome: 'Comercial',      Icon: Briefcase,  cor: '#3b82f6', desc: 'CRM, investidores, imóveis' },
  { key: 'financeiro',     nome: 'Financeiro',     Icon: Wallet,     cor: '#10b981', desc: 'Orçamentos, despesas, análises' },
  { key: 'administrativo', nome: 'Administrativo', Icon: Shield,     cor: '#f59e0b', desc: 'Operações internas, sistemas' },
  { key: 'geral',          nome: 'Geral',          Icon: BookOpen,   cor: '#a855f7', desc: 'Documentação transversal' },
]
const DEPT_MAP = Object.fromEntries(DEPARTAMENTOS.filter(d => d.key).map(d => [d.key, d]))

function fmtDate(d) {
  if (!d) return '—'
  try {
    return new Date(d).toLocaleDateString('pt-PT', { day: '2-digit', month: 'short', year: 'numeric' })
  } catch { return d }
}

export function AdministracaoSOP() {
  const [sops, setSops] = useState([])
  const [filterDep, setFilterDep] = useState('')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [error, setError] = useState(null)

  const loadList = useCallback(async () => {
    try {
      setLoading(true)
      const r = await apiFetch('/api/sops')
      const data = await r.json()
      setSops(Array.isArray(data.sops) ? data.sops : [])
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  // Reclassificar departamento dentro do CRM — o Drive ainda não tem essa
  // divisão por pastas, por isso o sync sozinho nunca traria isto correcto.
  async function reclassificar(sopId, departamento) {
    try {
      await apiFetch(`/api/sops/${sopId}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ departamento }),
      })
      setSops(prev => prev.map(s => s.id === sopId ? { ...s, departamento } : s))
    } catch (e) { setError(e.message) }
  }

  useEffect(() => { loadList() }, [loadList])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return sops.filter(s => {
      if (filterDep && s.departamento !== filterDep) return false
      if (q && !s.titulo.toLowerCase().includes(q)) return false
      return true
    })
  }, [sops, filterDep, search])

  async function sincronizar() {
    if (syncing) return
    setSyncing(true)
    try {
      const folders = [
        { folderId: '1XCHqPJsnQGNoXsVC35W04vN4e1BR42hE', departamento: 'comercial' },
      ]
      const r = await apiFetch('/api/sops/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folders }),
      })
      const data = await r.json()
      if (!r.ok) throw new Error(data.error || 'Falha ao sincronizar')
      await loadList()
      const partes = []
      if (data.importados) partes.push(`${data.importados} novo(s)`)
      if (data.actualizados) partes.push(`${data.actualizados} actualizado(s)`)
      if (data.removidos) partes.push(`${data.removidos} removido(s) (já não existem no Drive)`)
      if (partes.length) alert(`Sincronização concluída: ${partes.join(', ')}.`)
    } catch (e) { alert(e.message) }
    setSyncing(false)
  }

  const totalSops = sops.length
  const sopsRecentes = sops.filter(s => {
    if (!s.updated_at) return false
    const days = (Date.now() - new Date(s.updated_at).getTime()) / 86400000
    return days <= 30
  }).length

  return (
    <div className="flex flex-col gap-4">
      {error && <div className="p-4 bg-red-50 border border-red-200 text-red-700 rounded-xl text-sm">Erro: {error}</div>}

      {/* Hero banner — identidade Somnium */}
      <div className="relative overflow-hidden rounded-2xl p-5 sm:p-6 text-white shadow-lg bg-gradient-to-br from-brand-dark via-brand-dark-light to-brand-dark-700">
        <div className="absolute top-0 right-0 w-64 h-64 bg-brand-gold/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 pointer-events-none" />
        <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-brand-gold to-transparent" />
        <div className="relative flex items-center justify-between mb-5 gap-3 flex-wrap">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-brand-gold/15 border border-brand-gold/30 flex items-center justify-center">
              <BookOpen className="w-4 h-4 text-brand-gold" />
            </div>
            <div>
              <h2 className="text-overline uppercase tracking-widest font-semibold text-brand-gold">Standard Operating Procedures</h2>
              <p className="text-sm font-semibold text-white">Processos · Checklists · Auditoria</p>
            </div>
          </div>
          <a href={DRIVE_FOLDER_URL} target="_blank" rel="noopener noreferrer">
            <Button variant="gold" icon={ExternalLink}>Abrir pasta no Drive</Button>
          </a>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <HeroKpi label="Total SOPs" value={totalSops} sub="documentados" />
          <HeroKpi label="Departamentos" value={DEPARTAMENTOS.length - 1} sub="áreas cobertas" accent />
          <HeroKpi label="Actualizados" value={sopsRecentes} sub="últimos 30 dias" green />
          <HeroKpi label="Vista" value={filterDep ? (DEPT_MAP[filterDep]?.nome ?? 'Filtrada') : 'Todos'} sub="filtro activo" />
        </div>
      </div>

      {/* Caixas top por departamento */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {DEPARTAMENTOS.map(d => {
          const sopsDoDep = d.key === '' ? sops : sops.filter(s => s.departamento === d.key)
          const contagem = sopsDoDep.length
          const ultimoUpdate = sopsDoDep.reduce((m, s) => (!m || new Date(s.updated_at) > new Date(m) ? s.updated_at : m), null)
          const ativo = filterDep === d.key
          return (
            <button
              key={d.key || 'todos'}
              onClick={() => setFilterDep(d.key)}
              title={d.desc}
              className={`group relative text-left p-4 rounded-xl border-2 transition-all overflow-hidden
                ${ativo
                  ? 'bg-brand-dark border-brand-dark text-white shadow-lg -translate-y-0.5'
                  : 'bg-white dark:bg-neutral-900 border-gray-200 dark:border-neutral-800 hover:border-gray-300 dark:hover:border-neutral-600 hover:-translate-y-0.5 hover:shadow-md'}`}
            >
              <span className="absolute left-0 top-0 bottom-0 w-1" style={{ background: ativo ? '#C9A84C' : d.cor }} />
              <div className="flex items-start justify-between gap-2 mb-3">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center transition-colors ${
                  ativo ? 'bg-brand-gold/15 border border-brand-gold/30' : 'bg-gray-100 dark:bg-neutral-800 border border-transparent'
                }`}>
                  <d.Icon className={`w-5 h-5 ${ativo ? 'text-brand-gold' : 'text-gray-600 dark:text-neutral-300'}`} strokeWidth={1.75} />
                </div>
                <span className={`text-3xl font-bold leading-none font-mono ${ativo ? 'text-brand-gold' : 'text-gray-900 dark:text-neutral-100'}`}>{contagem}</span>
              </div>
              <p className={`text-sm font-semibold leading-tight ${ativo ? 'text-brand-gold' : 'text-gray-900 dark:text-neutral-100'}`}>{d.nome}</p>
              <p className={`text-[10px] uppercase tracking-widest font-semibold mt-0.5 ${ativo ? 'text-white/60' : 'text-gray-400 dark:text-neutral-500'}`}>
                {contagem === 1 ? 'documento' : 'documentos'}
              </p>
              {ultimoUpdate && (
                <div className={`mt-3 pt-2 border-t ${ativo ? 'border-white/10' : 'border-gray-100 dark:border-neutral-800'}`}>
                  <p className={`text-[10px] ${ativo ? 'text-brand-gold/70' : 'text-gray-400 dark:text-neutral-500'}`}>
                    Última actualização · {fmtDate(ultimoUpdate)}
                  </p>
                </div>
              )}
            </button>
          )
        })}
      </div>

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="primary" icon={syncing ? Loader2 : RefreshCw} onClick={sincronizar} disabled={syncing}>
            {syncing ? 'A sincronizar...' : 'Sincronizar com Drive'}
          </Button>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Input
            size="sm"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Procurar SOP..."
            prefix={<Search className="w-3.5 h-3.5" />}
            className="w-56"
          />
        </div>
      </div>

      {/* Grid de atalhos */}
      {loading ? (
        <div className="text-center py-20 text-gray-400">
          <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" /> A carregar...
        </div>
      ) : filtered.length === 0 ? (
        <Card padding="lg" variant="outlined" className="text-center py-12">
          <BookOpen className="w-10 h-10 mx-auto mb-3 text-gray-300 dark:text-neutral-700" />
          <p className="font-medium text-gray-600 dark:text-neutral-300">Sem SOPs nesta vista.</p>
          <p className="text-xs text-gray-400 mt-1">Clique "Sincronizar com Drive" para refrescar a lista.</p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map(s => {
            const dep = DEPT_MAP[s.departamento] || DEPT_MAP.geral
            const Icon = dep.Icon
            const href = s.drive_url || DRIVE_FOLDER_URL
            return (
              <a
                key={s.id}
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="group bg-white dark:bg-neutral-900 border border-gray-200 dark:border-neutral-800 rounded-xl p-4 flex items-center gap-3 transition-all hover:border-brand-gold hover:shadow-md hover:-translate-y-0.5"
              >
                <div
                  className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
                  style={{ backgroundColor: dep.cor + '20' }}
                >
                  <Icon className="w-4 h-4" style={{ color: dep.cor }} strokeWidth={1.75} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900 dark:text-neutral-100 leading-snug line-clamp-2">
                    {s.titulo}
                  </p>
                  <div className="flex items-center gap-2 mt-1 text-[11px] text-gray-400">
                    <select
                      value={s.departamento || 'geral'}
                      onClick={e => { e.preventDefault(); e.stopPropagation() }}
                      onChange={e => { reclassificar(s.id, e.target.value) }}
                      className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-semibold uppercase tracking-wider border-0 cursor-pointer"
                      style={{ backgroundColor: dep.cor + '20', color: dep.cor }}
                      title="Reclassificar departamento"
                    >
                      {DEPARTAMENTOS.filter(d => d.key).map(d => (
                        <option key={d.key} value={d.key}>{d.nome}</option>
                      ))}
                    </select>
                    <span>·</span>
                    <span>{fmtDate(s.updated_at)}</span>
                  </div>
                </div>
                <ExternalLink className="w-4 h-4 text-gray-300 dark:text-neutral-600 group-hover:text-brand-gold transition-colors shrink-0" />
              </a>
            )
          })}
        </div>
      )}
    </div>
  )
}

function HeroKpi({ label, value, sub, accent, green, red }) {
  return (
    <div className="min-w-0">
      <p className="text-overline uppercase tracking-widest text-gray-400 font-semibold">{label}</p>
      <p className={`text-2xl font-mono font-bold mt-1 truncate ${accent ? 'text-brand-gold' : green ? 'text-green-400' : red ? 'text-red-400' : 'text-white'}`}>{value}</p>
      {sub && <p className="text-caption text-gray-500 mt-0.5 truncate">{sub}</p>}
    </div>
  )
}
