import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Layout } from './components/layout/Layout.jsx'
import { Dashboard } from './pages/Dashboard.jsx'
import { Login } from './pages/Login.jsx'
import { NoAccess } from './pages/NoAccess.jsx'
import { ToastProvider } from './components/ui/Toast.jsx'
import { ErrorBoundary } from './components/ui/ErrorBoundary.jsx'
import { ChunkErrorBoundary } from './components/ui/ChunkErrorBoundary.jsx'
import { AuthProvider, useAuth } from './contexts/AuthContext.jsx'
import { ThemeProvider } from './contexts/ThemeContext.jsx'

const Financeiro  = lazy(() => import('./pages/Financeiro.jsx').then(m => ({ default: m.Financeiro })))
const Alertas     = lazy(() => import('./pages/Alertas.jsx').then(m => ({ default: m.Alertas })))
const CRM         = lazy(() => import('./pages/CRM.jsx').then(m => ({ default: m.CRM })))
const Operacoes   = lazy(() => import('./pages/Operacoes.jsx').then(m => ({ default: m.Operacoes })))
const Metricas    = lazy(() => import('./pages/Metricas.jsx').then(m => ({ default: m.Metricas })))
const Projectos   = lazy(() => import('./pages/Projectos.jsx').then(m => ({ default: m.Projectos })))
const Utilizadores = lazy(() => import('./pages/Utilizadores.jsx').then(m => ({ default: m.Utilizadores })))

function PageFallback() {
  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="w-6 h-6 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: '#C9A84C', borderTopColor: 'transparent' }} />
    </div>
  )
}

function Guarded({ area, children }) {
  const { canAccess } = useAuth()
  if (!canAccess(area)) return <NoAccess area={area} />
  return children
}

function AppRoutes() {
  const { isAuthenticated, hasProfile, loading, profileError } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#0d0d0d' }}>
        <div className="flex flex-col items-center gap-3">
          <img src="/logo-transparent.png" alt="Somnium" className="opacity-50" style={{ height: 48 }} />
          <div className="w-6 h-6 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: '#C9A84C', borderTopColor: 'transparent' }} />
        </div>
      </div>
    )
  }

  if (!isAuthenticated) return <Login />
  if (!hasProfile) return <NoAccess message={profileError || 'Sem perfil associado a esta conta.'} />

  return (
    <ChunkErrorBoundary>
      <Suspense fallback={<PageFallback />}>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<ErrorBoundary><Dashboard /></ErrorBoundary>} />
            <Route path="/crm" element={<ErrorBoundary><Guarded area="crm"><CRM /></Guarded></ErrorBoundary>} />
            <Route path="/projectos" element={<ErrorBoundary><Guarded area="projectos"><Projectos /></Guarded></ErrorBoundary>} />
            <Route path="/financeiro" element={<ErrorBoundary><Guarded area="financeiro"><Financeiro /></Guarded></ErrorBoundary>} />
            <Route path="/operacoes" element={<ErrorBoundary><Guarded area="operacoes"><Operacoes /></Guarded></ErrorBoundary>} />
            <Route path="/metricas" element={<ErrorBoundary><Guarded area="metricas"><Metricas /></Guarded></ErrorBoundary>} />
            <Route path="/alertas" element={<ErrorBoundary><Guarded area="alertas"><Alertas /></Guarded></ErrorBoundary>} />
            <Route path="/admin/utilizadores" element={<ErrorBoundary><Guarded area="admin"><Utilizadores /></Guarded></ErrorBoundary>} />
            {/* Redirects de páginas removidas */}
            <Route path="/comercial" element={<Navigate to="/crm" replace />} />
            <Route path="/marketing" element={<Navigate to="/crm" replace />} />
          </Route>
        </Routes>
      </Suspense>
    </ChunkErrorBoundary>
  )
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <ToastProvider>
          <BrowserRouter>
            <AppRoutes />
          </BrowserRouter>
        </ToastProvider>
      </AuthProvider>
    </ThemeProvider>
  )
}
