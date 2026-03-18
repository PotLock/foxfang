'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import type { AgentTrace } from '@/lib/api/agents';
import { listAgentTraces, createAgentEventSource } from '@/lib/api/agents';
import TerminalLogEntry from './TerminalLogEntry';
import { Loader2, Terminal, Wifi, WifiOff } from 'lucide-react';

interface AgentTerminalLogProps {
  userId: string;
  agentId: string;
}

export default function AgentTerminalLog({ userId, agentId }: AgentTerminalLogProps) {
  const [traces, setTraces] = useState<AgentTrace[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isConnected, setIsConnected] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Load historical traces
  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        setIsLoading(true);
        const historical = await listAgentTraces(userId, agentId, { limit: 200 });
        if (!cancelled) {
          // API returns DESC order, reverse for chronological display
          setTraces(historical.reverse());
        }
      } catch (err) {
        console.error('[AgentTerminalLog] Failed to load traces:', err);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    load();
    return () => { cancelled = true; };
  }, [userId, agentId]);

  // SSE subscription for live events
  useEffect(() => {
    const es = createAgentEventSource(userId, agentId);

    es.onopen = () => setIsConnected(true);
    es.onerror = () => setIsConnected(false);

    const traceEventTypes = [
      'agent:run:started',
      'agent:run:completed',
      'agent:run:failed',
      'tool:called',
      'tool:completed',
      'tool:failed',
    ];

    for (const evType of traceEventTypes) {
      es.addEventListener(evType, (event: MessageEvent) => {
        try {
          const data = JSON.parse(event.data);
          const newTrace: AgentTrace = {
            id: `live-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            sessionId: data.sessionId || '',
            projectId: data.payload?.projectId || null,
            agentId: data.payload?.agentId || agentId,
            eventType: data.type || evType,
            payload: data.payload || {},
            createdAt: data.timestamp || new Date().toISOString(),
          };
          setTraces(prev => [...prev, newTrace]);
        } catch {
          // ignore parse errors
        }
      });
    }

    return () => {
      es.close();
      setIsConnected(false);
    };
  }, [userId, agentId]);

  // Auto-scroll to bottom
  useEffect(() => {
    if (autoScroll && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [traces, autoScroll]);

  // Detect manual scroll
  const handleScroll = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    const isAtBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 40;
    setAutoScroll(isAtBottom);
  }, []);

  return (
    <div className="flex flex-col h-full bg-[#0d1117] rounded-xl border border-gray-800 overflow-hidden">
      {/* Terminal header */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-[#161b22] border-b border-gray-800">
        <div className="flex items-center gap-2">
          <Terminal className="w-4 h-4 text-gray-500" />
          <span className="text-sm font-medium text-gray-300">Agent Logs</span>
          <span className="text-xs text-gray-600">({traces.length} events)</span>
        </div>
        <div className="flex items-center gap-2">
          {isConnected ? (
            <span className="flex items-center gap-1 text-xs text-emerald-400">
              <Wifi className="w-3 h-3" />
              Live
            </span>
          ) : (
            <span className="flex items-center gap-1 text-xs text-gray-500">
              <WifiOff className="w-3 h-3" />
              Disconnected
            </span>
          )}
        </div>
      </div>

      {/* Log content */}
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto py-2 scrollbar-thin scrollbar-thumb-gray-700 scrollbar-track-transparent"
      >
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-5 h-5 text-gray-500 animate-spin" />
          </div>
        ) : traces.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-gray-600">
            <Terminal className="w-8 h-8 mb-2" />
            <span className="text-sm">No trace events yet</span>
            <span className="text-xs mt-1">Events will appear when this agent runs tasks</span>
          </div>
        ) : (
          traces.map(trace => (
            <TerminalLogEntry key={trace.id} trace={trace} />
          ))
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
