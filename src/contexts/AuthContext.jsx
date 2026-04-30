import { createContext, useContext, useState, useEffect } from 'react'
import { supabase, authEnabled } from '../lib/supabase.js'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!authEnabled || !supabase) {
      setSession({ user: { email: 'dev', id: 'dev' } })
      setLoading(false)
      return
    }
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setLoading(false)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s)
    })
    return () => subscription.unsubscribe()
  }, [])

  async function signIn(email, password) {
    if (!supabase) throw new Error('Auth não configurado')
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
  }

  async function signOut() {
    if (supabase) await supabase.auth.signOut()
    setSession(null)
  }

  // Perfil derivado simplesmente do email da sessão (sem chamar /api/users/me)
  const profile = session?.user ? {
    id: session.user.id,
    email: session.user.email,
    nome: session.user.email?.split('@')[0] || 'Utilizador',
    iniciais: (session.user.email || '?').slice(0, 2).toUpperCase(),
    cor: '#C9A84C',
    role: 'admin', // sem enforcement frontend
  } : null

  return (
    <AuthContext.Provider value={{
      session, profile, loading, authEnabled,
      isAuthenticated: !!session,
      hasProfile: !!profile,
      role: profile?.role || null,
      areas: [],
      modules: [],
      canAccess: () => true,
      signIn, signOut,
      refreshProfile: () => {},
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth deve ser usado dentro de AuthProvider')
  return ctx
}
