import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://mjgusjuougzoeiyavsor.supabase.co'
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || ''

export const authEnabled = !!supabaseAnonKey

export const supabase = authEnabled
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null

// PWA standalone / mobile: quando a app vai para background, o iOS suspende os
// timers de JavaScript e o auto-refresh do SDK fica para trás. Ao voltar a ficar
// visível, forçamos o SDK a retomar o auto-refresh (e a renovar já se o JWT
// expirou enquanto dormia), para que a primeira leva de chamadas após retomar
// não saia com token expirado. stopAutoRefresh em background evita refreshes
// inúteis. Best-effort: o retry-on-401 do interceptor é a rede de segurança.
if (authEnabled && supabase && typeof document !== 'undefined') {
  const syncAutoRefresh = () => {
    try {
      if (document.visibilityState === 'visible') supabase.auth.startAutoRefresh()
      else supabase.auth.stopAutoRefresh()
    } catch { /* APIs ausentes em runtime antigo */ }
  }
  document.addEventListener('visibilitychange', syncAutoRefresh)
  syncAutoRefresh()
}
