export const pattern = [1, 1, 3, 1, 50, 1, 1, 1000];
export const rng = seed => () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
export const errorInfo = e => ({ name: e.name, message: e.message ?? String(e), resultCode: e.resultCode ?? null });
export const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
export function idsFor(tx, n) {
  const start = Math.floor(rng(2144 + tx)() * 2000);
  return Array.from({ length: n }, (_, i) => tx === 0 ? `s${i}` : i < Math.floor(n / 5) ? `s${(start + i) % 2000}` : `t${tx}-${i}`);
}
export function rowsFor(tx, n) {
  const random = rng(2144 + tx);
  return idsFor(tx, n).map(id => ({ id, tx, payload: `${Math.floor(random() * 1e9)}:` + 'x'.repeat(1940) }));
}
export function ownership(ledger, inflight = null) {
  const owners = new Map();
  for (const { tx, n } of [...ledger, ...(inflight ? [inflight] : [])]) for (const id of idsFor(tx, n)) owners.set(id, tx);
  return owners;
}
export function score(snapshot, read) {
  if (read.integrity && (read.integrity.length !== 1 || read.integrity[0] !== 'ok')) return { outcome: 'integrity-failed', integrity: read.integrity };
  const actual = new Map(read.docs.map(d => [d.id, d.tx]));
  const present = snapshot.inflight ? read.ledger ? read.ledger.some(l => l.tx === snapshot.inflight.tx)
    : read.docs.some(d => d.tx === snapshot.inflight.tx) : null;
  const expected = ownership(snapshot.acked, present ? snapshot.inflight : null), counts = new Map();
  for (const tx of actual.values()) counts.set(tx, (counts.get(tx) ?? 0) + 1);
  const lost = snapshot.acked.filter(a => read.ledger ? !read.ledger.some(l => l.tx === a.tx) : !counts.has(a.tx));
  if (lost.length) return { outcome: 'lost', missing: lost.map(a => a.tx), inflightPresent: present };
  const partial = read.ledger?.some(l => (counts.get(l.tx) ?? 0) !== l.n)
    || read.ledger && [...counts.keys()].some(tx => !read.ledger.some(l => l.tx === tx))
    || actual.size !== expected.size || [...expected].some(([id, tx]) => actual.get(id) !== tx);
  return { outcome: partial ? 'partial' : 'ok', inflightPresent: present };
}
export const boundaries = [
  ['wal-after-page-write', ['WAL'], 1], ['wal-after-commit-flush-before-checkpoint', ['WAL'], 1000],
  ['wal-mid-checkpoint', ['WAL'], 1000], ['journal-after-write', ['DELETE'], 1],
  ['journal-after-flush-before-db-write', ['DELETE'], 1], ['db-mid-commit', ['DELETE'], 1000],
  ['db-after-write-before-flush', ['WAL', 'DELETE'], 1000], ['journal-before-delete', ['DELETE'], 1],
];
