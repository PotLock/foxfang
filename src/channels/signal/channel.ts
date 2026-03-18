/**
 * Signal Channel
 * Requires signal-cli to be installed
 */

import { spawn } from 'child_process';
import { promisify } from 'util';
import { exec } from 'child_process';

const execAsync = promisify(exec);

export interface SignalConfig {
  enabled: boolean;
  phoneNumber: string;
  signalCliPath?: string;
}

export interface SignalMessage {
  envelope: {
    source: string;
    timestamp: number;
    dataMessage?: {
      message: string;
    };
  };
}

export class SignalChannel {
  private config: SignalConfig;
  private signalCliPath: string;

  constructor(config: SignalConfig) {
    this.config = config;
    this.signalCliPath = config.signalCliPath || 'signal-cli';
  }

  async initialize(): Promise<void> {
    // Check if signal-cli is available
    try {
      await execAsync(`${this.signalCliPath} --version`);
    } catch {
      throw new Error('signal-cli not found. Please install signal-cli.');
    }
    
    // Check account registration
    try {
      const { stdout } = await execAsync(`${this.signalCliPath} -a ${this.config.phoneNumber} listDevices`);
      if (stdout.includes('No devices')) {
        throw new Error('Signal account not registered. Run: signal-cli link or register.');
      }
    } catch (error) {
      if (error instanceof Error && error.message.includes('signal-cli')) {
        throw error;
      }
    }
  }

  async sendMessage(recipient: string, message: string): Promise<void> {
    const cmd = `${this.signalCliPath} -a ${this.config.phoneNumber} send -m "${message.replace(/"/g, '\\"')}" ${recipient}`;
    
    try {
      await execAsync(cmd);
    } catch (error) {
      throw new Error(`Failed to send Signal message: ${error}`);
    }
  }

  async receiveMessages(): Promise<SignalMessage[]> {
    try {
      const { stdout } = await execAsync(`${this.signalCliPath} -a ${this.config.phoneNumber} receive --json`);
      
      const messages: SignalMessage[] = [];
      for (const line of stdout.split('\n')) {
        if (line.trim()) {
          try {
            messages.push(JSON.parse(line));
          } catch {
            // Ignore parse errors
          }
        }
      }
      
      return messages;
    } catch (error) {
      console.error('Signal receive error:', error);
      return [];
    }
  }

  async startDaemon(callback: (message: SignalMessage) => Promise<void>): Promise<void> {
    // Start signal-cli daemon for real-time messages
    const proc = spawn(this.signalCliPath, [
      '-a', this.config.phoneNumber,
      'receive',
      '--json',
      '--timeout', '60',
    ]);
    
    proc.stdout.on('data', async (data) => {
      const lines = data.toString().split('\n');
      for (const line of lines) {
        if (line.trim()) {
          try {
            const message = JSON.parse(line);
            await callback(message);
          } catch {
            // Ignore parse errors
          }
        }
      }
    });
    
    proc.stderr.on('data', (data) => {
      console.error('Signal daemon error:', data.toString());
    });
    
    return new Promise((resolve, reject) => {
      proc.on('error', reject);
      proc.on('exit', (code) => {
        if (code !== 0) {
          reject(new Error(`Signal daemon exited with code ${code}`));
        } else {
          resolve();
        }
      });
    });
  }
}
