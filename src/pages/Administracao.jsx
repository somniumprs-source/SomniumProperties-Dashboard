import { Outlet, useNavigate, useLocation } from 'react-router-dom'
import { BookOpen, Map, CalendarClock, Timer, FileBarChart, Headphones } from 'lucide-react'
import { Suspense } from 'react'
import { Header } from '../components/layout/Header.jsx'
import { BrandLoader } from '../components/ui/BrandLoader.jsx'
import { TabTransition, useTabDirection } from '../components/ui/PageTransition.jsx'
import { Tabs } from '../components/ui/Tabs.jsx'

const TABS = [
  { key: 'agenda',     label: 'Agenda',             icon: CalendarClock },
  { key: 'operacoes',  label: 'Operações',          icon: Timer },
  { key: 'sop',        label: 'SOPs',                icon: BookOpen },
  { key: 'relatorios', label: 'Relatórios',           icon: FileBarChart },
  { key: 'regiao',     label: 'Regiões',        icon: Map },
  { key: 'chamadas',   label: 'Avaliação de calls', icon: Headphones },
]

const SUBTITLES = {
  agenda:     'Google Calendar e registo das operações da equipa',
  operacoes:  'Horas, custo, atividades e eficiência',
  sop:        'Procedimentos operacionais por departamento',
  relatorios: 'Sínteses semanais de reuniões e estudos estratégicos da Somnium Properties',
  regiao:     'Mercado de referência, compliance, hot zones e benchmarking por região',
  chamadas:   'KPIs de cold, discovery e close call e pivot para parceria (SOP 2)',
}

export function Administracao() {
  const navigate = useNavigate()
  const location = useLocation()

  const seg = location.pathname.split('/')[2] || 'sop'
  const active = TABS.some(t => t.key === seg) ? seg : 'sop'
  const direction = useTabDirection(active, TABS.map(t => t.key))

  return (
    <div className="flex-1 flex flex-col bg-surface min-h-screen">
      <Header title="Administração" subtitle={SUBTITLES[active]} />

      <div className="bg-surface-raised px-4 sm:px-7 border-b border-line">
        <Tabs
          variant="underline"
          items={TABS}
          value={active}
          onChange={(key) => navigate(`/administracao/${key}`)}
        />
      </div>

      <main className={`relative flex-1 px-4 sm:px-7 py-5 sm:py-7 w-full mx-auto ${['agenda', 'operacoes'].includes(active) ? '' : 'max-w-7xl'}`}>
        <TabTransition tabKey={active} direction={direction}>
          <Suspense fallback={<BrandLoader variant="inline" label={TABS.find(t => t.key === active)?.label} />}>
            <Outlet />
          </Suspense>
        </TabTransition>
      </main>
    </div>
  )
}
