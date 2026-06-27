/**
 * Hook para gerir análises de rentabilidade de um imóvel.
 * Fetch, save (debounced), criar, duplicar, activar, apagar.
 */
import { useState, useEffect, useRef, useCallback } from 'react'
import { apiFetch } from '../../lib/api.js'

const SAVE_DEBOUNCE_MS = 1200

export function useAnalise(imovelId) {
  const [analises, setAnalises] = useState([])
  const [selected, setSelected] = useState(null) // análise completa seleccionada
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  // { status: 'idle'|'saving'|'saved'|'error', at: Date|null, error: string|null }
  const [lastSaveStatus, setLastSaveStatus] = useState({ status: 'idle', at: null, error: null })
  const saveTimer = useRef(null)
  const pendingFields = useRef({})
  const selectedRef = useRef(null)
  selectedRef.current = selected

  const sendNow = useCallback(async (fields) => {
    const id = selectedRef.current?.id
    if (!id || !fields || Object.keys(fields).length === 0) return null
    setSaving(true)
    setLastSaveStatus({ status: 'saving', at: null, error: null })
    try {
      const r = await apiFetch(`/api/crm/analises/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(fields),
        // Autosave: não dispara refresh global da lista (evita salto p/ topo).
        // A lista actualiza quando o utilizador fecha a ficha (onClose -> load).
        skipRefresh: true,
      })
      if (!r.ok) {
        const text = await r.text().catch(() => '')
        throw new Error(`HTTP ${r.status} ${r.statusText} ${text.slice(0, 200)}`.trim())
      }
      const updated = await r.json()
      setSelected(updated)
      setAnalises(prev => prev.map(a => a.id === updated.id ? updated : a))
      setLastSaveStatus({ status: 'saved', at: new Date(), error: null })
      return updated
    } catch (err) {
      const msg = err?.message || String(err)
      setLastSaveStatus({ status: 'error', at: new Date(), error: msg })
      console.error('[useAnalise] save error:', msg)
      return null
    } finally {
      setSaving(false)
    }
  }, [])

  // Carregar lista de análises
  const load = useCallback(async () => {
    if (!imovelId) return
    setLoading(true)
    try {
      const r = await apiFetch(`/api/crm/imoveis/${imovelId}/analises`)
      const data = await r.json()
      setAnalises(data)
      // Seleccionar a activa, ou a primeira
      const activa = data.find(a => a.activa) || data[0]
      if (activa) setSelected(activa)
      else setSelected(null)
    } catch {
      setAnalises([])
    }
    setLoading(false)
  }, [imovelId])

  useEffect(() => { load() }, [load])

  // Seleccionar análise
  const select = useCallback((analiseId) => {
    const a = analises.find(x => x.id === analiseId)
    if (a) setSelected(a)
  }, [analises])

  // Criar nova análise
  const criar = useCallback(async (dados = {}) => {
    try {
      const r = await apiFetch(`/api/crm/imoveis/${imovelId}/analises`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(dados),
      })
      const nova = await r.json()
      if (r.ok) {
        await load()
        setSelected(nova)
        return nova
      }
    } catch {}
    return null
  }, [imovelId, load])

  // Guardar (debounced — acumula campos no buffer para não perder edições rápidas)
  const guardar = useCallback((campos) => {
    if (!selectedRef.current?.id || !campos) return
    pendingFields.current = { ...pendingFields.current, ...campos }
    clearTimeout(saveTimer.current)
    setSaving(true)
    setLastSaveStatus(prev => prev.status === 'error' ? prev : { status: 'saving', at: null, error: null })
    saveTimer.current = setTimeout(() => {
      const toSend = pendingFields.current
      pendingFields.current = {}
      saveTimer.current = null
      void sendNow(toSend)
    }, SAVE_DEBOUNCE_MS)
  }, [sendNow])

  // Força flush imediato do save debounced pendente. Retorna Promise que resolve quando o PUT terminar.
  const flush = useCallback(async () => {
    if (!saveTimer.current && Object.keys(pendingFields.current).length === 0) return null
    clearTimeout(saveTimer.current)
    saveTimer.current = null
    const toSend = pendingFields.current
    pendingFields.current = {}
    if (Object.keys(toSend).length === 0) return null
    return sendNow(toSend)
  }, [sendNow])

  // Guardar imediato (para acções explícitas — botão "Guardar", rename, etc.)
  const guardarAgora = useCallback(async (campos) => {
    // Funde com pendentes para não perder edições em curso
    const merged = { ...pendingFields.current, ...(campos || {}) }
    pendingFields.current = {}
    clearTimeout(saveTimer.current)
    saveTimer.current = null
    return sendNow(merged)
  }, [sendNow])

  // Activar análise
  const activar = useCallback(async (analiseId) => {
    try {
      const r = await apiFetch(`/api/crm/analises/${analiseId}/activar`, { method: 'POST' })
      if (r.ok) await load()
    } catch {}
  }, [load])

  // Duplicar análise
  const duplicar = useCallback(async (analiseId, nome) => {
    try {
      const r = await apiFetch(`/api/crm/analises/${analiseId}/duplicar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nome }),
      })
      if (r.ok) {
        const nova = await r.json()
        await load()
        setSelected(nova)
        return nova
      }
    } catch {}
    return null
  }, [load])

  // Apagar análise
  const apagar = useCallback(async (analiseId) => {
    try {
      const r = await apiFetch(`/api/crm/analises/${analiseId}`, { method: 'DELETE' })
      if (r.ok) {
        await load()
        if (selected?.id === analiseId) setSelected(analises.find(a => a.id !== analiseId) || null)
      }
    } catch {}
  }, [load, selected?.id, analises])

  // Cleanup timer + aviso ao fechar tab se houver save por terminar
  useEffect(() => {
    const onBeforeUnload = (e) => {
      if (saveTimer.current || Object.keys(pendingFields.current).length > 0) {
        e.preventDefault()
        e.returnValue = ''
      }
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload)
      clearTimeout(saveTimer.current)
    }
  }, [])

  return {
    analises, selected, loading, saving, lastSaveStatus,
    select, criar, guardar, guardarAgora, flush, activar, duplicar, apagar, reload: load,
  }
}
