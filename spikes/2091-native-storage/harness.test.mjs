import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import vm from 'node:vm';
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
// Catches reintroducing the launch/openurl race or accepting a missing simulator PID.
test('simulator launches via openurl only and waits for its PID', async () => {
  const source = readFileSync(new URL('driver/ios.mjs', here), 'utf8').replace(/^import .*;\n/gm, '').replace('export async function', 'async function').replaceAll('import.meta.url', JSON.stringify(new URL('driver/ios.mjs', here).href));
  const calls = [];
  let polls = 0, elapsed = 0;
  const context = { URL, fileURLToPath: u => u.pathname, bundle: 'com.wcpos.spike2091', performance: { now: () => elapsed },
    sleep: async ms => { elapsed += ms; },
    command: async (_file, args) => {
      calls.push(args);
      if (args[1] === 'list') return JSON.stringify({ devices: { runtime: [{ udid: 'test', state: 'Booted' }] } });
      if (args[1] === 'launch') return 'com.wcpos.spike2091: 123';
      if (args.includes('launchctl')) return ++polls > 1 ? '123\t0\tUIKitApplication:com.wcpos.spike2091[abc]' : '';
      return '';
    } };
  const ios = vm.runInNewContext(source + '; ios', context);
  const device = await ios('test', true);
  await device.launch('spike2091://driver');
  assert.equal(calls.some(args => args[1] === 'launch'), false);
  assert.equal(polls, 2);
  polls = -100000;
  await assert.rejects(device.launch('spike2091://driver'), /No launch PID/);
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
