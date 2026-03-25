import { useEffect, useState, useMemo } from 'react'
import { useAuth } from '../hooks/useAuth'
import { 
  LayoutDashboard, 
  FolderKanban, 
  Target, 
  Bot,
  Activity,
  TrendingUp,
  Clock
} from 'lucide-react'

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
  colorClass: string
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
      <div className="min-h-[60vh] flex flex-col items-center justify-center gap-4 text-text-secondary">
        <div className="w-10 h-10 border-3 border-bg-tertiary border-t-fox-primary rounded-full animate-spin" />
        <p>Loading dashboard...</p>
      </div>
    )
  }
  
  return (
    <div className="max-w-6xl mx-auto">
      <header className="mb-8">
        <h1 className="text-2xl font-bold text-text-primary mb-2">Dashboard</h1>
        <p className="text-text-secondary">Welcome to FoxFang - Your AI Marketing Platform</p>
      </header>
      
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
        <StatCard 
          icon={FolderKanban}
          label="Projects"
          value={stats?.projects || 0}
          trend="+2"
          trendUp={true}
          colorClass="bg-blue-500/10 text-blue-500"
        />
        
        <StatCard 
          icon={LayoutDashboard}
          label="Boards"
          value={stats?.boards || 0}
          trend="+5"
          trendUp={true}
          colorClass="bg-purple-500/10 text-purple-500"
        />
        
        <StatCard 
          icon={Target}
          label="Campaigns"
          value={stats?.campaigns || 0}
          trend="+3"
          trendUp={true}
          colorClass="bg-orange-500/10 text-orange-500"
        />
        
        <StatCard 
          icon={Bot}
          label="Agents"
          value={stats?.agents || 0}
          trend="0"
          trendUp={null}
          colorClass="bg-green-500/10 text-green-500"
        />
      </div>
      
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="bg-bg-secondary border border-border-default rounded-xl p-6">
          <div className="flex items-center gap-3 mb-6 pb-4 border-b border-border-muted">
            <Activity className="w-5 h-5 text-fox-primary" />
            <h2 className="text-lg font-semibold text-text-primary">Tasks Overview</h2>
          </div>
          
          <div className="flex items-center gap-6 mb-6">
            <div className="relative w-32 h-32">
              <svg className="w-full h-full -rotate-90" viewBox="0 0 36 36">
                <path
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                  fill="none"
                  stroke="var(--color-bg-tertiary)"
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
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="text-center">
                  <span className="text-2xl font-bold text-text-primary">{chartData.done}</span>
                  <span className="text-xs text-text-secondary block">%</span>
                </div>
              </div>
            </div>

            <div className="flex-1 space-y-3">
              <LegendItem color="bg-emerald-500" label="Completed" value={stats?.completedTasks || 0} />
              <LegendItem color="bg-blue-500" label="Active" value={stats?.activeTasks || 0} />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="text-center p-4 bg-bg-primary rounded-lg">
              <span className="block text-2xl font-bold text-text-primary mb-1">{stats?.activeTasks}</span>
              <span className="text-xs text-text-secondary uppercase tracking-wider">Active Tasks</span>
            </div>
            <div className="text-center p-4 bg-bg-primary rounded-lg">
              <span className="block text-2xl font-bold text-text-primary mb-1">{stats?.completedTasks}</span>
              <span className="text-xs text-text-secondary uppercase tracking-wider">Completed</span>
            </div>
            <div className="text-center p-4 bg-bg-primary rounded-lg">
              <span className="block text-2xl font-bold text-text-primary mb-1">{chartData.done}%</span>
              <span className="text-xs text-text-secondary uppercase tracking-wider">Rate</span>
            </div>
          </div>
        </div>
        
        <div className="bg-bg-secondary border border-border-default rounded-xl p-6">
          <div className="flex items-center gap-3 mb-6 pb-4 border-b border-border-muted">
            <Clock className="w-5 h-5 text-fox-primary" />
            <h2 className="text-lg font-semibold text-text-primary">Recent Activity</h2>
          </div>
          
          <div className="flex flex-col gap-4">
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

function StatCard({ icon: Icon, label, value, trend, trendUp, colorClass }: StatCardProps) {
  return (
    <div className="bg-bg-secondary border border-border-default rounded-xl p-5 hover:-translate-y-0.5 hover:shadow-md transition-all duration-fast">
      <div className="flex items-center justify-between mb-3">
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${colorClass}`}>
          <Icon className="w-5 h-5" />
        </div>
        
        {trendUp !== null && (
          <span className={`flex items-center gap-1 text-sm font-medium ${trendUp ? 'text-success-text' : 'text-danger-text'}`}>
            <TrendingUp className="w-3.5 h-3.5" />
            {trend}
          </span>
        )}
      </div>
      
      <div className="text-3xl font-bold text-text-primary mb-1">{value}</div>
      <div className="text-sm text-text-secondary">{label}</div>
    </div>
  )
}

function LegendItem({ color, label, value }: { color: string; label: string; value: number }) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <span className={`w-2 h-2 rounded-full ${color}`} />
        <span className="text-sm text-text-secondary">{label}</span>
      </div>
      <span className="text-sm font-medium text-text-primary">{value}</span>
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
    <div className="flex items-start gap-4 p-4 bg-bg-primary rounded-lg hover:bg-bg-tertiary transition-all duration-fast">
      <div className="w-9 h-9 bg-bg-tertiary rounded-lg flex items-center justify-center flex-shrink-0">
        <Icon className="w-5 h-5 text-fox-primary" />
      </div>
      
      <div className="flex-1 min-w-0">
        <p className="text-base font-medium text-text-primary mb-1">{title}</p>
        <p className="text-sm text-text-secondary mb-1">{description}</p>
        <span className="text-xs text-text-muted">{time}</span>
      </div>
    </div>
  )
}
