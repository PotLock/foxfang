/**
 * Agent Orchestrator
 */

import { toolRegistry, ToolSpec } from '../tools/index';

export interface AgentRequest {
  query: string;
  projectId?: string;
  sessionId?: string;
}

export interface AgentResponse {
  content: string;
  toolCalls?: Array<{ name: string; arguments: any }>;
}

class Orchestrator {
  async process(request: AgentRequest): Promise<AgentResponse> {
    // Mock implementation
    return { content: `Processed: ${request.query}` };
  }

  getAvailableTools(): ToolSpec[] {
    return toolRegistry.getAllSpecs();
  }
}

let defaultOrchestrator: Orchestrator | null = null;

export function getDefaultOrchestrator(): Orchestrator {
  if (!defaultOrchestrator) {
    defaultOrchestrator = new Orchestrator();
  }
  return defaultOrchestrator;
}

export { Orchestrator };
