/**
 * Janela para agendar o próximo passo de um imóvel com data e hora: a próxima
 * chamada ou a visita. Cria a tarefa que segue para o Google Calendar (a
 * visita fica também no registo de visitas do imóvel).
 *
 * onAntes (opcional): corre antes de agendar, por exemplo a mudança de fase no
 * Kanban. Se devolver false, não agenda.
 */
import { useEffect, useState } from 'react'
import { apiFetch } from '../../lib/api.js'

const inputClass = 'w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-300'

function emHoras(h) {
  const d = new Date(Date.now() + h * 3600000)
  d.setMinutes(0, 0, 0)
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset())
  return d.toISOString().slice(0, 16)
}
function paraLocal(iso) {
  const d = new Date(iso)
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset())
  return d.toISOString().slice(0, 16)
}

const TEXTO = {
  chamada: { titulo: 'Próxima chamada', ajuda: 'Cria uma tarefa na agenda para voltar a ligar.', feito: 'Chamada agendada' },
  visita: { titulo: 'Marcar visita', ajuda: 'Fica no registo de visitas do imóvel e cria a tarefa na agenda.', feito: 'Visita marcada' },
}

export function AgendarPassoModal({ imovel, tipo, destino, onAntes, onCancel, onDone }) {
  const [quando, setQuando] = useState(emHoras(tipo === 'chamada' ? 24 : 48))
  const [visitaAgendada, setVisitaAgendada] = useState(null)
  const [saving, setSaving] = useState(false)
  const [erro, setErro] = useState('')
  const t = TEXTO[tipo]

  // Se já há uma visita agendada, remarca-a em vez de criar outra. Visitas com
  // investidor não contam.
  useEffect(() => {
    if (tipo !== 'visita' || !imovel?.id) return
    apiFetch(`/api/crm/imoveis/${imovel.id}/visitas`).then(r => r.ok ? r.json() : []).then(lista => {
      const ag = (lista || []).filter(x => x.estado === 'agendada' && !x.investidorId)
        .sort((a, b) => String(b.dataHora || '').localeCompare(String(a.dataHora || '')))[0]
      if (ag) { setVisitaAgendada(ag); if (ag.dataHora) setQuando(paraLocal(ag.dataHora)) }
    }).catch(() => {})
  }, [imovel?.id, tipo])

  async function confirmar() {
    if (!quando) return setErro('Indica a data e a hora.')
    setErro(''); setSaving(true)
    try {
      if (onAntes && (await onAntes()) === false) return
      const iso = new Date(quando).toISOString()
      const r = tipo === 'chamada'
        ? await apiFetch(`/api/crm/imoveis/${imovel.id}/proximos-passos`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tipo: 'chamada', quando: iso }),
          })
        : await apiFetch(visitaAgendada ? `/api/crm/visitas/${visitaAgendada.id}` : '/api/crm/visitas', {
            method: visitaAgendada ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ imovel_id: imovel.id, data_hora: iso, estado: 'agendada' }),
          })
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'Erro ao agendar')
      const quandoTxt = new Date(quando).toLocaleString('pt-PT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
      onDone?.(`${t.feito} para ${quandoTxt}`)
    } catch (e) {
      setErro(e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center backdrop-blur-sm p-4" onClick={onCancel}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6" onClick={e => e.stopPropagation()}>
        <h3 className="text-lg font-bold text-gray-800 mb-1">{destino ? `Mover para ${destino}` : t.titulo}</h3>
        <p className="text-xs text-gray-500 mb-4">{imovel?.nome ? `Imóvel: ${imovel.nome}. ` : ''}{t.ajuda}</p>
        <label className="text-xs font-medium text-gray-600 block mb-1">
          {tipo === 'chamada' ? 'Data e hora da próxima tentativa' : visitaAgendada ? 'Data e hora da visita (remarcar)' : 'Data e hora da visita'}
        </label>
        <input type="datetime-local" className={inputClass} value={quando} onChange={e => setQuando(e.target.value)} />
        {tipo === 'chamada' && (
          <div className="flex gap-1.5 mt-2">
            {[24, 72].map(h => (
              <button key={h} type="button" onClick={() => setQuando(emHoras(h))}
                className="px-2.5 py-1 text-xs rounded-full border border-gray-200 text-gray-600 hover:bg-gray-50">
                Daqui a {h}h
              </button>
            ))}
          </div>
        )}
        {erro && <p className="text-xs text-red-600 mt-3">{erro}</p>}
        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onCancel} disabled={saving}
            className="px-4 py-2 text-sm font-medium rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-50">
            Cancelar
          </button>
          <button onClick={confirmar} disabled={saving}
            className="px-4 py-2 text-sm font-medium rounded-lg text-white disabled:opacity-50" style={{ backgroundColor: '#C9A84C' }}>
            {saving ? 'A guardar…' : destino ? 'Agendar e mover' : 'Agendar'}
          </button>
        </div>
      </div>
    </div>
  )
}
