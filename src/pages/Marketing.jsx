import { Suspense, lazy } from 'react'
import { UserRound } from 'lucide-react'
import { Header } from '../components/layout/Header.jsx'
import { Tabs } from '../components/ui/Tabs.jsx'
import { BrandLoader } from '../components/ui/BrandLoader.jsx'

const MarketingMarcaPessoal = lazy(() => import('./MarketingMarcaPessoal.jsx').then(m => ({ default: m.MarketingMarcaPessoal })))

// ════════════════════════════════════════════════════════════════
// Departamento de Marketing. Primeira área: Marca Pessoal (plano de
// 6 meses do Alexandre). Novas áreas entram como separadores aqui.
// ════════════════════════════════════════════════════════════════
const TABS = [
  { key: 'marca-pessoal', label: 'Marca Pessoal', icon: UserRound },
]

export function Marketing() {
  const active = 'marca-pessoal'
  return (
    <div className="flex-1 flex flex-col bg-surface min-h-screen">
      <Header title="Departamento de Marketing" subtitle="Conteúdo, presença digital e marca pessoal da equipa Somnium Properties" />

      <div className="bg-surface-raised px-4 sm:px-7 border-b border-line">
        <Tabs variant="underline" items={TABS} value={active} onChange={() => {}} />
      </div>

      <main className="flex-1 px-4 sm:px-7 py-5 sm:py-7 max-w-7xl w-full mx-auto">
        <Suspense fallback={<BrandLoader variant="inline" label="Marca Pessoal" />}>
          <MarketingMarcaPessoal />
        </Suspense>
      </main>
    </div>
  )
}
