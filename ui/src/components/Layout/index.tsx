import { useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
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
import './Layout.css'

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
    <div className="layout">
      <aside className={`sidebar ${isSidebarOpen ? 'sidebar-open' : 'sidebar-closed'}`}>
        <div className="sidebar-header">
          <div className="sidebar-brand">
            <div className="sidebar-logo">
              <Sparkles />
            </div>
            {isSidebarOpen && <span className="sidebar-title">FoxFang</span>}
          </div>
          
          <button 
            className="sidebar-toggle"
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            aria-label={isSidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
          >
            {isSidebarOpen ? <X /> : <Menu />}
          </button>
        </div>
        
        <nav className="sidebar-nav">
          {navItems.map(({ path, icon: Icon, label }) => (
            <NavLink
              key={path}
              to={path}
              className={({ isActive }: { isActive: boolean }) => 
                `nav-link ${isActive ? 'nav-link-active' : ''}`
              }
              title={!isSidebarOpen ? label : undefined}
            >
              <Icon />
              {isSidebarOpen && <span>{label}</span>}
            </NavLink>
          ))}
        </nav>
        
        <div className="sidebar-footer">
          <button 
            className="logout-button"
            onClick={handleLogout}
          >
            <LogOut />
            {isSidebarOpen && <span>Logout</span>}
          </button>
        </div>
      </aside>
      
      <main className={`main-content ${isSidebarOpen ? 'main-content-sidebar-open' : 'main-content-sidebar-closed'}`}>
        <Outlet />
      </main>
    </div>
  )
}
