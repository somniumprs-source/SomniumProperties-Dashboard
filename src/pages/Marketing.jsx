import { Megaphone, Sparkles } from 'lucide-react'
import { Header } from '../components/layout/Header.jsx'

// ════════════════════════════════════════════════════════════════
// Marketing e Marca Pessoal — novo departamento.
// Placeholder estrutural: o conteúdo é montado na próxima fase.
// ════════════════════════════════════════════════════════════════
export function Marketing() {
  return (
    <div className="flex-1 flex flex-col bg-neutral-50 dark:bg-neutral-950 min-h-screen">
      <Header title="Marketing e Marca Pessoal" subtitle="Conteúdo, presença digital e marca pessoal da equipa Somnium Properties" />

      <main className="flex-1 px-4 sm:px-7 py-5 sm:py-7 max-w-7xl w-full mx-auto">
        <div className="flex flex-col items-center justify-center text-center py-20 rounded-2xl border border-dashed border-neutral-300 dark:border-neutral-800 bg-white dark:bg-neutral-900">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4"
            style={{ backgroundColor: 'rgba(201,168,76,0.1)', border: '1px solid rgba(201,168,76,0.25)' }}>
            <Megaphone className="w-7 h-7" style={{ color: '#C9A84C' }} />
          </div>
          <h2 className="text-lg font-semibold text-neutral-800 dark:text-neutral-100">Departamento em construção</h2>
          <p className="mt-2 max-w-md text-sm text-neutral-500 dark:text-neutral-400">
            Esta área vai centralizar a estratégia de marketing e marca pessoal. Vamos montar a estrutura na próxima fase.
          </p>
          <div className="mt-5 inline-flex items-center gap-1.5 text-[11px] uppercase tracking-widest px-3 py-1 rounded-full"
            style={{ color: '#C9A84C', backgroundColor: 'rgba(201,168,76,0.08)', border: '1px solid rgba(201,168,76,0.25)' }}>
            <Sparkles className="w-3 h-3" /> Em breve
          </div>
        </div>
      </main>
    </div>
  )
}
