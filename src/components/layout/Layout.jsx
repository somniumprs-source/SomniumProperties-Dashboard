import { Outlet } from 'react-router-dom'
import { Sidebar } from './Sidebar.jsx'

export function Layout() {
  return (
    <div className="flex min-h-screen" style={{ backgroundColor: '#f5f5f0' }}>
      <Sidebar />
      <main className="flex-1 flex flex-col overflow-auto min-w-0">
        <Outlet />
      </main>
    </div>
  )
}
