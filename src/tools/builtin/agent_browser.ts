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
  const rawCommand = String(value?.command || '').trim();
  if (!rawCommand) return null;

  let command = rawCommand.toLowerCase().replace(/\s+/g, ' ').trim();
  const rawArgs = value?.args;
  const args = Array.isArray(rawArgs)
    ? rawArgs.map((item: any) => String(item)).filter((item: string) => item.length > 0)
    : typeof rawArgs === 'string' || typeof rawArgs === 'number' || typeof rawArgs === 'boolean'
      ? [String(rawArgs)]
      : [];
  let normalizedArgs = [...args];
  if (command.includes(' ')) {
    const [head, ...tail] = command.split(' ').map((item) => item.trim()).filter(Boolean);
    if (head) {
      command = head;
      if (normalizedArgs.length === 0 && tail.length > 0) {
        normalizedArgs = [...tail];
      }
    }
  }
  if (normalizedArgs.length === 0 && rawArgs && typeof rawArgs === 'object' && !Array.isArray(rawArgs)) {
    const obj = rawArgs as Record<string, unknown>;
    const candidateKeys = ['url', 'selector', 'text', 'value', 'target', 'query'];
    for (const key of candidateKeys) {
      const value = obj[key];
      if (typeof value === 'string' && value.trim()) {
        normalizedArgs.push(value.trim());
        break;
      }
    }
  }
  if (normalizedArgs.length === 0 && typeof value?.url === 'string' && value.url.trim()) {
    normalizedArgs.push(value.url.trim());
  }
  const hasExplicitAllowFailure = value?.allowFailure !== undefined;
  let allowFailure = hasExplicitAllowFailure ? value?.allowFailure === true : false;

  // Generic command aliases from common browser-agent vocabularies.
  if (command === 'goto' || command === 'navigate') {
    command = 'open';
  } else if (command === 'evaluate') {
    command = 'eval';
  }

  if (command === 'get_snapshot' || command === 'getsnapshot') {
    command = 'snapshot';
  }

  const getAliasMatch = command.match(/^get(?:[_\s-]+)(text|html|value|attr)$/);
  if (getAliasMatch) {
    command = 'get';
    normalizedArgs = [getAliasMatch[1], ...normalizedArgs];
  } else if (command === 'gettext') {
    command = 'get';
    normalizedArgs = ['text', ...normalizedArgs];
  } else if (command === 'gethtml') {
    command = 'get';
    normalizedArgs = ['html', ...normalizedArgs];
  }
  if (command === 'get' && String(normalizedArgs[0] || '').toLowerCase() === 'snapshot') {
    command = 'snapshot';
    normalizedArgs = normalizedArgs.slice(1);
  }

  // Normalize shorthand wait forms: wait networkidle -> wait --load networkidle
  if (command === 'wait' && normalizedArgs.length === 1) {
    const only = normalizedArgs[0].toLowerCase();
    if (only === 'networkidle' || only === 'load' || only === 'domcontentloaded') {
      normalizedArgs = ['--load', only];
      if (value?.allowFailure === undefined) allowFailure = true;
    }
  }

  // Normalize common scroll shorthand variants.
  if (command === 'scroll') {
    const arg0 = String(normalizedArgs[0] || '').trim().toLowerCase();
    const arg1 = String(normalizedArgs[1] || '').trim();
    const toSteps = (value: string): string[] => {
      const numeric = Number(value);
      if (!Number.isFinite(numeric)) return ['down', '1200'];
      const absPx = Math.max(1, Math.round(Math.abs(numeric)));
      return [numeric >= 0 ? 'down' : 'up', String(absPx)];
    };

    if (!arg0) {
      normalizedArgs = ['down', '1200'];
    } else if (arg0 === 'bottom') {
      normalizedArgs = ['down', '20000'];
    } else if (arg0 === 'top') {
      normalizedArgs = ['up', '20000'];
    } else if ((arg0 === 'y' || arg0 === 'vertical') && arg1) {
      normalizedArgs = toSteps(arg1);
    } else if (/^-?\d+(?:\.\d+)?$/.test(arg0)) {
      normalizedArgs = toSteps(arg0);
    } else if (arg0 === 'up' || arg0 === 'down' || arg0 === 'left' || arg0 === 'right') {
      normalizedArgs = [arg0, arg1 || '1200'];
    }
  }

  if (
    command === 'wait' &&
    normalizedArgs.length >= 2 &&
    normalizedArgs[0] === '--load' &&
    normalizedArgs[1].toLowerCase() === 'networkidle' &&
    value?.allowFailure === undefined
  ) {
    allowFailure = true;
  }

  if (command === 'get') {
    const op = String(normalizedArgs[0] || '').toLowerCase();
    const selectorRequiredOps = new Set(['text', 'html', 'value', 'count', 'box', 'styles']);
    if (!op) {
      normalizedArgs = ['text', 'body'];
    } else if (selectorRequiredOps.has(op) && normalizedArgs.length === 1) {
      // Model sometimes emits "get text" without selector.
      normalizedArgs = [op, 'body'];
    }
    if (value?.allowFailure === undefined) {
      allowFailure = true;
    }
  }

  if (
    command === 'get' &&
    normalizedArgs.length >= 2 &&
    normalizedArgs[0].toLowerCase() === 'text' &&
    value?.allowFailure === undefined
  ) {
    allowFailure = true;
  }

  if (!hasExplicitAllowFailure) {
    if (
      command === 'find' ||
      command === 'get' ||
      command === 'wait' ||
      command === 'click' ||
      command === 'focus' ||
      command === 'hover' ||
      command === 'scroll' ||
      command === 'scrollintoview' ||
      command === 'snapshot'
    ) {
      allowFailure = true;
    }
  }

  return {
    command,
    args: normalizedArgs,
    json: value?.json !== false,
    allowFailure,
  };
}

function buildReadSteps(args: {
  url: string;
  selector?: string;
  interactiveOnly?: boolean;
  compact?: boolean;
  depth?: number;
  includeText?: boolean;
  includeScreenshot?: boolean;
  waitForNetworkIdle?: boolean;
  close?: boolean;
}): AgentBrowserCommandStep[] {
  const steps: AgentBrowserCommandStep[] = [];
  const depth = Math.max(1, Math.min(Math.floor(Number(args.depth || 8)), 20));
  const explicitSelector = String(args.selector || '').trim();
  const selector = explicitSelector || '';

  steps.push({ command: 'open', args: [args.url], json: true });

  // Read mode is intentionally minimal:
  // open + snapshot by default. Extra steps must be explicitly requested.
  if (args.waitForNetworkIdle === true) {
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

  if (selector && args.includeText === true) {
    steps.push({
      command: 'get',
      args: ['text', selector],
      json: true,
      allowFailure: true,
    });
  }

  if (args.includeScreenshot === true) {
    if (selector) {
      steps.push({
        command: 'scrollintoview',
        args: [selector],
        json: true,
        allowFailure: true,
      });
    }
    steps.push({
      command: 'screenshot',
      args: [],
      json: true,
      allowFailure: true,
    });
  }

  if (args.close === true) {
    steps.push({ command: 'close', args: [], json: true, allowFailure: true });
  }

  return steps;
}

function findSnapshotScopedSelector(steps: AgentBrowserCommandStep[]): string | undefined {
  for (const step of steps) {
    if (step.command !== 'snapshot' || !Array.isArray(step.args)) continue;
    const idx = step.args.findIndex((arg) => arg === '-s' || arg === '--selector');
    if (idx >= 0) {
      const candidate = String(step.args[idx + 1] || '').trim();
      if (candidate) return candidate;
    }
  }
  return undefined;
}

function findGetSelector(steps: AgentBrowserCommandStep[]): string | undefined {
  for (const step of steps) {
    if (step.command !== 'get' || !Array.isArray(step.args) || step.args.length < 2) continue;
    const op = String(step.args[0] || '').toLowerCase();
    if (op === 'text' || op === 'html' || op === 'value' || op === 'count' || op === 'box' || op === 'styles') {
      const selector = String(step.args[1] || '').trim();
      if (selector) return selector;
    }
    if (op === 'attr' && step.args.length >= 3) {
      const selector = String(step.args[1] || '').trim();
      if (selector) return selector;
    }
  }
  return undefined;
}

function inferScreenshotTargetSelector(steps: AgentBrowserCommandStep[]): string | undefined {
  // Prefer explicit snapshot scope, then fallback to selector used in "get" steps.
  return findSnapshotScopedSelector(steps) || findGetSelector(steps);
}

function ensureScreenshotStep(steps: AgentBrowserCommandStep[], includeScreenshot: boolean): AgentBrowserCommandStep[] {
  if (!includeScreenshot) return steps;
  const selector = inferScreenshotTargetSelector(steps);
  const hasScreenshot = steps.some((step) => step.command === 'screenshot');
  const hasScrollIntoView = selector
    ? steps.some((step) => step.command === 'scrollintoview' && String(step.args?.[0] || '').trim() === selector)
    : false;

  if (hasScreenshot && (!selector || hasScrollIntoView)) return steps;

  const scrollStep: AgentBrowserCommandStep | null = selector
    ? {
      command: 'scrollintoview',
      args: [selector],
      json: true,
      allowFailure: true,
    }
    : null;

  const screenshotStep: AgentBrowserCommandStep = {
    command: 'screenshot',
    args: [],
    json: true,
    allowFailure: true,
  };

  if (!hasScreenshot) {
    const closeIndex = steps.findIndex((step) => step.command === 'close');
    if (closeIndex < 0) {
      return scrollStep ? [...steps, scrollStep, screenshotStep] : [...steps, screenshotStep];
    }
    return [
      ...steps.slice(0, closeIndex),
      ...(scrollStep ? [scrollStep] : []),
      screenshotStep,
      ...steps.slice(closeIndex),
    ];
  }

  const firstScreenshotIndex = steps.findIndex((step) => step.command === 'screenshot');
  if (firstScreenshotIndex < 0 || !scrollStep) return steps;
  return [
    ...steps.slice(0, firstScreenshotIndex),
    scrollStep,
    ...steps.slice(firstScreenshotIndex),
  ];
}

async function runStep(
  runner: AgentBrowserRunner,
  session: string,
  timeoutMs: number,
  step: AgentBrowserCommandStep,
): Promise<AgentBrowserStepResult> {
  const stepTimeoutMs =
    step.command === 'wait' && Array.isArray(step.args) && step.args[0] === '--load'
      ? Math.min(timeoutMs, 20_000)
      : timeoutMs;
  const args = [
    ...runner.prefixArgs,
    '--session',
    session,
    step.command,
    ...(step.args || []),
    ...(step.json === false ? [] : ['--json']),
  ];

  const result = await runProcess(runner.command, args, stepTimeoutMs);
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
  description = 'Primary tool for visual webpage tasks. Control a real browser via vercel-labs/agent-browser (Chromium/Playwright) to inspect footer/header/nav/button text, what is visible on the page, scrolling, clicking, and JS-rendered content. Prefer this before fetch_url/firecrawl for interactive or layout-dependent tasks. Supports read mode (open + snapshot + optional selector text + screenshot) and script mode (custom command steps decided by the agent).';
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
        description: 'Capture screenshot (default true). In script mode, an automatic screenshot step is appended if none exists.',
      },
      includeText: {
        type: 'boolean',
        description: 'Read mode: when selector is provided, also run get text <selector> (default false).',
      },
      waitForNetworkIdle: {
        type: 'boolean',
        description: 'Read mode: wait for networkidle after open (default false).',
      },
      close: {
        type: 'boolean',
        description: 'Close browser session at end (default false, keep session alive for follow-up script commands).',
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
    const includeScreenshot = args?.includeScreenshot !== false;

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
        includeText: args?.includeText,
        includeScreenshot,
        waitForNetworkIdle: args?.waitForNetworkIdle,
        close: args?.close,
      });
    }
    steps = ensureScreenshotStep(steps, includeScreenshot);

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
    const selectorTextResults = selectorResults.filter((item) => String(item.step.args?.[0] || '').toLowerCase() === 'text');
    const selectorHtmlResults = selectorResults.filter((item) => String(item.step.args?.[0] || '').toLowerCase() === 'html');
    const focusResult = focusResults.length > 0 ? focusResults[focusResults.length - 1] : undefined;
    const selectorTextResult = selectorTextResults.length > 0 ? selectorTextResults[selectorTextResults.length - 1] : undefined;
    const selectorHtmlResult = selectorHtmlResults.length > 0 ? selectorHtmlResults[selectorHtmlResults.length - 1] : undefined;
    const screenshotPath = extractScreenshotPath(screenshotResult);
    const mediaUrls = screenshotPath ? [screenshotPath] : [];

    const outputParts = [
      `agent-browser run completed via ${runner.label} (session: ${session}).`,
      ...(mode === 'read' && args?.close !== true ? [`session kept open: ${session}`] : []),
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
        selectorText: selectorTextResult?.parsed || selectorTextResult?.stdout || '',
        selectorTextAll: selectorTextResults.map((item) => item.parsed || item.stdout || ''),
        selectorHtml: selectorHtmlResult?.parsed || selectorHtmlResult?.stdout || '',
        selectorHtmlAll: selectorHtmlResults.map((item) => item.parsed || item.stdout || ''),
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
