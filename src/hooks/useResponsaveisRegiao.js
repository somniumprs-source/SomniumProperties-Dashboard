import { useQuery } from '@tanstack/react-query'
import { apiFetch } from '../lib/api.js'

// Dono de cada região (auditoria D10): { Coimbra: 'João Abreu', AMP: 'Alexandre Mendes' }.
// A responsabilidade é por listas: o dono de um imóvel ou projeto é o da região.
export function useResponsaveisRegiao() {
  const q = useQuery({
    queryKey: ['responsaveis-regiao'],
    staleTime: 10 * 60 * 1000,
    queryFn: async () => {
      const r = await apiFetch('/api/crm/responsaveis-regiao').catch(() => null)
      return r?.ok ? r.json() : {}
    },
  })
  return q.data || {}
}
