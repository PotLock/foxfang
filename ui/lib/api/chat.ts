import { API_BASE_URL } from './client';

export interface ChatMessage {
  id: string;
  sessionId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  metadata?: Record<string, unknown>;
  createdAt?: string;
}

export async function listChatMessages(
  userId: string,
  projectId: string,
  sessionId?: string
): Promise<{ messages: ChatMessage[]; sessionId: string | null }> {
  const params = new URLSearchParams({ userId });
  if (sessionId) params.set('sessionId', sessionId);

  const response = await fetch(
    `${API_BASE_URL}/projects/${encodeURIComponent(projectId)}/chat/messages?${params}`
  );

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || error.error || 'Failed to load chat messages');
  }

  return response.json();
}

export async function* streamChatMessage(params: {
  userId: string;
  projectId: string;
  message: string;
  sessionId?: string;
}): AsyncGenerator<{ type: string; content?: string; sessionId?: string; name?: string; error?: string }> {
  const response = await fetch(
    `${API_BASE_URL}/projects/${encodeURIComponent(params.projectId)}/chat/send`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: params.userId,
        message: params.message,
        sessionId: params.sessionId,
      }),
    }
  );

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || error.error || 'Failed to send chat message');
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error('No response body');

  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        try {
          yield JSON.parse(line.slice(6));
        } catch {
          // Ignore parse errors
        }
      }
    }
  }

  // Process remaining buffer
  if (buffer.startsWith('data: ')) {
    try {
      yield JSON.parse(buffer.slice(6));
    } catch {
      // Ignore
    }
  }
}
