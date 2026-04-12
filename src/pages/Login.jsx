import { useState } from 'react'
import { useAuth } from '../contexts/AuthContext.jsx'

const GOLD = '#C9A84C'

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
      setError(err.message === 'Invalid login credentials'
        ? 'Email ou password incorretos'
        : err.message)
    } finally { setLoading(false) }
  }

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#0d0d0d' }}>
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <img src="/logo.png" alt="Somnium Properties" className="h-16 mx-auto mb-4" />
          <div className="h-px mx-auto w-32" style={{ background: `linear-gradient(90deg, transparent, ${GOLD}55, transparent)` }} />
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="rounded-2xl p-8 border" style={{ backgroundColor: '#111', borderColor: '#1a1a1a' }}>
          <h2 className="text-white text-lg font-semibold text-center mb-6">Acesso ao Dashboard</h2>

          {error && (
            <div className="mb-4 p-3 rounded-lg bg-red-900/30 border border-red-800 text-red-300 text-sm text-center">
              {error}
            </div>
          )}

          <div className="flex flex-col gap-4">
            <div>
              <label className="text-xs text-gray-400 block mb-1.5">Email</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                className="w-full rounded-lg px-4 py-2.5 text-sm text-white outline-none focus:ring-2"
                style={{ backgroundColor: '#1a1a1a', borderColor: '#333', focusRingColor: GOLD }}
                placeholder="somniumprs@gmail.com" autoFocus required />
            </div>
            <div>
              <label className="text-xs text-gray-400 block mb-1.5">Password</label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)}
                className="w-full rounded-lg px-4 py-2.5 text-sm text-white outline-none focus:ring-2"
                style={{ backgroundColor: '#1a1a1a', borderColor: '#333' }}
                placeholder="••••••••" required />
            </div>
            <button type="submit" disabled={loading || !email || !password}
              className="w-full py-2.5 rounded-lg text-sm font-semibold text-black disabled:opacity-40 transition-opacity mt-2"
              style={{ backgroundColor: GOLD }}>
              {loading ? 'A entrar...' : 'Entrar'}
            </button>
          </div>
        </form>

        <p className="text-center text-xs mt-6" style={{ color: '#333' }}>
          Somnium Properties © 2026
        </p>
      </div>
    </div>
  )
}
