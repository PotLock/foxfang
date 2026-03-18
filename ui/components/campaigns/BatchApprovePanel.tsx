'use client';

import { useState } from 'react';
import { Check, X, Loader2 } from 'lucide-react';
import type { CampaignRun, CampaignTemplate } from '@/lib/api/campaigns';
import { batchApproveSteps } from '@/lib/api/campaigns';

interface BatchApprovePanelProps {
  runs: CampaignRun[];
  templates: CampaignTemplate[];
  userId: string;
  onRefresh: () => void;
}

interface StepItem {
  runId: string;
  stepId: string;
  run: CampaignRun;
  template?: CampaignTemplate;
  stepIndex: number;
}

export default function BatchApprovePanel({
  runs,
  templates,
  userId,
  onRefresh
}: BatchApprovePanelProps) {
  const [selectedSteps, setSelectedSteps] = useState<Set<string>>(new Set());
  const [isProcessing, setIsProcessing] = useState(false);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectNotes, setRejectNotes] = useState('');

  // Collect all steps waiting for approval
  const stepsToApprove: StepItem[] = [];
  runs.forEach((run) => {
    const template = templates.find((t) => t.id === run.templateId);
    const stepResults = run.stepResults || [];
    stepResults
      .filter((s) => s.status === 'waiting_approval')
      .forEach((stepResult) => {
        const stepIndex =
          template?.steps.findIndex((s) => s.id === stepResult.stepId) || 0;
        stepsToApprove.push({
          runId: run.id,
          stepId: stepResult.stepId,
          run,
          template,
          stepIndex
        });
      });
  });

  const toggleStep = (key: string) => {
    const newSelected = new Set(selectedSteps);
    if (newSelected.has(key)) {
      newSelected.delete(key);
    } else {
      newSelected.add(key);
    }
    setSelectedSteps(newSelected);
  };

  const selectAll = () => {
    setSelectedSteps(new Set(stepsToApprove.map((s) => `${s.runId}:${s.stepId}`)));
  };

  const deselectAll = () => {
    setSelectedSteps(new Set());
  };

  const handleApprove = async () => {
    if (selectedSteps.size === 0) return;

    setIsProcessing(true);
    try {
      const stepIds = Array.from(selectedSteps).map((key) => {
        const [runId, stepId] = key.split(':');
        return { runId, stepId };
      });

      await batchApproveSteps(userId, stepIds, 'approve');
      setSelectedSteps(new Set());
      onRefresh();
    } catch (error) {
      console.error('Failed to approve:', error);
      alert('Failed to approve steps. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleReject = async () => {
    if (selectedSteps.size === 0) return;

    setIsProcessing(true);
    try {
      const stepIds = Array.from(selectedSteps).map((key) => {
        const [runId, stepId] = key.split(':');
        return { runId, stepId };
      });

      await batchApproveSteps(userId, stepIds, 'reject', rejectNotes);
      setSelectedSteps(new Set());
      setShowRejectModal(false);
      setRejectNotes('');
      onRefresh();
    } catch (error) {
      console.error('Failed to reject:', error);
      alert('Failed to reject steps. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  };

  if (stepsToApprove.length === 0) {
    return null;
  }

  return (
    <>
      <div className="bg-white border-2 border-black rounded-xl p-4">
        {/* Header with actions */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <button
              onClick={selectAll}
              className="text-xs font-medium text-gray-600 hover:text-black transition-colors"
            >
              Select All
            </button>
            {selectedSteps.size > 0 && (
              <>
                <span className="text-gray-300">|</span>
                <button
                  onClick={deselectAll}
                  className="text-xs font-medium text-gray-600 hover:text-black transition-colors"
                >
                  Deselect All
                </button>
              </>
            )}
          </div>

          {selectedSteps.size > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500">
                {selectedSteps.size} selected
              </span>
              <button
                onClick={() => setShowRejectModal(true)}
                disabled={isProcessing}
                className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium bg-red-50 text-red-600 rounded-lg hover:bg-red-100 disabled:opacity-60 transition-colors"
              >
                <X className="w-3 h-3" />
                Reject
              </button>
              <button
                onClick={handleApprove}
                disabled={isProcessing}
                className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium bg-[#A3E635] text-black rounded-lg hover:bg-[#84cc16] disabled:opacity-60 transition-colors"
              >
                {isProcessing ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <Check className="w-3 h-3" />
                )}
                Approve Selected
              </button>
            </div>
          )}
        </div>

        {/* Steps list */}
        <div className="space-y-2">
          {stepsToApprove.map((item) => {
            const key = `${item.runId}:${item.stepId}`;
            const isSelected = selectedSteps.has(key);
            const stepName =
              item.template?.steps[item.stepIndex]?.name || 'Unknown Step';

            return (
              <div
                key={key}
                onClick={() => toggleStep(key)}
                className={`p-3 rounded-lg border-2 cursor-pointer transition-all ${
                  isSelected
                    ? 'border-[#A3E635] bg-[#A3E635]/10'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`w-5 h-5 rounded border-2 flex items-center justify-center ${
                      isSelected
                        ? 'border-[#A3E635] bg-[#A3E635]'
                        : 'border-gray-300'
                    }`}
                  >
                    {isSelected && <Check className="w-3 h-3 text-black" />}
                  </div>
                  <div className="flex-1">
                    <p className="font-medium text-sm">{stepName}</p>
                    <p className="text-xs text-gray-500">
                      {item.template?.name || 'Campaign'} • Step{' '}
                      {item.stepIndex + 1}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Reject Modal */}
      {showRejectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setShowRejectModal(false)}
          />
          <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-md p-6 border-2 border-black">
            <h3 className="text-lg font-bold mb-4">Reject Selected Steps</h3>
            <p className="text-sm text-gray-600 mb-4">
              Provide feedback for why these steps are being rejected. This will
              help the agents improve their work.
            </p>

            <textarea
              value={rejectNotes}
              onChange={(e) => setRejectNotes(e.target.value)}
              placeholder="Enter rejection notes..."
              className="w-full rounded-xl border-2 border-black px-3 py-2 text-sm focus:outline-none focus:border-[#A3E635] min-h-[100px] resize-none mb-4"
            />

            <div className="flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowRejectModal(false);
                  setRejectNotes('');
                }}
                className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-xl transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleReject}
                disabled={isProcessing}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-red-600 text-white rounded-xl hover:bg-red-700 disabled:opacity-60 transition-colors"
              >
                {isProcessing && (
                  <Loader2 className="w-4 h-4 animate-spin" />
                )}
                Reject {selectedSteps.size} Step
                {selectedSteps.size !== 1 ? 's' : ''}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
