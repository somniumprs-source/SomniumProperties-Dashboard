import { QueryClient } from '@tanstack/react-query'

// staleTime 30s — após mutação, dispatched 'somnium:refresh' invalida queries.
// gcTime 5min — manter cache aquecido entre navegações (voltar à página = instantâneo).
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
})

if (typeof window !== 'undefined') {
  window.addEventListener('somnium:refresh', () => {
    queryClient.invalidateQueries()
  })
}
