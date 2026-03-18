'use client';

import { useMemo } from 'react';
import { X, AlertCircle } from 'lucide-react';
import type { Task } from '@/lib/api/tasks';
import type { Agent } from '@/lib/api/agents';

interface CreateTaskModalProps {
  open: boolean;
  isCreating: boolean;
  onClose: () => void;
  onSubmit: () => void;
  taskTitle: string;
  setTaskTitle: (value: string) => void;
  taskDescription: string;
  setTaskDescription: (value: string) => void;
  createColumnId: string;
  setCreateColumnId: (value: string) => void;
  taskPriority: Task['priority'];
  setTaskPriority: (value: Task['priority']) => void;
  taskAssigneeId: string;
  setTaskAssigneeId: (value: string) => void;
  taskLabels: string;
  setTaskLabels: (value: string) => void;
  taskStartDate: string;
  setTaskStartDate: (value: string) => void;
  taskDueDate: string;
  setTaskDueDate: (value: string) => void;
  columns: Array<{ id: string; title: string }>;
  priorityConfig: Record<string, { label: string; dot: string; text: string }>;
  agents: Agent[];
}

export default function CreateTaskModal({
  open,
  isCreating,
  onClose,
  onSubmit,
  taskTitle,
  setTaskTitle,
  taskDescription,
  setTaskDescription,
  createColumnId,
  setCreateColumnId,
  taskPriority,
  setTaskPriority,
  taskAssigneeId,
  setTaskAssigneeId,
  taskLabels,
  setTaskLabels,
  taskStartDate,
  setTaskStartDate,
  taskDueDate,
  setTaskDueDate,
  columns,
  priorityConfig,
  agents
}: CreateTaskModalProps) {
  if (!open) return null;

  // Validation
  const validation = useMemo(() => {
    const errors: string[] = [];
    
    if (!taskStartDate) {
      errors.push('Start date is required');
    } else {
      const start = new Date(taskStartDate);
      const now = new Date();
      now.setHours(0, 0, 0, 0);
      if (start < now) {
        errors.push('Start date cannot be in the past');
      }
    }
    
    if (!taskDueDate) {
      errors.push('Due date is required');
    } else if (taskStartDate) {
      const start = new Date(taskStartDate);
      const due = new Date(taskDueDate);
      if (due <= start) {
        errors.push('Due date must be after start date');
      }
    }
    
    return {
      isValid: errors.length === 0,
      errors
    };
  }, [taskStartDate, taskDueDate]);

  const isSubmitDisabled = isCreating || !taskTitle.trim() || !validation.isValid;

  // Get today's date for min attribute
  const today = new Date().toISOString().split('T')[0];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative bg-white rounded-2xl w-full max-w-xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-gray-900">Create task</h2>
          <button
            onClick={onClose}
            className={`text-gray-400 hover:text-gray-600 transition-colors w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 ${isCreating ? 'opacity-50 pointer-events-none' : ''}`}
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {/* Validation Errors */}
          {!validation.isValid && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4">
              <div className="flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
                <div className="space-y-1">
                  {validation.errors.map((error, index) => (
                    <p key={index} className="text-sm text-red-600">{error}</p>
                  ))}
                </div>
              </div>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Title <span className="text-red-500">*</span>
            </label>
            <input
              value={taskTitle}
              onChange={(e) => setTaskTitle(e.target.value)}
              className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
              placeholder="Describe the task"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Description</label>
            <textarea
              value={taskDescription}
              onChange={(e) => setTaskDescription(e.target.value)}
              className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all min-h-[100px] resize-none"
              placeholder="Add more details"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Status</label>
              <select
                value={createColumnId}
                onChange={(e) => setCreateColumnId(e.target.value)}
                className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all bg-white"
              >
                {columns.map((column) => (
                  <option key={column.id} value={column.id}>
                    {column.title}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Priority</label>
              <div className="grid grid-cols-3 gap-2">
                {Object.entries(priorityConfig).map(([key, value]) => (
                  <button
                    key={key}
                    onClick={() => setTaskPriority(key as Task['priority'])}
                    className={`flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-sm font-medium border transition-all ${
                      taskPriority === key
                        ? 'bg-indigo-50 border-indigo-200 text-indigo-700'
                        : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'
                    }`}
                  >
                    <span className={`w-2 h-2 rounded-full ${value.dot}`} />
                    {value.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Assignee</label>
              <select
                value={taskAssigneeId}
                onChange={(e) => setTaskAssigneeId(e.target.value)}
                className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all bg-white"
              >
                <option value="">Unassigned</option>
                {agents.map((agent) => (
                  <option key={agent.id} value={agent.id}>
                    {agent.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Labels</label>
              <input
                value={taskLabels}
                onChange={(e) => setTaskLabels(e.target.value)}
                className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                placeholder="Marketing, SEO"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Start date <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                min={today}
                value={taskStartDate}
                onChange={(e) => setTaskStartDate(e.target.value)}
                className={`w-full rounded-xl border px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all ${
                  !taskStartDate || (taskStartDate && new Date(taskStartDate) < new Date(today))
                    ? 'border-red-300 bg-red-50/30'
                    : 'border-gray-200'
                }`}
              />
              <p className="text-xs text-gray-500 mt-1">Task will be available from this date</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Due date <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                min={taskStartDate || today}
                value={taskDueDate}
                onChange={(e) => setTaskDueDate(e.target.value)}
                className={`w-full rounded-xl border px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all ${
                  !taskDueDate || (taskStartDate && taskDueDate && new Date(taskDueDate) <= new Date(taskStartDate))
                    ? 'border-red-300 bg-red-50/30'
                    : 'border-gray-200'
                }`}
              />
              <p className="text-xs text-gray-500 mt-1">Must be after start date</p>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 p-6 border-t border-gray-100">
          <button
            onClick={onClose}
            className="px-5 py-2.5 text-sm font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-xl transition-colors"
            disabled={isCreating}
          >
            Cancel
          </button>
          <button
            onClick={onSubmit}
            disabled={isSubmitDisabled}
            className="px-5 py-2.5 text-sm font-medium bg-indigo-500 text-white rounded-xl hover:bg-indigo-600 transition-all disabled:opacity-50"
          >
            {isCreating ? 'Creating...' : 'Create task'}
          </button>
        </div>
      </div>
    </div>
  );
}
