import { setTimeout as delay } from 'node:timers/promises';
import { execFile } from 'node:child_process';
import { format, isDeepStrictEqual, promisify } from 'node:util';
export const bundle = 'com.wcpos.spike2091';
const COMMAND_TIMEOUT_MS = 60000; // Device commands must not leave a run waiting indefinitely.
export async function command(file, args, allowFailure = false, timeout = COMMAND_TIMEOUT_MS, signal) {
  try { return (await promisify(execFile)(file, args, { encoding: 'utf8', timeout, signal })).stdout.trim(); }
  catch (error) { if (allowFailure && error.code === 1) return ''; throw error; }
}
export const sleep = (ms, signal) => delay(ms, undefined, { signal });
export async function confirmStopped(alive) {
  const STOP_BUDGET_MS = 5000, CHECK_MS = 100; // Allow OS process teardown, never score a stop that did not land.
  const start = performance.now();
  while (await alive()) {
    if (performance.now() - start > STOP_BUDGET_MS) throw new Error('Harness failure: process still alive after stop');
    await sleep(CHECK_MS);
  }
}

const TRIAL_LOG_LIMIT = 20; // Keep reopen diagnostics bounded in committed crash evidence.
export function compactTrial({ snapshot, logs = [], ...record }) {
  return { ...record, acked: snapshot.acked.map(({ tx, n }) => ({ tx, n })),
    logs: logs.slice(0, TRIAL_LOG_LIMIT), logsTruncated: Math.max(0, logs.length - TRIAL_LOG_LIMIT) };
}

export const isHarnessFailure = error => /Harness (failure|timeout)/i.test(String(error));
export const hasResult = (result, leg) => !['harness-failed', 'app-failed'].includes(result.outcome)
  && Boolean(leg === 'smoke' ? result.scenarios?.length : result.cells?.length);

export function prepareReport(current, previous, versions, scales) {
  const run = { startedAt: current.environment.measuredAt, rows: current.rows, scales };
  if (!previous) return { ...current, environment: { ...current.environment, runs: [run] } };
  for (const key of ['device', 'platform', ...Object.keys(versions)]) {
    if (!isDeepStrictEqual(previous.environment[key], current.environment[key])) throw new Error(`Cannot resume: environment.${key} differs`);
  }
  const runs = previous.environment.runs ?? [{ startedAt: previous.environment.measuredAt, rows: previous.rows,
    scales: [...new Set((previous.results ?? []).map(r => r.scale).filter(Boolean))] }];
  return { ...current, rows: [...new Set([...previous.rows, ...current.rows])],
    requestedTrials: Math.max(previous.requestedTrials ?? 0, current.requestedTrials ?? 0) || undefined,
    environment: { ...previous.environment, ...current.environment, runs: [...runs, run] },
    results: previous.results ?? [], trials: previous.trials ?? [] };
}

export const IDLE_BUDGET_MS = 10 * 60 * 1000; // Long jobs stay alive only while the app reports work.
export const JOB_HARD_CAP_MS = 4 * 60 * 60 * 1000; // Bound even a continuously reporting job.
const SEED_LOG_MS = 60 * 1000; // One seed progress line per minute per job, not per collection.
export function log(level, ...values) {
  for (const line of format(...values).split('\n')) console[level](new Date().toISOString(), line);
}
export function jobMessage(active, message, now) {
  active.lastMessageAt = now;
  if (['bench', 'smoke', 'cold-open'].includes(active.job.type)) active.phase = 'running';
  if (message.type === 'progress' && message.stage === 'seed'
    && (active.seedLoggedAt === undefined || now - active.seedLoggedAt >= SEED_LOG_MS)) {
    active.seedLoggedAt = now;
    return `${active.job.row} ${active.job.scale} seed ${message.collection} ${message.done}/${message.total}`;
  }
}
export function jobTimeout(active, now) {
  if (now - active.launchedAt >= JOB_HARD_CAP_MS)
    return new Error(`Harness timeout: job exceeded 4 hours while ${active.phase}`);
  if (now - (active.lastMessageAt ?? active.launchedAt) >= IDLE_BUDGET_MS)
    return new Error(`Harness timeout: no message from the app for 10 minutes while ${active.phase}`);
}
