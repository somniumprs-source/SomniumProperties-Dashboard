import { useState, useEffect, useCallback, useMemo } from 'react'
import { SummaryStat } from '../components/ui/SummaryStat.jsx'
import { BookOpen, Search, ExternalLink, Loader2, LayoutGrid, Wallet, RefreshCw, Handshake, Building, Library } from 'lucide-react'
import { apiFetch } from '../lib/api.js'
import { useToast } from '../components/ui/Toast.jsx'
import { friendlyError } from '../lib/friendlyError.js'
import { Button } from '../components/ui/Button.jsx'
import { Card } from '../components/ui/Card.jsx'
import { Input } from '../components/ui/Input.jsx'
import { Tabs } from '../components/ui/Tabs.jsx'
import { ErrorState } from '../components/ui/ErrorState.jsx'

const DRIVE_FOLDER_URL = 'https://drive.google.com/drive/folders/1XCHqPJsnQGNoXsVC35W04vN4e1BR42hE'

const DEPARTAMENTOS = [
  { key: '',               nome: 'Todos',          Icon: LayoutGrid, cor: '#6b7280', desc: 'Todos os SOPs' },
  { key: 'comercial',      nome: 'Comercial',      Icon: Handshake,  cor: '#3b82f6', desc: 'CRM, investidores, imóveis' },
  { key: 'financeiro',     nome: 'Financeiro',     Icon: Wallet,     cor: '#10b981', desc: 'Orçamentos, despesas, análises' },
  { key: 'administrativo', nome: 'Administrativo', Icon: Building,     cor: '#f59e0b', desc: 'Operações internas, sistemas' },
  { key: 'geral',          nome: 'Geral',          Icon: Library,   cor: '#a855f7', desc: 'Documentação transversal' },
]
const DEPT_MAP = Object.fromEntries(DEPARTAMENTOS.filter(d => d.key).map(d => [d.key, d]))

function fmtDate(d) {
  if (!d) return '—'
  try {
    return new Date(d).toLocaleDateString('pt-PT', { day: '2-digit', month: 'short', year: 'numeric' })
  } catch { return d }
}

export function AdministracaoSOP() {
  const toast = useToast()
  const [sops, setSops] = useState([])
  const [filterDep, setFilterDep] = useState('')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [error, setError] = useState(null)

  const loadList = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const r = await apiFetch('/api/sops')
      if (!r.ok) throw Object.assign(new Error('Erro ao carregar SOPs'), { status: r.status })
      const data = await r.json()
      setSops(Array.isArray(data.sops) ? data.sops : [])
    } catch (e) {
      setError(e)
    } finally {
      setLoading(false)
    }
  }, [])

  // Reclassificar departamento dentro do CRM — o Drive ainda não tem essa
  // divisão por pastas, por isso o sync sozinho nunca traria isto correcto.
  async function reclassificar(sopId, departamento) {
    try {
      const r = await apiFetch(`/api/sops/${sopId}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ departamento }),
      })
      if (!r.ok) throw Object.assign(new Error('Erro ao reclassificar'), { status: r.status })
      setSops(prev => prev.map(s => s.id === sopId ? { ...s, departamento } : s))
      toast('Departamento atualizado.', 'success')
    } catch (e) { toast(friendlyError(e), 'error') }
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
      if (data.actualizados) partes.push(`${data.actualizados} atualizado(s)`)
      if (data.removidos) partes.push(`${data.removidos} removido(s) (já não existem no Drive)`)
      toast(partes.length ? `Sincronização concluída: ${partes.join(', ')}.` : 'Sincronização concluída: sem alterações.', 'success')
    } catch (e) { toast(friendlyError(e.message), 'error') }
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
      {error && <ErrorState compact title="Não foi possível carregar os SOPs" error={error} onRetry={loadList} />}

      {/* Hero banner — identidade Somnium */}
      <div className="rounded-xl border border-line bg-surface-raised p-5 sm:p-6 shadow-xs">
        <div className="relative flex items-center justify-between mb-5 gap-3 flex-wrap">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-surface-muted flex items-center justify-center">
              <BookOpen className="w-4 h-4 text-ink-muted" />
            </div>
            <div>
              <h2 className="text-overline uppercase text-ink-muted">Standard Operating Procedures</h2>
              <p className="text-ui font-semibold text-ink">Processos · Checklists · Auditoria</p>
            </div>
          </div>
          <a href={DRIVE_FOLDER_URL} target="_blank" rel="noopener noreferrer">
            <Button variant="secondary" icon={ExternalLink}>Abrir pasta no Drive</Button>
          </a>
        </div>
        <div className="grid grid-cols-3 gap-4">
          <SummaryStat label="Total SOPs" value={totalSops} sub="documentados" />
          <SummaryStat label="Departamentos" value={DEPARTAMENTOS.length - 1} sub="áreas cobertas" />
          <SummaryStat label="Atualizados" value={sopsRecentes} sub="últimos 30 dias" />
        </div>
      </div>

      {/* Departamentos: seletor compacto com contagem */}
      <Tabs
        variant="underline"
        value={filterDep}
        onChange={setFilterDep}
        items={DEPARTAMENTOS.map(d => ({
          key: d.key, label: d.nome, icon: d.Icon,
          count: d.key === '' ? sops.length : sops.filter(s => s.departamento === d.key).length,
        }))}
      />

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
        <div className="text-center py-20 text-ink-muted">
          <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" /> A carregar...
        </div>
      ) : error ? null : filtered.length === 0 ? (
        <Card padding="lg" variant="outlined" className="text-center py-12">
          <BookOpen className="w-10 h-10 mx-auto mb-3 text-ink-muted/70 " />
          <p className="font-medium text-ink-muted ">Sem SOPs nesta vista.</p>
          <p className="text-xs text-ink-muted mt-1">Clique "Sincronizar com Drive" para refrescar a lista.</p>
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
                className="group bg-surface-raised  border border-line  rounded-xl p-4 flex items-center gap-3 transition-[background-color,border-color,color,box-shadow,opacity,transform] hover:border-ink/20 hover:shadow-md hover:-translate-y-0.5"
              >
                <div
                  className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
                  style={{ backgroundColor: dep.cor + '20' }}
                >
                  <Icon className="w-4 h-4" style={{ color: dep.cor }} strokeWidth={1.75} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-ink  leading-snug line-clamp-2">
                    {s.titulo}
                  </p>
                  <div className="flex items-center gap-2 mt-1 text-[11px] text-ink-muted">
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
                <ExternalLink className="w-4 h-4 text-ink-muted/70  group-hover:text-ink transition-colors shrink-0" />
              </a>
            )
          })}
        </div>
      )}
    </div>
  )
}

