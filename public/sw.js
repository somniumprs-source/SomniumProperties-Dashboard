const CACHE_NAME = 'somnium-crm-v3'
const STATIC_ASSETS = [
  '/manifest.webmanifest',
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png',
  '/logo.png',
  '/logo-transparent.png'
]

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  )
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  )
  self.clients.claim()
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)

  if (request.method !== 'GET') return

  // API CRM e afins: NUNCA servir cache — dados sempre frescos da rede.
  if (url.pathname.startsWith('/api')) return

  // index.html (navegacao SPA): network-first. Cache-first servia HTML
  // antigo apontando para bundles JS antigos, mantendo bugs corrigidos
  // visiveis ao utilizador apos deploy.
  const isHtml = request.mode === 'navigate' || url.pathname === '/' || url.pathname.endsWith('.html')
  if (isHtml) {
    event.respondWith(
      fetch(request).then((response) => {
        if (response.ok) {
          const clone = response.clone()
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone))
        }
        return response
      }).catch(() => caches.match(request))
    )
    return
  }

  // Assets estaticos com hash no nome: cache-first
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached
      return fetch(request).then((response) => {
        if (response.ok && url.pathname.match(/\.(js|css|png|jpg|svg|woff2?)$/)) {
          const clone = response.clone()
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone))
        }
        return response
      })
    })
  )
})
