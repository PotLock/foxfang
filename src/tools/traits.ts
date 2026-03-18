/**
 * Tool Traits
 */

export enum ToolCategory {
  UTILITY = 'utility',
  DATA = 'data',
  EXTERNAL = 'external',
}

export interface ToolSpec {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, { type: string; description: string }>;
    required: string[];
  };
}

export interface Tool extends ToolSpec {
  category: ToolCategory;
  execute(args: any): Promise<any>;
  validateArgs?(args: any): boolean;
}

export interface ToolContext {
  sessionId: string;
  userId?: string;
  projectId?: string;
  workspaceDir: string;
}

export interface ToolResult {
  success: boolean;
  output?: string;
  error?: string;
  data?: any;
}
