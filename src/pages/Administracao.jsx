import { Outlet, useNavigate, useLocation } from 'react-router-dom'
import { FileText, BookOpen, Map, Phone } from 'lucide-react'
import { Header } from '../components/layout/Header.jsx'
import { Tabs } from '../components/ui/Tabs.jsx'

const TABS = [
  { key: 'sop',        label: 'SOP',                icon: BookOpen },
  { key: 'relatorios', label: 'Relatórios',           icon: FileText },
  { key: 'regiao',     label: 'Multi-Região',        icon: Map },
  { key: 'chamadas',   label: 'Qualidade de Chamadas', icon: Phone },
]

const SUBTITLES = {
  sop:        'Procedimentos operacionais por departamento',
  relatorios: 'Sínteses semanais de reuniões e estudos estratégicos da Somnium Properties',
  regiao:     'Mercado de referência, compliance, hot zones e benchmarking por região',
  chamadas:   'KPIs de Cold/Discovery/Close Call e Pivot para Parceria (SOP 2)',
}

export function Administracao() {
  const navigate = useNavigate()
  const location = useLocation()

  const seg = location.pathname.split('/')[2] || 'sop'
  const active = TABS.some(t => t.key === seg) ? seg : 'sop'

  return (
    <div className="flex-1 flex flex-col bg-neutral-50 dark:bg-neutral-950 min-h-screen">
      <Header title="Administração" subtitle={SUBTITLES[active]} />

      <div className="bg-white dark:bg-neutral-900 px-4 sm:px-7 border-b border-neutral-200 dark:border-neutral-800">
        <Tabs
          variant="underline"
          items={TABS}
          value={active}
          onChange={(key) => navigate(`/administracao/${key}`)}
        />
      </div>

      <main className="flex-1 px-4 sm:px-7 py-5 sm:py-7 max-w-7xl w-full mx-auto">
        <Outlet />
      </main>
    </div>
  )
}
