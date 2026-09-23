import { createServer } from 'node:http';
import { randomInt, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { networkInterfaces } from 'node:os';
import { parseArgs } from 'node:util';
import { ios } from './ios.mjs';
import { android } from './android.mjs';
import { compactTrial, sleep } from './control.mjs';
import { compactBench } from '../report.mjs';
const ROWS = ['expo-filesystem-js', 'worklet-filesystem', 'expo-sqlite'];
const PORT = 48091; // Fixed in the app launch URL and USB forwarding contract.
const DEFAULT_TRIALS = 30, RANDOM_STOP_MAX_MS = 3000, COLD_SAMPLES = 3; // Brief and 2210 sample sizes.
const OPEN_BUDGET_MS = 10000, JOB_BUDGET_MS = 30 * 60 * 1000, WATCH_MS = 250; // Opening verdict vs harness timeout.
const { values: args, positionals } = parseArgs({ allowPositionals: true, options: {
  platform: { type: 'string' }, device: { type: 'string' }, simulator: { type: 'boolean', default: false },
  rows: { type: 'string', default: ROWS.join(',') }, scale: { type: 'string', default: 'both' }, trials: { type: 'string', default: String(DEFAULT_TRIALS) },
} });
const leg = positionals[0], requested = args.rows.split(','), trials = Number(args.trials);
if (!['smoke', 'bench', 'crash'].includes(leg) || !['ios', 'android'].includes(args.platform) || !args.device
  || !['small', 'large', 'both'].includes(args.scale) || !requested.length || requested.some(r => !ROWS.includes(r)) || !Number.isInteger(trials) || trials < 1) throw new Error('Invalid driver arguments');
const rows = ROWS.filter(r => requested.includes(r));
await mkdir(new URL('../.deps/', import.meta.url), { recursive: true });
await mkdir(new URL('../results/', import.meta.url), { recursive: true });
const device = args.platform === 'ios' ? await ios(args.device, args.simulator) : await android(args.device);
const simulator = args.simulator || device.environment.emulator === true;
const host = args.platform === 'android' || simulator ? '127.0.0.1' : Object.values(networkInterfaces()).flat().find(a => a.family === 'IPv4' && !a.internal && a.address.startsWith('192.168.'))?.address
  ?? Object.values(networkInterfaces()).flat().find(a => a.family === 'IPv4' && !a.internal)?.address;
if (!host) throw new Error('No Mac LAN address found');
const origin = `http://${host}:${PORT}`;
const url = args.platform === 'ios' ? origin : `spike2091://driver?url=${encodeURIComponent(origin)}`;
const safeDevice = args.device.replace(/[^\w-]/g, '_');
const out = new URL(`../results/${leg === 'bench' ? 'results' : leg}.${args.platform}.${safeDevice}.json`, import.meta.url);
const versions = JSON.parse(await readFile(new URL('../app/src/versions.json', import.meta.url), 'utf8'));
const report = { environment: { platform: args.platform, device: args.device, ...device.environment, simulator, ...versions, measuredAt: new Date().toISOString() },
  rows, requestedTrials: leg === 'crash' ? trials : undefined, complete: false, results: [], trials: [] };
const save = () => writeFile(out, JSON.stringify(leg === 'bench' ? compactBench(report) : report, null, leg === 'crash' ? undefined : 2) + '\n');
let active;
function settle(error, value) {
  if (!active || active.finished) return;
  active.finished = true;
  if (error) active.reject(error); else active.resolve(value);
}
const server = createServer(async (req, res) => {
  try {
    if (req.method === 'GET' && req.url === '/job') {
      if (!active || active.delivered || active.finished) { res.writeHead(204).end(); return; }
      console.info('GET /job', active.job.type, active.job.row);
      active.delivered = true; res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(active.job)); return;
    }
    if (req.method !== 'POST' || !['/event', '/result'].includes(req.url)) { res.writeHead(404).end(); return; }
    const chunks = []; for await (const chunk of req) chunks.push(chunk);
    const m = JSON.parse(Buffer.concat(chunks).toString());
    if (!active || m.id !== active.job.id || active.finished) { res.writeHead(409).end(); return; }
    if (req.url === '/event') {
      if (m.type === 'seeded') { active.seededAt = performance.now(); active.wal = m.wal; active.seededResolve(); }
      if (m.type === 'started') active.started.push({ tx: m.tx, n: m.n, ids: m.ids });
      if (m.type === 'acked') active.acked.add(m.tx);
      if (m.type === 'begin-retry') active.beginRetries++;
      if (m.type === 'scoring') { active.phase = 'opening'; active.openedAt = performance.now(); }
      if (m.type === 'read') active.phase = 'scored';
      if (m.type === 'memory') active.memory[m.window] = await device.memory();
      if (m.type === 'cell') console.info(active.job.row, active.job.scale, m.name);
    } else {
      Object.assign(report.environment, m.versions);
      if (m.result?.sqlite) report.environment.sqlite = m.result.sqlite;
      settle(m.error ? new Error(m.error) : null, { ...m.result, beginRetries: Math.max(m.beginRetries ?? 0, active.beginRetries), memory: active.memory });
    }
    res.writeHead(200).end('ok');
  } catch (error) { res.writeHead(500).end(String(error)); settle(error); }
});
await new Promise((resolve, reject) => { server.once('error', reject); server.listen(PORT, '0.0.0.0', resolve); });
console.info(`Driver http://${host}:${PORT}; ${out.pathname}; ${simulator ? 'simulator — not evidence' : 'physical device'}`);
await save();
function spec(row, scale) {
  const db = `spike-${randomUUID()}`;
  return { row, scale, db, dir: `spike-2091/${leg}/${row}/${db}`, simulator };
}
async function start(job) {
  let seededResolve; const seeded = new Promise(resolve => { seededResolve = resolve; });
  const promise = new Promise((resolve, reject) => {
    active = { job: { ...job, id: randomUUID() }, resolve, reject, started: [], acked: new Set(), phase: 'launching', memory: {}, beginRetries: 0, seededResolve, launchedAt: performance.now() };
  });
  // Install the rejection handler now, including for writers stopped without a result.
  promise.catch(() => {});
  await device.launch(url);
  return { promise, seeded };
}
async function waitResult(promise) {
  while (!active.finished) {
    const now = performance.now();
    if (active.phase === 'opening' && now - active.openedAt >= OPEN_BUDGET_MS) {
      if (await device.alive()) await device.stop();
      settle(null, { outcome: 'open-failed', reopenMs: null, integrity: 'not checked', inflightPresence: 'unknown', error: 'Reopen/first-read exceeded 10 seconds' });
    } else if (!await device.alive() && !active.finished) {
      if (active.phase === 'opening') settle(null, { outcome: 'open-failed', reopenMs: null, integrity: 'not checked', inflightPresence: 'unknown', error: 'Process exited during open/first read' });
      else settle(new Error(`Harness failure: process died while ${active.phase}`));
    } else if (now - active.launchedAt > JOB_BUDGET_MS) settle(new Error(`Harness timeout while ${active.phase}`));
    if (!active.finished) await sleep(WATCH_MS);
  }
  return promise;
}
async function run(job) {
  const { promise } = await start(job);
  const result = await waitResult(promise);
  if (await device.alive()) await device.stop();
  return result;
}
try {
  for (const row of rows) {
    if (leg === 'crash') {
      for (let trial = 1; trial <= trials; trial++) {
        const input = spec(row), targetStopMs = randomInt(RANDOM_STOP_MAX_MS + 1);
        const { promise, seeded } = await start({ ...input, type: 'crash-write' });
        while (!active.seededAt) {
          if (active.finished) { await promise; throw new Error('Writer returned before seed'); }
          if (!await device.alive() || performance.now() - active.launchedAt > JOB_BUDGET_MS) throw new Error('Harness failure before seeded event');
          await Promise.race([seeded, sleep(WATCH_MS)]);
        }
        await sleep(Math.max(0, targetStopMs - (performance.now() - active.seededAt)));
        const stopMs = performance.now() - active.seededAt;
        try {
          await device.stop();
        } catch (error) {
          if (error.code !== 'ESRCH' && !/No such process|target exited before requested stop/i.test(String(error))) throw error;
          active.finished = true;
          const snapshot = { acked: active.started.filter(t => active.acked.has(t.tx)),
            inflight: active.started.find(t => !active.acked.has(t.tx)) ?? null };
          report.trials.push(compactTrial({ row, trial, targetStopMs, stopMs, snapshot,
            ackedCount: snapshot.acked.length, inflightTx: snapshot.inflight?.tx ?? null,
            inflightSize: snapshot.inflight?.n ?? 0, outcome: 'harness-failed', error: String(error.stack ?? error) }));
          await save(); console.error(row, trial, 'harness-failed', String(error));
          continue;
        }
        const stopped = active;
        if (stopped.finished) { await promise; throw new Error('Writer returned before requested stop'); }
        stopped.finished = true;
        const inflights = stopped.started.filter(t => !stopped.acked.has(t.tx));
        if (inflights.length > 1) throw new Error('More than one in-flight transaction');
        const snapshot = { acked: stopped.started.filter(t => stopped.acked.has(t.tx)), inflight: inflights[0] ?? null };
        const recovered = await run({ ...input, type: 'crash-score', snapshot });
        const record = compactTrial({ row, trial, targetStopMs, stopMs, snapshot, ackedCount: snapshot.acked.length, wal: stopped.wal, writerBeginRetries: stopped.beginRetries,
          inflightTx: snapshot.inflight?.tx ?? null, inflightSize: snapshot.inflight?.n ?? 0, ...recovered });
        report.trials.push(record); await save(); console.info(row, trial, record.outcome, `acked=${record.ackedCount}`);
      }
    } else {
      for (const scale of leg === 'smoke' ? [undefined] : args.scale === 'both' ? ['small', 'large'] : [args.scale]) {
        const input = spec(row, scale), result = await run({ ...input, type: leg });
        if (leg === 'bench' && scale === 'large') {
          const samples = [];
          for (let i = 0; i <= COLD_SAMPLES; i++) { const cold = await run({ ...input, type: 'cold-open' }); if (i) samples.push({ ms: cold.ms, rows: 1 }); }
          result.cells.push({ name: 'cold-open-first-read', samples });
        }
        report.results.push({ engine: row, scale, dir: input.dir, db: input.db, ...result }); await save();
        if (leg === 'smoke') console.info(row, result.scenarios.filter(s => !s.pass).length, 'divergences');
      }
    }
  }
  report.complete = !report.trials.some(t => t.outcome === 'harness-failed');
  if (!report.complete) process.exitCode = 1;
  await save();
} catch (error) { report.fatal = String(error.stack ?? error); await save(); process.exitCode = 1; console.error(error); }
finally {
  if (await device.alive()) await device.stop();
  server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
}
