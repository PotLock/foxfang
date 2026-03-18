/**
 * Provider Traits
 */

import { ToolSpec } from '../tools/traits';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatRequest {
  messages: ChatMessage[];
  model: string;
  tools?: ToolSpec[];
  stream?: boolean;
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
