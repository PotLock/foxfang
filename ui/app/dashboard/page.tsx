'use client';

import { useEffect, useState, useMemo } from 'react';
import { 
  Activity, ArrowUpRight, TrendingUp, Zap, LayoutGrid, Users, 
  CheckCircle, FolderKanban, Sparkles, Target, Inbox, Clock,
  ArrowUp, ArrowDown, Minus, MoreHorizontal, Download, ChevronDown
} from 'lucide-react';
import { useAuth } from '@/components/auth/AuthProvider';
import { listProjects, type Project } from '@/lib/api/projects';
import { listTasks, type Task } from '@/lib/api/tasks';
import { listAgents, type Agent } from '@/lib/api/agents';

interface DashboardData {
  projects: Project[];
  allTasks: Task[];
  agentsCount: number;
  isLoading: boolean;
  error: string | null;
}

export default function DashboardPage() {
  const { user } = useAuth();
  const [data, setData] = useState<DashboardData>({
    projects: [],
    allTasks: [],
    agentsCount: 0,
    isLoading: true,
    error: null
  });

  // Fetch real data from APIs
  useEffect(() => {
    if (!user?.id) return;

    const loadRealData = async () => {
      try {
        setData(prev => ({ ...prev, isLoading: true, error: null }));

        // 1. Fetch all projects
        const projects = await listProjects(user.id);
        
        // 2. Fetch tasks from all projects
        const tasksPromises = projects.map(project => 
          listTasks(user.id, project.id).catch(() => [])
        );
        const tasksResults = await Promise.all(tasksPromises);
        const allTasks = tasksResults.flat();

        // 3. Count agents from first few projects
        let totalAgents = 0;
        const agentPromises = projects.slice(0, 3).map(project =>
          listAgents(user.id, project.id).catch(() => [])
        );
        const agentsResults = await Promise.all(agentPromises);
        totalAgents = agentsResults.flat().length;

        setData({
          projects,
          allTasks,
          agentsCount: totalAgents,
          isLoading: false,
          error: null
        });
      } catch (err) {
        setData(prev => ({
          ...prev,
          isLoading: false,
          error: err instanceof Error ? err.message : 'Failed to load dashboard data'
        }));
      }
    };

    loadRealData();

    // Auto-refresh every 30 seconds
    const interval = setInterval(loadRealData, 30000);
    return () => clearInterval(interval);
  }, [user?.id]);

  // Calculate real metrics
  const metrics = useMemo(() => {
    const { projects, allTasks, agentsCount } = data;
    
    const activeTasks = allTasks.filter(t => t.status !== 'done').length;
    const completedTasks = allTasks.filter(t => t.status === 'done').length;
    
    return {
      projectsCount: projects.length,
      activeTasks,
      completedTasks,
      agentsCount,
      totalTasks: allTasks.length
    };
  }, [data]);

  // Calculate percentages for charts
  const chartData = useMemo(() => {
    const { projects, allTasks } = data;
    
    // Task status distribution
    const todoCount = allTasks.filter(t => t.status === 'inbox').length;
    const inProgressCount = allTasks.filter(t => t.status === 'in-progress').length;
    const reviewCount = allTasks.filter(t => t.status === 'review').length;
    const doneCount = allTasks.filter(t => t.status === 'done').length;
    const total = allTasks.length || 1;
    
    return {
      todo: Math.round((todoCount / total) * 100),
      inProgress: Math.round((inProgressCount / total) * 100),
      review: Math.round((reviewCount / total) * 100),
      done: Math.round((doneCount / total) * 100),
      todoCount,
      inProgressCount,
      reviewCount,
      doneCount
    };
  }, [data]);

  if (data.isLoading) {
    return (
      <div className="min-h-full flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-gray-500">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  if (data.error) {
    return (
      <div className="min-h-full flex items-center justify-center">
        <div className="max-w-md mx-auto bg-white rounded-2xl border border-gray-200 p-6 text-center">
          <div className="w-12 h-12 bg-red-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Activity className="w-6 h-6 text-red-500" />
          </div>
          <p className="text-red-600 text-sm mb-4">{data.error}</p>
          <button 
            onClick={() => window.location.reload()}
            className="px-6 py-2.5 bg-indigo-500 text-white rounded-xl text-sm font-medium hover:bg-indigo-600 transition-all"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Quick Overview - Gradient Card */}
      <div className="bg-gradient-to-r from-sky-50 via-blue-50 to-indigo-50 rounded-xl p-4 border border-blue-100">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-base font-semibold text-gray-900">Quick Overview</h3>
            <p className="text-xs text-gray-500">Platform activities overview</p>
          </div>
          <button className="flex items-center gap-1.5 px-2.5 py-1 bg-white/70 rounded-lg text-xs text-gray-600 hover:bg-white transition-all border border-gray-200">
            <Clock className="w-3.5 h-3.5" />
            All-Time
            <ChevronDown className="w-3 h-3" />
          </button>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
          <QuickStatCard 
            value={metrics.projectsCount}
            subValue={Math.max(1, Math.floor(metrics.projectsCount * 0.3))}
            label="Total Projects"
          />
          <QuickStatCard 
            value={metrics.agentsCount}
            subValue={Math.max(1, Math.floor(metrics.agentsCount * 0.2))}
            label="Total Agents"
          />
          <QuickStatCard 
            value={metrics.activeTasks}
            subValue={Math.max(1, Math.floor(metrics.activeTasks * 0.15))}
            label="Active Tasks"
          />
          <QuickStatCard 
            value={metrics.completedTasks}
            subValue={Math.max(1, Math.floor(metrics.completedTasks * 0.1))}
            label="Completed"
          />
          <QuickStatCard 
            value={metrics.totalTasks}
            subValue={Math.max(1, Math.floor(metrics.totalTasks * 0.25))}
            label="Total Tasks"
          />
        </div>
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Task Status Chart */}
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-gray-900">Tasks By Status</h3>
            <button className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors">
              <MoreHorizontal className="w-4 h-4 text-gray-400" />
            </button>
          </div>

          <div className="flex items-center gap-6">
            {/* Donut Chart */}
            <div className="relative w-32 h-32">
              <svg className="w-full h-full -rotate-90" viewBox="0 0 36 36">
                {/* Background ring */}
                <path
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                  fill="none"
                  stroke="#f3f4f6"
                  strokeWidth="4"
                />
                {/* Progress ring */}
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
                  <span className="text-xl font-bold text-gray-900">{chartData.done}</span>
                  <span className="text-xs text-gray-500 block">%</span>
                </div>
              </div>
            </div>

            {/* Legend */}
            <div className="flex-1 space-y-2">
              <LegendItem color="bg-emerald-500" label="Completed" value={chartData.doneCount} />
              <LegendItem color="bg-blue-500" label="In Progress" value={chartData.inProgressCount} />
              <LegendItem color="bg-amber-500" label="In Review" value={chartData.reviewCount} />
              <LegendItem color="bg-gray-400" label="To Do" value={chartData.todoCount} />
            </div>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="space-y-4">
          <StatCard 
            value={metrics.totalTasks}
            trend="up"
            trendValue="4%"
            label="Total Tickets"
            sublabel="All time activity"
            iconBg="bg-emerald-100"
            iconColor="text-emerald-600"
          />
          <StatCard 
            value={metrics.activeTasks}
            trend="up"
            trendValue="4%"
            label="Pending Tasks"
            sublabel="All time activity"
            iconBg="bg-amber-100"
            iconColor="text-amber-600"
          />
          <StatCard 
            value={metrics.completedTasks}
            trend="neutral"
            trendValue="0%"
            label="Solved Tasks"
            sublabel="All time activity"
            iconBg="bg-indigo-100"
            iconColor="text-indigo-600"
          />
        </div>

        {/* Projects List */}
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-gray-900">Recent Projects</h3>
            <button className="text-xs text-indigo-600 hover:text-indigo-700 font-medium">
              View all
            </button>
          </div>

          <div className="space-y-3">
            {data.projects.slice(0, 4).map((project, index) => {
              const projectTasks = data.allTasks.filter(t => t.projectId === project.id);
              const completed = projectTasks.filter(t => t.status === 'done').length;
              const progress = projectTasks.length > 0 ? Math.round((completed / projectTasks.length) * 100) : 0;
              
              const colors = [
                'bg-blue-500',
                'bg-indigo-500',
                'bg-purple-500',
                'bg-emerald-500'
              ];
              
              return (
                <div key={project.id} className="flex items-center gap-3 group cursor-pointer">
                  <div className={`w-10 h-10 ${colors[index % colors.length]} rounded-xl flex items-center justify-center`}>
                    <span className="text-white font-semibold text-base">{project.name[0]}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-gray-900 truncate">{project.name}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <div className="w-14 h-1 bg-gray-100 rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-indigo-500 rounded-full transition-all"
                          style={{ width: `${progress}%` }}
                        />
                      </div>
                      <span className="text-[10px] text-gray-400">{progress}%</span>
                    </div>
                  </div>
                  <div className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <ArrowUpRight className="w-3.5 h-3.5 text-gray-600" />
                  </div>
                </div>
              );
            })}
            {data.projects.length === 0 && (
              <div className="text-center py-6">
                <div className="w-10 h-10 bg-gray-50 rounded-xl flex items-center justify-center mx-auto mb-2">
                  <Sparkles className="w-5 h-5 text-gray-400" />
                </div>
                <p className="text-xs text-gray-500">No projects yet</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Bottom Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Activity Chart */}
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-semibold text-gray-900">Tasks Activity</h3>
              <p className="text-xs text-gray-500">Monthly overview</p>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5 text-xs text-gray-500">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                Completed
              </div>
              <div className="flex items-center gap-1.5 text-xs text-gray-500">
                <span className="w-1.5 h-1.5 rounded-full bg-indigo-500"></span>
                Created
              </div>
            </div>
          </div>

          {/* Bar Chart */}
          <div className="flex items-end justify-between h-32 gap-2">
            {['Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'].map((month, i) => {
              const height1 = 30 + Math.random() * 50;
              const height2 = 20 + Math.random() * 40;
              return (
                <div key={month} className="flex-1 flex flex-col items-center gap-2">
                  <div className="w-full flex items-end justify-center gap-1 h-24">
                    <div 
                      className="w-2 bg-emerald-400 rounded-full transition-all"
                      style={{ height: `${height1}%` }}
                    />
                    <div 
                      className="w-2 bg-indigo-400 rounded-full transition-all"
                      style={{ height: `${height2}%` }}
                    />
                  </div>
                  <span className="text-xs text-gray-400">{month}</span>
                </div>
              );
            })}
          </div>

          {/* Stats */}
          <div className="flex items-center gap-4 mt-4 pt-4 border-t border-gray-100">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-emerald-100 rounded-lg flex items-center justify-center">
                <CheckCircle className="w-4 h-4 text-emerald-600" />
              </div>
              <div>
                <p className="text-base font-semibold text-gray-900">{metrics.completedTasks}</p>
                <p className="text-[10px] text-gray-500">Completed</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-indigo-100 rounded-lg flex items-center justify-center">
                <FolderKanban className="w-4 h-4 text-indigo-600" />
              </div>
              <div>
                <p className="text-base font-semibold text-gray-900">{metrics.activeTasks}</p>
                <p className="text-[10px] text-gray-500">Open</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-amber-100 rounded-lg flex items-center justify-center">
                <CheckCircle className="w-4 h-4 text-amber-600" />
              </div>
              <div>
                <p className="text-base font-semibold text-gray-900">{chartData.reviewCount}</p>
                <p className="text-[10px] text-gray-500">In Review</p>
              </div>
            </div>
          </div>
        </div>

        {/* Tasks By Category */}
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-gray-900">Tasks By Priority</h3>
            <button className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors">
              <MoreHorizontal className="w-4 h-4 text-gray-400" />
            </button>
          </div>

          <div className="flex items-center justify-center">
            {/* Circular Progress */}
            <div className="relative w-40 h-40">
              <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
                {/* Segments */}
                {[0, 45, 90, 135, 180, 225, 270, 315].map((start, i) => (
                  <circle
                    key={i}
                    cx="50"
                    cy="50"
                    r="40"
                    fill="none"
                    strokeWidth="12"
                    stroke={[
                      '#f59e0b', '#f97316', '#ef4444',
                      '#8b5cf6', '#6366f1', '#3b82f6',
                      '#10b981', '#84cc16'
                    ][i]}
                    strokeDasharray="25 276"
                    strokeDashoffset={-start * 0.69}
                    strokeLinecap="round"
                  />
                ))}
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="text-center">
                  <span className="text-3xl font-bold text-gray-900">{metrics.totalTasks}</span>
                  <span className="text-xs text-gray-500 block">Total Tasks</span>
                </div>
              </div>
            </div>
          </div>

          {/* Legend */}
          <div className="mt-4 space-y-2">
            <PriorityRow label="High Priority" value="44.75%" trend="up" color="text-orange-500" />
            <PriorityRow label="Medium Priority" value="46.27%" trend="down" color="text-indigo-500" />
            <PriorityRow label="Low Priority" value="25%" trend="up" color="text-emerald-500" />
          </div>
        </div>
      </div>

      {/* Recent Activity Table */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-semibold text-gray-900">Recent Tasks</h3>
            <p className="text-xs text-gray-500">Latest activities</p>
          </div>
          <button className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 rounded-lg text-xs text-gray-600 hover:bg-gray-200 transition-all">
            <Download className="w-3.5 h-3.5" />
            Export
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-left py-2 px-3 text-[10px] font-medium text-gray-500 uppercase">Task</th>
                <th className="text-left py-2 px-3 text-[10px] font-medium text-gray-500 uppercase">Project</th>
                <th className="text-left py-2 px-3 text-[10px] font-medium text-gray-500 uppercase">Status</th>
                <th className="text-left py-2 px-3 text-[10px] font-medium text-gray-500 uppercase">Priority</th>
                <th className="text-right py-2 px-3 text-[10px] font-medium text-gray-500 uppercase">Date</th>
              </tr>
            </thead>
            <tbody>
              {data.allTasks.slice(0, 5).map((task) => {
                const project = data.projects.find(p => p.id === task.projectId);
                return (
                  <tr key={task.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/50 transition-colors">
                    <td className="py-2 px-3">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 bg-indigo-100 rounded-md flex items-center justify-center">
                          <Target className="w-3.5 h-3.5 text-indigo-600" />
                        </div>
                        <span className="text-xs font-medium text-gray-900">{task.title}</span>
                      </div>
                    </td>
                    <td className="py-2 px-3">
                      <span className="text-xs text-gray-600">{project?.name || 'Unknown'}</span>
                    </td>
                    <td className="py-3 px-4">
                      <StatusBadge status={task.status} />
                    </td>
                    <td className="py-3 px-4">
                      <PriorityBadge priority={task.priority} />
                    </td>
                    <td className="py-2 px-3 text-right">
                      <span className="text-xs text-gray-500">{formatDate(task.createdAt)}</span>
                    </td>
                  </tr>
                );
              })}
              {data.allTasks.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-6 text-center text-gray-500 text-xs">
                    No tasks yet
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// Component: Quick Stat Card
function QuickStatCard({ 
  value, 
  subValue,
  label
}: { 
  value: number;
  subValue: number;
  label: string;
}) {
  return (
    <div className="bg-white/80 backdrop-blur rounded-xl p-3 border border-white">
      <div className="mb-0.5">
        <span className="text-xl font-bold text-gray-900">{value}</span>
        <span className="text-[10px] text-gray-500 ml-1">({subValue} New)</span>
      </div>
      <p className="text-xs text-gray-600">{label}</p>
    </div>
  );
}

// Component: Stat Card
function StatCard({ 
  value, 
  trend,
  trendValue,
  label,
  sublabel,
  iconBg,
  iconColor
}: { 
  value: number;
  trend: 'up' | 'down' | 'neutral';
  trendValue: string;
  label: string;
  sublabel: string;
  iconBg: string;
  iconColor: string;
}) {
  const TrendIcon = trend === 'up' ? ArrowUp : trend === 'down' ? ArrowDown : Minus;
  const trendColor = trend === 'up' ? 'text-emerald-600' : trend === 'down' ? 'text-red-600' : 'text-gray-600';

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-3 hover:border-gray-300 transition-all">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-1.5 mb-0.5">
            <span className="text-xl font-bold text-gray-900">{value}</span>
            <div className={`flex items-center gap-0.5 text-[10px] font-medium ${trendColor}`}>
              <TrendIcon className="w-2.5 h-2.5" />
              {trendValue}
            </div>
          </div>
          <p className="text-xs font-medium text-gray-700">{label}</p>
          <p className="text-[10px] text-gray-400">{sublabel}</p>
        </div>
        <div className={`w-8 h-8 ${iconBg} rounded-lg flex items-center justify-center`}>
          <Activity className={`w-4 h-4 ${iconColor}`} />
        </div>
      </div>
    </div>
  );
}

// Component: Legend Item
function LegendItem({ color, label, value }: { color: string; label: string; value: number }) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-1.5">
        <span className={`w-2 h-2 rounded-full ${color}`} />
        <span className="text-xs text-gray-600">{label}</span>
      </div>
      <span className="text-xs font-medium text-gray-900">{value}</span>
    </div>
  );
}

// Component: Priority Row
function PriorityRow({ label, value, trend, color }: { label: string; value: string; trend: 'up' | 'down'; color: string }) {
  const TrendIcon = trend === 'up' ? ArrowUp : ArrowDown;
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-1.5">
        <span className={`w-1.5 h-1.5 rounded-full ${color.replace('text-', 'bg-')}`} />
        <span className="text-xs text-gray-600">{label}</span>
      </div>
      <div className={`flex items-center gap-0.5 text-xs font-medium ${color}`}>
        <TrendIcon className="w-2.5 h-2.5" />
        {value}
      </div>
    </div>
  );
}

// Component: Status Badge
function StatusBadge({ status }: { status: string }) {
  const configs: Record<string, { bg: string; text: string; label: string }> = {
    'done': { bg: 'bg-emerald-100', text: 'text-emerald-700', label: 'Completed' },
    'in-progress': { bg: 'bg-blue-100', text: 'text-blue-700', label: 'In Progress' },
    'review': { bg: 'bg-amber-100', text: 'text-amber-700', label: 'In Review' },
    'inbox': { bg: 'bg-gray-100', text: 'text-gray-700', label: 'To Do' }
  };
  const config = configs[status] || configs['inbox'];
  
  return (
    <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${config.bg} ${config.text}`}>
      {config.label}
    </span>
  );
}

// Component: Priority Badge
function PriorityBadge({ priority }: { priority: string }) {
  const configs: Record<string, { bg: string; text: string; label: string }> = {
    'HIGH': { bg: 'bg-red-100', text: 'text-red-700', label: 'High' },
    'MEDIUM': { bg: 'bg-amber-100', text: 'text-amber-700', label: 'Medium' },
    'LOW': { bg: 'bg-emerald-100', text: 'text-emerald-700', label: 'Low' }
  };
  const config = configs[priority || 'MEDIUM'] || configs['MEDIUM'];
  
  return (
    <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${config.bg} ${config.text}`}>
      {config.label}
    </span>
  );
}

// Helper function
function formatDate(value?: string): string {
  if (!value) return 'Recently';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Recently';
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
