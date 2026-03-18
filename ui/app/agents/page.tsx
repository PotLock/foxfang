'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/components/auth/AuthProvider';
import { listUserAgents, Agent } from '@/lib/api/agents';
import { Users, Pen, Share2, TrendingUp, Search, Compass, Bot, ExternalLink } from 'lucide-react';
import Link from 'next/link';

const ROLE_META: Record<string, { icon: typeof Bot; color: string; label: string }> = {
  'content-writer': { icon: Pen, color: 'bg-violet-500', label: 'Content Writer' },
  'seo-specialist': { icon: Search, color: 'bg-amber-500', label: 'SEO Specialist' },
  'social-media-manager': { icon: Share2, color: 'bg-sky-500', label: 'Social Media' },
  'growth-hacker': { icon: TrendingUp, color: 'bg-emerald-500', label: 'Growth Hacker' },
  'trend-researcher': { icon: Compass, color: 'bg-rose-500', label: 'Trend Researcher' },
};

const DEFAULT_ROLE_META = { icon: Bot, color: 'bg-gray-500', label: 'Agent' };

export default function AgentsPage() {
  const { user } = useAuth();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;

    const loadAgents = async () => {
      try {
        setIsLoading(true);
        setError(null);
        const list = await listUserAgents(user.id);
        setAgents(list);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load agents');
      } finally {
        setIsLoading(false);
      }
    };

    loadAgents();
  }, [user]);

  if (isLoading) {
    return (
      <div className="min-h-full flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-full flex items-center justify-center px-6">
        <div className="bg-white rounded-2xl border border-gray-200 p-6 text-sm text-red-600">
          {error}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Agents</h1>
        <p className="text-sm text-gray-500 mt-1">
          {agents.length} marketing {agents.length === 1 ? 'agent' : 'agents'} ready to work across all your projects
        </p>
      </div>

      {/* Agents Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
        {agents.map((agent) => {
          const meta = ROLE_META[agent.role || ''] || DEFAULT_ROLE_META;
          const Icon = meta.icon;
          const skills = agent.skills || [];

          return (
            <Link
              key={agent.id}
              href={`/agents/${agent.id}`}
              className="bg-white rounded-2xl p-6 border border-gray-200 hover:border-indigo-300 hover:shadow-sm transition-all group block"
            >
              <div className="flex items-center gap-4">
                <div className={`w-14 h-14 ${meta.color} rounded-2xl flex items-center justify-center`}>
                  <Icon className="w-7 h-7 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-base font-semibold text-gray-900">{agent.name}</h3>
                  <p className="text-sm text-gray-500">{meta.label}</p>
                </div>
                <ExternalLink className="w-4 h-4 text-gray-300 group-hover:text-indigo-400 transition-colors" />
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-1.5">
                <span className="px-3 py-1 bg-emerald-50 text-emerald-600 text-xs font-medium rounded-full">
                  Active
                </span>
                {skills.map((skill) => (
                  <span
                    key={skill}
                    className="px-2 py-0.5 bg-gray-100 text-gray-600 text-xs rounded-full"
                  >
                    {skill}
                  </span>
                ))}
              </div>
            </Link>
          );
        })}
      </div>

      {agents.length === 0 && (
        <div className="text-center py-12">
          <div className="w-20 h-20 bg-indigo-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Users className="w-10 h-10 text-indigo-400" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">No agents yet</h3>
          <p className="text-gray-500">Agents will be created automatically when you sign in.</p>
        </div>
      )}
    </div>
  );
}
