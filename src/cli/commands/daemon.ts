/**
 * Daemon Command - Manage FoxFang daemon
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { DaemonLifecycle } from '../../daemon/lifecycle';
import { getDaemonStatus } from '../../daemon/status';

export async function registerDaemonCommand(program: Command): Promise<void> {
  const daemon = program
    .command('daemon')
    .description('Manage FoxFang background daemon');

  daemon
    .command('start')
    .description('Start the daemon')
    .option('-f, --foreground', 'Run in foreground (don\'t detach)', false)
    .option('-p, --port <port>', 'Port to listen on', '8787')
    .option('--host <host>', 'Host to bind to', '127.0.0.1')
    .action(async (options) => {
      const lifecycle = new DaemonLifecycle();
      
      if (options.foreground) {
        console.log(chalk.cyan('Starting FoxFang daemon in foreground...'));
        console.log(chalk.dim(`Port: ${options.port}`));
        console.log(chalk.dim(`Host: ${options.host}`));
        console.log(chalk.dim('Press Ctrl+C to stop'));
        console.log();
        
        await lifecycle.startForeground({
          port: parseInt(options.port),
          host: options.host,
        });
      } else {
        console.log(chalk.cyan('Starting FoxFang daemon...'));
        
        const result = await lifecycle.start({
          port: parseInt(options.port),
          host: options.host,
        });
        
        if (result.success) {
          console.log(chalk.green('✓ Daemon started successfully'));
          console.log(chalk.dim(`PID: ${result.pid}`));
          console.log(chalk.dim(`API: http://${options.host}:${options.port}`));
        } else {
          console.log(chalk.red('✗ Failed to start daemon'));
          console.log(chalk.red(result.error));
          process.exit(1);
        }
      }
    });

  daemon
    .command('stop')
    .description('Stop the daemon')
    .action(async () => {
      const lifecycle = new DaemonLifecycle();
      console.log(chalk.cyan('Stopping FoxFang daemon...'));
      
      const result = await lifecycle.stop();
      
      if (result.success) {
        console.log(chalk.green('✓ Daemon stopped'));
      } else {
        console.log(chalk.yellow('Daemon was not running'));
      }
    });

  daemon
    .command('restart')
    .description('Restart the daemon')
    .action(async () => {
      const lifecycle = new DaemonLifecycle();
      
      console.log(chalk.cyan('Restarting FoxFang daemon...'));
      
      await lifecycle.stop();
      const result = await lifecycle.start({});
      
      if (result.success) {
        console.log(chalk.green('✓ Daemon restarted'));
      } else {
        console.log(chalk.red('✗ Failed to restart daemon'));
        process.exit(1);
      }
    });

  daemon
    .command('status')
    .description('Check daemon status')
    .action(async () => {
      const status = await getDaemonStatus();
      
      if (status.running) {
        console.log(chalk.green('● Daemon is running'));
        console.log(chalk.dim(`  PID: ${status.pid}`));
        console.log(chalk.dim(`  Uptime: ${status.uptime}`));
        console.log(chalk.dim(`  API: ${status.apiUrl}`));
        console.log(chalk.dim(`  Version: ${status.version}`));
      } else {
        console.log(chalk.red('● Daemon is not running'));
      }
    });

  daemon
    .command('logs')
    .description('Show daemon logs')
    .option('-f, --follow', 'Follow log output', false)
    .option('-n, --lines <lines>', 'Number of lines to show', '50')
    .action(async (options) => {
      const { showLogs } = await import('../../daemon/logs');
      await showLogs({
        follow: options.follow,
        lines: parseInt(options.lines),
      });
    });
}
