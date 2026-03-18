/**
 * Cron Scheduler
 * 
 * Compute next run times for different schedule types.
 */

import type { CronSchedule } from './types';

// Simple cron parser for standard patterns
// Supports: * * * * * (minute hour day month weekday)
const CRON_FIELDS = ['minute', 'hour', 'day', 'month', 'weekday'] as const;

interface CronField {
  min: number;
  max: number;
  values: Set<number> | null; // null means all values (*)
}

function parseCronField(value: string, min: number, max: number): CronField {
  const trimmed = value.trim();
  
  if (trimmed === '*') {
    return { min, max, values: null };
  }
  
  const values = new Set<number>();
  
  // Handle comma-separated values (e.g., "1,2,3" or "*/5,10")
  const parts = trimmed.split(',');
  
  for (const part of parts) {
    const p = part.trim();
    
    // Handle step values (e.g., */5 or 0-30/5)
    if (p.includes('/')) {
      const [range, stepStr] = p.split('/');
      const step = parseInt(stepStr, 10);
      if (isNaN(step) || step <= 0) continue;
      
      let start = min;
      let end = max;
      
      if (range !== '*') {
        if (range.includes('-')) {
          const [startStr, endStr] = range.split('-');
          start = parseInt(startStr, 10);
          end = parseInt(endStr, 10);
        } else {
          start = parseInt(range, 10);
        }
      }
      
      if (!isNaN(start) && !isNaN(end)) {
        for (let i = start; i <= end; i += step) {
          values.add(i);
        }
      }
    }
    // Handle ranges (e.g., 1-5)
    else if (p.includes('-')) {
      const [startStr, endStr] = p.split('-');
      const start = parseInt(startStr, 10);
      const end = parseInt(endStr, 10);
      if (!isNaN(start) && !isNaN(end)) {
        for (let i = start; i <= end; i++) {
          values.add(i);
        }
      }
    }
    // Single value
    else {
      const val = parseInt(p, 10);
      if (!isNaN(val)) {
        values.add(val);
      }
    }
  }
  
  return { min, max, values: values.size > 0 ? values : null };
}

function parseCronExpression(expr: string): CronField[] | null {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) return null;
  
  const ranges = [
    { min: 0, max: 59 },   // minute
    { min: 0, max: 23 },   // hour
    { min: 1, max: 31 },   // day
    { min: 1, max: 12 },   // month
    { min: 0, max: 6 },    // weekday (0 = Sunday)
  ];
  
  try {
    return parts.map((part, i) => parseCronField(part, ranges[i].min, ranges[i].max));
  } catch {
    return null;
  }
}

function matchesCronField(value: number, field: CronField): boolean {
  if (field.values === null) return true;
  return field.values.has(value);
}

function findNextCronMatch(fields: CronField[], from: Date): Date | null {
  const MAX_ITERATIONS = 366 * 24 * 60; // Max 1 year in minutes
  const current = new Date(from);
  current.setMilliseconds(0);
  current.setSeconds(0);
  current.setMinutes(current.getMinutes() + 1); // Start from next minute
  
  for (let i = 0; i < MAX_ITERATIONS; i++) {
    const minute = current.getMinutes();
    const hour = current.getHours();
    const day = current.getDate();
    const month = current.getMonth() + 1; // 1-12
    const weekday = current.getDay();
    
    if (
      matchesCronField(minute, fields[0]) &&
      matchesCronField(hour, fields[1]) &&
      matchesCronField(day, fields[2]) &&
      matchesCronField(month, fields[3]) &&
      matchesCronField(weekday, fields[4])
    ) {
      return current;
    }
    
    current.setMinutes(current.getMinutes() + 1);
  }
  
  return null;
}

/**
 * Compute the next run time for a schedule
 */
export function computeNextRunAtMs(schedule: CronSchedule, nowMs: number): number | undefined {
  const now = new Date(nowMs);
  
  switch (schedule.kind) {
    case 'at': {
      // One-shot at specific time
      const atMs = new Date(schedule.at).getTime();
      if (isNaN(atMs)) return undefined;
      return atMs > nowMs ? atMs : undefined;
    }
    
    case 'every': {
      // Recurring interval
      const everyMs = Math.max(1000, schedule.everyMs); // Min 1 second
      const anchorMs = schedule.anchorMs ?? nowMs;
      
      if (nowMs < anchorMs) {
        return anchorMs;
      }
      
      const elapsed = nowMs - anchorMs;
      const steps = Math.floor(elapsed / everyMs) + 1;
      return anchorMs + steps * everyMs;
    }
    
    case 'cron': {
      // Cron expression
      const fields = parseCronExpression(schedule.expr);
      if (!fields) return undefined;
      
      const next = findNextCronMatch(fields, now);
      return next?.getTime();
    }
    
    default:
      return undefined;
  }
}

/**
 * Format a schedule for display
 */
export function formatSchedule(schedule: CronSchedule): string {
  switch (schedule.kind) {
    case 'at':
      return `at ${schedule.at}`;
    case 'every': {
      const ms = schedule.everyMs;
      if (ms < 60000) return `every ${ms / 1000}s`;
      if (ms < 3600000) return `every ${Math.floor(ms / 60000)}m`;
      if (ms < 86400000) return `every ${Math.floor(ms / 3600000)}h`;
      return `every ${Math.floor(ms / 86400000)}d`;
    }
    case 'cron':
      return `cron "${schedule.expr}"${schedule.tz ? ` (${schedule.tz})` : ''}`;
    default:
      return 'unknown';
  }
}

/**
 * Common cron expression presets
 */
export const CRON_PRESETS = {
  EVERY_MINUTE: '* * * * *',
  EVERY_5_MINUTES: '*/5 * * * *',
  EVERY_15_MINUTES: '*/15 * * * *',
  EVERY_HOUR: '0 * * * *',
  DAILY: '0 0 * * *',
  WEEKLY: '0 0 * * 0',
  MONTHLY: '0 0 1 * *',
};

/**
 * Human-readable descriptions for cron patterns
 */
export function describeCronExpression(expr: string): string {
  const descriptions: Record<string, string> = {
    [CRON_PRESETS.EVERY_MINUTE]: 'every minute',
    [CRON_PRESETS.EVERY_5_MINUTES]: 'every 5 minutes',
    [CRON_PRESETS.EVERY_15_MINUTES]: 'every 15 minutes',
    [CRON_PRESETS.EVERY_HOUR]: 'every hour',
    [CRON_PRESETS.DAILY]: 'daily at midnight',
    [CRON_PRESETS.WEEKLY]: 'weekly on Sunday',
    [CRON_PRESETS.MONTHLY]: 'monthly on the 1st',
  };
  
  return descriptions[expr] || `cron: ${expr}`;
}
