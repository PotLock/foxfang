/**
 * Auto-Reply System
 * 
 * Features:
 * - Reply dispatcher with queue management
 * - Typing controller with TTL
 * - Command registry for slash commands
 * - Session management per channel
 * - Tool result streaming
 */

import { AgentOrchestrator } from '../agents/orchestrator';
import { createReplyDispatcher } from './dispatcher';
import { createReplyProjector } from './reply-projector';
import { createTypingController } from './typing';
import { CommandRegistryManager, registerBuiltinCommands } from './commands';
import { 
  IncomingMessage, 
  ReplyPayload, 
  AutoReplyConfig,
  CommandContext,
  AutoReplyBinding,
  AutoReplySessionScope,
} from './types';

// Re-export types
export * from './types';
export { createReplyDispatcher, ReplyDispatcher } from './dispatcher';
export { createTypingController } from './typing';
export { CommandRegistryManager, registerBuiltinCommands } from './commands';

export interface HandleMessageResult {
  content?: string;
  toolCalls?: Array<{ name: string; args: unknown }>;
  error?: string;
  route?: {
    agentId: string;
    sessionId: string;
    bindingId?: string;
  };
}

/**
 * AutoReplyHandler - Main entry point for auto-reply system
 */
export class AutoReplyHandler {
  private orchestrator: AgentOrchestrator;
  private config: AutoReplyConfig;
  private commandRegistry: CommandRegistryManager;
  private typingControllers: Map<string, ReturnType<typeof createTypingController>> = new Map();
  private sessions: Map<string, { messageCount: number; lastActivity: Date }> = new Map();

  constructor(orchestrator: AgentOrchestrator, config: AutoReplyConfig) {
    this.orchestrator = orchestrator;
    this.config = config;
    this.commandRegistry = new CommandRegistryManager();
    registerBuiltinCommands(this.commandRegistry);
  }

  private toValueList(input?: string | string[]): string[] {
    if (typeof input === 'string') return [input];
    if (!Array.isArray(input)) return [];
    return input;
  }

  private matchesValue(actualRaw: unknown, expected?: string | string[]): boolean {
    const expectedValues = this.toValueList(expected)
      .map((value) => String(value).trim().toLowerCase())
      .filter(Boolean);
    if (expectedValues.length === 0) return true;

    const actual = String(actualRaw ?? '').trim().toLowerCase();
    if (!actual) return false;
    return expectedValues.includes(actual);
  }

  private matchesMetadata(
    metadata: Record<string, unknown> | undefined,
    expected?: Record<string, string | string[]>
  ): boolean {
    if (!expected || Object.keys(expected).length === 0) return true;
    const source = metadata || {};
    for (const [key, expectedValue] of Object.entries(expected)) {
      if (!this.matchesValue(source[key], expectedValue)) return false;
    }
    return true;
  }

  private bindingSpecificity(binding: AutoReplyBinding): number {
    let score = 0;
    if (binding.channel) score += 1;
    if (binding.chatType) score += 1;
    if (binding.chatId) score += 2;
    if (binding.threadId) score += 2;
    if (binding.fromId) score += 1;
    if (binding.accountId) score += 1;
    if (binding.metadata) score += Object.keys(binding.metadata).length;
    return score;
  }

  private selectBinding(message: IncomingMessage): AutoReplyBinding | undefined {
    const candidates = (this.config.bindings || []).filter((binding) => binding.enabled !== false);
    if (candidates.length === 0) return undefined;

    const metadata = message.metadata || {};
    const chatId = message.chat?.id || metadata.chatId;
    const threadId = message.threadId || metadata.threadId || metadata.threadTs;
    const accountId = metadata.accountId;
    const fromId = message.from?.id || String(metadata.senderId || metadata.userId || metadata.authorId || '');
    const chatType = message.chat?.type || metadata.chatType || metadata.channelType;

    const matched: AutoReplyBinding[] = [];
    for (const binding of candidates) {
      if (!this.matchesValue(message.channel, binding.channel)) continue;
      if (!this.matchesValue(chatType, binding.chatType)) continue;
      if (!this.matchesValue(chatId, binding.chatId)) continue;
      if (!this.matchesValue(threadId, binding.threadId)) continue;
      if (!this.matchesValue(fromId, binding.fromId)) continue;
      if (!this.matchesValue(accountId, binding.accountId)) continue;
      if (!this.matchesMetadata(message.metadata, binding.metadata)) continue;
      matched.push(binding);
    }

    if (matched.length === 0) return undefined;

    matched.sort((left, right) => {
      const leftPriority = Number(left.priority ?? 0);
      const rightPriority = Number(right.priority ?? 0);
      if (rightPriority !== leftPriority) return rightPriority - leftPriority;
      return this.bindingSpecificity(right) - this.bindingSpecificity(left);
    });

    return matched[0];
  }

  private sanitizeSessionSegment(value: string): string {
    const cleaned = value.trim().replace(/[^a-zA-Z0-9._-]+/g, '_');
    return cleaned.slice(0, 120) || 'unknown';
  }

  private resolveSessionAnchor(message: IncomingMessage, scope: AutoReplySessionScope): string {
    const metadata = message.metadata || {};
    const fromId = String(
      message.from?.id
      || metadata.senderId
      || metadata.userId
      || metadata.authorId
      || 'unknown'
    );
    const chatId = String(message.chat?.id || metadata.chatId || fromId);
    const threadId = String(message.threadId || metadata.threadId || metadata.threadTs || '');

    if (scope === 'from') return `from-${fromId}`;
    if (scope === 'chat') return `chat-${chatId}`;
    if (scope === 'thread') return threadId ? `thread-${threadId}` : `chat-${chatId}`;
    if (threadId) return `chat-${chatId}-thread-${threadId}`;
    return `chat-${chatId}`;
  }

  private resolveRoute(message: IncomingMessage): {
    agentId: string;
    sessionId: string;
    sessionKey: string;
    routeKey: string;
    bindingId?: string;
  } {
    const metadata = message.metadata || {};
    const binding = this.selectBinding(message);
    const agentId = String(binding?.agentId || this.config.defaultAgent || '').trim() || 'foxfang';
    const scope = binding?.sessionScope || this.config.defaultSessionScope || 'chat-thread';
    const accountId = String(metadata.accountId || 'default');
    const anchor = this.resolveSessionAnchor(message, scope);
    const routeKey = binding?.id ? `binding-${binding.id}` : 'binding-default';

    const sessionId = [
      'channel',
      this.sanitizeSessionSegment(message.channel),
      this.sanitizeSessionSegment(accountId),
      this.sanitizeSessionSegment(scope),
      this.sanitizeSessionSegment(anchor),
      this.sanitizeSessionSegment(routeKey),
    ].join('-');

    return {
      agentId,
      sessionId,
      sessionKey: sessionId,
      routeKey,
      bindingId: binding?.id,
    };
  }

  /**
   * Get or create typing controller for a session
   */
  private getTypingController(
    sessionKey: string,
    sendTyping: () => Promise<void>
  ): ReturnType<typeof createTypingController> {
    let controller = this.typingControllers.get(sessionKey);
    if (!controller) {
      controller = createTypingController({
        onReplyStart: sendTyping,
        onCleanup: () => {
          this.typingControllers.delete(sessionKey);
        },
        typingIntervalSeconds: this.config.typingIntervalSeconds ?? 3,
        typingTtlMs: 15 * 60 * 1000, // keep typing alive for long-running tool sessions
      });
      this.typingControllers.set(sessionKey, controller);
    }
    return controller;
  }

  /**
   * Check if we should reply to this message
   */
  shouldReply(
    message: IncomingMessage,
    botUsername?: string,
    requireMentionOverride?: boolean
  ): boolean {
    if (!this.config.enabled) return false;
    if (!this.config.allowedChannels.includes(message.channel)) return false;

    const requireMention = requireMentionOverride ?? this.config.requireMention;

    // Check mention requirement for groups
    if (requireMention && message.chat?.type !== 'private') {
      const normalizedBotUsername = botUsername?.trim().replace(/^@/, '').toLowerCase();
      const normalizedText = (message.text || '').toLowerCase();

      const implicitMention =
        Boolean(normalizedBotUsername) && normalizedText.includes(`@${normalizedBotUsername}`);
      const wasMentioned = Boolean(message.wasMentioned || implicitMention);
      const canDetectMention =
        message.canDetectMention ??
        (typeof message.wasMentioned === 'boolean' || Boolean(normalizedBotUsername));

      // Only enforce mention-gating when mention detection is reliable.
      if (canDetectMention && !wasMentioned) return false;
    }

    return true;
  }

  private buildMediaContextBlock(message: IncomingMessage): string {
    const media = message.media || [];
    if (media.length === 0) return '';

    const lines: string[] = [];
    lines.push('[Inbound Media Context]');

    media.forEach((item, index) => {
      lines.push(`Attachment ${index + 1}:`);
      lines.push(`- type: ${item.type}`);
      if (item.filename) lines.push(`- filename: ${item.filename}`);
      if (item.mimeType) lines.push(`- mimeType: ${item.mimeType}`);
      if (typeof item.size === 'number') lines.push(`- size: ${item.size} bytes`);
      if (item.caption) lines.push(`- caption: ${item.caption}`);
      if (item.extractedText) {
        lines.push('- extracted_text:');
        lines.push(item.extractedText);
      } else if (item.extractionError) {
        lines.push(`- extraction_error: ${item.extractionError}`);
      }
    });

    return lines.join('\n');
  }

  private buildInboundPrompt(message: IncomingMessage): string {
    const userText = (message.text || '').trim();
    const mediaContext = this.buildMediaContextBlock(message);

    if (userText && mediaContext) {
      return `${userText}\n\n${mediaContext}`;
    }
    if (mediaContext) {
      return mediaContext;
    }
    return userText || '[Media message]';
  }

  /**
   * Handle incoming message and generate reply
   */
  async handleMessage(
    message: IncomingMessage,
    sendTyping: () => Promise<void>,
    sendReply: (payload: ReplyPayload) => Promise<void>,
    botUsername?: string,
    requireMentionOverride?: boolean
  ): Promise<HandleMessageResult> {
    if (!this.shouldReply(message, botUsername, requireMentionOverride)) {
      return {};
    }

    const route = this.resolveRoute(message);
    const sessionKey = route.sessionKey;
    const sessionId = route.sessionId;

    // Track session
    this.sessions.set(sessionKey, {
      messageCount: (this.sessions.get(sessionKey)?.messageCount ?? 0) + 1,
      lastActivity: new Date(),
    });

    try {
      // Check if it's a command
      if (message.text && this.commandRegistry.isCommand(message.text)) {
        const commandResult = await this.commandRegistry.execute({
          message,
          args: [],
          sessionId,
        });

        if (commandResult) {
          await sendReply(commandResult);
          return {
            content: commandResult.text,
            route: {
              agentId: route.agentId,
              sessionId: route.sessionId,
              bindingId: route.bindingId,
            },
          };
        }
      }

      // Setup typing controller
      const typingController = this.getTypingController(sessionKey, sendTyping);
      
      // Create dispatcher
      const dispatcher = createReplyDispatcher({
        deliver: async (payload, info) => {
          await sendReply(payload);
        },
        humanDelayMs: this.config.humanDelayMs ?? 800,
        onIdle: () => {
          typingController.markDispatchIdle();
        },
      });

      // Start typing
      await typingController.startTypingLoop();

      // Run agent in streaming mode so progress/tool lifecycle can be projected
      const inboundPrompt = this.buildInboundPrompt(message);
      const result = await this.orchestrator.run({
        sessionId,
        agentId: route.agentId,
        message: inboundPrompt,
        stream: true,
      });

      const projector = createReplyProjector({
        dispatcher,
        currentMessageId: message.id,
        defaultReplyToMessageId: this.config.replyToMessage ? message.id : undefined,
        threadId: message.threadId,
      });

      if (result.stream) {
        for await (const chunk of result.stream) {
          typingController.refreshTypingTtl();
          await projector.consume(chunk);
        }
      }

      const projected = await projector.finalize();

      // Mark run complete after the stream and projection have fully settled
      typingController.markRunComplete();

      // Mark dispatcher complete and wait
      dispatcher.markComplete();
      await dispatcher.waitForIdle();

      return {
        content: projected.content,
        toolCalls: projected.toolCalls?.map(tc => ({
          name: tc.name,
          args: tc.arguments,
        })),
        route: {
          agentId: route.agentId,
          sessionId: route.sessionId,
          bindingId: route.bindingId,
        },
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error('Auto-reply failed:', error);
      
      const errorPayload: ReplyPayload = {
        text: '❌ Sorry, I encountered an error processing your message.',
        replyToMessageId: message.id,
      };
      await sendReply(errorPayload);
      
      return { error: errorMsg };
    }
  }

  /**
   * Register a custom command
   */
  registerCommand(name: string, description: string, handler: (ctx: CommandContext) => Promise<ReplyPayload | null>): void {
    this.commandRegistry.register({
      name,
      description,
      handler,
    });
  }

  /**
   * Get session stats
   */
  getSessionStats(): { totalSessions: number; totalMessages: number } {
    let totalMessages = 0;
    for (const session of this.sessions.values()) {
      totalMessages += session.messageCount;
    }
    return {
      totalSessions: this.sessions.size,
      totalMessages,
    };
  }

  /**
   * Clear all sessions
   */
  clearSessions(): void {
    this.sessions.clear();
  }
}

/**
 * Legacy function for simple use cases
 */
export async function handleIncomingMessage(
  message: IncomingMessage,
  orchestrator: AgentOrchestrator,
  config: AutoReplyConfig
): Promise<string | null> {
  const handler = new AutoReplyHandler(orchestrator, config);
  const result = await handler.handleMessage(
    message,
    async () => {}, // No typing indicator
    async (payload) => {}, // No reply sender
  );
  return result.content || null;
}

/**
 * Check if message should be processed (legacy)
 */
export function shouldReply(
  message: IncomingMessage,
  config: AutoReplyConfig,
  botUsername?: string
): boolean {
  const handler = new AutoReplyHandler({} as AgentOrchestrator, config);
  return handler.shouldReply(message, botUsername);
}
