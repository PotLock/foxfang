/**
 * GitHub Copilot Provider
 *
 * Uses GitHub OAuth device code flow to authenticate, then exchanges the
 * GitHub token for a short-lived Copilot API token. The Copilot API is
 * OpenAI-compatible (Chat Completions format).
 *
 * Token flow:
 *   1. Device code login → long-lived GitHub OAuth token (stored on disk)
 *   2. Token exchange → short-lived Copilot API token (~1 hour, cached)
 *   3. API calls use the Copilot token against the entitlement endpoint
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import { Provider, ChatRequest, ChatResponse, StreamChunk } from './traits';
import { ProviderConfig } from './index';

// --- Constants ---

const CLIENT_ID = 'Iv1.b507a08c87ecfe98';
const DEVICE_CODE_URL = 'https://github.com/login/device/code';
const ACCESS_TOKEN_URL = 'https://github.com/login/oauth/access_token';
const COPILOT_TOKEN_URL = 'https://api.github.com/copilot_internal/v2/token';
const DEFAULT_BASE_URL = 'https://api.individual.githubcopilot.com';
const TOKEN_SAFETY_MARGIN_MS = 5 * 60 * 1000; // refresh 5 min before expiry

// --- Types ---

interface CachedCopilotToken {
  token: string;
  expiresAt: number;
  baseUrl: string;
  updatedAt: number;
}

interface DeviceCodeResponse {
  device_code: string;
  user_code: string;
  verification_uri: string;
  expires_in: number;
  interval: number;
}

// --- Token cache ---

function getCachePath(): string {
  const dir = join(homedir(), '.foxfang', 'credentials');
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  return join(dir, 'github-copilot.token.json');
}

function readCachedToken(): CachedCopilotToken | null {
  const path = getCachePath();
  if (!existsSync(path)) return null;
  try {
    const data = JSON.parse(readFileSync(path, 'utf-8'));
    if (data?.token && data?.expiresAt) return data as CachedCopilotToken;
  } catch { /* ignore corrupt cache */ }
  return null;
}

function writeCachedToken(cached: CachedCopilotToken): void {
  writeFileSync(getCachePath(), JSON.stringify(cached, null, 2), 'utf-8');
}

// --- Base URL derivation from Copilot token ---

function deriveCopilotBaseUrl(token: string): string {
  // Token format: "tid=...;exp=...;proxy-ep=proxy.copilot.example;..."
  const match = token.match(/(?:^|;)\s*proxy-ep=([^;\s]+)/i);
  if (!match?.[1]) return DEFAULT_BASE_URL;
  const proxyEp = match[1].trim().replace(/^https?:\/\//, '');
  const apiHost = proxyEp.replace(/^proxy\./i, 'api.');
  return `https://${apiHost}`;
}

// --- Token exchange ---

async function exchangeGitHubTokenForCopilot(githubToken: string): Promise<CachedCopilotToken> {
  const res = await fetch(COPILOT_TOKEN_URL, {
    headers: {
      Authorization: `Bearer ${githubToken}`,
      Accept: 'application/json',
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Copilot token exchange failed (${res.status}): ${text}`);
  }
  const data = await res.json() as { token?: string; expires_at?: number };
  if (!data.token) {
    throw new Error('Copilot token exchange returned no token. Is your GitHub Copilot subscription active?');
  }

  // expires_at can be in seconds or ms
  let expiresAt = data.expires_at ?? 0;
  if (expiresAt > 0 && expiresAt < 10_000_000_000) {
    expiresAt = expiresAt * 1000; // convert seconds → ms
  }

  const baseUrl = deriveCopilotBaseUrl(data.token);

  const cached: CachedCopilotToken = {
    token: data.token,
    expiresAt,
    baseUrl,
    updatedAt: Date.now(),
  };
  writeCachedToken(cached);
  return cached;
}

// --- Resolve Copilot API token (with cache) ---

async function resolveCopilotToken(githubToken: string): Promise<CachedCopilotToken> {
  const cached = readCachedToken();
  if (cached && (cached.expiresAt - Date.now()) > TOKEN_SAFETY_MARGIN_MS) {
    return cached;
  }
  return exchangeGitHubTokenForCopilot(githubToken);
}

// --- Device code login ---

export async function loginWithDeviceCode(): Promise<{ token: string; user_code: string; verification_uri: string }> {
  // Step 1: request device code
  const codeRes = await fetch(DEVICE_CODE_URL, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: `client_id=${CLIENT_ID}&scope=read:user`,
  });
  if (!codeRes.ok) {
    throw new Error(`Device code request failed: ${codeRes.status}`);
  }
  const codeData = await codeRes.json() as DeviceCodeResponse;

  console.log(`\nOpen this URL: ${codeData.verification_uri}`);
  console.log(`Enter code: ${codeData.user_code}\n`);

  // Step 2: poll for access token
  const pollInterval = (codeData.interval || 5) * 1000;
  const expiresAt = Date.now() + (codeData.expires_in || 900) * 1000;
  let currentInterval = pollInterval;

  while (Date.now() < expiresAt) {
    await new Promise((resolve) => setTimeout(resolve, currentInterval));

    const tokenRes = await fetch(ACCESS_TOKEN_URL, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: `client_id=${CLIENT_ID}&device_code=${codeData.device_code}&grant_type=urn:ietf:params:oauth:grant-type:device_code`,
    });

    const tokenData = await tokenRes.json() as {
      access_token?: string;
      error?: string;
    };

    if (tokenData.access_token) {
      return {
        token: tokenData.access_token,
        user_code: codeData.user_code,
        verification_uri: codeData.verification_uri,
      };
    }

    if (tokenData.error === 'authorization_pending') {
      continue;
    }
    if (tokenData.error === 'slow_down') {
      currentInterval += 2000;
      continue;
    }
    if (tokenData.error === 'expired_token') {
      throw new Error('Device code expired. Please try again.');
    }
    if (tokenData.error === 'access_denied') {
      throw new Error('Authorization denied by user.');
    }
    // Unknown error — keep polling
  }

  throw new Error('Device code flow timed out.');
}

// --- Resolve GitHub token from config or environment ---

function resolveGitHubToken(config: ProviderConfig): string {
  // Priority: config apiKey > env vars
  if (config.apiKey) return config.apiKey;
  return process.env.COPILOT_GITHUB_TOKEN
    || process.env.GH_TOKEN
    || process.env.GITHUB_TOKEN
    || '';
}

// --- Provider implementation ---

export class GitHubCopilotProvider implements Provider {
  name = 'GitHub Copilot';
  private githubToken: string;

  constructor(config: ProviderConfig) {
    this.githubToken = resolveGitHubToken(config);
    if (config.name) {
      this.name = config.name;
    }
  }

  private async getAuthHeaders(): Promise<{ headers: Record<string, string>; baseUrl: string }> {
    if (!this.githubToken) {
      throw new Error(
        'No GitHub token configured. Run `foxfang copilot login` or set COPILOT_GITHUB_TOKEN / GH_TOKEN env var.',
      );
    }
    const copilot = await resolveCopilotToken(this.githubToken);
    return {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${copilot.token}`,
        'Editor-Version': 'vscode/1.95.0',
        'Editor-Plugin-Version': 'copilot/1.250.0',
        'Copilot-Integration-Id': 'vscode-chat',
        'Openai-Intent': 'conversation-panel',
      },
      baseUrl: copilot.baseUrl,
    };
  }

  async chat(request: ChatRequest): Promise<ChatResponse> {
    const { headers, baseUrl } = await this.getAuthHeaders();
    const url = `${baseUrl}/chat/completions`;

    const body: Record<string, any> = {
      model: request.model || 'gpt-4o',
      messages: request.messages,
      max_tokens: 4096,
    };

    if (request.tools && request.tools.length > 0) {
      body.tools = request.tools.map((t) => ({
        type: 'function',
        function: {
          name: t.name,
          description: t.description,
          parameters: t.parameters,
        },
      }));
    }

    console.log(`[${this.name}] Calling ${url} with model=${body.model}`);

    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`GitHub Copilot API error (${res.status}): ${errText}`);
    }

    const data = await res.json() as {
      choices?: Array<{
        message?: {
          content?: string;
          tool_calls?: Array<{
            function: { name: string; arguments: string };
          }>;
        };
      }>;
      usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
    };

    const choice = data.choices?.[0]?.message;
    const toolCalls = choice?.tool_calls?.map((tc) => ({
      name: tc.function.name,
      arguments: (() => {
        try { return JSON.parse(tc.function.arguments); } catch { return {}; }
      })(),
    }));

    return {
      content: choice?.content || '',
      toolCalls: toolCalls?.length ? toolCalls : undefined,
      usage: data.usage
        ? {
            promptTokens: data.usage.prompt_tokens,
            completionTokens: data.usage.completion_tokens,
            totalTokens: data.usage.total_tokens,
          }
        : undefined,
    };
  }

  async *chatStream(request: ChatRequest): AsyncIterable<StreamChunk> {
    const { headers, baseUrl } = await this.getAuthHeaders();
    const url = `${baseUrl}/chat/completions`;

    const body: Record<string, any> = {
      model: request.model || 'gpt-4o',
      messages: request.messages,
      max_tokens: 4096,
      stream: true,
    };

    if (request.tools && request.tools.length > 0) {
      body.tools = request.tools.map((t) => ({
        type: 'function',
        function: {
          name: t.name,
          description: t.description,
          parameters: t.parameters,
        },
      }));
    }

    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`GitHub Copilot stream error (${res.status}): ${errText}`);
    }

    if (!res.body) {
      throw new Error('No response body for stream');
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data: ')) continue;
        const payload = trimmed.slice(6);
        if (payload === '[DONE]') return;

        try {
          const parsed = JSON.parse(payload);
          const delta = parsed.choices?.[0]?.delta;
          if (!delta) continue;

          if (delta.content) {
            yield { type: 'content', content: delta.content };
          }
          if (delta.tool_calls?.[0]?.function?.name) {
            yield {
              type: 'tool_call',
              tool: delta.tool_calls[0].function.name,
              args: delta.tool_calls[0].function.arguments,
            };
          }
        } catch { /* skip malformed chunks */ }
      }
    }
  }

  async getStatus(): Promise<{ healthy: boolean; error?: string }> {
    try {
      if (!this.githubToken) {
        return { healthy: false, error: 'No GitHub token configured' };
      }
      await resolveCopilotToken(this.githubToken);
      return { healthy: true };
    } catch (error) {
      return {
        healthy: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}
