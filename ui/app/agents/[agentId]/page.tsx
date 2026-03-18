'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/components/auth/AuthProvider';
import { Agent, listUserAgents } from '@/lib/api/agents';
import AgentTerminalLog from '@/components/agents/AgentTerminalLog';
import { ArrowLeft, Pen, Share2, TrendingUp, Search, Compass, Bot } from 'lucide-react';

const ROLE_META: Record<string, { icon: typeof Bot; color: string; label: string }> = {
  'content-writer': { icon: Pen, color: 'bg-violet-500', label: 'Content Writer' },
  'seo-specialist': { icon: Search, color: 'bg-amber-500', label: 'SEO Specialist' },
  'social-media-manager': { icon: Share2, color: 'bg-sky-500', label: 'Social Media' },
  'growth-hacker': { icon: TrendingUp, color: 'bg-emerald-500', label: 'Growth Hacker' },
  'trend-researcher': { icon: Compass, color: 'bg-rose-500', label: 'Trend Researcher' },
};

const DEFAULT_ROLE_META = { icon: Bot, color: 'bg-gray-500', label: 'Agent' };

export default function AgentDetailPage() {
  const { user } = useAuth();
  const params = useParams();
  const router = useRouter();
  const agentId = params.agentId as string;

  const [agent, setAgent] = useState<Agent | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!user || !agentId) return;

    const load = async () => {
      try {
        setIsLoading(true);
        const agents = await listUserAgents(user.id);
        const found = agents.find(a => a.id === agentId);
        if (found) {
          setAgent(found);
        }
      } catch (err) {
        console.error('Failed to load agent:', err);
      } finally {
        setIsLoading(false);
      }
    };

    load();
  }, [user, agentId]);

  if (isLoading) {
    return (
      <div className="min-h-full flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!agent) {
    return (
      <div className="min-h-full flex items-center justify-center px-6">
        <div className="bg-white rounded-2xl border border-gray-200 p-6 text-center">
          <p className="text-gray-500 text-sm">Agent not found</p>
          <button
            onClick={() => router.push('/agents')}
            className="mt-3 text-indigo-600 text-sm font-medium hover:underline"
          >
            Back to Agents
          </button>
        </div>
      </div>
    );
  }

  const meta = ROLE_META[agent.role || ''] || DEFAULT_ROLE_META;
  const Icon = meta.icon;
  const skills = agent.skills || [];

  return (
    <div className="space-y-6 h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button
          onClick={() => router.push('/agents')}
          className="p-2 rounded-xl hover:bg-gray-100 transition-colors"
        >
          <ArrowLeft className="w-5 h-5 text-gray-600" />
        </button>

        <div className={`w-12 h-12 ${meta.color} rounded-xl flex items-center justify-center`}>
          <Icon className="w-6 h-6 text-white" />
        </div>

        <div>
          <h1 className="text-xl font-bold text-gray-900">{agent.name}</h1>
          <p className="text-sm text-gray-500">{meta.label}</p>
        </div>

        <div className="ml-auto flex items-center gap-2">
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
      </div>

      {/* Terminal Log */}
      {user && (
        <div className="flex-1 min-h-[500px]">
          <AgentTerminalLog userId={user.id} agentId={agentId} />
        </div>
      )}
    </div>
  );
}
