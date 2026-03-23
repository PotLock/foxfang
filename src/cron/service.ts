/**
 * Cron Service
 * 
 * Main scheduler service that manages cron job execution.
 */

import type { CronJob, CronRunLog, CronJobCreate, CronJobPatch } from './types';
import { computeNextRunAtMs, formatSchedule } from './scheduler';
import {
  initCronTables,
  createJob,
  updateJob,
  updateJobState,
  getJob,
  listJobs,
  getPendingJobs,
  deleteJob,
  createRunLog,
  updateRunLog,
  getRunLogs,
} from './store';

// Dependencies interface for the service
export interface CronServiceDeps {
  executeJob: (job: CronJob) => Promise<{ success: boolean; output?: string; error?: string; sessionId?: string }>;
  deliverResult?: (job: CronJob, result: { success: boolean; output?: string; error?: string }) => Promise<{ success: boolean; error?: string }>;
  onError?: (error: Error) => void;
}

export class CronService {
  private deps: CronServiceDeps;
  private timer: NodeJS.Timeout | null = null;
  private runningJobs = new Map<string, CronRunLog | null>();
  private isStarted = false;
  private static readonly MAX_SLEEP_MS = 60_000;
  private static readonly MIN_SLEEP_MS = 1_000;

  constructor(deps: CronServiceDeps) {
    this.deps = deps;
    initCronTables();
  }

  /**
   * Start the cron service
   */
  start(): void {
    if (this.isStarted) return;
    this.isStarted = true;

    // Compute initial next run times for jobs without them
    this.initializeJobs();

    // Start the timer
    this.scheduleNextCheck();

    console.log('[CronService] Started');
  }

  /**
   * Stop the cron service
   */
  stop(): void {
    this.isStarted = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    console.log('[CronService] Stopped');
  }

  /**
   * Get service status
   */
  status(): { running: boolean; jobsCount: number; runningJobsCount: number } {
    return {
      running: this.isStarted,
      jobsCount: listJobs(true).length,
      runningJobsCount: this.runningJobs.size,
    };
  }

  /**
   * Add a new job
   */
  async add(input: CronJobCreate): Promise<CronJob> {
    const job = createJob(input);
    
    // Compute initial next run time
    const nextRunAtMs = computeNextRunAtMs(job.schedule, Date.now());
    if (nextRunAtMs) {
      updateJobState(job.id, { nextRunAtMs });
      job.state.nextRunAtMs = nextRunAtMs;
    }

    console.log(`[CronService] Added job: ${job.name} (${job.id}) - Next run: ${nextRunAtMs ? new Date(nextRunAtMs).toISOString() : 'never'}`);
    this.wake();
    return job;
  }

  /**
   * Update an existing job
   */
  async update(id: string, patch: CronJobPatch): Promise<CronJob | null> {
    const job = updateJob(id, patch);
    if (!job) return null;

    // Recompute next run time if schedule changed
    if (patch.schedule) {
      const nextRunAtMs = computeNextRunAtMs(job.schedule, Date.now());
      updateJobState(id, { nextRunAtMs });
      job.state.nextRunAtMs = nextRunAtMs;
    }

    console.log(`[CronService] Updated job: ${job.name} (${job.id})`);
    this.wake();
    return job;
  }

  /**
   * Remove a job
   */
  async remove(id: string): Promise<boolean> {
    const job = getJob(id);
    if (!job) return false;

    // Kill if running
    const runningLog = this.runningJobs.get(id);
    if (this.runningJobs.has(id)) {
      if (runningLog) {
        // Mark as killed
        updateRunLog(runningLog.id, {
          status: 'error',
          error: 'Job removed while running',
          endedAtMs: Date.now(),
        });
      }
      this.runningJobs.delete(id);
    }

    deleteJob(id);
    console.log(`[CronService] Removed job: ${job.name} (${id})`);
    this.wake();
    return true;
  }

  /**
   * Get a job by ID
   */
  getJob(id: string): CronJob | null {
    return getJob(id);
  }

  /**
   * List all jobs
   */
  list(includeDisabled = false): CronJob[] {
    return listJobs(includeDisabled);
  }

  /**
   * Run a job immediately (manual trigger)
   */
  async run(id: string): Promise<{ success: boolean; error?: string }> {
    const job = getJob(id);
    if (!job) {
      return { success: false, error: 'Job not found' };
    }

    if (this.runningJobs.has(id)) {
      return { success: false, error: 'Job already running' };
    }

    this.runningJobs.set(id, null);
    await this.executeJobInternal(job);
    return { success: true };
  }

  /**
   * Get run history for a job
   */
  getRuns(id: string, limit = 10): CronRunLog[] {
    return getRunLogs(id, limit);
  }

  /**
   * Initialize jobs without next run times
   */
  private initializeJobs(): void {
    const jobs = listJobs(true);
    const now = Date.now();

    for (const job of jobs) {
      if (!job.enabled) continue;
      
      if (!job.state.nextRunAtMs) {
        const nextRunAtMs = computeNextRunAtMs(job.schedule, now);
        if (nextRunAtMs) {
          updateJobState(job.id, { nextRunAtMs });
        }
      }
    }
  }

  /**
   * Schedule the next check
   */
  private scheduleNextCheck(): void {
    if (!this.isStarted) return;

    const sleepMs = this.computeSleepMs();

    this.timer = setTimeout(() => {
      this.checkAndRunJobs().catch(err => {
        console.error('[CronService] Error checking jobs:', err);
        this.deps.onError?.(err);
      });
    }, sleepMs);
  }

  /**
   * Compute sleep duration until next job check
   */
  private computeSleepMs(): number {
    const jobs = listJobs(false);
    const now = Date.now();

    let earliestNextRunAtMs: number | null = null;
    for (const job of jobs) {
      const nextRunAtMs = job.state.nextRunAtMs;
      if (!nextRunAtMs) continue;
      if (earliestNextRunAtMs === null || nextRunAtMs < earliestNextRunAtMs) {
        earliestNextRunAtMs = nextRunAtMs;
      }
    }

    if (earliestNextRunAtMs === null) {
      return CronService.MAX_SLEEP_MS;
    }

    const deltaMs = earliestNextRunAtMs - now;
    if (deltaMs <= 0) {
      return CronService.MIN_SLEEP_MS;
    }

    return Math.max(CronService.MIN_SLEEP_MS, Math.min(deltaMs, CronService.MAX_SLEEP_MS));
  }

  /**
   * Wake scheduler and re-arm timer with latest schedule
   */
  private wake(): void {
    if (!this.isStarted) return;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.scheduleNextCheck();
  }

  /**
   * Check for pending jobs and run them
   */
  private async checkAndRunJobs(): Promise<void> {
    if (!this.isStarted) return;

    const now = Date.now();
    const pendingJobs = getPendingJobs(now);

    for (const job of pendingJobs) {
      // Skip if already running
      if (this.runningJobs.has(job.id)) continue;

      this.runningJobs.set(job.id, null);

      // Execute the job
      this.executeJobInternal(job).catch(err => {
        console.error(`[CronService] Error executing job ${job.id}:`, err);
      });
    }

    // Schedule next check
    this.scheduleNextCheck();
  }

  /**
   * Execute a job internally
   */
  private async executeJobInternal(job: CronJob): Promise<void> {
    const startTime = Date.now();
    
    // Create run log
    const runLog = createRunLog({
      jobId: job.id,
      startedAtMs: startTime,
      status: 'running',
    });
    
    this.runningJobs.set(job.id, runLog);
    updateJobState(job.id, { runningAtMs: startTime, lastRunStatus: 'running' });

    console.log(`[CronService] Executing job: ${job.name} (${job.id})`);

    try {
      // Execute the job
      const result = await this.deps.executeJob(job);
      const endTime = Date.now();

      // Update run log
      updateRunLog(runLog.id, {
        status: result.success ? 'ok' : 'error',
        error: result.error,
        output: result.output,
        sessionId: result.sessionId,
        endedAtMs: endTime,
      });

      // Update job state
      const consecutiveErrors = result.success ? 0 : (job.state.consecutiveErrors || 0) + 1;
      const nextRunAtMs = job.deleteAfterRun ? undefined : computeNextRunAtMs(job.schedule, endTime);
      
      updateJobState(job.id, {
        lastRunAtMs: startTime,
        lastRunStatus: result.success ? 'ok' : 'error',
        lastError: result.error,
        consecutiveErrors,
        nextRunAtMs,
      });

      // Handle delivery if configured
      if (job.delivery && job.delivery.mode !== 'none' && this.deps.deliverResult) {
        const deliveryResult = await this.deps.deliverResult(job, result);
        updateRunLog(runLog.id, {
          deliveryStatus: deliveryResult.success ? 'delivered' : 'not-delivered',
          deliveryError: deliveryResult.error,
        });
      }

      // Handle failure alert
      if (!result.success && job.failureAlert && job.failureAlert.after !== undefined) {
        if (consecutiveErrors >= job.failureAlert.after) {
          const lastAlert = job.state.lastFailureAlertAtMs || 0;
          const cooldown = job.failureAlert.cooldownMs || 3600000; // Default 1 hour
          
          if (Date.now() - lastAlert > cooldown) {
            // Send failure alert
            console.log(`[CronService] Failure alert for job ${job.id}: ${consecutiveErrors} consecutive failures`);
            updateJobState(job.id, { lastFailureAlertAtMs: Date.now() });
          }
        }
      }

      // Delete one-shot jobs after run
      if (job.deleteAfterRun && job.schedule.kind === 'at') {
        deleteJob(job.id);
        console.log(`[CronService] Deleted one-shot job: ${job.name} (${job.id})`);
      }

      console.log(`[CronService] Job ${job.name} (${job.id}) completed: ${result.success ? 'success' : 'error'}`);

    } catch (error) {
      const endTime = Date.now();
      const errorMsg = error instanceof Error ? error.message : String(error);

      updateRunLog(runLog.id, {
        status: 'error',
        error: errorMsg,
        endedAtMs: endTime,
      });

      updateJobState(job.id, {
        lastRunAtMs: startTime,
        lastRunStatus: 'error',
        lastError: errorMsg,
        consecutiveErrors: (job.state.consecutiveErrors || 0) + 1,
        nextRunAtMs: computeNextRunAtMs(job.schedule, endTime),
      });

      console.error(`[CronService] Job ${job.name} (${job.id}) failed:`, errorMsg);
    } finally {
      this.runningJobs.delete(job.id);
    }
  }
}
