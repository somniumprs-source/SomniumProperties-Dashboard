import { useQuery } from '@tanstack/react-query'
import { apiFetch } from '../lib/api.js'

/**
 * Drop-in alternativo a useFetch que usa React Query por baixo.
 * Mantém a mesma forma { data, loading, error, refresh } para não obrigar
 * a reescrever páginas que adoptem o cache.
 *
 * Exemplo:
 *   const { data, loading, refresh } = useQueryFetch('/api/kpis', { regiao })
 */
export function useQueryFetch(url, { regiao, transform, enabled = true, initialData = null } = {}) {
  const key = ['api', url, regiao || null]
  const q = useQuery({
    queryKey: key,
    enabled: !!url && enabled,
    queryFn: async () => {
      const res = await apiFetch(url, regiao ? { regiao } : undefined)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      let json = await res.json()
      if (json && json.error) throw new Error(json.error)
      return transform ? transform(json) : json
    },
  })
  return {
    data: q.data ?? initialData,
    loading: q.isPending,
    error: q.error?.message || null,
    refresh: q.refetch,
    isFetching: q.isFetching,
  }
}
