'use client';

import { useState, useEffect, useCallback } from 'react';
import { Rocket, Plus, RefreshCw, Clock, CheckCircle, AlertCircle, XCircle, Loader2 } from 'lucide-react';
import { useAuth } from '@/components/auth/AuthProvider';
import {
  listCampaignTemplates,
  listCampaignRuns,
  startCampaign,
  type CampaignTemplate,
  type CampaignRun
} from '@/lib/api/campaigns';
import CampaignCard from '@/components/campaigns/CampaignCard';
import TemplateSelector from '@/components/campaigns/TemplateSelector';
import BatchApprovePanel from '@/components/campaigns/BatchApprovePanel';

function timeAgo(iso?: string): string {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

export default function CampaignsPage() {
  const { user } = useAuth();
  const [templates, setTemplates] = useState<CampaignTemplate[]>([]);
  const [runs, setRuns] = useState<CampaignRun[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isStarting, setIsStarting] = useState(false);
  const [showTemplateSelector, setShowTemplateSelector] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const userId = user?.id || '';

  // Load campaigns on mount
  const loadCampaigns = useCallback(async () => {
    if (!userId) return;
    setIsLoading(true);
    setError(null);
    try {
      const [templatesData, runsData] = await Promise.all([
        listCampaignTemplates(userId),
        listCampaignRuns(userId)
      ]);
      setTemplates(templatesData);
      setRuns(runsData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load campaigns');
    } finally {
      setIsLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    loadCampaigns();
  }, [loadCampaigns]);

  // Auto-refresh every 30 seconds
  useEffect(() => {
    if (!userId) return;
    const interval = setInterval(() => {
      loadCampaigns();
    }, 30000);
    return () => clearInterval(interval);
  }, [userId, loadCampaigns]);

  const handleStartCampaign = async (templateId: string) => {
    if (!userId) return;
    try {
      setIsStarting(true);
      await startCampaign(userId, templateId);
      setShowTemplateSelector(false);
      await loadCampaigns();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start campaign');
    } finally {
      setIsStarting(false);
    }
  };

  // Group runs by status
  const activeRuns = runs.filter((r) => r.status === 'running');
  const waitingRuns = runs.filter((r) => r.status === 'waiting_approval');
  const completedRuns = runs.filter(
    (r) => r.status === 'completed' || r.status === 'failed' || r.status === 'cancelled'
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Campaigns</h1>
          <p className="text-sm text-gray-500 mt-1">
            Automated marketing pipelines and content workflows
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => loadCampaigns()}
            className="p-2.5 text-gray-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-all"
            aria-label="Refresh"
          >
            <RefreshCw className="w-5 h-5" />
          </button>
          <button
            onClick={() => setShowTemplateSelector(true)}
            disabled={isStarting}
            className="flex items-center gap-2 px-5 py-2.5 bg-indigo-500 text-white text-sm font-medium rounded-xl hover:bg-indigo-600 transition-all disabled:opacity-60"
          >
            {isStarting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Starting...
              </>
            ) : (
              <>
                <Plus className="w-4 h-4" />
                Run Campaign
              </>
            )}
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="p-4 bg-red-50 border border-red-100 rounded-2xl text-red-600 text-sm">
          {error}
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <>
          {/* Active Campaigns */}
          {activeRuns.length > 0 && (
            <section>
              <h2 className="text-base font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <div className="w-8 h-8 bg-indigo-100 rounded-lg flex items-center justify-center">
                  <Loader2 className="w-4 h-4 animate-spin text-indigo-600" />
                </div>
                Active Campaigns
              </h2>
              <div className="space-y-4">
                {activeRuns.map((run) => (
                  <CampaignCard
                    key={run.id}
                    run={run}
                    template={templates.find((t) => t.id === run.templateId)}
                    userId={userId}
                    onRefresh={loadCampaigns}
                  />
                ))}
              </div>
            </section>
          )}

          {/* Waiting for Approval */}
          {waitingRuns.length > 0 && (
            <section>
              <h2 className="text-base font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <div className="w-8 h-8 bg-amber-100 rounded-lg flex items-center justify-center">
                  <Clock className="w-4 h-4 text-amber-600" />
                </div>
                Awaiting Approval ({waitingRuns.length})
              </h2>
              <BatchApprovePanel
                runs={waitingRuns}
                templates={templates}
                userId={userId}
                onRefresh={loadCampaigns}
              />
            </section>
          )}

          {/* Templates */}
          <section>
            <h2 className="text-base font-semibold text-gray-900 mb-4">Templates</h2>
            {templates.length === 0 ? (
              <div className="p-8 bg-white border border-dashed border-gray-200 rounded-2xl text-center">
                <p className="text-sm text-gray-500">No templates yet. Click "Run Campaign" to choose a built-in template.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {templates.map((template) => (
                  <div
                    key={template.id}
                    className="bg-white rounded-2xl p-5 border border-gray-200 hover:border-gray-300 transition-all"
                  >
                    <div className="flex items-start justify-between mb-3">
                      <h3 className="font-semibold text-gray-900">{template.name}</h3>
                      {template.triggerOnNewIdea && (
                        <span className="px-2 py-0.5 text-[10px] font-medium bg-indigo-500 text-white rounded-full">
                          Auto
                        </span>
                      )}
                    </div>
                    {template.description && (
                      <p className="text-xs text-gray-500 mb-3">{template.description}</p>
                    )}
                    <div className="flex items-center gap-2 text-xs text-gray-400 mb-4">
                      <span>{template.steps.length} steps</span>
                      {template.schedule && (
                        <>
                          <span>•</span>
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {template.schedule}
                          </span>
                        </>
                      )}
                    </div>
                    <button
                      onClick={() => handleStartCampaign(template.id)}
                      disabled={isStarting}
                      className="w-full py-2.5 text-xs font-semibold bg-gray-900 text-white rounded-xl hover:bg-gray-800 transition-all disabled:opacity-60"
                    >
                      Start Campaign
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Completed Campaigns */}
          {completedRuns.length > 0 && (
            <section>
              <h2 className="text-base font-semibold text-gray-900 mb-4">History</h2>
              <div className="space-y-4">
                {completedRuns.slice(0, 5).map((run) => (
                  <CampaignCard
                    key={run.id}
                    run={run}
                    template={templates.find((t) => t.id === run.templateId)}
                    userId={userId}
                    onRefresh={loadCampaigns}
                    compact
                  />
                ))}
              </div>
            </section>
          )}

          {/* Empty state */}
          {templates.length === 0 && runs.length === 0 && (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <div className="w-16 h-16 rounded-2xl bg-indigo-50 flex items-center justify-center mb-4">
                <Rocket className="w-8 h-8 text-indigo-400" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-1">No campaigns yet</h3>
              <p className="text-sm text-gray-500 mb-4">
                Start your first automated marketing campaign.
              </p>
              <button
                onClick={() => setShowTemplateSelector(true)}
                className="flex items-center gap-2 px-5 py-2.5 bg-indigo-500 text-white text-sm font-medium rounded-xl hover:bg-indigo-600 transition-all"
              >
                <Plus className="w-4 h-4" />
                Run Campaign
              </button>
            </div>
          )}
        </>
      )}

      {/* Template Selector Modal */}
      {showTemplateSelector && (
        <TemplateSelector
          userId={userId}
          onSelect={handleStartCampaign}
          onClose={() => setShowTemplateSelector(false)}
        />
      )}
    </div>
  );
}
