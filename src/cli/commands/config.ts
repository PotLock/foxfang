/**
 * Config Command - Manage configuration
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { loadConfig, saveConfig, getConfigPath } from '../../config/index';

export async function registerConfigCommand(program: Command): Promise<void> {
  const config = program
    .command('config')
    .description('Manage FoxFang configuration');

  config
    .command('get <key>')
    .description('Get a configuration value')
    .action(async (key) => {
      const cfg = await loadConfig();
      const value = key.split('.').reduce((obj: any, k: string) => obj?.[k], cfg);
      
      if (value !== undefined) {
        if (typeof value === 'object') {
          console.log(JSON.stringify(value, null, 2));
        } else {
          console.log(value);
        }
      } else {
        console.log(chalk.yellow(`Key "${key}" not found`));
      }
    });

  config
    .command('set <key> <value>')
    .description('Set a configuration value')
    .action(async (key, value) => {
      const cfg = await loadConfig();
      
      // Parse value (try JSON first, then string)
      let parsedValue: any;
      try {
        parsedValue = JSON.parse(value);
      } catch {
        parsedValue = value;
      }
      
      // Set nested value
      const keys = key.split('.');
      let current = cfg as any;
      for (let i = 0; i < keys.length - 1; i++) {
        if (!current[keys[i]]) current[keys[i]] = {};
        current = current[keys[i]];
      }
      current[keys[keys.length - 1]] = parsedValue;
      
      await saveConfig(cfg);
      console.log(chalk.green(`✓ Set ${key} = ${JSON.stringify(parsedValue)}`));
    });

  config
    .command('list')
    .alias('ls')
    .description('List all configuration')
    .action(async () => {
      const cfg = await loadConfig();
      console.log(chalk.cyan('Current Configuration:'));
      console.log();
      console.log(JSON.stringify(cfg, null, 2));
    });

  config
    .command('path')
    .description('Show config file path')
    .action(async () => {
      const path = await getConfigPath();
      console.log(path);
    });

  config
    .command('edit')
    .description('Open config in editor')
    .action(async () => {
      const { editConfig } = await import('../../config/editor');
      await editConfig();
    });

  config
    .command('reset')
    .description('Reset configuration to defaults')
    .option('--force', 'Skip confirmation', false)
    .action(async (options) => {
      if (!options.force) {
        const { confirm } = await import('../prompt');
        const confirmed = await confirm('Are you sure? This will reset all settings.');
        if (!confirmed) {
          console.log(chalk.yellow('Cancelled'));
          return;
        }
      }
      
      const { resetConfig } = await import('../../config/index');
      await resetConfig();
      console.log(chalk.green('✓ Configuration reset to defaults'));
    });
}
