import { getRxStorageWorker } from 'rxdb-premium/plugins/storage-worker';
import { closeMessageChannel } from 'rxdb/plugins/storage-remote';
import { fillWithDefaultSettings, normalizeMangoQuery, prepareQuery, randomToken } from 'rxdb/plugins/core';
import { pattern, rng, rowsFor, errorInfo, sleep, score, boundaries } from './workload.mjs';
const schema = fillWithDefaultSettings({ version: 0, primaryKey: 'id', type: 'object',
  properties: { id: { type: 'string', maxLength: 80 }, tx: { type: 'integer', minimum: 0, maximum: 1e9, multipleOf: 1 }, payload: { type: 'string' } },
  required: ['id', 'tx', 'payload'], indexes: [] });
const prepared = prepareQuery(schema, normalizeMangoQuery(schema, { selector: {}, sort: [{ id: 'asc' }] }));
const random = rng(2144), unique = () => 'crash-' + crypto.randomUUID();
async function deadline(promise, ms, label) {
  let timer;
  try { return await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms} ms`)), ms); })]); }
  finally { clearTimeout(timer); }
}
class Session {
  constructor(spec) {
    this.spec = spec; this.acked = []; this.inflight = null; this.logs = []; this.errors = [];
    this.pending = new Map(); this.sequence = 0; this.frozen = false; this.recovery = !!spec.reopen;
    this.worker = new Worker(spec.row === 'sqlite-sahpool' ? '/worker-sqlite-crash.js' : '/control-observer.js',
      spec.row === 'sqlite-sahpool' ? { type: 'module' } : { name: 'spike-2144-opfs' });
    this.worker.onmessage = ({ data: m }) => {
      if (m.spikeConsole) this.logs.push({ ...m.spikeConsole, recovery: this.recovery });
      if (m.ack && !this.frozen) { this.acked.push(m.ack); this.inflight = null; }
      if (m.logs) this.logs.push(...m.logs.map(l => ({ ...l, recovery: this.recovery })));
      if (!this.pending.has(m.id)) return;
      const { resolve, reject } = this.pending.get(m.id); this.pending.delete(m.id);
      m.error ? reject(Object.assign(new Error(m.error.message), m.error)) : resolve(m.result);
    };
    this.worker.onerror = event => {
      const error = { name: 'WorkerError', message: event.message, recovery: this.recovery }; this.errors.push(error);
      for (const p of this.pending.values()) p.reject(Object.assign(new Error(event.message), error));
      this.pending.clear();
    };
  }
  call(op, input = {}) {
    const id = ++this.sequence;
    return deadline(new Promise((resolve, reject) => { this.pending.set(id, { resolve, reject }); this.worker.postMessage({ id, op, ...input }); }),
      op === 'init' ? 25000 : 120000, op);
  }
  async open() {
    if (this.spec.row === 'sqlite-sahpool') { this.metrics = await this.call('init', { spec: this.spec }); return; }
    const workerOptions = { name: 'spike-2144-opfs' };
    const storage = getRxStorageWorker({ workerInput: () => this.worker, workerOptions, mode: 'storage' });
    this.instance = await deadline(storage.createStorageInstance({ databaseName: this.spec.name, collectionName: 'docs', schema,
      databaseInstanceToken: randomToken(10), options: {}, multiInstance: false, devMode: true }), 10000, 'control open');
    this.documents = new Map(); this.metrics = { journalMode: null, cacheSize: null, reacquireMs: null };
  }
  async write(tx, n, options = {}) {
    this.inflight = { tx, n };
    if (this.spec.row === 'sqlite-sahpool') return this.call('write', { tx, n, ...options });
    const documents = rowsFor(tx, n).map(row => {
      const previous = this.documents.get(row.id);
      return { ...row, _deleted: false, _attachments: {}, _rev: `${Number(previous?._rev.split('-')[0] ?? 0) + 1}-${tx}`,
        _meta: { lwt: 1700000000000 + tx + 1 } };
    });
    const result = await this.instance.bulkWrite(documents.map(document => ({ document, ...(this.documents.has(document.id) ? { previous: this.documents.get(document.id) } : {}) })), 'spike2144');
    if (result.error.length) throw new Error(JSON.stringify(result.error));
    if (!this.frozen) {
      for (const document of documents) this.documents.set(document.id, document);
      this.acked.push({ tx, n }); this.inflight = null;
    }
  }
  async read() {
    if (this.spec.row === 'sqlite-sahpool') return this.call('read');
    const { documents } = await deadline(this.instance.query(prepared), 10000, 'control first query');
    const failures = this.errors.filter(e => e.recovery).concat(this.logs.filter(l => l.recovery &&
      /recover.*(fail|error)|(fail|error).*recover|pars(e|ing).*(fail|error)|syntaxerror|corrupt|invalid json/i.test(l.text)));
    return { docs: documents, integrity: failures.length ? failures.map(x => x.text ?? x.message) : ['ok'] };
  }
  snapshot() { return { acked: this.acked.slice(), inflight: this.inflight && { ...this.inflight } }; }
  terminate() {
    if (this.terminated) return;
    this.terminated = true; this.frozen = true; this.worker.terminate();
    // Release page-side RxDB subscriptions/cache without sending a graceful close to the stopped engine.
    if (this.instance && !this.instance.closed) {
      this.instance.subs.forEach(sub => sub.unsubscribe()); this.instance.changes$.complete();
      void closeMessageChannel(this.instance.internals.messageChannel);
    }
    this.documents?.clear();
    for (const p of this.pending.values()) p.reject(new Error('Worker stopped')); this.pending.clear();
  }
  async close() {
    try { if (this.spec.row === 'sqlite-sahpool') await this.call('close'); else if (this.instance) await deadline(this.instance.close(), 10000, 'control close'); }
    finally { this.terminate(); }
  }
}
function base(spec) {
  return { ...spec, flag: undefined, journalMode: spec.mode ?? null, cacheSize: null, boundary: spec.boundary ?? null,
    stopMs: null, ackedCount: 0, inflightPresent: null, reacquireMs: null, reopenMs: null };
}
const failed = e => ({ outcome: 'open-failed', error: errorInfo(e) });
async function cleanup(spec, record) {
  if (spec.row !== 'sqlite-sahpool') return; // Control uses its own opaque directory layout; never guess it.
  try { await (await navigator.storage.getDirectory()).removeEntry(spec.pool, { recursive: true }); }
  catch (e) { record.cleanupError = errorInfo(e); }
}
async function recover(spec, snapshot) {
  const s = new Session({ ...spec, reopen: true }), start = performance.now();
  try {
    await s.open(); const read = await s.read();
    return { ...s.metrics, reopenMs: performance.now() - start, ...score(snapshot, read), logs: s.logs, workerErrors: s.errors };
  } catch (e) { return { ...s.metrics, ...failed(e), reopenMs: performance.now() - start, logs: s.logs, workerErrors: s.errors }; }
  finally { await s.close().catch(() => {}); }
}
async function seed(s) {
  await s.write(0, 2000);
  if (s.spec.row === 'sqlite-sahpool' && s.spec.mode === 'WAL') await s.call('checkpoint');
}
async function dryRun(spec, n) {
  const input = { ...spec, name: unique(), pool: unique(), flag: undefined }, s = new Session(input);
  try {
    await s.open(); await seed(s);
    return await s.write(1, n, { arm: { boundary: 'dry-run' }, checkpoint: true });
  } finally { await s.close().catch(() => {}); await cleanup(input, {}); }
}
async function boundaryTrial(spec, n) {
  let s, record = base(spec);
  try {
    const dry = await dryRun(spec, n), last = dry.mainWrites;
    const k = last ? 1 + Math.floor(random() * last) : null;
    if (['wal-mid-checkpoint', 'db-mid-commit', 'db-after-write-before-flush'].includes(spec.boundary) && !last) throw new Error('Dry run observed no commit/checkpoint main writes');
    const flag = new Int32Array(new SharedArrayBuffer(8)); s = new Session({ ...spec, flag: flag.buffer });
    await s.open(); await seed(s); Object.assign(record, s.metrics, { k, dryMainWrites: last, dryTrace: dry.trace });
    const start = performance.now(); let completed = false, writeError;
    const writing = s.write(1, n, { arm: { boundary: spec.boundary, k, last }, checkpoint: true })
      .then(() => { completed = true; }, e => { writeError = e; });
    while (!Atomics.load(flag, 0)) {
      if (completed || writeError) throw writeError ?? new Error('Boundary unreachable in armed transaction');
      if (performance.now() - start > 120000) throw new Error('Boundary was not reached within 120 s');
      await sleep(5);
    }
    const snapshot = s.snapshot(); s.terminate(); await writing;
    Object.assign(record, { stopMs: performance.now() - start, ackedCount: snapshot.acked.length,
      snapshot, heldMainWrites: Atomics.load(flag, 1) }, await recover(spec, snapshot));
  } catch (e) { Object.assign(record, failed(e)); }
  finally { if (s) s.terminate(); await cleanup(spec, record); }
  return record;
}
let active;
globalThis.startStream = async spec => {
  if (active) active.terminate();
  const s = active = new Session(spec); await s.open(); await seed(s);
  s.start = performance.now(); s.startedAt = Date.now();
  s.running = (async () => {
    for (let tx = 1; !s.frozen; tx++) {
      try { await s.write(tx, pattern[(tx - 1) % pattern.length]); }
      catch (e) { if (!s.frozen) s.failure = { ...errorInfo(e), statement: e.statement, hookFailures: e.hookFailures, logs: e.logs }; break; }
      await sleep(0); // give page timers and the driver's snapshot poll a turn
    }
  })();
  return { ...s.metrics, start: s.start };
};
globalThis.streamSnapshot = (freeze = false) => {
  if (freeze) active.frozen = true; // stops both ACK publication and submission before the final pre-kill snapshot
  return { ...active.snapshot(), elapsedMs: performance.now() - active.start, startedAt: active.startedAt, failure: active.failure ?? null, metrics: active.metrics };
};
globalThis.stopStream = () => { const snapshot = globalThis.streamSnapshot(true); active.terminate(); return snapshot; };
globalThis.recoverTrial = async ({ spec, snapshot }) => {
  const result = { ...base(spec), stopMs: snapshot.elapsedMs, ackedCount: snapshot.acked.length, snapshot, ...await recover(spec, snapshot) };
  await cleanup(spec, result); return result;
};
async function randomTrial(spec) {
  try {
    await globalThis.startStream(spec); const targetStopMs = random() * 3000; await sleep(targetStopMs);
    const snapshot = globalThis.stopStream(), record = await globalThis.recoverTrial({ spec, snapshot });
    return { ...record, targetStopMs, ...(snapshot.failure ? { workloadFailure: snapshot.failure, outcome: 'open-failed' } : {}) };
  } catch (e) { if (active) active.terminate(); const record = { ...base(spec), ...failed(e) }; await cleanup(spec, record); return record; }
}
async function poolTrial(spec) {
  const s = new Session({ ...spec, capacity: 6, poolOnly: true });
  let record = base(spec);
  try { await s.open(); Object.assign(record, s.metrics, await s.call('pool')); }
  catch (e) { Object.assign(record, failed(e)); }
  finally { await s.close().catch(() => {}); await cleanup(spec, record); }
  return record;
}
async function ceilingTrial(spec) {
  const worker = new Worker('/handle-ceiling-worker.js', { type: 'module' });
  let record;
  try {
    const result = await deadline(new Promise((resolve, reject) => {
      worker.onmessage = e => resolve(e.data); worker.onerror = e => reject(new Error(e.message)); worker.postMessage({ directory: spec.pool });
    }), 120000, 'handle ceiling');
    record = { ...base(spec), ...result };
  } catch (e) { record = { ...base(spec), ...failed(e) }; }
  finally { worker.terminate(); }
  await cleanup(spec, record); return record;
}
async function terminateTrial(spec, kind) {
  // Chrome gives a terminated worker time to finish its current task; this measures that grace per browser.
  const counter = new Int32Array(new SharedArrayBuffer(8)), worker = new Worker('/terminate-probe-worker.js', { type: 'module' });
  worker.postMessage({ kind, buffer: counter.buffer });
  const started = performance.now();
  while (!Atomics.load(counter, 0)) { if (performance.now() - started > 5000) { worker.terminate(); return { ...base(spec), kind, outcome: 'open-failed', error: { message: 'probe worker never started' } }; } await sleep(1); }
  await sleep(100);
  const before = Atomics.load(counter, 0), terminatedAt = performance.now(); worker.terminate();
  let last = before, lastChangeMs = 0;
  for (let elapsed = 0; elapsed < 4000; elapsed = performance.now() - terminatedAt) {
    await sleep(5); const now = Atomics.load(counter, 0);
    if (now !== last) { last = now; lastChangeMs = performance.now() - terminatedAt; }
  }
  return { ...base(spec), kind, outcome: 'ok', terminateLatencyMs: lastChangeMs, incrementsAfterTerminate: last - before };
}
async function slotTrials(spec) {
  let s, initializationError; const trials = [];
  try { s = new Session({ ...spec, poolOnly: true }); await s.open(); }
  catch (e) { initializationError = e; }
  for (let round = 0; round < 50; round++) {
    const record = { ...base(spec), trial: round + 1, ackedCount: 20 };
    try {
      if (initializationError) throw initializationError;
      Object.assign(record, await s.call('slot', { round }));
      if ((round + 1) % 10 === 0) {
        await s.close(); s = new Session({ ...spec, poolOnly: true, reopen: true });
        const start = performance.now(); await s.open();
        const check = await s.call('slotCheck', { name: record.short });
        const verdict = score({ acked: Array.from({ length: 20 }, (_, i) => ({ tx: i + 1, n: 1 })), inflight: null }, check.read);
        Object.assign(record, s.metrics, { reopenMs: performance.now() - start, reinstallCheck: verdict, names: check.names });
        if (verdict.outcome !== 'ok') record.outcome = verdict.outcome;
      }
    } catch (e) { Object.assign(record, failed(e)); initializationError = e; }
    trials.push(record);
  }
  if (s) await s.close().catch(() => {}); await cleanup(spec, trials.at(-1)); return trials;
}
globalThis.runCells = async (input = {}) => {
  const cells = (input.cells ?? 'A,B,E,F').split(','), trials = [];
  const record = async trial => { trials.push(trial); if (globalThis.recordTrial) await globalThis.recordTrial(trial); };
  const spec = (cell, mode = 'WAL', extra = {}) => ({ cell, row: 'sqlite-sahpool', mode, cache: 'default', name: unique(), pool: unique(), ...extra });
  if (cells.includes('A')) for (const [boundary, modes, n] of boundaries) for (const mode of modes) for (const cache of ['default', -64]) for (let trial = 1; trial <= 10; trial++)
    await record(await boundaryTrial(spec('boundary-stop', mode, { boundary, cache, trial }), n));
  if (cells.includes('B')) for (const mode of ['WAL', 'DELETE', null]) for (let trial = 1; trial <= 30; trial++)
    await record(await randomTrial(spec('random-stop', mode, { row: mode ? 'sqlite-sahpool' : 'opfs-shipped', trial })));
  if (cells.includes('E')) {
    for (let trial = 1; trial <= 3; trial++) await record(await poolTrial(spec('pool-exhaustion', 'WAL', { trial })));
    await record(await ceilingTrial(spec('handle-ceiling', null)));
    for (const kind of ['spinning', 'waiting']) await record(await terminateTrial(spec('terminate-latency', null, { kind }), kind));
  }
  if (cells.includes('F')) for (const trial of await slotTrials(spec('slot-reuse', 'WAL'))) await record(trial);
  const versions = await (await fetch('/versions.json')).json();
  return { environment: { browser: input.browser ?? 'safari', browserVersion: navigator.userAgent,
    os: navigator.platform, cpu: `unknown (${navigator.hardwareConcurrency ?? '?'} logical CPUs)`, node: null,
    versions, measuredAt: new Date().toISOString() }, trials };
};
document.body.innerHTML = `<h1>SQLite / OPFS crash harness</h1><button id="run" data-testid="run-cells" style="min-height:48px;padding:12px">Run A,B,E,F</button>
  <span id="status" role="status"></span> <a id="download" hidden>Download results.safari.json</a><pre id="results"></pre>`;
document.querySelector('#run').onclick = async event => {
  event.target.disabled = true; document.querySelector('#status').textContent = 'Running';
  try {
    const result = await globalThis.runCells(), text = JSON.stringify(result, null, 2);
    document.querySelector('#results').textContent = text;
    const link = document.querySelector('#download'); link.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    link.download = 'results.safari.json'; link.hidden = false; document.querySelector('#status').textContent = 'Finished';
  } catch (e) { document.querySelector('#status').textContent = String(e); }
  finally { event.target.disabled = false; }
};
