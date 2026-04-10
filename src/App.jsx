import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { Layout } from './components/layout/Layout.jsx'
import { Dashboard } from './pages/Dashboard.jsx'
import { Financeiro } from './pages/Financeiro.jsx'
import { Alertas } from './pages/Alertas.jsx'
import { CRM } from './pages/CRM.jsx'
import { ToastProvider } from './components/ui/Toast.jsx'

export default function App() {
  return (
    <ToastProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<Dashboard />} />
            <Route path="/crm" element={<CRM />} />
            <Route path="/financeiro" element={<Financeiro />} />
            <Route path="/alertas" element={<Alertas />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </ToastProvider>
  )
}
