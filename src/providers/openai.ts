/**
 * OpenAI Provider
 */

import { Provider, ChatRequest, ChatResponse, StreamChunk } from './traits';
import { ProviderConfig } from './index';

interface OpenAIApiError {
  error?: { message?: string };
}

interface OpenAIApiResponse {
  choices?: Array<{
    message?: {
      content?: string;
      tool_calls?: Array<{
        function: { name: string; arguments: string };
      }>;
    };
  }>;
  usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
}

export class OpenAIProvider implements Provider {
  name = 'OpenAI';
  private apiKey: string;
  private baseUrl = 'https://api.openai.com/v1';
  private extraHeaders: Record<string, string> = {};

  constructor(config: ProviderConfig) {
    this.apiKey = config.apiKey || '';
    if (config.baseUrl) {
      this.baseUrl = config.baseUrl;
    }
    if (config.name) {
      this.name = config.name;
    }
    if (config.headers) {
      this.extraHeaders = config.headers;
    }
  }

  private getHeaders(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.apiKey}`,
      ...this.extraHeaders,
    };
  }

  async chat(request: ChatRequest): Promise<ChatResponse> {
    const url = `${this.baseUrl}/chat/completions`;
    const body: Record<string, any> = {
      model: request.model || 'gpt-4o',
      messages: request.messages,
      max_tokens: 4096,
    };

    // Only include tools if present (some providers reject empty/undefined tools)
    if (request.tools && request.tools.length > 0) {
      body.tools = request.tools.map(t => ({
        type: 'function',
        function: {
          name: t.name,
          description: t.description,
          parameters: t.parameters,
        },
      }));
    }

    console.log(`[${this.name}] Calling ${url} with model=${body.model}`);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 120_000); // 2 min timeout

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (error: any) {
      clearTimeout(timeout);
      if (error?.name === 'AbortError') {
        throw new Error(`${this.name} request timed out after 120s`);
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      console.error(`[${this.name}] API error ${response.status}: ${errorText}`);
      try {
        const errorJson = JSON.parse(errorText) as OpenAIApiError;
        throw new Error(errorJson.error?.message || `HTTP ${response.status}`);
      } catch (e) {
        if (e instanceof Error && e.message.startsWith('HTTP')) throw e;
        throw new Error(`${this.name} HTTP ${response.status}: ${errorText.slice(0, 200)}`);
      }
    }

    const data = await response.json() as OpenAIApiResponse;
    console.log(`[${this.name}] Response OK, choices: ${data.choices?.length || 0}`);
    
    const message = data.choices?.[0]?.message;
    const result: ChatResponse = {
      content: message?.content || '',
      usage: {
        promptTokens: data.usage?.prompt_tokens || 0,
        completionTokens: data.usage?.completion_tokens || 0,
        totalTokens: data.usage?.total_tokens || 0,
      },
    };

    if (message?.tool_calls && message.tool_calls.length > 0) {
      result.toolCalls = message.tool_calls.map((tc: any) => {
        let args: any = {};
        try {
          args = typeof tc.function.arguments === 'string'
            ? JSON.parse(tc.function.arguments)
            : tc.function.arguments;
        } catch {
          console.warn(`[${this.name}] Failed to parse tool args for ${tc.function.name}`);
        }
        return { name: tc.function.name, arguments: args };
      });
    }

    return result;
  }

  async *chatStream(request: ChatRequest): AsyncIterable<StreamChunk> {
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({
        model: request.model || 'gpt-4o',
        messages: request.messages,
        stream: true,
      }),
    });

    if (!response.ok) {
      const error = await response.json() as OpenAIApiError;
      throw new Error(error.error?.message || `HTTP ${response.status}`);
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
          const data = line.slice(6);
          if (data === '[DONE]') return;

          try {
            const parsed = JSON.parse(data);
            const delta = parsed.choices?.[0]?.delta;

            if (delta?.content) {
              yield { type: 'content', content: delta.content };
            }
          } catch {
            // Ignore parse errors
          }
        }
      }
    }
  }

  async getStatus(): Promise<{ healthy: boolean; error?: string }> {
    if (!this.apiKey) {
      return { healthy: false, error: 'API key not configured' };
    }

    try {
      const response = await fetch(`${this.baseUrl}/models`, {
        headers: this.getHeaders(),
      });

      if (response.ok) {
        return { healthy: true };
      } else {
        return { healthy: false, error: `HTTP ${response.status}` };
      }
    } catch (error) {
      return { healthy: false, error: error instanceof Error ? error.message : String(error) };
    }
  }
}
