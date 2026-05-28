import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'
import { supabase, authEnabled } from './lib/supabase.js'
import { resolveApiUrl } from './lib/apiUrl.js'

// Interceptar fetch para /api/ e adicionar token Supabase automaticamente
// Usa referência directa ao fetch original para evitar loop
if (authEnabled && supabase) {
  const _originalFetch = window.fetch.bind(window)
  let _cachedToken = null
  let _tokenExpiry = 0
  let _recovering = false

  // Manter o cache local sincronizado com a sessão Supabase. Sem isto, depois
  // de o SDK refrescar o JWT (TOKEN_REFRESHED), o interceptor continuava a
  // enviar o token velho durante até 5 min — em PWA standalone no telemóvel
  // (sessão dormente vários dias) bastava para o backend devolver 401 em todas
  // as chamadas /api/* e o Dashboard ficar preso em "A carregar dados...".
  supabase.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_OUT' || !session?.access_token) {
      _cachedToken = null
      _tokenExpiry = 0
      return
    }
    _cachedToken = session.access_token
    _tokenExpiry = Date.now() + 300000
  })

  async function recoverFromUnauthorized() {
    if (_recovering) return
    _recovering = true
    _cachedToken = null
    _tokenExpiry = 0
    try { await supabase.auth.signOut() } catch { /* ignore */ }
    // Reload força reinício do AuthProvider → ecrã de login.
    if (typeof window !== 'undefined') window.location.reload()
  }

  async function fetchWithToken(url, options, token) {
    const next = { ...options, headers: { ...options.headers, 'Authorization': `Bearer ${token}` } }
    const res = await _originalFetch(url, next)
    if (res.status === 401) {
      // Token recusado pelo backend: invalidar cache, tentar uma vez com sessão
      // fresca (pode haver TOKEN_REFRESHED em curso), e se ainda assim 401, fazer
      // signOut para o utilizador voltar a entrar em vez de ver loading eterno.
      _cachedToken = null
      _tokenExpiry = 0
      try {
        const { data: { session } } = await supabase.auth.getSession()
        const fresh = session?.access_token
        if (fresh && fresh !== token) {
          _cachedToken = fresh
          _tokenExpiry = Date.now() + 300000
          const retry = await _originalFetch(url, { ...options, headers: { ...options.headers, 'Authorization': `Bearer ${fresh}` } })
          if (retry.status !== 401) return retry
        }
      } catch { /* ignore */ }
      recoverFromUnauthorized()
      return res
    }
    return res
  }

  window.fetch = function (url, options = {}) {
    // Só interceptar chamadas /api locais (não chamadas do Supabase SDK)
    if (typeof url === 'string' && url.startsWith('/api')) {
      // Reescreve /api/* -> Edge Function Supabase (se VITE_API_URL definido);
      // caso contrário devolve o url original (same-origin Express).
      const target = resolveApiUrl(url)
      const now = Date.now()
      if (_cachedToken && now < _tokenExpiry) {
        return fetchWithToken(target, options, _cachedToken)
      }
      return supabase.auth.getSession().then(({ data: { session } }) => {
        if (session?.access_token) {
          _cachedToken = session.access_token
          _tokenExpiry = now + 300000
          return fetchWithToken(target, options, session.access_token)
        }
        return _originalFetch(target, options)
      }).catch(() => _originalFetch(target, options))
    }
    return _originalFetch(url, options)
  }
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)

// Registar Service Worker para PWA.
// Quando um SW novo toma controlo (apos deploy) recarregamos uma vez
// para garantir que o utilizador apanha o HTML/JS mais recente sem
// precisar de limpar cache manualmente. So fazemos reload se ja havia
// um SW anterior — primeira visita nao precisa.
if ('serviceWorker' in navigator) {
  const hadControllerOnLoad = navigator.serviceWorker.controller !== null
  let refreshing = false
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadControllerOnLoad || refreshing) return
    refreshing = true
    window.location.reload()
  })
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').then((reg) => {
      // Verificar versão nova a cada 60s — apanha deploys sem precisar fechar tab.
      setInterval(() => { reg.update().catch(() => {}) }, 60_000)
      // Se há um SW "waiting" (já instalado mas não activo), forçar skipWaiting.
      if (reg.waiting) reg.waiting.postMessage({ type: 'SKIP_WAITING' })
      reg.addEventListener('updatefound', () => {
        const newSW = reg.installing
        if (!newSW) return
        newSW.addEventListener('statechange', () => {
          if (newSW.state === 'installed' && navigator.serviceWorker.controller) {
            // Há nova versão pronta — pedir activação imediata.
            newSW.postMessage({ type: 'SKIP_WAITING' })
          }
        })
      })
    }).catch(() => {})
  })
}
