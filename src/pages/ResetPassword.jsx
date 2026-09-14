import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase.js'

const GOLD = '#C9A84C'

// Página pública de reset de password. Link gerado com o token como
// segmento do caminho (/resetpassword/<token>) em vez do action_link bruto
// do Supabase (que aponta para <projecto>.supabase.co) — assim o link
// enviado à pessoa é sempre limpo, no domínio da Somnium, verificado aqui
// via verifyOtp. Mantém também o formato antigo (#access_token=...) para
// links já enviados antes desta mudança.
// authEnabled com detectSessionInUrl:false (ver lib/supabase.js — evita
// session fixation), por isso a sessão é sempre criada aqui à mão.
export function ResetPassword() {
  const { token } = useParams()
  const [status, setStatus] = useState('validating') // validating | ready | invalid | saving | done
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState(null)

  useEffect(() => {
    async function establishSession() {
      if (!supabase) { setStatus('invalid'); return }

      if (token) {
        const { error: otpErr } = await supabase.auth.verifyOtp({ token_hash: token, type: 'recovery' })
        history.replaceState(null, '', '/resetpassword')
        if (otpErr) { setStatus('invalid'); return }
        setStatus('ready')
        return
      }

      const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''))
      const access_token = hash.get('access_token')
      const refresh_token = hash.get('refresh_token')
      const type = hash.get('type')
      if (!access_token || !refresh_token || type !== 'recovery') { setStatus('invalid'); return }
      const { error: sessErr } = await supabase.auth.setSession({ access_token, refresh_token })
      history.replaceState(null, '', window.location.pathname)
      if (sessErr) { setStatus('invalid'); return }
      setStatus('ready')
    }
    establishSession()
  }, [])

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    if (password.length < 6) { setError('A password tem de ter pelo menos 6 caracteres'); return }
    if (password !== confirm) { setError('As passwords não coincidem'); return }
    setStatus('saving')
    try {
      const { error: updErr } = await supabase.auth.updateUser({ password })
      if (updErr) throw updErr
      setStatus('done')
      setTimeout(() => { window.location.href = '/' }, 1500)
    } catch (err) {
      setError(err.message || 'Erro ao definir password')
      setStatus('ready')
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#0d0d0d' }}>
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <img src="/logo-transparent.png" alt="Somnium Properties" className="mx-auto mb-4" style={{ height: 140 }} />
          <div className="h-px mx-auto w-32" style={{ background: `linear-gradient(90deg, transparent, ${GOLD}55, transparent)` }} />
        </div>

        <div className="rounded-2xl p-8 border" style={{ backgroundColor: '#111', borderColor: '#1a1a1a' }}>
          <h2 className="text-white text-lg font-semibold text-center mb-6">Definir nova password</h2>

          {status === 'validating' && (
            <p className="text-gray-400 text-sm text-center">A validar o link...</p>
          )}

          {status === 'invalid' && (
            <div className="p-3 rounded-lg bg-red-900/30 border border-red-800 text-red-300 text-sm text-center">
              Este link é inválido ou já expirou. Pede um novo link de reset.
            </div>
          )}

          {(status === 'ready' || status === 'saving') && (
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              {error && (
                <div className="p-3 rounded-lg bg-red-900/30 border border-red-800 text-red-300 text-sm text-center">
                  {error}
                </div>
              )}
              <div>
                <label className="text-xs text-gray-400 block mb-1.5">Nova password</label>
                <input type="password" value={password} onChange={e => setPassword(e.target.value)}
                  className="w-full rounded-lg px-4 py-2.5 text-sm text-white outline-none focus:ring-2"
                  style={{ backgroundColor: '#1a1a1a', borderColor: '#333' }}
                  placeholder="••••••••" autoFocus required />
              </div>
              <div>
                <label className="text-xs text-gray-400 block mb-1.5">Confirmar password</label>
                <input type="password" value={confirm} onChange={e => setConfirm(e.target.value)}
                  className="w-full rounded-lg px-4 py-2.5 text-sm text-white outline-none focus:ring-2"
                  style={{ backgroundColor: '#1a1a1a', borderColor: '#333' }}
                  placeholder="••••••••" required />
              </div>
              <button type="submit" disabled={status === 'saving' || !password || !confirm}
                className="w-full py-2.5 rounded-lg text-sm font-semibold text-black disabled:opacity-40 transition-opacity mt-2"
                style={{ backgroundColor: GOLD }}>
                {status === 'saving' ? 'A guardar...' : 'Guardar password'}
              </button>
            </form>
          )}

          {status === 'done' && (
            <p className="text-gray-300 text-sm text-center">Password definida. A entrar...</p>
          )}
        </div>

        <p className="text-center text-xs mt-6" style={{ color: '#333' }}>
          Somnium Properties © 2026
        </p>
      </div>
    </div>
  )
}
