import { useState, useEffect, useCallback } from 'react'
import { apiFetch } from '../lib/api.js'

/**
 * Generic data fetching hook.
 * @param {string} url - API endpoint to fetch
 * @param {object} [options] - { initialData, transform }
 */
export function useFetch(url, { initialData = null, transform } = {}) {
  const [data, setData] = useState(initialData)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await apiFetch(url)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      let json = await res.json()
      if (json.error) throw new Error(json.error)
      if (transform) json = transform(json)
      setData(json)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [url])

  useEffect(() => { refresh() }, [refresh])

  return { data, loading, error, refresh }
}
