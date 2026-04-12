import { supabase, authEnabled } from './supabase.js'

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
