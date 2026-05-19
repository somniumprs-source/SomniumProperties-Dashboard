// v20: bump para invalidar bundles JS antigos que ainda passavam apiFetch
// sem o header X-Regiao em endpoints regionais (resultava em listas Coimbra
// a aparecerem mesmo com AMP seleccionado). Apaga todas as caches anteriores.
const CACHE_NAME = 'somnium-crm-v20'
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

// Permite ao cliente pedir activação imediata via postMessage({type:'SKIP_WAITING'})
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting()
  }
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

  // index.html (navegacao SPA): network-first.
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

  // Assets JS/CSS com hash: network-first (fallback ao cache só se offline).
  // Antes era cache-first, o que servia bundles antigos com chunk hashes
  // mortos após deploy — causa raiz do bug Análise Financeira / MIME error.
  // Imagens/fontes/etc continuam cache-first (não mudam de hash com deploy
  // se forem assets fixos em /public/).
  const isHashedJsCss = url.pathname.match(/\.(js|css|woff2?)$/) && /-[A-Za-z0-9_-]{6,}\./.test(url.pathname)
  if (isHashedJsCss) {
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

  // Imagens e outros estáticos: cache-first
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached
      return fetch(request).then((response) => {
        if (response.ok && url.pathname.match(/\.(png|jpg|jpeg|svg|webp|ico|woff2?)$/)) {
          const clone = response.clone()
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone))
        }
        return response
      })
    })
  )
})
