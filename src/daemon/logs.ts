/**
 * Daemon Logs
 */

import { createReadStream } from 'fs';
import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

const DAEMON_LOG_FILE = join(homedir(), '.foxfang', 'daemon.log');

export interface ShowLogsOptions {
  follow: boolean;
  lines: number;
}

export async function showLogs(options: ShowLogsOptions): Promise<void> {
  if (!existsSync(DAEMON_LOG_FILE)) {
    console.log('No logs found');
    return;
  }
  
  if (options.follow) {
    // Tail -f style following
    const { spawn } = await import('child_process');
    const tail = spawn('tail', ['-f', '-n', options.lines.toString(), DAEMON_LOG_FILE], {
      stdio: 'inherit',
    });
    
    return new Promise((resolve) => {
      tail.on('close', resolve);
    });
  } else {
    // Show last N lines
    try {
      const content = await readFile(DAEMON_LOG_FILE, 'utf-8');
      const lines = content.split('\n');
      const lastLines = lines.slice(-options.lines);
      console.log(lastLines.join('\n'));
    } catch (error) {
      console.error('Failed to read logs:', error);
    }
  }
}
