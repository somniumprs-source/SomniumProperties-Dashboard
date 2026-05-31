import { supabase, authEnabled } from './supabase.js'
import { getRegiaoActivaFromStorage } from '../contexts/RegiaoContext.jsx'
// Re-export: links de PDF/descarga (window.open) usam isto para apontar para a
// Edge Function correcta quando VITE_API_URL esta definido.
export { resolveApiUrl, API_BASE } from './apiUrl.js'

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
// Timeout default: 30s. Antes ficavam requests penduradas indefinidamente
// quando o backend não respondia (Render cold-start, Supabase pool exausto),
// e o Dashboard mostrava "A carregar dados..." eternamente. Com abort, o
// catch dispara e o utilizador vê uma mensagem de erro accionável.
const DEFAULT_TIMEOUT_MS = 30_000

export async function apiFetch(url, options = {}) {
  const { regiao, timeoutMs = DEFAULT_TIMEOUT_MS, ...rest } = options
  const headers = { ...rest.headers }
  // Prioridade: regiao explícito > sessionStorage da página actual (apenas
  // se URL for `/api/crm/*` para limitar a entidades regionais).
  if (!headers['X-Regiao']) {
    let r = regiao
    if (!r && typeof url === 'string' && url.startsWith('/api/crm/')) {
      r = getRegiaoActivaFromStorage()
    }
    if (r) headers['X-Regiao'] = r
  }
  // Perfil activo: a equipa partilha a sessao Supabase (somniumprs@gmail.com).
  // O ID escolhido na sidebar e enviado para o backend identificar quem fez
  // a alteracao no historico (historico_alteracoes.user_nome).
  if (!headers['X-User-Id'] && typeof window !== 'undefined') {
    try {
      const activeId = window.localStorage.getItem('somnium:active_user_id')
      if (activeId) headers['X-User-Id'] = activeId
    } catch {}
  }
  // AbortController só corre se o caller não passou já um signal — senão
  // respeitamos o controlo deles (ex: componentes que cancelam ao desmontar).
  let controller
  let timer
  let signal = rest.signal
  if (!signal && timeoutMs > 0) {
    controller = new AbortController()
    signal = controller.signal
    timer = setTimeout(() => controller.abort(), timeoutMs)
  }
  try {
    const res = await fetch(url, { ...rest, headers, signal })
    const method = (options.method || 'GET').toUpperCase()
    if (res.ok && (method === 'POST' || method === 'PUT' || method === 'PATCH' || method === 'DELETE')) {
      scheduleRefreshSignal()
    }
    return res
  } finally {
    if (timer) clearTimeout(timer)
  }
}
