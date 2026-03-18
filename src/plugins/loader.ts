/**
 * Plugin Loader
 */

import { PluginLoadError } from '../core/errors';
import { eventBus, EventTypes } from '../core/events';
import { toolRegistry } from '../tools/index';

export interface Plugin {
  id: string;
  name: string;
  version: string;
  initialize(): Promise<void>;
  shutdown?(): Promise<void>;
}

export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  main: string;
}

export class PluginLoader {
  private plugins: Map<string, Plugin> = new Map();

  async loadAll(pluginIds: string[]): Promise<void> {
    for (const id of pluginIds) {
      try {
        await this.load(id);
      } catch (error) {
        console.error(`Failed to load plugin ${id}:`, error);
      }
    }
  }

  async load(id: string): Promise<Plugin> {
    // Mock implementation - in real scenario would load from file/node_modules
    const plugin: Plugin = {
      id,
      name: id,
      version: '1.0.0',
      initialize: async () => {
        console.log(`Plugin ${id} initialized`);
      },
    };

    this.plugins.set(id, plugin);
    await plugin.initialize();
    
    eventBus.emitEvent({
      type: 'plugin:loaded',
      sessionId: 'system',
      timestamp: Date.now(),
      data: { pluginId: id },
    });

    return plugin;
  }

  get(id: string): Plugin | undefined {
    return this.plugins.get(id);
  }

  getAll(): Plugin[] {
    return Array.from(this.plugins.values());
  }

  async unload(id: string): Promise<void> {
    const plugin = this.plugins.get(id);
    if (plugin?.shutdown) {
      await plugin.shutdown();
    }
    this.plugins.delete(id);
  }
}

export const pluginLoader = new PluginLoader();
