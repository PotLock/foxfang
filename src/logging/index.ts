/**
 * Logging System
 */

import { createWriteStream } from 'fs';
import { mkdir } from 'fs/promises';
import { join } from 'path';
import { homedir } from 'os';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LoggerConfig {
  level: LogLevel;
  file?: string;
  console?: boolean;
}

class Logger {
  private config: LoggerConfig;
  private fileStream?: ReturnType<typeof createWriteStream>;

  constructor(config: LoggerConfig) {
    this.config = config;
    
    if (config.file) {
      this.fileStream = createWriteStream(config.file, { flags: 'a' });
    }
  }

  private shouldLog(level: LogLevel): boolean {
    const levels: LogLevel[] = ['debug', 'info', 'warn', 'error'];
    return levels.indexOf(level) >= levels.indexOf(this.config.level);
  }

  private format(level: LogLevel, message: string, meta?: Record<string, any>): string {
    const timestamp = new Date().toISOString();
    const metaStr = meta ? ` ${JSON.stringify(meta)}` : '';
    return `[${timestamp}] [${level.toUpperCase()}] ${message}${metaStr}`;
  }

  private write(level: LogLevel, message: string, meta?: Record<string, any>): void {
    if (!this.shouldLog(level)) return;

    const formatted = this.format(level, message, meta);

    if (this.config.console !== false) {
      console.log(formatted);
    }

    if (this.fileStream) {
      this.fileStream.write(formatted + '\n');
    }
  }

  debug(message: string, meta?: Record<string, any>): void {
    this.write('debug', message, meta);
  }

  info(message: string, meta?: Record<string, any>): void {
    this.write('info', message, meta);
  }

  warn(message: string, meta?: Record<string, any>): void {
    this.write('warn', message, meta);
  }

  error(message: string, meta?: Record<string, any>): void {
    this.write('error', message, meta);
  }

  child(meta: Record<string, any>): Logger {
    const childLogger = new Logger(this.config);
    const originalWrite = this.write.bind(this);
    childLogger.write = (level: LogLevel, message: string, childMeta?: Record<string, any>) => {
      originalWrite(level, message, { ...meta, ...childMeta });
    };
    return childLogger;
  }
}

let defaultLogger: Logger | null = null;

export async function initializeLogging(level: LogLevel = 'info'): Promise<Logger> {
  const logDir = join(homedir(), '.foxfang', 'logs');
  await mkdir(logDir, { recursive: true });
  
  const logFile = join(logDir, `foxfang-${new Date().toISOString().split('T')[0]}.log`);
  
  defaultLogger = new Logger({
    level,
    file: logFile,
    console: true,
  });
  
  return defaultLogger;
}

export function getLogger(): Logger {
  if (!defaultLogger) {
    defaultLogger = new Logger({ level: 'info', console: true });
  }
  return defaultLogger;
}

export { Logger };
