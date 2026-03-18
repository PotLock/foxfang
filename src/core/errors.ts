/**
 * Error Classes
 */

export class AgentError extends Error {
  constructor(message: string, public code?: string) {
    super(message);
    this.name = 'AgentError';
  }
}

export class ProviderError extends AgentError {
  constructor(message: string, public provider?: string) {
    super(message, 'PROVIDER_ERROR');
    this.name = 'ProviderError';
  }
}

export class ToolError extends AgentError {
  constructor(message: string, public tool?: string) {
    super(message, 'TOOL_ERROR');
    this.name = 'ToolError';
  }
}

export class SessionError extends AgentError {
  constructor(message: string) {
    super(message, 'SESSION_ERROR');
    this.name = 'SessionError';
  }
}

export class ValidationError extends AgentError {
  constructor(message: string) {
    super(message, 'VALIDATION_ERROR');
    this.name = 'ValidationError';
  }
}

export class PluginLoadError extends AgentError {
  constructor(message: string) {
    super(message, 'PLUGIN_LOAD_ERROR');
    this.name = 'PluginLoadError';
  }
}

export class ToolNotFoundError extends AgentError {
  constructor(message: string) {
    super(message, 'TOOL_NOT_FOUND');
    this.name = 'ToolNotFoundError';
  }
}

export class ToolExecutionError extends AgentError {
  constructor(message: string) {
    super(message, 'TOOL_EXECUTION_ERROR');
    this.name = 'ToolExecutionError';
  }
}
