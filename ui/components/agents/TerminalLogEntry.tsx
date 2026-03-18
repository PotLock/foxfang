'use client';

import type { AgentTrace } from '@/lib/api/agents';

const EVENT_COLORS: Record<string, { badge: string; text: string }> = {
  'agent:run:started': { badge: 'bg-blue-500/20 text-blue-400', text: 'text-blue-300' },
  'agent:run:completed': { badge: 'bg-emerald-500/20 text-emerald-400', text: 'text-emerald-300' },
  'agent:run:failed': { badge: 'bg-red-500/20 text-red-400', text: 'text-red-300' },
  'tool:called': { badge: 'bg-amber-500/20 text-amber-400', text: 'text-amber-300' },
  'tool:completed': { badge: 'bg-emerald-500/20 text-emerald-400', text: 'text-gray-400' },
  'tool:failed': { badge: 'bg-red-500/20 text-red-400', text: 'text-red-300' },
};

function formatTimestamp(ts: string): string {
  const d = new Date(ts);
  return d.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function getEventLabel(eventType: string): string {
  switch (eventType) {
    case 'agent:run:started': return 'RUN STARTED';
    case 'agent:run:completed': return 'RUN COMPLETED';
    case 'agent:run:failed': return 'RUN FAILED';
    case 'tool:called': return 'TOOL CALL';
    case 'tool:completed': return 'TOOL OK';
    case 'tool:failed': return 'TOOL FAIL';
    default: return eventType.toUpperCase();
  }
}

function getSummary(trace: AgentTrace): string {
  const p = trace.payload;
  const toolName = (p.toolName as string) || '';
  const message = (p.message as string) || '';
  const output = (p.output as string) || '';
  const errorMsg = (p.error as string) || '';
  const duration = p.duration as number | undefined;
  const failedTools = p.failedTools as string[] | undefined;
  const stack = (p.stack as string) || '';

  switch (trace.eventType) {
    case 'agent:run:started':
      return message ? `"${message.slice(0, 120)}"` : 'Agent run initiated';
    case 'agent:run:completed':
      return duration ? `Completed in ${duration}ms` : 'Run completed';
    case 'agent:run:failed': {
      const parts: string[] = [];
      if (errorMsg) parts.push(errorMsg);
      if (failedTools && failedTools.length > 0) {
        parts.push(`\n  Failed tools: ${failedTools.join('; ')}`);
      }
      if (stack) {
        // Show first 2 stack frames for context
        const frames = stack.split('\n').slice(1, 3).map(l => l.trim()).join(' → ');
        if (frames) parts.push(`\n  at ${frames}`);
      }
      if (duration) parts.push(`(${duration}ms)`);
      return parts.length > 0 ? parts.join(' ') : 'Run failed (unknown reason)';
    }
    case 'tool:called':
      return `${toolName}(${formatArgs(p.args)})`;
    case 'tool:completed':
      return `${toolName} → ${output.slice(0, 150)}`;
    case 'tool:failed':
      return `${toolName} ✗ ${errorMsg || output}`.slice(0, 200);
    default:
      return JSON.stringify(p).slice(0, 150);
  }
}

function formatArgs(args: unknown): string {
  if (!args || typeof args !== 'object') return '';
  const str = JSON.stringify(args);
  return str.length > 80 ? str.slice(0, 80) + '...' : str;
}

interface TerminalLogEntryProps {
  trace: AgentTrace;
}

export default function TerminalLogEntry({ trace }: TerminalLogEntryProps) {
  const colors = EVENT_COLORS[trace.eventType] || { badge: 'bg-gray-500/20 text-gray-400', text: 'text-gray-400' };

  const summary = getSummary(trace);
  const isError = trace.eventType === 'agent:run:failed' || trace.eventType === 'tool:failed';

  return (
    <div className={`flex items-start gap-3 px-4 py-1.5 hover:bg-white/5 font-mono text-[13px] leading-6 group ${isError ? 'bg-red-500/5' : ''}`}>
      <span className="text-gray-600 shrink-0 select-none">
        {trace.createdAt ? formatTimestamp(trace.createdAt) : '--:--:--'}
      </span>
      <span className={`shrink-0 px-1.5 py-0 rounded text-[11px] font-semibold uppercase tracking-wide ${colors.badge}`}>
        {getEventLabel(trace.eventType)}
      </span>
      <span className={`${colors.text} break-all whitespace-pre-wrap`}>
        {summary}
      </span>
    </div>
  );
}
