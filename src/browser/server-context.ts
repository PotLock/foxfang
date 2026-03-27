/**
 * Server Context
 * 
 * Context and state management for browser server
 */

import type { BrowserConfig, BrowserRuntime, BrowserStatus, BrowserServerState } from './types';
import { ProfileManager } from './profiles';
import { getDefaultBrowserConfig } from './config';

let globalState: BrowserServerState | null = null;

export function createBrowserServerState(config: BrowserConfig): BrowserServerState {
  const state: BrowserServerState = {
    config,
    profiles: new Map(),
    defaultProfile: config.defaultProfile,
  };

  globalState = state;
  return state;
}

export function getBrowserServerState(): BrowserServerState | null {
  return globalState;
}

export function getOrCreateState(config?: BrowserConfig): BrowserServerState {
  if (globalState) {
    if (config) {
      globalState.config = config;
    }
    return globalState;
  }

  return createBrowserServerState(config || getDefaultBrowserConfig());
}

export function clearBrowserServerState(): void {
  globalState = null;
}

export function getProfileManager(config?: BrowserConfig): ProfileManager {
  const state = getOrCreateState(config);
  return new ProfileManager(state.config, state.profiles);
}

export function getStatus(state: BrowserServerState, profileName?: string): BrowserStatus {
  const manager = new ProfileManager(state.config, state.profiles);
  const runtime = manager.getRuntime(profileName);
  const isRunning = runtime?.process && runtime.process.exitCode === null;

  return {
    enabled: state.config.enabled,
    running: !!isRunning,
    pid: runtime?.process?.pid || null,
    cdpPort: runtime?.cdpPort || null,
    cdpUrl: runtime?.cdpUrl || null,
    chosenBrowser: runtime ? 'chromium' : null,
    detectedBrowser: 'chromium',
    userDataDir: state.config.userDataDir || null,
    color: 'default',
    headless: state.config.headless,
    attachOnly: false,
    profile: profileName || state.config.defaultProfile,
  };
}

export function listKnownProfiles(state: BrowserServerState): string[] {
  return Object.keys(state.config.profiles);
}
