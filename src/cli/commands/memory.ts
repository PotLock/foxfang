/**
 * Memory Command - Manage agent memory
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { MemoryStore } from '../../memory/store';
import { loadConfig } from '../../config/index';

export async function registerMemoryCommand(program: Command): Promise<void> {
  const memory = program
    .command('memory')
    .description('Manage agent memory');

  memory
    .command('search <query>')
    .alias('query')
    .description('Search memory')
    .option('-l, --limit <number>', 'Limit results', '10')
    .option('-t, --type <type>', 'Filter by type')
    .action(async (query, options) => {
      const config = await loadConfig();
      const store = new MemoryStore(config.memory);
      
      const results = await store.search(query, {
        limit: parseInt(options.limit),
        type: options.type,
      });
      
      if (results.length === 0) {
        console.log(chalk.dim('No memories found'));
        return;
      }
      
      console.log(chalk.cyan(`Found ${results.length} memories:`));
      console.log();
      
      for (const result of results) {
        console.log(chalk.yellow(`[${result.type}] ${result.title || 'Untitled'}`));
        console.log(result.content.substring(0, 200) + (result.content.length > 200 ? '...' : ''));
        console.log(chalk.dim(`  Relevance: ${(result.score * 100).toFixed(1)}%`));
        console.log();
      }
    });

  memory
    .command('add')
    .description('Add a memory')
    .requiredOption('-c, --content <text>', 'Memory content')
    .option('-t, --type <type>', 'Memory type', 'note')
    .option('--title <title>', 'Memory title')
    .action(async (options) => {
      const config = await loadConfig();
      const store = new MemoryStore(config.memory);
      
      const id = await store.add({
        type: options.type,
        title: options.title,
        content: options.content,
        timestamp: new Date().toISOString(),
      });
      
      console.log(chalk.green(`✓ Memory added (ID: ${id})`));
    });

  memory
    .command('get <id>')
    .description('Get a memory by ID')
    .action(async (id) => {
      const config = await loadConfig();
      const store = new MemoryStore(config.memory);
      
      const memory = await store.get(id);
      if (!memory) {
        console.log(chalk.red(`Memory "${id}" not found`));
        process.exit(1);
      }
      
      console.log(chalk.cyan('Memory:'));
      console.log();
      console.log(`  ID: ${memory.id}`);
      console.log(`  Type: ${memory.type}`);
      if (memory.title) console.log(`  Title: ${memory.title}`);
      console.log(`  Created: ${new Date(memory.timestamp).toLocaleString()}`);
      console.log();
      console.log(chalk.dim('Content:'));
      console.log(memory.content);
    });

  memory
    .command('delete <id>')
    .alias('rm')
    .description('Delete a memory')
    .action(async (id) => {
      const config = await loadConfig();
      const store = new MemoryStore(config.memory);
      
      await store.delete(id);
      console.log(chalk.green(`✓ Memory "${id}" deleted`));
    });

  memory
    .command('list')
    .alias('ls')
    .description('List all memories')
    .option('-t, --type <type>', 'Filter by type')
    .option('-l, --limit <number>', 'Limit results', '20')
    .action(async (options) => {
      const config = await loadConfig();
      const store = new MemoryStore(config.memory);
      
      const memories = await store.list({
        type: options.type,
        limit: parseInt(options.limit),
      });
      
      if (memories.length === 0) {
        console.log(chalk.dim('No memories found'));
        return;
      }
      
      console.log(chalk.cyan(`Memories (${memories.length}):`));
      console.log();
      
      for (const memory of memories) {
        const title = memory.title || memory.content.substring(0, 50) + '...';
        const date = new Date(memory.timestamp).toLocaleDateString();
        console.log(`  ${chalk.yellow(memory.id.substring(0, 8))} [${memory.type}] ${title} ${chalk.dim(date)}`);
      }
    });

  memory
    .command('stats')
    .description('Show memory statistics')
    .action(async () => {
      const config = await loadConfig();
      const store = new MemoryStore(config.memory);
      
      const stats = await store.getStats();
      
      console.log(chalk.cyan('Memory Statistics:'));
      console.log();
      console.log(`  Total entries: ${stats.total}`);
      console.log(`  By type:`);
      for (const [type, count] of Object.entries(stats.byType)) {
        console.log(`    ${type}: ${count}`);
      }
      console.log();
      console.log(`  Storage: ${(stats.storageSize / 1024 / 1024).toFixed(2)} MB`);
    });
}
