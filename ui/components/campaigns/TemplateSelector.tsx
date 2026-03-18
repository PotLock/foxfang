'use client';

import { useState, useEffect } from 'react';
import { X, Plus, Clock, Sparkles, Zap, Loader2 } from 'lucide-react';
import type { CampaignTemplate } from '@/lib/api/campaigns';
import { getBuiltInTemplates, createCampaignTemplate } from '@/lib/api/campaigns';

interface TemplateSelectorProps {
  userId: string;
  onSelect: (templateId: string) => void;
  onClose: () => void;
}

const TYPE_ICONS: Record<string, typeof Sparkles> = {
  'Weekly Content Calendar': Clock,
  'Single Content Piece': Zap,
  'Campaign Launch Package': Sparkles
};

export default function TemplateSelector({
  userId,
  onSelect,
  onClose
}: TemplateSelectorProps) {
  const [templates, setTemplates] = useState<CampaignTemplate[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedTemplate, setSelectedTemplate] = useState<CampaignTemplate | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  useEffect(() => {
    loadTemplates();
  }, [userId]);

  const loadTemplates = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await getBuiltInTemplates(userId);
      setTemplates(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load templates');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelect = async () => {
    if (!selectedTemplate) return;

    setIsCreating(true);
    try {
      // If it's a built-in template, we need to create it first
      if (selectedTemplate.id.startsWith('builtin-')) {
        const created = await createCampaignTemplate(userId, {
          name: selectedTemplate.name,
          description: selectedTemplate.description,
          steps: selectedTemplate.steps,
          schedule: selectedTemplate.schedule,
          autoApproveThreshold: selectedTemplate.autoApproveThreshold,
          maxRetries: selectedTemplate.maxRetries,
          triggerOnNewIdea: selectedTemplate.triggerOnNewIdea,
          status: 'active'
        });
        onSelect(created.id);
      } else {
        onSelect(selectedTemplate.id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create template');
      setIsCreating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative bg-white rounded-2xl w-full max-w-2xl max-h-[80vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-gray-900">Choose Campaign Template</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[60vh]">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 text-gray-400 animate-spin" />
            </div>
          ) : error ? (
            <div className="text-center py-8">
              <p className="text-sm text-red-600 mb-3">{error}</p>
              <button
                onClick={loadTemplates}
                className="text-sm text-indigo-500 hover:underline"
              >
                Retry
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {templates.map((template) => {
                const Icon = TYPE_ICONS[template.name] || Sparkles;
                const isSelected = selectedTemplate?.id === template.id;

                return (
                  <button
                    key={template.id}
                    onClick={() => setSelectedTemplate(template)}
                    className={`w-full p-4 rounded-xl border text-left transition-all ${
                      isSelected
                        ? 'border-indigo-300 bg-indigo-50/50 ring-1 ring-indigo-200'
                        : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div
                        className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
                          isSelected
                            ? 'bg-indigo-500 text-white'
                            : 'bg-gray-100 text-gray-500'
                        }`}
                      >
                        <Icon className="w-5 h-5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-gray-900">{template.name}</h3>
                        {template.description && (
                          <p className="text-sm text-gray-500 mt-0.5 line-clamp-2">
                            {template.description}
                          </p>
                        )}
                        <div className="flex items-center gap-3 mt-2 text-xs text-gray-400">
                          <span>{template.steps.length} steps</span>
                          {template.schedule && (
                            <>
                              <span className="w-1 h-1 rounded-full bg-gray-300" />
                              <span>{template.schedule}</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 p-6 border-t border-gray-100">
          <button
            onClick={onClose}
            className="px-5 py-2.5 text-sm font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-xl transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSelect}
            disabled={!selectedTemplate || isCreating}
            className="flex items-center gap-2 px-5 py-2.5 text-sm font-medium bg-indigo-500 text-white rounded-xl hover:bg-indigo-600 disabled:opacity-50 transition-all"
          >
            {isCreating ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Creating...
              </>
            ) : (
              <>
                <Plus className="w-4 h-4" />
                Start Campaign
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
