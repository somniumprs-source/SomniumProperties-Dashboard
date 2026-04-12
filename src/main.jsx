import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'
import { supabase, authEnabled } from './lib/supabase.js'

// Interceptar fetch para /api/ e adicionar token Supabase automaticamente
// Usa referência directa ao fetch original para evitar loop
if (authEnabled && supabase) {
  const _originalFetch = window.fetch.bind(window)
  let _cachedToken = null
  let _tokenExpiry = 0

  window.fetch = function (url, options = {}) {
    // Só interceptar chamadas /api locais (não chamadas do Supabase SDK)
    if (typeof url === 'string' && url.startsWith('/api')) {
      const now = Date.now()
      // Usar token em cache se ainda válido (evita chamar getSession a cada fetch)
      if (_cachedToken && now < _tokenExpiry) {
        options = { ...options, headers: { ...options.headers, 'Authorization': `Bearer ${_cachedToken}` } }
        return _originalFetch(url, options)
      }
      // Buscar token fresco
      return supabase.auth.getSession().then(({ data: { session } }) => {
        if (session?.access_token) {
          _cachedToken = session.access_token
          _tokenExpiry = now + 300000 // cache 5 min
          options = { ...options, headers: { ...options.headers, 'Authorization': `Bearer ${session.access_token}` } }
        }
        return _originalFetch(url, options)
      }).catch(() => _originalFetch(url, options))
    }
    return _originalFetch(url, options)
  }
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
