import test from 'node:test';
import assert from 'node:assert/strict';
import { computeNextRunAtMs } from '../src/cron/scheduler';

test('computeNextRunAtMs(at) returns future timestamp', () => {
  const now = Date.now();
  const at = new Date(now + 5_000).toISOString();

  const next = computeNextRunAtMs({ kind: 'at', at }, now);

  assert.equal(next, new Date(at).getTime());
});

test('computeNextRunAtMs(at) returns undefined for past timestamp', () => {
  const now = Date.now();
  const at = new Date(now - 5_000).toISOString();

  const next = computeNextRunAtMs({ kind: 'at', at }, now);

  assert.equal(next, undefined);
});

test('computeNextRunAtMs(every) computes next interval from anchor', () => {
  const anchorMs = 1_700_000_000_000;
  const now = anchorMs + 12_500;

  const next = computeNextRunAtMs({ kind: 'every', everyMs: 5_000, anchorMs }, now);

  assert.equal(next, anchorMs + 15_000);
});

test('computeNextRunAtMs(every) clamps to minimum 1 second', () => {
  const anchorMs = 1_700_000_000_000;
  const now = anchorMs;

  const next = computeNextRunAtMs({ kind: 'every', everyMs: 10, anchorMs }, now);

  assert.equal(next, anchorMs + 1_000);
});

test('computeNextRunAtMs(cron) returns next minute for * * * * *', () => {
  const now = new Date('2026-03-23T10:20:15.000Z').getTime();

  const next = computeNextRunAtMs({ kind: 'cron', expr: '* * * * *' }, now);

  assert.equal(next, new Date('2026-03-23T10:21:00.000Z').getTime());
});
