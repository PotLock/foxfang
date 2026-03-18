// lib/api/client.ts
// API client for backend communication

export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8787';

export interface ApiRequest {
  sessionId?: string;
  message: string;
  userId: string;
  systemPrompt?: string;
  model?: string;
  provider?: string;
  tools?: string[];
  stream?: boolean;
}

export interface ApiResponse {
  sessionId: string;
  response: string;
  error?: string;
  toolCalls?: any[];
  toolResults?: any[];
  model: string;
  provider: string;
  durationMs: number;
}

export async function sendMessage(request: ApiRequest): Promise<ApiResponse> {
  const response = await fetch(`${API_BASE_URL}/agent/run`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to send message');
  }

  return response.json();
}

export async function* streamMessage(request: ApiRequest): AsyncGenerator<any> {
  const response = await fetch(`${API_BASE_URL}/agent/stream`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to stream message');
  }

  const reader = response.body?.getReader();
  const decoder = new TextDecoder();

  if (!reader) {
    throw new Error('No response body');
  }

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const chunk = decoder.decode(value);
    const lines = chunk.split('\n');

    for (const line of lines) {
      if (line?.startsWith('data: ')) {
        try {
          const data = JSON.parse(line.slice(6));
          yield data;
        } catch {
          // Ignore parse errors
        }
      }
    }
  }
}
