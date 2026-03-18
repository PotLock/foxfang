/**
 * Cron Tool
 * 
 * Manage scheduled jobs via agent tool calls.
 */

import { Tool, ToolCategory, ToolResult } from '../traits';
import { CronService } from '../../cron/service';
import { CronJobCreate, CronJobPatch, CronSchedule, CronPayload } from '../../cron/types';
import { formatSchedule } from '../../cron/scheduler';

// Global cron service instance (set by daemon)
let cronService: CronService | null = null;

export function setCronService(service: CronService): void {
  cronService = service;
}

export function getCronService(): CronService | null {
  return cronService;
}

/**
 * Cron management tool
 */
export class CronTool implements Tool {
  name = 'cron';
  description = `Manage scheduled cron jobs.

ACTIONS:
- status: Check cron service status
- list: List all jobs (use include_disabled:true to show disabled)
- add: Create a new job (requires name, schedule, payload)
- update: Modify an existing job (requires job_id + fields to update)
- remove: Delete a job (requires job_id)
- run: Trigger a job immediately (requires job_id)
- runs: Get run history for a job (requires job_id)

SCHEDULE TYPES:
1. One-shot: { "kind": "at", "at": "2024-12-25T10:00:00Z" }
2. Interval: { "kind": "every", "everyMs": 3600000 }  // 1 hour
3. Cron expr: { "kind": "cron", "expr": "0 9 * * *" }  // Daily at 9am

Common cron presets:
- Every 5 minutes: */5 * * * *
- Every hour: 0 * * * *
- Daily: 0 0 * * *
- Weekly: 0 0 * * 0

PAYLOAD TYPES:
1. System event: { "kind": "systemEvent", "text": "Remind me to..." }
2. Agent turn: { "kind": "agentTurn", "message": "Generate daily report" }

Examples:
- Add daily report: cron add with schedule {kind:"cron",expr:"0 9 * * *"} and payload {kind:"agentTurn",message:"Generate daily summary"}
- List all jobs: cron list
- Run job now: cron run with job_id "xxx"`;

  category = ToolCategory.UTILITY;
  parameters = {
    type: 'object' as const,
    properties: {
      action: {
        type: 'string',
        enum: ['status', 'list', 'add', 'update', 'remove', 'run', 'runs'],
        description: 'Action to perform',
      },
      job_id: {
        type: 'string',
        description: 'Job ID (for update, remove, run, runs)',
      },
      name: {
        type: 'string',
        description: 'Job name (for add)',
      },
      description: {
        type: 'string',
        description: 'Optional job description',
      },
      enabled: {
        type: 'boolean',
        description: 'Whether job is enabled (default: true)',
      },
      schedule: {
        type: 'object',
        description: 'Schedule configuration',
      },
      payload: {
        type: 'object',
        description: 'Payload to execute',
      },
      session_target: {
        type: 'string',
        enum: ['main', 'isolated', 'current'],
        description: 'Session target (default: isolated)',
      },
      delivery_channel: {
        type: 'string',
        description: 'Channel to deliver results to (optional)',
      },
      delivery_to: {
        type: 'string',
        description: 'Recipient for delivery (optional)',
      },
      include_disabled: {
        type: 'boolean',
        description: 'Include disabled jobs in list',
      },
      delete_after_run: {
        type: 'boolean',
        description: 'Delete job after running (for one-shot jobs)',
      },
    },
    required: ['action'],
  };

  async execute(args: {
    action: string;
    job_id?: string;
    name?: string;
    description?: string;
    enabled?: boolean;
    schedule?: any;
    payload?: any;
    session_target?: string;
    delivery_channel?: string;
    delivery_to?: string;
    include_disabled?: boolean;
    delete_after_run?: boolean;
  }): Promise<ToolResult> {
    if (!cronService) {
      return {
        success: false,
        error: 'Cron service not initialized. Start the daemon first.',
      };
    }

    try {
      switch (args.action) {
        case 'status':
          return this.handleStatus();

        case 'list':
          return this.handleList(args.include_disabled);

        case 'add':
          return await this.handleAdd(args);

        case 'update':
          return await this.handleUpdate(args);

        case 'remove':
          return this.handleRemove(args.job_id);

        case 'run':
          return await this.handleRun(args.job_id);

        case 'runs':
          return this.handleRuns(args.job_id);

        default:
          return {
            success: false,
            error: `Unknown action: ${args.action}`,
          };
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private handleStatus(): ToolResult {
    const status = cronService!.status();
    return {
      success: true,
      output: `Cron service: ${status.running ? 'running' : 'stopped'}\nJobs: ${status.jobsCount}\nRunning: ${status.runningJobsCount}`,
      data: status,
    };
  }

  private handleList(includeDisabled?: boolean): ToolResult {
    const jobs = cronService!.list(includeDisabled);
    
    if (jobs.length === 0) {
      return {
        success: true,
        output: 'No jobs found.',
        data: { jobs: [] },
      };
    }

    const summary = jobs.map(j => ({
      id: j.id,
      name: j.name,
      enabled: j.enabled,
      schedule: formatSchedule(j.schedule),
      next_run: j.state.nextRunAtMs ? new Date(j.state.nextRunAtMs).toISOString() : 'never',
      last_status: j.state.lastRunStatus || 'never run',
    }));

    return {
      success: true,
      output: `${jobs.length} job(s):\n\n` + summary.map(s => 
        `- ${s.name} (${s.id.slice(0, 8)}...)\n  Schedule: ${s.schedule}\n  Next: ${s.next_run}\n  Status: ${s.enabled ? 'enabled' : 'disabled'}, Last: ${s.last_status}`
      ).join('\n\n'),
      data: { jobs: summary },
    };
  }

  private async handleAdd(args: any): Promise<ToolResult> {
    if (!args.name) {
      return { success: false, error: 'name is required' };
    }
    if (!args.schedule) {
      return { success: false, error: 'schedule is required' };
    }
    if (!args.payload) {
      return { success: false, error: 'payload is required' };
    }

    // Validate schedule
    const schedule = this.parseSchedule(args.schedule);
    if (!schedule) {
      return { success: false, error: 'Invalid schedule format' };
    }

    // Validate payload
    const payload = this.parsePayload(args.payload);
    if (!payload) {
      return { success: false, error: 'Invalid payload format' };
    }

    const input: CronJobCreate = {
      name: args.name,
      description: args.description,
      enabled: args.enabled ?? true,
      deleteAfterRun: args.delete_after_run,
      schedule,
      payload,
      sessionTarget: args.session_target || 'isolated',
      delivery: args.delivery_channel || args.delivery_to ? {
        mode: 'announce',
        channel: args.delivery_channel,
        to: args.delivery_to,
      } : undefined,
    };

    const job = await cronService!.add(input);
    
    return {
      success: true,
      output: `Created job "${job.name}" (${job.id})\nSchedule: ${formatSchedule(job.schedule)}\nNext run: ${job.state.nextRunAtMs ? new Date(job.state.nextRunAtMs).toISOString() : 'never'}`,
      data: { job },
    };
  }

  private async handleUpdate(args: any): Promise<ToolResult> {
    if (!args.job_id) {
      return { success: false, error: 'job_id is required' };
    }

    const patch: CronJobPatch = {};
    
    if (args.name !== undefined) patch.name = args.name;
    if (args.description !== undefined) patch.description = args.description;
    if (args.enabled !== undefined) patch.enabled = args.enabled;
    if (args.schedule) {
      const schedule = this.parseSchedule(args.schedule);
      if (!schedule) {
        return { success: false, error: 'Invalid schedule format' };
      }
      patch.schedule = schedule;
    }
    if (args.payload) {
      const payload = this.parsePayload(args.payload);
      if (!payload) {
        return { success: false, error: 'Invalid payload format' };
      }
      patch.payload = payload;
    }

    const job = await cronService!.update(args.job_id, patch);
    if (!job) {
      return { success: false, error: 'Job not found' };
    }

    return {
      success: true,
      output: `Updated job "${job.name}" (${job.id})`,
      data: { job },
    };
  }

  private handleRemove(jobId?: string): ToolResult {
    if (!jobId) {
      return { success: false, error: 'job_id is required' };
    }

    const success = cronService!.remove(jobId);
    if (!success) {
      return { success: false, error: 'Job not found' };
    }

    return {
      success: true,
      output: `Removed job ${jobId}`,
    };
  }

  private async handleRun(jobId?: string): Promise<ToolResult> {
    if (!jobId) {
      return { success: false, error: 'job_id is required' };
    }

    const result = await cronService!.run(jobId);
    if (!result.success) {
      return { success: false, error: result.error };
    }

    return {
      success: true,
      output: `Job ${jobId} executed successfully`,
    };
  }

  private handleRuns(jobId?: string): ToolResult {
    if (!jobId) {
      return { success: false, error: 'job_id is required' };
    }

    const runs = cronService!.getRuns(jobId, 10);
    
    if (runs.length === 0) {
      return {
        success: true,
        output: 'No run history found.',
        data: { runs: [] },
      };
    }

    const summary = runs.map(r => ({
      started: new Date(r.startedAtMs).toISOString(),
      status: r.status,
      duration: r.endedAtMs ? `${r.endedAtMs - r.startedAtMs}ms` : 'running',
      error: r.error,
    }));

    return {
      success: true,
      output: `Last ${runs.length} run(s):\n\n` + summary.map(s =>
        `- ${s.started}: ${s.status}${s.duration ? ` (${s.duration})` : ''}${s.error ? `\n  Error: ${s.error}` : ''}`
      ).join('\n'),
      data: { runs: summary },
    };
  }

  private parseSchedule(schedule: any): CronSchedule | null {
    if (!schedule || typeof schedule !== 'object') return null;

    switch (schedule.kind) {
      case 'at':
        if (typeof schedule.at === 'string') {
          return { kind: 'at', at: schedule.at };
        }
        return null;

      case 'every':
        if (typeof schedule.everyMs === 'number') {
          return {
            kind: 'every',
            everyMs: schedule.everyMs,
            anchorMs: schedule.anchorMs,
          };
        }
        // Support human-readable format
        if (typeof schedule.interval === 'string') {
          const ms = this.parseInterval(schedule.interval);
          if (ms) {
            return { kind: 'every', everyMs: ms };
          }
        }
        return null;

      case 'cron':
        if (typeof schedule.expr === 'string') {
          return {
            kind: 'cron',
            expr: schedule.expr,
            tz: schedule.tz,
          };
        }
        return null;

      default:
        return null;
    }
  }

  private parseInterval(interval: string): number | null {
    const match = interval.match(/^(\d+)\s*(s|sec|second|seconds|m|min|minute|minutes|h|hour|hours|d|day|days)$/i);
    if (!match) return null;

    const value = parseInt(match[1], 10);
    const unit = match[2].toLowerCase();

    if (unit.startsWith('s')) return value * 1000;
    if (unit.startsWith('m')) return value * 60 * 1000;
    if (unit.startsWith('h')) return value * 60 * 60 * 1000;
    if (unit.startsWith('d')) return value * 24 * 60 * 60 * 1000;

    return null;
  }

  private parsePayload(payload: any): CronPayload | null {
    if (!payload || typeof payload !== 'object') return null;

    switch (payload.kind) {
      case 'systemEvent':
        if (typeof payload.text === 'string') {
          return { kind: 'systemEvent', text: payload.text };
        }
        return null;

      case 'agentTurn':
        if (typeof payload.message === 'string') {
          return {
            kind: 'agentTurn',
            message: payload.message,
            model: payload.model,
            thinking: payload.thinking,
            timeoutSeconds: payload.timeoutSeconds,
          };
        }
        return null;

      default:
        return null;
    }
  }
}
