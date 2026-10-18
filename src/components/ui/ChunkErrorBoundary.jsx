import { Component } from 'react'
import { ErrorState } from './ErrorState.jsx'

const RELOAD_KEY = 'somnium_chunk_reload_at'
const RELOAD_COOLDOWN_MS = 60_000

export function isChunkError(error) {
  if (!error) return false
  const msg = String(error.message || error)
  // Chrome/Firefox: "Failed to fetch dynamically imported module", "Loading chunk N failed", "ChunkLoadError"
  // Safari/WebKit: "'text/html' is not a valid JavaScript MIME type.",
  //   "Unable to load script ... because non script MIME types are not allowed",
  //   "Importing a module script failed."
  // Todos resultam da mesma causa: um chunk com hash antigo deixou de existir
  // após deploy e o rewrite SPA devolve index.html (text/html) no seu lugar.
  return /Loading chunk|Loading CSS chunk|Failed to fetch dynamically imported|dynamically imported module|ChunkLoadError|Importing a module script failed|not a valid JavaScript MIME type|non script MIME types are not allowed|Unable to load script|error loading dynamically imported module/i.test(msg)
}

// Recarrega a app com o bundle fresco (esvazia primeiro os caches do service worker).
export function reloadFresh() {
  if ('caches' in window) {
    caches.keys().then(keys => Promise.all(keys.map(k => caches.delete(k)))).finally(() => {
      window.location.reload()
    })
  } else {
    window.location.reload()
  }
}

// Recarrega sozinho perante um chunk antigo. A guarda é por tempo (e não um
// "já tentei" para a sessão inteira): com vários deploys no mesmo dia, o
// segundo chunk morto no mesmo separador também tem de recarregar sozinho.
// Só não repete se o último reload foi há menos de 1 min (evita loop).
// Devolve true se disparou o reload.
export function autoReloadOnChunkError() {
  let last = 0
  try { last = Number(sessionStorage.getItem(RELOAD_KEY)) || 0 } catch {}
  if (Date.now() - last < RELOAD_COOLDOWN_MS) return false
  try { sessionStorage.setItem(RELOAD_KEY, String(Date.now())) } catch {}
  reloadFresh()
  return true
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
    if (isChunkError(error)) autoReloadOnChunkError()
  }

  handleManualReload = () => {
    try { sessionStorage.removeItem(RELOAD_KEY) } catch {}
    reloadFresh()
  }

  render() {
    if (!this.state.hasError) return this.props.children

    // Fica por fora do Layout: ocupa o ecrã inteiro.
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface">
        {this.state.isChunk
          ? <ErrorState title="Nova versão disponível" retryVariant="primary" retryLabel="Atualizar" onRetry={this.handleManualReload}
              description="A plataforma foi atualizada enquanto tinhas esta página aberta." />
          : <ErrorState title="Algo correu mal" error={this.state.error} retryLabel="Recarregar" onRetry={this.handleManualReload} />}
      </div>
    )
  }
}
