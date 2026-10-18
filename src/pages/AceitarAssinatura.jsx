/**
 * F15 — Página pública de aceitação de documento.
 * Investidor recebe URL /aceitar/:token, vê resumo + clica "Aceito".
 * Sistema regista timestamp + IP + user-agent + hash do PDF.
 */
import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { Check, FileText, AlertTriangle } from 'lucide-react'

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
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [token])

  async function aceitar() {
    setAceitando(true)
    try {
      const r = await fetch(`/api/crm/assinaturas/${token}/aceitar`, { method: 'POST' })
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'Erro')
      setAceito(true)
    } catch (e) { setError(e.message) }
    finally { setAceitando(false) }
  }

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-brand-dark">
      <div className="w-6 h-6 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: '#C9A84C', borderTopColor: 'transparent' }} />
    </div>
  )

  if (error || !data) return (
    <div className="min-h-screen flex items-center justify-center bg-brand-dark text-center px-6">
      <div>
        <AlertTriangle className="w-10 h-10 mx-auto text-red-400 mb-3" />
        <p className="text-brand-gold text-2xl font-bold mb-2">Link inválido</p>
        <p className="text-ink-muted text-sm">{error || 'O pedido de assinatura não foi encontrado.'}</p>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-surface">
      <header className="bg-brand-dark text-white">
        <div className="max-w-3xl mx-auto px-6 py-6 flex items-center gap-3">
          <img src="/logo-transparent.png" alt="Somnium" className="h-10" />
          <div>
            <p className="text-brand-gold font-bold text-lg leading-tight">SOMNIUM PROPERTIES</p>
            <p className="text-[10px] uppercase tracking-wider text-ink-muted">Aceitação de Documento</p>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-8">
        <div className="bg-surface-raised rounded-2xl shadow-md p-6">
          {aceito ? (
            <div className="text-center py-6">
              <div className="w-16 h-16 mx-auto rounded-full bg-success/15 flex items-center justify-center mb-4">
                <Check className="w-10 h-10 text-success" />
              </div>
              <h1 className="text-2xl font-bold text-ink">Documento aceite</h1>
              <p className="text-sm text-ink-muted mt-2">
                A sua aceitação foi registada com sucesso em {new Date(data.aceite_em || new Date()).toLocaleString('pt-PT')}.
              </p>
              <div className="mt-6 bg-surface rounded-lg p-4 text-left">
                <p className="text-[10px] uppercase tracking-wider text-ink-muted">Comprovativo de aceitação</p>
                <p className="text-xs num text-ink-muted mt-1 break-all">Hash do documento: {data.documento_hash}</p>
                <p className="text-xs num text-ink-muted mt-1">Token: {token.slice(0, 16)}...</p>
              </div>
            </div>
          ) : (
            <>
              <div className="flex items-start gap-4 mb-6">
                <div className="w-12 h-12 rounded-lg bg-brand-gold/10 flex items-center justify-center flex-shrink-0">
                  <FileText className="w-6 h-6 text-brand-gold" />
                </div>
                <div>
                  <h1 className="text-xl font-bold text-ink">Pedido de aceitação</h1>
                  <p className="text-sm text-ink-muted mt-1">
                    Foi solicitada a sua confirmação sobre o seguinte documento da Somnium Properties.
                  </p>
                </div>
              </div>

              <div className="bg-surface rounded-xl p-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-ink-muted">Tipo de documento</span>
                  <span className="font-medium text-ink">{data.documento_tipo}</span>
                </div>
                {data.investidor_nome && (
                  <div className="flex justify-between text-sm">
                    <span className="text-ink-muted">Dirigido a</span>
                    <span className="font-medium text-ink">{data.investidor_nome}</span>
                  </div>
                )}
                <div className="flex justify-between text-sm">
                  <span className="text-ink-muted">Hash SHA-256</span>
                  <span className="num text-[10px] text-ink-muted">{data.documento_hash.slice(0, 24)}...</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-ink-muted">Solicitado em</span>
                  <span className="text-ink">{new Date(data.created_at).toLocaleString('pt-PT')}</span>
                </div>
              </div>

              <div className="mt-6 bg-warning/10 border-l-4 border-yellow-400 p-4 rounded">
                <p className="text-xs text-warning">
                  <strong>Ao clicar em "Aceito", confirmas que recebeste e estás de acordo com o conteúdo do documento referenciado.</strong> Esta aceitação ficará registada com data, hora, IP e identificador único do documento (hash) para efeitos de prova.
                </p>
              </div>

              <div className="mt-6 flex justify-end gap-3">
                <button onClick={aceitar} disabled={aceitando}
                  className="px-6 py-3 rounded-xl bg-brand-dark text-brand-gold font-semibold text-sm hover:bg-brand-dark-light disabled:opacity-50">
                  {aceitando ? 'A registar...' : 'Aceito e confirmo'}
                </button>
              </div>
            </>
          )}
        </div>

        <footer className="text-center text-[10px] text-ink-muted py-6">
          <p>Somnium Properties · {new Date().toLocaleDateString('pt-PT')}</p>
        </footer>
      </main>
    </div>
  )
}
