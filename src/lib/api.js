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

/**
 * Fetch wrapper que inclui o token de auth em todos os pedidos.
 */
export async function apiFetch(url, options = {}) {
  const headers = { ...options.headers }
  if (authEnabled && supabase) {
    const { data: { session } } = await supabase.auth.getSession()
    if (session?.access_token) {
      headers['Authorization'] = `Bearer ${session.access_token}`
    }
  }
  return fetch(url, { ...options, headers })
}
