/**
 * Provider Traits
 */

import { ToolSpec } from '../tools/traits';

/**
 * Structured content blocks for native tool_use / tool_result protocol.
 * When the agent loop uses these, providers convert them to the correct
 * API wire format (Anthropic tool_use / tool_result content blocks).
 */
export interface ToolUseBlock {
  type: 'tool_use';
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface ToolResultBlock {
  type: 'tool_result';
  tool_use_id: string;
  content: string;
  is_error?: boolean;
}

export interface TextBlock {
  type: 'text';
  text: string;
}

export type MessageContentBlock = TextBlock | ToolUseBlock | ToolResultBlock;

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  /** Plain string OR structured content blocks (tool_use / tool_result). */
  content: string | MessageContentBlock[];
}

export interface ChatRequest {
  messages: ChatMessage[];
  model: string;
  tools?: ToolSpec[];
  stream?: boolean;
  /**
   * Per-turn dynamic context (channel info, session summary, memory hints).
   * Anthropic: sent as a second system block WITHOUT cache_control so the
   * static system block stays identical across turns and gets cached.
   * Other providers: appended to the system message.
   */
  dynamicSystemContent?: string;
}

export interface ChatResponse {
  content: string;
  toolCalls?: Array<{
    name: string;
    arguments: any;
  }>;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

export interface StreamChunk {
  type: 'content' | 'tool_call';
  content?: string;
  tool?: string;
  args?: any;
}

export interface ProviderStatus {
  id: string;
  name: string;
  healthy: boolean;
  error?: string;
}

export interface Provider {
  name: string;
  chat(request: ChatRequest): Promise<ChatResponse>;
  chatStream(request: ChatRequest): AsyncIterable<StreamChunk>;
  getStatus(): Promise<{ healthy: boolean; error?: string }>;
}
