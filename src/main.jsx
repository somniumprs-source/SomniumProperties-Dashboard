import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'
import { supabase, authEnabled } from './lib/supabase.js'

// Interceptar TODOS os fetch para /api/ e adicionar o token Supabase automaticamente
if (authEnabled && supabase) {
  const originalFetch = window.fetch
  window.fetch = async function (url, options = {}) {
    if (typeof url === 'string' && url.startsWith('/api')) {
      const { data: { session } } = await supabase.auth.getSession()
      if (session?.access_token) {
        options.headers = {
          ...options.headers,
          'Authorization': `Bearer ${session.access_token}`,
        }
      }
    }
    return originalFetch.call(this, url, options)
  }
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
