/**
 * Auto-Reply System
 * Automatically responds to incoming messages from channels
 */

import { EventEmitter } from 'events';
import { AgentOrchestrator } from '../agents/orchestrator';
import { SessionManager } from '../sessions/manager';
import { loadConfig } from '../config/index';
import { TelegramChannel } from '../channels/telegram/channel';
import { DiscordChannel } from '../channels/discord/channel';
import { SlackChannel } from '../channels/slack/channel';
import { SignalChannel } from '../channels/signal/channel';

export interface AutoReplyConfig {
  enabled: boolean;
  channels: string[];
  defaultAgent: string;
  allowedUsers?: string[];
  blockedUsers?: string[];
  responseDelay?: number;
}

export interface IncomingMessage {
  channel: string;
  from: string;
  text: string;
  timestamp: number;
  metadata?: Record<string, any>;
}

export class AutoReply extends EventEmitter {
  private config: AutoReplyConfig;
  private orchestrator: AgentOrchestrator;
  private sessionManager: SessionManager;
  private running = false;
  private channelInstances: Map<string, any> = new Map();

  constructor(config: AutoReplyConfig, orchestrator: AgentOrchestrator, sessionManager: SessionManager) {
    super();
    this.config = config;
    this.orchestrator = orchestrator;
    this.sessionManager = sessionManager;
  }

  async start(): Promise<void> {
    if (this.running) return;
    
    const appConfig = await loadConfig();
    
    // Initialize channels
    for (const channelId of this.config.channels) {
      const channelConfig = appConfig.channels?.[channelId as keyof typeof appConfig.channels];
      if (!channelConfig?.enabled) continue;

      try {
        switch (channelId) {
          case 'telegram':
            await this.startTelegram(channelConfig as any);
            break;
          case 'discord':
            await this.startDiscord(channelConfig as any);
            break;
          case 'slack':
            await this.startSlack(channelConfig as any);
            break;
          case 'signal':
            await this.startSignal(channelConfig as any);
            break;
        }
      } catch (error) {
        console.error(`Failed to start ${channelId}:`, error);
      }
    }

    this.running = true;
    this.emit('started');
  }

  async stop(): Promise<void> {
    this.running = false;
    
    // Stop all channels
    for (const [channelId, instance] of this.channelInstances) {
      try {
        // Cleanup logic per channel
        console.log(`Stopping ${channelId}...`);
      } catch (error) {
        console.error(`Error stopping ${channelId}:`, error);
      }
    }
    
    this.channelInstances.clear();
    this.emit('stopped');
  }

  private async startTelegram(config: any): Promise<void> {
    const channel = new TelegramChannel(config);
    await channel.initialize();
    
    this.channelInstances.set('telegram', channel);
    
    // Start polling
    this.pollTelegram(channel);
  }

  private async pollTelegram(channel: TelegramChannel): Promise<void> {
    let offset = 0;
    
    while (this.running) {
      try {
        const updates = await channel.getUpdates(offset);
        
        for (const message of updates) {
          await this.handleMessage({
            channel: 'telegram',
            from: message.from.username || message.from.id.toString(),
            text: message.text,
            timestamp: Date.now(),
            metadata: { chatId: message.chat.id },
          });
          offset = message.message_id + 1;
        }
        
        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (error) {
        console.error('Telegram polling error:', error);
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    }
  }

  private async startDiscord(config: any): Promise<void> {
    const channel = new DiscordChannel(config);
    await channel.initialize();
    this.channelInstances.set('discord', channel);
    // Discord would use Gateway/WebSocket
  }

  private async startSlack(config: any): Promise<void> {
    const channel = new SlackChannel(config);
    await channel.initialize();
    this.channelInstances.set('slack', channel);
    // Slack would use Socket Mode
  }

  private async startSignal(config: any): Promise<void> {
    const channel = new SignalChannel(config);
    await channel.initialize();
    this.channelInstances.set('signal', channel);
    
    // Start Signal daemon
    channel.startDaemon(async (message) => {
      if (message.envelope.dataMessage?.message) {
        await this.handleMessage({
          channel: 'signal',
          from: message.envelope.source,
          text: message.envelope.dataMessage.message,
          timestamp: message.envelope.timestamp,
        });
      }
    });
  }

  private async handleMessage(message: IncomingMessage): Promise<void> {
    // Check allowed/blocked users
    if (this.config.allowedUsers?.length && !this.config.allowedUsers.includes(message.from)) {
      return;
    }
    if (this.config.blockedUsers?.includes(message.from)) {
      return;
    }

    this.emit('message', message);

    // Generate response
    const sessionId = `${message.channel}-${message.from}`;
    
    try {
      // Add delay if configured
      if (this.config.responseDelay) {
        await new Promise(resolve => setTimeout(resolve, this.config.responseDelay));
      }

      const result = await this.orchestrator.run({
        sessionId,
        agentId: this.config.defaultAgent,
        message: message.text,
        stream: false,
      });

      // Send response back
      await this.sendResponse(message, result.content);
      
      this.emit('response', { message, response: result.content });
    } catch (error) {
      this.emit('error', { message, error });
    }
  }

  private async sendResponse(original: IncomingMessage, text: string): Promise<void> {
    const channel = this.channelInstances.get(original.channel);
    if (!channel) return;

    try {
      switch (original.channel) {
        case 'telegram':
          await channel.sendMessage(original.metadata!.chatId, text);
          break;
        case 'discord':
          // await channel.sendMessage(original.metadata!.channelId, text);
          break;
        case 'slack':
          // await channel.sendMessage(original.metadata!.channel, text);
          break;
        case 'signal':
          await channel.sendMessage(original.from, text);
          break;
      }
    } catch (error) {
      console.error(`Failed to send response to ${original.channel}:`, error);
    }
  }
}
