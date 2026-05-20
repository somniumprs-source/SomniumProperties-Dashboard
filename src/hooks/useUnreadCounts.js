/**
 * Hook para polling de contagens de mensagens WhatsApp nao lidas.
 * Actualiza a cada 30 segundos.
 */
import { useState, useEffect, useRef, useCallback } from 'react'
import { apiFetch } from '../lib/api.js'

export function useUnreadCounts(enabled = true) {
  const [counts, setCounts] = useState({})
  const intervalRef = useRef(null)

  const fetch = useCallback(async () => {
    try {
      const r = await apiFetch('/api/crm/whatsapp/unread-counts')
      if (r.ok) {
        const data = await r.json()
        setCounts(data || {})
      }
    } catch { /* silenciar erros de polling */ }
  }, [])

  useEffect(() => {
    if (!enabled) return
    fetch()
    intervalRef.current = setInterval(() => { if (!document.hidden) fetch() }, 60000)
    const onVisible = () => { if (!document.hidden) fetch() }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [enabled, fetch])

  const total = Object.values(counts).reduce((a, b) => a + b, 0)

  return { counts, total, refresh: fetch }
}
