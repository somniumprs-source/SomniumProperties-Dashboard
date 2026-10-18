import { Sidebar } from './Sidebar.jsx'
import { PageTransition } from '../ui/PageTransition.jsx'
import { ScrollToTop } from '../ui/ScrollToTop.jsx'

export function Layout() {
  return (
    <div className="flex min-h-screen bg-surface">
      <Sidebar />
      <main className="flex-1 flex flex-col overflow-auto min-w-0 relative">
        <ScrollToTop />
        <PageTransition />
      </main>
    </div>
  )
}
