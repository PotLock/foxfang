/**
 * Daemon Lifecycle Management
 */

import { spawn, exec } from 'child_process';
import { writeFile, readFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { promisify } from 'util';

const execAsync = promisify(exec);

const DAEMON_PID_FILE = join(homedir(), '.foxfang', 'daemon.pid');
const DAEMON_LOG_FILE = join(homedir(), '.foxfang', 'daemon.log');

export interface DaemonStartOptions {
  port?: number;
  host?: string;
}

export interface DaemonStartResult {
  success: boolean;
  pid?: number;
  error?: string;
}

export interface DaemonStopResult {
  success: boolean;
  error?: string;
}

export class DaemonLifecycle {
  async start(options: DaemonStartOptions = {}): Promise<DaemonStartResult> {
    const port = options.port || 8787;
    const host = options.host || '127.0.0.1';
    
    // Check if already running
    const existingPid = await this.getPid();
    if (existingPid) {
      const isRunning = await this.isProcessRunning(existingPid);
      if (isRunning) {
        return { success: false, error: 'Daemon is already running' };
      }
    }
    
    // Ensure log directory exists
    const logDir = join(homedir(), '.foxfang');
    if (!existsSync(logDir)) {
      await mkdir(logDir, { recursive: true });
    }
    
    // Start daemon process
    const daemonScript = join(process.cwd(), 'dist', 'daemon', 'entry');
    const proc = spawn('node', [daemonScript], {
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        FOXFANG_DAEMON_PORT: port.toString(),
        FOXFANG_DAEMON_HOST: host,
      },
    });
    
    // Write PID file
    await writeFile(DAEMON_PID_FILE, proc.pid!.toString());
    
    // Redirect output to log file
    const logStream = await import('fs');
    const log = logStream.createWriteStream(DAEMON_LOG_FILE, { flags: 'a' });
    proc.stdout?.pipe(log);
    proc.stderr?.pipe(log);
    
    // Unref so parent can exit
    proc.unref();
    
    // Wait a bit to check if it started successfully
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    const isRunning = await this.isProcessRunning(proc.pid!);
    if (!isRunning) {
      return { success: false, error: 'Daemon failed to start' };
    }
    
    return { success: true, pid: proc.pid };
  }
  
  async startForeground(options: DaemonStartOptions = {}): Promise<void> {
    const port = options.port || 8787;
    const host = options.host || '127.0.0.1';
    
    const { startDaemonServer } = await import('./server');
    await startDaemonServer({ port, host });
  }
  
  async stop(): Promise<DaemonStopResult> {
    const pid = await this.getPid();
    if (!pid) {
      return { success: false, error: 'Daemon is not running' };
    }
    
    const isRunning = await this.isProcessRunning(pid);
    if (!isRunning) {
      await this.removePidFile();
      return { success: true };
    }
    
    try {
      process.kill(pid, 'SIGTERM');
      
      // Wait for process to exit
      for (let i = 0; i < 10; i++) {
        await new Promise(resolve => setTimeout(resolve, 500));
        const stillRunning = await this.isProcessRunning(pid);
        if (!stillRunning) {
          await this.removePidFile();
          return { success: true };
        }
      }
      
      // Force kill if still running
      process.kill(pid, 'SIGKILL');
      await this.removePidFile();
      return { success: true };
    } catch (error) {
      return { success: false, error: `Failed to stop daemon: ${error}` };
    }
  }
  
  async restart(options: DaemonStartOptions = {}): Promise<DaemonStartResult> {
    await this.stop();
    await new Promise(resolve => setTimeout(resolve, 1000));
    return this.start(options);
  }
  
  private async getPid(): Promise<number | null> {
    try {
      if (!existsSync(DAEMON_PID_FILE)) return null;
      const pidStr = await readFile(DAEMON_PID_FILE, 'utf-8');
      return parseInt(pidStr.trim(), 10);
    } catch {
      return null;
    }
  }
  
  private async removePidFile(): Promise<void> {
    try {
      const { unlink } = await import('fs/promises');
      await unlink(DAEMON_PID_FILE);
    } catch {
      // Ignore
    }
  }
  
  private async isProcessRunning(pid: number): Promise<boolean> {
    try {
      process.kill(pid, 0);
      return true;
    } catch {
      return false;
    }
  }
}
