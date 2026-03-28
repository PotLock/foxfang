/**
 * Browser Config
 * 
 * Configuration management for browser service
 */

import { join } from 'path';
import { homedir } from 'os';
import type { BrowserConfig, BrowserProfile } from './types';

const DEFAULT_PORT = 9222;
const DEFAULT_HOST = 'localhost';
const DEFAULT_CDP_PORT = 18800;

export function getDefaultBrowserConfig(): BrowserConfig {
  return {
    enabled: false,
    port: DEFAULT_PORT,
    host: DEFAULT_HOST,
    headless: true,
    cdpPort: DEFAULT_CDP_PORT,
    defaultProfile: 'default',
    profiles: {
      default: {
        name: 'default',
        headless: true,
        cdpPort: DEFAULT_CDP_PORT,
      },
    },
    autoStart: true,
    userDataDir: join(homedir(), '.foxfang', 'browser', 'profiles', 'default'),
  };
}

export function resolveBrowserConfig(userConfig?: Partial<BrowserConfig>): BrowserConfig {
  const defaults = getDefaultBrowserConfig();
  const mergedProfiles = {
    ...defaults.profiles,
    ...userConfig?.profiles,
  };

  // Ensure every configured profile has a deterministic CDP port fallback.
  for (const [name, profile] of Object.entries(mergedProfiles)) {
    mergedProfiles[name] = {
      ...profile,
      cdpPort: profile?.cdpPort ?? userConfig?.cdpPort ?? defaults.cdpPort,
    };
  }
  
  return {
    ...defaults,
    ...userConfig,
    cdpPort: userConfig?.cdpPort ?? defaults.cdpPort,
    profiles: mergedProfiles,
  };
}

export function getProfileConfig(config: BrowserConfig, profileName?: string): BrowserProfile {
  const name = profileName || config.defaultProfile;
  const profile = config.profiles[name];
  
  if (!profile) {
    // Return default profile if specified one doesn't exist
    return config.profiles[config.defaultProfile] || {
      name: 'default',
      headless: config.headless,
      cdpPort: config.cdpPort,
    };
  }
  
  return {
    headless: config.headless,
    cdpPort: config.cdpPort,
    ...profile,
    name,
  };
}

export function getUserDataDir(config: BrowserConfig, profileName?: string): string {
  const profile = getProfileConfig(config, profileName);
  return profile.userDataDir || join(
    homedir(), 
    '.foxfang', 
    'browser', 
    'profiles', 
    profile.name
  );
}
