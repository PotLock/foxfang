/**
 * Event Bus
 */

import { EventEmitter } from 'events';
import { AgentEvent, EventHandler } from './types';

export const EventTypes = {
  SESSION_CREATED: 'session:created',
  SESSION_UPDATED: 'session:updated',
  SESSION_DELETED: 'session:deleted',
  AGENT_RUN_STARTED: 'agent:run:started',
  AGENT_RUN_COMPLETED: 'agent:run:completed',
  AGENT_RUN_FAILED: 'agent:run:failed',
  TOOL_CALLED: 'tool:called',
  TOOL_COMPLETED: 'tool:completed',
} as const;

class EventBus extends EventEmitter {
  emitEvent(event: AgentEvent): boolean {
    return this.emit(event.type, event);
  }

  onEvent(type: string, handler: EventHandler): void {
    this.on(type, handler);
  }

  offEvent(type: string, handler: EventHandler): void {
    this.off(type, handler);
  }
}

export const eventBus = new EventBus();
