import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { supabase, authEnabled } from '../lib/supabase.js'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)
  const [profile, setProfile] = useState(null)

  // Aceita um session opcional (vindo de getSession já feito) para evitar
  // chamada duplicada a supabase.auth.getSession(). Quando ausente, faz
  // getSession internamente (mantém compat. com onAuthStateChange).
  const refreshProfile = useCallback(async (sessionArg) => {
    if (!authEnabled || !supabase) {
      // Modo dev: assume admin
      setProfile({
        id: 'dev', email: 'dev@local', nome: 'Dev',
        iniciais: 'DV', cor: '#C9A84C',
        role: 'admin', areas: ['dashboard', 'crm', 'projectos', 'financeiro', 'operacoes', 'metricas', 'alertas', 'admin'],
        modules: [],
      })
      return
    }
    try {
      let session = sessionArg
      if (session === undefined) {
        const r = await supabase.auth.getSession()
        session = r.data.session
      }
      if (!session?.access_token) { setProfile(null); return }
      const r = await fetch('/api/users/me', { headers: { Authorization: `Bearer ${session.access_token}` } })
      if (!r.ok) { setProfile(null); return }
      const j = await r.json()
      setProfile({
        id: j.id, email: j.email, nome: j.nome || j.email?.split('@')[0] || 'Utilizador',
        iniciais: (j.nome || j.email || '?').slice(0, 2).toUpperCase(),
        cor: j.cor || '#C9A84C',
        role: j.role, areas: j.areas || [], modules: j.modules || [],
      })
    } catch { setProfile(null) }
  }, [])

  useEffect(() => {
    if (!authEnabled || !supabase) {
      setSession({ user: { email: 'dev', id: 'dev' } })
      refreshProfile()
      setLoading(false)
      return
    }
    // Safety: nunca deixar o utilizador preso no splash se Supabase pendurar.
    // 2s é suficiente para uma rede típica; em rede má prossegue sem sessão e
    // o utilizador faz login depois (em vez de ver splash 6s).
    const timeoutId = setTimeout(() => {
      console.warn('[auth] getSession timeout — a prosseguir sem sessão')
      setLoading(false)
    }, 2000)
    supabase.auth.getSession()
      .then(async ({ data: { session } }) => {
        clearTimeout(timeoutId)
        setSession(session)
        // Passa a session já obtida — evita 2º getSession dentro de refreshProfile
        if (session) await refreshProfile(session)
        setLoading(false)
      })
      .catch((err) => {
        clearTimeout(timeoutId)
        console.error('[auth] getSession falhou:', err)
        setLoading(false)
      })
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, s) => {
      setSession(s)
      // TOKEN_REFRESHED (renovação ~horária do JWT) não muda o perfil — evitar
      // o fetch redundante a /api/users/me a cada renovação.
      if (event === 'TOKEN_REFRESHED') return
      if (s) await refreshProfile(s); else setProfile(null)
    })
    return () => { clearTimeout(timeoutId); subscription.unsubscribe() }
  }, [refreshProfile])

  async function signIn(email, password) {
    if (!supabase) throw new Error('Auth não configurado')
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
  }

  async function signOut() {
    if (supabase) await supabase.auth.signOut()
    setSession(null)
    setProfile(null)
  }

  const role = profile?.role || null
  const areas = profile?.areas || []
  const modules = profile?.modules || []

  return (
    <AuthContext.Provider value={{
      session, profile, loading, authEnabled,
      isAuthenticated: !!session,
      hasProfile: !!profile,
      role, areas, modules,
      isInvestidor: role === 'investidor',
      isReadOnly: role === 'investidor' || role === 'parceiro',
      canAccess: (area) => role === 'admin' || areas.includes(area),
      signIn, signOut,
      refreshProfile,
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
