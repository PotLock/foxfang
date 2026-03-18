/**
 * Chat Command - Interactive chat with agent
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { createInterface } from 'readline';
import { AgentOrchestrator } from '../../agents/orchestrator';
import { SessionManager } from '../../sessions/manager';
import { loadConfig } from '../../config/index';
import { initializeProviders } from '../../providers/index';
import { initializeTools } from '../../tools/index';

export async function registerChatCommand(program: Command): Promise<void> {
  program
    .command('chat')
    .description('Start an interactive chat session with an agent')
    .option('-a, --agent <agent>', 'Agent ID to use', 'default')
    .option('-p, --project <project>', 'Project ID')
    .option('-s, --session <session>', 'Session ID (creates new if not provided)')
    .option('-m, --model <model>', 'Model to use')
    .option('--provider <provider>', 'Provider to use')
    .option('--system <prompt>', 'System prompt override')
    .action(async (options) => {
      // Load configuration
      const config = await loadConfig();
      
      // Initialize providers
      initializeProviders(config.providers);
      
      // Initialize tools
      initializeTools(config.tools?.tools || {});
      
      // Create session manager
      const sessionManager = new SessionManager(config.sessions);
      
      // Create orchestrator
      const orchestrator = new AgentOrchestrator(sessionManager);
      
      // Generate session ID
      const sessionId = options.session || `chat-${Date.now()}`;
      
      console.log(chalk.cyan('╔════════════════════════════════════════╗'));
      console.log(chalk.cyan('║     FoxFang - Agent Chat Mode      ║'));
      console.log(chalk.cyan('╚════════════════════════════════════════╝'));
      console.log();
      console.log(chalk.dim(`Session: ${sessionId}`));
      console.log(chalk.dim(`Agent: ${options.agent}`));
      console.log(chalk.dim('Type "exit" or "quit" to end the chat'));
      console.log(chalk.dim('Type "/help" for available commands'));
      console.log();
      
      const rl = createInterface({
        input: process.stdin,
        output: process.stdout,
        prompt: chalk.green('You: '),
      });
      
      rl.prompt();
      
      rl.on('line', async (input) => {
        const message = input.trim();
        
        if (!message) {
          rl.prompt();
          return;
        }
        
        // Handle special commands
        if (message.toLowerCase() === 'exit' || message.toLowerCase() === 'quit') {
          console.log(chalk.yellow('Goodbye!'));
          rl.close();
          return;
        }
        
        if (message === '/help') {
          console.log(chalk.cyan('Available commands:'));
          console.log('  /help     - Show this help');
          console.log('  /clear    - Clear conversation history');
          console.log('  /agents   - List available agents');
          console.log('  /tools    - List available tools');
          console.log('  /save     - Save current session');
          console.log('  exit/quit - End the chat');
          console.log();
          rl.prompt();
          return;
        }
        
        if (message === '/clear') {
          await sessionManager.clearSession(sessionId);
          console.log(chalk.yellow('Conversation history cleared.'));
          console.log();
          rl.prompt();
          return;
        }
        
        if (message === '/agents') {
          console.log(chalk.cyan('Available agents:'));
          console.log('  - default (Strategy Lead)');
          console.log('  - content-specialist');
          console.log('  - growth-analyst');
          console.log();
          rl.prompt();
          return;
        }
        
        if (message === '/tools') {
          console.log(chalk.cyan('Available tools:'));
          console.log('  - web_search - Search the web');
          console.log('  - memory_store - Store information');
          console.log('  - memory_recall - Recall stored information');
          console.log();
          rl.prompt();
          return;
        }
        
        if (message === '/save') {
          await sessionManager.saveSession(sessionId);
          console.log(chalk.yellow('Session saved.'));
          console.log();
          rl.prompt();
          return;
        }
        
        try {
          process.stdout.write(chalk.blue('\nAgent: '));
          
          const result = await orchestrator.run({
            sessionId,
            agentId: options.agent,
            message,
            projectId: options.project,
            model: options.model,
            provider: options.provider,
            systemPrompt: options.system,
            stream: true,
          });
          
          if (result.stream) {
            for await (const chunk of result.stream) {
              if (chunk.type === 'text' && chunk.content) {
                process.stdout.write(chunk.content);
              }
            }
          }
          
          console.log(); // New line
          console.log();
          
        } catch (error) {
          console.error(chalk.red('\nError:'), error instanceof Error ? error.message : String(error));
        }
        
        rl.prompt();
      });
      
      rl.on('close', () => {
        console.log(chalk.yellow('\nChat ended. Session saved.'));
        process.exit(0);
      });
    });
}
