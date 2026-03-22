/**
 * Agent Orchestrator
 *
 * Thin router + context handoff pipeline:
 * user -> orchestrator -> primary specialist -> optional reviewer -> quality floor.
 */

import {
  AgentContext,
  AgentHandoff,
  AgentMessage,
  AgentRequest,
  AgentResponse,
  OutputSpec,
  ReviewResult,
  RunRequest,
  RunResponse,
} from './types';
import { agentRegistry, ensureAgentRegistered, hydrateAgentRegistryFromConfig } from './registry';
import { parseDirectives, runAgent, runAgentStream } from './runtime';
import { resolveTokenBudget } from './budget';
import { buildCompactContext, buildHandoffPacket, buildOutputSpec, classifyRoute } from './routing';
import { SessionManager } from '../sessions/manager';
import { toolRegistry } from '../tools/index';
import { buildContext, Context } from '../context-engine';
import { storeMemory } from '../memory/database';
import { createWorkspaceManager, WorkspaceManager } from '../workspace/manager';
import { assembleContext } from '../context/assembler';
import { buildRollingSessionSummary, formatSessionSummary } from '../sessions/summary';
import { addAgentUsage, addToolTelemetry, createRequestTrace, flushRequestTrace } from '../observability/request-trace';

function safeTrim(input: string, maxChars = 240): string {
  return input.replace(/\s+/g, ' ').trim().slice(0, maxChars);
}


const DELIVERABLE_OPEN_TAG = '<deliverable>';
const DELIVERABLE_CLOSE_TAG = '</deliverable>';

function normalizeDeliverableOutput(content: string): string {
  const text = (content || '').trim();
  if (!text) return '';

  const tagRegex = /<deliverable>([\s\S]*?)<\/deliverable>/i;
  const tagMatch = text.match(tagRegex);
  if (tagMatch && tagMatch[1]?.trim()) {
    return tagMatch[1].trim();
  }

  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>;
      const deliverable = parsed?.deliverable;
      if (typeof deliverable === 'string' && deliverable.trim()) {
        return deliverable.trim();
      }
    } catch {
      // Ignore malformed JSON and keep raw text as fallback.
    }
  }

  return text;
}

function parseReviewResult(text: string): ReviewResult {
  const fallback: ReviewResult = {
    verdict: 'pass',
    issues: [],
    strengths: [],
    recommendedEdits: [],
  };

  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    if (/revise|sửa|improve|fix/i.test(text)) {
      return {
        verdict: 'revise',
        issues: [safeTrim(text, 280)],
        strengths: [],
        recommendedEdits: [safeTrim(text, 280)],
      };
    }
    return fallback;
  }

  try {
    const parsed = JSON.parse(jsonMatch[0]) as Partial<ReviewResult>;
    return {
      verdict: parsed.verdict === 'revise' ? 'revise' : 'pass',
      issues: Array.isArray(parsed.issues) ? parsed.issues.map((x) => String(x)).slice(0, 6) : [],
      strengths: Array.isArray(parsed.strengths) ? parsed.strengths.map((x) => String(x)).slice(0, 6) : [],
      recommendedEdits: Array.isArray(parsed.recommendedEdits)
        ? parsed.recommendedEdits.map((x) => String(x)).slice(0, 6)
        : [],
    };
  } catch {
    return fallback;
  }
}


function buildReviewPrompt(params: {
  handoff: AgentHandoff;
  outputSpec: OutputSpec;
  draft: string;
}): string {
  return [
    'Review this draft with concise structured critique.',
    `Goal: ${params.handoff.taskGoal}`,
    `Expected output: ${params.handoff.expectedOutput}`,
    `Output format: ${params.outputSpec.format}, length: ${params.outputSpec.length}`,
    '',
    'Return STRICT JSON with this exact shape:',
    '{"verdict":"pass|revise","issues":["..."],"strengths":["..."],"recommendedEdits":["..."]}',
    '',
    'Draft:',
    params.draft,
  ].join('\n');
}

function buildHandoffPrompt(handoff: AgentHandoff, outputSpec: OutputSpec): string {
  const lines: string[] = [];
  lines.push(`Wrap your final answer in ${DELIVERABLE_OPEN_TAG}...${DELIVERABLE_CLOSE_TAG}. No commentary outside the tags.`);
  lines.push(`Intent: ${handoff.userIntent}`);
  lines.push(`Goal: ${handoff.taskGoal}`);
  if (handoff.targetAudience) lines.push(`Audience: ${handoff.targetAudience}`);
  if (handoff.brandVoice) lines.push(`Brand voice: ${handoff.brandVoice}`);
  if (handoff.constraints.length > 0) lines.push(`Constraints: ${handoff.constraints.join(' | ')}`);
  if (handoff.keyFacts.length > 0) lines.push(`Key facts: ${handoff.keyFacts.join(' | ')}`);
  if (handoff.sourceSnippets.length > 0) lines.push(`Source snippets: ${handoff.sourceSnippets.join(' | ')}`);
  lines.push(`Expected output: ${handoff.expectedOutput}`);
  lines.push(`Output spec: format=${outputSpec.format}, length=${outputSpec.length}`);
  return lines.join('\n');
}

function extractRelevantMemories(context: Context): string[] {
  const fromBrand = context.brandContext?.relevantMemories || [];
  const fromRecent = context.recentMemories || [];
  return [...fromBrand, ...fromRecent].filter(Boolean).slice(0, 7);
}

function extractProjectFacts(context: Context): string[] {
  if (!context.projectContext) return [];
  const facts: string[] = [];
  facts.push(`Project: ${context.projectContext.name}`);
  if (context.projectContext.brandName) facts.push(`Brand: ${context.projectContext.brandName}`);
  if (context.projectContext.description) facts.push(`Description: ${context.projectContext.description}`);
  if (context.projectContext.goals.length > 0) {
    facts.push(...context.projectContext.goals.slice(0, 3).map((goal) => `Goal: ${goal}`));
  }
  return facts.slice(0, 6);
}

function buildBrandBrief(context: Context): string | undefined {
  const raw = context.projectContext?.brandMd || context.brandContext?.brandMd;
  if (!raw) return undefined;
  const compact = raw.replace(/\s+/g, ' ').trim();
  return compact.slice(0, 1200);
}

function scoreReviewerCandidate(params: {
  candidate: {
    id: string;
    role: string;
    description: string;
    executionProfile?: {
      modelTier: 'small' | 'medium' | 'large';
      verbosity: 'low' | 'normal' | 'high';
      reasoningDepth: 'light' | 'normal' | 'deep';
    };
  };
  primaryAgent: string;
}): number {
  const { candidate, primaryAgent } = params;
  if (candidate.id === primaryAgent) return -1;
  if (candidate.id === 'orchestrator') return -1;

  const text = `${candidate.id} ${candidate.role} ${candidate.description}`.toLowerCase();
  let score = 0;
  if (/(review|reviewer|analyst|analysis|audit|qa|quality|critic)/i.test(text)) score += 8;
  if (candidate.executionProfile?.verbosity === 'low') score += 2;
  if (candidate.executionProfile?.modelTier === 'small') score += 1;
  if (candidate.executionProfile?.reasoningDepth === 'normal') score += 1;
  return score;
}

function sanitizeSegment(value: string, maxLength = 60): string {
  return value
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .slice(0, maxLength);
}

function stableHash(value: string): string {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }
  return (hash >>> 0).toString(36);
}

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

  private buildSubAgentSessionId(parentSessionId: string, agentId: string): string {
    return `${parentSessionId}__agent__${sanitizeSegment(agentId, 40)}`;
  }

  private async resolveReviewerAgentId(primaryAgent: string): Promise<string | undefined> {
    await hydrateAgentRegistryFromConfig();
    const candidates = agentRegistry.list().filter((agent) => (
      agent.id !== 'orchestrator' && agent.id !== primaryAgent
    ));
    if (candidates.length === 0) return undefined;

    const ranked = candidates
      .map((candidate) => ({
        id: candidate.id,
        score: scoreReviewerCandidate({
          candidate: {
            id: candidate.id,
            role: String(candidate.role || ''),
            description: candidate.description || '',
            executionProfile: candidate.executionProfile,
          },
          primaryAgent,
        }),
      }))
      .sort((a, b) => b.score - a.score);

    return ranked[0]?.id || candidates[0]?.id;
  }

  private resolveScopedWorkspace(params: {
    agentId: string;
    sessionSeed: string;
    projectId?: string;
    userId?: string;
  }): WorkspaceManager | undefined {
    if (!this.workspaceManager) return undefined;
    const workspaceInfo = this.workspaceManager.getWorkspaceInfo?.();
    if (!workspaceInfo?.homeDir) return this.workspaceManager;

    const seedHash = stableHash(params.sessionSeed).slice(0, 10);
    const scopedProjectId = params.projectId
      ? `${sanitizeSegment(params.projectId, 30)}-${seedHash}`
      : `binding-${seedHash}`;

    return createWorkspaceManager(
      params.userId || 'default_user',
      workspaceInfo.homeDir,
      scopedProjectId,
      params.agentId,
    );
  }

  async process(request: AgentRequest): Promise<AgentResponse> {
    const result = await this.run({
      sessionId: request.sessionId || `session-${Date.now()}`,
      agentId: 'orchestrator',
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
        role: m.role === 'system' ? 'assistant' : m.role,
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

    const context = await buildContext({
      projectId: request.projectId,
      sessionId: request.sessionId,
      query: enhancedMessage || messages[messages.length - 1]?.content,
    });

    const routeWithOrchestrator = request.agentId === 'orchestrator';
    let runResponse: RunResponse;
    if (routeWithOrchestrator) {
      runResponse = await this.runRouted(request, messages, context, trace);
    } else {
      runResponse = await this.runDirect(request, messages, context, trace);
    }

    trace.totalLatencyMs = Date.now() - requestStartedAt;
    flushRequestTrace(trace);
    await this.refreshSessionSummary(request.sessionId);
    return runResponse;
  }

  private async runDirect(
    request: RunRequest,
    messages: AgentMessage[],
    context: Context,
    trace: ReturnType<typeof createRequestTrace>,
  ): Promise<RunResponse> {
    const directAgent = await ensureAgentRegistered(request.agentId);
    const isSubAgentSession = request.sessionId.includes('__agent__');
    const userId = request.userId || 'default_user';
    const agentContext: AgentContext = {
      sessionId: request.sessionId,
      projectId: request.projectId,
      userId,
      messages,
      tools: directAgent.tools || [],
      brandContext: buildBrandBrief(context),
      relevantMemories: extractRelevantMemories(context).slice(0, 5),
      workspace: this.resolveScopedWorkspace({
        agentId: request.agentId,
        sessionSeed: request.sessionId,
        projectId: request.projectId,
      }),
      promptMode: isSubAgentSession ? 'minimal' : 'full',
      budget: resolveTokenBudget({ agentId: request.agentId, mode: 'balanced' }),
    };

    if (request.stream) {
      return this.runStreaming(request.agentId, agentContext);
    }

    const result = await runAgent(request.agentId, agentContext);
    addAgentUsage(trace, request.agentId, result.usage
      ? { promptTokens: result.usage.promptTokens, completionTokens: result.usage.completionTokens }
      : undefined);
    addToolTelemetry(trace, result.toolTelemetry);

    const currentDelegationDepth = request.delegationDepth ?? 0;
    const maxDelegations = Math.max(0, agentContext.budget?.maxDelegations ?? 1);
    const directives = parseDirectives(result.content);
    if (directives.length > 0 && currentDelegationDepth < maxDelegations) {
      const directive = directives[0];
      if (directive.type === 'MESSAGE_AGENT' && directive.target) {
        trace.numberOfDelegations += 1;
        return this.run({
          ...request,
          delegationDepth: currentDelegationDepth + 1,
          sessionId: this.buildSubAgentSessionId(request.sessionId, directive.target),
          agentId: directive.target,
          message: undefined,
          messages: [
            ...messages,
            {
              role: 'assistant',
              content: `Routing to ${directive.target}: ${directive.payload}`,
              timestamp: new Date(),
            },
          ],
          stream: false,
        });
      }
    }

    let directContent = result.content;
    if (directives.length > 0 && currentDelegationDepth >= maxDelegations) {
      const stripped = directContent.replace(/MESSAGE_AGENT:\s*[^\n]+/gi, '').trim();
      directContent = stripped || 'Delegation limit reached. Please clarify the exact next step to continue.';
    }
    const yieldDirective = directives.find((directive) => directive.type === 'YIELD');
    if ((!directContent || !directContent.trim()) && yieldDirective?.payload) {
      directContent = yieldDirective.payload;
    }

    if (directContent.length > 50) {
      storeMemory(
        `Agent ${request.agentId}: ${directContent.slice(0, 200)}...`,
        'pattern',
        { projectId: request.projectId, importance: 7 },
      );
    }

    await this.sessionManager.addMessage(request.sessionId, {
      role: 'assistant',
      content: directContent,
      timestamp: Date.now(),
    });

    return {
      content: directContent,
      messages: [
        ...messages,
        { role: 'assistant', content: directContent, timestamp: new Date() },
      ],
      toolCalls: result.toolCalls,
    };
  }

  private async runRouted(
    request: RunRequest,
    messages: AgentMessage[],
    context: Context,
    trace: ReturnType<typeof createRequestTrace>,
  ): Promise<RunResponse> {
    const userMessage = request.message || messages[messages.length - 1]?.content || '';
    const userId = request.userId || 'default_user';
    const route = await classifyRoute(userMessage);
    const summaryObj = await this.sessionManager.getSessionSummary(request.sessionId);
    const summaryText = formatSessionSummary(summaryObj);
    const compactContext = buildCompactContext({
      recentMessages: messages,
      sessionSummary: summaryText,
      relevantMemories: extractRelevantMemories(context),
      projectFacts: extractProjectFacts(context),
    });
    const handoff = buildHandoffPacket({
      message: userMessage,
      context,
      route,
    });
    const outputSpec = buildOutputSpec(userMessage, route);
    const assembled = assembleContext({
      agentId: route.primaryAgent,
      sessionSummary: compactContext.sessionSummary,
      recentMessages: compactContext.recentMessages.map((m) => `${m.role}: ${safeTrim(m.content, 220)}`),
      handoff,
      snippets: handoff.sourceSnippets,
      memories: compactContext.relevantMemories,
      outputSpec,
    });

    const specialistMessages: AgentMessage[] = [
      ...compactContext.recentMessages,
      {
        role: 'user',
        content: buildHandoffPrompt(handoff, outputSpec),
        timestamp: new Date(),
      },
    ];
    const primaryAgent = await ensureAgentRegistered(route.primaryAgent);
    const specialistTools = route.needsTools ? (primaryAgent.tools || []) : [];
    const specialistContext: AgentContext = {
      sessionId: this.buildSubAgentSessionId(request.sessionId, route.primaryAgent),
      projectId: request.projectId,
      userId,
      messages: specialistMessages,
      tools: specialistTools,
      brandContext: buildBrandBrief(context),
      relevantMemories: assembled.memories,
      sessionSummary: summaryObj,
      handoff,
      outputSpec,
      sourceSnippets: assembled.snippets,
      systemAddendum: assembled.systemAddendum,
      reasoningMode: route.outputMode === 'deep' ? 'deep' : route.outputMode === 'short' ? 'fast' : 'balanced',
      promptMode: 'full',
      budget: resolveTokenBudget({
        agentId: route.primaryAgent,
        mode: route.outputMode === 'deep' ? 'deep' : route.outputMode === 'short' ? 'fast' : 'balanced',
      }),
      workspace: this.resolveScopedWorkspace({
        agentId: route.primaryAgent,
        sessionSeed: request.sessionId,
        projectId: request.projectId,
      }),
    };

    if (request.stream) {
      return this.runStreaming(route.primaryAgent, specialistContext);
    }

    const touchedSubSessions = new Set<string>([specialistContext.sessionId]);
    await this.sessionManager.addMessage(specialistContext.sessionId, {
      role: 'user',
      content: specialistMessages[specialistMessages.length - 1]?.content || '',
      timestamp: Date.now(),
    });

    let primaryResult = await runAgent(route.primaryAgent, specialistContext);
    addAgentUsage(trace, route.primaryAgent, primaryResult.usage
      ? { promptTokens: primaryResult.usage.promptTokens, completionTokens: primaryResult.usage.completionTokens }
      : undefined);
    addToolTelemetry(trace, primaryResult.toolTelemetry);

    let finalContent = normalizeDeliverableOutput(primaryResult.content);
    let reviewPasses = 0;

    const reviewerAgentId = route.needsReview
      ? await this.resolveReviewerAgentId(route.primaryAgent)
      : undefined;
    const shouldRunReviewer = Boolean(reviewerAgentId && reviewerAgentId !== route.primaryAgent);
    if (shouldRunReviewer && reviewerAgentId) {
      reviewPasses += 1;
      const reviewPrompt = buildReviewPrompt({
        handoff,
        outputSpec,
        draft: finalContent,
      });
      const reviewContext: AgentContext = {
        sessionId: this.buildSubAgentSessionId(request.sessionId, reviewerAgentId),
        projectId: request.projectId,
        userId,
        messages: [{ role: 'user', content: reviewPrompt, timestamp: new Date() }],
        tools: (await ensureAgentRegistered(reviewerAgentId)).tools || [],
        handoff,
        outputSpec,
        promptMode: 'minimal',
        budget: resolveTokenBudget({ agentId: reviewerAgentId, mode: 'balanced' }),
        workspace: this.resolveScopedWorkspace({
          agentId: reviewerAgentId,
          sessionSeed: request.sessionId,
          projectId: request.projectId,
        }),
      };
      touchedSubSessions.add(reviewContext.sessionId);
      await this.sessionManager.addMessage(reviewContext.sessionId, {
        role: 'user',
        content: reviewPrompt,
        timestamp: Date.now(),
      });
      const reviewRun = await runAgent(reviewerAgentId, reviewContext);
      addAgentUsage(trace, reviewerAgentId, reviewRun.usage
        ? { promptTokens: reviewRun.usage.promptTokens, completionTokens: reviewRun.usage.completionTokens }
        : undefined);
      addToolTelemetry(trace, reviewRun.toolTelemetry);

      const review = parseReviewResult(reviewRun.content);
      await this.sessionManager.addMessage(reviewContext.sessionId, {
        role: 'assistant',
        content: reviewRun.content,
        timestamp: Date.now(),
      });
      if (review.verdict === 'revise' && review.recommendedEdits.length > 0) {
        const rewriteMessage = [
          `Return output only inside ${DELIVERABLE_OPEN_TAG}...${DELIVERABLE_CLOSE_TAG}.`,
          'Revise this draft based on critique while keeping the same intent.',
          `Edits: ${review.recommendedEdits.join(' | ')}`,
          '',
          'Draft:',
          finalContent,
        ].join('\n');

        const rewriteContext: AgentContext = {
          ...specialistContext,
          messages: [{ role: 'user', content: rewriteMessage, timestamp: new Date() }],
          budget: resolveTokenBudget({ agentId: route.primaryAgent, mode: 'balanced' }),
        };
        await this.sessionManager.addMessage(specialistContext.sessionId, {
          role: 'user',
          content: rewriteMessage,
          timestamp: Date.now(),
        });
        const rewriteRun = await runAgent(route.primaryAgent, rewriteContext);
        addAgentUsage(trace, route.primaryAgent, rewriteRun.usage
          ? { promptTokens: rewriteRun.usage.promptTokens, completionTokens: rewriteRun.usage.completionTokens }
          : undefined);
        addToolTelemetry(trace, rewriteRun.toolTelemetry);
        finalContent = normalizeDeliverableOutput(rewriteRun.content);
      }
    }
    trace.numberOfReviewPasses = reviewPasses;

    await this.sessionManager.addMessage(specialistContext.sessionId, {
      role: 'assistant',
      content: finalContent,
      timestamp: Date.now(),
    });

    if (finalContent.length > 50) {
      storeMemory(
        `Agent ${route.primaryAgent}: ${finalContent.slice(0, 200)}...`,
        'pattern',
        { projectId: request.projectId, importance: 7 },
      );
    }

    await this.sessionManager.addMessage(request.sessionId, {
      role: 'assistant',
      content: finalContent,
      timestamp: Date.now(),
    });

    await Promise.all(Array.from(touchedSubSessions).map((sessionId) => this.refreshSessionSummary(sessionId)));

    return {
      content: finalContent,
      messages: [
        ...messages,
        { role: 'assistant', content: finalContent, timestamp: new Date() },
      ],
      toolCalls: primaryResult.toolCalls,
    };
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

    return {
      content: '',
      stream,
    };
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
