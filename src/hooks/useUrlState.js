import { useSearchParams } from 'react-router-dom'
import { useCallback } from 'react'

export function useUrlState(key, defaultValue) {
  const [params, setParams] = useSearchParams()
  const value = params.get(key) ?? defaultValue

  const setValue = useCallback((next, { replace = false } = {}) => {
    setParams(prev => {
      const p = new URLSearchParams(prev)
      const resolved = typeof next === 'function' ? next(p.get(key) ?? defaultValue) : next
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
