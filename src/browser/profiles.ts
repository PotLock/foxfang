/**
 * Profile Management
 * 
 * Manage browser profiles and their runtimes
 */

import type { BrowserConfig, BrowserRuntime, ProfileStatus } from './types';
import { getProfileConfig, getUserDataDir } from './config';
import { launchChrome, stopChrome } from './chrome';

export class ProfileManager {
  private runtimes: Map<string, BrowserRuntime>;
  private config: BrowserConfig;

  constructor(config: BrowserConfig, runtimes?: Map<string, BrowserRuntime>) {
    this.config = config;
    this.runtimes = runtimes || new Map();
  }

  getConfig(): BrowserConfig {
    return this.config;
  }

  updateConfig(config: BrowserConfig): void {
    this.config = config;
  }

  async startProfile(profileName?: string): Promise<BrowserRuntime> {
    const profile = getProfileConfig(this.config, profileName);
    const name = profile.name;

    // Check if already running
    const existing = this.runtimes.get(name);
    if (existing) {
      if (!existing.process || existing.process.exitCode === null) {
        return existing;
      }
      this.runtimes.delete(name);
    }

    const userDataDir = getUserDataDir(this.config, name);
    const cdpPort = Number(profile.cdpPort ?? this.config.cdpPort ?? 18800);
    const controlPort = Number(this.config.port || 0);
    if (Number.isFinite(controlPort) && controlPort > 0 && cdpPort === controlPort) {
      throw new Error(
        `Browser CDP port (${cdpPort}) conflicts with browser control server port (${controlPort}). ` +
        `Set browser.cdpPort or browser.profiles.${name}.cdpPort to a different port.`
      );
    }

    // Launch Chrome with CDP
    const launched = await launchChrome({
      executablePath: profile.executablePath || this.config.executablePath,
      userDataDir,
      headless: profile.headless ?? this.config.headless,
      port: cdpPort,
    });

    // Connect Playwright to the launched Chrome
    const { chromium } = await import('playwright');
    const connectUrl = await resolvePlaywrightConnectUrl(launched.cdpUrl);
    const browser = await chromium.connectOverCDP(connectUrl);
    const context = browser.contexts()[0] || await browser.newContext();

    const runtime: BrowserRuntime = {
      process: launched.process,
      cdpPort: launched.cdpPort,
      cdpUrl: launched.cdpUrl,
      browser,
      context,
      pages: new Map(),
    };

    this.runtimes.set(name, runtime);

    return runtime;
  }

  async stopProfile(profileName?: string): Promise<void> {
    const name = profileName || this.config.defaultProfile;
    const runtime = this.runtimes.get(name);

    if (!runtime) {
      return;
    }

    // Close all pages
    for (const [targetId, session] of runtime.pages) {
      try {
        await session.page.close();
      } catch {
        // Ignore errors when closing
      }
    }
    runtime.pages.clear();

    // Close browser
    if (runtime.browser) {
      try {
        await runtime.browser.close();
      } catch {
        // Ignore errors when closing
      }
    }

    // Stop Chrome process
    if (runtime.process) {
      await stopChrome(runtime);
    }

    this.runtimes.delete(name);
  }

  getRuntime(profileName?: string): BrowserRuntime | undefined {
    const name = profileName || this.config.defaultProfile;
    return this.runtimes.get(name);
  }

  isRunning(profileName?: string): boolean {
    const runtime = this.getRuntime(profileName);
    return !!runtime && runtime.process && runtime.process.exitCode === null;
  }

  listProfiles(): ProfileStatus[] {
    const profiles: ProfileStatus[] = [];

    for (const [name, profile] of Object.entries(this.config.profiles)) {
      const runtime = this.runtimes.get(name);
      const isRunning = runtime?.process && runtime.process.exitCode === null;

      profiles.push({
        name,
        cdpPort: runtime?.cdpPort || null,
        cdpUrl: runtime?.cdpUrl || null,
        color: 'default',
        driver: 'foxfang',
        running: !!isRunning,
        tabCount: runtime?.pages.size || 0,
        isDefault: name === this.config.defaultProfile,
        isRemote: false,
      });
    }

    return profiles;
  }

  async getOrCreateRuntime(profileName?: string): Promise<BrowserRuntime> {
    const runtime = this.getRuntime(profileName);
    if (runtime) {
      if (!runtime.process || runtime.process.exitCode === null) {
        return runtime;
      }
      await this.stopProfile(profileName);
    }
    return this.startProfile(profileName);
  }
}

async function resolvePlaywrightConnectUrl(cdpUrl: string): Promise<string> {
  const normalized = cdpUrl.replace(/\/+$/, '');
  const versionUrl = `${normalized}/json/version`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 2500);
  try {
    const response = await fetch(versionUrl, {
      method: 'GET',
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`CDP endpoint returned HTTP ${response.status}`);
    }
    const data = await response.json().catch(() => null) as { webSocketDebuggerUrl?: string } | null;
    const wsUrl = String(data?.webSocketDebuggerUrl || '').trim();
    return wsUrl || normalized;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Failed to resolve Chrome DevTools endpoint from ${versionUrl}: ${detail}. ` +
      `This usually means the configured CDP port is not serving DevTools.`
    );
  } finally {
    clearTimeout(timeout);
  }
}
