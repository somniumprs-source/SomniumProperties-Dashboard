import { useState, useEffect, useCallback } from 'react'
import { SummaryStat } from '../components/ui/SummaryStat.jsx'
import { FileDown, Sparkles, Trash2, Calendar, Loader2, Plus, RefreshCw, Zap, FileText, Presentation, Upload, Pencil, X, CalendarPlus, Eye } from 'lucide-react'
import { apiFetch, openDocument } from '../lib/api.js'
import { useToast } from '../components/ui/Toast.jsx'
import { friendlyError } from '../lib/friendlyError.js'
import { Tabs } from '../components/ui/Tabs.jsx'
import { ErrorState } from '../components/ui/ErrorState.jsx'
import { MessageSquareText, ListChecks, ExternalLink } from 'lucide-react'

function fmtSize(b) {
  if (b == null) return ''
  if (b < 1024) return `${b} B`
  if (b < 1048576) return `${(b / 1024).toFixed(0)} KB`
  return `${(b / 1048576).toFixed(1)} MB`
}

function fmtDate(d) {
  if (!d) return '—'
  try {
    return new Date(d).toLocaleDateString('pt-PT', { day: '2-digit', month: 'short', year: 'numeric' })
  } catch { return d }
}

function fmtRange(ini, fim) {
  if (!ini || !fim) return '—'
  return `${fmtDate(ini)} — ${fmtDate(fim)}`
}

function currentSemanaIso() {
  const d = new Date()
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
  const dayNum = date.getUTCDay() || 7
  date.setUTCDate(date.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1))
  const weekNum = Math.ceil(((date - yearStart) / 86400000 + 1) / 7)
  return `${date.getUTCFullYear()}-W${String(weekNum).padStart(2, '0')}`
}

function RelatoriosAdministrativos() {
  const toast = useToast()
  const [relatorios, setRelatorios] = useState([])
  const [reunioes, setReunioes] = useState([])
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [syncStatus, setSyncStatus] = useState(null)
  const [error, setError] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ semana_iso: currentSemanaIso(), regenerar: false })

  // Reunioes editaveis com documentos
  const [showReuniaoForm, setShowReuniaoForm] = useState(false)
  const [reuniaoForm, setReuniaoForm] = useState({ id: null, titulo: '', data: '', notas: '' })
  const [savingReuniao, setSavingReuniao] = useState(false)
  const [uploadingId, setUploadingId] = useState(null)

  const loadReunioes = useCallback(async () => {
    try {
      const rd = await apiFetch('/api/crm/reunioes-documentos')
      const dd = await rd.json()
      setReunioes(Array.isArray(dd) ? dd : [])
    } catch { setReunioes([]) }
  }, [])

  const load = useCallback(async () => {
    try {
      setLoading(true)
      const r = await apiFetch('/api/crm/relatorios-semanais')
      if (!r.ok) throw Object.assign(new Error('Erro ao carregar relatórios'), { status: r.status })
      const data = await r.json()
      setRelatorios(Array.isArray(data) ? data : [])
      await loadReunioes()
      setError(null)
    } catch (e) {
      setError(e)
    } finally {
      setLoading(false)
    }
  }, [loadReunioes])

  useEffect(() => { load() }, [load])

  async function gerar() {
    setGenerating(true)
    try {
      const r = await apiFetch('/api/crm/relatorios-semanais/gerar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await r.json()
      if (!r.ok) throw new Error(data.error || 'Erro ao gerar relatório')
      setShowForm(false)
      toast('Relatório gerado.', 'success')
      await load()
      if (data.id) {
        await abrirPdf(data.id)
      }
    } catch (e) {
      toast(friendlyError(e.message), 'error')
    }
    setGenerating(false)
  }

  async function sincronizarFireflies() {
    setSyncing(true)
    setSyncStatus(null)
    try {
      const r = await apiFetch('/api/crm/relatorios-semanais/auto-gerar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apenas_pendentes: false }),
      })
      const data = await r.json()
      if (!r.ok) throw new Error(data.error || 'Erro ao sincronizar')
      setSyncStatus(`${data.criados} criados · ${data.actualizados} atualizados · €${data.custoEur.toFixed(2)} (${data.semanasProcessadas} semanas)`)
      await load()
    } catch (e) {
      toast(friendlyError(e.message), 'error')
    }
    setSyncing(false)
  }

  async function abrirPdf(id, { download = false } = {}) {
    // openDocument trata o seu próprio feedback de erro (toast global).
    try { await openDocument(`/api/crm/relatorios-semanais/${id}/pdf`, { download }) } catch { /* já notificado */ }
  }

  async function eliminar(id) {
    if (!confirm('Eliminar este relatório semanal?')) return
    try {
      const r = await apiFetch(`/api/crm/relatorios-semanais/${id}`, { method: 'DELETE' })
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'Não foi possível eliminar o relatório.')
      toast('Relatório eliminado.', 'success')
      await load()
    } catch (e) { toast(friendlyError(e.message), 'error') }
  }

  // ── Reunioes ──────────────────────────────────────────────────
  function abrirNovaReuniao() {
    setReuniaoForm({ id: null, titulo: '', data: '', notas: '' })
    setShowReuniaoForm(true)
  }

  function editarReuniao(r) {
    setReuniaoForm({ id: r.id, titulo: r.titulo || '', data: r.data || '', notas: r.notas || '' })
    setShowReuniaoForm(true)
  }

  async function guardarReuniao() {
    if (!reuniaoForm.titulo.trim()) return
    setSavingReuniao(true)
    try {
      const body = { titulo: reuniaoForm.titulo.trim(), data: reuniaoForm.data || null, notas: reuniaoForm.notas || null }
      const url = reuniaoForm.id ? `/api/crm/reunioes-documentos/${reuniaoForm.id}` : '/api/crm/reunioes-documentos'
      const method = reuniaoForm.id ? 'PUT' : 'POST'
      const r = await apiFetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const data = await r.json()
      if (!r.ok) throw new Error(data.error || 'Erro ao guardar reunião')
      setShowReuniaoForm(false)
      toast(reuniaoForm.id ? 'Reunião guardada.' : 'Reunião criada.', 'success')
      await loadReunioes()
    } catch (e) { toast(friendlyError(e.message), 'error') }
    setSavingReuniao(false)
  }

  async function apagarReuniao(id) {
    if (!confirm('Eliminar esta reunião e todos os seus documentos?')) return
    try {
      const r = await apiFetch(`/api/crm/reunioes-documentos/${id}`, { method: 'DELETE' })
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'Não foi possível eliminar a reunião.')
      toast('Reunião eliminada.', 'success')
      await loadReunioes()
    } catch (e) { toast(friendlyError(e.message), 'error') }
  }

  async function uploadFicheiros(id, files) {
    if (!files?.length) return
    setUploadingId(id)
    try {
      const fd = new FormData()
      for (const f of files) fd.append('ficheiros', f)
      const r = await apiFetch(`/api/crm/reunioes-documentos/${id}/ficheiros`, { method: 'POST', body: fd })
      const data = await r.json()
      if (!r.ok) throw new Error(data.error || 'Erro ao carregar ficheiros')
      setReunioes(prev => prev.map(x => x.id === id ? { ...x, ficheiros: data.ficheiros } : x))
      toast(files.length === 1 ? 'Documento carregado.' : `${files.length} documentos carregados.`, 'success')
    } catch (e) { toast(friendlyError(e.message), 'error') }
    setUploadingId(null)
  }

  async function apagarFicheiro(id, nome) {
    if (!confirm(`Eliminar "${nome}"?`)) return
    try {
      const r = await apiFetch(`/api/crm/reunioes-documentos/${id}/ficheiros/${encodeURIComponent(nome)}`, { method: 'DELETE' })
      const data = await r.json()
      if (!r.ok) throw new Error(data.error || 'Erro ao eliminar')
      setReunioes(prev => prev.map(x => x.id === id ? { ...x, ficheiros: data.ficheiros } : x))
    } catch (e) { toast(friendlyError(e.message), 'error') }
  }

  const totalRelatorios = relatorios.length
  const totalReunioes = relatorios.reduce((s, r) => s + (Number(r.num_reunioes) || 0), 0)
  const recentes = relatorios.filter(r => {
    if (!r.criado_em) return false
    const days = (Date.now() - new Date(r.criado_em).getTime()) / 86400000
    return days <= 30
  }).length

  return (
    <>
      {/* Hero banner — identidade Somnium */}
      <div className="rounded-xl border border-line bg-surface-raised p-5 sm:p-6 shadow-xs mb-6">
        <div className="relative flex items-center justify-between mb-5">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-surface-muted flex items-center justify-center">
              <FileText className="w-4 h-4 text-ink-muted" />
            </div>
            <div>
              <h2 className="text-overline uppercase text-ink-muted">Relatórios Administrativos</h2>
              <p className="text-ui font-semibold text-ink">Análises · Auditoria · Exports</p>
            </div>
          </div>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <SummaryStat label="Relatórios gerados" value={totalRelatorios} sub="total" />
          <SummaryStat label="Recentes" value={recentes} sub="últimos 30 dias" />
          <SummaryStat label="Reuniões cobertas" value={totalReunioes} sub="origem Fireflies" />
          <SummaryStat label="Status" value={syncing ? 'A sincronizar' : 'OK'} sub={syncStatus ? 'última sync OK' : 'pronto'} />
        </div>
      </div>

      {/* Estudos Estrategicos — relatorios de mercado estaticos */}
      <div className="mb-6 rounded-2xl border border-line bg-surface-raised p-5 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="p-2.5 rounded-lg bg-surface-muted">
              <FileText className="w-5 h-5 text-ink-muted" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-ink ">Estudos Estratégicos</h2>
              <p className="text-sm text-ink-muted  max-w-xl">
                Relatórios de mercado e expansão para apresentar a investidores e equipa. Documentos confidenciais Somnium Properties.
              </p>
            </div>
          </div>
          <div className="flex flex-col gap-2 shrink-0 w-full sm:w-auto">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => openDocument('/api/crm/relatorios/expansao-gaia').catch(() => {})}
                title="Abrir numa nova aba"
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-[filter] duration-fast sm:whitespace-nowrap flex-1 min-w-0 bg-accent text-accent-foreground hover:brightness-[1.04]"
              >
                <Eye className="w-4 h-4 shrink-0" />
                Relatório de Expansão — Vila Nova de Gaia
              </button>
              <button
                type="button"
                onClick={() => openDocument('/api/crm/relatorios/expansao-gaia', { download: true }).catch(() => {})}
                title="Descarregar o PDF"
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium transition-colors duration-fast whitespace-nowrap bg-surface-raised text-ink border border-line hover:bg-surface-muted hover:border-ink/20"
              >
                <FileDown className="w-4 h-4" />
                PDF
              </button>
            </div>
            <a
              href="/relatorios/Relatorio_Precos_Mercado_AMP.pdf"
              target="_blank"
              rel="noopener"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-colors duration-fast sm:whitespace-nowrap bg-surface-raised text-ink border border-line hover:bg-surface-muted hover:border-ink/20"
            >
              <FileDown className="w-4 h-4" />
              Guia de Zonas — Preços de Mercado (AMP)
            </a>
          </div>
        </div>
      </div>

      {/* Reunioes — documentos por reuniao (criar / editar / upload / apagar) */}
      <div className="mb-6 rounded-2xl border border-line bg-surface-raised p-5 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-4">
          <div className="flex items-start gap-3">
            <div className="p-2.5 rounded-lg bg-surface-muted">
              <FileDown className="w-5 h-5 text-ink-muted" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-ink ">Documentos da reunião</h2>
              <p className="text-sm text-ink-muted  max-w-xl">
                Relatórios e apresentações por reunião (PDF, PowerPoint, Word, Excel). Documentos confidenciais Somnium Properties.
              </p>
            </div>
          </div>
          <button
            onClick={abrirNovaReuniao}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-[background-color,border-color,color,box-shadow,opacity,transform] whitespace-nowrap shrink-0 bg-accent text-accent-foreground hover:brightness-[1.04]"
          >
            <CalendarPlus className="w-4 h-4" />
            Nova reunião
          </button>
        </div>

        {/* Form criar/editar reuniao */}
        {showReuniaoForm && (
          <div className="mb-4 rounded-xl border border-line  bg-surface-raised  p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-sm text-ink ">
                {reuniaoForm.id ? 'Editar reunião' : 'Nova reunião'}
              </h3>
              <button onClick={() => setShowReuniaoForm(false)} className="p-1 rounded-lg text-ink-muted hover:bg-surface-muted ">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-2">
                <label className="text-xs text-ink-muted  block mb-1">Título *</label>
                <input
                  type="text"
                  value={reuniaoForm.titulo}
                  onChange={e => setReuniaoForm(f => ({ ...f, titulo: e.target.value }))}
                  placeholder="Reunião Semanal 07-06 22h"
                  className="w-full border border-line bg-surface-raised text-ink rounded-lg px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="text-xs text-ink-muted  block mb-1">Data</label>
                <input
                  type="date"
                  value={reuniaoForm.data || ''}
                  onChange={e => setReuniaoForm(f => ({ ...f, data: e.target.value }))}
                  className="w-full border border-line bg-surface-raised text-ink rounded-lg px-3 py-2 text-sm"
                />
              </div>
            </div>
            <div className="mt-3">
              <label className="text-xs text-ink-muted  block mb-1">Notas (opcional)</label>
              <input
                type="text"
                value={reuniaoForm.notas}
                onChange={e => setReuniaoForm(f => ({ ...f, notas: e.target.value }))}
                placeholder="Breve descrição da reunião"
                className="w-full border border-line bg-surface-raised text-ink rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button
                onClick={() => setShowReuniaoForm(false)}
                disabled={savingReuniao}
                className="px-4 py-2 rounded-lg text-sm text-ink-muted  hover:bg-surface-muted "
              >
                Cancelar
              </button>
              <button
                onClick={guardarReuniao}
                disabled={savingReuniao || !reuniaoForm.titulo.trim()}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50 bg-accent text-accent-foreground hover:brightness-[1.04]"
              >
                {savingReuniao ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                {reuniaoForm.id ? 'Guardar' : 'Criar reunião'}
              </button>
            </div>
          </div>
        )}

        {reunioes.length === 0 && !showReuniaoForm ? (
          <div className="text-center py-10 rounded-xl border-2 border-dashed border-line ">
            <Calendar className="w-9 h-9 mx-auto mb-2 text-ink-muted/70 " />
            <p className="text-sm text-ink-muted ">Sem reuniões ainda</p>
            <p className="text-xs text-ink-muted  mt-1">Clique em "Nova reunião" para criar a primeira</p>
          </div>
        ) : (
          <div className="space-y-4">
            {reunioes.map((g) => (
              <div key={g.id} className="rounded-xl border border-line  bg-surface-raised  p-4">
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div className="min-w-0">
                    <h3 className="font-semibold text-ink  truncate">{g.titulo}</h3>
                    <div className="flex items-center gap-2 mt-0.5 text-xs text-ink-muted ">
                      <Calendar className="w-3.5 h-3.5" />
                      <span>{g.data ? fmtDate(g.data) : (g.semana_iso || '—')}</span>
                      {g.notas ? <span className="truncate">· {g.notas}</span> : null}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <label
                      title="Carregar documentos"
                      className="p-2 rounded-lg text-ink-muted hover:text-ink hover:bg-surface-muted transition-colors cursor-pointer"
                    >
                      {uploadingId === g.id
                        ? <Loader2 className="w-4 h-4 animate-spin text-accent-ink" />
                        : <Upload className="w-4 h-4" />}
                      <input
                        type="file"
                        multiple
                        accept=".pdf,.pptx,.ppt,.docx,.doc,.xlsx,.xls"
                        className="hidden"
                        disabled={uploadingId === g.id}
                        onChange={e => { uploadFicheiros(g.id, e.target.files); e.target.value = '' }}
                      />
                    </label>
                    <button
                      onClick={() => editarReuniao(g)}
                      title="Editar reunião"
                      className="p-2 rounded-lg text-ink-muted hover:text-ink  hover:bg-surface-muted  transition-colors"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => apagarReuniao(g.id)}
                      title="Eliminar reunião"
                      className="p-2 rounded-lg text-ink-muted hover:text-danger hover:bg-danger/10 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {g.ficheiros.length === 0 ? (
                  <p className="text-xs text-ink-muted  italic py-2">
                    Sem documentos. Use o botão de upload para adicionar PDF/PowerPoint.
                  </p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {g.ficheiros.map((f) => (
                      <div
                        key={f.nome}
                        className="group flex items-center gap-2 p-3 min-w-0 rounded-xl border border-line  bg-surface  hover:border-ink/20 transition-colors duration-fast"
                      >
                        <button
                          onClick={() => f.url && window.open(f.url, '_blank', 'noopener')}
                          disabled={!f.url}
                          className="flex items-center gap-3 flex-1 min-w-0 text-left disabled:opacity-50"
                        >
                          <div className="p-2 rounded-lg shrink-0 bg-surface-muted">
                            {f.ext === 'pptx' || f.ext === 'ppt'
                              ? <Presentation className="w-4 h-4 text-ink-muted" />
                              : <FileText className="w-4 h-4 text-ink-muted" />}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium text-ink  truncate">{f.nome}</p>
                            <p className="text-xs text-ink-muted">{f.ext.toUpperCase()}{f.tamanho ? ` · ${fmtSize(f.tamanho)}` : ''}</p>
                          </div>
                          <FileDown className="w-4 h-4 text-ink-muted/70 group-hover:text-ink transition-colors shrink-0" />
                        </button>
                        <button
                          onClick={() => apagarFicheiro(g.id, f.nome)}
                          title="Eliminar documento"
                          className="p-2 rounded-lg text-ink-muted/70 hover:text-danger hover:bg-danger/10 transition-colors shrink-0"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Action bar */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
          <div>
            <h2 className="text-lg font-semibold text-ink ">Relatórios Semanais</h2>
            <p className="text-sm text-ink-muted ">Gerados a partir de reuniões com título "Reunião Semanal"</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={sincronizarFireflies}
              disabled={syncing}
              title="Cria/atualiza relatórios de todas as semanas com reuniões 'Reunião Semanal'"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-colors duration-fast disabled:opacity-50 bg-surface-raised text-ink border border-line hover:bg-surface-muted hover:border-ink/20"
            >
              {syncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
              {syncing ? 'A sincronizar...' : 'Sincronizar Fireflies'}
            </button>
            <button
              onClick={() => setShowForm(s => !s)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-[background-color,border-color,color,box-shadow,opacity,transform] bg-accent text-accent-foreground hover:brightness-[1.04]"
            >
              <Plus className="w-4 h-4" />
              Gerar relatório
            </button>
          </div>
        </div>

        {syncStatus && (
          <div className="mb-4 rounded-xl border border-success/30 bg-success/10 p-3 text-sm text-success">
            Sincronização concluída: {syncStatus}
          </div>
        )}

        {/* Form */}
        {showForm && (
          <div className="mb-6 rounded-2xl border border-line  bg-surface-raised  p-5">
            <div className="flex items-start gap-3 mb-4">
              <div className="p-2 rounded-lg bg-surface-muted">
                <Sparkles className="w-5 h-5 text-ink-muted" />
              </div>
              <div>
                <h3 className="font-semibold text-ink ">Gerar relatório semanal</h3>
                <p className="text-xs text-ink-muted ">
                  Compila todas as reuniões com título "Reunião Semanal" da semana indicada e produz um relatório executivo via Claude Sonnet 4 (~€0,10).
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="text-xs text-ink-muted  block mb-1">Semana ISO</label>
                <input
                  type="text"
                  value={form.semana_iso}
                  onChange={e => setForm(f => ({ ...f, semana_iso: e.target.value }))}
                  placeholder="2026-W18"
                  className="w-full border border-line bg-surface-raised text-ink rounded-lg px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="text-xs text-ink-muted  block mb-1">Data início (opcional)</label>
                <input
                  type="date"
                  value={form.data_inicio || ''}
                  onChange={e => setForm(f => ({ ...f, data_inicio: e.target.value }))}
                  className="w-full border border-line bg-surface-raised text-ink rounded-lg px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="text-xs text-ink-muted  block mb-1">Data fim (opcional)</label>
                <input
                  type="date"
                  value={form.data_fim || ''}
                  onChange={e => setForm(f => ({ ...f, data_fim: e.target.value }))}
                  className="w-full border border-line bg-surface-raised text-ink rounded-lg px-3 py-2 text-sm"
                />
              </div>
            </div>

            <div className="flex items-center gap-2 mt-4">
              <input
                type="checkbox"
                id="regenerar"
                checked={form.regenerar}
                onChange={e => setForm(f => ({ ...f, regenerar: e.target.checked }))}
                className="rounded"
              />
              <label htmlFor="regenerar" className="text-xs text-ink-muted ">
                Regenerar (sobrescreve relatório existente da mesma semana)
              </label>
            </div>

            <div className="flex justify-end gap-2 mt-5">
              <button
                onClick={() => setShowForm(false)}
                className="px-4 py-2 rounded-lg text-sm text-ink-muted  hover:bg-surface-muted "
                disabled={generating}
              >
                Cancelar
              </button>
              <button
                onClick={gerar}
                disabled={generating || !form.semana_iso}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50 bg-accent text-accent-foreground hover:brightness-[1.04]"
              >
                {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                {generating ? 'A gerar via Claude...' : 'Gerar agora'}
              </button>
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <ErrorState compact className="mb-6" title="Não foi possível carregar os relatórios" error={error} onRetry={load} />
        )}

        {/* Lista */}
        {loading ? (
          <div className="text-center py-16 text-ink-muted ">
            <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
            A carregar...
          </div>
        ) : relatorios.length === 0 ? (
          <div className="text-center py-16 rounded-2xl border-2 border-dashed border-line ">
            <Calendar className="w-12 h-12 mx-auto mb-3 text-ink-muted/70 " />
            <p className="text-ink-muted  font-medium">Sem relatórios semanais gerados ainda</p>
            <p className="text-xs text-ink-muted  mt-1">Clique em "Gerar relatório" para criar o primeiro a partir das reuniões da semana</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {relatorios.map(r => {
              const reuniaoIds = (() => { try { return JSON.parse(r.reuniao_ids || '[]') } catch { return [] } })()
              return (
                <div
                  key={r.id}
                  className="rounded-2xl border border-line  bg-surface-raised  p-5 flex flex-col gap-3 hover:shadow-md transition-shadow"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="text-overline uppercase font-semibold text-ink-muted num">
                        {r.semana_iso}
                      </div>
                      <h3 className="font-semibold text-ink  mt-1 truncate">
                        {r.titulo}
                      </h3>
                      <p className="text-xs text-ink-muted  truncate">{r.subtitulo}</p>
                    </div>
                    <button
                      onClick={() => eliminar(r.id)}
                      title="Eliminar"
                      className="p-1.5 rounded-lg text-ink-muted hover:text-danger hover:bg-danger/10 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <div className="flex items-center gap-2 text-xs text-ink-muted ">
                    <Calendar className="w-3.5 h-3.5" />
                    <span>{fmtRange(r.data_inicio, r.data_fim)}</span>
                  </div>

                  <div className="flex items-center gap-3 text-xs text-ink-muted ">
                    <span>{reuniaoIds.length} reunião(ões)</span>
                    <span>·</span>
                    <span>Criado {fmtDate(r.created_at)}</span>
                  </div>

                  <div className="pt-2 border-t border-line  flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => abrirPdf(r.id)}
                        title="Abrir o PDF numa nova aba"
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-line text-ink-muted hover:bg-surface-muted transition-colors"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        Ver
                      </button>
                      <button
                        onClick={() => abrirPdf(r.id, { download: true })}
                        title="Descarregar o PDF"
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-line text-ink-muted hover:bg-surface-muted transition-colors"
                      >
                        <FileDown className="w-3.5 h-3.5" />
                        Download
                      </button>
                    </div>
                    <button
                      onClick={async () => {
                        setGenerating(true)
                        try {
                          const res = await apiFetch('/api/crm/relatorios-semanais/gerar', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ semana_iso: r.semana_iso, regenerar: true }),
                          })
                          if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Não foi possível regenerar o relatório.')
                          toast('Relatório regenerado.', 'success')
                          await load()
                        } catch (e) { toast(friendlyError(e.message), 'error') }
                        setGenerating(false)
                      }}
                      title="Regenerar via Claude"
                      className="p-1.5 rounded-lg text-ink-muted hover:text-ink  hover:bg-surface-muted  transition-colors"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
    </>
  )
}



// ════════════════════════════════════════════════════════════════
// Separadores: Relatórios Administrativos (existente) | Relatórios Conversas
// ════════════════════════════════════════════════════════════════
export function RelatoriosAdmin() {
  const [tab, setTab] = useState('administrativos')
  return (
    <div className="space-y-4">
      <Tabs
        variant="segmented"
        items={[
          { key: 'administrativos', label: 'Relatórios Administrativos', icon: FileText },
          { key: 'conversas', label: 'Relatórios Conversas', icon: MessageSquareText },
        ]}
        value={tab}
        onChange={setTab}
      />
      {tab === 'administrativos' ? <RelatoriosAdministrativos /> : <RelatoriosConversas />}
    </div>
  )
}

// Relatórios gerados automaticamente a partir das conversas WhatsApp da
// comunidade (pipeline no Mac, sexta 04:00): 1 PDF de tarefas pendentes +
// 1 PDF por grupo com actividade na semana.
function nomeDocumento(nome) {
  return nome.replace(/\.pdf$/i, '').replace(/^00_/, '').replace(/_-_/g, ' - ').replace(/_/g, ' ')
}

function semanaLabel(fimISO) {
  const fim = new Date(fimISO + 'T00:00:00')
  const ini = new Date(fim); ini.setDate(ini.getDate() - 7)
  const f = d => d.toLocaleDateString('pt-PT', { day: '2-digit', month: 'short' })
  return `${f(ini)} — ${f(fim)} ${fim.getFullYear()}`
}

function RelatoriosConversas() {
  const [semanas, setSemanas] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const r = await apiFetch('/api/crm/relatorios-conversas')
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || 'Falha ao carregar')
      setSemanas(Array.isArray(j) ? j : [])
    } catch (e) { setError(e) }
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm text-ink-muted ">
          Gerados automaticamente todas as sextas-feiras às 04:00 a partir das conversas WhatsApp da comunidade
          (texto e áudios): resumo executivo, tarefas pendentes e um anexo por grupo com actividade. As tarefas
          entram em <span className="font-semibold">Agenda &rsaquo; Tarefas</span> com o estado "A fazer".
        </p>
        <button onClick={load} className="p-2 rounded-lg border border-line text-ink-muted hover:text-ink hover:bg-surface-muted transition-colors duration-fast" title="Atualizar" aria-label="Atualizar">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>
      {error && <ErrorState compact title="Não foi possível carregar os relatórios de conversas" error={error} onRetry={load} />}
      {loading ? (
        <div className="flex items-center gap-2 text-sm text-ink-muted"><Loader2 className="w-4 h-4 animate-spin" /> A carregar…</div>
      ) : !semanas.length ? (
        <p className="text-sm text-ink-muted">Ainda não há relatórios de conversas.</p>
      ) : semanas.map(s => {
        const principais = s.ficheiros.filter(f => /^0\d_/.test(f.nome))
        const grupos = s.ficheiros.filter(f => !/^0\d_/.test(f.nome))
        return (
          <div key={s.semana} className="rounded-xl border border-line  bg-surface-raised  p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-base font-semibold text-ink ">Semana {semanaLabel(s.semana)}</h3>
              <span className="text-xs text-ink-muted">{grupos.length} {grupos.length === 1 ? 'grupo' : 'grupos'}</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-3">
              {principais.map(f => {
                const exec = /Resumo_executivo/i.test(f.nome)
                const Icon = exec ? FileText : ListChecks
                return (
                  <a key={f.nome} href={f.url || '#'} target="_blank" rel="noreferrer"
                    className="flex items-center gap-2 px-3 py-2 rounded-lg border border-line bg-surface text-sm font-semibold text-ink hover:bg-surface-muted transition-colors duration-fast">
                    <Icon className="w-4 h-4 text-ink-muted" /> {exec ? 'Resumo executivo' : 'Tarefas pendentes'}
                    <ExternalLink className="w-3.5 h-3.5 ml-auto text-ink-muted" />
                  </a>
                )
              })}
            </div>
            {grupos.length > 0 && <p className="text-xs uppercase tracking-wide text-ink-muted mb-1.5">Anexos por grupo</p>}
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {grupos.map(f => (
                <a key={f.nome} href={f.url || '#'} target="_blank" rel="noreferrer"
                  className="flex items-center gap-2 px-3 py-2 rounded-lg border border-line  text-sm text-ink hover:border-ink/20 hover:bg-surface-muted transition-colors duration-fast">
                  <FileText className="w-4 h-4 text-ink-muted shrink-0" />
                  <span className="truncate">{nomeDocumento(f.nome)}</span>
                  <span className="ml-auto text-xs text-ink-muted shrink-0">{fmtSize(f.tamanho)}</span>
                </a>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}
