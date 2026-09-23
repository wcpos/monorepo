import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import vm from 'node:vm';
import { join } from 'node:path';
const here = new URL('.', import.meta.url);
// Catches a port changing the deterministic workload's bytes, not merely its counts.
test('fixture port is byte-identical to both accepted workloads', async () => {
  assert.ok(existsSync(new URL('app/src/fixtures.ts', here)), 'fixture port exists');
  const { fixtures } = await import('./app/src/fixtures.ts');
  for (const path of ['../2143-storage-benchmark/bench-entry.mjs', '../2210-desktop-engine/bench-node.mjs']) {
    const source = readFileSync(new URL(path, here), 'utf8');
    const fragment = source.slice(source.indexOf('const stamp'), source.indexOf('// Full document comparisons')).replace('export function', 'function');
    const original = vm.runInNewContext(fragment + '; fixtures');
    for (const n of [1, 2000, 20000]) assert.equal(JSON.stringify(fixtures(n)), JSON.stringify(original(n)));
  }
});
// Catches falsely excusing an acked loss just because another inflight row landed.
test('ownership replay preserves acked losses and scores whole or partial inflight', async () => {
  assert.ok(existsSync(new URL('app/src/ledger.ts', here)), 'ledger port exists');
  const { score, seedIds } = await import('./app/src/ledger.ts');
  const base = seedIds.map(id => ({ id, tx: 0 }));
  const snapshot = { acked: [{ tx: 1, ids: ['a', 'b'], n: 2 }], inflight: { tx: 2, ids: ['a', 'c'], n: 2 } };
  assert.equal(score(snapshot, [...base, { id: 'a', tx: 2 }, { id: 'c', tx: 2 }]).outcome, 'lost');
  assert.equal(score(snapshot, [...base, { id: 'a', tx: 2 }, { id: 'b', tx: 1 }, { id: 'c', tx: 2 }]).outcome, 'ok');
  assert.equal(score(snapshot, [...base, { id: 'a', tx: 2 }, { id: 'b', tx: 1 }]).outcome, 'partial');
  assert.equal(score({ acked: [], inflight: null }, base.slice(1)).outcome, 'lost');
});
// Catches displaying a speed winner when documents differ, including same-id content drift.
test('comparison records same-id content drift and suppresses winners', async () => {
  assert.ok(existsSync(new URL('report.mjs', here)), 'report exists');
  const { compare, winner } = await import('./report.mjs');
  const cell = hash => ({ name: 'read', samples: [{ ms: 1 }], signatures: [hash], setSignatures: [hash], idSets: [['a']], docHashes: [[['a', hash]]] });
  const report = { results: ['expo-filesystem-js', 'worklet-filesystem', 'expo-sqlite'].map((engine, i) => ({ engine, scale: 'small', cells: [cell(i === 2 ? 'different' : 'same')] })) };
  assert.equal(compare(report).length, 1);
  assert.deepEqual(report.results[2].cells[0].mismatch.differingDocs, ['a']);
  assert.equal(winner(report, 'small/read'), 'not compared');
});
// Catches losing the failure verdict when bulky comparison evidence is compacted for commit.
test('report preserves mismatch diagnostics and failure exit on a second regeneration', async () => {
  const { mkdtemp, mkdir, writeFile, readFile, rm } = await import('node:fs/promises');
  await mkdir(new URL('.deps/', here), { recursive: true });
  const directory = await mkdtemp(new URL('.deps/report-test-', here));
  try {
    await mkdir(directory + '/results');
    await writeFile(directory + '/RESULTS.md', '<!-- generated:start --><!-- generated:end -->');
    const cell = hash => ({ name: 'read', samples: [{ ms: 1 }], signatures: [hash], setSignatures: [hash], idSets: [['a']], docHashes: [[['a', hash]]] });
    const report = { environment: { platform: 'ios', device: 'test', simulator: true }, complete: true,
      results: ['expo-filesystem-js', 'worklet-filesystem', 'expo-sqlite'].map((engine, i) => ({ engine, scale: 'small', cells: [cell(i === 2 ? 'different' : 'same')] })) };
    const file = directory + '/results/results.ios.test.json'; await writeFile(file, JSON.stringify(report));
    const { main } = await import('./report.mjs');
    assert.equal(await main(new URL('file://' + directory + '/')), 1);
    const saved = JSON.parse(await readFile(file, 'utf8'));
    assert.equal(saved.results[0].cells[0].docHashes, undefined);
    assert.deepEqual(saved.results[2].cells[0].mismatch.differingDocs, ['a']);
    assert.equal(await main(new URL('file://' + directory + '/')), 1);
  } finally { await rm(directory, { recursive: true }); }
});
// Catches regressing the accepted Documents handoff or accepting a missing launch PID.
test('simulator writes the driver address before plain launch and requires a PID', async () => {
  const source = readFileSync(new URL('driver/ios.mjs', here), 'utf8').replace(/^import .*;\n/gm, '').replace('export async function', 'async function').replaceAll('import.meta.url', JSON.stringify(new URL('driver/ios.mjs', here).href));
  const calls = [];
  let launchResult = 'com.wcpos.spike2091: 123';
  const context = { URL, join, fileURLToPath: u => u.pathname, bundle: 'com.wcpos.spike2091',
    mkdir: async (...args) => calls.push(['mkdir', ...args]),
    writeFile: async (...args) => calls.push(['write', ...args]),
    command: async (_file, args) => {
      calls.push(args);
      if (args[1] === 'list') return JSON.stringify({ devices: { runtime: [{ udid: 'test', state: 'Booted' }] } });
      if (args[1] === 'get_app_container') return '/container';
      if (args[1] === 'launch') return launchResult;
      throw new Error(`Unexpected command: ${args}`);
    } };
  const device = await vm.runInNewContext(source + '; ios', context)('test', true);
  await device.launch('http://localhost:48091');
  assert.deepEqual(JSON.parse(JSON.stringify(calls.slice(1))), [
    ['simctl', 'get_app_container', 'test', 'com.wcpos.spike2091', 'data'],
    ['mkdir', '/container/Documents', { recursive: true }],
    ['write', '/container/Documents/spike2091-driver.txt', 'http://localhost:48091'],
    ['simctl', 'launch', 'test', 'com.wcpos.spike2091'],
  ]);
  launchResult = 'no pid';
  await assert.rejects(device.launch('http://localhost:48091'), /No launch PID/);
});
// Catches serializing the scorer's full ID ledger or unbounded logs into trial files.
test('crash records retain counts and outcomes but not snapshot IDs', async () => {
  const { compactTrial } = await import('./driver/control.mjs');
  const snapshot = { acked: [{ tx: 1, n: 2, ids: ['a', 'b'] }], inflight: { tx: 2, n: 1, ids: ['c'] } };
  const logs = Array.from({ length: 25 }, (_, i) => `line ${i}`);
  const record = compactTrial({ snapshot, outcome: 'lost', repairs: 25, logs, ackedCount: 1, inflightTx: 2, inflightSize: 1 });
  assert.equal(record.snapshot, undefined);
  assert.deepEqual(record.acked, [{ tx: 1, n: 2 }]);
  assert.equal(record.logs.length, 20);
  assert.equal(record.logsTruncated, 5);
  assert.equal(record.repairs, 25);
  assert.equal(record.outcome, 'lost');
  assert.deepEqual(snapshot.acked[0].ids, ['a', 'b']);
});
// Catches sending RxDB's base64 data URL to Expo's Android network fetch.
test('data fetch returns a decoded Blob and passes network requests through', async () => {
  const ts = await import('./app/node_modules/typescript/lib/typescript.js');
  const source = readFileSync(new URL('app/src/polyfills.ts', here), 'utf8').replace(/^import .*;\n/gm, '').replace('export function', 'function');
  const calls = [], network = new Response('network');
  const context = { Crypto: { digest() {} }, installWorkletFs() {}, getWorkletFs() {}, installWorkletRuntimePolyfills() {},
    Blob, Response, Uint8Array, atob, fetch: async (...args) => { calls.push(args); if (String(args[0]).startsWith('data:')) throw new Error('unknown protocol: data'); return network; } };
  vm.runInNewContext(ts.default.transpile(source) + '; installPolyfills();', context);
  const response = await context.fetch('data:application/octet-stream;base64,AAH/');
  const blob = await response.blob();
  assert.equal(blob.type, 'application/octet-stream');
  assert.deepEqual([...new Uint8Array(await blob.arrayBuffer())], [0, 1, 255]);
  assert.equal(calls.length, 0);
  const options = { method: 'POST', body: 'test' };
  assert.equal(await context.fetch('http://localhost/job', options), network);
  assert.deepEqual(calls, [['http://localhost/job', options]]);
});

// Native dependencies are replaced at the runtime boundary; execute the actual TS module.
async function loadTS(file, dependencies = {}, globals = {}, extra = '') {
  const ts = (await import('./app/node_modules/typescript/lib/typescript.js')).default;
  const source = readFileSync(new URL(`app/src/${file}.ts`, here), 'utf8');
  const context = { exports: {}, console: { ...console }, Error, URL, performance,
    require: name => { if (!(name in dependencies)) throw new Error(`Unexpected import: ${name}`); return dependencies[name]; },
    ...globals };
  vm.runInNewContext(ts.transpile(source + extra, { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }), context);
  return context;
}
const core = { fillWithDefaultSettings: x => x, normalizeMangoQuery: (_s, q) => q, prepareQuery: (_s, q) => ({ query: q }) };

test('mixed field and OR selector keeps OR inside its own SQL group', async () => {
  const { exports: { predicate } } = await loadTS('engines', Object.fromEntries([
    'expo-file-system', 'expo-opfs', 'expo-sqlite', 'rxdb/plugins/core',
    'rxdb-premium/plugins/storage-filesystem-expo', 'rxdb-premium/plugins/storage-sqlite',
    './storage-runtime', './sqlite-basics-expo'].map(name => [name, {}])), {}, '\nexports.predicate = predicate;');
  const params = [];
  assert.equal(predicate({ stockStatus: { $eq: 'instock' }, $or: [{ id: { $eq: 'a' } }, { id: { $eq: 'b' } }] }, params, 'id'),
    "(JSON_EXTRACT(data, '$.stockStatus') = ? AND ((id = ?) OR (id = ?)))");
  assert.deepEqual(params, ['instock', 'a', 'b']);
});

test('report leaves missing benchmark rows/cells and smoke-only totals unevaluated', async () => {
  const { mkdtemp, mkdir, writeFile, readFile, rm } = await import('node:fs/promises');
  await mkdir(new URL('.deps/', here), { recursive: true });
  const directory = await mkdtemp(new URL('.deps/report-test-', here));
  try {
    await mkdir(directory + '/results');
    await writeFile(directory + '/RESULTS.md', '<!-- generated:start --><!-- generated:end -->');
    const environment = { platform: 'ios', device: 'test', simulator: true };
    await writeFile(directory + '/results/smoke.ios.test.json', JSON.stringify({ environment, complete: true,
      results: [{ engine: 'expo-sqlite', scenarios: [{ pass: true }] }] }));
    const { main } = await import('./report.mjs');
    for (const results of [null, [], [{ engine: 'expo-sqlite', scale: 'small', cells: [] }]]) {
      if (results) await writeFile(directory + '/results/results.ios.test.json', JSON.stringify({ environment, complete: false, results }));
      assert.equal(await main(new URL('file://' + directory + '/')), 0);
      assert.match(await readFile(directory + '/RESULTS.md', 'utf8'), /expo-sqlite \| 1 \| 0 \| not run \| not evaluated/);
    }
  } finally { await rm(directory, { recursive: true }); }
});

test('capture preserves errors, circular values and failed assertions without throwing', async () => {
  const context = await loadTS('logs');
  const capture = context.exports.captureLogs(() => { throw new Error('observer failed'); });
  const error = new Error('corrupt data'), circular = {}; circular.self = circular;
  try {
    context.console.error(error);
    assert.match(capture.logs[0], /corrupt data/);
    assert.ok(capture.logs[0].includes(error.stack));
    assert.doesNotThrow(() => context.console.info(circular, undefined, 1n));
    context.__wcposOnStorageRunFailure({ error, circular });
    assert.match(capture.logs.at(-1), /corrupt data/);
    const before = capture.logs.length;
    context.console.assert(true, 'error passing assertion');
    assert.equal(capture.logs.length, before);
    context.console.assert(false, 'failed assertion');
    assert.equal(capture.logs.at(-1), 'failed assertion');
    assert.doesNotThrow(() => context.console.warn('open transaction error (will retry)'));
    assert.equal(capture.logs.length, before + 2);
  } finally { capture.restore(); }
});

test('worklet forwarding retains errors and circular hook events', async () => {
  const logs = [], dependencies = {
    './logs': (await loadTS('logs')).exports,
    'react-native-worklets': { scheduleOnRN: (fn, ...args) => fn(...args) },
    'rxdb-premium/plugins/storage-abstract-filesystem': { getRxStorageAbstractFilesystem: () => ({}) },
    '@wcpos/rxdb-storage-worklet': { exposeWorkletRxStorage: async () => {} },
    '@wcpos/react-native-worklet-fs': { getWorkletFs: () => ({}) },
    '@wcpos/worklet-opfs': { installWorkletRuntimePolyfills() {}, createAbstractFilesystemAdapter() {}, createWorkletOpfs() {}, createPromiseQueueLock() {} },
  };
  const context = await loadTS('storage-runtime', dependencies, {}, '\nexports.exposeStorage = exposeStorage;');
  context.exports.exposeStorage('/test', 'receive', () => {}, () => {}, line => logs.push(line));
  const error = new Error('corrupt worklet'), circular = {}; circular.self = circular;
  context.console.error(error);
  assert.ok(logs[0].includes(error.stack));
  assert.doesNotThrow(() => context.console.info(circular));
  assert.doesNotThrow(() => context.__wcposOnStorageRunFailure({ error, circular }));
  assert.match(logs.at(-1), /corrupt worklet/);
  const before = logs.length;
  context.console.assert(true, 'error passing assertion');
  assert.equal(logs.length, before);
});

test('crash scorer distinguishes repair hooks from run failures', async () => {
  for (const [line, repairs, outcome] of [
    ['recovery __wcposOnStorageRunFailure: {"error":"failed after rebuilt"}', 0, 'integrity-failed'],
    ['recovery __wcposOnStorageRecovery: {"error":"failed parse"}', 1, 'ok'],
    ['recovery __wcposOnIndexRebuild: {"error":"failed parse"}', 1, 'ok'],
    ['rebuilt indexes', 1, 'ok'], ['salvaged records', 1, 'ok'], ['recover pending', 0, 'ok'],
  ]) {
    const { exports: { scorer } } = await loadTS('crash', {
      'rxdb/plugins/core': core, 'rxdb-premium/plugins/storage-sqlite': {}, './fixtures': {},
      './ledger': { score: () => ({ outcome: 'ok' }) },
      './logs': { captureLogs: () => ({ logs: [line], restore() {} }) },
      './engines': { openEngine: async () => ({ create: async () => ({ query: async () => ({ documents: [] }), changeStream: () => ({ subscribe: () => ({ unsubscribe() {} }) }) }), proveWal: async () => {} }) },
    });
    const result = await scorer({ row: 'expo-filesystem-js', snapshot: {} }, async () => {});
    assert.equal(result.repairs, repairs, line);
    assert.equal(result.outcome, outcome, line);
  }
});

test('benchmark stops seed and grid lag samplers on failure', async () => {
  for (const failure of ['seed', 'grid']) {
    let active = 0, queries = 0;
    const { exports: { runBench } } = await loadTS('bench', {
      'rxdb/plugins/core': core, './schemas': { schemas: {} }, './fixtures': { fixtures: () => ({ products: [{}], orders: [{}] }) },
      './metrics': { heap: () => ({}), diskBytes: () => ({}), signature: async () => 'hash' },
      './lag-sampler': { lagSampler: () => { active++; return () => { active--; return { maxLagMs: 0, ticksOver50Ms: 0 }; }; } },
      './engines': { openEngine: async () => ({
        create: async () => ({ bulkWrite: async () => { if (failure === 'seed') throw new Error('seed failed'); return { error: [] }; },
          query: async () => { if (++queries === 2) throw new Error('grid failed'); return { documents: [] }; } }),
        proveWal: async () => {}, analyze: async () => {}, close: async () => {},
      }) },
    });
    await assert.rejects(runBench({ scale: 'large', simulator: false }, async () => {}), new RegExp(`${failure} failed`));
    assert.equal(active, 0, failure);
  }
});

test('malformed initial URL still allows Connect to start fetching jobs', async () => {
  const timers = [], fetched = [];
  const context = await loadTS('client', {
    'expo-linking': { addEventListener() {}, getInitialURL: async () => 'spike2091://driver?url=bad', parse: () => ({ queryParams: { url: 'bad' } }) },
    'expo-file-system': { Paths: {}, File: class { exists = false; write() {} } },
    'expo-keep-awake': {}, './logs': {}, './polyfills': {}, './versions.json': {},
  }, { setTimeout: fn => timers.push(fn), fetch: async url => { fetched.push(url); return { status: 204 }; } });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(context.exports.getState().status, 'ERROR');
  context.exports.connect('http://localhost:48091');
  assert.equal(timers.length, 1, 'poll was started despite invalid URL');
  timers.shift()();
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(fetched, ['http://localhost:48091/job']);
});

test('smoke keeps recorded results when cleanup rejects and closes after WAL failure', async () => {
  const { exports: { runConformanceSmoke } } = await loadTS('conformance-smoke', {
    'rxdb/plugins/core': core, 'rxdb/plugins/test-utils': { human: {} },
  }, { console: { error() {} } });
  for (const walFailure of [false, true]) {
    let closed = 0;
    const instance = { changeStream: () => ({ subscribe: () => ({ unsubscribe() {} }) }),
      close: async () => { closed++; throw new Error('close failed'); }, remove: async () => { throw new Error('remove failed'); } };
    const observed = [];
    const result = await runConformanceSmoke({ create: async () => instance,
      proveWal: async () => { if (walFailure) throw new Error('WAL failed'); } }, r => observed.push(r));
    assert.equal(result.length, walFailure ? 1 : 8);
    assert.deepEqual([...result], observed);
    assert.ok(closed > 0);
  }
});

// Removing save-time compaction must fail even when the leg has not finished.
test('every bench save is compact and retained signatures still compare after reload', async () => {
  const reporting = await import('./report.mjs');
  const source = readFileSync(new URL('driver/driver.mjs', here), 'utf8');
  const cell = hash => ({ name: 'read', samples: [{ ms: 1 }], signatures: [hash], setSignatures: [hash], idSets: [['a']], docHashes: [[['a', hash]]] });
  let saved;
  const report = { complete: false, results: [{ engine: 'expo-filesystem-js', scale: 'small', cells: [cell('same')] }] };
  const save = vm.runInNewContext(source.slice(source.indexOf('const save ='), source.indexOf('let active;')) + '; save', {
    report, leg: 'bench', out: 'unused', ...reporting, writeFile: async (_path, data) => { saved = JSON.parse(data); },
  });
  await save();
  assert.equal(saved.complete, false);
  assert.equal(saved.results[0].cells[0].idSets, undefined);
  assert.equal(saved.results[0].cells[0].docHashes, undefined);
  assert.deepEqual(saved.results[0].cells[0].setSignatures, ['same']);
  saved.results.push({ engine: 'worklet-filesystem', scale: 'small', cells: [cell('same')] });
  assert.equal(reporting.compare(saved).length, 0);
  saved.results.push({ engine: 'expo-sqlite', scale: 'small', cells: [cell('different')] });
  assert.equal(reporting.compare(saved).length, 1);
  assert.equal(reporting.winner(saved, 'small/read'), 'not compared');
});

// Exercise the real trial loop; the OS boundary loses the first writer between alive and signal.
test('vanished stop target is saved as harness-failed and next trial is scored', async () => {
  const control = await import('./driver/control.mjs');
  const source = readFileSync(new URL('driver/driver.mjs', here), 'utf8');
  const loop = source.slice(source.indexOf('try {\n  for (const row'), source.indexOf('\nfinally {'));
  let stops = 0, scored = 0;
  const saved = [], context = { physicalIos: false, AbortController, ...control, args: { resume: false }, watchMs: 250, WATCH_MS: 250, rows: ['expo-filesystem-js'], leg: 'crash', trials: 2,
    report: { complete: false, trials: [] }, process: {}, console: { info() {}, error() {} },
    spec: row => ({ row }), randomInt: () => 0, RANDOM_STOP_MAX_MS: 3000, performance,
    sleep: async () => {}, save: async () => saved.push(structuredClone(context.report)),
    device: { stop: async () => { if (++stops === 1) throw new Error('devicectl signal: No such process'); } },
    start: async () => { context.active = { seededAt: performance.now(), started: [{ tx: 1, n: 1, ids: ['a'] }], acked: new Set([1]), beginRetries: 0 }; return { promise: new Promise(() => {}), seeded: Promise.resolve() }; },
    run: async () => { scored++; return { outcome: 'ok', ledger: 'ok', reopenMs: 1 }; },
  };
  await vm.runInNewContext('(async () => {' + loop + '})()', context);
  assert.equal(context.report.trials.length, 2);
  assert.equal(context.report.trials[0].outcome, 'harness-failed');
  assert.match(context.report.trials[0].error, /No such process/);
  assert.equal(context.report.trials[0].ledger, undefined);
  assert.equal(context.report.trials[1].outcome, 'ok');
  assert.equal(scored, 1);
  assert.equal(saved[0].trials[0].outcome, 'harness-failed');
  assert.equal(context.report.complete, false);
  assert.equal(context.process.exitCode, 1);
});

test('crash report separates harness failures from storage outcomes', async () => {
  const { mkdtemp, mkdir, writeFile, readFile, rm } = await import('node:fs/promises');
  await mkdir(new URL('.deps/', here), { recursive: true });
  const directory = await mkdtemp(new URL('.deps/report-test-', here));
  try {
    await mkdir(directory + '/results');
    await writeFile(directory + '/RESULTS.md', '<!-- generated:start --><!-- generated:end -->');
    await writeFile(directory + '/results/crash.ios.test.json', JSON.stringify({
      environment: { platform: 'ios', device: 'test' }, complete: false,
      trials: [{ row: 'expo-filesystem-js', outcome: 'harness-failed', ackedCount: 0, acked: [], error: 'No such process' }],
    }));
    const { main } = await import('./report.mjs');
    assert.equal(await main(new URL('file://' + directory + '/')), 0);
    const output = await readFile(directory + '/RESULTS.md', 'utf8');
    assert.match(output, /\| partial \| harness-failed \|/);
    assert.match(output, /expo-filesystem-js \| 1 \| 0 \/ 0 \| 0 \| 0 \| 0 \| 0 \| 0 \| 1 \|/);
  } finally { await rm(directory, { recursive: true }); }
});

// Dropping activation, cleanup, or awaiting the writer must break this lifecycle test.
test('job keeps awake through a pending writer and releases on success or error', async () => {
  for (const fails of [false, true]) {
    const events = [], posted = [];
    let finish;
    const writer = new Promise((resolve, reject) => { finish = () => fails ? reject(new Error('writer failed')) : resolve({}); });
    await loadTS('client', {
      'expo-linking': { addEventListener() {}, getInitialURL: async () => null },
      'expo-file-system': { Paths: {}, File: class { exists = true; textSync() { return 'http://localhost:48091'; } } },
      'expo-keep-awake': { activateKeepAwakeAsync: async () => events.push('awake'), deactivateKeepAwake: async () => events.push('released') },
      './logs': { captureLogs: () => ({ logs: [], restore() {} }) }, './polyfills': { installPolyfills() {} }, './versions.json': {},
      './bench': {}, './crash': { writer: () => { events.push('writer'); return writer; } }, './engines': {}, './conformance-smoke': {}, './divergence': {},
    }, { setTimeout() {}, fetch: async (url, options) => {
      if (url.endsWith('/job')) return { ok: true, status: 200, json: async () => ({ id: 'test', type: 'crash-write' }) };
      posted.push(JSON.parse(options.body)); return { ok: true };
    } });
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(events, ['awake', 'writer']);
    assert.equal(posted.length, 0);
    finish();
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(events, ['awake', 'writer', 'released']);
    assert.equal(posted.length, 1);
    if (fails) assert.match(posted[0].error, /writer failed/);
  }
});

// Removing retries must expose the first tunnel failure rather than recover or exhaust the budget.
test('physical alive retries transient commands and distinguishes unreachable from gone', async () => {
  const source = readFileSync(new URL('driver/ios.mjs', here), 'utf8').replace(/^import .*;\n/gm, '').replace('export async function', 'async function').replaceAll('import.meta.url', JSON.stringify(new URL('driver/ios.mjs', here).href));
  let now = 0, failures = 0, gone = false, response;
  const waits = [];
  const context = { URL, join, fileURLToPath: u => u.pathname, bundle: 'test',
    performance: { now: () => { now += 0.125; return now; } }, sleep: async ms => { now += ms; waits.push(ms); },
    rm: async () => {}, writeFile: async () => {}, readFile: async () => JSON.stringify({ result: response }),
    command: async (_file, args, _allowFailure, timeout) => {
      if (args.includes('signal')) throw new Error('CoreDeviceError 4000: disconnected');
      if (args.includes('processes')) {
        assert.ok(Number.isInteger(timeout) && timeout > 0, 'execFile needs an unsigned integer timeout');
        if (failures-- > 0) throw new Error('CoreDeviceError 4016 CurrentlyAssertableStates = ( )');
        response = { runningProcesses: gone ? [] : [{ processIdentifier: 123 }] };
      } else response = { deviceProperties: {}, process: { processIdentifier: 123 } };
    } };
  const device = await vm.runInNewContext(source + '; ios("test", false)', context);
  await device.launch('http://test');
  failures = 2;
  assert.equal(await device.alive(), true);
  assert.ok(waits.length >= 2 && waits[1] > waits[0], 'transient failures back off');
  failures = Infinity; now = 0; waits.length = 0;
  await assert.rejects(device.alive(), /Harness failure: device unreachable.*locked, asleep or unpaired/s);
  assert.ok(now >= 30000 && now <= 31000, 'bounded reachability budget');
  failures = 0;
  await assert.rejects(device.stop(), /Harness failure:.*4000/);
  gone = true;
  assert.equal(await device.alive(), false, 'a successful process listing can prove process death');
});

async function runDriverLoop(report, leg, run, extra = {}) {
  const control = await import('./driver/control.mjs');
  const source = readFileSync(new URL('driver/driver.mjs', here), 'utf8');
  const loop = source.slice(source.indexOf('try {\n  for (const row'), source.indexOf('\nfinally {'));
  const saved = [], context = { physicalIos: false, AbortController, ...control, rows: report.rows, scales: leg === 'smoke' ? [undefined] : ['small'], leg, trials: 2,
    args: { scale: 'small', resume: true }, active: undefined, report, process: {}, console: { info() {}, error() {} },
    spec: (row, scale) => ({ row, scale }), run, save: async () => saved.push(structuredClone(report)), ...extra };
  await vm.runInNewContext('(async () => {' + loop + '})()', context);
  return { saved, context };
}

// A per-row disconnect must not drop the next row or claim a complete run.
test('bench and smoke record harness failures and continue to the next row', async () => {
  for (const leg of ['bench', 'smoke']) {
    const report = { rows: ['expo-filesystem-js', 'expo-sqlite'], results: [], trials: [] };
    const seen = [];
    const { saved } = await runDriverLoop(report, leg, async job => {
      seen.push(job.row);
      if (job.row === 'expo-filesystem-js') throw new Error('Harness failure: device unreachable');
      return leg === 'bench' ? { cells: [{ name: 'read', samples: [{ ms: 1 }] }] } : { scenarios: [{ pass: true }] };
    });
    assert.deepEqual(seen, ['expo-filesystem-js', 'expo-sqlite']);
    assert.equal(saved[0].results[0].outcome, 'harness-failed');
    assert.equal(report.results.length, 2);
    assert.equal(report.complete, false);
  }
});

// Resume must preserve successful evidence, rerun failed/missing work, and reject a different environment.
test('resume merges run provenance and refuses device, platform or dependency mismatches', async () => {
  const { prepareReport } = await import('./driver/control.mjs');
  assert.equal(typeof prepareReport, 'function');
  const current = { environment: { device: 'ipad', platform: 'ios', rxdb: 'installed', measuredAt: 'new' }, rows: ['expo-sqlite'], results: [], trials: [] };
  const previous = { ...structuredClone(current), environment: { ...current.environment, measuredAt: 'old' }, complete: false, fatal: 'disconnect' };
  previous.results = [{ engine: 'expo-sqlite', scale: 'small', cells: [{ name: 'read' }] }];
  const merged = prepareReport(current, previous, { rxdb: 'installed' }, ['small']);
  assert.deepEqual(merged.results, previous.results);
  assert.deepEqual(merged.environment.runs.map(r => r.startedAt), ['old', 'new']);
  assert.equal(merged.environment.measuredAt, 'new');
  assert.equal(merged.fatal, undefined);
  for (const [key, value] of [['device', 'other'], ['platform', 'android'], ['rxdb', 'different']]) {
    const wrong = structuredClone(previous); wrong.environment[key] = value;
    assert.throws(() => prepareReport(current, wrong, { rxdb: 'installed' }, ['small']), /Cannot resume/);
  }
});

test('resume skips completed bench and smoke rows and replaces failed rows', async () => {
  for (const leg of ['bench', 'smoke']) {
    const good = leg === 'bench' ? { cells: [{ name: 'read', samples: [{ ms: 1 }] }] } : { scenarios: [{ pass: false }] };
    const scale = leg === 'bench' ? 'small' : undefined;
    const report = { rows: ['expo-filesystem-js', 'worklet-filesystem', 'expo-sqlite'], trials: [], results: [
      { engine: 'expo-filesystem-js', scale, ...good },
      { engine: 'worklet-filesystem', scale, outcome: 'harness-failed', error: 'offline' },
    ] };
    const seen = [];
    await runDriverLoop(report, leg, async job => { seen.push(job.row); return good; });
    assert.deepEqual(seen, ['worklet-filesystem', 'expo-sqlite']);
    assert.equal(report.results.length, 3);
    assert.equal(report.complete, true);
    assert.ok(report.results.every(r => r.outcome !== 'harness-failed'));
  }
});

test('failed bench and smoke rows render as harness failures and are never compared', async () => {
  const { mkdtemp, mkdir, writeFile, readFile, rm } = await import('node:fs/promises');
  await mkdir(new URL('.deps/', here), { recursive: true });
  const directory = await mkdtemp(new URL('.deps/report-test-', here));
  try {
    await mkdir(directory + '/results');
    await writeFile(directory + '/RESULTS.md', '<!-- generated:start --><!-- generated:end -->');
    const report = { environment: { device: 'test', platform: 'ios' }, complete: false, results: [
      { engine: 'expo-filesystem-js', scale: 'small', outcome: 'harness-failed', error: 'offline' },
      { engine: 'expo-sqlite', scale: 'small', cells: [{ name: 'read', samples: [{ ms: 1 }] }], scenarios: [{ pass: true }] },
    ] };
    for (const leg of ['smoke', 'results']) await writeFile(`${directory}/results/${leg}.ios.test.json`, JSON.stringify(report));
    const { main, winner } = await import('./report.mjs');
    assert.equal(await main(new URL('file://' + directory + '/')), 0);
    const output = await readFile(directory + '/RESULTS.md', 'utf8');
    assert.match(output, /expo-filesystem-js.*harness-failed.*offline/);
    assert.match(output, /not evaluated/);
    assert.equal(winner(report, 'small/read'), 'not compared');
  } finally { await rm(directory, { recursive: true }); }
});

// Resume keeps even non-ok storage outcomes, but must replace harness failures at the same trial number.
test('crash resume retains scored trials and reruns only failed and missing trials', async () => {
  const report = { rows: ['expo-sqlite'], results: [], trials: [
    { row: 'expo-sqlite', trial: 1, outcome: 'lost' },
    { row: 'expo-sqlite', trial: 2, outcome: 'harness-failed' },
  ] };
  let launches = 0;
  const extra = { trials: 3, randomInt: () => 0, RANDOM_STOP_MAX_MS: 3000, performance,
    sleep: async () => {}, watchMs: 2000, WATCH_MS: 250,
    device: { stop: async () => {} },
  };
  const source = readFileSync(new URL('driver/driver.mjs', here), 'utf8');
  const control = await import('./driver/control.mjs');
  const context = { physicalIos: false, AbortController, ...control, ...extra, args: { resume: true }, rows: report.rows, leg: 'crash', report,
    process: {}, console: { info() {}, error() {} }, spec: row => ({ row }), save: async () => {},
    start: async () => { launches++; context.active = { seededAt: performance.now(), started: [], acked: new Set(), beginRetries: 0 }; return { promise: new Promise(() => {}), seeded: Promise.resolve() }; },
    run: async () => ({ outcome: 'ok' }),
  };
  const loop = source.slice(source.indexOf('try {\n  for (const row'), source.indexOf('\nfinally {'));
  await vm.runInNewContext('(async () => {' + loop + '})()', context);
  assert.equal(launches, 2);
  assert.deepEqual(report.trials.map(t => [t.trial, t.outcome]), [[1, 'lost'], [2, 'ok'], [3, 'ok']]);
  assert.equal(report.complete, true);
});

// Process absence/unreachability must not turn into a storage verdict at the open deadline.
test('physical liveness failures stay harness failures even at the opening deadline', async () => {
  const source = readFileSync(new URL('driver/driver.mjs', here), 'utf8');
  const wait = source.slice(source.indexOf('async function waitResult'), source.indexOf('async function run('));
  for (const unreachable of [false, true]) {
    let resolve, reject;
    const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
    promise.catch(() => {});
    const context = { active: { phase: 'opening', openedAt: 0, launchedAt: 0 }, physicalIos: true,
      performance: { now: () => 12000 }, OPEN_BUDGET_MS: 10000, JOB_BUDGET_MS: 1800000,
      watchMs: 2000, sleep: async () => {},
      device: { alive: async () => { if (unreachable) throw new Error('Harness failure: device unreachable'); return false; } },
      settle: (error, result) => { context.active.finished = true; if (error) reject(error); else resolve(result); },
    };
    const waitResult = vm.runInNewContext(wait + '; waitResult', context);
    await assert.rejects(waitResult(promise), unreachable ? /Harness failure: device unreachable/ : /Harness failure: process died while opening/);
  }
});

// A two-second liveness cadence must not delay seed delivery or the chosen stop time.
test('physical writer keeps the seeded race on the fast interval', async () => {
  const source = readFileSync(new URL('driver/driver.mjs', here), 'utf8');
  const control = await import('./driver/control.mjs');
  let now = 1, polls = 0, stoppedAt;
  const context = { physicalIos: false, AbortController, ...control, rows: ['expo-sqlite'], leg: 'crash', trials: 1, args: {},
    report: { results: [], trials: [] }, process: {}, console: { info() {}, error() {} },
    spec: row => ({ row }), randomInt: () => 10, RANDOM_STOP_MAX_MS: 3000,
    WATCH_MS: 250, watchMs: 2000, JOB_BUDGET_MS: 1800000, performance: { now: () => now },
    save: async () => {}, run: async () => ({ outcome: 'ok' }),
    device: { alive: async () => { polls++; return true; }, stop: async () => { stoppedAt = now; } },
    start: async () => { context.active = { launchedAt: now, started: [], acked: new Set() }; return { promise: new Promise(() => {}), seeded: new Promise(() => {}) }; },
    sleep: async ms => { now += ms; context.active.seededAt ??= now; },
  };
  const loop = source.slice(source.indexOf('try {\n  for (const row'), source.indexOf('\nfinally {'));
  await vm.runInNewContext('(async () => {' + loop + '})()', context);
  assert.equal(context.report.complete, true);
  assert.equal(stoppedAt, 261);
  assert.equal(polls, 1);
});

test('seed arrival cancels a physical liveness retry before the chosen stop', async () => {
  const source = readFileSync(new URL('driver/driver.mjs', here), 'utf8');
  const control = await import('./driver/control.mjs');
  let now = 1, seededResolve, stoppedAt;
  const context = { physicalIos: false, AbortController, ...control, AbortController, physicalIos: true, rows: ['expo-sqlite'], leg: 'crash', trials: 1, args: {},
    report: { rows: ['expo-sqlite'], results: [], trials: [] }, process: {}, console: { info() {}, error() {} },
    spec: row => ({ row }), randomInt: () => 1000, RANDOM_STOP_MAX_MS: 3000,
    WATCH_MS: 250, watchMs: 2000, JOB_BUDGET_MS: 1800000, performance: { now: () => now },
    save: async () => {}, run: async () => ({ outcome: 'ok' }),
    device: { alive: signal => {
      now = 100; context.active.seededAt = now; seededResolve();
      return new Promise(resolve => {
        signal?.addEventListener('abort', () => resolve(true), { once: true });
        setImmediate(() => { if (!signal?.aborted) { now = 5000; resolve(true); } });
      });
    }, stop: async () => { stoppedAt = now; } },
    start: async () => { context.active = { launchedAt: now, started: [], acked: new Set() }; return { promise: new Promise(() => {}), seeded: new Promise(resolve => { seededResolve = resolve; }) }; },
    sleep: async ms => { now += ms; },
  };
  const loop = source.slice(source.indexOf('try {\n  for (const row'), source.indexOf('\nfinally {'));
  await vm.runInNewContext('(async () => {' + loop + '})()', context);
  assert.equal(context.report.complete, true);
  assert.equal(stoppedAt, 1100);
});

test('narrowed resume cannot mark preserved missing trials complete', async () => {
  const report = { rows: ['expo-sqlite'], requestedTrials: 30, results: [], trials: [{ row: 'expo-sqlite', trial: 1, outcome: 'ok' }] };
  await runDriverLoop(report, 'crash', async () => { throw new Error('must skip'); }, { trials: 1 });
  assert.equal(report.complete, false);
});
