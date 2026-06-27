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

  // TTL do cache derivado da expiração REAL do JWT (session.expires_at, em
  // segundos), renovando 60s antes. Antes usávamos uma janela cega de 5 min,
  // que podia servir um token já expirado (cacheado <5min mas perto do fim de
  // vida). Fallback de 5 min se expires_at não vier.
  const expiryFor = (session) => {
    const exp = session?.expires_at ? session.expires_at * 1000 - 60000 : 0
    return exp > Date.now() ? exp : Date.now() + 300000
  }
  const cacheSession = (session) => {
    if (session?.access_token) { _cachedToken = session.access_token; _tokenExpiry = expiryFor(session) }
  }

  // Manter o cache local sincronizado com a sessão Supabase. Sem isto, depois
  // de o SDK refrescar o JWT (TOKEN_REFRESHED), o interceptor continuava a
  // enviar o token velho — em PWA standalone no telemóvel (sessão dormente
  // vários dias) bastava para o backend devolver 401 em todas as chamadas.
  supabase.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_OUT' || !session?.access_token) { _cachedToken = null; _tokenExpiry = 0; return }
    cacheSession(session)
  })

  // Força a renovação da sessão (refresh token) e devolve o access_token novo,
  // ou null se a sessão estiver mesmo morta. É a peça-chave: um getSession()
  // devolveria o MESMO JWT expirado; só refreshSession() obtém um válido.
  async function forceRefreshToken() {
    try {
      const { data, error } = await supabase.auth.refreshSession()
      if (!error && data?.session?.access_token) { cacheSession(data.session); return data.session.access_token }
    } catch { /* ignore */ }
    return null
  }

  async function recoverFromUnauthorized() {
    if (_recovering) return
    _recovering = true
    _cachedToken = null
    _tokenExpiry = 0
    try { await supabase.auth.signOut() } catch { /* ignore */ }
    // Reload força reinício do AuthProvider → ecrã de login.
    if (typeof window !== 'undefined') window.location.reload()
  }

  function withActiveUserHeader(headers) {
    // Perfil activo da equipa (X-User-Id) — identifica quem fez a alteracao
    // no audit log quando a sessao Supabase e partilhada.
    if (headers && headers['X-User-Id']) return headers
    try {
      const id = window.localStorage.getItem('somnium:active_user_id')
      return id ? { ...headers, 'X-User-Id': id } : headers
    } catch { return headers }
  }

  async function fetchWithToken(url, options, token) {
    const next = { ...options, headers: withActiveUserHeader({ ...options.headers, 'Authorization': `Bearer ${token}` }) }
    const res = await _originalFetch(url, next)
    if (res.status === 401) {
      // Token recusado: invalidar cache e RENOVAR a sessão (não apenas reler —
      // o JWT pode ter expirado, e getSession devolveria o mesmo token morto).
      _cachedToken = null
      _tokenExpiry = 0
      const fresh = await forceRefreshToken()
      if (fresh) {
        if (fresh !== token) {
          const retry = await _originalFetch(url, { ...options, headers: withActiveUserHeader({ ...options.headers, 'Authorization': `Bearer ${fresh}` }) })
          if (retry.status !== 401) return retry
        }
        // Refresh deu um token VÁLIDO mas o endpoint continua a recusar: é um
        // problema específico do endpoint, não da sessão → NÃO expulsar o user.
        return res
      }
      // Sem token novo → sessão mesmo morta → re-login.
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
      return supabase.auth.getSession().then(async ({ data: { session } }) => {
        let token = session?.access_token
        if (token) cacheSession(session)
        // Sessão transitoriamente indisponível (PWA a retomar de background):
        // tentar renovar antes de desistir, em vez de sair sem Authorization.
        else token = await forceRefreshToken()
        if (token) return fetchWithToken(target, options, token)
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
