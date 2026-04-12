import { createContext, useContext, useState, useEffect } from 'react'
import { supabase, authEnabled } from '../lib/supabase.js'

const AuthContext = createContext(null)

const PROFILES = [
  { id: 'joao', nome: 'João Abreu', iniciais: 'JA', cor: '#C9A84C' },
  { id: 'alexandre', nome: 'Alexandre Mendes', iniciais: 'AM', cor: '#6366f1' },
]

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!authEnabled || !supabase) {
      // Sem auth — acesso livre (dev mode)
      setSession({ user: { email: 'dev' } })
      const saved = localStorage.getItem('somnium_profile')
      if (saved) {
        const p = PROFILES.find(pr => pr.id === saved)
        if (p) setProfile(p)
      }
      setLoading(false)
      return
    }

    // Verificar sessão existente
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      if (session) {
        const saved = localStorage.getItem('somnium_profile')
        if (saved) {
          const p = PROFILES.find(pr => pr.id === saved)
          if (p) setProfile(p)
        }
      }
      setLoading(false)
    })

    // Ouvir mudanças de auth
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      if (!session) {
        setProfile(null)
        localStorage.removeItem('somnium_profile')
      }
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
    setProfile(null)
    localStorage.removeItem('somnium_profile')
  }

  function selectProfile(profileId) {
    if (!profileId) {
      setProfile(null)
      localStorage.removeItem('somnium_profile')
      return
    }
    const p = PROFILES.find(pr => pr.id === profileId)
    if (p) {
      setProfile(p)
      localStorage.setItem('somnium_profile', profileId)
    }
  }

  return (
    <AuthContext.Provider value={{
      session, profile, loading, authEnabled,
      isAuthenticated: !!session,
      hasProfile: !!profile,
      profiles: PROFILES,
      signIn, signOut, selectProfile,
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
