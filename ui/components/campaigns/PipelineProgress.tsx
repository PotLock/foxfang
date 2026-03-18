'use client';

import { useEffect, useState } from 'react';
import {
  Loader2,
  CheckCircle,
  XCircle,
  AlertCircle,
  Clock,
  RefreshCw
} from 'lucide-react';
import type { CampaignRun, CampaignTemplate, StepResult } from '@/lib/api/campaigns';

interface PipelineProgressProps {
  run: CampaignRun;
  template?: CampaignTemplate;
  stepResults?: StepResult[];
  variant?: 'compact' | 'detailed' | 'minimal';
  showProgressBar?: boolean;
  onStepClick?: (stepId: string) => void;
  className?: string;
}

interface StepStatus {
  id: string;
  name: string;
  status: StepResult['status'] | 'pending';
  selfReviewScore?: number;
  agentId?: string;
  retryCount?: number;
}

function getStepIcon(status: StepStatus['status'], isCurrent: boolean) {
  switch (status) {
    case 'approved':
      return <CheckCircle className="w-4 h-4 text-green-500" />;
    case 'running':
      return <Loader2 className="w-4 h-4 animate-spin text-blue-500" />;
    case 'self_review':
      return <RefreshCw className="w-4 h-4 animate-spin text-purple-500" />;
    case 'waiting_approval':
      return <Clock className="w-4 h-4 text-amber-500" />;
    case 'failed':
    case 'rejected':
      return <XCircle className="w-4 h-4 text-red-500" />;
    case 'retrying':
      return <RefreshCw className="w-4 h-4 animate-spin text-orange-500" />;
    default:
      return isCurrent ? (
        <div className="w-4 h-4 rounded-full border-2 border-blue-500 border-t-transparent animate-spin" />
      ) : (
        <div className="w-4 h-4 rounded-full bg-gray-200" />
      );
  }
}

function getStepBgColor(status: StepStatus['status']): string {
  switch (status) {
    case 'approved':
      return 'bg-green-50 border-green-200';
    case 'running':
    case 'self_review':
      return 'bg-blue-50 border-blue-200';
    case 'waiting_approval':
      return 'bg-amber-50 border-amber-200';
    case 'failed':
    case 'rejected':
      return 'bg-red-50 border-red-200';
    case 'retrying':
      return 'bg-orange-50 border-orange-200';
    default:
      return 'bg-gray-50 border-gray-200';
  }
}

function getConnectorColor(
  currentStatus: StepStatus['status'],
  nextStatus: StepStatus['status']
): string {
  if (currentStatus === 'approved') {
    return nextStatus === 'pending' ? 'bg-gray-200' : 'bg-green-500';
  }
  if (currentStatus === 'failed' || currentStatus === 'rejected') {
    return 'bg-red-200';
  }
  return 'bg-gray-200';
}

export default function PipelineProgress({
  run,
  template,
  stepResults: externalStepResults,
  variant = 'detailed',
  showProgressBar = true,
  onStepClick,
  className = ''
}: PipelineProgressProps) {
  const [steps, setSteps] = useState<StepStatus[]>([]);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const templateSteps = template?.steps || [];
    const results = externalStepResults || run.stepResults || [];

    const mappedSteps: StepStatus[] = templateSteps.map((templateStep, index) => {
      const result = results.find((r) => r.stepId === templateStep.id);
      const isCurrent = run.currentStep === templateStep.id;

      return {
        id: templateStep.id,
        name: templateStep.name,
        status: result?.status || (isCurrent ? 'running' : 'pending'),
        selfReviewScore: result?.selfReviewScore,
        agentId: result?.agentId,
        retryCount: result?.retryCount
      };
    });

    setSteps(mappedSteps);

    // Calculate progress
    const completedCount = mappedSteps.filter(
      (s) => s.status === 'approved'
    ).length;
    const totalSteps = mappedSteps.length || 1;
    setProgress(Math.round((completedCount / totalSteps) * 100));
  }, [run, template, externalStepResults]);

  // Compact variant - just progress bar with percentage
  if (variant === 'compact') {
    return (
      <div className={`flex items-center gap-3 ${className}`}>
        {showProgressBar && (
          <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-[#A3E635] transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>
        )}
        <span className="text-xs text-gray-500 whitespace-nowrap">
          {progress}%
        </span>
      </div>
    );
  }

  // Minimal variant - just status icon and count
  if (variant === 'minimal') {
    const completedCount = steps.filter((s) => s.status === 'approved').length;
    return (
      <div className={`flex items-center gap-2 text-xs text-gray-500 ${className}`}>
        <span className="font-medium">{completedCount}/{steps.length}</span>
        <span>steps</span>
      </div>
    );
  }

  // Detailed variant - full step list with connectors
  return (
    <div className={`space-y-3 ${className}`}>
      {/* Progress bar */}
      {showProgressBar && (
        <div className="mb-4">
          <div className="flex justify-between text-xs text-gray-500 mb-1">
            <span>Progress</span>
            <span>{progress}%</span>
          </div>
          <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-[#A3E635] transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}

      {/* Steps */}
      <div className="space-y-2">
        {steps.map((step, index) => {
          const isClickable = onStepClick && step.status !== 'pending';
          const nextStep = steps[index + 1];

          return (
            <div key={step.id}>
              <button
                onClick={() => isClickable && onStepClick(step.id)}
                disabled={!isClickable}
                className={`
                  w-full flex items-center gap-3 p-3 rounded-lg border-2 transition-all
                  ${getStepBgColor(step.status)}
                  ${isClickable ? 'cursor-pointer hover:shadow-sm' : 'cursor-default'}
                `}
              >
                {/* Step number / icon */}
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-white flex items-center justify-center shadow-sm">
                  {getStepIcon(step.status, run.currentStep === step.id)}
                </div>

                {/* Step info */}
                <div className="flex-1 text-left min-w-0">
                  <p className="font-medium text-sm text-black truncate">
                    {step.name}
                  </p>
                  <p className="text-xs text-gray-500 capitalize">
                    {step.status.replace(/_/g, ' ')}
                    {step.retryCount ? ` (retry ${step.retryCount})` : ''}
                  </p>
                </div>

                {/* Score badge */}
                {step.selfReviewScore !== undefined && (
                  <div className="flex-shrink-0 flex items-center gap-1 text-xs">
                    <span
                      className={`px-2 py-0.5 rounded-full font-medium ${
                        step.selfReviewScore >= 4
                          ? 'bg-green-100 text-green-700'
                          : step.selfReviewScore >= 3
                          ? 'bg-amber-100 text-amber-700'
                          : 'bg-red-100 text-red-700'
                      }`}
                    >
                      {step.selfReviewScore.toFixed(1)}
                    </span>
                    <span className="text-gray-400">/5</span>
                  </div>
                )}
              </button>

              {/* Connector to next step */}
              {nextStep && (
                <div className="flex justify-center py-1">
                  <div
                    className={`w-0.5 h-4 transition-colors ${getConnectorColor(
                      step.status,
                      nextStep.status
                    )}`}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Summary */}
      <div className="pt-2 border-t border-gray-100">
        <div className="flex items-center justify-between text-xs text-gray-500">
          <span>
            {steps.filter((s) => s.status === 'approved').length} of {steps.length} completed
          </span>
          {run.status === 'running' && (
            <span className="flex items-center gap-1">
              <Loader2 className="w-3 h-3 animate-spin" />
              Running
            </span>
          )}
          {run.status === 'waiting_approval' && (
            <span className="flex items-center gap-1 text-amber-600">
              <Clock className="w-3 h-3" />
              Waiting approval
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
