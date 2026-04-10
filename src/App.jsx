import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { Layout } from './components/layout/Layout.jsx'
import { Dashboard } from './pages/Dashboard.jsx'
import { Financeiro } from './pages/Financeiro.jsx'
import { Comercial } from './pages/Comercial.jsx'
import { Marketing } from './pages/Marketing.jsx'
import { Operacoes } from './pages/Operacoes.jsx'
import { Metricas } from './pages/Metricas.jsx'
import { Alertas } from './pages/Alertas.jsx'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="/financeiro" element={<Financeiro />} />
          <Route path="/comercial" element={<Comercial />} />
          <Route path="/metricas" element={<Metricas />} />
          <Route path="/marketing" element={<Marketing />} />
          <Route path="/operacoes" element={<Operacoes />} />
          <Route path="/alertas" element={<Alertas />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
