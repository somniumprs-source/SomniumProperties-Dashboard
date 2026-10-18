import { Component } from 'react'
import { ErrorState } from './ErrorState.jsx'
import { isChunkError, autoReloadOnChunkError, reloadFresh } from './ChunkErrorBoundary.jsx'

export class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, isChunk: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, isChunk: isChunkError(error), error }
  }

  componentDidCatch(error, info) {
    console.error('[ErrorBoundary]', error, info.componentStack)
    // Chunk com hash antigo (separador aberto desde antes de um deploy): este
    // boundary fica por dentro do ChunkErrorBoundary e apanhava o erro primeiro.
    // "Tentar novamente" não resolve — o React.lazy guarda o import falhado —
    // por isso recarrega-se a app, tal como no ChunkErrorBoundary.
    if (isChunkError(error)) autoReloadOnChunkError()
  }

  render() {
    if (this.state.hasError && this.state.isChunk) {
      return (
        <ErrorState title="Nova versão disponível" retryVariant="primary" retryLabel="Atualizar" onRetry={reloadFresh}
          description="A plataforma foi atualizada enquanto tinhas esta página aberta." />
      )
    }
    if (this.state.hasError) {
      return (
        <ErrorState title="Algo correu mal nesta página" error={this.state.error}
          onRetry={() => this.setState({ hasError: false, error: null })} />
      )
    }
    return this.props.children
  }
}
