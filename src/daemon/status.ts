/**
 * Daemon Status Check
 */

import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

const DAEMON_PID_FILE = join(homedir(), '.foxfang', 'daemon.pid');

export interface DaemonStatus {
  running: boolean;
  pid?: number;
  uptime?: string;
  apiUrl?: string;
  version?: string;
}

export async function getDaemonStatus(): Promise<DaemonStatus> {
  try {
    if (!existsSync(DAEMON_PID_FILE)) {
      return { running: false };
    }
    
    const pidStr = await readFile(DAEMON_PID_FILE, 'utf-8');
    const pid = parseInt(pidStr.trim(), 10);
    
    // Check if process is actually running
    try {
      process.kill(pid, 0);
    } catch {
      return { running: false };
    }
    
    // Try to get status from daemon API
    try {
      const response = await fetch('http://127.0.0.1:8787/health');
      const data = await response.json() as { uptime?: string; version?: string };
      
      return {
        running: true,
        pid,
        uptime: data.uptime || 'unknown',
        apiUrl: 'http://127.0.0.1:8787',
        version: data.version,
      };
    } catch {
      return {
        running: true,
        pid,
        uptime: 'unknown',
        apiUrl: 'http://127.0.0.1:8787',
      };
    }
  } catch {
    return { running: false };
  }
}
