'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { X, Bot, Wrench, Clock, ChevronDown, ChevronUp, FileText, Eye, Star, Calendar, User, Tag, ArrowLeft, CheckCircle, RotateCcw } from 'lucide-react';
import { useState, useEffect, useCallback } from 'react';
import type { Task } from '@/lib/api/tasks';
import type { Agent } from '@/lib/api/agents';
import type { TaskActivity } from '@/lib/api/activity';
import { listTaskArtifacts, getTaskArtifact, type TaskArtifact } from '@/lib/api/artifacts';
import { submitArtifactFeedback, listArtifactFeedback, type Feedback } from '@/lib/api/feedback';

/* ── Worklog grouping helpers ─────────────────────────────────── */

interface WorklogRun {
  agentId?: string;
  agentName: string;
  startedAt?: string;
  endedAt?: string;
  tools: string[];
  response: TaskActivity | null;
  systemNotes: string[];
}

function groupWorklogEntries(
  entries: TaskActivity[],
  agentNameById: (id?: string) => string
): WorklogRun[] {
  const sorted = [...entries].sort(
    (a, b) => new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime()
  );

  const runs: WorklogRun[] = [];
  let current: WorklogRun | null = null;

  for (const entry of sorted) {
    const isStart = entry.role === 'system' && /started/i.test(entry.content);

    if (isStart) {
      if (current) runs.push(current);
      current = {
        agentId: entry.agentId,
        agentName: agentNameById(entry.agentId),
        startedAt: entry.createdAt,
        endedAt: undefined,
        tools: [],
        response: null,
        systemNotes: []
      };
    } else if (current) {
      if (entry.role === 'system' && /^tools used:/i.test(entry.content)) {
        current.tools = entry.content
          .replace(/^tools used:\s*/i, '')
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean);
      } else if (entry.role === 'agent') {
        current.response = entry;
        current.endedAt = entry.createdAt;
      } else if (entry.role === 'system') {
        current.systemNotes.push(entry.content);
      }
    } else if (entry.role === 'agent') {
      runs.push({
        agentId: entry.agentId,
        agentName: agentNameById(entry.agentId),
        startedAt: entry.createdAt,
        endedAt: entry.createdAt,
        tools: [],
        response: entry,
        systemNotes: []
      });
    }
  }

  if (current) runs.push(current);
  return runs.reverse();
}

function formatDuration(start?: string, end?: string): string {
  if (!start || !end) return '';
  const ms = new Date(end).getTime() - new Date(start).getTime();
  if (ms < 0) return '';
  const secs = Math.floor(ms / 1000);
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ${secs % 60}s`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

function timeAgo(iso?: string): string {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

/* ── Single run card ──────────────────────────────────────────── */

function WorklogRunCard({
  run,
  mdComponents
}: {
  run: WorklogRun;
  mdComponents: Record<string, React.ComponentType<any>>;
}) {
  const [expanded, setExpanded] = useState(true);
  const duration = formatDuration(run.startedAt, run.endedAt);
  const initials = run.agentName.slice(0, 2).toUpperCase();

  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden">
      <button
        className="w-full flex items-center gap-3 px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors text-left"
        onClick={() => setExpanded((v) => !v)}
      >
        <div className="w-8 h-8 rounded-lg bg-indigo-500 flex items-center justify-center flex-shrink-0">
          <span className="text-[10px] font-bold text-white">{initials}</span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-sm font-semibold text-gray-900">{run.agentName}</span>
            {run.tools.length > 0 && (
              <span className="flex items-center gap-1 text-[10px] font-medium bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded-lg">
                <Wrench className="w-2.5 h-2.5" />
                {run.tools.length} tool{run.tools.length > 1 ? 's' : ''}
              </span>
            )}
            {duration && (
              <span className="flex items-center gap-1 text-[10px] font-medium text-gray-600 bg-white border border-gray-200 px-1.5 py-0.5 rounded-lg">
                <Clock className="w-2.5 h-2.5" />
                {duration}
              </span>
            )}
          </div>
          <p className="text-[11px] text-gray-400 mt-0.5">{timeAgo(run.startedAt)}</p>
        </div>
        <div className="text-gray-400 flex-shrink-0">
          {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </div>
      </button>

      {expanded && (
        <div className="bg-white divide-y divide-gray-100">
          {run.tools.length > 0 && (
            <div className="px-4 py-2.5 flex items-start gap-2">
              <Wrench className="w-3 h-3 text-gray-400 mt-0.5 flex-shrink-0" />
              <div className="flex flex-wrap gap-1.5">
                {run.tools.map((tool, index) => (
                  <code key={`${tool}-${index}`} className="text-[11px] bg-gray-50 text-gray-700 px-2 py-0.5 rounded-lg border border-gray-200">
                    {tool}
                  </code>
                ))}
              </div>
            </div>
          )}

          {run.systemNotes.length > 0 && (
            <div className="px-4 py-2 space-y-0.5">
              {run.systemNotes.map((note, i) => (
                <p key={i} className="text-[11px] text-gray-400 italic">{note}</p>
              ))}
            </div>
          )}

          {run.response ? (
            <div className="px-4 py-3">
              <div className="flex items-center gap-1.5 mb-2">
                <Bot className="w-3 h-3 text-indigo-500" />
                <span className="text-[11px] font-semibold text-gray-700 uppercase tracking-wide">Output</span>
                <span className="text-[11px] text-gray-400 ml-auto">
                  {run.response.createdAt ? new Date(run.response.createdAt).toLocaleString() : ''}
                </span>
              </div>
              <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>
                {run.response.content}
              </ReactMarkdown>
            </div>
          ) : (
            <div className="px-4 py-3 flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse" />
              <span className="text-xs text-gray-400">Agent is working…</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Artifact Feedback Component ──────────────────────────────── */

function ArtifactFeedback({
  artifact,
  userId,
  onFeedbackSubmitted
}: {
  artifact: TaskArtifact;
  userId: string;
  onFeedbackSubmitted?: () => void;
}) {
  const [rating, setRating] = useState(0);
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [existingFeedback, setExistingFeedback] = useState<Feedback[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Load existing feedback
  useEffect(() => {
    const loadFeedback = async () => {
      try {
        const feedback = await listArtifactFeedback(userId, artifact.projectId, artifact.id);
        setExistingFeedback(feedback);
        if (feedback.length > 0) {
          setRating(feedback[0].score);
          setNotes(feedback[0].notes || '');
        }
      } catch {
        // Ignore errors
      } finally {
        setIsLoading(false);
      }
    };
    loadFeedback();
  }, [artifact.id, artifact.projectId, userId]);

  const handleSubmit = async () => {
    if (rating === 0) return;
    
    setIsSubmitting(true);
    try {
      await submitArtifactFeedback({
        userId,
        projectId: artifact.projectId,
        artifactId: artifact.id,
        score: rating,
        notes: notes.trim() || undefined
      });
      setIsSubmitted(true);
      onFeedbackSubmitted?.();
    } catch (error) {
      console.error('Failed to submit feedback:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div>
        <h4 className="text-sm font-medium text-gray-900 mb-2">Feedback</h4>
        <div className="text-xs text-gray-400">Loading feedback...</div>
      </div>
    );
  }

  return (
    <div>
      <h4 className="text-sm font-medium text-gray-900 mb-3">Feedback</h4>
      
      {isSubmitted ? (
        <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3">
          <p className="text-sm font-medium text-emerald-700">Thanks for your feedback!</p>
          <p className="text-xs text-gray-600 mt-1">This helps improve future outputs.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {/* Star Rating */}
          <div>
            <label className="block text-xs text-gray-500 mb-2">Rate this artifact</label>
            <div className="flex items-center gap-1">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  onClick={() => setRating(star)}
                  disabled={isSubmitting}
                  className="p-1 transition-colors"
                >
                  <Star
                    className={`w-5 h-5 ${
                      star <= rating
                        ? 'fill-amber-400 text-amber-400'
                        : 'fill-gray-200 text-gray-200'
                    }`}
                  />
                </button>
              ))}
              <span className="ml-2 text-xs text-gray-500">
                {rating > 0 ? `${rating}/5` : 'Select rating'}
              </span>
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs text-gray-500 mb-2">Additional notes (optional)</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="What did you like or dislike?"
              disabled={isSubmitting}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-gray-400 min-h-[80px] resize-none"
            />
          </div>

          {/* Submit Button */}
          <button
            onClick={handleSubmit}
            disabled={rating === 0 || isSubmitting}
            className={`px-4 py-2 text-sm font-medium rounded-lg ${
              rating === 0 || isSubmitting
                ? 'bg-gray-100 text-gray-400'
                : 'bg-gray-900 text-white hover:bg-gray-800'
            }`}
          >
            {isSubmitting ? 'Saving...' : 'Submit Feedback'}
          </button>
        </div>
      )}

      {/* Show existing feedback count */}
      {existingFeedback.length > 0 && !isSubmitted && (
        <p className="text-xs text-gray-400 mt-2">
          {existingFeedback.length} feedback submitted
        </p>
      )}
    </div>
  );
}

interface TaskDetailModalProps {
  open: boolean;
  task: Task | null;
  userId: string;
  title: string;
  onTitleChange: (value: string) => void;
  description: string;
  onDescriptionChange: (value: string) => void;
  status: string;
  onStatusChange: (value: string) => void;
  assigneeId: string;
  onAssigneeChange: (value: string) => void;
  priority: Task['priority'];
  onPriorityChange: (value: Task['priority']) => void;
  labels: string;
  onLabelsChange: (value: string) => void;
  startDate: string;
  onStartDateChange: (value: string) => void;
  dueDate: string;
  onDueDateChange: (value: string) => void;
  columns: Array<{ id: string; title: string }>;
  priorityConfig: Record<string, { label: string; dot: string; text: string; bg: string; border: string }>;
  agents: Agent[];
  agentNameById: (agentId?: string) => string;
  reporterName: string;
  agentResponses: TaskActivity[];
  activity: TaskActivity[];
  isActivityLoading: boolean;
  activityTab: 'all' | 'comments' | 'history' | 'worklog';
  onActivityTabChange: (value: 'all' | 'comments' | 'history' | 'worklog') => void;
  commentText: string;
  onCommentChange: (value: string) => void;
  onAddComment: () => void;
  isPostingComment: boolean;
  onClose: () => void;
  onSave: () => void;
  // Workflow actions
  onRequestChanges?: () => void;
  onApprove?: () => void;
}

const markdownComponents = {
  p: ({ children }: { children?: React.ReactNode }) => (
    <p className="text-sm text-gray-700 leading-relaxed mb-4 last:mb-0">{children}</p>
  ),
  h1: ({ children }: { children?: React.ReactNode }) => (
    <h1 className="text-2xl font-bold text-gray-900 mb-4 pb-2 border-b border-gray-200">{children}</h1>
  ),
  h2: ({ children }: { children?: React.ReactNode }) => (
    <h2 className="text-xl font-bold text-gray-900 mb-3 mt-6">{children}</h2>
  ),
  h3: ({ children }: { children?: React.ReactNode }) => (
    <h3 className="text-lg font-semibold text-gray-900 mb-2 mt-5">{children}</h3>
  ),
  h4: ({ children }: { children?: React.ReactNode }) => (
    <h4 className="text-base font-semibold text-gray-900 mb-2 mt-4">{children}</h4>
  ),
  strong: ({ children }: { children?: React.ReactNode }) => (
    <strong className="font-bold text-gray-900">{children}</strong>
  ),
  em: ({ children }: { children?: React.ReactNode }) => (
    <em className="italic text-gray-600">{children}</em>
  ),
  ul: ({ children }: { children?: React.ReactNode }) => (
    <ul className="list-disc pl-6 space-y-2 text-sm text-gray-700 my-4">{children}</ul>
  ),
  ol: ({ children }: { children?: React.ReactNode }) => (
    <ol className="list-decimal pl-6 space-y-2 text-sm text-gray-700 my-4">{children}</ol>
  ),
  li: ({ children }: { children?: React.ReactNode }) => (
    <li className="leading-relaxed marker:text-indigo-500">{children}</li>
  ),
  code: ({ children }: { children?: React.ReactNode }) => (
    <code className="px-1.5 py-0.5 rounded bg-gray-100 text-xs font-mono text-gray-800 border border-gray-200">{children}</code>
  ),
  pre: ({ children }: { children?: React.ReactNode }) => (
    <pre className="p-4 rounded-xl bg-gray-900 text-gray-100 text-xs overflow-x-auto my-4 font-mono">{children}</pre>
  ),
  blockquote: ({ children }: { children?: React.ReactNode }) => (
    <blockquote className="border-l-4 border-indigo-500 pl-4 py-2 my-4 bg-gray-50 rounded-r-lg italic text-gray-600">
      {children}
    </blockquote>
  ),
  hr: () => (
    <hr className="my-6 border-t border-gray-200" />
  ),
  a: ({ children, href }: { children?: React.ReactNode; href?: string }) => (
    <a href={href} className="text-indigo-600 hover:text-indigo-700 underline transition-colors" target="_blank" rel="noreferrer">
      {children}
    </a>
  ),
  table: ({ children }: { children?: React.ReactNode }) => (
    <div className="overflow-x-auto my-4">
      <table className="min-w-full border-collapse border border-gray-200 rounded-xl overflow-hidden">
        {children}
      </table>
    </div>
  ),
  thead: ({ children }: { children?: React.ReactNode }) => (
    <thead className="bg-gray-50">{children}</thead>
  ),
  th: ({ children }: { children?: React.ReactNode }) => (
    <th className="px-4 py-2 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider border-b border-gray-200">{children}</th>
  ),
  td: ({ children }: { children?: React.ReactNode }) => (
    <td className="px-4 py-2 text-sm border-b border-gray-100">{children}</td>
  ),
  tr: ({ children }: { children?: React.ReactNode }) => (
    <tr className="hover:bg-gray-50">{children}</tr>
  )
};

// Markdown components for Artifact Preview - Clean design, no shadows
const artifactMarkdownComponents = {
  p: ({ children }: { children?: React.ReactNode }) => (
    <p className="text-base text-gray-700 leading-relaxed mb-4 last:mb-0">{children}</p>
  ),
  h1: ({ children }: { children?: React.ReactNode }) => (
    <h1 className="text-3xl font-bold text-gray-900 mb-6 pb-4 border-b border-gray-200">{children}</h1>
  ),
  h2: ({ children }: { children?: React.ReactNode }) => (
    <h2 className="text-xl font-semibold text-gray-900 mb-3 mt-8">{children}</h2>
  ),
  h3: ({ children }: { children?: React.ReactNode }) => (
    <h3 className="text-lg font-semibold text-gray-900 mb-3 mt-6">{children}</h3>
  ),
  h4: ({ children }: { children?: React.ReactNode }) => (
    <h4 className="text-base font-semibold text-gray-900 mb-2 mt-4">{children}</h4>
  ),
  strong: ({ children }: { children?: React.ReactNode }) => (
    <strong className="font-semibold text-gray-900">{children}</strong>
  ),
  em: ({ children }: { children?: React.ReactNode }) => (
    <em className="italic text-gray-600">{children}</em>
  ),
  ul: ({ children }: { children?: React.ReactNode }) => (
    <ul className="list-disc pl-5 space-y-1.5 text-base text-gray-700 my-4">{children}</ul>
  ),
  ol: ({ children }: { children?: React.ReactNode }) => (
    <ol className="list-decimal pl-5 space-y-1.5 text-base text-gray-700 my-4">{children}</ol>
  ),
  li: ({ children }: { children?: React.ReactNode }) => (
    <li className="leading-relaxed">{children}</li>
  ),
  code: ({ children, className }: { children?: React.ReactNode; className?: string }) => {
    const isInline = !className;
    return isInline ? (
      <code className="px-1.5 py-0.5 rounded bg-gray-100 text-sm font-mono text-gray-800 border border-gray-200">
        {children}
      </code>
    ) : (
      <code className="text-sm">{children}</code>
    );
  },
  pre: ({ children }: { children?: React.ReactNode }) => (
    <pre className="p-4 rounded-xl bg-gray-900 text-gray-100 text-sm overflow-x-auto my-5 font-mono">
      {children}
    </pre>
  ),
  blockquote: ({ children }: { children?: React.ReactNode }) => (
    <blockquote className="border-l-4 border-gray-300 pl-4 py-2 my-5 bg-gray-50 rounded-r-lg italic text-gray-600">
      {children}
    </blockquote>
  ),
  hr: () => (
    <hr className="my-6 border-t border-gray-200" />
  ),
  a: ({ children, href }: { children?: React.ReactNode; href?: string }) => (
    <a 
      href={href} 
      className="text-indigo-600 hover:text-indigo-700 underline" 
      target="_blank" 
      rel="noreferrer"
    >
      {children}
    </a>
  ),
  table: ({ children }: { children?: React.ReactNode }) => (
    <div className="overflow-x-auto my-4 rounded-xl border border-gray-200">
      <table className="min-w-full border-collapse">
        {children}
      </table>
    </div>
  ),
  thead: ({ children }: { children?: React.ReactNode }) => (
    <thead className="bg-gray-50 border-b border-gray-200">{children}</thead>
  ),
  th: ({ children }: { children?: React.ReactNode }) => (
    <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
      {children}
    </th>
  ),
  td: ({ children }: { children?: React.ReactNode }) => (
    <td className="px-4 py-2.5 text-sm border-b border-gray-100 last:border-b-0">{children}</td>
  ),
  tr: ({ children }: { children?: React.ReactNode }) => (
    <tr className="hover:bg-gray-50">{children}</tr>
  ),
  img: ({ src, alt }: { src?: string; alt?: string }) => (
    <img 
      src={src} 
      alt={alt} 
      className="max-w-full rounded-xl border border-gray-200 my-4"
    />
  )
};

export default function TaskDetailModal({
  open,
  task,
  userId,
  title,
  onTitleChange,
  description,
  onDescriptionChange,
  status,
  onStatusChange,
  assigneeId,
  onAssigneeChange,
  priority,
  onPriorityChange,
  labels,
  onLabelsChange,
  startDate,
  onStartDateChange,
  dueDate,
  onDueDateChange,
  columns,
  priorityConfig,
  agents,
  agentNameById,
  reporterName,
  agentResponses,
  activity,
  isActivityLoading,
  activityTab,
  onActivityTabChange,
  commentText,
  onCommentChange,
  onAddComment,
  isPostingComment,
  onClose,
  onSave,
  onRequestChanges,
  onApprove
}: TaskDetailModalProps) {
  const [artifacts, setArtifacts] = useState<TaskArtifact[]>([]);
  const [isLoadingArtifacts, setIsLoadingArtifacts] = useState(false);
  const [previewArtifact, setPreviewArtifact] = useState<(TaskArtifact & { content?: string }) | null>(null);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);

  useEffect(() => {
    if (!open || !task) { setArtifacts([]); return; }
    setIsLoadingArtifacts(true);
    listTaskArtifacts(userId, task.projectId, task.id)
      .then(setArtifacts)
      .catch(() => setArtifacts([]))
      .finally(() => setIsLoadingArtifacts(false));
  }, [open, task?.id, userId]);

  const openPreview = useCallback(async (artifact: TaskArtifact) => {
    setPreviewArtifact(artifact);
    setIsLoadingPreview(true);
    try {
      const full = await getTaskArtifact(userId, artifact.projectId, artifact.taskId, artifact.id);
      setPreviewArtifact(full);
    } catch {
      // keep partial data
    } finally {
      setIsLoadingPreview(false);
    }
  }, [userId]);

  const downloadArtifact = useCallback((artifact: TaskArtifact & { content?: string }) => {
    if (!artifact.content) return;
    const blob = new Blob([artifact.content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = artifact.filename;
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  if (!open || !task) return null;

  const assigneeLabel = assigneeId ? agentNameById(assigneeId) : 'Unassigned';
  const worklogRuns = groupWorklogEntries(activity, agentNameById);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative bg-white rounded-2xl border border-gray-200 w-[96vw] max-w-6xl max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
          <div className="flex items-center gap-3">
            <span className="text-xs font-mono text-gray-400">{task.taskId}</span>
            <span className="text-gray-300">|</span>
            <span className="text-xs text-gray-500">{assigneeLabel}</span>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100" aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-0 flex-1 min-h-0">
          {/* Left Column - Main Content */}
          <div className="p-6 overflow-y-auto min-h-0 hide-scrollbar border-r border-gray-100">
            <div className="space-y-6">
              {/* Title */}
              <div>
                <input
                  value={title}
                  onChange={(e) => onTitleChange(e.target.value)}
                  className="w-full text-xl font-semibold text-gray-900 border-0 border-b border-gray-200 pb-2 focus:outline-none focus:border-indigo-500 transition-colors bg-transparent"
                  placeholder="Task title"
                />
              </div>

              {/* Description */}
              <div>
                <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2">
                  <FileText className="w-4 h-4" />
                  Description
                </label>
                <textarea
                  value={description}
                  onChange={(e) => onDescriptionChange(e.target.value)}
                  className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all min-h-[120px] resize-none"
                  placeholder="Write the task details here"
                />
              </div>

              {/* Agent Response */}
              {agentResponses.length > 0 && (
                <div>
                  <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2">
                    <Bot className="w-4 h-4" />
                    Agent Response
                  </label>
                  <div className="bg-indigo-50/50 border border-indigo-100 rounded-xl p-4">
                    <div className="flex items-center justify-between text-xs text-gray-500 mb-2">
                      <span className="font-medium">{agentNameById(agentResponses[0].agentId)}</span>
                      <span>
                        {agentResponses[0].createdAt
                          ? new Date(agentResponses[0].createdAt).toLocaleString()
                          : ''}
                      </span>
                    </div>
                    <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                      {agentResponses[0].content}
                    </ReactMarkdown>
                  </div>
                </div>
              )}

              {/* Files Section */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
                    <FileText className="w-4 h-4" />
                    Files
                  </label>
                  {artifacts.length > 0 && (
                    <span className="text-xs text-gray-400">{artifacts.length} file{artifacts.length > 1 ? 's' : ''}</span>
                  )}
                </div>
                {isLoadingArtifacts ? (
                  <div className="text-xs text-gray-400 py-2">Loading files…</div>
                ) : artifacts.length === 0 ? (
                  <div className="bg-gray-50 border border-dashed border-gray-200 rounded-xl p-4 text-center">
                    <FileText className="w-6 h-6 text-gray-300 mx-auto mb-1" />
                    <p className="text-xs text-gray-400">No files yet. Agents will create files here when they produce deliverables.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-3">
                    {artifacts.map((artifact) => {
                      const extColor: Record<string, { bg: string; text: string; border: string }> = {
                        markdown: { bg: 'bg-indigo-50', text: 'text-indigo-700', border: 'border-indigo-200' },
                        html: { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200' },
                        csv: { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' },
                        text: { bg: 'bg-gray-50', text: 'text-gray-600', border: 'border-gray-200' }
                      };
                      const colorClass = extColor[artifact.fileType] || extColor.text;
                      return (
                        <button
                          key={artifact.id}
                          onClick={() => openPreview(artifact)}
                          className={`flex items-start gap-3 p-3 border rounded-xl bg-white hover:border-gray-300 transition-all text-left group ${colorClass.border}`}
                        >
                          <div className={`flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center ${colorClass.bg}`}>
                            <FileText className={`w-5 h-5 ${colorClass.text}`} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-semibold text-gray-900 truncate leading-tight">{artifact.title}</p>
                            <p className="text-[10px] text-gray-400 truncate mt-0.5">{artifact.filename}</p>
                            {artifact.size != null && (
                              <p className="text-[10px] text-gray-400">{(artifact.size / 1024).toFixed(1)} KB</p>
                            )}
                          </div>
                          <Eye className="w-4 h-4 text-gray-400 group-hover:text-gray-600 flex-shrink-0 mt-0.5 transition-colors" />
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Activity */}
              <div>
                <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-3">
                  <Clock className="w-4 h-4" />
                  Activity
                </label>
                <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                  {/* Activity Tabs */}
                  <div className="flex items-center gap-1 p-2 border-b border-gray-100 bg-gray-50">
                    {(['all', 'comments', 'history', 'worklog'] as const).map((tab) => (
                      <button
                        key={tab}
                        onClick={() => onActivityTabChange(tab)}
                        className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${
                          activityTab === tab
                            ? 'bg-white text-gray-900 border border-gray-200'
                            : 'text-gray-500 hover:text-gray-700 hover:bg-white/50'
                        }`}
                      >
                        {tab === 'all' && 'All'}
                        {tab === 'comments' && 'Comments'}
                        {tab === 'history' && 'History'}
                        {tab === 'worklog' && 'Work log'}
                      </button>
                    ))}
                  </div>

                  {/* Activity Content */}
                  <div className="p-4 max-h-[300px] overflow-y-auto">
                    {isActivityLoading ? (
                      <div className="text-xs text-gray-400 text-center py-4">Loading activity...</div>
                    ) : activity.length === 0 ? (
                      <div className="text-xs text-gray-400 text-center py-4">No activity yet</div>
                    ) : (
                      <div className="space-y-3">
                        {activityTab === 'worklog' ? (
                          worklogRuns.length === 0 ? (
                            <div className="text-xs text-gray-400 text-center py-4">No worklog entries</div>
                          ) : (
                            <div className="space-y-2">
                              {worklogRuns.map((run, index) => (
                                <WorklogRunCard key={index} run={run} mdComponents={markdownComponents} />
                              ))}
                            </div>
                          )
                        ) : (
                          activity.map((entry, index) => (
                            <div key={index} className="flex gap-3">
                              <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0">
                                {entry.role === 'user' ? (
                                  <User className="w-4 h-4 text-gray-500" />
                                ) : entry.role === 'agent' ? (
                                  <Bot className="w-4 h-4 text-indigo-500" />
                                ) : (
                                  <Clock className="w-4 h-4 text-gray-400" />
                                )}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm text-gray-700">
                                  <span className="font-medium">
                                    {entry.role === 'user' ? reporterName : agentNameById(entry.agentId)}
                                  </span>{' '}
                                  {entry.content}
                                </p>
                                <p className="text-xs text-gray-400 mt-0.5">
                                  {entry.createdAt ? timeAgo(entry.createdAt) : ''}
                                </p>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    )}
                  </div>

                  {/* Add Comment */}
                  {activityTab !== 'worklog' && (
                    <div className="p-3 border-t border-gray-100 bg-gray-50">
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={commentText}
                          onChange={(e) => onCommentChange(e.target.value)}
                          placeholder="Add a comment..."
                          className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                              e.preventDefault();
                              onAddComment();
                            }
                          }}
                        />
                        <button
                          onClick={onAddComment}
                          disabled={!commentText.trim() || isPostingComment}
                          className="px-4 py-2 text-sm font-medium bg-indigo-500 text-white rounded-lg hover:bg-indigo-600 transition-all disabled:opacity-50"
                        >
                          {isPostingComment ? '...' : 'Post'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Right Column - Properties */}
          <div className="p-6 overflow-y-auto min-h-0 hide-scrollbar bg-gray-50">
            <div className="space-y-4">
              {/* Status */}
              <div>
                <label className="flex items-center gap-2 text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
                  Status
                </label>
                <select
                  value={status}
                  onChange={(e) => onStatusChange(e.target.value)}
                  className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                >
                  {columns.map((column) => (
                    <option key={column.id} value={column.id}>
                      {column.title}
                    </option>
                  ))}
                </select>
              </div>

              {/* Priority */}
              <div>
                <label className="flex items-center gap-2 text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
                  Priority
                </label>
                <div className="space-y-1">
                  {Object.entries(priorityConfig).map(([key, value]) => (
                    <button
                      key={key}
                      onClick={() => onPriorityChange(key as Task['priority'])}
                      className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-all ${
                        priority === key
                          ? `${value.bg} ${value.text} border ${value.border}`
                          : 'text-gray-600 hover:bg-white border border-transparent'
                      }`}
                    >
                      <span className={`w-2 h-2 rounded-full ${value.dot}`} />
                      {value.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Assignee */}
              <div>
                <label className="flex items-center gap-2 text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
                  <User className="w-3.5 h-3.5" />
                  Assignee
                </label>
                <select
                  value={assigneeId}
                  onChange={(e) => onAssigneeChange(e.target.value)}
                  className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                >
                  <option value="">Unassigned</option>
                  {agents.map((agent) => (
                    <option key={agent.id} value={agent.id}>
                      {agent.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Labels */}
              <div>
                <label className="flex items-center gap-2 text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
                  <Tag className="w-3.5 h-3.5" />
                  Labels
                </label>
                <input
                  type="text"
                  value={labels}
                  onChange={(e) => onLabelsChange(e.target.value)}
                  placeholder="Marketing, SEO..."
                  className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                />
              </div>

              {/* Dates */}
              <div>
                <label className="flex items-center gap-2 text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
                  <Calendar className="w-3.5 h-3.5" />
                  Dates
                </label>
                <div className="space-y-2">
                  <div>
                    <span className="text-xs text-gray-400">Start date</span>
                    <input
                      type="date"
                      value={startDate}
                      onChange={(e) => onStartDateChange(e.target.value)}
                      className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all mt-1"
                    />
                  </div>
                  <div>
                    <span className="text-xs text-gray-400">Due date</span>
                    <input
                      type="date"
                      value={dueDate}
                      onChange={(e) => onDueDateChange(e.target.value)}
                      className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all mt-1"
                    />
                  </div>
                </div>
              </div>

              {/* Reporter */}
              <div className="pt-4 border-t border-gray-200">
                <label className="flex items-center gap-2 text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
                  Reporter
                </label>
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-gray-200 flex items-center justify-center">
                    <span className="text-sm font-medium text-gray-600">
                      {reporterName.charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <span className="text-sm text-gray-700">{reporterName}</span>
                </div>
              </div>

              {/* Workflow Actions / Save Button */}
              {status === 'review' ? (
                <div className="pt-4 space-y-2">
                  <div className="text-xs text-gray-500 font-medium uppercase tracking-wide mb-2">
                    Review Actions
                  </div>
                  <button
                    onClick={onApprove}
                    className="w-full py-2.5 text-sm font-medium bg-emerald-500 text-white rounded-xl hover:bg-emerald-600 transition-all flex items-center justify-center gap-2"
                  >
                    <CheckCircle className="w-4 h-4" />
                    Approve & Move to Done
                  </button>
                  <button
                    onClick={onRequestChanges}
                    className="w-full py-2.5 text-sm font-medium bg-white text-gray-700 border border-gray-200 rounded-xl hover:bg-gray-50 transition-all flex items-center justify-center gap-2"
                  >
                    <RotateCcw className="w-4 h-4" />
                    Request Changes
                  </button>
                </div>
              ) : (
                <div className="pt-4">
                  <button
                    onClick={onSave}
                    className="w-full py-2.5 text-sm font-medium bg-indigo-500 text-white rounded-xl hover:bg-indigo-600 transition-all"
                  >
                    Save changes
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Artifact Preview Modal - Clean Design */}
      {previewArtifact && (
        <div className="fixed inset-0 z-[60] flex flex-col bg-white">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
            <div className="flex items-center gap-4">
              <button
                onClick={() => setPreviewArtifact(null)}
                className="p-2 hover:bg-gray-100 rounded-lg text-gray-500 hover:text-gray-700 transition-colors"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <div>
                <h3 className="text-base font-semibold text-gray-900">{previewArtifact.title}</h3>
                <p className="text-xs text-gray-400">{previewArtifact.filename}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => downloadArtifact(previewArtifact)}
                disabled={!previewArtifact.content || isLoadingPreview}
                className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50"
              >
                Download
              </button>
              <button
                onClick={() => setPreviewArtifact(null)}
                className="p-2 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>
          
          {/* Content */}
          <div className="flex-1 overflow-auto">
            <div className="max-w-3xl mx-auto p-8">
              {isLoadingPreview ? (
                <div className="flex items-center justify-center py-20">
                  <div className="text-center">
                    <div className="w-8 h-8 border-4 border-gray-200 border-t-gray-400 rounded-full animate-spin mx-auto" />
                    <p className="text-sm text-gray-500 mt-3">Loading content...</p>
                  </div>
                </div>
              ) : previewArtifact.content ? (
                <div>
                  {/* Content */}
                  {previewArtifact.fileType === 'markdown' || previewArtifact.filename.endsWith('.md') ? (
                    <div className="prose prose-gray max-w-none">
                      <ReactMarkdown 
                        remarkPlugins={[remarkGfm]} 
                        components={artifactMarkdownComponents}
                      >
                        {previewArtifact.content}
                      </ReactMarkdown>
                    </div>
                  ) : (
                    <pre className="text-sm text-gray-700 whitespace-pre-wrap font-mono bg-gray-50 p-4 rounded-xl border border-gray-200">
                      {previewArtifact.content}
                    </pre>
                  )}
                  
                  {/* Feedback Section */}
                  <div className="mt-10 pt-8 border-t border-gray-200">
                    <ArtifactFeedback
                      artifact={previewArtifact}
                      userId={userId}
                      onFeedbackSubmitted={() => setPreviewArtifact(null)}
                    />
                  </div>
                </div>
              ) : (
                <div className="text-center py-20 text-gray-400">
                  Failed to load content
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
