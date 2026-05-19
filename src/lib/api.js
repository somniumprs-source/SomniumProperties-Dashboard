import { supabase, authEnabled } from './supabase.js'
import { getRegiaoActivaFromStorage } from '../contexts/RegiaoContext.jsx'

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
 * Fetch wrapper que inclui o token de auth em todos os pedidos.
 * Emite o evento "somnium:refresh" depois de mutações OK (POST/PUT/PATCH/DELETE).
 * Injecta header X-Regiao com a região activa da aba actual — o middleware
 * backend usa isto para filtrar listagens/KPIs automaticamente.
 */
export async function apiFetch(url, options = {}) {
  const headers = { ...options.headers }
  if (authEnabled && supabase) {
    const { data: { session } } = await supabase.auth.getSession()
    if (session?.access_token) {
      headers['Authorization'] = `Bearer ${session.access_token}`
    }
  }
  // Região activa — só envia se já foi escolhida; backend cai para "sem filtro" caso ausente.
  if (!headers['X-Regiao']) {
    const r = getRegiaoActivaFromStorage()
    if (r) headers['X-Regiao'] = r
  }
  const res = await fetch(url, { ...options, headers })
  const method = (options.method || 'GET').toUpperCase()
  if (res.ok && (method === 'POST' || method === 'PUT' || method === 'PATCH' || method === 'DELETE')) {
    scheduleRefreshSignal()
  }
  return res
}
