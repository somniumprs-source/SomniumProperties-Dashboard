/**
 * Tab de interacções para o painel de detalhe de Consultores.
 * Lista cronológica + formulário inline para adicionar novas entradas.
 * Calcula tempo de resposta entre pares Enviado → Resposta.
 */
import { useState, useEffect } from 'react'
import { Phone, MessageCircle, ArrowUpRight, ArrowDownLeft, Plus, Clock } from 'lucide-react'
import { apiFetch } from '../../lib/api.js'
import { fmtDate } from '../../constants.js'

const CANAL_ICON = { Chamada: Phone, WhatsApp: MessageCircle }
const DIRECAO_ICON = { Enviado: ArrowUpRight, Resposta: ArrowDownLeft }
const DIRECAO_COLOR = {
  Enviado: 'text-blue-600 bg-blue-50',
  Resposta: 'text-green-600 bg-green-50',
}

function formatHoras(h) {
  if (h == null) return '—'
  if (h < 1) return `${Math.round(h * 60)}min`
  if (h < 24) return `${Math.round(h)}h`
  return `${Math.round(h / 24)}d ${Math.round(h % 24)}h`
}

export function InteracoesTab({ consultorId, onUpdate }) {
  const [interacoes, setInteracoes] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ canal: 'Chamada', direcao: 'Enviado', notas: '', data_hora: '' })
  const [saving, setSaving] = useState(false)

  async function load() {
    setLoading(true)
    try {
      const r = await apiFetch(`/api/crm/consultores/${consultorId}/interacoes`)
      const data = await r.json()
      setInteracoes(Array.isArray(data) ? data : [])
    } catch { setInteracoes([]) }
    setLoading(false)
  }

  useEffect(() => { if (consultorId) load() }, [consultorId])

  async function handleSubmit(e) {
    e.preventDefault()
    setSaving(true)
    try {
      await apiFetch('/api/crm/consultor-interacoes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          consultor_id: consultorId,
          canal: form.canal,
          direcao: form.direcao,
          notas: form.notas || null,
          data_hora: form.data_hora || new Date().toISOString(),
        }),
      })
      setForm({ canal: 'Chamada', direcao: 'Enviado', notas: '', data_hora: '' })
      setShowForm(false)
      await load()
      if (onUpdate) onUpdate()
    } catch {}
    setSaving(false)
  }

  // Calcular tempos de resposta entre pares Enviado → Resposta
  const sorted = [...interacoes].sort((a, b) => new Date(a.data_hora) - new Date(b.data_hora))
  const tempoRespostaMap = {}
  for (let i = 0; i < sorted.length; i++) {
    if (sorted[i].direcao === 'Enviado') {
      const resp = sorted.slice(i + 1).find(x => x.direcao === 'Resposta')
      if (resp) {
        const horas = (new Date(resp.data_hora) - new Date(sorted[i].data_hora)) / 3600000
        tempoRespostaMap[resp.id] = horas
      }
    }
  }

  // Tempo médio
  const temposResposta = Object.values(tempoRespostaMap)
  const tempoMedio = temposResposta.length > 0
    ? temposResposta.reduce((a, b) => a + b, 0) / temposResposta.length
    : null

  const inputClass = 'w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300'

  return (
    <div className="space-y-4">
      {/* Header + stats */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h3 className="text-sm font-semibold text-gray-700">Interacções ({interacoes.length})</h3>
          {tempoMedio != null && (
            <div className="flex items-center gap-1.5 text-xs text-gray-500">
              <Clock className="w-3.5 h-3.5" />
              <span>Tempo médio resposta: <strong className="text-gray-700">{formatHoras(tempoMedio)}</strong></span>
            </div>
          )}
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 transition-colors"
        >
          <Plus className="w-3.5 h-3.5" /> Nova Interacção
        </button>
      </div>

      {/* Form */}
      {showForm && (
        <form onSubmit={handleSubmit} className="bg-gray-50 rounded-xl p-4 space-y-3 border border-gray-200">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Canal</label>
              <select value={form.canal} onChange={e => setForm(p => ({ ...p, canal: e.target.value }))} className={inputClass}>
                <option value="Chamada">Chamada</option>
                <option value="WhatsApp">WhatsApp</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Direcção</label>
              <select value={form.direcao} onChange={e => setForm(p => ({ ...p, direcao: e.target.value }))} className={inputClass}>
                <option value="Enviado">Enviado por nós</option>
                <option value="Resposta">Resposta do consultor</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Data/Hora</label>
              <input
                type="datetime-local"
                value={form.data_hora}
                onChange={e => setForm(p => ({ ...p, data_hora: e.target.value }))}
                className={inputClass}
                placeholder="Agora (se vazio)"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Notas</label>
            <textarea
              value={form.notas}
              onChange={e => setForm(p => ({ ...p, notas: e.target.value }))}
              rows={2}
              className={inputClass}
              placeholder="Notas livres..."
            />
          </div>
          <div className="flex gap-2">
            <button type="submit" disabled={saving} className="px-4 py-2 bg-indigo-600 text-white text-xs font-medium rounded-lg hover:bg-indigo-700">
              {saving ? 'A guardar...' : 'Registar'}
            </button>
            <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 bg-gray-100 text-gray-600 text-xs font-medium rounded-lg hover:bg-gray-200">
              Cancelar
            </button>
          </div>
        </form>
      )}

      {/* Lista */}
      {loading ? (
        <div className="text-center py-8 text-gray-400 text-sm">A carregar...</div>
      ) : interacoes.length === 0 ? (
        <div className="text-center py-8 text-gray-400 text-sm">Sem interacções registadas</div>
      ) : (
        <div className="space-y-2">
          {interacoes.map(i => {
            const CanalIcon = CANAL_ICON[i.canal] || Phone
            const DirecaoIcon = DIRECAO_ICON[i.direcao] || ArrowUpRight
            const dirColor = DIRECAO_COLOR[i.direcao] || 'text-gray-600 bg-gray-50'
            const tempoResp = tempoRespostaMap[i.id]
            const dataHora = i.data_hora ? new Date(i.data_hora) : null
            const dataStr = dataHora
              ? `${dataHora.toLocaleDateString('pt-PT')} ${dataHora.toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' })}`
              : '—'

            return (
              <div key={i.id} className="flex items-start gap-3 p-3 bg-white rounded-lg border border-gray-100 hover:border-gray-200 transition-colors">
                <div className={`flex items-center justify-center w-8 h-8 rounded-full shrink-0 ${dirColor}`}>
                  <DirecaoIcon className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${dirColor}`}>
                      <CanalIcon className="w-3 h-3" />
                      {i.canal} — {i.direcao === 'Enviado' ? 'Enviado por nós' : 'Resposta do consultor'}
                    </span>
                    {tempoResp != null && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-purple-50 text-purple-600">
                        <Clock className="w-3 h-3" />
                        Respondeu em {formatHoras(tempoResp)}
                      </span>
                    )}
                  </div>
                  {i.notas && <p className="text-sm text-gray-600 mt-1">{i.notas}</p>}
                  <p className="text-xs text-gray-400 mt-1">{dataStr}</p>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
