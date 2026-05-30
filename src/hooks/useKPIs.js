import { useState, useEffect, useCallback, useRef } from 'react'
import { apiFetch } from '../lib/api.js'

export function useKPIs(regiao) {
  const [kpis, setKpis] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const hasDataRef = useRef(false)

  const refresh = useCallback(async () => {
    // Só mete loading=true se ainda não há dados — evita flicker em refreshes.
    if (!hasDataRef.current) setLoading(true)
    setError(null)
    try {
      const res = await apiFetch('/api/kpis', { regiao })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setKpis(data)
      hasDataRef.current = true
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [regiao])

  useEffect(() => { refresh() }, [refresh])

  return { kpis, loading, error, refresh }
}
