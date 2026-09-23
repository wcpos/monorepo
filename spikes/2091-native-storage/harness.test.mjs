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
