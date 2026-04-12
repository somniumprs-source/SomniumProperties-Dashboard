import { supabase } from './supabase.js'

/**
 * Fetch wrapper que inclui o token de auth em todos os pedidos.
 * Drop-in replacement para fetch() nas chamadas /api.
 */
export async function apiFetch(url, options = {}) {
  const { data: { session } } = await supabase.auth.getSession()
  const headers = { ...options.headers }
  if (session?.access_token) {
    headers['Authorization'] = `Bearer ${session.access_token}`
  }
  return fetch(url, { ...options, headers })
}
