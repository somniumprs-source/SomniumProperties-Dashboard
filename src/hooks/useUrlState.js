import { useSearchParams } from 'react-router-dom'
import { useCallback, useMemo } from 'react'

// react-router v6 setSearchParams(fn) chama fn com o snapshot capturado no render,
// nao com o URL actual. Isso significa que duas chamadas sincronas no mesmo handler
// (ex: setTab(); setDetail()) usam ambas o mesmo prev, e a segunda sobrescreve
// a primeira. Lemos window.location.search a cada chamada para compor correctamente.
function readCurrentParams() {
  return new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '')
}

export function useUrlState(key, defaultValue) {
  const [params, setParams] = useSearchParams()
  const value = params.get(key) ?? defaultValue

  const setValue = useCallback((next, { replace = false } = {}) => {
    const p = readCurrentParams()
    const old = p.get(key) ?? defaultValue
    const resolved = typeof next === 'function' ? next(old) : next
    if (resolved === null || resolved === undefined || resolved === '' || resolved === defaultValue) {
      p.delete(key)
    } else {
      p.set(key, String(resolved))
    }
    setParams(p, { replace })
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
    const current = readCurrentParams()
    const oldFilters = {}
    for (const [k, v] of current.entries()) {
      if (k.startsWith(FILTER_PREFIX)) oldFilters[k.slice(FILTER_PREFIX.length)] = v
    }
    const resolved = typeof next === 'function' ? next(oldFilters) : next
    const p = new URLSearchParams()
    for (const [k, v] of current.entries()) {
      if (!k.startsWith(FILTER_PREFIX)) p.set(k, v)
    }
    for (const [k, v] of Object.entries(resolved || {})) {
      if (v) p.set(`${FILTER_PREFIX}${k}`, v)
    }
    setParams(p, { replace })
  }, [setParams])

  return [filters, setFilters]
}
