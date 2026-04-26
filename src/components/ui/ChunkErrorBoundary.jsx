import { Component } from 'react'

const RELOAD_KEY = 'somnium_chunk_reload_attempted'

function isChunkError(error) {
  if (!error) return false
  const msg = String(error.message || error)
  return /Loading chunk|Loading CSS chunk|Failed to fetch dynamically imported|dynamically imported module|ChunkLoadError|Importing a module script failed/i.test(msg)
}

export class ChunkErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, isChunk: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, isChunk: isChunkError(error), error }
  }

  componentDidCatch(error, info) {
    console.error('[ChunkErrorBoundary]', error, info?.componentStack)
    if (isChunkError(error)) {
      const alreadyReloaded = sessionStorage.getItem(RELOAD_KEY) === '1'
      if (!alreadyReloaded) {
        sessionStorage.setItem(RELOAD_KEY, '1')
        // Esvaziar caches do service worker para garantir bundle fresco
        if ('caches' in window) {
          caches.keys().then(keys => Promise.all(keys.map(k => caches.delete(k)))).finally(() => {
            window.location.reload()
          })
        } else {
          window.location.reload()
        }
      }
    } else {
      sessionStorage.removeItem(RELOAD_KEY)
    }
  }

  handleManualReload = () => {
    sessionStorage.removeItem(RELOAD_KEY)
    if ('caches' in window) {
      caches.keys().then(keys => Promise.all(keys.map(k => caches.delete(k)))).finally(() => {
        window.location.reload()
      })
    } else {
      window.location.reload()
    }
  }

  render() {
    if (!this.state.hasError) return this.props.children

    if (this.state.isChunk) {
      return (
        <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#0d0d0d' }}>
          <div className="text-center max-w-md px-6">
            <p className="text-sm mb-4" style={{ color: '#C9A84C' }}>Nova versão disponível</p>
            <button onClick={this.handleManualReload}
              className="px-5 py-2.5 text-sm font-semibold rounded-xl"
              style={{ backgroundColor: '#C9A84C', color: '#0d0d0d' }}>
              Actualizar
            </button>
          </div>
        </div>
      )
    }

    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="text-center max-w-md px-6">
          <h2 className="text-lg font-semibold text-neutral-800 mb-2">Algo correu mal</h2>
          <p className="text-sm text-neutral-500 mb-4">
            {this.state.error?.message || 'Erro inesperado.'}
          </p>
          <button onClick={this.handleManualReload}
            className="px-4 py-2 text-sm font-medium text-white rounded-lg"
            style={{ backgroundColor: '#C9A84C' }}>
            Recarregar
          </button>
        </div>
      </div>
    )
  }
}
