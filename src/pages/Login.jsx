import { useState } from 'react'
import { useAuth } from '../contexts/AuthContext.jsx'
import { friendlyError } from '../lib/friendlyError.js'

// Ecrã de entrada: momento de marca, sempre escuro (bg-brand-dark é constante,
// não acompanha o tema). Por isso as cores aqui são brancas com opacidade e não tokens.
const LABEL = 'block text-caption font-medium text-white/70 mb-1.5'
const INPUT = 'w-full rounded-lg px-3.5 py-2.5 text-sm text-white bg-white/[0.06] border border-white/15 placeholder:text-white/30 transition-colors duration-fast focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/30'

// Mensagens do Supabase Auth (em inglês) → linguagem simples.
function erroLogin(err) {
  const msg = String(err?.message || '')
  if (msg === 'Invalid login credentials') return 'Email ou password incorretos.'
  if (/email not confirmed/i.test(msg)) return 'O email ainda não foi confirmado. Procura a mensagem de confirmação na tua caixa de correio.'
  if (/rate limit|too many/i.test(msg)) return 'Demasiadas tentativas seguidas. Espera um pouco e tenta novamente.'
  return friendlyError(err)
}

export function Login() {
  const { signIn } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setLoading(true); setError(null)
    try {
      await signIn(email, password)
    } catch (err) {
      setError(erroLogin(err))
    } finally { setLoading(false) }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-brand-dark px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="text-center mb-6">
          <img src="/logo-transparent.png" alt="Somnium Properties" className="mx-auto h-28 sm:h-32 w-auto" />
        </div>

        <form onSubmit={handleSubmit}
          className="rounded-2xl p-6 sm:p-8 border border-white/10 bg-white/[0.03]">
          <h1 className="font-display text-2xl text-white text-center">Entrar</h1>
          <p className="text-ui text-white/60 text-center mt-1 mb-6">Acesso à plataforma Somnium</p>

          {error && (
            <div role="alert" className="mb-4 px-3 py-2.5 rounded-lg bg-red-500/10 border border-red-400/30 text-red-200 text-ui">
              {error}
            </div>
          )}

          <div className="flex flex-col gap-4">
            <div>
              <label htmlFor="login-email" className={LABEL}>Email</label>
              <input id="login-email" type="email" value={email} onChange={e => setEmail(e.target.value)}
                className={INPUT} autoComplete="username"
                placeholder="nome@exemplo.pt" autoFocus required />
            </div>
            <div>
              <label htmlFor="login-password" className={LABEL}>Password</label>
              <input id="login-password" type="password" value={password} onChange={e => setPassword(e.target.value)}
                className={INPUT} autoComplete="current-password"
                placeholder="••••••••" required />
            </div>
            <button type="submit" disabled={loading || !email || !password}
              className="w-full mt-2 py-2.5 rounded-lg text-sm font-semibold bg-accent text-accent-foreground hover:bg-accent/90 transition-colors duration-fast focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 focus-visible:ring-offset-2 focus-visible:ring-offset-brand-dark disabled:opacity-40 disabled:cursor-not-allowed">
              {loading ? 'A entrar…' : 'Entrar'}
            </button>
          </div>
        </form>

        <p className="text-center text-caption text-white/35 mt-6">
          Somnium Properties © 2026
        </p>
      </div>
    </div>
  )
}
