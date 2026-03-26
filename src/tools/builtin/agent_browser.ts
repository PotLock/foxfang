/**
 * Agent Browser Tool
 *
 * Uses vercel-labs/agent-browser CLI to drive a real browser when static crawling
 * is not enough (JS-rendered content, interaction-required pages, dynamic layouts).
 */

import { spawn } from 'child_process';
import { Tool, ToolCategory, ToolResult } from '../traits';

const DEFAULT_STEP_TIMEOUT_MS = 60_000;
const MAX_STEP_TIMEOUT_MS = 180_000;
const MAX_OUTPUT_CHARS = 80_000;

type AgentBrowserRunner = {
  command: string;
  prefixArgs: string[];
  label: string;
};

type AgentBrowserCommandStep = {
  command: string;
  args?: string[];
  json?: boolean;
  allowFailure?: boolean;
};

type AgentBrowserStepResult = {
  step: AgentBrowserCommandStep;
  ok: boolean;
  exitCode: number | null;
  timedOut: boolean;
  stdout: string;
  stderr: string;
  parsed?: any;
};

const RUNNER_CANDIDATES: AgentBrowserRunner[] = [
  { command: 'agent-browser', prefixArgs: [], label: 'agent-browser' },
  { command: 'pnpm', prefixArgs: ['exec', 'agent-browser'], label: 'pnpm exec agent-browser' },
];

function boundedTimeout(timeoutMs?: number): number {
  const value = Math.floor(Number(timeoutMs || DEFAULT_STEP_TIMEOUT_MS));
  if (!Number.isFinite(value) || value <= 0) {
    return DEFAULT_STEP_TIMEOUT_MS;
  }
  return Math.min(value, MAX_STEP_TIMEOUT_MS);
}

function truncate(text: string, maxChars = MAX_OUTPUT_CHARS): string {
  const value = String(text || '');
  if (value.length <= maxChars) return value;
  return `${value.slice(0, maxChars)}\n...[truncated ${value.length - maxChars} chars]`;
}

function parseJsonLoose(input: string): any | undefined {
  const text = String(input || '').trim();
  if (!text) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    // Try to recover when logs are printed around JSON.
  }

  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start >= 0 && end > start) {
    const candidate = text.slice(start, end + 1);
    try {
      return JSON.parse(candidate);
    } catch {
      return undefined;
    }
  }

  return undefined;
}

async function runProcess(
  command: string,
  args: string[],
  timeoutMs: number,
): Promise<{ ok: boolean; exitCode: number | null; timedOut: boolean; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: false,
    });

    let stdout = '';
    let stderr = '';
    let settled = false;
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      try {
        child.kill('SIGTERM');
      } catch {
        // ignore
      }
      setTimeout(() => {
        if (!settled) {
          try {
            child.kill('SIGKILL');
          } catch {
            // ignore
          }
        }
      }, 2500);
    }, timeoutMs);

    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf8');
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8');
    });

    child.on('error', (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      const message = error instanceof Error ? error.message : String(error);
      resolve({
        ok: false,
        exitCode: null,
        timedOut: false,
        stdout,
        stderr: `${stderr}\n${message}`.trim(),
      });
    });

    child.on('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({
        ok: !timedOut && code === 0,
        exitCode: code,
        timedOut,
        stdout,
        stderr,
      });
    });
  });
}

async function detectRunner(): Promise<AgentBrowserRunner | null> {
  for (const runner of RUNNER_CANDIDATES) {
    const probe = await runProcess(
      runner.command,
      [...runner.prefixArgs, '--help'],
      10_000,
    );
    if (probe.ok || /agent-browser/i.test(`${probe.stdout}\n${probe.stderr}`)) {
      return runner;
    }
  }
  return null;
}

function normalizeStep(value: any): AgentBrowserCommandStep | null {
  const command = String(value?.command || '').trim();
  if (!command) return null;

  const args = Array.isArray(value?.args)
    ? value.args.map((item: any) => String(item)).filter((item: string) => item.length > 0)
    : [];

  return {
    command,
    args,
    json: value?.json !== false,
    allowFailure: value?.allowFailure === true,
  };
}

function buildReadSteps(args: {
  url: string;
  selector?: string;
  interactiveOnly?: boolean;
  compact?: boolean;
  depth?: number;
  includeScreenshot?: boolean;
  waitForNetworkIdle?: boolean;
  close?: boolean;
}): AgentBrowserCommandStep[] {
  const steps: AgentBrowserCommandStep[] = [];
  const depth = Math.max(1, Math.min(Math.floor(Number(args.depth || 8)), 20));
  const explicitSelector = String(args.selector || '').trim();
  const selector = explicitSelector || '';

  steps.push({ command: 'open', args: [args.url], json: true });

  if (args.waitForNetworkIdle !== false) {
    steps.push({
      command: 'wait',
      args: ['--load', 'networkidle'],
      json: true,
      allowFailure: true,
    });
  }

  const snapshotArgs: string[] = [];
  if (args.interactiveOnly === true) snapshotArgs.push('-i');
  if (args.compact !== false) snapshotArgs.push('-c');
  snapshotArgs.push('-d', String(depth));
  if (selector) snapshotArgs.push('-s', selector);
  steps.push({
    command: 'snapshot',
    args: snapshotArgs,
    json: true,
    allowFailure: false,
  });

  if (selector) {
    steps.push({
      command: 'get',
      args: ['text', selector],
      json: true,
      allowFailure: true,
    });
  }

  if (args.includeScreenshot !== false) {
    steps.push({
      command: 'screenshot',
      args: [],
      json: true,
      allowFailure: true,
    });
  }

  if (args.close !== false) {
    steps.push({ command: 'close', args: [], json: true, allowFailure: true });
  }

  return steps;
}

async function runStep(
  runner: AgentBrowserRunner,
  session: string,
  timeoutMs: number,
  step: AgentBrowserCommandStep,
): Promise<AgentBrowserStepResult> {
  const args = [
    ...runner.prefixArgs,
    '--session',
    session,
    step.command,
    ...(step.args || []),
    ...(step.json === false ? [] : ['--json']),
  ];

  const result = await runProcess(runner.command, args, timeoutMs);
  return {
    step,
    ok: result.ok,
    exitCode: result.exitCode,
    timedOut: result.timedOut,
    stdout: truncate(result.stdout),
    stderr: truncate(result.stderr),
    parsed: parseJsonLoose(result.stdout),
  };
}

function formatStepOutput(index: number, result: AgentBrowserStepResult): string {
  const header = `${index + 1}. ${result.step.command} ${result.step.args?.join(' ') || ''}`.trim();
  const status = result.ok ? 'ok' : (result.timedOut ? 'timeout' : `failed (${String(result.exitCode)})`);
  const stdout = result.stdout?.trim() ? `stdout:\n${result.stdout.trim()}` : 'stdout: (empty)';
  const stderr = result.stderr?.trim() ? `stderr:\n${result.stderr.trim()}` : 'stderr: (empty)';
  return `${header}\nstatus: ${status}\n${stdout}\n${stderr}`;
}

function summarizeStepForLog(step: AgentBrowserCommandStep): string {
  const args = Array.isArray(step.args) ? step.args : [];
  const preview = [step.command, ...args].join(' ').replace(/\s+/g, ' ').trim();
  if (preview.length <= 160) return preview;
  return `${preview.slice(0, 160)}...`;
}

function extractScreenshotPath(result?: AgentBrowserStepResult): string | undefined {
  if (!result) return undefined;
  const parsed = result.parsed;

  if (parsed && typeof parsed === 'object') {
    const obj = parsed as Record<string, unknown>;
    const candidates = [
      obj.path,
      obj.filePath,
      obj.screenshotPath,
      (obj.screenshot && typeof obj.screenshot === 'object') ? (obj.screenshot as Record<string, unknown>).path : undefined,
      (obj.data && typeof obj.data === 'object') ? (obj.data as Record<string, unknown>).path : undefined,
    ];
    for (const candidate of candidates) {
      const value = String(candidate || '').trim();
      if (value) return value;
    }
  }

  const output = `${result.stdout || ''}\n${result.stderr || ''}`;
  const match = output.match(/(\/[^\s"'`]+?\.(?:png|jpe?g|webp))/i);
  return match?.[1]?.trim();
}

export class AgentBrowserTool implements Tool {
  name = 'agent_browser';
  description = 'Control a real browser via vercel-labs/agent-browser (Chromium/Playwright). Use when fetch_url/firecrawl miss JS-rendered or interaction-required content. Supports read mode (open + snapshot + optional selector text + screenshot) and script mode (custom command steps decided by the agent).';
  category = ToolCategory.EXTERNAL;
  parameters = {
    type: 'object' as const,
    properties: {
      mode: {
        type: 'string',
        description: 'Mode: "read" (default) or "script".',
      },
      url: {
        type: 'string',
        description: 'Target URL for read mode.',
      },
      goal: {
        type: 'string',
        description: 'Optional human objective for the run (context for the model; not interpreted by the tool wrapper).',
      },
      selector: {
        type: 'string',
        description: 'Optional CSS selector to scope snapshot and extract text.',
      },
      interactiveOnly: {
        type: 'boolean',
        description: 'Read mode: snapshot interactive elements only (-i).',
      },
      compact: {
        type: 'boolean',
        description: 'Read mode: compact snapshot output (-c). Default true.',
      },
      depth: {
        type: 'number',
        description: 'Read mode: snapshot depth (1-20, default 8).',
      },
      includeScreenshot: {
        type: 'boolean',
        description: 'Read mode: capture a screenshot and return its path (default true).',
      },
      waitForNetworkIdle: {
        type: 'boolean',
        description: 'Read mode: wait for networkidle after open (default true).',
      },
      close: {
        type: 'boolean',
        description: 'Close browser session at end (default true).',
      },
      session: {
        type: 'string',
        description: 'Session name for agent-browser isolation (default: "foxfang").',
      },
      timeoutMs: {
        type: 'number',
        description: 'Per-step timeout in ms (default 60000, max 180000).',
      },
      commands: {
        type: 'array',
        description: 'Script mode: array of steps, each step = { command, args?, json?, allowFailure? }.',
      },
    },
    required: [],
  };

  async execute(args: any): Promise<ToolResult> {
    const mode = String(args?.mode || 'read').trim().toLowerCase();
    const session = String(args?.session || 'foxfang').trim() || 'foxfang';
    const timeoutMs = boundedTimeout(args?.timeoutMs);

    const runner = await detectRunner();
    if (!runner) {
      return {
        success: false,
        error: 'agent-browser CLI is not available. Install it first: npm install -g agent-browser && agent-browser install --with-deps',
      };
    }

    let steps: AgentBrowserCommandStep[] = [];
    if (mode === 'script') {
      if (!Array.isArray(args?.commands) || args.commands.length === 0) {
        return {
          success: false,
          error: 'Script mode requires non-empty commands array.',
        };
      }
      steps = args.commands
        .map((item: any) => normalizeStep(item))
        .filter(Boolean) as AgentBrowserCommandStep[];
      if (steps.length === 0) {
        return {
          success: false,
          error: 'No valid commands found. Each command must include a non-empty "command" field.',
        };
      }
    } else {
      const url = String(args?.url || '').trim();
      if (!url) {
        return { success: false, error: 'Read mode requires "url".' };
      }
      steps = buildReadSteps({
        url,
        selector: args?.selector,
        interactiveOnly: args?.interactiveOnly,
        compact: args?.compact,
        depth: args?.depth,
        includeScreenshot: args?.includeScreenshot,
        waitForNetworkIdle: args?.waitForNetworkIdle,
        close: args?.close,
      });
    }

    const results: AgentBrowserStepResult[] = [];
    for (const step of steps) {
      const startedAt = Date.now();
      console.log(`[AgentBrowserTool] ▶ ${summarizeStepForLog(step)}`);
      const result = await runStep(runner, session, timeoutMs, step);
      const elapsedMs = Date.now() - startedAt;
      if (result.ok) {
        console.log(`[AgentBrowserTool] ✅ ${step.command} ${elapsedMs}ms`);
      } else {
        const reason = result.timedOut
          ? 'timeout'
          : `exit=${String(result.exitCode)} ${String(result.stderr || '').replace(/\s+/g, ' ').trim() || 'failed'}`;
        const preview = reason.length > 200 ? `${reason.slice(0, 200)}...` : reason;
        console.log(`[AgentBrowserTool] ❌ ${step.command} ${elapsedMs}ms ${preview}`);
      }
      results.push(result);
      if (!result.ok && !step.allowFailure) {
        return {
          success: false,
          error: `agent-browser step failed: ${step.command}`,
          output: formatStepOutput(results.length - 1, result),
          data: {
            runner: runner.label,
            session,
            steps: results.map((item, idx) => ({
              index: idx,
              command: item.step.command,
              args: item.step.args || [],
              ok: item.ok,
              exitCode: item.exitCode,
              timedOut: item.timedOut,
              parsed: item.parsed,
            })),
          },
        };
      }
    }

    const snapshot = results.find((item) => item.step.command === 'snapshot');
    const screenshotResult = results.find((item) => item.step.command === 'screenshot');
    const focusResults = results.filter((item) => item.step.command === 'find');
    const selectorResults = results.filter((item) => item.step.command === 'get');
    const focusResult = focusResults.length > 0 ? focusResults[focusResults.length - 1] : undefined;
    const selectorResult = selectorResults.length > 0 ? selectorResults[selectorResults.length - 1] : undefined;
    const screenshotPath = extractScreenshotPath(screenshotResult);
    const mediaUrls = screenshotPath ? [screenshotPath] : [];

    const outputParts = [
      `agent-browser run completed via ${runner.label} (session: ${session}).`,
      ...(screenshotPath ? [`MEDIA:${screenshotPath}`] : []),
      ...results.map((result, idx) => formatStepOutput(idx, result)),
    ];

    return {
      success: true,
      output: outputParts.join('\n\n'),
      data: {
        runner: runner.label,
        session,
        mode,
        snapshot: snapshot?.parsed || snapshot?.stdout || '',
        screenshot: screenshotResult?.parsed || screenshotResult?.stdout || '',
        screenshotPath: screenshotPath || '',
        mediaUrls,
        focus: focusResult?.parsed || focusResult?.stdout || '',
        selectorText: selectorResult?.parsed || selectorResult?.stdout || '',
        selectorTextAll: selectorResults.map((item) => item.parsed || item.stdout || ''),
        steps: results.map((item, idx) => ({
          index: idx,
          command: item.step.command,
          args: item.step.args || [],
          ok: item.ok,
          exitCode: item.exitCode,
          timedOut: item.timedOut,
          parsed: item.parsed,
        })),
      },
    };
  }
}
