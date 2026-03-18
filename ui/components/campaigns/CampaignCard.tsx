'use client';

import { useState } from 'react';
import {
  Loader2,
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
  ChevronRight,
  FileText,
  RefreshCw
} from 'lucide-react';
import type { CampaignRun, CampaignTemplate } from '@/lib/api/campaigns';
import { getCampaignRun } from '@/lib/api/campaigns';
import PipelineProgress from './PipelineProgress';

interface CampaignCardProps {
  run: CampaignRun;
  template?: CampaignTemplate;
  userId: string;
  onRefresh: () => void;
  compact?: boolean;
}

function getStatusIcon(status: string) {
  switch (status) {
    case 'running':
      return <Loader2 className="w-5 h-5 animate-spin text-[#A3E635]" />;
    case 'waiting_approval':
      return <Clock className="w-5 h-5 text-amber-500" />;
    case 'completed':
      return <CheckCircle className="w-5 h-5 text-green-500" />;
    case 'failed':
      return <XCircle className="w-5 h-5 text-red-500" />;
    case 'cancelled':
      return <AlertCircle className="w-5 h-5 text-gray-400" />;
    default:
      return <Clock className="w-5 h-5 text-gray-400" />;
  }
}

function getStatusColor(status: string): string {
  switch (status) {
    case 'running':
      return 'bg-blue-50 border-blue-200';
    case 'waiting_approval':
      return 'bg-amber-50 border-amber-200';
    case 'completed':
      return 'bg-green-50 border-green-200';
    case 'failed':
      return 'bg-red-50 border-red-200';
    case 'cancelled':
      return 'bg-gray-50 border-gray-200';
    default:
      return 'bg-gray-50 border-gray-200';
  }
}

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

export default function CampaignCard({
  run,
  template,
  userId,
  onRefresh,
  compact = false
}: CampaignCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [detailedRun, setDetailedRun] = useState<CampaignRun | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const loadDetails = async () => {
    if (!expanded || detailedRun) {
      setExpanded(!expanded);
      return;
    }

    setIsLoading(true);
    try {
      const details = await getCampaignRun(userId, run.id);
      setDetailedRun(details);
    } catch (error) {
      console.error('Failed to load campaign details:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const displayRun = detailedRun || run;

  if (compact) {
    return (
      <div
        className={`p-4 rounded-xl border-2 ${getStatusColor(run.status)} flex items-center justify-between`}
      >
        <div className="flex items-center gap-3">
          {getStatusIcon(run.status)}
          <div>
            <p className="font-medium text-sm">
              {template?.name || 'Campaign'}
            </p>
            <p className="text-xs text-gray-500">
              Started {timeAgo(run.startedAt)}
            </p>
          </div>
        </div>
        <span className="text-xs font-medium capitalize">{run.status}</span>
      </div>
    );
  }

  return (
    <div
      className={`bg-white border-2 border-black rounded-xl overflow-hidden ${
        expanded ? 'shadow-lg' : 'hover:shadow-md'
      } transition-shadow`}
    >
      <button
        onClick={loadDetails}
        className="w-full p-4 text-left flex items-center gap-4"
      >
        <div className="flex-shrink-0">{getStatusIcon(run.status)}</div>

        <div className="flex-1 min-w-0">
          <h3 className="font-bold text-black truncate">
            {template?.name || 'Campaign'}
          </h3>
          <p className="text-xs text-gray-500">
            {run.triggerType === 'cron'
              ? 'Triggered by schedule'
              : run.triggerType === 'idea'
              ? 'Triggered by new idea'
              : 'Manual trigger'}{' '}
            • {timeAgo(run.startedAt)}
          </p>
        </div>

        <div className="flex items-center gap-3">
          {run.status === 'running' && (
            <div className="hidden sm:block w-32">
              <PipelineProgress
                run={run}
                template={template}
                variant="compact"
                showProgressBar={true}
              />
            </div>
          )}

          <ChevronRight
            className={`w-5 h-5 text-gray-400 transition-transform ${
              expanded ? 'rotate-90' : ''
            }`}
          />
        </div>
      </button>

      {expanded && (
        <div className="border-t-2 border-gray-100 p-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="w-6 h-6 animate-spin text-[#A3E635]" />
            </div>
          ) : (
            <>
              {/* Step Progress */}
              <PipelineProgress
                run={displayRun}
                template={template}
                stepResults={displayRun.stepResults}
                variant="detailed"
                showProgressBar={true}
                className="mb-4"
              />

              {/* Actions */}
              <div className="flex items-center justify-between pt-4 border-t border-gray-100">
                <div className="flex items-center gap-2">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onRefresh();
                    }}
                    className="p-1.5 text-gray-400 hover:text-black transition-colors"
                  >
                    <RefreshCw className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
