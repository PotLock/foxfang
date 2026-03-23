import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import type { CronJob, CronRunLog } from '../src/cron/types';

const requireForTest = createRequire(import.meta.url);

interface StoreState {
  jobs: Map<string, CronJob>;
  logs: Map<string, CronRunLog>;
  logCounter: number;
}

function createStoreState(): StoreState {
  return {
    jobs: new Map<string, CronJob>(),
    logs: new Map<string, CronRunLog>(),
    logCounter: 0,
  };
}

function createJob(id: string, name: string, nextRunAtMs?: number): CronJob {
  const now = Date.now();
  return {
    id,
    name,
    enabled: true,
    createdAtMs: now,
    updatedAtMs: now,
    schedule: { kind: 'every', everyMs: 1_000 },
    sessionTarget: 'isolated',
    wakeMode: 'next-heartbeat',
    payload: { kind: 'systemEvent', text: 'test' },
    state: {
      nextRunAtMs,
      consecutiveErrors: 0,
    },
  };
}

function installStoreMock(state: StoreState): { restore: () => void; CronService: any } {
  const storePath = requireForTest.resolve('../src/cron/store');
  const servicePath = requireForTest.resolve('../src/cron/service');
  delete (requireForTest as any).cache[storePath];
  delete (requireForTest as any).cache[servicePath];

  const store = requireForTest('../src/cron/store');
  const original = {
    initCronTables: store.initCronTables,
    createJob: store.createJob,
    updateJob: store.updateJob,
    updateJobState: store.updateJobState,
    getJob: store.getJob,
    listJobs: store.listJobs,
    getPendingJobs: store.getPendingJobs,
    deleteJob: store.deleteJob,
    createRunLog: store.createRunLog,
    updateRunLog: store.updateRunLog,
    getRunLogs: store.getRunLogs,
  };

  (store as any).initCronTables = () => {};
  (store as any).createJob = (input: any) => {
    const id = `job-${state.jobs.size + 1}`;
    const now = Date.now();
    const job: CronJob = {
      id,
      name: input.name,
      description: input.description,
      enabled: input.enabled ?? true,
      deleteAfterRun: input.deleteAfterRun,
      createdAtMs: now,
      updatedAtMs: now,
      agentId: input.agentId,
      sessionKey: input.sessionKey,
      schedule: input.schedule,
      sessionTarget: input.sessionTarget ?? 'isolated',
      wakeMode: input.wakeMode ?? 'next-heartbeat',
      payload: input.payload,
      delivery: input.delivery,
      failureAlert: input.failureAlert,
      state: { nextRunAtMs: undefined, consecutiveErrors: 0 },
    };
    state.jobs.set(id, job);
    return job;
  };
  (store as any).updateJob = (id: string, patch: any) => {
    const current = state.jobs.get(id);
    if (!current) return null;
    const next: CronJob = {
      ...current,
      ...patch,
      updatedAtMs: Date.now(),
      state: { ...current.state },
    };
    state.jobs.set(id, next);
    return next;
  };
  (store as any).updateJobState = (id: string, patch: any) => {
    const current = state.jobs.get(id);
    if (!current) return;
    state.jobs.set(id, {
      ...current,
      state: {
        ...current.state,
        ...patch,
      },
      updatedAtMs: Date.now(),
    });
  };
  (store as any).getJob = (id: string) => state.jobs.get(id) ?? null;
  (store as any).listJobs = (includeDisabled = false) => {
    const all = Array.from(state.jobs.values());
    return includeDisabled ? all : all.filter((job) => job.enabled);
  };
  (store as any).getPendingJobs = (nowMs: number) => {
    return Array.from(state.jobs.values()).filter(
      (job) => job.enabled && !!job.state.nextRunAtMs && job.state.nextRunAtMs <= nowMs,
    );
  };
  (store as any).deleteJob = (id: string) => {
    state.jobs.delete(id);
  };
  (store as any).createRunLog = (input: { jobId: string; startedAtMs: number; status: 'running' }) => {
    const id = `run-${++state.logCounter}`;
    const runLog: CronRunLog = {
      id,
      jobId: input.jobId,
      startedAtMs: input.startedAtMs,
      status: input.status,
    };
    state.logs.set(id, runLog);
    return runLog;
  };
  (store as any).updateRunLog = (id: string, patch: Partial<CronRunLog>) => {
    const current = state.logs.get(id);
    if (!current) return;
    state.logs.set(id, { ...current, ...patch });
  };
  (store as any).getRunLogs = (jobId: string, limit = 10) => {
    return Array.from(state.logs.values())
      .filter((log) => log.jobId === jobId)
      .sort((a, b) => b.startedAtMs - a.startedAtMs)
      .slice(0, limit);
  };

  const restore = () => {
    (store as any).initCronTables = original.initCronTables;
    (store as any).createJob = original.createJob;
    (store as any).updateJob = original.updateJob;
    (store as any).updateJobState = original.updateJobState;
    (store as any).getJob = original.getJob;
    (store as any).listJobs = original.listJobs;
    (store as any).getPendingJobs = original.getPendingJobs;
    (store as any).deleteJob = original.deleteJob;
    (store as any).createRunLog = original.createRunLog;
    (store as any).updateRunLog = original.updateRunLog;
    (store as any).getRunLogs = original.getRunLogs;
  };

  const { CronService } = requireForTest('../src/cron/service');
  return { restore, CronService };
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

test('run enforces mutex and prevents duplicate concurrent execution', async () => {
  const state = createStoreState();
  state.jobs.set('job-1', createJob('job-1', 'mutex-test'));
  const { restore, CronService } = installStoreMock(state);

  try {
    const service = new CronService({
      executeJob: async () => {
        await delay(150);
        return { success: true, output: 'ok' };
      },
    });

    const firstRun = service.run('job-1');
    await delay(10);
    const secondRun = await service.run('job-1');
    const firstResult = await firstRun;

    assert.equal(secondRun.success, false);
    assert.equal(secondRun.error, 'Job already running');
    assert.equal(firstResult.success, true);
  } finally {
    restore();
  }
});

test('computeSleepMs clamps between 1s and 60s based on nearest run', () => {
  const state = createStoreState();
  const { restore, CronService } = installStoreMock(state);

  try {
    const service = new CronService({
      executeJob: async () => ({ success: true }),
    });

    const none = (service as any).computeSleepMs();
    assert.equal(none, 60_000);

    const now = Date.now();
    state.jobs.set('a', createJob('a', 'soon', now + 300));
    const minClamped = (service as any).computeSleepMs();
    assert.equal(minClamped, 1_000);

    state.jobs.set('b', createJob('b', 'later', now + 120_000));
    const withSoonerStill = (service as any).computeSleepMs();
    assert.equal(withSoonerStill, 1_000);

    state.jobs.delete('a');
    const maxClamped = (service as any).computeSleepMs();
    assert.equal(maxClamped, 60_000);
  } finally {
    restore();
  }
});

test('add/update/remove trigger wake re-arm behavior while started', async () => {
  const state = createStoreState();
  const { restore, CronService } = installStoreMock(state);

  try {
    const service = new CronService({
      executeJob: async () => ({ success: true }),
    });

    let wakeCount = 0;
    const originalWake = (service as any).wake.bind(service);
    (service as any).wake = () => {
      wakeCount += 1;
      return originalWake();
    };

    service.start();

    const job = await service.add({
      name: 'wake-test',
      schedule: { kind: 'every', everyMs: 5_000 },
      payload: { kind: 'systemEvent', text: 'hello' },
      enabled: true,
    });

    await service.update(job.id, {
      schedule: { kind: 'every', everyMs: 10_000 },
    });

    await service.remove(job.id);
    service.stop();

    assert.equal(wakeCount, 3);
  } finally {
    restore();
  }
});
