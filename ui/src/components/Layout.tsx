import { useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { 
  LayoutDashboard, 
  FolderKanban, 
  Target, 
  Bot, 
  Settings, 
  LogOut,
  Sparkles,
  Menu,
  X
} from 'lucide-react'

const navItems = [
  { path: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { path: '/boards', icon: FolderKanban, label: 'Boards' },
  { path: '/campaigns', icon: Target, label: 'Campaigns' },
  { path: '/agents', icon: Bot, label: 'Agents' },
  { path: '/settings', icon: Settings, label: 'Settings' },
]

export default function Layout() {
  const [isSidebarOpen, setIsSidebarOpen] = useState(true)
  const { logout } = useAuth()
  const navigate = useNavigate()
  
  const handleLogout = () => {
    logout()
    navigate('/login')
  }
  
  return (
    <div className={`flex min-h-screen bg-bg-primary transition-all duration-250 ${isSidebarOpen ? '' : 'sidebar-closed'}`}>
      <aside className={`fixed top-0 left-0 bottom-0 z-100 bg-bg-secondary border-r border-border-default flex flex-col transition-all duration-250 ${isSidebarOpen ? 'w-65' : 'w-16'}`}>
        <div className="flex items-center justify-between h-16 px-4 border-b border-border-muted">
          <div className="flex items-center gap-4 overflow-hidden">
            <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 bg-gradient-to-br from-fox-primary to-fox-primary-hover">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            {isSidebarOpen && <span className="text-lg font-bold text-text-primary whitespace-nowrap">FoxFang</span>}
          </div>
          
          <button 
            className="w-8 h-8 flex items-center justify-center bg-transparent border-none rounded-lg text-text-secondary hover:bg-bg-tertiary hover:text-text-primary transition-all duration-fast cursor-pointer"
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            aria-label={isSidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
          >
            {isSidebarOpen ? <X className="w-4.5 h-4.5" /> : <Menu className="w-4.5 h-4.5" />}
          </button>
        </div>
        
        <nav className="flex-1 p-4 flex flex-col gap-1">
          {navItems.map(({ path, icon: Icon, label }) => (
            <NavLink
              key={path}
              to={path}
              className={({ isActive }: { isActive: boolean }) => 
                `flex items-center gap-4 px-4 py-3 rounded-lg text-text-secondary hover:bg-bg-tertiary hover:text-text-primary transition-all duration-fast no-underline relative ${isActive ? 'bg-bg-active text-fox-primary before:content-[""] before:absolute before:left-0 before:top-1/2 before:-translate-y-1/2 before:w-[3px] before:h-5 before:bg-fox-primary before:rounded-r' : ''}`
              }
              title={!isSidebarOpen ? label : undefined}
            >
              <Icon className="w-5 h-5 flex-shrink-0" />
              {isSidebarOpen && <span className="text-15px font-medium whitespace-nowrap">{label}</span>}
            </NavLink>
          ))}
        </nav>
        
        <div className="p-4 border-t border-border-muted">
          <button 
            className="flex items-center gap-4 w-full px-4 py-3 bg-transparent border-none rounded-lg text-text-secondary hover:bg-bg-tertiary hover:text-danger-text cursor-pointer transition-all duration-fast"
            onClick={handleLogout}
          >
            <LogOut className="w-5 h-5 flex-shrink-0" />
            {isSidebarOpen && <span className="text-15px">Logout</span>}
          </button>
        </div>
      </aside>
      
      <main className={`flex-1 min-h-screen p-8 transition-all duration-250 ${isSidebarOpen ? 'ml-65' : 'ml-16'}`}>
        <Outlet />
      </main>
    </div>
  )
}
