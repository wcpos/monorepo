import { spawn } from 'node:child_process';
import { randomInt, randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import assert from 'node:assert/strict';
import { rows, directory, environment } from './engines.mjs';
const { values: args } = parseArgs({ options: { trials: { type: 'string', default: '30' }, out: { type: 'string' }, rows: { type: 'string', default: rows.join(',') } } });
assert(Number.isInteger(Number(args.trials)) && Number(args.trials) > 0, 'Invalid trial count');
assert(args.rows.split(',').every(r => rows.includes(r)), 'Invalid rows');
const env = await environment(), out = args.out ?? join(directory, `crash.${env.platform}.json`);
const report = { environment: env, requestedTrials: Number(args.trials), rows: rows.filter(r => args.rows.split(',').includes(r)), complete: false, trials: [] };
const save = () => writeFile(out, JSON.stringify(report, null, 2) + '\n');
const childPath = fileURLToPath(new URL(`crash-child${extname(fileURLToPath(import.meta.url))}`, import.meta.url));
const launch = (spec, score = false) => spawn(process.execPath, [childPath, '--row', spec.row, '--dir', spec.dir, '--db', spec.db, ...(score ? ['--score'] : [])], { stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
async function stop(spec) {
  return new Promise((resolve, reject) => {
    const child = launch(spec), started = [], acked = new Set();
    let timer, stderr = '', seededAt, stopMs, killed = false, wal;
    const targetStopMs = randomInt(0, 3001);
    child.stdout.resume(); child.stderr.on('data', b => { stderr += b; });
    child.on('error', reject);
    child.on('message', m => {
      if (m.type === 'seeded') {
        seededAt = performance.now(); wal = m.wal;
        timer = setTimeout(() => { stopMs = performance.now() - seededAt; killed = child.kill('SIGKILL'); }, targetStopMs);
      } else if (m.type === 'started') started.push({ tx: m.tx, n: m.n, ids: m.ids });
      else if (m.type === 'acked') acked.add(m.tx);
    });
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      if (!killed || seededAt === undefined) return reject(new Error(`Writer failed before requested stop (${code}/${signal}): ${stderr}`));
      const inflights = started.filter(t => !acked.has(t.tx));
      if (inflights.length > 1) return reject(new Error('IPC record contains multiple in-flight transactions'));
      resolve({ snapshot: { acked: started.filter(t => acked.has(t.tx)), inflight: inflights[0] ?? null }, targetStopMs, stopMs, wal });
    });
  });
}
async function recover(spec, snapshot) {
  return new Promise((resolve, reject) => {
    const child = launch(spec, true); let output = '', stderr = '', timer, error, phase = 'launching';
    child.stdout.on('data', b => { output += b; }); child.stderr.on('data', b => { stderr += b; });
    // A rejected or stuck open/first read gets the same specified 10-second budget.
    child.on('message', m => {
      if (m.type === 'scoring') { phase = 'opening'; timer = setTimeout(() => { error = 'Reopen/first-read exceeded 10 seconds'; child.kill('SIGKILL'); }, 10000); }
      if (m.type === 'read') { phase = 'scored'; clearTimeout(timer); }
    });
    child.on('error', e => { error = String(e); });
    child.send(snapshot, e => { if (e) { error = String(e); child.kill('SIGKILL'); } });
    child.on('close', code => {
      clearTimeout(timer);
      if (code === 0) { try { return resolve(JSON.parse(output)); } catch (e) { error = String(e); } }
      // Only a failure while the storage is opening or serving its first read is a storage verdict.
      // A scorer that died before it began or after it had read is a harness failure: the run is
      // incomplete (the outer handler records `fatal`), never a trial outcome.
      if (phase !== 'opening') return reject(new Error(`Scorer failed while ${phase} (exit ${code}): ${error ?? stderr}`));
      resolve({ outcome: 'open-failed', reopenMs: null, integrity: 'not checked', error: error ?? stderr, inflightPresence: 'unknown' });
    });
  });
}
await save();
try {
  for (const row of report.rows) for (let trial = 1; trial <= report.requestedTrials; trial++) {
    const db = `crash-${randomUUID()}`, spec = { row, db, dir: join(directory, '.data', 'crash', row, db) };
    const { snapshot, ...stopped } = await stop(spec), recovered = await recover(spec, snapshot);
    const record = { row, trial, ...stopped, ackedCount: snapshot.acked.length,
      inflightTx: snapshot.inflight?.tx ?? null, inflightSize: snapshot.inflight?.n ?? 0, inflightPresence: 'unknown', ...recovered };
    report.trials.push(record); await save();
    console.info(row, trial, record.outcome, `acked=${record.ackedCount}`, `inflight=${record.inflightPresence}`, `wal=${record.wal}`);
  }
  report.complete = true; await save();
} catch (error) { report.fatal = String(error.stack ?? error); await save(); throw error; }
