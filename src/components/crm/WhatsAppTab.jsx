/**
 * Tab de conversas WhatsApp — vista tipo chat para seguir todas as interaccoes
 * WhatsApp de um consultor em tempo real dentro do CRM.
 */
import { useState, useEffect, useRef } from 'react'
import { Send, Bot, User, AlertCircle, RefreshCw, Pause, Play } from 'lucide-react'
import { apiFetch } from '../../lib/api.js'

function formatTime(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  return d.toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' })
}

function formatDate(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  const hoje = new Date()
  const ontem = new Date(hoje)
  ontem.setDate(ontem.getDate() - 1)
  if (d.toDateString() === hoje.toDateString()) return 'Hoje'
  if (d.toDateString() === ontem.toDateString()) return 'Ontem'
  return d.toLocaleDateString('pt-PT', { day: 'numeric', month: 'short', year: 'numeric' })
}

function groupByDate(messages) {
  const groups = []
  let currentDate = null
  for (const msg of messages) {
    const date = formatDate(msg.data_hora)
    if (date !== currentDate) {
      currentDate = date
      groups.push({ type: 'date', label: date })
    }
    groups.push({ type: 'msg', ...msg })
  }
  return groups
}

export function WhatsAppTab({ consultorId, consultorNome, controloManual, onUpdate }) {
  const [messages, setMessages] = useState([])
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [text, setText] = useState('')
  const [handoff, setHandoff] = useState(!!controloManual)
  const [togglingAgent, setTogglingAgent] = useState(false)
  const [autoRefresh, setAutoRefresh] = useState(true)
  const chatEndRef = useRef(null)
  const intervalRef = useRef(null)

  async function load() {
    try {
      const r = await apiFetch(`/api/crm/consultores/${consultorId}/interacoes`)
      const data = await r.json()
      const whatsappMsgs = (Array.isArray(data) ? data : [])
        .filter(i => i.canal === 'whatsapp' || i.canal === 'WhatsApp')
        .sort((a, b) => new Date(a.data_hora) - new Date(b.data_hora))
      setMessages(whatsappMsgs)
    } catch { setMessages([]) }
    setLoading(false)
  }

  useEffect(() => {
    if (consultorId) load()
  }, [consultorId])

  // Auto-refresh a cada 15s
  useEffect(() => {
    if (autoRefresh && consultorId) {
      intervalRef.current = setInterval(load, 15000)
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [autoRefresh, consultorId])

  // Scroll para o fim quando ha novas mensagens
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length])

  async function handleSend(e) {
    e.preventDefault()
    if (!text.trim() || sending) return
    setSending(true)
    try {
      const r = await apiFetch(`/api/consultores/${consultorId}/enviar-whatsapp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mensagem: text.trim() }),
      })
      const data = await r.json()
      if (!r.ok) throw new Error(data.error || 'Erro ao enviar')
      setText('')
      await load()
      if (onUpdate) onUpdate()
    } catch (err) {
      alert(err.message || 'Erro ao enviar mensagem')
    }
    setSending(false)
  }

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

  const grouped = groupByDate(messages)

  return (
    <div className="flex flex-col" style={{ height: 'calc(100vh - 280px)', minHeight: '400px' }}>
      {/* Header com estado do agente */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-100" style={{ backgroundColor: '#F5F4F0' }}>
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ backgroundColor: '#25D366' }}>
            <Send className="w-4 h-4 text-white" style={{ transform: 'rotate(-30deg)' }} />
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-800">{consultorNome || 'Consultor'}</p>
            <p className="text-xs text-gray-500">
              {messages.length} mensagens WhatsApp
              {autoRefresh && <span className="text-green-600 ml-1">  (auto-refresh)</span>}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => { setAutoRefresh(!autoRefresh); load() }}
            className="p-1.5 rounded-lg hover:bg-gray-200 transition-colors" title="Refresh">
            <RefreshCw className={`w-4 h-4 text-gray-500 ${autoRefresh ? 'animate-spin-slow' : ''}`} />
          </button>
          <button onClick={toggleAgent} disabled={togglingAgent}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
              handoff
                ? 'bg-green-600 text-white hover:bg-green-700'
                : 'bg-amber-500 text-white hover:bg-amber-600'
            }`}>
            {handoff ? <Play className="w-3 h-3" /> : <Pause className="w-3 h-3" />}
            {togglingAgent ? '...' : handoff ? 'Retomar Agente' : 'Pausar Agente'}
          </button>
        </div>
      </div>

      {/* Banner de estado */}
      {handoff && (
        <div className="px-4 py-2 text-center text-xs bg-amber-50 border-b border-amber-200 text-amber-700">
          Agente pausado — a responder manualmente. As mensagens enviadas aqui vao directamente pelo WhatsApp.
        </div>
      )}
      {!handoff && (
        <div className="px-4 py-2 text-center text-xs bg-green-50 border-b border-green-200 text-green-700">
          Agente activo — respostas automaticas ligadas. Pode enviar mensagens manuais (o agente sera pausado).
        </div>
      )}

      {/* Area de mensagens */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-1" style={{ backgroundColor: '#ECE5DD' }}>
        {loading ? (
          <div className="text-center py-12 text-gray-400 text-sm">A carregar conversas...</div>
        ) : messages.length === 0 ? (
          <div className="text-center py-12 text-gray-400 text-sm">Sem mensagens WhatsApp com este consultor</div>
        ) : (
          grouped.map((item, idx) => {
            if (item.type === 'date') {
              return (
                <div key={`date-${idx}`} className="flex justify-center py-2">
                  <span className="px-3 py-1 text-xs rounded-full bg-white/80 text-gray-500 shadow-sm">
                    {item.label}
                  </span>
                </div>
              )
            }

            const isEnviado = item.direcao === 'Enviado'
            const isAgente = (item.notas || '').includes('[AGENTE]') || (item.notas || '').includes('[FOLLOW-UP') || (item.notas || '').includes('[REACTIVAÇÃO')
            const isErro = (item.notas || '').includes('[ERRO AGENTE]') || (item.notas || '').includes('[AGENTE FALHOU]')
            const isFallback = (item.notas || '').includes('[AGENTE FALLBACK]')
            const textoLimpo = (item.notas || '')
              .replace(/^\[AGENTE\]\s*/, '')
              .replace(/^\[AGENTE FALHOU\]\s*/, '')
              .replace(/^\[AGENTE FALLBACK\]\s*/, '')
              .replace(/^\[FOLLOW-UP AUTO\]\s*/, '')
              .replace(/^\[REACTIVAÇÃO\]\s*/, '')
              .replace(/^\[ERRO AGENTE\]\s*/, '')

            return (
              <div key={item.id} className={`flex ${isEnviado ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[80%] rounded-lg px-3 py-2 shadow-sm ${
                  isErro
                    ? 'bg-red-50 border border-red-200'
                    : isEnviado
                      ? isAgente || isFallback
                        ? 'bg-amber-50 border border-amber-200'
                        : 'bg-[#DCF8C6]'
                      : 'bg-white'
                }`}>
                  {/* Quem enviou */}
                  <div className="flex items-center gap-1.5 mb-0.5">
                    {isEnviado ? (
                      isAgente || isFallback ? (
                        <span className="flex items-center gap-1 text-xs font-medium text-amber-600">
                          <Bot className="w-3 h-3" /> Agente Alexandre
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-xs font-medium text-green-700">
                          <User className="w-3 h-3" /> Tu
                        </span>
                      )
                    ) : (
                      <span className="text-xs font-medium text-gray-600">
                        {consultorNome || 'Consultor'}
                      </span>
                    )}
                    {isErro && (
                      <span className="flex items-center gap-0.5 text-xs text-red-500">
                        <AlertCircle className="w-3 h-3" /> Erro
                      </span>
                    )}
                  </div>
                  {/* Texto */}
                  <p className="text-sm text-gray-800 whitespace-pre-line leading-relaxed">{textoLimpo}</p>
                  {/* Hora */}
                  <p className="text-right mt-0.5">
                    <span className="text-[10px] text-gray-400">{formatTime(item.data_hora)}</span>
                  </p>
                </div>
              </div>
            )
          })
        )}
        <div ref={chatEndRef} />
      </div>

      {/* Input de mensagem */}
      <form onSubmit={handleSend} className="flex items-center gap-2 px-4 py-3 border-t border-gray-200 bg-white">
        <input
          type="text"
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder="Escrever mensagem..."
          className="flex-1 px-4 py-2.5 rounded-full border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-green-300 bg-gray-50"
          disabled={sending}
        />
        <button
          type="submit"
          disabled={sending || !text.trim()}
          className="w-10 h-10 flex items-center justify-center rounded-full transition-colors"
          style={{ backgroundColor: text.trim() ? '#25D366' : '#ccc' }}
        >
          <Send className="w-4 h-4 text-white" style={{ transform: 'rotate(-30deg)' }} />
        </button>
      </form>
    </div>
  )
}
