/**
 * Agent Executor
 *
 * Executes agent runs with session management, history pruning, and tracing.
 * No orchestrator agent — routing is deterministic via config bindings.
 * The model self-delegates to sub-agents via sessions_spawn tool.
 */

import {
  AgentContext,
  AgentMessage,
  AgentRequest,
  AgentResponse,
  RunRequest,
  RunResponse,
} from './types';
import { agentRegistry, ensureAgentRegistered, resolveDefaultAgentId } from './registry';
import { runAgent, runAgentStream } from './runtime';
import { resolveTokenBudget } from './budget';
import { pruneHistory, estimateTotalTokens } from './compaction';
import { SessionManager } from '../sessions/manager';
import { toolRegistry } from '../tools/index';
import { searchMemories, storeMemory } from '../memory/database';
import { WorkspaceManager } from '../workspace/manager';
import { buildRollingSessionSummary } from '../sessions/summary';
import { addAgentUsage, addToolTelemetry, createRequestTrace, flushRequestTrace } from '../observability/request-trace';

const MAX_MEMORY_HINTS = 4;

function toEpochMs(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (value instanceof Date) return value.getTime();
  const parsed = Date.parse(String(value || ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

function buildMemoryQueries(params: {
  message?: string;
  sessionSummary?: { currentGoal?: string; openLoops?: string[] };
}): string[] {
  const queries: string[] = [];
  const push = (value?: string) => {
    const text = String(value || '').trim();
    if (!text) return;
    if (text.length < 2) return;
    queries.push(text);
  };

  push(params.message);
  push(params.sessionSummary?.currentGoal);
  for (const loop of params.sessionSummary?.openLoops || []) {
    push(loop);
    if (queries.length >= 5) break;
  }
  return Array.from(new Set(queries)).slice(0, 5);
}

function selectMemoryHints(params: {
  queries: string[];
  projectId?: string;
  sessionId: string;
}): Array<{
  id?: number;
  content: string;
  category?: string;
  importance?: number;
  source?: string;
}> {
  if (params.queries.length === 0) return [];

  const merged = new Map<string, any>();
  for (const queryText of params.queries) {
    for (const entry of searchMemories(queryText, 10)) {
      const key = typeof entry.id === 'number' ? `id:${entry.id}` : `content:${entry.content}`;
      if (!merged.has(key)) {
        merged.set(key, entry);
      }
    }
  }

  const now = Date.now();
  const ranked = Array.from(merged.values())
    .map((entry) => {
      const projectId = String((entry as any).projectId || (entry as any).project_id || '').trim();
      const sessionId = String((entry as any).sessionId || (entry as any).session_id || '').trim();
      const ageDays = Math.max(0, (now - toEpochMs((entry as any).createdAt || (entry as any).created_at)) / 86_400_000);
      const recencyScore = Math.max(0, 40 - Math.floor(ageDays));
      const score =
        (Number(entry.importance || 0) * 20) +
        recencyScore +
        (params.projectId && projectId === params.projectId ? 120 : 0) +
        (sessionId && sessionId === params.sessionId ? 90 : 0);
      return { entry, score, projectId, sessionId };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_MEMORY_HINTS);

  return ranked.map(({ entry, projectId, sessionId }) => {
    const sourceBits: string[] = ['memory-db'];
    if (projectId) sourceBits.push(`project:${projectId}`);
    if (sessionId) sourceBits.push(`session:${sessionId}`);
    return {
      id: entry.id,
      content: String(entry.content || ''),
      category: entry.category,
      importance: typeof entry.importance === 'number' ? entry.importance : Number(entry.importance || 0),
      source: sourceBits.join('|'),
    };
  });
}

/**
 * AgentOrchestrator — the execution engine for agent runs.
 * Despite the name (kept for backward compatibility), this is NOT an orchestrator agent.
 * It simply executes whatever agent is resolved for the request.
 */
export class AgentOrchestrator {
  private sessionManager: SessionManager;
  private workspaceManager?: WorkspaceManager;

  constructor(sessionManager: SessionManager, workspaceManager?: WorkspaceManager) {
    this.sessionManager = sessionManager;
    this.workspaceManager = workspaceManager;
  }

  setWorkspaceManager(workspaceManager: WorkspaceManager): void {
    this.workspaceManager = workspaceManager;
  }

  async process(request: AgentRequest): Promise<AgentResponse> {
    const defaultAgentId = await resolveDefaultAgentId();
    const result = await this.run({
      sessionId: request.sessionId || `session-${Date.now()}`,
      agentId: defaultAgentId,
      message: request.query,
      projectId: request.projectId,
    });

    return {
      content: result.content,
      toolCalls: result.toolCalls,
    };
  }

  async run(request: RunRequest): Promise<RunResponse> {
    const requestStartedAt = Date.now();
    const requestId = `${request.sessionId}:${Date.now()}`;
    const trace = createRequestTrace(requestId);

    const session = await this.sessionManager.getSession(request.sessionId);
    let messages: AgentMessage[] = request.messages || [];
    if (messages.length === 0 && session?.messages) {
      messages = session.messages.slice(-20).map((m) => ({
        role: m.role,
        content: m.content,
        timestamp: new Date(m.timestamp),
      }));
    }

    const enhancedMessage = request.message;

    if (enhancedMessage) {
      messages.push({
        role: 'user',
        content: enhancedMessage,
        timestamp: new Date(),
      });
      await this.sessionManager.addMessage(request.sessionId, {
        role: 'user',
        content: enhancedMessage,
        timestamp: Date.now(),
      });
    }

    // Resolve the agent — fully config-driven
    const agent = await ensureAgentRegistered(request.agentId);
    const userId = request.userId || 'default_user';

    // Use minimal prompt mode for channel sessions to reduce token usage
    const isChannelSession = request.sessionId.startsWith('channel-');
    const promptMode = isChannelSession ? 'minimal' as const : 'full' as const;

    const budget = resolveTokenBudget({ agentId: request.agentId, mode: 'balanced' });
    const sessionSummary = await this.sessionManager.getSessionSummary(request.sessionId);
    const memoryHints = selectMemoryHints({
      queries: buildMemoryQueries({
        message: enhancedMessage,
        sessionSummary: sessionSummary
          ? {
            currentGoal: sessionSummary.currentGoal,
            openLoops: sessionSummary.openLoops,
          }
          : undefined,
      }),
      projectId: request.projectId,
      sessionId: request.sessionId,
    });

    // Prune history if it exceeds budget — drops oldest messages first
    const rawTokens = estimateTotalTokens(messages);
    let prunedMessages = messages;
    if (rawTokens > budget.requestMaxInputTokens * 0.5) {
      const pruned = pruneHistory({
        messages,
        maxContextTokens: budget.requestMaxInputTokens * 2,
        maxHistoryShare: 0.5,
      });
      prunedMessages = pruned.messages;
      if (pruned.droppedCount > 0) {
        console.log(`[AgentExecutor] ✂️ Pruned ${pruned.droppedCount} old messages (${rawTokens} → ${pruned.keptTokens} est. tokens)`);
      }
    }

    const agentContext: AgentContext = {
      sessionId: request.sessionId,
      projectId: request.projectId,
      userId,
      messages: prunedMessages,
      tools: agent.tools || [],
      workspace: this.workspaceManager,
      sessionSummary,
      memoryHints,
      budget,
      promptMode,
      isChannelSession,
    };

    let runResponse: RunResponse;

    if (request.stream) {
      runResponse = await this.runStreaming(request.agentId, agentContext);
    } else {
      const result = await runAgent(request.agentId, agentContext);
      addAgentUsage(trace, request.agentId, result.usage
        ? { promptTokens: result.usage.promptTokens, completionTokens: result.usage.completionTokens }
        : undefined);
      addToolTelemetry(trace, result.toolTelemetry);

      const content = result.content;

      if (content.length > 50) {
        storeMemory(
          `Agent ${request.agentId}: ${content.slice(0, 200)}...`,
          'pattern',
          { projectId: request.projectId, sessionId: request.sessionId, importance: 7 },
        );
      }

      await this.sessionManager.addMessage(request.sessionId, {
        role: 'assistant',
        content,
        timestamp: Date.now(),
      });

      runResponse = {
        content,
        messages: [
          ...messages,
          { role: 'assistant', content, timestamp: new Date() },
        ],
        toolCalls: result.toolCalls,
        mediaUrls: result.mediaUrls,
      };
    }

    trace.totalLatencyMs = Date.now() - requestStartedAt;
    flushRequestTrace(trace);
    await this.refreshSessionSummary(request.sessionId);
    return runResponse;
  }

  private async refreshSessionSummary(sessionId: string): Promise<void> {
    const session = await this.sessionManager.getSession(sessionId);
    if (!session) return;
    const previous = await this.sessionManager.getSessionSummary(sessionId);
    const summary = buildRollingSessionSummary(session.messages, previous);
    await this.sessionManager.updateSessionSummary(sessionId, summary);
  }

  private async runStreaming(agentId: string, context: AgentContext): Promise<RunResponse> {
    await ensureAgentRegistered(agentId);
    const stream = runAgentStream(agentId, context);
    return { content: '', stream };
  }

  getAvailableTools() {
    return toolRegistry.getAllSpecs();
  }

  getAvailableAgents() {
    return agentRegistry.list().map((agent) => ({
      id: agent.id,
      name: agent.name,
      role: agent.role,
      description: agent.description,
    }));
  }
}

export * from './types';
export { agentRegistry } from './registry';
export { runAgent } from './runtime';
