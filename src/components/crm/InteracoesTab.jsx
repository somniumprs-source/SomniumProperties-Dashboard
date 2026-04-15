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

export function InteracoesTab({ consultorId, onUpdate, controloManual }) {
  const [interacoes, setInteracoes] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [handoff, setHandoff] = useState(!!controloManual)
  const [togglingAgent, setTogglingAgent] = useState(false)
  const [form, setForm] = useState({ canal: 'WhatsApp', direcao: 'Enviado', notas: '', data_hora: '' })
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
    if (!form.notas?.trim()) return
    setSaving(true)
    try {
      // Se WhatsApp + Enviado → enviar mensagem real pelo Twilio
      if (form.canal === 'WhatsApp' && form.direcao === 'Enviado') {
        const r = await apiFetch(`/api/consultores/${consultorId}/enviar-whatsapp`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mensagem: form.notas.trim() }),
        })
        const data = await r.json()
        if (!r.ok) throw new Error(data.error || 'Erro ao enviar')
      } else {
        // Registo manual (chamada ou resposta recebida)
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
      }
      setForm({ canal: 'WhatsApp', direcao: 'Enviado', notas: '', data_hora: '' })
      setShowForm(false)
      await load()
      if (onUpdate) onUpdate()
    } catch (err) {
      alert(err.message || 'Erro ao enviar')
    }
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

  async function toggleAgent() {
    setTogglingAgent(true)
    try {
      const endpoint = handoff ? 'retomar-agente' : 'handoff'
      await apiFetch(`/api/consultores/${consultorId}/${endpoint}`, { method: 'POST' })
      setHandoff(!handoff)
      if (onUpdate) onUpdate()
    } catch {}
    setTogglingAgent(false)
  }

  return (
    <div className="space-y-4">
      {/* Banner handoff */}
      {handoff && (
        <div className="flex items-center justify-between p-3 bg-amber-50 border border-amber-200 rounded-xl">
          <div>
            <p className="text-sm font-medium text-amber-800">Agente pausado — controlo manual activo</p>
            <p className="text-xs text-amber-600">O agente não responde automaticamente enquanto estiveres em controlo manual.</p>
          </div>
          <button onClick={toggleAgent} disabled={togglingAgent}
            className="px-4 py-2 text-xs font-medium rounded-lg bg-green-600 text-white hover:bg-green-700 transition-colors shrink-0">
            {togglingAgent ? '...' : 'Retomar Agente'}
          </button>
        </div>
      )}
      {!handoff && (
        <div className="flex items-center justify-between p-3 bg-green-50 border border-green-200 rounded-xl">
          <div>
            <p className="text-sm font-medium text-green-800">Agente activo — respostas automáticas ligadas</p>
            <p className="text-xs text-green-600">O agente responde automaticamente às mensagens do consultor.</p>
          </div>
          <button onClick={toggleAgent} disabled={togglingAgent}
            className="px-4 py-2 text-xs font-medium rounded-lg bg-amber-500 text-white hover:bg-amber-600 transition-colors shrink-0">
            {togglingAgent ? '...' : 'Pausar Agente'}
          </button>
        </div>
      )}

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
            <label className="block text-xs text-gray-500 mb-1">
              {form.canal === 'WhatsApp' && form.direcao === 'Enviado' ? 'Mensagem (será enviada pelo WhatsApp)' : 'Notas'}
            </label>
            <textarea
              value={form.notas}
              onChange={e => setForm(p => ({ ...p, notas: e.target.value }))}
              rows={2}
              className={inputClass}
              placeholder="Notas livres..."
            />
          </div>
          <div className="flex gap-2">
            <button type="submit" disabled={saving || !form.notas?.trim()}
              className={`px-4 py-2 text-white text-xs font-medium rounded-lg transition-colors ${
                form.canal === 'WhatsApp' && form.direcao === 'Enviado'
                  ? 'bg-green-600 hover:bg-green-700'
                  : 'bg-indigo-600 hover:bg-indigo-700'
              }`}>
              {saving ? 'A enviar...' : form.canal === 'WhatsApp' && form.direcao === 'Enviado' ? 'Enviar WhatsApp' : 'Registar'}
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
        <div className="space-y-3 bg-gray-50 rounded-xl p-4" style={{ minHeight: '200px' }}>
          {interacoes.map(i => {
            const isEnviado = i.direcao === 'Enviado'
            const isAgente = (i.notas || '').includes('[AGENTE]') || (i.notas || '').includes('[FOLLOW-UP') || (i.notas || '').includes('[REACTIVAÇÃO')
            const tempoResp = tempoRespostaMap[i.id]
            const dataHora = i.data_hora ? new Date(i.data_hora) : null
            const dataStr = dataHora
              ? `${dataHora.toLocaleDateString('pt-PT')} ${dataHora.toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' })}`
              : '—'
            // Limpar prefixos do agente para mostrar so o texto
            const textoLimpo = (i.notas || '').replace(/^\[AGENTE\]\s*/, '').replace(/^\[FOLLOW-UP AUTO\]\s*/, '').replace(/^\[REACTIVAÇÃO\]\s*/, '')

            return (
              <div key={i.id} className={`flex ${isEnviado ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 ${
                  isEnviado
                    ? isAgente ? 'bg-amber-50 border border-amber-200' : 'bg-indigo-50 border border-indigo-200'
                    : 'bg-white border border-gray-200'
                }`}>
                  {/* Header — quem enviou */}
                  <div className="flex items-center gap-2 mb-1">
                    {isEnviado ? (
                      <span className={`text-xs font-medium ${isAgente ? 'text-amber-600' : 'text-indigo-600'}`}>
                        {isAgente ? 'Agente Alexandre' : 'Tu'} · {i.canal}
                      </span>
                    ) : (
                      <span className="text-xs font-medium text-gray-700">
                        Consultor · {i.canal}
                      </span>
                    )}
                    {tempoResp != null && (
                      <span className="text-xs text-purple-500">
                        ⏱ {formatHoras(tempoResp)}
                      </span>
                    )}
                  </div>
                  {/* Texto da mensagem */}
                  {textoLimpo && <p className="text-sm text-gray-800 whitespace-pre-line">{textoLimpo}</p>}
                  {/* Data/hora */}
                  <p className="text-xs text-gray-400 mt-1 text-right">{dataStr}</p>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
