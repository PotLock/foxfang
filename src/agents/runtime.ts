/**
 * Agent Runtime
 * 
 * Executes agent tasks with proper context and tool access.
 */

import {
  Agent,
  AgentContext,
  AgentRunResult,
  CompactToolResult,
  PromptMode,
  ReasoningMode,
  ToolCall,
  ToolResult,
  WorkspaceManagerLike,
} from './types';
import { ensureAgentRegistered } from './registry';
import { getProvider, getProviderConfig } from '../providers/index';
import { toolRegistry } from '../tools/index';
import { ChatMessage } from '../providers/traits';
import { formatSkillsForPrompt, loadAvailableSkills } from '../skill-system';
import { cacheToolResult } from '../tools/tool-result-cache';
import { resolveTokenBudget, trimMessagesToBudget } from './budget';
import { HEARTBEAT_ACK_TOKEN, REPLY_TO_CURRENT_TAG, SILENT_REPLY_TOKEN } from './governance';

let defaultProviderId: string | undefined;

export function setDefaultProvider(providerId: string): void {
  defaultProviderId = providerId;
}

const isDebug = process.env.DEBUG === '1' || process.env.FOXFANG_DEBUG === '1' || process.env.LOG_LEVEL === 'debug';
const debugLog = (...args: unknown[]) => {
  if (isDebug) console.log(...args);
};
const debugWarn = (...args: unknown[]) => {
  if (isDebug) console.warn(...args);
};

/**
 * Tool summaries for system prompt
 */
const TOOL_SUMMARIES: Record<string, string> = {
  // Research tools
  web_search: 'Search the web using free sources (SearX/Bing). Use when user asks about current events, facts, or topics.',
  brave_search: 'High-quality web search via Brave API (requires key). Use when user asks about current events, facts, or topics.',
  firecrawl_search: 'AI-powered search with content extraction (requires key). Use when user asks about current events, facts, or topics.',
  firecrawl_scrape: 'Advanced website scraping with structured data (requires key). Use when user shares a website URL.',
  fetch_tweet: 'Fetch tweet content from X/Twitter by URL. CRITICAL: ALWAYS use this when user shares x.com or twitter.com URLs.',
  fetch_user_tweets: 'Get recent tweets from a user timeline. Use when user asks about a specific Twitter user.',
  fetch_url: 'Fetch and extract content from any URL. CRITICAL: ALWAYS use this when user shares any website URL.',
  
  // Memory tools
  memory_store: 'Save information to long-term memory for later recall',
  memory_recall: 'Retrieve previously stored memories',
  memory_search: 'Search MEMORY.md and memory/*.md and return cited snippets',
  memory_get: 'Read a specific memory file/range with source line references',
  
  // Content tools
  generate_content: 'Create marketing content in various formats',
  optimize_content: 'Improve and optimize existing content',
  content_score: 'Score content quality and get suggestions',
  
  // Channel tools
  send_message: 'Send messages via Telegram, Discord, Slack, Signal',
  check_messages: 'Check for incoming messages from channels',
  
  // Brand/Project tools
  create_brand: 'Create a new brand with guidelines and voice',
  list_brands: 'List all available brands',
  get_brand: 'Get details of a specific brand',
  create_project: 'Create a new project under a brand',
  list_projects: 'List all projects',
  get_project: 'Get project details',
  
  // Task tools
  create_task: 'Create a task for tracking work',
  list_tasks: 'List tasks with filters',
  update_task_status: 'Update task status (todo/in_progress/done)',
  
  // System tools
  bash: 'Execute shell commands with safety approvals, confirm gating for risky commands, and yield windows',
  bash_list: 'List running background processes',
  bash_poll: 'Check status of background processes',
  bash_log: 'Get logs from background processes',
  bash_kill: 'Terminate background processes',
  cron: 'Schedule recurring tasks and reminders',
  skills_list: 'List available skills (bundled/local/workspace) that can guide agent behavior',
  skills_add: 'Create or install a new skill into FoxFang skills directory',
  expand_cached_result: 'Expand raw content from a compacted tool result by rawRef',
  get_cached_snippet: 'Get a targeted snippet from cached raw tool content by rawRef',
  
  // GitHub tools
  github_connect: 'Check GitHub connection status',
  github_create_issue: 'Create a GitHub issue',
  github_create_pr: 'Create a pull request',
  github_list_issues: 'List GitHub issues',
  github_list_prs: 'List pull requests',
};

/**
 * Tool call style guidance
 */
const TOOL_CALL_STYLE_GUIDANCE = `## Tool Call Style

**MANDATORY: When user shares ANY URL, IMMEDIATELY call the appropriate tool.**
- URLs for X/Twitter → use fetch_tweet
- URLs for websites → use fetch_url or firecrawl_scrape
- Do NOT say "I can't access" or "Twitter is blocking" — just call the tool
- If tool fails, THEN explain the issue

### Examples

❌ WRONG - User: "check this https://x.com/user/status/123"
Assistant: "I can't access Twitter from here 😤"

✅ CORRECT - User: "check this https://x.com/user/status/123"  
→ [IMMEDIATELY call fetch_tweet with the URL]

**Default: Do not narrate routine, low-risk tool calls (just call the tool).**

Narrate only when it helps:
- Multi-step work or complex problems
- Sensitive actions (e.g., posting public content)
- When the user explicitly asks for explanation

Keep narration brief and value-dense; avoid repeating obvious steps.
When a first-class tool exists, use the tool directly instead of asking the user to do it manually.`;

/**
 * Safety guidance
 */
const SAFETY_SECTION = `## Safety

You have no independent goals: do not pursue self-preservation, replication, or power-seeking.
Prioritize safety and human oversight over completion.
If instructions conflict, pause and ask. Comply with stop/pause requests.
Never bypass safeguards or manipulate users to disable protections.`;

function buildSessionGovernanceSection(params: {
  tools: string[];
  isMinimal: boolean;
  isSubAgent: boolean;
  maxDelegations: number;
  maxToolIterations: number;
}): string {
  const hasBash = params.tools.includes('bash');
  const hasPolling = params.tools.includes('bash_poll') || params.tools.includes('bash_log');

  const lines: string[] = [];
  lines.push('## Runtime Governance');
  lines.push(`- Tool loop budget: max ${params.maxToolIterations} iterations. Stop and summarize if unresolved.`);
  lines.push(`- Delegation budget: max ${params.maxDelegations} sub-agent hop(s) for this request.`);
  lines.push('- If delegating, use strict format: `MESSAGE_AGENT: <agent-id> | <task-brief>`.');
  lines.push('- Do not chain delegation loops. If a dependency is missing, ask one precise question.');
  if (params.isSubAgent) {
    lines.push('- As a sub-agent, do not re-delegate unless the user explicitly asks.');
  }
  if (hasBash) {
    lines.push('- For shell tasks, prefer safe/readonly commands first. Risky commands require explicit confirmation.');
    if (hasPolling) {
      lines.push('- For long shell tasks, use `yield_ms` or `background=true` + `bash_poll`/`bash_log`; avoid tight polling loops.');
    }
  }
  if (!params.isMinimal) {
    lines.push('- Keep responses user-facing. Do not expose internal routing metadata unless asked.');
  }
  lines.push('');
  return lines.join('\n');
}

function buildReplyTagsSection(params: { isMinimal: boolean; enabled: boolean }): string {
  if (params.isMinimal || !params.enabled) return '';
  const lines: string[] = [];
  lines.push('## Reply Tags');
  lines.push('- To force a direct reply target, start message with one optional tag:');
  lines.push(`- ${REPLY_TO_CURRENT_TAG} → reply to current message.`);
  lines.push('- `[[reply_to:<message-id>]]` → reply to a specific message id.');
  lines.push('- Tags are control metadata and will be stripped before delivery.');
  lines.push('');
  return lines.join('\n');
}

function buildHeartbeatAndSilentSection(params: { isMinimal: boolean; enabled: boolean }): string {
  if (params.isMinimal || !params.enabled) return '';
  const lines: string[] = [];
  lines.push('## Heartbeat & Silent Reply');
  lines.push(`- If message is a heartbeat poll and no action is needed, reply exactly: ${HEARTBEAT_ACK_TOKEN}`);
  lines.push(`- If you intentionally want no outbound user message, reply exactly: ${SILENT_REPLY_TOKEN}`);
  lines.push('- Never append these control tokens to normal user-facing content.');
  lines.push('');
  return lines.join('\n');
}

const TOOL_COMPRESSION_THRESHOLD_CHARS = 1500;
const TOOL_SUMMARY_MAX_CHARS = 800;

function normalizeReasoningMode(mode?: ReasoningMode): ReasoningMode {
  if (mode === 'fast' || mode === 'deep' || mode === 'balanced') {
    return mode;
  }
  return 'balanced';
}

function resolveModelFromExecutionProfile(params: {
  providerId: string;
  defaultModel: string;
  tier?: 'small' | 'medium' | 'large';
}): string {
  const tier = params.tier || 'medium';
  if (tier === 'medium' || tier === 'large') {
    return params.defaultModel;
  }

  const providerId = params.providerId.toLowerCase();
  const model = params.defaultModel;
  if (providerId === 'openai' && /gpt-4o(?!-mini)/i.test(model)) return 'gpt-4o-mini';
  if (providerId === 'anthropic' && /sonnet/i.test(model)) return 'claude-3-haiku-latest';
  if (providerId.startsWith('kimi') && /32k|128k/i.test(model)) return 'moonshot-v1-8k';
  return model;
}

function safeJson(value: unknown): string {
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function compactText(text: string, maxChars: number): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= maxChars) return clean;
  return `${clean.slice(0, maxChars)}...`;
}

function extractTitle(data: unknown): string | undefined {
  if (!data || typeof data !== 'object') return undefined;
  const obj = data as Record<string, unknown>;
  if (typeof obj.title === 'string') return compactText(obj.title, 160);
  if (obj.metadata && typeof obj.metadata === 'object') {
    const metaTitle = (obj.metadata as Record<string, unknown>).title;
    if (typeof metaTitle === 'string') return compactText(metaTitle, 160);
  }
  return undefined;
}

function extractKeyPoints(data: unknown): string[] {
  if (typeof data === 'string') {
    return compactText(data, 320)
      .split(/[.!?]\s+/)
      .map((line) => line.trim())
      .filter(Boolean)
      .slice(0, 4);
  }
  if (!data || typeof data !== 'object') return [];
  const obj = data as Record<string, unknown>;
  const points: string[] = [];
  for (const [key, value] of Object.entries(obj)) {
    if (value == null) continue;
    if (typeof value === 'string' && value.trim()) {
      points.push(`${key}: ${compactText(value, 160)}`);
    } else if (typeof value === 'number' || typeof value === 'boolean') {
      points.push(`${key}: ${String(value)}`);
    } else if (Array.isArray(value)) {
      points.push(`${key}: ${value.length} item(s)`);
    }
    if (points.length >= 5) break;
  }
  return points;
}

function compactToolPayload(toolName: string, rawData: unknown): {
  compact: CompactToolResult;
  rawSize: number;
  compactSize: number;
} {
  const rawText = safeJson(rawData);
  const rawSize = rawText.length;
  const title = extractTitle(rawData);
  const keyPoints = extractKeyPoints(rawData);
  let rawRef: string | undefined;

  const summary = rawSize > TOOL_COMPRESSION_THRESHOLD_CHARS
    ? compactText(rawText, TOOL_SUMMARY_MAX_CHARS)
    : compactText(rawText, TOOL_SUMMARY_MAX_CHARS);

  if (rawSize > TOOL_COMPRESSION_THRESHOLD_CHARS) {
    rawRef = cacheToolResult(toolName, rawData).rawRef;
  }

  const compact: CompactToolResult = {
    source: toolName,
    title,
    summary,
    keyPoints: keyPoints.length > 0 ? keyPoints : ['Tool returned structured data.'],
    relevanceToTask: rawSize > TOOL_COMPRESSION_THRESHOLD_CHARS
      ? 'Long result compacted to save context; use rawRef for expansion if needed.'
      : 'Direct tool result.',
    ...(rawRef ? { rawRef } : {}),
  };

  const compactSize = safeJson(compact).length;
  return { compact, rawSize, compactSize };
}

/**
 * Run an agent with the given context using Agent Loop pattern
 * 
 * Agent Loop:
 * 1. Call LLM with current context
 * 2. If tool calls → execute tools → add results to context → go to step 1
 * 3. Return final response when no more tool calls
 */
export async function runAgent(
  agentId: string,
  context: AgentContext
): Promise<AgentRunResult> {
  const agent = await ensureAgentRegistered(agentId);

  // Build system prompt with context
  const systemPrompt = buildSystemPrompt(agent, context);

  // Get available tools for this agent
  const tools = agent.tools
    .map(name => toolRegistry.get(name))
    .filter(Boolean)
    .map(tool => ({
      name: tool!.name,
      description: tool!.description,
      parameters: tool!.parameters,
    }));

  // Debug: log tools being sent
  debugLog(`[AgentRuntime] Agent ${agentId} has ${tools.length} tools:`, tools.map(t => t.name).join(', '));

  const reasoningMode = normalizeReasoningMode(context.reasoningMode);
  const budget = context.budget || resolveTokenBudget({ agentId, mode: reasoningMode });

  // Initialize messages array
  const initialMessages: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
    ...context.messages
      .filter(m => m.role !== 'tool')
      .map(m => ({
        role: m.role === 'user' ? 'user' as const : 'assistant' as const,
        content: m.content,
      })),
  ];
  const trimmedInput = trimMessagesToBudget(initialMessages, budget.requestMaxInputTokens);
  let messages: ChatMessage[] = trimmedInput.messages;

  // Get provider
  const providerId = agent.provider || defaultProviderId;
  let provider = providerId ? getProvider(providerId) : undefined;
  if (!provider) {
    provider = getProvider('openai') || getProvider('anthropic') || getProvider('kimi') || getProvider('kimi-coding');
  }
  if (!provider) {
    throw new Error('No provider available. Please configure an AI provider first.');
  }

  // Get model
  const actualProviderId = agent.provider || defaultProviderId || 'openai';
  const providerConfig = getProviderConfig(actualProviderId);
  const defaultModel = providerConfig?.defaultModel || 'gpt-4o';
  const model = agent.model
    || resolveModelFromExecutionProfile({
      providerId: actualProviderId,
      defaultModel,
      tier: agent.executionProfile?.modelTier,
    });

  // Track all tool calls made during the loop
  const allToolCalls: ToolCall[] = [];
  let iteration = 0;
  const maxIterations = budget.maxToolIterations; // Prevent infinite loops
  let toolErrorStreak = 0;
  const toolTelemetry: Array<{ tool: string; rawSize: number; compactSize: number }> = [];

  // AGENT LOOP
  while (iteration < maxIterations) {
    iteration++;
    debugLog(`[AgentRuntime] Agent loop iteration ${iteration}`);

    // Call LLM
    let response;
    try {
      response = await provider.chat({
        model,
        messages,
        tools: tools.length > 0 ? tools : undefined,
      });
    } catch (error) {
      console.error('Provider chat error:', error);
      throw new Error(`Failed to get response from ${provider.name}: ${error instanceof Error ? error.message : String(error)}`);
    }

    // Debug: log response
    debugLog(`[AgentRuntime] Response received, content length: ${response.content?.length || 0}, toolCalls: ${response.toolCalls?.length || 0}`);

    // If no tool calls, return the response
    if (!response.toolCalls || response.toolCalls.length === 0) {
      debugLog(`[AgentRuntime] No tool calls, returning final response`);
      return {
        content: response.content,
        toolCalls: allToolCalls.length > 0 ? allToolCalls : undefined,
        usage: response.usage,
        toolTelemetry: toolTelemetry.length > 0 ? toolTelemetry : undefined,
      };
    }

    // Handle tool calls
    debugLog(`[AgentRuntime] Tool calls:`, response.toolCalls.map(tc => tc.name).join(', '));

    // Convert provider tool calls to our format with IDs
    const toolCallsWithIds: ToolCall[] = response.toolCalls.map((tc, idx) => ({
      id: `call_${Date.now()}_${idx}_${iteration}`,
      name: tc.name,
      arguments: tc.arguments,
    }));
    allToolCalls.push(...toolCallsWithIds);

    // Execute tool calls
    const results = await executeToolCalls(toolCallsWithIds);
    
    // Debug: log tool results
    debugLog(`[AgentRuntime] Tool execution results:`, results.map(r => ({
      toolCallId: r.toolCallId,
      hasData: !!r.data,
      hasOutput: !!r.output,
      hasError: !!r.error,
    })));

    const allErrors = results.length > 0 && results.every(r => r.error);
    if (allErrors) {
      toolErrorStreak += 1;
    } else {
      toolErrorStreak = 0;
    }

    if (allErrors && toolErrorStreak >= 2) {
      const errorSummary = results.map(r => {
        const toolName = toolCallsWithIds.find(tc => tc.id === r.toolCallId)?.name;
        return `${toolName}: ${r.error}`;
      }).join('\n');
      return {
        content: `Tool execution failed repeatedly:\n${errorSummary}`,
        toolCalls: allToolCalls,
        usage: response.usage,
        toolTelemetry: toolTelemetry.length > 0 ? toolTelemetry : undefined,
      };
    }

    // Build tool results
    const toolResultsForModel = results.map(r => {
      const toolName = toolCallsWithIds.find(tc => tc.id === r.toolCallId)?.name;
      if (r.error) {
        return `${toolName}: Error: ${r.error}`;
      }
      if (toolName && typeof r.rawSize === 'number' && typeof r.compactSize === 'number') {
        toolTelemetry.push({
          tool: toolName,
          rawSize: r.rawSize,
          compactSize: r.compactSize,
        });
      }
      const data = r.compact || r.data || r.output;
      return `${toolName}: ${typeof data === 'object' ? JSON.stringify(data) : data}`;
    }).join('\n');

    // Add assistant message and tool results to context
    const assistantContent = response.content || `I'll use the ${toolCallsWithIds.map(tc => tc.name).join(', ')} tool to help you.`;
    messages = [
      ...messages,
      { role: 'assistant', content: assistantContent },
      { role: 'user', content: `[Tool Results]\n${toolResultsForModel}` },
    ];
    messages = trimMessagesToBudget(messages, budget.requestMaxInputTokens).messages;

    // Continue loop - call LLM again with updated context
  }

  // Max iterations reached
  debugWarn(`[AgentRuntime] Max iterations (${maxIterations}) reached`);
  return {
    content: messages[messages.length - 1]?.content || 'Max iterations reached',
    toolCalls: allToolCalls,
    toolTelemetry: toolTelemetry.length > 0 ? toolTelemetry : undefined,
  };
}

/**
 * Run agent with streaming response using Agent Loop pattern
 * 
 * Agent Loop:
 * 1. Stream LLM response
 * 2. If tool calls → execute tools → add results to context → go to step 1
 * 3. Yield done when no more tool calls
 */
export async function* runAgentStream(
  agentId: string,
  context: AgentContext
): AsyncGenerator<{ type: 'text' | 'tool_call' | 'tool_result' | 'done'; content?: string; tool?: string; args?: any; result?: any }> {
  const agent = await ensureAgentRegistered(agentId);

  // Build system prompt with context
  const systemPrompt = buildSystemPrompt(agent, context);

  // Get available tools for this agent
  const tools = agent.tools
    .map(name => toolRegistry.get(name))
    .filter(Boolean)
    .map(tool => ({
      name: tool!.name,
      description: tool!.description,
      parameters: tool!.parameters,
    }));

  const reasoningMode = normalizeReasoningMode(context.reasoningMode);
  const budget = context.budget || resolveTokenBudget({ agentId, mode: reasoningMode });

  // Initialize messages array
  const initialMessages: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
    ...context.messages
      .filter(m => m.role !== 'tool')
      .map(m => ({
        role: m.role === 'user' ? 'user' as const : 'assistant' as const,
        content: m.content,
      })),
  ];
  const trimmedInput = trimMessagesToBudget(initialMessages, budget.requestMaxInputTokens);
  let messages: ChatMessage[] = trimmedInput.messages;

  // Get provider
  const providerId = agent.provider || defaultProviderId;
  let provider = providerId ? getProvider(providerId) : undefined;
  if (!provider) {
    provider = getProvider('openai') || getProvider('anthropic') || getProvider('kimi') || getProvider('kimi-coding');
  }
  if (!provider) {
    throw new Error('No provider available');
  }

  const actualProviderId = agent.provider || defaultProviderId || 'openai';
  const providerConfig = getProviderConfig(actualProviderId);
  const defaultModel = providerConfig?.defaultModel || 'gpt-4o';
  const model = agent.model
    || resolveModelFromExecutionProfile({
      providerId: actualProviderId,
      defaultModel,
      tier: agent.executionProfile?.modelTier,
    });

  // Track iterations to prevent infinite loops
  let iteration = 0;
  const maxIterations = budget.maxToolIterations;
  let toolErrorStreak = 0;

  // AGENT LOOP
  while (iteration < maxIterations) {
    iteration++;
    debugLog(`[AgentRuntime] Stream loop iteration ${iteration}`);

    // Collect data for this iteration
    const pendingToolCalls: ToolCall[] = [];
    let fullContent = '';

    try {
      // Stream response from LLM
      const stream = provider.chatStream({
        model,
        messages,
        tools: tools.length > 0 ? tools : undefined,
      });

      for await (const chunk of stream) {
        if (chunk.type === 'content') {
          fullContent += chunk.content || '';
          yield { type: 'text', content: chunk.content || '' };
        } else if (chunk.type === 'tool_call') {
          const toolCall: ToolCall = {
            id: `call_${Date.now()}_${pendingToolCalls.length}_${iteration}`,
            name: chunk.tool || '',
            arguments: chunk.args,
          };
          pendingToolCalls.push(toolCall);
          yield { type: 'tool_call', tool: chunk.tool, args: chunk.args };
        }
      }

      // If no tool calls in this iteration, we're done
      if (pendingToolCalls.length === 0) {
        debugLog(`[AgentRuntime] No tool calls in iteration ${iteration}, streaming complete`);
        yield { type: 'done' };
        return;
      }

      // Execute pending tool calls
      debugLog(`[AgentRuntime] Executing ${pendingToolCalls.length} tool calls`);
      const results = await executeToolCalls(pendingToolCalls);

      const allErrors = results.length > 0 && results.every(r => r.error);
      if (allErrors) {
        toolErrorStreak += 1;
      } else {
        toolErrorStreak = 0;
      }

      if (allErrors && toolErrorStreak >= 2) {
        const errorSummary = results.map(r => {
          const toolName = pendingToolCalls.find(tc => tc.id === r.toolCallId)?.name;
          return `${toolName}: ${r.error}`;
        }).join('\n');
        yield { type: 'text', content: `\nTool execution failed repeatedly:\n${errorSummary}\n` };
        yield { type: 'done' };
        return;
      }
      
      // Yield tool results
      for (const result of results) {
        yield { 
          type: 'tool_result', 
          tool: pendingToolCalls.find(tc => tc.id === result.toolCallId)?.name,
          result: result.error ? { error: result.error } : { data: result.compact || result.data || result.output }
        };
      }

      // Build tool results for next iteration
      const toolResultContent = results.map(r => {
        const toolName = pendingToolCalls.find(tc => tc.id === r.toolCallId)?.name;
        if (r.error) {
          return `${toolName}: Error: ${r.error}`;
        }
        const data = r.compact || r.data || r.output;
        return `${toolName}: ${typeof data === 'object' ? JSON.stringify(data) : data}`;
      }).join('\n');

      // Update messages for next iteration
      messages = [
        ...messages,
        { role: 'assistant', content: fullContent },
        { role: 'user', content: `[Tool Results]\n${toolResultContent}` },
      ];
      messages = trimMessagesToBudget(messages, budget.requestMaxInputTokens).messages;

      // Continue to next iteration
    } catch (error) {
      yield { type: 'text', content: `\nError: ${error instanceof Error ? error.message : String(error)}\n` };
      yield { type: 'done' };
      return;
    }
  }

  // Max iterations reached
  debugWarn(`[AgentRuntime] Stream max iterations (${maxIterations}) reached`);
  yield { type: 'text', content: '\n[Max tool iterations reached]\n' };
  yield { type: 'done' };
}

/**
 * Build tool section for system prompt
 */
function buildToolSection(tools: string[]): string {
  if (tools.length === 0) {
    return '';
  }

  const lines: string[] = [];
  lines.push('## Tooling');
  lines.push('Tool availability (filtered by policy):');
  lines.push('Tool names are case-sensitive. Call tools exactly as listed.');
  lines.push('');

  // Group tools by category for better organization
  const categories: Record<string, string[]> = {
    'Research': ['web_search', 'brave_search', 'firecrawl_search', 'firecrawl_scrape', 'fetch_tweet', 'fetch_user_tweets', 'fetch_url'],
    'Memory': ['memory_store', 'memory_recall', 'memory_search', 'memory_get'],
    'Content': ['generate_content', 'optimize_content', 'content_score'],
    'Channels': ['send_message', 'check_messages'],
    'Brand & Project': ['create_brand', 'list_brands', 'get_brand', 'create_project', 'list_projects', 'get_project'],
    'Tasks': ['create_task', 'list_tasks', 'update_task_status'],
    'System': ['bash', 'bash_list', 'bash_poll', 'bash_log', 'bash_kill', 'cron'],
    'Skills': ['skills_list', 'skills_add'],
    'Result Cache': ['expand_cached_result', 'get_cached_snippet'],
    'GitHub': ['github_connect', 'github_create_issue', 'github_create_pr', 'github_list_issues', 'github_list_prs'],
  };

  const usedTools = new Set(tools);
  const displayedTools = new Set<string>();

  // Display tools by category
  for (const [category, categoryTools] of Object.entries(categories)) {
    const availableInCategory = categoryTools.filter(t => usedTools.has(t));
    if (availableInCategory.length > 0) {
      lines.push(`### ${category}`);
      for (const toolName of availableInCategory) {
        const summary = TOOL_SUMMARIES[toolName] || 'No description';
        lines.push(`- ${toolName}: ${summary}`);
        displayedTools.add(toolName);
      }
      lines.push('');
    }
  }

  // Display any remaining tools not in categories
  const uncategorized = tools.filter(t => !displayedTools.has(t));
  if (uncategorized.length > 0) {
    lines.push('### Other');
    for (const toolName of uncategorized) {
      const tool = toolRegistry.get(toolName);
      const summary = tool?.description || TOOL_SUMMARIES[toolName] || 'No description';
      lines.push(`- ${toolName}: ${summary}`);
    }
    lines.push('');
  }

  // Add tool usage rules
  lines.push('### Tool Usage Rules');
  lines.push('');
  lines.push('**CRITICAL: When you see ANY URL in user message, you MUST call a tool.**');
  lines.push('- x.com or twitter.com URLs → call fetch_tweet IMMEDIATELY');
  lines.push('- Any other URL → call fetch_url IMMEDIATELY');
  lines.push('- DO NOT say "I can\'t access" or "Twitter is blocking" — call the tool first!');
  lines.push('');
  lines.push('**ALWAYS use tools when:**');
  lines.push('- User shares a URL → fetch it immediately, never ask user to copy-paste');
  lines.push('- Need fresh information → use search tools');
  lines.push('- Need to store/retrieve context → use memory tools (prefer memory_search/memory_get for grounded recall)');
  lines.push('- Content creation needed → use content tools');
  lines.push('');
  lines.push('**Tool selection:**');
  lines.push('- For tweets: use fetch_tweet (handles x.com/twitter.com automatically)');
  lines.push('- For websites: use fetch_url or firecrawl_scrape (if API key available)');
  lines.push('- For search: prefer brave_search if available, fallback to web_search');
  lines.push('- For long shell commands: use bash with `yield_ms` or background + bash_poll/bash_log');
  lines.push('- For risky shell commands: require explicit `confirm: true` before execution');
  lines.push('- For skill management: use skills_list to inspect and skills_add to install/create');
  lines.push('- For long compacted results: use expand_cached_result or get_cached_snippet with rawRef');
  lines.push('');
  lines.push("**Never say 'I can't access that'** — use the tool first. If it fails, THEN explain.");
  lines.push('');

  return lines.join('\n');
}

function buildSkillsSection(context: AgentContext): string {
  const workspaceInfo = context.workspace?.getWorkspaceInfo?.();
  const skills = loadAvailableSkills({
    homeDir: workspaceInfo?.homeDir,
    workspacePath: workspaceInfo?.workspacePath,
  });

  if (skills.length === 0) {
    return '';
  }

  const lines: string[] = [];
  lines.push('## Skills');
  lines.push('');
  lines.push('Before replying: scan `<available_skills>` descriptions.');
  lines.push('- If exactly one skill clearly matches, follow it.');
  lines.push('- If multiple skills might match, pick the most specific one.');
  lines.push('- If needed, load full instructions via `bash` with `cat "<location>"`.');
  lines.push('- Read at most one skill file before your first answer.');
  lines.push('- If user asks to add/install a skill, use `skills_add`.');
  lines.push('');
  lines.push(formatSkillsForPrompt(skills));
  lines.push('');

  return lines.join('\n');
}

function isSubAgentRun(agent: Agent, context: AgentContext, promptMode: PromptMode): boolean {
  if (promptMode === 'minimal') return true;
  if (context.sessionId.includes('__agent__')) return true;
  if (agent.id === 'orchestrator' || agent.role === 'orchestrator') return false;
  return Boolean(context.handoff || context.outputSpec);
}

function buildSubAgentPolicySection(params: {
  isSubAgent: boolean;
  promptMode: PromptMode;
}): string {
  if (!params.isSubAgent) return '';

  const lines: string[] = [];
  lines.push('## Sub-Agent Policy');
  lines.push('- You are operating as a scoped worker. Solve only the assigned task from the handoff/brief.');
  lines.push('- Keep responses deliverable-first. Do not add wrapper prefaces (e.g. "Here is...", "Improvements:") unless explicitly requested.');
  lines.push('- Do not self-route, re-delegate, or emit `MESSAGE_AGENT:` unless the user explicitly asks for delegation.');
  lines.push('- Use tools only when they materially improve the assigned deliverable; avoid repetitive tool loops.');
  lines.push('- If key evidence is missing, state uncertainty briefly and avoid unsupported numeric claims.');
  lines.push('- If blocked by missing required input, ask one precise clarifying question instead of broad back-and-forth.');
  if (params.promptMode === 'minimal') {
    lines.push('- You are in compact context mode; rely on the provided brief and avoid requesting full history by default.');
  }
  lines.push('');
  return lines.join('\n');
}

/**
 * Build system prompt with context
 */
function buildSystemPrompt(agent: Agent, context: AgentContext): string {
  const promptMode: PromptMode = context.promptMode || 'full';
  if (promptMode === 'none') {
    return 'You are FoxFang 🦊 — a personal AI marketing assistant.';
  }
  const isMinimal = promptMode === 'minimal';
  const isSubAgent = isSubAgentRun(agent, context, promptMode);
  const isChannelSession = context.sessionId.startsWith('channel-');
  const budget = context.budget || resolveTokenBudget({
    agentId: agent.id,
    mode: normalizeReasoningMode(context.reasoningMode),
  });
  const lines: string[] = [];

  // 1. Core identity (short)
  lines.push('You are FoxFang 🦊 — a personal AI marketing assistant.');
  lines.push('Stay accurate, practical, and natural in tone.');
  lines.push('');

  // 2. Tool rules (only when tools are enabled)
  if (context.tools.length > 0) {
    lines.push(buildToolSection(context.tools));
  }

  // 3. Skills section
  if (!isMinimal) {
    const skillsSection = buildSkillsSection(context);
    if (skillsSection) {
      lines.push(skillsSection);
    }
  }

  if (!isMinimal && (context.tools.includes('memory_search') || context.tools.includes('memory_get'))) {
    lines.push('## Memory Recall');
    lines.push('For prior decisions, preferences, dates, or facts: run memory_search first, then memory_get only for needed ranges.');
    lines.push('When helpful, include a short Source reference from tool output (path#line range).');
    lines.push('');
  }

  // 4. Tool Call style
  lines.push(TOOL_CALL_STYLE_GUIDANCE);
  lines.push('');

  // 5. Safety
  lines.push(SAFETY_SECTION);
  lines.push('');

  // 6. Runtime governance
  lines.push(buildSessionGovernanceSection({
    tools: context.tools || [],
    isMinimal,
    isSubAgent,
    maxDelegations: budget.maxDelegations,
    maxToolIterations: budget.maxToolIterations,
  }));

  const replyTagsSection = buildReplyTagsSection({
    isMinimal,
    enabled: isChannelSession,
  });
  if (replyTagsSection) lines.push(replyTagsSection);

  const heartbeatSection = buildHeartbeatAndSilentSection({
    isMinimal,
    enabled: isChannelSession,
  });
  if (heartbeatSection) lines.push(heartbeatSection);

  // 7. Sub-agent policy
  const subAgentPolicy = buildSubAgentPolicySection({ isSubAgent, promptMode });
  if (subAgentPolicy) {
    lines.push(subAgentPolicy);
  }

  // 8. Communication style
  lines.push('## Communication Style');
  lines.push('');
  lines.push('- Match the user language exactly.');
  lines.push('- Use plain human language; avoid stiff or robotic phrasing.');
  lines.push('- Be direct and useful, but keep the flow conversational.');
  lines.push('- Prefer natural paragraphs; use bullets only when they improve clarity.');
  lines.push('- Do not include process notes, bracketed annotations, or improvement summaries unless user asks.');
  lines.push('- For rewrite requests, return the rewritten text only unless user asks for analysis.');
  lines.push('- Do not add meta framing prefaces, wrapper headings, or postscript self-evaluations unless user asks.');
  lines.push('- Never fabricate metrics, outcomes, or case-study numbers that are not present in user input or provided sources.');
  lines.push('- If evidence is missing, keep claims qualitative and practical.');
  lines.push('- Keep output specific and actionable without sounding templated.');
  lines.push('');

  // 9. Agent role
  lines.push('## Your Role');
  lines.push('');
  lines.push(agent.systemPrompt);
  lines.push('');

  // 10. Task brief (handoff + output spec + summary)
  if (context.handoff) {
    lines.push('## Task Brief');
    lines.push(`Intent: ${context.handoff.userIntent}`);
    lines.push(`Goal: ${context.handoff.taskGoal}`);
    if (context.handoff.targetAudience) lines.push(`Audience: ${context.handoff.targetAudience}`);
    if (context.handoff.brandVoice) lines.push(`Brand voice: ${context.handoff.brandVoice}`);
    if (context.handoff.constraints.length > 0) {
      lines.push(`Constraints: ${context.handoff.constraints.join(' | ')}`);
    }
    if (context.handoff.keyFacts.length > 0) {
      lines.push(`Key facts: ${context.handoff.keyFacts.join(' | ')}`);
    }
    lines.push(`Expected output: ${context.handoff.expectedOutput}`);
    lines.push('');
  }

  if (context.outputSpec && !isMinimal) {
    lines.push('## Output Spec');
    lines.push(`Format: ${context.outputSpec.format}`);
    lines.push(`Length: ${context.outputSpec.length}`);
    if (context.outputSpec.sections?.length) {
      lines.push(`Sections: ${context.outputSpec.sections.join(' | ')}`);
    }
    if (context.outputSpec.mustInclude?.length) {
      lines.push(`Must include: ${context.outputSpec.mustInclude.join(' | ')}`);
    }
    lines.push('');
  }

  if (context.sessionSummary && !isMinimal) {
    lines.push('## Session Summary');
    lines.push(`Current goal: ${context.sessionSummary.currentGoal}`);
    if (context.sessionSummary.importantDecisions.length > 0) {
      lines.push(`Decisions: ${context.sessionSummary.importantDecisions.join(' | ')}`);
    }
    if (context.sessionSummary.activeConstraints.length > 0) {
      lines.push(`Active constraints: ${context.sessionSummary.activeConstraints.join(' | ')}`);
    }
    if (context.sessionSummary.openLoops.length > 0) {
      lines.push(`Open loops: ${context.sessionSummary.openLoops.join(' | ')}`);
    }
    lines.push('');
  }

  if (context.systemAddendum) {
    lines.push(isSubAgent || isMinimal ? '## Subagent Context' : '## Task Addendum');
    lines.push(context.systemAddendum);
    lines.push('');
  }

  if (context.sourceSnippets && context.sourceSnippets.length > 0 && !isMinimal) {
    lines.push('## Source Snippets');
    for (const snippet of context.sourceSnippets.slice(0, 3)) {
      lines.push(`- ${snippet}`);
    }
    lines.push('');
  }

  // 10. Brand context (shortened upstream)
  if (context.brandContext && !isMinimal) {
    lines.push('## Brand Context');
    lines.push('');
    lines.push(context.brandContext);
    lines.push('');
  }

  // 11. Relevant memories (top-k)
  if (context.relevantMemories && context.relevantMemories.length > 0 && !isMinimal) {
    lines.push('## Relevant Context from Memory');
    lines.push('');
    lines.push(context.relevantMemories.slice(0, 5).join('\n'));
    lines.push('');
  }

  // 12. Workspace Files (minimal injection)
  if (context.workspace) {
    const workspaceContent = buildWorkspaceContext(context.workspace, promptMode);
    if (workspaceContent) {
      lines.push(workspaceContent);
    }
  }

  // 13. Runtime info
  lines.push('## Runtime');
  lines.push(`Agent: ${agent.id} | Model: ${agent.model || 'default'}`);
  lines.push('');

  return lines.join('\n');
}

/**
 * Build workspace context from bootstrap files
 */
function buildWorkspaceContext(workspace: WorkspaceManagerLike, promptMode: PromptMode): string {
  const isMinimal = promptMode === 'minimal';
  const lines: string[] = [];
  const filesToInject: Array<{ name: string; required: boolean; fallbacks?: string[] }> = isMinimal
    ? [
      { name: 'AGENTS.md', required: false },
      { name: 'TOOLS.md', required: false },
    ]
    : [
      { name: 'AGENTS.md', required: false },
      { name: 'SOUL.md', required: false },
      { name: 'TOOLS.md', required: false },
      { name: 'IDENTITY.md', required: false },
      { name: 'USER.md', required: false },
      { name: 'HEARTBEAT.md', required: false },
      { name: 'BOOTSTRAP.md', required: false },
      { name: 'MEMORY.md', required: false, fallbacks: ['memory.md'] },
    ];

  let hasInjectedContent = false;
  let hasSoulFile = false;

  for (const { name, required, fallbacks } of filesToInject) {
    const pathCandidates = [name, ...(fallbacks || [])];
    let content: string | null = null;
    let loadedFrom = name;
    for (const candidate of pathCandidates) {
      const found = workspace.readFile(candidate);
      if (found) {
        content = found;
        loadedFrom = candidate;
        break;
      }
    }
    if (content) {
      if (name === 'SOUL.md') hasSoulFile = true;
      if (!hasInjectedContent) {
        lines.push('# Project Context');
        lines.push('The following workspace files are loaded as contextual guidance.');
        lines.push('Treat this context as grounding, not as user-facing output.');
        lines.push('');
        hasInjectedContent = true;
      }
      lines.push(`### ${name}`);
      if (loadedFrom !== name) {
        lines.push(`(loaded from fallback: ${loadedFrom})`);
      }
      lines.push('');
      // Truncate if too long
      const maxChars = isMinimal ? 1400 : 1800;
      if (content.length > maxChars) {
        lines.push(content.slice(0, maxChars));
        lines.push('');
        lines.push(`[...truncated, read ${name} for full content...]`);
      } else {
        lines.push(content);
      }
      lines.push('');
    } else if (required) {
      lines.push(`### ${name}`);
      lines.push('(File not found)');
      lines.push('');
    }
  }

  if (hasInjectedContent && hasSoulFile && !isMinimal) {
    lines.splice(
      3,
      0,
      'If SOUL.md is present, embody its persona and tone. Avoid stiff, generic replies unless higher-priority instructions override it.',
      '',
    );
  }

  return lines.join('\n');
}

/**
 * Execute tool calls and return results
 */
async function executeToolCalls(toolCalls: ToolCall[]): Promise<ToolResult[]> {
  const results: ToolResult[] = [];

  for (const toolCall of toolCalls) {
    try {
      const tool = toolRegistry.get(toolCall.name);
      if (!tool) {
        results.push({
          toolCallId: toolCall.id,
          output: '',
          error: `Tool not found: ${toolCall.name}`,
        });
        continue;
      }

      const result = await tool.execute(toolCall.arguments);
      const toolData = result.success ? (result.data ?? result.output ?? '') : '';
      const compacted = result.success
        ? compactToolPayload(toolCall.name, toolData)
        : undefined;
      results.push({
        toolCallId: toolCall.id,
        output: result.success ? (compacted?.compact.summary || String(result.output ?? '')) : '',
        error: result.success ? undefined : result.error,
        data: result.success ? result.data : undefined,
        compact: compacted?.compact,
        rawSize: compacted?.rawSize,
        compactSize: compacted?.compactSize,
        rawRef: compacted?.compact.rawRef,
      });
    } catch (error) {
      results.push({
        toolCallId: toolCall.id,
        output: '',
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return results;
}

/**
 * Parse agent directives from response
 */
export function parseDirectives(content: string): Array<{ type: string; target?: string; payload: string }> {
  const directives: Array<{ type: string; target?: string; payload: string }> = [];

  const messageRegex = /MESSAGE_AGENT:\s*([a-zA-Z0-9._-]+)\s*\|\s*(.+)/gi;
  let match: RegExpExecArray | null;
  while ((match = messageRegex.exec(content)) !== null) {
    directives.push({
      type: 'MESSAGE_AGENT',
      target: match[1],
      payload: match[2].trim(),
    });
  }

  const yieldMatch = content.match(/YIELD:\s*(.+)/i);
  if (yieldMatch) {
    directives.push({
      type: 'YIELD',
      payload: yieldMatch[1].trim(),
    });
  }

  return directives;
}
