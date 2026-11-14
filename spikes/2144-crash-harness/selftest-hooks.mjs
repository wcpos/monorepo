import assert from 'node:assert/strict';
import { installHooks } from './hooks.mjs';
// Source-derived recordings of sahpool calls (index.mjs xWrite/xSync/xDelete),
// NOT browser measurements. A wrong phase, path, or pre/post edge must fail here.
const recordings = {
  WAL: [
    ['write', 'wal', 4096, 32, 'body'], ['flush', 'wal', 0, 0, 'body'],
    ['write', 'wal', 4128, 4096, 'commit'], ['flush', 'wal', 0, 0, 'commit'],
    ['write', 'db', 4096, 4096, 'checkpoint'], ['write', 'db', 8192, 4096, 'checkpoint'],
    ['write', 'db', 12288, 4096, 'checkpoint'], ['flush', 'db', 0, 0, 'checkpoint'],
  ],
  DELETE: [
    ['write', 'journal', 4096, 512, 'body'], ['flush', 'journal', 0, 0, 'body'],
    ['write', 'db', 4096, 4096, 'body'], // cache spill must not count as commit
    ['write', 'journal', 4608, 4096, 'commit'], ['flush', 'journal', 0, 0, 'commit'],
    ['write', 'db', 4096, 4096, 'commit'], ['write', 'db', 8192, 4096, 'commit'],
    ['write', 'db', 12288, 4096, 'commit'], ['flush', 'db', 0, 0, 'commit'],
    ['release', 'journal', 0, 516, 'commit'], ['truncate', 'journal', 4096, 0, 'commit'],
  ],
};
const cases = [
  ['wal-after-page-write', 'WAL', 0, 'after'],
  ['wal-after-commit-flush-before-checkpoint', 'WAL', 4, 'before'],
  ['wal-mid-checkpoint', 'WAL', 5, 'after'],
  ['journal-after-write', 'DELETE', 0, 'after'],
  ['journal-after-flush-before-db-write', 'DELETE', 2, 'before'],
  ['db-mid-commit', 'DELETE', 6, 'after'],
  ['db-after-write-before-flush', 'DELETE', 7, 'after'],
  ['db-after-write-before-flush', 'WAL', 6, 'after'],
  ['journal-before-delete', 'DELETE', 9, 'before'],
];
for (const [boundary, mode, wanted, edge] of cases) {
  let at = -1, calls = 0;
  const fired = [];
  class Handle {
    write(bytes) { calls++; return bytes.byteLength; }
    flush() { calls++; }
    truncate() { calls++; }
  }
  const hooks = installHooks(Handle.prototype, event => fired.push({ at, edge: event.edge, calls }));
  const handles = Object.fromEntries(['db', 'wal', 'journal'].map(k => [k, new Handle()]));
  const associate = (h, path) => {
    const bytes = new Uint8Array(516); bytes.set(new TextEncoder().encode(path));
    h.write(bytes, { at: 0 }); h.flush();
  };
  for (const [key, h] of Object.entries(handles)) associate(h, '/test' + (key === 'db' ? '' : '-' + key));
  hooks.arm({ boundary, mode, path: '/test', k: 2, last: 3 });
  // Header writes/flushes and other databases must not trip the predicate.
  const unrelated = new Handle(); associate(unrelated, '/elsewhere');
  unrelated.write(new Uint8Array(4096), { at: 4096 }); unrelated.flush();
  for (const [i, [op, key, offset, length, phase]] of recordings[mode].entries()) {
    at = i; hooks.phase = phase;
    const before = calls, h = handles[key];
    if (op === 'release') h.write(new Uint8Array(516), { at: 0 });
    else if (op === 'write') h.write(new Uint8Array(length), { at: offset });
    else if (op === 'truncate') h.truncate(offset);
    else h.flush();
    if (i === wanted) assert.equal(fired[0]?.calls, before + (edge === 'after' ? 1 : 0), boundary);
  }
  assert.deepEqual(fired.map(({ at, edge }) => ({ at, edge })), [{ at: wanted, edge }], boundary);
  hooks.restore();
  console.info(`PASS ${boundary} ${mode}: event ${wanted}, ${edge}, once`);
}
// xDelete may truncate before releasing the association: cover that permitted variant.
{
  class Handle { write(b) { return b.byteLength; } flush() {} truncate() {} }
  const hits = [], hooks = installHooks(Handle.prototype, e => hits.push(e));
  const h = new Handle(), b = new Uint8Array(516); b.set(new TextEncoder().encode('/test-journal'));
  h.write(b, { at: 0 }); hooks.arm({ boundary: 'journal-before-delete', mode: 'DELETE', path: '/test' });
  h.truncate(4096); h.write(new Uint8Array(516), { at: 0 });
  assert.equal(hits.length, 1); assert.equal(hits[0].edge, 'before'); hooks.restore();
  console.info('PASS journal-before-delete truncate variant: before, once');
}
console.info('PASS 8 predicates, 9 mode cases + truncate variant (synthetic traces; no durability claim)');
