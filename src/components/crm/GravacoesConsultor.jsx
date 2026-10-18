/**
 * Gravações de conversas com o consultor (áudio transcrito e analisado).
 * Só leitura e gestão do que já existe: os contactos registam-se no bloco
 * "Próximos passos" e as chamadas do SOP 2 no separador "Registo de Chamada"
 * (essas gravações, com tipo_chamada, vivem lá).
 */
import { useState, useEffect, useCallback } from 'react'
import { Mic } from 'lucide-react'
import { apiFetch } from '../../lib/api.js'
import { useToast } from '../ui/Toast.jsx'
import { friendlyError } from '../../lib/friendlyError.js'
import { GravacaoCard } from './GravacaoCard.jsx'
import { confirmar } from '../ui/ConfirmDialog.jsx'

export function GravacoesConsultor({ consultorId }) {
  const toast = useToast()
  const [gravacoes, setGravacoes] = useState([])
  const [busy, setBusy] = useState({}) // { [gravacaoId]: 'analisar' | 'apagar' | 'retomar' }

  const loadGravacoes = useCallback(async () => {
    try {
      const r = await apiFetch(`/api/crm/consultores/${consultorId}/gravacoes`)
      const data = await r.json()
      setGravacoes(Array.isArray(data) ? data : [])
    } catch { setGravacoes([]) }
  }, [consultorId])
  useEffect(() => { loadGravacoes() }, [loadGravacoes])

  // Polling enquanto houver gravações em processamento.
  const temPendentes = gravacoes.some(g => ['pendente', 'a_transcrever', 'a_analisar'].includes(g.estado))
  useEffect(() => {
    if (!temPendentes) return
    const t = setInterval(loadGravacoes, 10000)
    return () => clearInterval(t)
  }, [temPendentes, loadGravacoes])

  async function analisarGravacao(id) {
    setBusy(p => ({ ...p, [id]: 'analisar' }))
    try {
      const r = await apiFetch(`/api/crm/gravacoes/${id}/analisar`, { method: 'POST' })
      const data = await r.json()
      if (!r.ok) throw new Error(data.error || 'Falha na análise')
      setGravacoes(p => p.map(g => g.id === id ? data : g))
    } catch (err) { toast(friendlyError(err.message || 'Falha na análise'), 'error') }
    setBusy(p => ({ ...p, [id]: null }))
  }

  async function retomarGravacao(id) {
    setBusy(p => ({ ...p, [id]: 'retomar' }))
    try {
      const r = await apiFetch(`/api/crm/gravacoes/${id}/retomar`, { method: 'POST' })
      if (!r.ok) { const d = await r.json(); throw new Error(d.error || 'Falha') }
      await loadGravacoes()
    } catch (err) { toast(friendlyError(err.message || 'Não foi possível retomar a gravação.'), 'error') }
    setBusy(p => ({ ...p, [id]: null }))
  }

  async function apagarGravacao(id) {
    if (!(await confirmar('Apagar esta gravação e a respetiva análise?'))) return
    setBusy(p => ({ ...p, [id]: 'apagar' }))
    try {
      const r = await apiFetch(`/api/crm/gravacoes/${id}`, { method: 'DELETE' })
      if (!r.ok) { const d = await r.json(); throw new Error(d.error || 'Falha ao apagar') }
      setGravacoes(p => p.filter(g => g.id !== id))
    } catch (err) { toast(friendlyError(err.message || 'Falha ao apagar'), 'error'); setBusy(p => ({ ...p, [id]: null })) }
  }

  // Guardar registo manual (edição direta no cartão ou "Aceitar sugestão" da IA).
  async function salvarRegisto(id, payload, fonte) {
    try {
      const r = await apiFetch(`/api/crm/gravacoes/${id}/registo`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...payload, registo_fonte: fonte }),
      })
      const data = await r.json()
      if (!r.ok) throw new Error(data.error || 'Falha ao guardar registo')
      setGravacoes(p => p.map(g => g.id === id ? data : g))
    } catch (err) { toast(friendlyError(err.message || 'Falha ao guardar registo'), 'error') }
  }

  const lista = gravacoes.filter(g => !g.tipo_chamada)
  if (lista.length === 0) return null
  return (
    <div>
      <p className="text-xs text-ink-muted uppercase tracking-wide mb-2 flex items-center gap-1.5">
        <Mic className="w-3.5 h-3.5" /> Gravações de conversas ({lista.length})
      </p>
      <div className="space-y-2">
        {lista.map(g => (
          <GravacaoCard key={g.id} g={g} busy={busy[g.id]} onAnalisar={analisarGravacao} onRetomar={retomarGravacao}
            onApagar={apagarGravacao} onRegistoSalvar={salvarRegisto} />
        ))}
      </div>
    </div>
  )
}
