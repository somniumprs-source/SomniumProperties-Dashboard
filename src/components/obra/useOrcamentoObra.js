/**
 * Hook que carrega e persiste o orçamento de obra de um imóvel.
 * 1 orçamento por imóvel. Save debounced (1500ms) com PUT idempotente.
 */
import { useState, useEffect, useRef, useCallback } from 'react'
import { apiFetch } from '../../lib/api.js'

const ESTADO_VAZIO = {
  pisos: [],
  seccoes: {},
  notas: '',
  iva_perc: 23,
  total_obra: 0,
  total_licenciamento: 0,
  total_geral: 0,
  existe: false,
}

export function useOrcamentoObra(imovelId) {
  const [orcamento, setOrcamento] = useState(ESTADO_VAZIO)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const saveTimer = useRef(null)

  const load = useCallback(async () => {
    if (!imovelId) return
    setLoading(true)
    try {
      const r = await apiFetch(`/api/crm/imoveis/${imovelId}/orcamento-obra`)
      if (r.ok) {
        const data = await r.json()
        setOrcamento({ ...ESTADO_VAZIO, ...data })
      }
    } catch {}
    setLoading(false)
  }, [imovelId])

  useEffect(() => { load() }, [load])

  // Actualiza estado local + agenda PUT debounced
  const update = useCallback((patch) => {
    setOrcamento((prev) => {
      const next = typeof patch === 'function' ? patch(prev) : { ...prev, ...patch }
      // Agendar save com snapshot do "next"
      clearTimeout(saveTimer.current)
      setSaving(true)
      saveTimer.current = setTimeout(async () => {
        try {
          const r = await apiFetch(`/api/crm/imoveis/${imovelId}/orcamento-obra`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              pisos: next.pisos,
              seccoes: next.seccoes,
              notas: next.notas,
              iva_perc: next.iva_perc,
            }),
          })
          if (r.ok) {
            const saved = await r.json()
            // Mantém inputs locais; apenas actualiza totais e meta vindos do server
            setOrcamento((p) => ({
              ...p,
              total_obra: saved.total_obra,
              total_licenciamento: saved.total_licenciamento,
              total_geral: saved.total_geral,
              existe: true,
              updated_at: saved.updated_at,
            }))
          }
        } catch {}
        setSaving(false)
      }, 1500)
      return next
    })
  }, [imovelId])

  // Cleanup
  useEffect(() => () => clearTimeout(saveTimer.current), [])

  return { orcamento, loading, saving, update, reload: load }
}
