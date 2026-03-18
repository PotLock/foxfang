/**
 * Agent Orchestrator
 */

import { toolRegistry, ToolSpec } from '../tools/index';
import { SessionManager } from '../sessions/manager';

export interface AgentRequest {
  query: string;
  projectId?: string;
  sessionId?: string;
}

export interface AgentResponse {
  content: string;
  toolCalls?: Array<{ name: string; arguments: any }>;
}

export interface StreamChunk {
  type: 'text' | 'tool_call' | 'done';
  content?: string;
  tool?: string;
}

export interface RunRequest {
  sessionId: string;
  agentId: string;
  messages?: Array<{ role: string; content: string }>;
  message?: string;
  projectId?: string;
  model?: string;
  provider?: string;
  systemPrompt?: string;
  stream?: boolean;
}

export interface RunResponse {
  content: string;
  messages?: Array<{ role: string; content: string }>;
  toolCalls?: Array<{ name: string; arguments: any }>;
  stream?: AsyncIterable<StreamChunk>;
}

export class AgentOrchestrator {
  private sessionManager: SessionManager;

  constructor(sessionManager: SessionManager) {
    this.sessionManager = sessionManager;
  }

  async process(request: AgentRequest): Promise<AgentResponse> {
    // Mock implementation
    return { content: `Processed: ${request.query}` };
  }

  async run(request: RunRequest): Promise<RunResponse> {
    const content = request.message || request.messages?.[request.messages.length - 1]?.content || '';
    
    if (request.stream) {
      // Return streaming response
      async function* streamGenerator(): AsyncGenerator<StreamChunk> {
        yield { type: 'text', content: `Streaming response to: ${content}` };
        yield { type: 'done' };
      }
      return {
        content: '',
        stream: streamGenerator(),
      };
    }
    
    return {
      content: `Response to: ${content}`,
      messages: [
        ...(request.messages || []),
        { role: 'assistant', content: `Response to: ${content}` },
      ],
    };
  }

  getAvailableTools(): ToolSpec[] {
    return toolRegistry.getAllSpecs();
  }
}
