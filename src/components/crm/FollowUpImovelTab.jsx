/**
 * Aba "Follow Up" do imóvel: define a data (e motivo) do próximo follow-up.
 * Ao gravar, o backend agenda logo uma tarefa 'A fazer' para esse dia
 * (agendarFollowUpImovel em agendaEngine) — ou move a que já estiver por
 * fazer, em vez de criar outra. Em baixo fica o histórico dessas tarefas.
 */
import { useState, useEffect, useCallback } from 'react'
import { CalendarClock, CheckCircle2, Clock, Loader2 } from 'lucide-react'
import { apiFetch } from '../../lib/api.js'

const inputClass = 'w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-300'

const fmtData = d => {
  if (!d) return '—'
  const s = String(d).slice(0, 10)
  const [y, m, dia] = s.split('-')
  return y && m && dia ? `${dia}/${m}/${y}` : s
}

export function FollowUpImovelTab({ imovelId, onUpdate, toast }) {
  const [info, setInfo] = useState({ data_follow_up: null, motivo_follow_up: null, tarefas: [] })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ data: '', motivo: '' })

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await apiFetch(`/api/crm/imoveis/${imovelId}/follow-up`)
      if (!r.ok) throw new Error()
      const d = await r.json()
      setInfo({ ...d, tarefas: Array.isArray(d?.tarefas) ? d.tarefas : [] })
      setForm({ data: (d?.data_follow_up || '').slice(0, 10), motivo: d?.motivo_follow_up || '' })
    } catch {
      setInfo({ data_follow_up: null, motivo_follow_up: null, tarefas: [] })
    }
    setLoading(false)
  }, [imovelId])

  useEffect(() => { if (imovelId) load() }, [imovelId, load])

  async function agendar(e) {
    e.preventDefault()
    if (!form.data) { toast?.('Escolhe a data do follow-up', 'error'); return }
    setSaving(true)
    try {
      const r = await apiFetch(`/api/crm/imoveis/${imovelId}/follow-up`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: form.data, motivo: form.motivo }),
      })
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'Erro ao agendar')
      toast?.(`Follow-up agendado para ${fmtData(form.data)} — tarefa "A fazer" criada`, 'success')
      await load()
      onUpdate?.()
    } catch (err) {
      toast?.(err.message, 'error')
    }
    setSaving(false)
  }

  if (loading) return <div className="p-6 text-sm text-gray-400">A carregar...</div>

  const aberta = info.tarefas.find(t => t.status !== 'Concluída')
  const alterado = form.data !== (info.data_follow_up || '').slice(0, 10) || (form.motivo || '') !== (info.motivo_follow_up || '')

  return (
    <div className="p-4 sm:p-6 space-y-5">
      <div>
        <h3 className="text-sm font-bold text-neutral-800">Follow Up</h3>
        <p className="text-xs text-neutral-400 mt-0.5">
          Define a data do próximo follow-up. Fica automaticamente agendado como tarefa "A fazer" para esse dia.
        </p>
      </div>

      {aberta && (
        <div className="flex items-center gap-3 rounded-xl border px-4 py-3" style={{ borderColor: '#C9A84C55', backgroundColor: '#FEF9E7' }}>
          <CalendarClock className="w-4 h-4 shrink-0" style={{ color: '#C9A84C' }} />
          <p className="text-sm text-neutral-700">
            Próximo follow-up a <strong>{fmtData(aberta.data_limite || aberta.inicio)}</strong>
            <span className="text-neutral-500"> · tarefa {aberta.status}{aberta.funcionario ? ` · ${aberta.funcionario}` : ''}</span>
          </p>
        </div>
      )}

      <form onSubmit={agendar} className="rounded-xl border border-neutral-100 p-4 space-y-3 bg-white">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <label className="block">
            <span className="text-xs font-medium text-neutral-500">Data do Follow Up</span>
            <input type="date" value={form.data} onChange={e => setForm(f => ({ ...f, data: e.target.value }))}
              className={`${inputClass} mt-1`} required />
          </label>
          <label className="block sm:col-span-2">
            <span className="text-xs font-medium text-neutral-500">Motivo</span>
            <input type="text" value={form.motivo} onChange={e => setForm(f => ({ ...f, motivo: e.target.value }))}
              placeholder="Ex: proprietário pediu para voltar a ligar" className={`${inputClass} mt-1`} />
          </label>
        </div>
        <div className="flex justify-end">
          <button type="submit" disabled={saving || !form.data || (!alterado && !!aberta)}
            className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ backgroundColor: '#1A1A1A', color: '#C9A84C' }}>
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CalendarClock className="w-3.5 h-3.5" />}
            {aberta ? 'Reagendar follow-up' : 'Agendar follow-up'}
          </button>
        </div>
      </form>

      <div>
        <h4 className="text-xs font-semibold uppercase tracking-wide text-neutral-400 mb-2">Histórico de tarefas de follow-up</h4>
        {info.tarefas.length === 0 ? (
          <p className="text-sm text-neutral-400">Ainda não há follow-ups agendados para este imóvel.</p>
        ) : (
          <div className="rounded-xl border border-neutral-100 overflow-hidden divide-y divide-neutral-50">
            {info.tarefas.map(t => {
              const feita = t.status === 'Concluída'
              const Icon = feita ? CheckCircle2 : Clock
              return (
                <div key={t.id} className="flex items-center gap-3 px-4 py-2.5 bg-white">
                  <Icon className={`w-4 h-4 shrink-0 ${feita ? 'text-emerald-600' : 'text-amber-500'}`} />
                  <span className="text-sm font-mono text-neutral-700 w-24 shrink-0">{fmtData(t.data_limite || t.inicio)}</span>
                  <span className="text-sm text-neutral-600 flex-1 min-w-0 truncate">{t.tarefa}</span>
                  <span className={`text-[11px] font-medium px-2 py-0.5 rounded ${feita ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
                    {t.status}
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
