/**
 * CLI Program Context
 */

export interface CliContext {
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  configPath?: string;
  isDaemon: boolean;
}

let globalContext: CliContext | null = null;

export function setCliContext(ctx: CliContext): void {
  globalContext = ctx;
}

export function getCliContext(): CliContext | null {
  return globalContext;
}

export function createDefaultContext(): CliContext {
  return {
    logLevel: (process.env.LOG_LEVEL as any) || 'info',
    configPath: process.env.FOXFANG_CONFIG,
    isDaemon: false,
  };
}
