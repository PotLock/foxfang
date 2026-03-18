import { API_BASE_URL } from './client';

export interface Agent {
  id: string;
  projectId?: string | null;
  name: string;
  email: string;
  role?: string;
  skills?: string[];
  createdAt?: string;
  updatedAt?: string;
}

/** List all agents for a user (system-level, no project dependency). */
export async function listUserAgents(userId: string): Promise<Agent[]> {
  const response = await fetch(
    `${API_BASE_URL}/agents?userId=${encodeURIComponent(userId)}`
  );

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || error.error || 'Failed to load agents');
  }

  const data = await response.json();
  return data.agents || [];
}

/** List agents available for a specific project (backward compat). */
export async function listAgents(userId: string, projectId: string): Promise<Agent[]> {
  const response = await fetch(
    `${API_BASE_URL}/projects/${encodeURIComponent(projectId)}/agents?userId=${encodeURIComponent(userId)}`
  );

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || error.error || 'Failed to load agents');
  }

  const data = await response.json();
  return data.agents || [];
}

export interface AgentTrace {
  id: string;
  sessionId: string;
  projectId: string | null;
  agentId: string | null;
  eventType: string;
  payload: Record<string, unknown>;
  createdAt: string;
}

export async function listAgentTraces(
  userId: string,
  agentId: string,
  options?: { sessionId?: string; eventType?: string; limit?: number; offset?: number }
): Promise<AgentTrace[]> {
  const params = new URLSearchParams({ userId });
  if (options?.sessionId) params.set('sessionId', options.sessionId);
  if (options?.eventType) params.set('eventType', options.eventType);
  if (options?.limit) params.set('limit', String(options.limit));
  if (options?.offset) params.set('offset', String(options.offset));

  const response = await fetch(
    `${API_BASE_URL}/agents/${encodeURIComponent(agentId)}/traces?${params.toString()}`
  );

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || error.error || 'Failed to load agent traces');
  }

  const data = await response.json();
  return data.traces || [];
}

export function createAgentEventSource(userId: string, agentId: string): EventSource {
  const params = new URLSearchParams({ userId });
  return new EventSource(
    `${API_BASE_URL}/agents/${encodeURIComponent(agentId)}/events?${params.toString()}`
  );
}

export async function createAgent(input: {
  userId: string;
  projectId: string;
  name: string;
  email: string;
}): Promise<Agent> {
  const response = await fetch(`${API_BASE_URL}/projects/${encodeURIComponent(input.projectId)}/agents`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      userId: input.userId,
      name: input.name,
      email: input.email
    })
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || error.error || 'Failed to create agent');
  }

  const data = await response.json();
  return data.agent;
}
