import { AgentHandoff, AgentMessage, AgentRoute, OutputSpec } from './types';
import { Context } from '../context-engine';
import { existsSync, readFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import { resolveFoxFangHome } from '../config/defaults';
import { loadConfig } from '../config/index';
import { getProvider, getProviderConfig } from '../providers/index';
import { agentRegistry, hydrateAgentRegistryFromConfig } from './registry';
import { buildRoutingSystemPrompt, buildRoutingUserPrompt } from './routing-prompt';

type RoutingRule = {
  agentId: string;
  taskType: string;
  keywords: string[];
  needsReview?: boolean;
};

type RoutingPolicy = {
  defaultAgent: string;
  rules: RoutingRule[];
};

type ConfigRoutingShape = {
  agentRuntime?: {
    routing?: Partial<RoutingPolicy>;
  };
};

const DEFAULT_ROUTING_POLICY: RoutingPolicy = {
  defaultAgent: 'orchestrator',
  rules: [],
};

function resolveFallbackPrimaryAgent(): string {
  const candidates = agentRegistry
    .list()
    .map((agent) => agent.id)
    .filter((id) => id !== 'orchestrator');
  return candidates[0] || 'orchestrator';
}

function sanitizeRule(value: unknown): RoutingRule | null {
  if (!value || typeof value !== 'object') return null;
  const obj = value as Record<string, unknown>;
  const agentId = obj.agentId;
  const taskType = obj.taskType;
  const keywords = obj.keywords;
  if (
    (typeof agentId !== 'string' || !agentId.trim())
    || typeof taskType !== 'string'
    || !Array.isArray(keywords)
  ) {
    return null;
  }
  const cleanedKeywords = keywords
    .map((item) => String(item).trim().toLowerCase())
    .filter(Boolean);
  if (cleanedKeywords.length === 0) return null;
  return {
    agentId: agentId.trim(),
    taskType: taskType.trim() || 'general',
    keywords: cleanedKeywords,
    needsReview: obj.needsReview === true,
  };
}

function loadRoutingPolicy(fallbackDefaultAgent: string): RoutingPolicy {
  const candidates = [
    join(resolveFoxFangHome(), 'foxfang.json'),
    join(process.cwd(), '.foxfang', 'foxfang.json'),
    join(homedir(), '.foxfang', 'foxfang.json'),
  ];

  for (const configFile of candidates) {
    if (!existsSync(configFile)) continue;
    try {
      const raw = JSON.parse(readFileSync(configFile, 'utf-8')) as ConfigRoutingShape;
      const configured = raw?.agentRuntime?.routing;
      if (!configured || typeof configured !== 'object') continue;

      const parsedRules = Array.isArray(configured.rules)
        ? configured.rules.map(sanitizeRule).filter((rule): rule is RoutingRule => Boolean(rule))
        : [];
      const defaultAgent = configured.defaultAgent;
      const safeDefaultAgent = typeof defaultAgent === 'string' && defaultAgent.trim()
        ? defaultAgent
        : fallbackDefaultAgent;

      return {
        defaultAgent: safeDefaultAgent,
        rules: parsedRules.length > 0 ? parsedRules : DEFAULT_ROUTING_POLICY.rules,
      };
    } catch {
      // Try next candidate
    }
  }
  return {
    ...DEFAULT_ROUTING_POLICY,
    defaultAgent: fallbackDefaultAgent,
  };
}

/**
 * Simple rule-based matching for deterministic config rules only.
 * Returns the matched rule or undefined.
 */
function matchConfigRule(message: string, policy: RoutingPolicy): RoutingRule | undefined {
  if (policy.rules.length === 0) return undefined;
  const normalized = message.toLowerCase();
  let best: { rule: RoutingRule; score: number } | null = null;
  for (const rule of policy.rules) {
    let score = 0;
    for (const keyword of rule.keywords) {
      if (normalized.includes(keyword)) {
        score += keyword.includes(' ') ? 2 : 1;
      }
    }
    if (score > 0 && (!best || score > best.score)) {
      best = { rule, score };
    }
  }
  return best?.rule;
}

function normalizePrimaryAgent(value: unknown): AgentRoute['primaryAgent'] | undefined {
  if (typeof value !== 'string') return undefined;
  const cleaned = value.trim();
  return cleaned || undefined;
}

function normalizeOutputMode(value: unknown): AgentRoute['outputMode'] | undefined {
  if (value === 'short' || value === 'normal' || value === 'deep') {
    return value;
  }
  return undefined;
}

function normalizeTaskType(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const cleaned = value.trim();
  return cleaned ? cleaned : undefined;
}

function extractJsonObject(text: string): Record<string, unknown> | null {
  if (!text.trim()) return null;
  try {
    const parsed = JSON.parse(text) as Record<string, unknown>;
    if (parsed && typeof parsed === 'object') return parsed;
  } catch {
    // Try to extract embedded JSON block below.
  }
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[0]) as Record<string, unknown>;
    if (parsed && typeof parsed === 'object') return parsed;
  } catch {
    return null;
  }
  return null;
}

/**
 * Primary routing path: ask the LLM to classify the route.
 */
async function classifyRouteWithModel(params: {
  message: string;
  policy: RoutingPolicy;
}): Promise<AgentRoute | null> {
  try {
    await hydrateAgentRegistryFromConfig();
    const config = await loadConfig();
    const preferredProviderId = config.defaultProvider;
    let providerId = preferredProviderId;
    let provider = preferredProviderId ? getProvider(preferredProviderId) : undefined;

    if (!provider) {
      for (const fallbackId of ['openai', 'anthropic', 'kimi', 'kimi-coding']) {
        const candidate = getProvider(fallbackId);
        if (candidate) {
          provider = candidate;
          providerId = fallbackId;
          break;
        }
      }
    }

    if (!provider) return null;

    const providerConfig = providerId ? getProviderConfig(providerId) : undefined;
    const model = providerConfig?.smallModel || providerConfig?.defaultModel || config.defaultModel || 'gpt-4o-mini';
    const agents = agentRegistry.list()
      .filter((agent) => agent.id !== 'orchestrator')
      .map((agent) => ({
        id: agent.id,
        role: String(agent.role || ''),
        description: agent.description,
      }));
    if (agents.length === 0) {
      return null;
    }

    const systemPrompt = buildRoutingSystemPrompt(agents.map((a) => a.id));
    const userPrompt = buildRoutingUserPrompt({
      message: params.message,
      defaultAgent: params.policy.defaultAgent,
      agents,
      rules: params.policy.rules.map((rule) => ({ agentId: rule.agentId, taskType: rule.taskType })),
    });

    const response = await provider.chat({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
    });

    const parsed = extractJsonObject(response.content || '');
    if (!parsed) return null;

    const primaryAgent = normalizePrimaryAgent(parsed.primaryAgent);
    const outputMode = normalizeOutputMode(parsed.outputMode);
    const taskType = normalizeTaskType(parsed.taskType);

    if (!primaryAgent) return null;

    return {
      primaryAgent,
      taskType: taskType || 'general',
      needsTools: typeof parsed.needsTools === 'boolean' ? parsed.needsTools : false,
      needsReview: typeof parsed.needsReview === 'boolean' ? parsed.needsReview : false,
      outputMode: outputMode || 'normal',
    };
  } catch {
    return null;
  }
}

/**
 * Offline fallback when no provider is available.
 */
function buildFallbackRoute(policy: RoutingPolicy, matchedRule?: RoutingRule): AgentRoute {
  return {
    primaryAgent: matchedRule?.agentId || policy.defaultAgent,
    taskType: matchedRule?.taskType || 'general',
    needsTools: false,
    needsReview: matchedRule?.needsReview === true,
    outputMode: 'normal',
  };
}

export async function classifyRoute(message: string): Promise<AgentRoute> {
  await hydrateAgentRegistryFromConfig();
  const fallbackDefaultAgent = resolveFallbackPrimaryAgent();
  const policy = loadRoutingPolicy(fallbackDefaultAgent);

  // If an explicit config rule matches, use it deterministically.
  const matchedRule = matchConfigRule(message, policy);
  if (matchedRule) {
    return {
      primaryAgent: matchedRule.agentId,
      taskType: matchedRule.taskType,
      needsTools: false,
      needsReview: matchedRule.needsReview === true,
      outputMode: 'normal',
    };
  }

  // Primary path: LLM routing.
  const modelRoute = await classifyRouteWithModel({ message, policy });
  if (modelRoute) return modelRoute;

  // Offline fallback.
  return buildFallbackRoute(policy);
}

function extractProjectFacts(context?: Context): string[] {
  if (!context?.projectContext) return [];
  const facts: string[] = [];
  facts.push(`Project: ${context.projectContext.name}`);
  if (context.projectContext.description) facts.push(`Project description: ${context.projectContext.description}`);
  if (context.projectContext.brandName) facts.push(`Brand: ${context.projectContext.brandName}`);
  if (context.projectContext.goals?.length) {
    facts.push(...context.projectContext.goals.slice(0, 3).map((goal) => `Goal: ${goal}`));
  }
  return facts.slice(0, 7);
}

function extractBrandVoice(context?: Context): string | undefined {
  const brandMd = context?.projectContext?.brandMd || context?.brandContext?.brandMd;
  if (!brandMd) return undefined;
  const compact = brandMd.replace(/\s+/g, ' ').trim();
  return compact.slice(0, 280);
}

export function buildHandoffPacket(params: {
  message: string;
  context?: Context;
  route: AgentRoute;
}): AgentHandoff {
  const { message, context, route } = params;
  const keyFacts = [
    ...extractProjectFacts(context),
    ...((context?.brandContext?.relevantMemories || []).slice(0, 3)),
  ].slice(0, 7);

  const constraints: string[] = [];
  if (route.outputMode === 'short') constraints.push('Keep output concise.');
  if (route.outputMode === 'deep') constraints.push('Provide deeper reasoning and specificity.');
  if (context?.projectContext?.goals?.length) {
    constraints.push(`Align with project goals: ${context.projectContext.goals.slice(0, 2).join(', ')}`);
  }

  return {
    userIntent: message,
    taskGoal: `Complete the user's request: ${message.slice(0, 200)}`,
    brandVoice: extractBrandVoice(context),
    constraints,
    keyFacts,
    sourceSnippets: [],
    expectedOutput: `A complete response that directly solves the user's request.`,
  };
}

export function buildOutputSpec(_message: string, route: AgentRoute): OutputSpec {
  const lengthMap: Record<AgentRoute['outputMode'], OutputSpec['length']> = {
    short: 'short',
    normal: 'medium',
    deep: 'long',
  };

  return {
    format: 'article',
    length: lengthMap[route.outputMode],
  };
}

export function buildCompactContext(params: {
  recentMessages: AgentMessage[];
  sessionSummary?: string;
  relevantMemories: string[];
  projectFacts: string[];
}) {
  return {
    recentMessages: params.recentMessages.slice(-4),
    sessionSummary: params.sessionSummary ?? '',
    relevantMemories: params.relevantMemories.slice(0, 5),
    projectFacts: params.projectFacts.slice(0, 6),
  };
}
