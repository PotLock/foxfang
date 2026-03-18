/**
 * Channel Manager
 * 
 * Manages all channel connections and routes messages between
 * channels and the agent orchestrator.
 */

import { SignalAdapter } from './adapters/signal';
import type { ChannelAdapter, ChannelMessage, ChannelResponse } from './types';
import type { AgentOrchestrator } from '../agents/orchestrator';

export class ChannelManager {
  private adapters: Map<string, ChannelAdapter> = new Map();
  private orchestrator: AgentOrchestrator | null = null;
  private enabledChannels: string[] = [];

  constructor(channels: string[] = []) {
    this.enabledChannels = channels;
  }

  setOrchestrator(orchestrator: AgentOrchestrator): void {
    this.orchestrator = orchestrator;
  }

  async connectAll(): Promise<void> {
    for (const channelName of this.enabledChannels) {
      try {
        await this.connectChannel(channelName);
      } catch (error) {
        // Log warning but don't crash - channel may be started later
        const errorMsg = error instanceof Error ? error.message : String(error);
        console.warn(`[ChannelManager] ⚠️  ${channelName} not available: ${errorMsg.split('\n')[0]}`);
        console.warn(`[ChannelManager]    Gateway will run without ${channelName}. Start it and restart daemon to enable.`);
      }
    }
  }

  async connectChannel(name: string): Promise<void> {
    if (this.adapters.has(name)) {
      console.log(`[ChannelManager] ${name} already connected`);
      return;
    }

    const adapter = this.createAdapter(name);
    if (!adapter) {
      throw new Error(`Unknown channel: ${name}`);
    }

    // Set up message handler
    adapter.onMessage(async (msg: ChannelMessage) => {
      return this.handleChannelMessage(msg);
    });

    await adapter.connect();
    this.adapters.set(name, adapter);
  }

  async disconnectAll(): Promise<void> {
    for (const [name, adapter] of this.adapters) {
      try {
        await adapter.disconnect();
        console.log(`[ChannelManager] ${name} disconnected`);
      } catch (error) {
        console.error(`[ChannelManager] Error disconnecting ${name}:`, error);
      }
    }
    this.adapters.clear();
  }

  async disconnectChannel(name: string): Promise<void> {
    const adapter = this.adapters.get(name);
    if (adapter) {
      await adapter.disconnect();
      this.adapters.delete(name);
    }
  }

  getConnectedChannels(): string[] {
    return Array.from(this.adapters.keys());
  }

  isConnected(name: string): boolean {
    return this.adapters.has(name);
  }

  private createAdapter(name: string): ChannelAdapter | null {
    switch (name) {
      case 'signal':
        return new SignalAdapter();
      // Add more channels here:
      // case 'telegram': return new TelegramAdapter();
      // case 'discord': return new DiscordAdapter();
      // case 'slack': return new SlackAdapter();
      default:
        return null;
    }
  }

  private async handleChannelMessage(msg: ChannelMessage): Promise<ChannelResponse | void> {
    console.log(`[ChannelManager] Message from ${msg.channel}:${msg.from}: ${msg.content.substring(0, 50)}...`);

    if (!this.orchestrator) {
      console.error('[ChannelManager] No orchestrator set');
      return;
    }

    try {
      // Process through agent
      const result = await this.orchestrator.run({
        sessionId: `channel-${msg.channel}-${msg.from}`,
        agentId: 'orchestrator',
        message: `[From ${msg.channel}:${msg.from}] ${msg.content}`,
        stream: false,
      });

      if (result.content) {
        return {
          messageId: msg.id,
          content: result.content,
        };
      }
    } catch (error) {
      console.error('[ChannelManager] Error processing message:', error);
      return {
        messageId: msg.id,
        content: 'Sorry, I encountered an error processing your message.',
      };
    }
  }
}
