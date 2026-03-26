/**
 * Core Types
 */

export interface StreamChunk {
  type: 'text' | 'assistant_update' | 'tool_call' | 'tool_result' | 'done' | 'error';
  content?: string;
  tool?: string;
  args?: any;
  result?: any;
  error?: string;
  mediaUrls?: string[];
  finalContent?: string;
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: any;
}

export interface ToolResult {
  toolCallId: string;
  output: any;
  error?: string;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
  timestamp?: number;
}

export interface Session {
  id: string;
  messages: ChatMessage[];
  metadata?: Record<string, any>;
}

export interface AgentConfig {
  id: string;
  name: string;
  description: string;
  systemPrompt: string;
  model?: string;
  provider?: string;
  tools?: string[];
}

export interface AgentEvent {
  type: string;
  sessionId: string;
  timestamp: number;
  data?: any;
}

export type EventHandler = (event: AgentEvent) => void | Promise<void>;
