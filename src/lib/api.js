import { supabase, authEnabled } from './supabase.js'

/**
 * Devolve o access token actual da sessão Supabase (string vazia se não houver).
 * Útil para construir URLs com `?token=...` em window.open de PDFs.
 */
export async function getToken() {
  try {
    if (!authEnabled || !supabase) return ''
    const { data: { session } } = await supabase.auth.getSession()
    return session?.access_token || ''
  } catch { return '' }
}

// Após mutações bem sucedidas, sinalizar o dashboard (e outros listeners) para
// refrescar. Debounced para coalescer rajadas (ex.: gravar vários campos em sequência).
let _refreshTimer = null
function scheduleRefreshSignal() {
  if (typeof window === 'undefined') return
  if (_refreshTimer) clearTimeout(_refreshTimer)
  _refreshTimer = setTimeout(() => {
    try { window.dispatchEvent(new CustomEvent('somnium:refresh')) } catch { /* ambientes sem CustomEvent */ }
    _refreshTimer = null
  }, 500)
}

/**
 * Fetch wrapper. O Authorization header é adicionado pelo interceptor global
 * do `window.fetch` (definido em main.jsx) que tem cache de token com TTL —
 * evita chamar `supabase.auth.getSession()` a cada apiFetch (era 100-300ms
 * por chamada × N requests paralelas no boot).
 *
 * Para filtrar por região, o caller passa `options.regiao = 'Coimbra' | 'AMP'`
 * — o wrapper injecta o header `X-Regiao`. Sem regiao = sem filtro.
 *
 * Emite o evento "somnium:refresh" depois de mutações OK.
 */
export async function apiFetch(url, options = {}) {
  const { regiao, ...rest } = options
  const headers = { ...rest.headers }
  if (regiao && !headers['X-Regiao']) headers['X-Regiao'] = regiao
  const res = await fetch(url, { ...rest, headers })
  const method = (options.method || 'GET').toUpperCase()
  if (res.ok && (method === 'POST' || method === 'PUT' || method === 'PATCH' || method === 'DELETE')) {
    scheduleRefreshSignal()
  }
  return res
}
