/**
 * F15 — Página pública de aceitação de documento.
 * Investidor recebe URL /aceitar/:token, vê resumo + clica "Aceito".
 * Sistema regista timestamp + IP + user-agent + hash do PDF.
 */
import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { Check, FileText, AlertTriangle } from 'lucide-react'
import { friendlyError } from '../lib/friendlyError.js'

export function AceitarAssinatura() {
  const { token } = useParams()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [aceitando, setAceitando] = useState(false)
  const [aceito, setAceito] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    fetch(`/api/crm/assinaturas/${token}/validar`)
      .then(r => r.ok ? r.json() : r.json().then(e => Promise.reject(new Error(e.error || 'Erro'))))
      .then(d => {
        setData(d)
        if (d.aceite_em) setAceito(true)
      })
      .catch(e => setError(friendlyError(e.message !== 'Erro' && e.message)))
      .finally(() => setLoading(false))
  }, [token])

  async function aceitar() {
    setAceitando(true)
    try {
      const r = await fetch(`/api/crm/assinaturas/${token}/aceitar`, { method: 'POST' })
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'Erro')
      setAceito(true)
    } catch (e) { setError(friendlyError(e.message !== 'Erro' && e.message)) }
    finally { setAceitando(false) }
  }

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-brand-dark">
      <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" role="status" aria-label="A carregar" />
    </div>
  )

  if (error || !data) return (
    <div className="min-h-screen flex items-center justify-center bg-brand-dark text-center px-4 py-10">
      <div className="max-w-md w-full rounded-2xl p-6 sm:p-8 border border-white/10 bg-white/[0.03]">
        <div className="w-12 h-12 mx-auto rounded-full flex items-center justify-center mb-4 bg-red-500/10 border border-red-400/30">
          <AlertTriangle className="w-5 h-5 text-red-300" />
        </div>
        <h1 className="font-display text-2xl text-white mb-2">Link inválido</h1>
        <p className="text-white/70 text-sm">{error || 'O pedido de assinatura não foi encontrado.'}</p>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-surface">
      <header className="bg-brand-dark text-white">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-5 flex items-center gap-3">
          <img src="/logo-transparent.png" alt="" className="h-10 w-auto" />
          <div>
            <p className="font-display text-lg text-white leading-tight">Somnium Properties</p>
            <p className="text-overline uppercase text-white/60">Aceitação de documento</p>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
        <div className="bg-surface-raised border border-line rounded-2xl p-5 sm:p-6">
          {aceito ? (
            <div className="text-center py-6">
              <div className="w-16 h-16 mx-auto rounded-full bg-success/15 flex items-center justify-center mb-4">
                <Check className="w-10 h-10 text-success" />
              </div>
              <h1 className="font-display text-2xl text-ink">Documento aceite</h1>
              <p className="text-sm text-ink-muted mt-2">
                A sua aceitação foi registada com sucesso em {new Date(data.aceite_em || new Date()).toLocaleString('pt-PT')}.
              </p>
              <div className="mt-6 bg-surface rounded-lg p-4 text-left">
                <p className="text-overline uppercase text-ink-muted">Comprovativo de aceitação</p>
                <p className="text-xs num text-ink-muted mt-1 break-all">Hash do documento: {data.documento_hash}</p>
                <p className="text-xs num text-ink-muted mt-1">Token: {token.slice(0, 16)}...</p>
              </div>
            </div>
          ) : (
            <>
              <div className="flex items-start gap-4 mb-6">
                <div className="w-12 h-12 rounded-lg bg-surface-muted flex items-center justify-center flex-shrink-0">
                  <FileText className="w-6 h-6 text-ink-muted" />
                </div>
                <div>
                  <h1 className="font-display text-2xl text-ink">Pedido de aceitação</h1>
                  <p className="text-sm text-ink-muted mt-1">
                    Foi solicitada a sua confirmação sobre o seguinte documento da Somnium Properties.
                  </p>
                </div>
              </div>

              <div className="bg-surface rounded-xl p-4 space-y-2">
                <div className="flex justify-between gap-3 text-sm">
                  <span className="text-ink-muted">Tipo de documento</span>
                  <span className="font-medium text-ink">{data.documento_tipo}</span>
                </div>
                {data.investidor_nome && (
                  <div className="flex justify-between gap-3 text-sm">
                    <span className="text-ink-muted">Dirigido a</span>
                    <span className="font-medium text-ink">{data.investidor_nome}</span>
                  </div>
                )}
                <div className="flex justify-between gap-3 text-sm">
                  <span className="text-ink-muted">Hash SHA-256</span>
                  <span className="num text-caption text-ink-muted break-all text-right">{data.documento_hash?.slice(0, 24)}…</span>
                </div>
                <div className="flex justify-between gap-3 text-sm">
                  <span className="text-ink-muted">Solicitado em</span>
                  <span className="text-ink">{new Date(data.created_at).toLocaleString('pt-PT')}</span>
                </div>
              </div>

              <div className="mt-6 bg-warning/10 border-l-4 border-warning p-4 rounded">
                <p className="text-ui text-ink">
                  <strong>Ao clicar em "Aceito", confirmas que recebeste e estás de acordo com o conteúdo do documento referenciado.</strong> Esta aceitação ficará registada com data, hora, IP e identificador único do documento (hash) para efeitos de prova.
                </p>
              </div>

              <div className="mt-6 flex justify-end gap-3">
                <button onClick={aceitar} disabled={aceitando}
                  className="w-full sm:w-auto px-6 py-3 rounded-lg bg-accent text-accent-foreground font-semibold text-sm hover:bg-accent/90 transition-colors duration-fast focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 disabled:opacity-50">
                  {aceitando ? 'A registar…' : 'Aceito e confirmo'}
                </button>
              </div>
            </>
          )}
        </div>

        <footer className="text-center text-caption text-ink-muted py-6">
          <p>Somnium Properties · {new Date().toLocaleDateString('pt-PT')}</p>
        </footer>
      </main>
    </div>
  )
}
