/**
 * Hook para gerir análises de rentabilidade de um imóvel.
 * Fetch, save (debounced), criar, duplicar, activar, apagar.
 */
import { useState, useEffect, useRef, useCallback } from 'react'
import { apiFetch } from '../../lib/api.js'

export function useAnalise(imovelId) {
  const [analises, setAnalises] = useState([])
  const [selected, setSelected] = useState(null) // análise completa seleccionada
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const saveTimer = useRef(null)

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

  // Guardar (debounced — chamado a cada alteração de input)
  const guardar = useCallback((campos) => {
    if (!selected?.id) return
    clearTimeout(saveTimer.current)
    setSaving(true)
    saveTimer.current = setTimeout(async () => {
      try {
        const r = await apiFetch(`/api/crm/analises/${selected.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(campos),
        })
        if (r.ok) {
          const updated = await r.json()
          setSelected(updated)
          setAnalises(prev => prev.map(a => a.id === updated.id ? updated : a))
        }
      } catch {}
      setSaving(false)
    }, 1500)
  }, [selected?.id])

  // Guardar imediato (para acções explícitas)
  const guardarAgora = useCallback(async (campos) => {
    if (!selected?.id) return null
    setSaving(true)
    try {
      const r = await apiFetch(`/api/crm/analises/${selected.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(campos),
      })
      if (r.ok) {
        const updated = await r.json()
        setSelected(updated)
        setAnalises(prev => prev.map(a => a.id === updated.id ? updated : a))
        setSaving(false)
        return updated
      }
    } catch {}
    setSaving(false)
    return null
  }, [selected?.id])

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

  // Cleanup timer
  useEffect(() => () => clearTimeout(saveTimer.current), [])

  return {
    analises, selected, loading, saving,
    select, criar, guardar, guardarAgora, activar, duplicar, apagar, reload: load,
  }
}
