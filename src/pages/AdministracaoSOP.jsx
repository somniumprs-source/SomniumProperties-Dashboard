import { useState, useEffect, useCallback, useMemo, lazy, Suspense } from 'react'
import { BookOpen, Plus, Search, Cloud, ExternalLink, Trash2, Pencil, Save, X, Loader2, FolderInput } from 'lucide-react'
import { apiFetch } from '../lib/api.js'
import { useTheme } from '../contexts/ThemeContext.jsx'

const MDEditor = lazy(() => import('@uiw/react-md-editor'))

const GOLD = '#C9A84C'

const DEPARTAMENTOS = [
  { key: 'comercial',      label: 'Comercial',      cor: '#3b82f6' },
  { key: 'financeiro',     label: 'Financeiro',     cor: '#10b981' },
  { key: 'administrativo', label: 'Administrativo', cor: '#f59e0b' },
  { key: 'geral',          label: 'Geral',          cor: '#6b7280' },
]
const DEPT_MAP = Object.fromEntries(DEPARTAMENTOS.map(d => [d.key, d]))

function fmtDate(d) {
  if (!d) return '—'
  try {
    return new Date(d).toLocaleDateString('pt-PT', { day: '2-digit', month: 'short', year: 'numeric' })
  } catch { return d }
}

export function AdministracaoSOP() {
  const { isDark } = useTheme()
  const [sops, setSops] = useState([])
  const [filterDep, setFilterDep] = useState(null)
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState(null)
  const [selected, setSelected] = useState(null)
  const [loadingList, setLoadingList] = useState(true)
  const [loadingDoc, setLoadingDoc] = useState(false)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState({ titulo: '', departamento: 'geral', conteudo_md: '' })
  const [saving, setSaving] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [error, setError] = useState(null)

  const loadList = useCallback(async () => {
    try {
      setLoadingList(true)
      const r = await apiFetch('/api/sops')
      const data = await r.json()
      setSops(Array.isArray(data.sops) ? data.sops : [])
    } catch (e) {
      setError(e.message)
    } finally {
      setLoadingList(false)
    }
  }, [])

  useEffect(() => { loadList() }, [loadList])

  // Auto-select primeiro SOP da lista filtrada quando não há nada seleccionado
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return sops.filter(s => {
      if (filterDep && s.departamento !== filterDep) return false
      if (q && !s.titulo.toLowerCase().includes(q)) return false
      return true
    })
  }, [sops, filterDep, search])

  useEffect(() => {
    if (!selectedId && filtered.length) setSelectedId(filtered[0].id)
  }, [filtered, selectedId])

  // Carregar o SOP seleccionado
  useEffect(() => {
    if (!selectedId) { setSelected(null); return }
    let cancelled = false
    setLoadingDoc(true)
    apiFetch(`/api/sops/${selectedId}`)
      .then(r => r.json())
      .then(data => {
        if (cancelled) return
        setSelected(data.sop)
        setDraft({
          titulo: data.sop?.titulo || '',
          departamento: data.sop?.departamento || 'geral',
          conteudo_md: data.sop?.conteudo_md || '',
        })
        setEditing(false)
      })
      .catch(e => !cancelled && setError(e.message))
      .finally(() => !cancelled && setLoadingDoc(false))
    return () => { cancelled = true }
  }, [selectedId])

  async function novoSop() {
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
      setSelectedId(data.sop.id)
      setEditing(true)
    } catch (e) { alert(e.message) }
  }

  async function guardar() {
    if (!selected) return
    setSaving(true)
    try {
      const r = await apiFetch(`/api/sops/${selected.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draft),
      })
      const data = await r.json()
      if (!r.ok) throw new Error(data.error || 'Falha ao guardar')
      setSelected(data.sop)
      setEditing(false)
      await loadList()
    } catch (e) { alert(e.message) }
    setSaving(false)
  }

  function cancelarEdicao() {
    if (!selected) return
    setDraft({
      titulo: selected.titulo,
      departamento: selected.departamento,
      conteudo_md: selected.conteudo_md || '',
    })
    setEditing(false)
  }

  async function apagar() {
    if (!selected) return
    if (!confirm(`Eliminar SOP "${selected.titulo}"?`)) return
    try {
      await apiFetch(`/api/sops/${selected.id}`, { method: 'DELETE' })
      setSelectedId(null)
      setSelected(null)
      await loadList()
    } catch (e) { alert(e.message) }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-5">
      {/* ── Lista lateral ────────────────────────────────── */}
      <aside className="bg-white dark:bg-neutral-900 rounded-2xl border border-neutral-200 dark:border-neutral-800 overflow-hidden flex flex-col max-h-[calc(100vh-200px)]">
        <div className="p-3 border-b border-neutral-200 dark:border-neutral-800 flex items-center gap-2">
          <button
            onClick={novoSop}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium"
            style={{ backgroundColor: GOLD, color: '#0d0d0d' }}
            title="Novo SOP"
          >
            <Plus className="w-3.5 h-3.5" />
            Novo
          </button>
          <button
            onClick={() => setImportOpen(true)}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors"
            style={{ borderColor: GOLD, color: GOLD }}
            title="Importar do Google Drive"
          >
            <Cloud className="w-3.5 h-3.5" />
            Drive
          </button>
        </div>

        <div className="p-3 border-b border-neutral-200 dark:border-neutral-800 flex flex-col gap-2">
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-neutral-400" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Procurar..."
              className="w-full pl-8 pr-2 py-1.5 rounded-lg border border-neutral-200 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100 text-xs"
            />
          </div>
          <div className="flex flex-wrap gap-1">
            <button
              onClick={() => setFilterDep(null)}
              className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border transition-colors ${
                filterDep === null
                  ? 'bg-neutral-900 text-white border-neutral-900 dark:bg-white dark:text-neutral-900 dark:border-white'
                  : 'bg-transparent border-neutral-200 dark:border-neutral-700 text-neutral-500 dark:text-neutral-400'
              }`}
            >Todos</button>
            {DEPARTAMENTOS.map(d => (
              <button
                key={d.key}
                onClick={() => setFilterDep(d.key)}
                className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border transition-colors ${
                  filterDep === d.key
                    ? 'text-white'
                    : 'bg-transparent border-neutral-200 dark:border-neutral-700 text-neutral-500 dark:text-neutral-400'
                }`}
                style={filterDep === d.key ? { backgroundColor: d.cor, borderColor: d.cor } : {}}
              >{d.label}</button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loadingList ? (
            <div className="p-6 text-center text-neutral-400 text-xs">
              <Loader2 className="w-4 h-4 animate-spin mx-auto mb-1" /> A carregar...
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-6 text-center text-xs text-neutral-400">
              <BookOpen className="w-6 h-6 mx-auto mb-2 text-neutral-300 dark:text-neutral-600" />
              <p className="font-medium text-neutral-500">Sem SOPs</p>
              <p className="text-[10px] mt-1">Crie um novo ou importe do Drive.</p>
            </div>
          ) : (
            <ul className="divide-y divide-neutral-100 dark:divide-neutral-800">
              {filtered.map(s => {
                const dep = DEPT_MAP[s.departamento] || DEPT_MAP.geral
                const active = s.id === selectedId
                return (
                  <li key={s.id}>
                    <button
                      onClick={() => setSelectedId(s.id)}
                      className={`w-full text-left px-3 py-2.5 transition-colors ${
                        active ? 'bg-neutral-50 dark:bg-neutral-800/50' : 'hover:bg-neutral-50 dark:hover:bg-neutral-800/30'
                      }`}
                      style={active ? { borderLeft: `3px solid ${GOLD}` } : {}}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-medium text-neutral-800 dark:text-neutral-100 truncate">
                            {s.titulo}
                          </div>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <span
                              className="text-[9px] uppercase tracking-wide font-bold px-1.5 py-0.5 rounded text-white"
                              style={{ backgroundColor: dep.cor }}
                            >{dep.label}</span>
                            <span className="text-[10px] text-neutral-400">{fmtDate(s.updated_at)}</span>
                          </div>
                        </div>
                      </div>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </aside>

      {/* ── Viewer / Editor ─────────────────────────────── */}
      <section className="bg-white dark:bg-neutral-900 rounded-2xl border border-neutral-200 dark:border-neutral-800 flex flex-col min-h-[60vh]">
        {!selected ? (
          <div className="flex-1 flex items-center justify-center text-neutral-400 text-sm">
            {loadingDoc ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Seleccione um SOP à esquerda.'}
          </div>
        ) : (
          <>
            {/* Toolbar */}
            <div className="p-4 border-b border-neutral-200 dark:border-neutral-800 flex flex-wrap items-center gap-3">
              <input
                value={draft.titulo}
                disabled={!editing}
                onChange={e => setDraft(d => ({ ...d, titulo: e.target.value }))}
                className={`flex-1 min-w-0 font-semibold text-base bg-transparent text-neutral-800 dark:text-neutral-100 ${editing ? 'border-b border-neutral-300 dark:border-neutral-600 focus:outline-none focus:border-[color:var(--gold)]' : 'border-b border-transparent'}`}
                style={{ ['--gold']: GOLD }}
              />
              <select
                value={draft.departamento}
                disabled={!editing}
                onChange={e => setDraft(d => ({ ...d, departamento: e.target.value }))}
                className={`text-xs px-2 py-1 rounded-md border ${editing ? 'border-neutral-300 dark:border-neutral-600 dark:bg-neutral-800' : 'border-transparent'} text-neutral-700 dark:text-neutral-200`}
              >
                {DEPARTAMENTOS.map(d => <option key={d.key} value={d.key}>{d.label}</option>)}
              </select>

              {!editing ? (
                <div className="flex items-center gap-1.5">
                  {selected.drive_url && (
                    <a
                      href={selected.drive_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs rounded-lg border border-neutral-200 dark:border-neutral-700 text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200"
                      title="Abrir no Drive"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      Drive
                    </a>
                  )}
                  <button
                    onClick={() => setEditing(true)}
                    className="inline-flex items-center gap-1 px-3 py-1.5 text-xs rounded-lg font-medium"
                    style={{ backgroundColor: GOLD, color: '#0d0d0d' }}
                  >
                    <Pencil className="w-3.5 h-3.5" />
                    Editar
                  </button>
                  <button
                    onClick={apagar}
                    className="inline-flex items-center gap-1 p-1.5 rounded-lg text-neutral-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
                    title="Eliminar"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={cancelarEdicao}
                    disabled={saving}
                    className="inline-flex items-center gap-1 px-3 py-1.5 text-xs rounded-lg text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800"
                  >
                    <X className="w-3.5 h-3.5" />
                    Cancelar
                  </button>
                  <button
                    onClick={guardar}
                    disabled={saving || !draft.titulo.trim()}
                    className="inline-flex items-center gap-1 px-3 py-1.5 text-xs rounded-lg font-medium disabled:opacity-50"
                    style={{ backgroundColor: GOLD, color: '#0d0d0d' }}
                  >
                    {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                    Guardar
                  </button>
                </div>
              )}
            </div>

            {/* Metadados */}
            <div className="px-4 py-1.5 border-b border-neutral-100 dark:border-neutral-800 text-[10px] text-neutral-400 flex flex-wrap gap-3">
              <span>v{selected.versao}</span>
              <span>·</span>
              <span>Actualizado {fmtDate(selected.updated_at)}{selected.updated_by ? ` por ${selected.updated_by}` : ''}</span>
              {selected.drive_file_id && <><span>·</span><span>Origem: Google Drive</span></>}
            </div>

            {/* Editor / viewer */}
            <div data-color-mode={isDark ? 'dark' : 'light'} className="flex-1 overflow-auto">
              <Suspense fallback={
                <div className="p-8 flex items-center justify-center text-neutral-400">
                  <Loader2 className="w-5 h-5 animate-spin" />
                </div>
              }>
                <MDEditor
                  value={editing ? draft.conteudo_md : (selected.conteudo_md || '')}
                  onChange={(val) => editing && setDraft(d => ({ ...d, conteudo_md: val || '' }))}
                  preview={editing ? 'live' : 'preview'}
                  hideToolbar={!editing}
                  visibleDragbar={false}
                  height="100%"
                  style={{ minHeight: 400, background: 'transparent' }}
                />
              </Suspense>
            </div>
          </>
        )}
      </section>

      {error && (
        <div className="lg:col-span-2 rounded-xl border border-red-200 bg-red-50 dark:bg-red-900/20 dark:border-red-900 p-3 text-xs text-red-700 dark:text-red-300">
          {error}
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
      <div className="bg-white dark:bg-neutral-900 rounded-2xl border border-neutral-200 dark:border-neutral-800 max-w-md w-full p-5" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-2 mb-4">
          <div className="p-2 rounded-lg" style={{ backgroundColor: 'rgba(201,168,76,0.12)' }}>
            <FolderInput className="w-5 h-5" style={{ color: GOLD }} />
          </div>
          <div>
            <h3 className="font-semibold text-neutral-800 dark:text-neutral-100">Importar do Google Drive</h3>
            <p className="text-xs text-neutral-500 dark:text-neutral-400">Cole o link ou ID de uma pasta com os SOPs.</p>
          </div>
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-xs text-neutral-500 dark:text-neutral-400 block mb-1">Pasta Drive (URL ou ID)</label>
            <input
              type="text"
              value={folder}
              onChange={e => setFolder(e.target.value)}
              placeholder="https://drive.google.com/drive/folders/..."
              className="w-full border border-neutral-200 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100 rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="text-xs text-neutral-500 dark:text-neutral-400 block mb-1">Departamento</label>
            <select
              value={departamento}
              onChange={e => setDepartamento(e.target.value)}
              className="w-full border border-neutral-200 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100 rounded-lg px-3 py-2 text-sm"
            >
              {DEPARTAMENTOS.map(d => <option key={d.key} value={d.key}>{d.label}</option>)}
            </select>
          </div>
          <label className="flex items-center gap-2 text-xs text-neutral-600 dark:text-neutral-400">
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
          <button
            onClick={result ? onDone : onClose}
            className="px-3 py-1.5 text-xs rounded-lg text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800"
            disabled={busy}
          >
            {result ? 'Fechar' : 'Cancelar'}
          </button>
          {!result && (
            <button
              onClick={importar}
              disabled={busy || !folder.trim()}
              className="inline-flex items-center gap-1 px-3 py-1.5 text-xs rounded-lg font-medium disabled:opacity-50"
              style={{ backgroundColor: GOLD, color: '#0d0d0d' }}
            >
              {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Cloud className="w-3.5 h-3.5" />}
              Importar
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
