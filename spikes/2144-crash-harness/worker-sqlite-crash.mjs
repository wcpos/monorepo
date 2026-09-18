import sqlite3InitModule from '@sqlite.org/sqlite-wasm';
import { installHooks } from './hooks.mjs';
import { rowsFor, errorInfo, score, sleep } from './workload.mjs';
let sqlite, util, db, spec, flag, hooks, effective, statement;
const opened = new Set(), logs = [];
for (const level of ['warn', 'error']) {
  const original = console[level];
  console[level] = (...args) => { logs.push({ level, text: args.map(x => x?.message ?? String(x)).join(' ') }); original(...args); };
}
const all = (d, sql) => d.exec({ sql, rowMode: 'object', returnValue: 'resultRows' });
function open(name, fresh) {
  const d = new sqlite.oo1.DB('/' + name, fresh ? 'c' : 'w', util.vfsName);
  opened.add(d);
  try {
    d.exec('PRAGMA locking_mode = exclusive');
    const mode = String(d.selectValue(`PRAGMA journal_mode = ${spec.mode}`)).toUpperCase();
    if (mode !== spec.mode) throw new Error(`Requested ${spec.mode}, effective ${mode}`);
    if (spec.cache === -64) d.exec('PRAGMA cache_size = -64');
    if (spec.boundary === 'journal-before-delete') d.exec('PRAGMA journal_size_limit = 0'); // exclusive DELETE otherwise retains/zeros the journal
    if (spec.boundary) d.exec('PRAGMA wal_autocheckpoint = 0'); // explicit checkpoint isolates the armed commit
    effective = { journalMode: mode, cacheSize: d.selectValue('PRAGMA cache_size'), journalSizeLimit: d.selectValue('PRAGMA journal_size_limit') };
    if (fresh) d.exec(`CREATE TABLE docs (id TEXT PRIMARY KEY, revision TEXT, deleted INTEGER, lastWriteTime INTEGER, data TEXT, tx INTEGER) WITHOUT ROWID;
      CREATE INDEX docs_tx ON docs(tx); CREATE TABLE ledger (tx INTEGER PRIMARY KEY, n INTEGER, committedAt INTEGER);`);
    return d;
  } catch (e) { d.close(); opened.delete(d); throw e; }
}
function write(d, tx, n) {
  hooks.phase = 'body';
  d.transaction(() => {
    for (const row of rowsFor(tx, n)) {
      // n is CURRENT ownership, not the historical insert count: updates otherwise create false partials.
      statement = 'UPDATE ledger SET n=n-1 WHERE tx=(SELECT tx FROM docs WHERE id=?)';
      d.exec({ sql: statement, bind: [row.id] });
      statement = 'INSERT OR REPLACE INTO docs VALUES (?,?,?,?,?,?)';
      d.exec({ sql: statement, bind: [row.id, `1-${tx}`, 0, 1700000000000 + tx, JSON.stringify(row), tx] });
    }
    statement = 'INSERT INTO ledger VALUES (?,?,?)';
    d.exec({ sql: statement, bind: [tx, n, 1700000000000 + tx] });
    hooks.phase = 'commit'; statement = 'COMMIT';
  });
}
function read(d) {
  let integrity;
  try { integrity = d.exec({ sql: 'PRAGMA integrity_check', rowMode: 0, returnValue: 'resultRows' }); }
  catch (e) { return { integrity: [e.message], docs: [], ledger: [] }; }
  if (integrity.length !== 1 || integrity[0] !== 'ok') return { integrity, docs: [], ledger: [] };
  const tables = all(d, "SELECT name FROM sqlite_master WHERE type='table'").map(t => t.name);
  return { integrity, docs: tables.includes('docs') ? all(d, 'SELECT id,tx FROM docs') : [],
    ledger: tables.includes('ledger') ? all(d, 'SELECT * FROM ledger') : [] };
}
async function init(input) {
  spec = input; flag = input.flag ? new Int32Array(input.flag) : null;
  hooks = installHooks(FileSystemSyncAccessHandle.prototype, e => {
    // No I/O or postMessage inside the hold: the page observes shared memory only.
    Atomics.store(flag, 1, e.mainWrites); Atomics.store(flag, 0, 1);
    for (;;) Atomics.wait(flag, 0, 1);
  });
  sqlite = await sqlite3InitModule();
  // One attempt per worker. Retrying inside a worker whose first acquisition partially succeeded
  // leaves late-resolving access handles orphaned (sahpool acquires with Promise.all and releases on
  // the first rejection), so the PAGE retries with a fresh worker instead (recover() in harness-entry).
  const start = performance.now();
  util = await sqlite.installOpfsSAHPoolVfs({ name: 'spike-2144', directory: '/' + spec.pool, initialCapacity: spec.capacity ?? 12 });
  const reacquireMs = performance.now() - start;
  if (spec.poolOnly) return { reacquireMs };
  db = open(spec.name, !spec.reopen);
  return { reacquireMs, ...effective };
}
async function poolTrial() {
  const databases = [], checks = [], snapshots = { acked: [{ tx: 1, n: 3 }], inflight: null };
  let failure, failedName;
  for (let i = 0; i < 10; i++) {
    failedName = `pool${i}`;
    try { const d = open(failedName, true); write(d, 1, 3); databases.push(d); }
    catch (e) { failure = errorInfo(e); break; }
  }
  for (const d of databases) checks.push(score(snapshots, read(d)));
  const failureLogs = logs.slice();
  const cleanFailure = failure?.resultCode === 14 && [failure.message, ...failureLogs.map(l => l.text)].join('\n').includes('SAH pool is full');
  await util.addCapacity(4);
  // A failed WAL open may have allocated its main slot before running out; resume that same name.
  const next = new sqlite.oo1.DB('/' + failedName, 'c', util.vfsName); opened.add(next);
  next.exec('PRAGMA locking_mode = exclusive');
  if (String(next.selectValue('PRAGMA journal_mode = WAL')).toUpperCase() !== 'WAL') throw new Error('WAL refused after addCapacity');
  next.exec('CREATE TABLE IF NOT EXISTS capacity_probe (v); INSERT INTO capacity_probe VALUES (1)');
  const capacityRecovered = next.selectValue('SELECT count(*) FROM capacity_probe') === 1;
  return { outcome: checks.find(c => c.outcome !== 'ok')?.outcome ?? (cleanFailure && capacityRecovered ? 'ok' : 'open-failed'),
    failure, failureLogs, cleanFailure, capacityRecovered, openedDatabases: databases.length, checks, ...effective };
}
function checkNames(expected) {
  const names = util.getFileNames().sort();
  if (JSON.stringify(names) !== JSON.stringify(expected.slice().sort())) throw new Error(`Live set mismatch: ${JSON.stringify({ expected, names })}`);
  return names;
}
function slotRound(round) {
  if (round) util.unlink('/' + `s${String(round - 1).padStart(7, '0')}`);
  const long = `l${String(round).padStart(63, '0')}`, short = `s${String(round).padStart(7, '0')}`;
  for (const name of [long, short]) {
    const d = open(name, true);
    for (let tx = 1; tx <= 20; tx++) write(d, tx, 1);
    d.close(); opened.delete(d);
    if (name === long && !util.unlink('/' + long)) throw new Error('Long name unlink failed');
  }
  const names = checkNames(['/' + short]), d = open(short, false);
  const result = score({ acked: Array.from({ length: 20 }, (_, i) => ({ tx: i + 1, n: 1 })), inflight: null }, read(d));
  d.close(); opened.delete(d);
  return { ...result, names, short, ...effective };
}
self.onmessage = async ({ data: m }) => {
  try {
    let result;
    if (m.op === 'init') result = await init(m.spec);
    else if (m.op === 'write') {
      if (m.arm) hooks.arm({ ...m.arm, mode: spec.mode, path: '/' + spec.name });
      hooks.failures.length = 0;
      write(db, m.tx, m.n);
      self.postMessage({ ack: { tx: m.tx, n: m.n } }); // only after db.transaction's COMMIT returned
      if (m.checkpoint && spec.mode === 'WAL') {
        hooks.phase = 'checkpoint'; statement = 'PRAGMA wal_checkpoint(TRUNCATE)'; db.exec(statement);
      }
      result = { mainWrites: hooks.mainWrites, trace: m.arm ? hooks.trace : undefined };
      hooks.armed = null;
    } else if (m.op === 'checkpoint') db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
    else if (m.op === 'read') result = read(db);
    else if (m.op === 'pool') result = await poolTrial();
    else if (m.op === 'slot') result = slotRound(m.round);
    else if (m.op === 'slotCheck') {
      const names = checkNames(['/' + m.name]), d = open(m.name, false);
      result = { names, read: read(d), ...effective }; d.close(); opened.delete(d);
    } else if (m.op === 'close') { for (const d of opened) d.close(); opened.clear(); }
    else throw new Error(`Unknown operation: ${m.op}`);
    self.postMessage({ id: m.id, result, logs: logs.splice(0) });
  } catch (e) {
    self.postMessage({ id: m.id, error: { ...errorInfo(e), statement, hookFailures: hooks?.failures.slice(), logs: logs.splice(0) } });
  }
};
