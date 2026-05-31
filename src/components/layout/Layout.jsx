import { Sidebar } from './Sidebar.jsx'
import { VoiceButton } from '../ui/VoiceButton.jsx'
import { PageTransition } from '../ui/PageTransition.jsx'
import { ScrollToTop } from '../ui/ScrollToTop.jsx'

export function Layout() {
  return (
    <div className="flex min-h-screen bg-[#f5f5f0] dark:bg-neutral-950">
      <Sidebar />
      <main className="flex-1 flex flex-col overflow-auto min-w-0">
        <ScrollToTop />
        <PageTransition />
      </main>
      <VoiceButton />
    </div>
  )
}
