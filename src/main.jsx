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
  // Margem de 90s = igual à EXPIRY_MARGIN_MS do SDK, para renovarmos o cache
  // ANTES de o servidor recusar e nunca dependermos de clock skew do device.
  const expiryFor = (session) => {
    const exp = session?.expires_at ? session.expires_at * 1000 - 90000 : 0
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
    // Guard anti-loop que SOBREVIVE ao reload (_recovering perde-se no reload):
    // no máximo 1 reload por janela de 30s. Sem isto, uma chamada /api que dê
    // 401 logo no arranque (sem sessão) entraria em reload infinito.
    try {
      const last = Number(sessionStorage.getItem('somnium:auth_reload_at') || 0)
      if (Date.now() - last < 30000) return // já recarregámos há pouco → mostra login sem reload
      sessionStorage.setItem('somnium:auth_reload_at', String(Date.now()))
    } catch { /* sessionStorage indisponível → segue para reload */ }
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
        // Não re-tentar pedidos cujo corpo não é re-enviável (FormData/stream já
        // consumido por um upload) — re-enviar mandaria um corpo vazio/parcial.
        const bodyReusable = options.body == null || typeof options.body === 'string'
        if (fresh !== token && bodyReusable) {
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
// NAO forcamos reload quando ha versao nova. O SW ja serve network-first para
// HTML e JS/CSS (ver public/sw.js), logo o utilizador recebe sempre o codigo
// mais recente da rede, e o ChunkErrorBoundary recupera de chunks antigos.
// Antes recarregavamos a app no `controllerchange`, o que causava reloads em
// ciclo (a app "saltava" a cada ~60s) quando a CDN servia versoes a alternar
// e o SW reassumia o controlo a meio da sessao. Agora apenas avisamos UMA vez
// com um toast e deixamos o utilizador recarregar quando lhe convier.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').then((reg) => {
      // Verificar versão nova a cada 60s — apanha deploys sem precisar fechar tab.
      setInterval(() => { reg.update().catch(() => {}) }, 60_000)
      let avisou = false
      const avisarVersaoNova = () => {
        if (avisou) return
        avisou = true
        try {
          window.dispatchEvent(new CustomEvent('somnium:toast', {
            detail: { message: 'Nova versão disponível — recarrega a página quando quiseres.', type: 'info' },
          }))
        } catch { /* ambiente sem CustomEvent */ }
      }
      // Já há um SW instalado à espera de uma sessão anterior: avisar.
      if (reg.waiting && navigator.serviceWorker.controller) avisarVersaoNova()
      reg.addEventListener('updatefound', () => {
        const newSW = reg.installing
        if (!newSW) return
        newSW.addEventListener('statechange', () => {
          // installed + ja havia controller = ACTUALIZACAO (nao a 1a visita).
          if (newSW.state === 'installed' && navigator.serviceWorker.controller) {
            avisarVersaoNova()
          }
        })
      })
    }).catch(() => {})
  })
}
