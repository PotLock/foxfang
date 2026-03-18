/**
 * Sessions Command - Manage chat sessions
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { SessionManager } from '../../sessions/manager';
import { loadConfig } from '../../config/index';

export async function registerSessionsCommand(program: Command): Promise<void> {
  const sessions = program
    .command('sessions')
    .description('Manage chat sessions');

  sessions
    .command('list')
    .alias('ls')
    .description('List all sessions')
    .option('-l, --limit <number>', 'Limit number of results', '20')
    .action(async (options) => {
      const config = await loadConfig();
      const manager = new SessionManager(config.sessions);
      
      const sessionsList = await manager.listSessions({
        limit: parseInt(options.limit),
      });
      
      if (sessionsList.length === 0) {
        console.log(chalk.dim('No sessions found'));
        return;
      }
      
      console.log(chalk.cyan('Sessions:'));
      console.log();
      
      for (const session of sessionsList) {
        const date = new Date(session.lastActive).toLocaleDateString();
        const time = new Date(session.lastActive).toLocaleTimeString();
        console.log(`  ${chalk.yellow(session.id)}`);
        console.log(`    Agent: ${session.agentId} | Messages: ${session.messageCount}`);
        console.log(`    Last active: ${date} ${time}`);
        console.log();
      }
    });

  sessions
    .command('show <id>')
    .alias('info')
    .description('Show session details')
    .option('-f, --full', 'Show full conversation', false)
    .action(async (id, options) => {
      const config = await loadConfig();
      const manager = new SessionManager(config.sessions);
      
      const session = await manager.getSession(id);
      if (!session) {
        console.log(chalk.red(`Session "${id}" not found`));
        process.exit(1);
      }
      
      console.log(chalk.cyan('Session Details:'));
      console.log();
      console.log(`  ID: ${session.id}`);
      console.log(`  Agent: ${session.agentId}`);
      console.log(`  Created: ${new Date(session.createdAt).toLocaleString()}`);
      console.log(`  Messages: ${session.messages.length}`);
      console.log();
      
      if (options.full) {
        console.log(chalk.cyan('Conversation:'));
        console.log();
        for (const msg of session.messages) {
          const role = msg.role === 'user' ? chalk.green('You') : chalk.blue('Agent');
          console.log(`${role}: ${msg.content}`);
          console.log();
        }
      }
    });

  sessions
    .command('delete <id>')
    .alias('rm')
    .description('Delete a session')
    .option('--force', 'Skip confirmation', false)
    .action(async (id, options) => {
      if (!options.force) {
        const { confirm } = await import('../prompt');
        const confirmed = await confirm(`Delete session "${id}"?`);
        if (!confirmed) {
          console.log(chalk.yellow('Cancelled'));
          return;
        }
      }
      
      const config = await loadConfig();
      const manager = new SessionManager(config.sessions);
      await manager.deleteSession(id);
      console.log(chalk.green(`✓ Session "${id}" deleted`));
    });

  sessions
    .command('clear')
    .description('Clear all sessions')
    .option('--force', 'Skip confirmation', false)
    .action(async (options) => {
      if (!options.force) {
        const { confirm } = await import('../prompt');
        const confirmed = await confirm('Clear ALL sessions? This cannot be undone.');
        if (!confirmed) {
          console.log(chalk.yellow('Cancelled'));
          return;
        }
      }
      
      const config = await loadConfig();
      const manager = new SessionManager(config.sessions);
      await manager.clearAllSessions();
      console.log(chalk.green('✓ All sessions cleared'));
    });

  sessions
    .command('export <id>')
    .description('Export session to file')
    .requiredOption('-o, --output <file>', 'Output file path')
    .option('-f, --format <format>', 'Export format (json, markdown)', 'markdown')
    .action(async (id, options) => {
      const config = await loadConfig();
      const manager = new SessionManager(config.sessions);
      
      const session = await manager.getSession(id);
      if (!session) {
        console.log(chalk.red(`Session "${id}" not found`));
        process.exit(1);
      }
      
      const { exportSession } = await import('../../sessions/export');
      await exportSession(session, options.output, options.format);
      console.log(chalk.green(`✓ Session exported to ${options.output}`));
    });
}
