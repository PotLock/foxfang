import { useEffect, useState, useMemo } from 'react'
import { useAuth } from '../../hooks/useAuth'
import { 
  LayoutDashboard, 
  FolderKanban, 
  Target, 
  Bot,
  Activity,
  TrendingUp,
  Clock
} from 'lucide-react'
import './Dashboard.css'

interface DashboardStats {
  projects: number
  boards: number
  campaigns: number
  agents: number
  activeTasks: number
  completedTasks: number
}

interface StatCardProps {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: number
  trend: string
  trendUp: boolean | null
  iconClass: string
}

export default function Dashboard() {
  const { apiFetch } = useAuth()
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  
  useEffect(() => {
    const loadStats = async () => {
      try {
        const response = await apiFetch('/stats')
        if (response.ok) {
          const data = await response.json()
          setStats(data)
        }
      } catch (error) {
        console.error('Failed to load stats:', error)
      } finally {
        setIsLoading(false)
      }
    }
    
    loadStats()
  }, [apiFetch])
  
  const chartData = useMemo(() => {
    const total = (stats?.activeTasks || 0) + (stats?.completedTasks || 0) || 1
    return {
      done: Math.round(((stats?.completedTasks || 0) / total) * 100)
    }
  }, [stats])
  
  if (isLoading) {
    return (
      <div className="loading-container">
        <div className="loading-spinner" />
        <p>Loading dashboard...</p>
      </div>
    )
  }
  
  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <h1 className="dashboard-title">Dashboard</h1>
        <p className="dashboard-subtitle">Welcome to FoxFang - Your AI Marketing Platform</p>
      </header>
      
      <div className="stats-grid">
        <StatCard 
          icon={FolderKanban}
          label="Projects"
          value={stats?.projects || 0}
          trend="+2"
          trendUp={true}
          iconClass="stat-icon-blue"
        />
        
        <StatCard 
          icon={LayoutDashboard}
          label="Boards"
          value={stats?.boards || 0}
          trend="+5"
          trendUp={true}
          iconClass="stat-icon-purple"
        />
        
        <StatCard 
          icon={Target}
          label="Campaigns"
          value={stats?.campaigns || 0}
          trend="+3"
          trendUp={true}
          iconClass="stat-icon-orange"
        />
        
        <StatCard 
          icon={Bot}
          label="Agents"
          value={stats?.agents || 0}
          trend="0"
          trendUp={null}
          iconClass="stat-icon-green"
        />
      </div>
      
      <div className="dashboard-grid">
        <div className="dashboard-card">
          <div className="card-header">
            <Activity />
            <h2 className="card-title">Tasks Overview</h2>
          </div>
          
          <div className="chart-container">
            <div className="chart-wrapper">
              <svg style={{ width: '100%', height: '100%', transform: 'rotate(-90deg)' }} viewBox="0 0 36 36">
                <path
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                  fill="none"
                  stroke="var(--bg-tertiary)"
                  strokeWidth="4"
                />
                <path
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                  fill="none"
                  stroke="url(#gradient)"
                  strokeWidth="4"
                  strokeDasharray={`${chartData.done}, 100`}
                  strokeLinecap="round"
                />
                <defs>
                  <linearGradient id="gradient" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="#10b981" />
                    <stop offset="100%" stopColor="#34d399" />
                  </linearGradient>
                </defs>
              </svg>
              <div className="chart-center">
                <div>
                  <span className="chart-value">{chartData.done}</span>
                  <span className="chart-label">%</span>
                </div>
              </div>
            </div>

            <div className="chart-legend">
              <LegendItem color="legend-dot-green" label="Completed" value={stats?.completedTasks || 0} />
              <LegendItem color="legend-dot-blue" label="Active" value={stats?.activeTasks || 0} />
            </div>
          </div>

          <div className="stats-row">
            <div className="stat-box">
              <span className="stat-box-value">{stats?.activeTasks}</span>
              <span className="stat-box-label">Active Tasks</span>
            </div>
            <div className="stat-box">
              <span className="stat-box-value">{stats?.completedTasks}</span>
              <span className="stat-box-label">Completed</span>
            </div>
            <div className="stat-box">
              <span className="stat-box-value">{chartData.done}%</span>
              <span className="stat-box-label">Rate</span>
            </div>
          </div>
        </div>
        
        <div className="dashboard-card">
          <div className="card-header">
            <Clock />
            <h2 className="card-title">Recent Activity</h2>
          </div>
          
          <div className="activity-list">
            <ActivityItem 
              icon={Bot}
              title="Content Agent completed task"
              description="Created Twitter thread draft for Product Launch campaign"
              time="5 minutes ago"
            />
            
            <ActivityItem 
              icon={Target}
              title="New campaign created"
              description="Q1 Marketing Campaign by Strategy Lead"
              time="1 hour ago"
            />
            
            <ActivityItem 
              icon={FolderKanban}
              title="Board updated"
              description="Content Calendar moved 3 tasks to Done"
              time="2 hours ago"
            />
          </div>
        </div>
      </div>
    </div>
  )
}

function StatCard({ icon: Icon, label, value, trend, trendUp, iconClass }: StatCardProps) {
  return (
    <div className="stat-card">
      <div className="stat-header">
        <div className={`stat-icon ${iconClass}`}>
          <Icon className="icon-20" />
        </div>
        
        {trendUp !== null && (
          <span className={`stat-trend ${trendUp ? 'stat-trend-up' : 'stat-trend-down'}`}>
            <TrendingUp style={{ width: '14px', height: '14px' }} />
            {trend}
          </span>
        )}
      </div>
      
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
    </div>
  )
}

function LegendItem({ color, label, value }: { color: string; label: string; value: number }) {
  return (
    <div className="legend-item">
      <div className="legend-label">
        <span className={`legend-dot ${color}`} />
        <span className="legend-text">{label}</span>
      </div>
      <span className="legend-value">{value}</span>
    </div>
  )
}

interface ActivityItemProps {
  icon: React.ComponentType<{ className?: string }>
  title: string
  description: string
  time: string
}

function ActivityItem({ icon: Icon, title, description, time }: ActivityItemProps) {
  return (
    <div className="activity-item">
      <div className="activity-icon">
          <Icon className="icon-20" />
      </div>
      
      <div className="activity-content">
        <p className="activity-title">{title}</p>
        <p className="activity-description">{description}</p>
        <span className="activity-time">{time}</span>
      </div>
    </div>
  )
}
