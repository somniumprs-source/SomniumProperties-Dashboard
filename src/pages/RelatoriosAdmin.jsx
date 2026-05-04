import { useState, useEffect, useCallback } from 'react'
import { Header } from '../components/layout/Header.jsx'
import { FileDown, Sparkles, Trash2, Calendar, Loader2, Plus, RefreshCw, Zap } from 'lucide-react'
import { apiFetch, getToken } from '../lib/api.js'

const GOLD = '#C9A84C'

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

export function RelatoriosAdmin() {
  const [relatorios, setRelatorios] = useState([])
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [syncStatus, setSyncStatus] = useState(null)
  const [error, setError] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ semana_iso: currentSemanaIso(), regenerar: false })

  const load = useCallback(async () => {
    try {
      setLoading(true)
      const r = await apiFetch('/api/crm/relatorios-semanais')
      const data = await r.json()
      setRelatorios(Array.isArray(data) ? data : [])
      setError(null)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  async function gerar() {
    setGenerating(true)
    setError(null)
    try {
      const r = await apiFetch('/api/crm/relatorios-semanais/gerar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await r.json()
      if (!r.ok) throw new Error(data.error || 'Erro ao gerar relatório')
      setShowForm(false)
      await load()
      if (data.id) {
        const token = await getToken()
        window.open(`/api/crm/relatorios-semanais/${data.id}/pdf?token=${token}`, '_blank')
      }
    } catch (e) {
      setError(e.message)
    }
    setGenerating(false)
  }

  async function sincronizarFireflies() {
    setSyncing(true)
    setError(null)
    setSyncStatus(null)
    try {
      const r = await apiFetch('/api/crm/relatorios-semanais/auto-gerar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apenas_pendentes: false }),
      })
      const data = await r.json()
      if (!r.ok) throw new Error(data.error || 'Erro ao sincronizar')
      setSyncStatus(`${data.criados} criados · ${data.actualizados} actualizados · €${data.custoEur.toFixed(2)} (${data.semanasProcessadas} semanas)`)
      await load()
    } catch (e) {
      setError(e.message)
    }
    setSyncing(false)
  }

  async function abrirPdf(id) {
    const token = await getToken()
    window.open(`/api/crm/relatorios-semanais/${id}/pdf?token=${token}`, '_blank')
  }

  async function eliminar(id) {
    if (!confirm('Eliminar este relatório semanal?')) return
    try {
      await apiFetch(`/api/crm/relatorios-semanais/${id}`, { method: 'DELETE' })
      await load()
    } catch (e) { alert(e.message) }
  }

  return (
    <div className="flex-1 flex flex-col bg-neutral-50 dark:bg-neutral-950 min-h-screen">
      <Header
        title="Relatórios Administração"
        subtitle="Sínteses executivas semanais geradas a partir das reuniões internas"
        onRefresh={load}
        loading={loading}
      />

      <main className="flex-1 px-4 sm:px-7 py-5 sm:py-7 max-w-7xl w-full mx-auto">
        {/* Action bar */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
          <div>
            <h2 className="text-lg font-semibold text-neutral-800 dark:text-neutral-100">Relatórios Semanais</h2>
            <p className="text-sm text-neutral-500 dark:text-neutral-400">Gerados a partir de reuniões com título "Reunião Semanal"</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={sincronizarFireflies}
              disabled={syncing}
              title="Cria/actualiza relatórios de todas as semanas com reuniões 'Reunião Semanal'"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium border transition-all disabled:opacity-50"
              style={{ borderColor: GOLD, color: GOLD }}
            >
              {syncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
              {syncing ? 'A sincronizar...' : 'Sincronizar Fireflies'}
            </button>
            <button
              onClick={() => setShowForm(s => !s)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all"
              style={{ backgroundColor: GOLD, color: '#0d0d0d' }}
            >
              <Plus className="w-4 h-4" />
              Gerar relatório
            </button>
          </div>
        </div>

        {syncStatus && (
          <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 dark:bg-emerald-900/20 dark:border-emerald-900 p-3 text-sm text-emerald-700 dark:text-emerald-300">
            Sincronização concluída: {syncStatus}
          </div>
        )}

        {/* Form */}
        {showForm && (
          <div className="mb-6 rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-5">
            <div className="flex items-start gap-3 mb-4">
              <div className="p-2 rounded-lg" style={{ backgroundColor: 'rgba(201,168,76,0.12)' }}>
                <Sparkles className="w-5 h-5" style={{ color: GOLD }} />
              </div>
              <div>
                <h3 className="font-semibold text-neutral-800 dark:text-neutral-100">Gerar Relatório Semanal</h3>
                <p className="text-xs text-neutral-500 dark:text-neutral-400">
                  Compila todas as reuniões com título "Reunião Semanal" da semana indicada e produz um relatório executivo via Claude Sonnet 4 (~€0,10).
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="text-xs text-neutral-500 dark:text-neutral-400 block mb-1">Semana ISO</label>
                <input
                  type="text"
                  value={form.semana_iso}
                  onChange={e => setForm(f => ({ ...f, semana_iso: e.target.value }))}
                  placeholder="2026-W18"
                  className="w-full border border-neutral-200 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100 rounded-lg px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="text-xs text-neutral-500 dark:text-neutral-400 block mb-1">Data início (opcional)</label>
                <input
                  type="date"
                  value={form.data_inicio || ''}
                  onChange={e => setForm(f => ({ ...f, data_inicio: e.target.value }))}
                  className="w-full border border-neutral-200 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100 rounded-lg px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="text-xs text-neutral-500 dark:text-neutral-400 block mb-1">Data fim (opcional)</label>
                <input
                  type="date"
                  value={form.data_fim || ''}
                  onChange={e => setForm(f => ({ ...f, data_fim: e.target.value }))}
                  className="w-full border border-neutral-200 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100 rounded-lg px-3 py-2 text-sm"
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
              <label htmlFor="regenerar" className="text-xs text-neutral-600 dark:text-neutral-400">
                Regenerar (sobrescreve relatório existente da mesma semana)
              </label>
            </div>

            <div className="flex justify-end gap-2 mt-5">
              <button
                onClick={() => setShowForm(false)}
                className="px-4 py-2 rounded-lg text-sm text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800"
                disabled={generating}
              >
                Cancelar
              </button>
              <button
                onClick={gerar}
                disabled={generating || !form.semana_iso}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50"
                style={{ backgroundColor: GOLD, color: '#0d0d0d' }}
              >
                {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                {generating ? 'A gerar via Claude...' : 'Gerar agora'}
              </button>
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="mb-6 rounded-xl border border-red-200 bg-red-50 dark:bg-red-900/20 dark:border-red-900 p-4 text-sm text-red-700 dark:text-red-300">
            {error}
          </div>
        )}

        {/* Lista */}
        {loading ? (
          <div className="text-center py-16 text-neutral-400 dark:text-neutral-600">
            <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
            A carregar...
          </div>
        ) : relatorios.length === 0 ? (
          <div className="text-center py-16 rounded-2xl border-2 border-dashed border-neutral-200 dark:border-neutral-800">
            <Calendar className="w-12 h-12 mx-auto mb-3 text-neutral-300 dark:text-neutral-700" />
            <p className="text-neutral-500 dark:text-neutral-400 font-medium">Sem relatórios semanais gerados ainda</p>
            <p className="text-xs text-neutral-400 dark:text-neutral-500 mt-1">Clique em "Gerar relatório" para criar o primeiro a partir das reuniões da semana</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {relatorios.map(r => {
              const reuniaoIds = (() => { try { return JSON.parse(r.reuniao_ids || '[]') } catch { return [] } })()
              return (
                <div
                  key={r.id}
                  className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-5 flex flex-col gap-3 hover:shadow-md transition-shadow"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: GOLD }}>
                        {r.semana_iso}
                      </div>
                      <h3 className="font-semibold text-neutral-800 dark:text-neutral-100 mt-1 truncate">
                        {r.titulo}
                      </h3>
                      <p className="text-xs text-neutral-500 dark:text-neutral-400 truncate">{r.subtitulo}</p>
                    </div>
                    <button
                      onClick={() => eliminar(r.id)}
                      title="Eliminar"
                      className="p-1.5 rounded-lg text-neutral-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <div className="flex items-center gap-2 text-xs text-neutral-500 dark:text-neutral-400">
                    <Calendar className="w-3.5 h-3.5" />
                    <span>{fmtRange(r.data_inicio, r.data_fim)}</span>
                  </div>

                  <div className="flex items-center gap-3 text-xs text-neutral-400 dark:text-neutral-500">
                    <span>{reuniaoIds.length} reunião(ões)</span>
                    <span>·</span>
                    <span>Criado {fmtDate(r.created_at)}</span>
                  </div>

                  <div className="pt-2 border-t border-neutral-100 dark:border-neutral-800 flex items-center justify-between">
                    <button
                      onClick={() => abrirPdf(r.id)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors"
                      style={{ borderColor: GOLD, color: GOLD }}
                    >
                      <FileDown className="w-3.5 h-3.5" />
                      Abrir PDF
                    </button>
                    <button
                      onClick={async () => {
                        setGenerating(true)
                        try {
                          await apiFetch('/api/crm/relatorios-semanais/gerar', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ semana_iso: r.semana_iso, regenerar: true }),
                          })
                          await load()
                        } catch (e) { alert(e.message) }
                        setGenerating(false)
                      }}
                      title="Regenerar via Claude"
                      className="p-1.5 rounded-lg text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </main>
    </div>
  )
}
