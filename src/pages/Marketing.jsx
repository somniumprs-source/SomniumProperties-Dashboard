import { Megaphone, Sparkles } from 'lucide-react'
import { Header } from '../components/layout/Header.jsx'

// ════════════════════════════════════════════════════════════════
// Marketing e Marca Pessoal — novo departamento.
// Placeholder estrutural: o conteúdo é montado na próxima fase.
// ════════════════════════════════════════════════════════════════
export function Marketing() {
  return (
    <div className="flex-1 flex flex-col bg-surface min-h-screen">
      <Header title="Departamento de Marketing" subtitle="Conteúdo, presença digital e marca pessoal da equipa Somnium Properties" />

      <main className="flex-1 px-4 sm:px-7 py-5 sm:py-7 max-w-7xl w-full mx-auto">
        <div className="flex flex-col items-center justify-center text-center py-20 rounded-2xl border border-dashed border-line bg-surface-raised">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4 bg-surface-muted">
            <Megaphone className="w-7 h-7 text-ink-muted" />
          </div>
          <h2 className="text-lg font-semibold text-ink">Departamento em construção</h2>
          <p className="mt-2 max-w-md text-sm text-ink-muted">
            Esta área vai centralizar a estratégia de marketing e marca pessoal. Vamos montar a estrutura na próxima fase.
          </p>
          <div className="mt-5 inline-flex items-center gap-1.5 text-overline uppercase px-3 py-1 rounded-full text-ink-muted bg-surface-muted border border-line">
            <Sparkles className="w-3 h-3" /> Em breve
          </div>
        </div>
      </main>
    </div>
  )
}
