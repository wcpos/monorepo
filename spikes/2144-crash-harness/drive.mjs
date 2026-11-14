import childProcess from 'node:child_process';
import { once } from 'node:events';
import { readFile, writeFile, readdir, mkdtemp, rm } from 'node:fs/promises';
import { arch, cpus, platform, release, tmpdir } from 'node:os';
import { basename, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { randomUUID } from 'node:crypto';
import { chromium, firefox, webkit } from 'playwright';
const directory = fileURLToPath(new URL('.', import.meta.url));
const { values: args } = parseArgs({ options: { browser: { type: 'string', default: 'chrome' },
  cells: { type: 'string', default: 'A,B,E,F,G,C,D' }, bundles: { type: 'string', default: resolve(directory, '.build') }, out: { type: 'string' } } });
if (!['chrome', 'firefox', 'webkit'].includes(args.browser) || args.cells.split(',').some(c => !'ABCDEFG'.includes(c) || c.length !== 1)) throw new Error('Invalid browser or cells');
const origin = 'http://localhost:18998', type = { chrome: chromium, firefox, webkit }[args.browser];
const QUOTA_BYTES = 64 * 1024 * 1024; // 2000 ~2 KiB seed rows need room for SQLite pages and WAL/journal copies.
const bundles = Object.fromEntries(await Promise.all((await readdir(args.bundles)).map(async name => [name, await readFile(resolve(args.bundles, name))])));
const out = args.out ?? resolve(directory, `results.${args.browser}.json`), trials = [], skips = [];
const environment = { browser: args.browser, browserVersion: null, os: `${platform()} ${release()} ${arch()}`, cpu: cpus()[0]?.model,
  node: process.version, versions: JSON.parse(bundles['versions.json']), measuredAt: new Date().toISOString() };
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
let current, fatal;
const HEAVY = ['dryTrace', 'trace', 'snapshot', 'logs', 'workerErrors', 'preStopDiagnostics', 'dryMainWrites'];
const slim = t => { const c = { ...t }; for (const k of HEAVY) delete c[k]; if (c.leftBehind?.trace) delete c.leftBehind.trace; return c; };
async function save() { await writeFile(out, JSON.stringify({ environment, trials: trials.map(slim), skips, ...(fatal ? { fatal } : {}) }, null, 2) + '\n'); }
async function launch(profile, quota = false) {
  // Persistent BrowserContext has no public process(). Observe only this launch's
  // spawn whose arguments contain OUR fresh profile, restoring spawn immediately.
  const original = childProcess.spawn; let processHandle;
  childProcess.spawn = function (command, argv, options) {
    const child = original.call(this, command, argv, options);
    if (argv?.some(a => String(a).includes(profile))) processHandle = child;
    return child;
  };
  let context;
  try {
    context = await type.launchPersistentContext(profile, { ...(args.browser === 'chrome' ? { channel: 'chrome' } : {}),
      ...(quota && args.browser === 'firefox' ? { firefoxUserPrefs: { 'dom.quotaManager.temporaryStorage.fixedLimit': QUOTA_BYTES / 1024 } } : {}) });
  } finally { childProcess.spawn = original; }
  current = context;
  if (!processHandle?.pid) { await context.close(); throw new Error('Could not identify the process spawned for this profile; refusing to simulate a process stop'); }
  environment.browserVersion = context.browser().version();
  const diagnostics = [];
  context.on('console', m => diagnostics.push({ type: m.type(), text: m.text() }));
  context.on('weberror', e => diagnostics.push({ type: 'error', text: String(e.error()) }));
  // Context routing also catches worker-originated wasm/importScripts fetches.
  await context.route(origin + '/**', route => {
    const name = basename(new URL(route.request().url()).pathname) || 'index.html', body = bundles[name];
    return route.fulfill({ status: body ? 200 : 404, headers: { 'Cross-Origin-Opener-Policy': 'same-origin', 'Cross-Origin-Embedder-Policy': 'require-corp' },
      contentType: name.endsWith('.wasm') ? 'application/wasm' : name.endsWith('.json') ? 'application/json' : name.endsWith('.html') ? 'text/html' : 'text/javascript', body: body ?? 'Not found' });
  });
  const page = context.pages()[0] ?? await context.newPage();
  await page.goto(origin); await page.waitForFunction(() => typeof globalThis.runCells === 'function');
  return { context, page, processHandle, diagnostics };
}
const makeSpec = (cell, mode, trial) => ({ cell, mode, row: mode ? 'sqlite-sahpool' : 'opfs-shipped', cache: 'default', trial,
  name: 'crash-' + randomUUID(), pool: 'crash-' + randomUUID() });
const failure = (spec, e) => ({ ...spec, journalMode: spec.mode, cacheSize: null, boundary: null, stopMs: null, ackedCount: 0,
  inflightPresent: null, reacquireMs: null, reopenMs: null, outcome: 'open-failed', error: { name: e.name, message: e.message } });
async function unlock(profile) {
  for (const name of ['SingletonLock', 'SingletonSocket', 'SingletonCookie']) await rm(join(profile, name), { force: true });
}
async function processTrials() {
  for (const mode of ['WAL', 'DELETE', null]) {
    const profile = await mkdtemp(join(tmpdir(), 'spike2144-process-')); let run;
    try {
      for (let trial = 1; trial <= 10; trial++) {
        if (fatal) break;
        const spec = makeSpec('process-stop', mode, trial); let snapshot, record, killed = false;
        try {
          run ??= await launch(profile);
          const metrics = await run.page.evaluate(spec => globalThis.startStream(spec), spec);
          const targetStopMs = Math.random() * 3000;
          do {
            snapshot = await run.page.evaluate(() => globalThis.streamSnapshot());
            if (snapshot.elapsedMs >= targetStopMs) break;
            await delay(Math.min(20, targetStopMs - snapshot.elapsedMs));
          } while (true);
          // Freeze ACK publication before the final read: no unobserved page ACK can
          // appear in the IPC-to-kill gap. The pending tx may still commit, unacked.
          snapshot = await run.page.evaluate(() => globalThis.streamSnapshot(true));
          const beforeKill = performance.now(), stopMs = Date.now() - snapshot.startedAt, exited = once(run.processHandle, 'exit');
          if (!run.processHandle.kill('SIGKILL')) throw new Error('Process termination returned false');
          killed = true; await exited;
          const killToExitMs = performance.now() - beforeKill;
          const diagnostics = run.diagnostics, pid = run.processHandle.pid;
          await unlock(profile); run = await launch(profile);
          record = await run.page.evaluate(input => globalThis.recoverTrial(input), { spec, snapshot });
          Object.assign(record, { ...metrics, ...record, targetStopMs, pid, stopKind: 'SIGKILL',
            killToExitMs, stopMs, snapshotToKillMs: stopMs - snapshot.elapsedMs, preStopDiagnostics: diagnostics,
            ...(snapshot.failure ? { workloadFailure: snapshot.failure, outcome: 'open-failed' } : {}) });
        } catch (e) { if (fatal) break; record = { ...failure(spec, e), killed, snapshot }; }
        record.recoveredBy = 'process-relaunch';
        trials.push(record); await save();
        if (run) await run.context.close().catch(() => {}); run = null;
      }
    } finally { if (run) await run.context.close().catch(() => {}); await rm(profile, { recursive: true, force: true }); }
  }
}
async function clearFirefoxQuotaPref(profile) {
  // Firefox persists user.js values into prefs.js; merely omitting the launch
  // option can leave the old cap active on relaunch. Remove only this trial's pref.
  for (const name of ['prefs.js', 'user.js']) {
    const path = join(profile, name);
    try { const text = await readFile(path, 'utf8'); await writeFile(path, text.split('\n').filter(l => !l.includes('dom.quotaManager.temporaryStorage.fixedLimit')).join('\n')); }
    catch (e) { if (e.code !== 'ENOENT') throw e; }
  }
}
async function quotaTrials() {
  if (args.browser === 'webkit') { skips.push({ cell: 'quota-exhaustion', reason: "No quota control in Playwright's WebKit" }); return; }
  for (const mode of ['WAL', 'DELETE']) for (let trial = 1; trial <= 3; trial++) {
    if (fatal) break;
    const spec = makeSpec('quota-exhaustion', mode, trial), profile = await mkdtemp(join(tmpdir(), 'spike2144-quota-'));
    let run, record, snapshot, streamStarted = false;
    try {
      run = await launch(profile, true); let cdp;
      if (args.browser === 'chrome') {
        cdp = await run.context.newCDPSession(run.page);
        await cdp.send('Storage.overrideQuotaForOrigin', { origin, quotaSize: QUOTA_BYTES });
      }
      await run.page.evaluate(spec => globalThis.startStream(spec), spec);
      streamStarted = true;
      await run.page.waitForFunction(() => !!globalThis.streamSnapshot().failure, { }, { timeout: 600000 });
      snapshot = await run.page.evaluate(() => globalThis.stopStream());
      const diagnostics = run.diagnostics;
      await run.context.close();
      if (args.browser === 'firefox') await clearFirefoxQuotaPref(profile);
      run = await launch(profile);
      if (args.browser === 'chrome') {
        cdp = await run.context.newCDPSession(run.page);
        await cdp.send('Storage.overrideQuotaForOrigin', { origin, quotaSize: 1024 * 1024 * 1024 });
      }
      record = await run.page.evaluate(input => globalThis.recoverTrial(input), { spec, snapshot });
      Object.assign(record, { quotaBytes: QUOTA_BYTES, quotaFailure: snapshot.failure, preStopDiagnostics: diagnostics });
    } catch (e) {
      if (fatal) break;
      record = { ...failure(spec, e), snapshot };
      if (!streamStarted && !snapshot?.acked?.length && !snapshot?.failure) Object.assign(record, { outcome: 'invalid-setup', invalidReason: 'Failed before streamed workload began' });
    }
    finally { if (run) await run.context.close().catch(() => {}); await rm(profile, { recursive: true, force: true }); }
    trials.push(record); await save();
  }
}
// Cell G: the page stops a worker, stashes the acked set in localStorage and reloads itself; the
// driver only waits for the page to announce the merged result (evaluate fails across each reload).
async function reloadTrials() {
  const profile = await mkdtemp(join(tmpdir(), 'spike2144-reload-')); let run;
  try {
    run = await launch(profile);
    await run.page.goto(`${origin}/?cells=G&browser=${args.browser}`);
    const started = Date.now();
    for (;;) {
      await delay(1000); let result = null;
      try { result = await run.page.evaluate(() => globalThis.reloadCellsResult ?? null); } catch { /* mid-reload */ }
      if (result) { trials.push(...result.trials); await save(); break; }
      if (fatal || Date.now() - started > 60 * 60 * 1000) { skips.push({ cell: 'reload-recovery', reason: 'did not finish within 60 minutes' }); break; }
    }
  } finally { if (run) await run.context.close().catch(() => {}); await rm(profile, { recursive: true, force: true }); }
}
const timer = setTimeout(() => { fatal = 'Driver exceeded 110 minutes'; current?.close().catch(() => {}); }, 110 * 60 * 1000);
try {
  const pageCells = ['A', 'B', 'E', 'F'].filter(c => args.cells.split(',').includes(c));
  if (pageCells.length) {
    const profile = await mkdtemp(join(tmpdir(), 'spike2144-page-')); let run;
    try {
      run = await launch(profile);
      // Persist each completed trial, even if the operator later interrupts a long run.
      await run.page.exposeFunction('recordTrial', async trial => { trials.push(trial); await save(); });
      await run.page.evaluate(input => globalThis.runCells(input), { cells: pageCells.join(','), browser: args.browser });
    } finally { if (run) await run.context.close().catch(() => {}); await rm(profile, { recursive: true, force: true }); }
  }
  if (args.cells.split(',').includes('G') && !fatal) await reloadTrials();
  if (args.cells.split(',').includes('C') && !fatal) await processTrials();
  if (args.cells.split(',').includes('D') && !fatal) await quotaTrials();
} catch (e) { fatal = { name: e.name, message: e.message }; process.exitCode = 1; }
finally { clearTimeout(timer); await current?.close().catch(() => {}); await save(); }
console.info(`Wrote ${out}: ${trials.length} trials${fatal ? ' (incomplete run)' : ''}`);
