/**
 * Main entry point for FoxFang CLI
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { buildProgram } from './program';
import { getCliContext } from './program/context';
import { installProcessWarningFilter } from './warning-filter';

export async function runMain(): Promise<void> {
  // Install warning filter early
  installProcessWarningFilter();
  
  try {
    const program = await buildProgram();
    await program.parseAsync(process.argv);
  } catch (error) {
    const ctx = getCliContext();
    const isDebug = ctx?.logLevel === 'debug' || process.env.DEBUG === '1';
    
    console.error(chalk.red('Error:'), error instanceof Error ? error.message : String(error));
    
    if (isDebug && error instanceof Error && error.stack) {
      console.error(chalk.gray(error.stack));
    }
    
    process.exit(1);
  }
}
