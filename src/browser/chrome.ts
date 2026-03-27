/**
 * Chrome Launcher
 * 
 * Launch and manage Chrome/Chromium browser instances
 */

import { spawn, type ChildProcess } from 'child_process';
import { mkdirSync, existsSync } from 'fs';
import path from 'path';
import type { BrowserRuntime } from './types';

export interface LaunchChromeOptions {
  executablePath?: string;
  userDataDir: string;
  headless?: boolean;
  port?: number;
  extraArgs?: string[];
}

export interface LaunchedChrome {
  process: ChildProcess;
  cdpPort: number;
  cdpUrl: string;
  pid: number;
}

const DEFAULT_CDP_PORT = 9222;

export async function launchChrome(options: LaunchChromeOptions): Promise<LaunchedChrome> {
  const {
    executablePath,
    userDataDir,
    headless = true,
    port = DEFAULT_CDP_PORT,
    extraArgs = [],
  } = options;

  // Ensure user data directory exists
  try {
    mkdirSync(userDataDir, { recursive: true });
  } catch {
    // Directory might already exist
  }

  const cdpUrl = `http://localhost:${port}`;

  const args: string[] = [
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${userDataDir}`,
    '--no-first-run',
    '--no-default-browser-check',
    ...(headless ? ['--headless=new'] : []),
    ...extraArgs,
  ];

  // Try to find Chrome/Chromium executable
  const chromeExecutable = await findChromeExecutable(executablePath);

  const chromeProcess = spawn(chromeExecutable, args, {
    detached: false,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  // Handle spawn failures (e.g., ENOENT) to avoid crashing on unhandled error events.
  let spawnError: Error | null = null;
  const onSpawnError = (error: Error) => {
    spawnError = error;
  };
  const getSpawnError = () => spawnError;
  chromeProcess.on('error', onSpawnError);

  // Give spawn a brief moment to surface immediate launch errors.
  await new Promise((resolve) => setTimeout(resolve, 100));

  const earlySpawnError = getSpawnError();
  if (earlySpawnError) {
    throw new Error(`Failed to launch browser "${chromeExecutable}": ${earlySpawnError.message}`);
  }

  if (!chromeProcess.pid) {
    throw new Error(`Failed to launch browser "${chromeExecutable}": no PID`);
  }

  // Wait a bit for Chrome to start
  await new Promise((resolve) => setTimeout(resolve, 1900));

  const startupSpawnError = getSpawnError();
  if (startupSpawnError) {
    throw new Error(`Failed to launch browser "${chromeExecutable}": ${startupSpawnError.message}`);
  }

  // Check if process is still running
  if (chromeProcess.exitCode !== null) {
    throw new Error(`Chrome exited immediately with code ${chromeProcess.exitCode}`);
  }

  // Clean up bootstrap error listener after successful start.
  chromeProcess.off('error', onSpawnError);

  return {
    process: chromeProcess,
    cdpPort: port,
    cdpUrl,
    pid: chromeProcess.pid,
  };
}

export async function stopChrome(launched: LaunchedChrome | BrowserRuntime): Promise<void> {
  const process = 'process' in launched ? launched.process : undefined;
  
  if (!process) {
    return;
  }

  // Try graceful shutdown first
  process.kill('SIGTERM');

  // Wait up to 5 seconds for graceful shutdown
  await new Promise((resolve) => setTimeout(resolve, 5000));

  // Force kill if still running
  if (process.exitCode === null) {
    process.kill('SIGKILL');
  }
}

async function findChromeExecutable(preferred?: string): Promise<string> {
  if (preferred) {
    if (await isExecutableAvailable(preferred)) {
      return preferred;
    }
    throw new Error(`Configured browser executable not found: ${preferred}`);
  }

  // Platform-specific defaults
  const platform = process.platform;
  const candidates: string[] = [];

  if (platform === 'darwin') {
    candidates.push(
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
      '/Applications/Chromium.app/Contents/MacOS/Chromium',
      '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
      '/usr/bin/chromium',
      '/usr/bin/chromium-browser',
      '/usr/bin/google-chrome',
    );
  } else if (platform === 'linux') {
    candidates.push(
      '/usr/bin/chromium',
      '/usr/bin/chromium-browser',
      '/usr/bin/google-chrome',
      '/usr/bin/google-chrome-stable',
      '/usr/bin/brave-browser',
      '/usr/bin/brave-browser-stable',
      '/usr/bin/microsoft-edge',
      '/usr/bin/microsoft-edge-stable',
      '/snap/bin/chromium',
      '/snap/bin/brave',
    );
  } else if (platform === 'win32') {
    candidates.push(
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe',
      'C:\\Program Files (x86)\\BraveSoftware\\Brave-Browser\\Application\\brave.exe',
      'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    );
  }

  // Add generic names to try
  candidates.push(
    'google-chrome',
    'google-chrome-stable',
    'brave-browser',
    'microsoft-edge',
    'chromium',
    'chromium-browser',
    'chrome',
    'msedge'
  );

  for (const candidate of candidates) {
    if (await isExecutableAvailable(candidate)) {
      return candidate;
    }
  }

  // Fall back to Playwright-managed Chromium if available.
  try {
    const { chromium } = await import('playwright');
    const playwrightChromium = chromium.executablePath();
    if (playwrightChromium && existsSync(playwrightChromium)) {
      return playwrightChromium;
    }
  } catch {
    // Ignore; will throw the explicit error below.
  }

  throw new Error(
    'No supported browser executable found. Install Chrome/Chromium/Brave/Edge or set browser.executablePath in config.'
  );
}

async function isExecutableAvailable(candidate: string): Promise<boolean> {
  if (!candidate.trim()) {
    return false;
  }

  // Treat absolute/relative paths as file paths, otherwise as command names.
  if (path.isAbsolute(candidate) || candidate.includes('/') || candidate.includes('\\')) {
    return existsSync(candidate);
  }

  const { execSync } = await import('child_process');
  const lookupCmd = process.platform === 'win32' ? 'where' : 'which';
  try {
    execSync(`${lookupCmd} "${candidate}"`, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

export function isChromeRunning(runtime: BrowserRuntime): boolean {
  if (!runtime.process) {
    return false;
  }
  
  return runtime.process.exitCode === null;
}
