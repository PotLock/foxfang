/**
 * Plugin Traits
 */

import { Tool, ToolCategory } from '../tools/traits';
import { Provider } from '../providers/traits';

export interface PluginAPI {
  registerTool(tool: Tool): void;
  registerProvider(provider: Provider): void;
  log(level: string, message: string): void;
  registerHook(event: string, handler: Function): void;
}

export interface PluginContext {
  config: Record<string, any>;
  workspace: string;
}

export interface Plugin {
  id: string;
  name: string;
  version: string;
  initialize(api: PluginAPI, context: PluginContext): Promise<void>;
  shutdown?(): Promise<void>;
}

export { Tool, ToolCategory, Provider };
