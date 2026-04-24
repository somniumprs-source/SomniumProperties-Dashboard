import { useSearchParams } from 'react-router-dom'
import { useCallback, useMemo } from 'react'

export function useUrlState(key, defaultValue) {
  const [params, setParams] = useSearchParams()
  const value = params.get(key) ?? defaultValue

  const setValue = useCallback((next, { replace = false } = {}) => {
    setParams(prev => {
      const p = new URLSearchParams(prev)
      const old = p.get(key) ?? defaultValue
      const resolved = typeof next === 'function' ? next(old) : next
      if (resolved === null || resolved === undefined || resolved === '' || resolved === defaultValue) {
        p.delete(key)
      } else {
        p.set(key, String(resolved))
      }
      return p
    }, { replace })
  }, [key, defaultValue, setParams])

  return [value, setValue]
}

const FILTER_PREFIX = 'f.'

export function useUrlFilters() {
  const [params, setParams] = useSearchParams()

  const filters = useMemo(() => {
    const f = {}
    for (const [k, v] of params.entries()) {
      if (k.startsWith(FILTER_PREFIX)) f[k.slice(FILTER_PREFIX.length)] = v
    }
    return f
  }, [params])

  const setFilters = useCallback((next, { replace = false } = {}) => {
    setParams(prev => {
      const oldFilters = {}
      for (const [k, v] of prev.entries()) {
        if (k.startsWith(FILTER_PREFIX)) oldFilters[k.slice(FILTER_PREFIX.length)] = v
      }
      const resolved = typeof next === 'function' ? next(oldFilters) : next
      const p = new URLSearchParams()
      for (const [k, v] of prev.entries()) {
        if (!k.startsWith(FILTER_PREFIX)) p.set(k, v)
      }
      for (const [k, v] of Object.entries(resolved || {})) {
        if (v) p.set(`${FILTER_PREFIX}${k}`, v)
      }
      return p
    }, { replace })
  }, [setParams])

  return [filters, setFilters]
}
