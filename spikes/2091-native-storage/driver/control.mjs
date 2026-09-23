import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
export const bundle = 'com.wcpos.spike2091';
const COMMAND_TIMEOUT_MS = 60000; // Device commands must not leave a run waiting indefinitely.
export async function command(file, args, allowFailure = false) {
  try { return (await promisify(execFile)(file, args, { encoding: 'utf8', timeout: COMMAND_TIMEOUT_MS })).stdout.trim(); }
  catch (error) { if (allowFailure && error.code === 1) return ''; throw error; }
}
export const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
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
