import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Layout } from './components/layout/Layout.jsx'
import { Dashboard } from './pages/Dashboard.jsx'
import { Login } from './pages/Login.jsx'
import { ProfileSelect } from './pages/ProfileSelect.jsx'
import { ToastProvider } from './components/ui/Toast.jsx'
import { ErrorBoundary } from './components/ui/ErrorBoundary.jsx'
import { AuthProvider, useAuth } from './contexts/AuthContext.jsx'
import { ThemeProvider } from './contexts/ThemeContext.jsx'

const Financeiro = lazy(() => import('./pages/Financeiro.jsx').then(m => ({ default: m.Financeiro })))
const Alertas    = lazy(() => import('./pages/Alertas.jsx').then(m => ({ default: m.Alertas })))
const CRM        = lazy(() => import('./pages/CRM.jsx').then(m => ({ default: m.CRM })))
const Operacoes  = lazy(() => import('./pages/Operacoes.jsx').then(m => ({ default: m.Operacoes })))
const Metricas   = lazy(() => import('./pages/Metricas.jsx').then(m => ({ default: m.Metricas })))
const Projectos  = lazy(() => import('./pages/Projectos.jsx').then(m => ({ default: m.Projectos })))

function PageFallback() {
  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="w-6 h-6 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: '#C9A84C', borderTopColor: 'transparent' }} />
    </div>
  )
}

function AppRoutes() {
  const { isAuthenticated, hasProfile, loading } = useAuth()

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
  if (!hasProfile) return <ProfileSelect />

  return (
    <Suspense fallback={<PageFallback />}>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<ErrorBoundary><Dashboard /></ErrorBoundary>} />
          <Route path="/crm" element={<ErrorBoundary><CRM /></ErrorBoundary>} />
          <Route path="/projectos" element={<ErrorBoundary><Projectos /></ErrorBoundary>} />
          <Route path="/financeiro" element={<ErrorBoundary><Financeiro /></ErrorBoundary>} />
          <Route path="/operacoes" element={<ErrorBoundary><Operacoes /></ErrorBoundary>} />
          <Route path="/metricas" element={<ErrorBoundary><Metricas /></ErrorBoundary>} />
          <Route path="/alertas" element={<ErrorBoundary><Alertas /></ErrorBoundary>} />
          {/* Redirects de páginas removidas */}
          <Route path="/comercial" element={<Navigate to="/crm" replace />} />
          <Route path="/marketing" element={<Navigate to="/crm" replace />} />
        </Route>
      </Routes>
    </Suspense>
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
