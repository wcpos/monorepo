import { setTimeout as delay } from 'node:timers/promises';
import { execFile } from 'node:child_process';
import { isDeepStrictEqual, promisify } from 'node:util';
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
export const hasResult = (result, leg) => result.outcome !== 'harness-failed'
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
