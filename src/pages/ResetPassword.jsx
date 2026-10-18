import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase.js'
import { friendlyError } from '../lib/friendlyError.js'

// Ecrã de entrada: sempre escuro (bg-brand-dark é constante), cores brancas com opacidade.
const LABEL = 'block text-caption font-medium text-white/70 mb-1.5'
const INPUT = 'w-full rounded-lg px-3.5 py-2.5 text-sm text-white bg-white/[0.06] border border-white/15 placeholder:text-white/30 transition-colors duration-fast focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/30'

// Página pública de reset de password. Link gerado com o token como
// segmento do caminho (/resetpassword/<token>) em vez do action_link bruto
// do Supabase (que aponta para <projecto>.supabase.co) — assim o link
// enviado à pessoa é sempre limpo, no domínio da Somnium, verificado aqui
// via verifyOtp. Mantém também o formato antigo (#access_token=...) para
// links já enviados antes desta mudança.
// authEnabled com detectSessionInUrl:false (ver lib/supabase.js — evita
// session fixation), por isso a sessão é sempre criada aqui à mão.
//
// `firstAccess` (rota /get-started) reutiliza exactamente o mesmo mecanismo
// — o backend gera sempre um token de recovery — só troca o texto, para não
// confundir quem está a criar acesso pela primeira vez com linguagem de
// "repor password".
export function ResetPassword({ firstAccess = false }) {
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
      setError(/should be different|same.*password/i.test(String(err?.message)) ? 'A nova password tem de ser diferente da anterior.' : /weak|at least/i.test(String(err?.message)) ? 'A password é demasiado fraca. Usa pelo menos 6 caracteres, com letras e números.' : friendlyError(err))
      setStatus('ready')
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-brand-dark px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="text-center mb-6">
          <img src="/logo-transparent.png" alt="Somnium Properties" className="mx-auto h-28 sm:h-32 w-auto" />
        </div>

        <div className="rounded-2xl p-6 sm:p-8 border border-white/10 bg-white/[0.03]">
          <h1 className="font-display text-2xl text-white text-center mb-6">
            {firstAccess ? 'Criar a tua password' : 'Definir nova password'}
          </h1>

          {status === 'validating' && (
            <p className="text-white/60 text-sm text-center">A validar o link…</p>
          )}

          {status === 'invalid' && (
            <div role="alert" className="px-3 py-2.5 rounded-lg bg-red-500/10 border border-red-400/30 text-red-200 text-ui">
              {firstAccess
                ? 'Este link é inválido ou já expirou. Pede um novo link de acesso.'
                : 'Este link é inválido ou já expirou. Pede um novo link de reset.'}
            </div>
          )}

          {(status === 'ready' || status === 'saving') && (
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              {error && (
                <div role="alert" className="px-3 py-2.5 rounded-lg bg-red-500/10 border border-red-400/30 text-red-200 text-ui">
                  {error}
                </div>
              )}
              <div>
                <label htmlFor="reset-password" className={LABEL}>{firstAccess ? 'Password' : 'Nova password'}</label>
                <input id="reset-password" type="password" value={password} onChange={e => setPassword(e.target.value)}
                  className={INPUT} autoComplete="new-password"
                  placeholder="••••••••" autoFocus required />
              </div>
              <div>
                <label htmlFor="reset-confirmar" className={LABEL}>Confirmar password</label>
                <input id="reset-confirmar" type="password" value={confirm} onChange={e => setConfirm(e.target.value)}
                  className={INPUT} autoComplete="new-password"
                  placeholder="••••••••" required />
              </div>
              <button type="submit" disabled={status === 'saving' || !password || !confirm}
                className="w-full mt-2 py-2.5 rounded-lg text-sm font-semibold bg-accent text-accent-foreground hover:bg-accent/90 transition-colors duration-fast focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 focus-visible:ring-offset-2 focus-visible:ring-offset-brand-dark disabled:opacity-40 disabled:cursor-not-allowed">
                {status === 'saving' ? 'A guardar…' : 'Guardar password'}
              </button>
            </form>
          )}

          {status === 'done' && (
            <p className="text-white/70 text-sm text-center">Password definida. A entrar…</p>
          )}
        </div>

        <p className="text-center text-caption text-white/35 mt-6">
          Somnium Properties © 2026
        </p>
      </div>
    </div>
  )
}
