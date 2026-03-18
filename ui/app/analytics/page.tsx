'use client';

import { useEffect, useState, useMemo } from 'react';
import { useAuth } from '@/components/auth/AuthProvider';
import { listProjects, type Project } from '@/lib/api/projects';
import { listTasks, type Task } from '@/lib/api/tasks';
import { listAgents, type Agent } from '@/lib/api/agents';
import { 
  BarChart, Activity, TrendingUp, CheckCircle, Clock, 
  Users, FolderKanban, Target, Zap 
} from 'lucide-react';

interface AnalyticsData {
  projects: Project[];
  tasks: Task[];
  agents: Agent[];
  isLoading: boolean;
  error: string | null;
}

export default function AnalyticsPage() {
  const { user } = useAuth();
  const [data, setData] = useState<AnalyticsData>({
    projects: [],
    tasks: [],
    agents: [],
    isLoading: true,
    error: null
  });

  useEffect(() => {
    if (!user?.id) return;

    const loadData = async () => {
      try {
        setData(prev => ({ ...prev, isLoading: true, error: null }));

        // Fetch all projects
        const projects = await listProjects(user.id);
        
        // Fetch tasks and agents from all projects in parallel
        const tasksPromises = projects.map(p => listTasks(user.id, p.id).catch(() => []));
        const agentsPromises = projects.map(p => listAgents(user.id, p.id).catch(() => []));
        
        const [tasksResults, agentsResults] = await Promise.all([
          Promise.all(tasksPromises),
          Promise.all(agentsPromises)
        ]);

        const allTasks = tasksResults.flat();
        const allAgents = agentsResults.flat();
        
        // Deduplicate agents by ID since they might be shared or returned uniquely per project
        const uniqueAgents = Array.from(new Map(allAgents.map(a => [a.id, a])).values());

        setData({
          projects,
          tasks: allTasks,
          agents: uniqueAgents,
          isLoading: false,
          error: null
        });
      } catch (err) {
        setData(prev => ({
          ...prev,
          isLoading: false,
          error: err instanceof Error ? err.message : 'Failed to load analytics data'
        }));
      }
    };

    loadData();
  }, [user?.id]);

  // Compute Analytics Metrics
  const metrics = useMemo(() => {
    const { tasks, agents, projects } = data;
    
    // Task Status Breakdown
    const totalTasks = tasks.length || 1;
    const completedTasks = tasks.filter(t => t.status === 'done');
    const completionRate = Math.round((completedTasks.length / totalTasks) * 100);

    // Agent Performance (tasks assigned and completed per agent)
    const agentStats = agents.map(agent => {
      const assignedTasks = tasks.filter(t => t.assigneeId === agent.id);
      const doneTasks = assignedTasks.filter(t => t.status === 'done');
      return {
        ...agent,
        assignedCount: assignedTasks.length,
        completedCount: doneTasks.length,
        completionRate: assignedTasks.length > 0 ? Math.round((doneTasks.length / assignedTasks.length) * 100) : 0
      };
    }).sort((a, b) => b.completedCount - a.completedCount);

    // Productivity by Priority
    const priorityStats = {
      HIGH: tasks.filter(t => t.priority === 'HIGH').length,
      MEDIUM: tasks.filter(t => t.priority === 'MEDIUM').length,
      LOW: tasks.filter(t => t.priority === 'LOW').length
    };

    // Label Map
    const labelCounts: Record<string, number> = {};
    tasks.forEach(t => {
      t.labels.forEach(l => {
        labelCounts[l] = (labelCounts[l] || 0) + 1;
      });
    });
    const topLabels = Object.entries(labelCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    return {
      completionRate,
      completedCount: completedTasks.length,
      totalCount: tasks.length,
      agentStats,
      priorityStats,
      topLabels,
      projectsCount: projects.length
    };
  }, [data]);

  if (data.isLoading) {
    return (
      <div className="min-h-full flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-gray-500">Loading analytics...</p>
        </div>
      </div>
    );
  }

  if (data.error) {
    return (
      <div className="min-h-full flex items-center justify-center">
        <div className="max-w-md mx-auto bg-white rounded-2xl border border-gray-200 p-6 text-center">
          <Activity className="w-8 h-8 text-red-500 mx-auto mb-3" />
          <p className="text-red-600 font-medium mb-4">{data.error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-slate-50 overflow-y-auto">
      {/* Header */}
      <div className="shrink-0 px-8 py-8 bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center">
              <BarChart className="w-5 h-5 text-indigo-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Analytics & Reporting</h1>
              <p className="text-sm text-gray-500">Monitor your marketing velocity and agent performance</p>
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 p-8">
        <div className="max-w-7xl mx-auto space-y-8">
          
          {/* Top Scorecards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-sm flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-blue-50 flex items-center justify-center shrink-0">
                <FolderKanban className="w-6 h-6 text-blue-600" />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-500">Total Projects</p>
                <h3 className="text-2xl font-bold text-gray-900">{metrics.projectsCount}</h3>
              </div>
            </div>
            
            <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-sm flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-indigo-50 flex items-center justify-center shrink-0">
                <Target className="w-6 h-6 text-indigo-600" />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-500">Total Tasks</p>
                <h3 className="text-2xl font-bold text-gray-900">{metrics.totalCount}</h3>
              </div>
            </div>

            <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-sm flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-emerald-50 flex items-center justify-center shrink-0">
                <CheckCircle className="w-6 h-6 text-emerald-600" />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-500">Completion Rate</p>
                <div className="flex items-baseline gap-2">
                  <h3 className="text-2xl font-bold text-gray-900">{metrics.completionRate}%</h3>
                  <span className="text-xs text-gray-400">({metrics.completedCount} done)</span>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-sm flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-amber-50 flex items-center justify-center shrink-0">
                <Users className="w-6 h-6 text-amber-600" />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-500">Active Agents</p>
                <h3 className="text-2xl font-bold text-gray-900">{data.agents.length}</h3>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Agent Performance Table */}
            <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden flex flex-col">
              <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between">
                <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
                  <Zap className="w-4 h-4 text-indigo-500" />
                  Agent Performance
                </h3>
              </div>
              <div className="flex-1 overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-gray-50/50">
                      <th className="py-3 px-6 text-xs font-semibold text-gray-500 uppercase tracking-wider">Agent</th>
                      <th className="py-3 px-6 text-xs font-semibold text-gray-500 uppercase tracking-wider">Role</th>
                      <th className="py-3 px-6 text-xs font-semibold text-gray-500 uppercase tracking-wider">Tasks Done</th>
                      <th className="py-3 px-6 text-xs font-semibold text-gray-500 uppercase tracking-wider">Completion</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {metrics.agentStats.map(agent => (
                      <tr key={agent.id} className="hover:bg-gray-50/50 transition-colors">
                        <td className="py-4 px-6">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-bold text-xs shrink-0">
                              {agent.name.charAt(0)}
                            </div>
                            <span className="text-sm font-medium text-gray-900">{agent.name}</span>
                          </div>
                        </td>
                        <td className="py-4 px-6 text-sm text-gray-500">
                          <span className="px-2.5 py-1 bg-gray-100 text-gray-600 rounded-lg text-xs font-medium">
                            {(agent.role ?? '').replace('_', ' ')}
                          </span>
                        </td>
                        <td className="py-4 px-6">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold text-gray-900">{agent.completedCount}</span>
                            <span className="text-xs text-gray-400">/ {agent.assignedCount}</span>
                          </div>
                        </td>
                        <td className="py-4 px-6">
                          <div className="flex items-center gap-3">
                            <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden w-24">
                              <div 
                                className="h-full bg-emerald-500 rounded-full" 
                                style={{ width: `${agent.completionRate}%` }}
                              />
                            </div>
                            <span className="text-xs font-medium text-gray-600 w-8">{agent.completionRate}%</span>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {metrics.agentStats.length === 0 && (
                      <tr>
                        <td colSpan={4} className="py-8 text-center text-sm text-gray-500">
                          No active agents found in any projects.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Right Column Metrics */}
            <div className="space-y-8 flex flex-col">
              {/* Priority Breakdown */}
              <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
                <h3 className="text-base font-bold text-gray-900 flex items-center gap-2 mb-6">
                  <Activity className="w-4 h-4 text-indigo-500" />
                  Tasks by Priority
                </h3>
                <div className="space-y-5">
                  <div>
                    <div className="flex justify-between items-center mb-1.5">
                      <span className="text-sm font-medium text-gray-700 flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-red-500" /> High 
                      </span>
                      <span className="text-sm font-bold text-gray-900">{metrics.priorityStats.HIGH}</span>
                    </div>
                    <div className="h-2 w-full bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full bg-red-500" style={{ width: `${(metrics.priorityStats.HIGH / Math.max(metrics.totalCount, 1)) * 100}%` }} />
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between items-center mb-1.5">
                      <span className="text-sm font-medium text-gray-700 flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-amber-500" /> Medium 
                      </span>
                      <span className="text-sm font-bold text-gray-900">{metrics.priorityStats.MEDIUM}</span>
                    </div>
                    <div className="h-2 w-full bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full bg-amber-500" style={{ width: `${(metrics.priorityStats.MEDIUM / Math.max(metrics.totalCount, 1)) * 100}%` }} />
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between items-center mb-1.5">
                      <span className="text-sm font-medium text-gray-700 flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-gray-400" /> Low 
                      </span>
                      <span className="text-sm font-bold text-gray-900">{metrics.priorityStats.LOW}</span>
                    </div>
                    <div className="h-2 w-full bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full bg-gray-400" style={{ width: `${(metrics.priorityStats.LOW / Math.max(metrics.totalCount, 1)) * 100}%` }} />
                    </div>
                  </div>
                </div>
              </div>

              {/* Top Labels */}
              <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 flex-1">
                <h3 className="text-base font-bold text-gray-900 flex items-center gap-2 mb-6">
                  <TrendingUp className="w-4 h-4 text-indigo-500" />
                  Top Labels Used
                </h3>
                <div className="space-y-4">
                  {metrics.topLabels.map(([label, count]) => (
                    <div key={label} className="flex items-center justify-between">
                      <span className="px-2.5 py-1 bg-indigo-50 text-indigo-700 rounded-lg text-xs font-semibold">
                        {label}
                      </span>
                      <span className="text-sm font-medium text-gray-500">{count} tasks</span>
                    </div>
                  ))}
                  {metrics.topLabels.length === 0 && (
                     <p className="text-sm text-gray-500 text-center py-4">No labels have been set yet.</p>
                  )}
                </div>
              </div>

            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
