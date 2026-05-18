import { useState, useEffect, useCallback, useMemo, lazy, Suspense } from 'react'
import {
  BookOpen, Plus, Search, Cloud, ExternalLink, Trash2, Pencil, Save, X,
  Loader2, FolderInput, LayoutGrid, Briefcase, Wallet, Shield, ArrowLeft,
  ChevronRight, FileText, Calendar,
} from 'lucide-react'
import { apiFetch } from '../lib/api.js'
import { useTheme } from '../contexts/ThemeContext.jsx'
import { Button } from '../components/ui/Button.jsx'
import { Card } from '../components/ui/Card.jsx'
import { Input } from '../components/ui/Input.jsx'

const MDEditor = lazy(() => import('@uiw/react-md-editor'))

const GOLD = '#C9A84C'

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

function snippet(md, max = 140) {
  if (!md) return ''
  const text = md
    .replace(/^#+\s+/gm, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/_\[imagem[^\]]*\]_/gi, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()
  return text.length > max ? text.slice(0, max) + '…' : text
}

export function AdministracaoSOP() {
  const [sops, setSops] = useState([])
  const [filterDep, setFilterDep] = useState('')
  const [search, setSearch] = useState('')
  const [openedId, setOpenedId] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [importOpen, setImportOpen] = useState(false)
  const [creating, setCreating] = useState(false)

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

  useEffect(() => { loadList() }, [loadList])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return sops.filter(s => {
      if (filterDep && s.departamento !== filterDep) return false
      if (q && !s.titulo.toLowerCase().includes(q)) return false
      return true
    })
  }, [sops, filterDep, search])

  async function novoSop() {
    if (creating) return
    setCreating(true)
    try {
      const r = await apiFetch('/api/sops', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          titulo: 'Novo SOP',
          departamento: filterDep || 'geral',
          conteudo_md: '# Novo SOP\n\nDescreva o procedimento aqui.',
        }),
      })
      const data = await r.json()
      if (!r.ok) throw new Error(data.error || 'Falha ao criar')
      await loadList()
      setOpenedId(data.sop.id)
    } catch (e) { alert(e.message) }
    setCreating(false)
  }

  // ── Modo detalhe ────────────────────────────────────
  if (openedId) {
    return (
      <SopDetalhe
        id={openedId}
        onBack={() => setOpenedId(null)}
        onChanged={loadList}
      />
    )
  }

  // ── Modo lista ──────────────────────────────────────
  return (
    <div className="flex flex-col gap-4">
      {error && <div className="p-4 bg-red-50 border border-red-200 text-red-700 rounded-xl text-sm">Erro: {error}</div>}

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
              <span className="absolute left-0 top-0 bottom-0 w-1" style={{ background: ativo ? GOLD : d.cor }} />

              <div className="flex items-start justify-between gap-2 mb-3">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center transition-colors ${
                  ativo ? 'bg-brand-gold/15 border border-brand-gold/30' : 'bg-gray-100 dark:bg-neutral-800 border border-transparent group-hover:border-gray-200 dark:group-hover:border-neutral-700'
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
          <Button variant="primary" icon={Plus} onClick={novoSop} disabled={creating}>
            {creating ? 'A criar...' : 'Novo SOP'}
          </Button>
          <Button variant="secondary" icon={Cloud} onClick={() => setImportOpen(true)}>
            Importar do Drive
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

      {/* Grid de cards de SOPs */}
      {loading ? (
        <div className="text-center py-20 text-gray-400">
          <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" /> A carregar...
        </div>
      ) : filtered.length === 0 ? (
        <Card padding="lg" variant="outlined" className="text-center py-12">
          <BookOpen className="w-10 h-10 mx-auto mb-3 text-gray-300 dark:text-neutral-700" />
          <p className="font-medium text-gray-600 dark:text-neutral-300">Sem SOPs nesta vista.</p>
          <p className="text-xs text-gray-400 mt-1">Crie um novo ou importe do Google Drive.</p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(s => {
            const dep = DEPT_MAP[s.departamento] || DEPT_MAP.geral
            const Icon = dep.Icon
            return (
              <Card
                key={s.id}
                onClick={() => setOpenedId(s.id)}
                hover
                className="flex flex-col gap-3 group"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0`} style={{ backgroundColor: dep.cor + '20' }}>
                    <Icon className="w-4 h-4" style={{ color: dep.cor }} strokeWidth={1.75} />
                  </div>
                  <span
                    className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider"
                    style={{ backgroundColor: dep.cor + '20', color: dep.cor }}
                  >{dep.nome}</span>
                </div>

                <div className="min-w-0">
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-neutral-100 leading-snug line-clamp-2 flex items-center gap-1.5">
                    {s.titulo}
                    <ChevronRight className="w-3.5 h-3.5 text-gray-300 dark:text-neutral-600 group-hover:text-brand-gold transition-colors opacity-0 group-hover:opacity-100 shrink-0" />
                  </h3>
                  <p className="text-xs text-gray-500 dark:text-neutral-400 mt-1.5 line-clamp-3">
                    {snippet(s.conteudo_md_preview || '') || <span className="text-gray-300 dark:text-neutral-600 italic">Sem prévia</span>}
                  </p>
                </div>

                <div className="mt-auto pt-2 border-t border-gray-100 dark:border-neutral-800 flex items-center justify-between text-[11px] text-gray-400">
                  <span className="flex items-center gap-1">
                    <Calendar className="w-3 h-3" />
                    {fmtDate(s.updated_at)}
                  </span>
                  <span className="flex items-center gap-2">
                    <span className="font-mono">v{s.versao}</span>
                    {s.drive_url && (
                      <a
                        href={s.drive_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={e => e.stopPropagation()}
                        className="text-gray-400 hover:text-brand-gold transition-colors"
                        title="Abrir no Drive"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    )}
                  </span>
                </div>
              </Card>
            )
          })}
        </div>
      )}

      {importOpen && <ImportDriveModal
        defaultDepartamento={filterDep || 'geral'}
        onClose={() => setImportOpen(false)}
        onDone={async () => { setImportOpen(false); await loadList() }}
      />}
    </div>
  )
}

// ════════════════════════════════════════════════════════════════
// DETALHE — viewer/editor full-width
// ════════════════════════════════════════════════════════════════
function SopDetalhe({ id, onBack, onChanged }) {
  const { isDark } = useTheme()
  const [sop, setSop] = useState(null)
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [draft, setDraft] = useState({ titulo: '', departamento: 'geral', conteudo_md: '' })

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    apiFetch(`/api/sops/${id}`)
      .then(r => r.json())
      .then(data => {
        if (cancelled) return
        setSop(data.sop)
        setDraft({
          titulo: data.sop?.titulo || '',
          departamento: data.sop?.departamento || 'geral',
          conteudo_md: data.sop?.conteudo_md || '',
        })
      })
      .finally(() => !cancelled && setLoading(false))
    return () => { cancelled = true }
  }, [id])

  async function guardar() {
    if (!sop) return
    setSaving(true)
    try {
      const r = await apiFetch(`/api/sops/${sop.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draft),
      })
      const data = await r.json()
      if (!r.ok) throw new Error(data.error || 'Falha ao guardar')
      setSop(data.sop)
      setEditing(false)
      onChanged?.()
    } catch (e) { alert(e.message) }
    setSaving(false)
  }

  function cancelar() {
    if (!sop) return
    setDraft({ titulo: sop.titulo, departamento: sop.departamento, conteudo_md: sop.conteudo_md || '' })
    setEditing(false)
  }

  async function apagar() {
    if (!sop) return
    if (!confirm(`Eliminar SOP "${sop.titulo}"?`)) return
    try {
      await apiFetch(`/api/sops/${sop.id}`, { method: 'DELETE' })
      onChanged?.()
      onBack()
    } catch (e) { alert(e.message) }
  }

  if (loading) {
    return (
      <div className="text-center py-20 text-gray-400">
        <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" /> A carregar...
      </div>
    )
  }
  if (!sop) {
    return (
      <Card padding="lg" className="text-center">
        <p className="text-sm text-gray-500">SOP não encontrado.</p>
        <Button className="mt-3" variant="secondary" icon={ArrowLeft} onClick={onBack}>Voltar</Button>
      </Card>
    )
  }

  const dep = DEPT_MAP[draft.departamento] || DEPT_MAP.geral

  return (
    <div className="flex flex-col gap-4">
      {/* Toolbar superior — voltar + acções */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <Button variant="ghost" icon={ArrowLeft} onClick={onBack}>Voltar à lista</Button>
        <div className="flex items-center gap-2 flex-wrap">
          {!editing && sop.drive_url && (
            <a href={sop.drive_url} target="_blank" rel="noopener noreferrer">
              <Button variant="secondary" icon={ExternalLink}>Abrir no Drive</Button>
            </a>
          )}
          {!editing ? (
            <>
              <Button variant="secondary" icon={Trash2} onClick={apagar}>Eliminar</Button>
              <Button variant="primary" icon={Pencil} onClick={() => setEditing(true)}>Editar</Button>
            </>
          ) : (
            <>
              <Button variant="ghost" icon={X} onClick={cancelar} disabled={saving}>Cancelar</Button>
              <Button variant="primary" icon={saving ? Loader2 : Save} onClick={guardar} disabled={saving || !draft.titulo.trim()}>
                {saving ? 'A guardar...' : 'Guardar'}
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Cartão com título + meta + editor */}
      <Card padding="none" className="overflow-hidden">
        <div className="p-5 border-b border-gray-100 dark:border-neutral-800 flex flex-col gap-3">
          <div className="flex items-start gap-3">
            <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: dep.cor + '20' }}>
              <dep.Icon className="w-5 h-5" style={{ color: dep.cor }} strokeWidth={1.75} />
            </div>
            <div className="flex-1 min-w-0">
              <input
                value={draft.titulo}
                disabled={!editing}
                onChange={e => setDraft(d => ({ ...d, titulo: e.target.value }))}
                className={`w-full text-lg font-semibold bg-transparent text-gray-900 dark:text-neutral-100 outline-none ${editing ? 'border-b border-gray-300 dark:border-neutral-600 focus:border-brand-gold pb-0.5' : 'border-b border-transparent'}`}
              />
              <div className="flex items-center gap-3 mt-2 text-xs text-gray-500 dark:text-neutral-400 flex-wrap">
                <select
                  value={draft.departamento}
                  disabled={!editing}
                  onChange={e => setDraft(d => ({ ...d, departamento: e.target.value }))}
                  className={`text-xs px-2 py-1 rounded-md border ${editing ? 'border-gray-300 dark:border-neutral-600 dark:bg-neutral-800' : 'border-transparent bg-transparent appearance-none'} text-gray-700 dark:text-neutral-200`}
                >
                  {Object.values(DEPT_MAP).map(d => <option key={d.key} value={d.key}>{d.nome}</option>)}
                </select>
                <span>·</span>
                <span className="font-mono">v{sop.versao}</span>
                <span>·</span>
                <span>Actualizado {fmtDate(sop.updated_at)}{sop.updated_by ? ` por ${sop.updated_by}` : ''}</span>
                {sop.drive_file_id && (<><span>·</span><span className="text-brand-gold">Origem: Drive</span></>)}
              </div>
            </div>
          </div>
        </div>

        {/* Editor MD */}
        <div data-color-mode={isDark ? 'dark' : 'light'}>
          <Suspense fallback={
            <div className="p-12 flex items-center justify-center text-gray-400">
              <Loader2 className="w-5 h-5 animate-spin" />
            </div>
          }>
            <MDEditor
              value={editing ? draft.conteudo_md : (sop.conteudo_md || '')}
              onChange={(val) => editing && setDraft(d => ({ ...d, conteudo_md: val || '' }))}
              preview={editing ? 'live' : 'preview'}
              hideToolbar={!editing}
              visibleDragbar={false}
              height={600}
              style={{ background: 'transparent' }}
            />
          </Suspense>
        </div>
      </Card>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════
// MODAL — Importar do Drive
// ════════════════════════════════════════════════════════════════
function ImportDriveModal({ defaultDepartamento, onClose, onDone }) {
  const [folder, setFolder] = useState('')
  const [departamento, setDepartamento] = useState(defaultDepartamento)
  const [overwrite, setOverwrite] = useState(false)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState(null)
  const [err, setErr] = useState(null)

  async function importar() {
    setBusy(true)
    setErr(null)
    setResult(null)
    try {
      const r = await apiFetch('/api/sops/import-drive', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folderId: folder, departamento, overwrite }),
      })
      const data = await r.json()
      if (!r.ok) throw new Error(data.error || 'Falha ao importar')
      setResult(data)
    } catch (e) { setErr(e.message) }
    setBusy(false)
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <Card padding="lg" className="max-w-md w-full" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-2 mb-4">
          <div className="p-2 rounded-lg bg-brand-gold/15">
            <FolderInput className="w-5 h-5 text-brand-gold" />
          </div>
          <div>
            <h3 className="font-semibold text-gray-900 dark:text-neutral-100">Importar do Google Drive</h3>
            <p className="text-xs text-gray-500 dark:text-neutral-400">Cole o link ou ID de uma pasta com os SOPs.</p>
          </div>
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-xs text-gray-500 dark:text-neutral-400 block mb-1">Pasta Drive (URL ou ID)</label>
            <input
              type="text"
              value={folder}
              onChange={e => setFolder(e.target.value)}
              placeholder="https://drive.google.com/drive/folders/..."
              className="w-full border border-gray-200 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100 rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="text-xs text-gray-500 dark:text-neutral-400 block mb-1">Departamento</label>
            <select
              value={departamento}
              onChange={e => setDepartamento(e.target.value)}
              className="w-full border border-gray-200 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100 rounded-lg px-3 py-2 text-sm"
            >
              {Object.values(DEPT_MAP).map(d => <option key={d.key} value={d.key}>{d.nome}</option>)}
            </select>
          </div>
          <label className="flex items-center gap-2 text-xs text-gray-600 dark:text-neutral-400">
            <input type="checkbox" checked={overwrite} onChange={e => setOverwrite(e.target.checked)} className="rounded" />
            Re-importar (actualiza SOPs já existentes do mesmo ficheiro Drive)
          </label>
        </div>

        {result && (
          <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 dark:bg-emerald-900/20 dark:border-emerald-900 p-3 text-xs text-emerald-700 dark:text-emerald-300">
            Importados: <strong>{result.importados}</strong> · Actualizados: <strong>{result.actualizados}</strong> · Ignorados: <strong>{result.ignorados}</strong> · Total: <strong>{result.total}</strong>
            {result.erros?.length > 0 && (
              <div className="mt-1 text-red-600 dark:text-red-400">
                {result.erros.length} erro(s): {result.erros.slice(0, 3).map(e => e.ficheiro).join(', ')}{result.erros.length > 3 ? '…' : ''}
              </div>
            )}
          </div>
        )}
        {err && (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 dark:bg-red-900/20 dark:border-red-900 p-3 text-xs text-red-700 dark:text-red-300">
            {err}
          </div>
        )}

        <div className="flex justify-end gap-2 mt-5">
          <Button variant="ghost" onClick={result ? onDone : onClose} disabled={busy}>
            {result ? 'Fechar' : 'Cancelar'}
          </Button>
          {!result && (
            <Button
              variant="primary"
              icon={busy ? Loader2 : Cloud}
              onClick={importar}
              disabled={busy || !folder.trim()}
            >
              {busy ? 'A importar...' : 'Importar'}
            </Button>
          )}
        </div>
      </Card>
    </div>
  )
}
