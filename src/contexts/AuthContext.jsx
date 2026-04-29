import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { supabase, authEnabled } from '../lib/supabase.js'
import { apiFetch } from '../lib/api.js'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [profileError, setProfileError] = useState(null)

  const loadProfile = useCallback(async () => {
    try {
      const r = await apiFetch('/api/users/me')
      if (!r.ok) {
        setProfile(null)
        setProfileError(r.status === 403 ? 'Conta inactiva. Contacta o administrador.' : 'Não foi possível carregar perfil.')
        return null
      }
      const u = await r.json()
      setProfile(u)
      setProfileError(null)
      return u
    } catch (e) {
      setProfileError(e.message)
      return null
    }
  }, [])

  useEffect(() => {
    if (!authEnabled || !supabase) {
      // Sem auth — acesso livre (dev mode)
      setSession({ user: { email: 'dev' } })
      loadProfile().finally(() => setLoading(false))
      return
    }

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      setSession(session)
      if (session) await loadProfile()
      setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      setSession(session)
      if (session) {
        await loadProfile()
      } else {
        setProfile(null)
        setProfileError(null)
      }
    })

    return () => subscription.unsubscribe()
  }, [loadProfile])

  async function signIn(email, password) {
    if (!supabase) throw new Error('Auth não configurado')
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
  }

  async function signOut() {
    if (supabase) await supabase.auth.signOut()
    setSession(null)
    setProfile(null)
    setProfileError(null)
  }

  function canAccess(area) {
    if (!profile?.areas) return false
    return profile.areas.includes(area)
  }

  return (
    <AuthContext.Provider value={{
      session, profile, loading, authEnabled, profileError,
      isAuthenticated: !!session,
      hasProfile: !!profile,
      role: profile?.role || null,
      areas: profile?.areas || [],
      modules: profile?.modules || [],
      canAccess,
      signIn, signOut, refreshProfile: loadProfile,
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
