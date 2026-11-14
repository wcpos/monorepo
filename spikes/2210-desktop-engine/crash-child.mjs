import { fillWithDefaultSettings, normalizeMangoQuery, prepareQuery } from 'rxdb/plugins/core';
import { closeDatabaseConnection } from 'rxdb-premium/plugins/storage-sqlite';
import { DatabaseSync } from 'node:sqlite';
import { parseArgs, format } from 'node:util';
import { once } from 'node:events';
import { openEngine } from './engines.mjs';
import { fixtures } from './bench-node.mjs';
const { values: args } = parseArgs({ options: { row: { type: 'string' }, dir: { type: 'string' }, db: { type: 'string' }, score: { type: 'boolean' } } });
const schema = fillWithDefaultSettings({ version: 0, primaryKey: 'id', type: 'object', properties: {
  id: { type: 'string', maxLength: 64 }, tx: { type: 'number', minimum: 0, maximum: 1e9, multipleOf: 1 },
  payload: { type: 'object', additionalProperties: true } }, required: ['id', 'tx', 'payload'], indexes: ['tx'] });
const prepared = prepareQuery(schema, normalizeMangoQuery(schema, { selector: { _deleted: false }, sort: [{ id: 'asc' }] }));
const pattern = [1, 1, 3, 1, 50, 1, 1, 1000];
const rng = seed => () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
const send = message => new Promise((resolve, reject) => process.send(message, error => error ? reject(error) : resolve()));
const seedIds = Array.from({ length: 2000 }, (_, i) => `s${i}`);
async function writer() {
  const engine = await openEngine(args.row, args.dir, args.db), instance = await engine.create('docs', schema);
  engine.proveWal();
  const templates = fixtures(2000).products, previous = new Map();
  async function write(tx, ids) {
    const documents = ids.map((id, i) => {
      const old = previous.get(id), payload = structuredClone(templates[i % templates.length].payload);
      const doc = { id, tx, payload, _deleted: false, _attachments: {},
        _rev: `${Number(old?._rev.split('-')[0] ?? 0) + 1}-${tx}`, _meta: { lwt: 1700000000000 + tx + 1 } };
      payload.description = ''; payload.description = 'x'.repeat(Math.max(0, 2000 - JSON.stringify(doc).length));
      return doc;
    });
    const result = await instance.bulkWrite(documents.map(document => ({ document, ...(previous.has(document.id) ? { previous: previous.get(document.id) } : {}) })), 'spike2210');
    if (result.error.length) throw new Error(JSON.stringify(result.error));
    for (const doc of documents) previous.set(doc.id, doc);
  }
  await write(0, seedIds.slice(0, 1000)); await write(0, seedIds.slice(1000));
  await engine.analyze(instance);
  await send({ type: 'seeded', wal: engine.wal });
  for (let tx = 1; ; tx++) {
    const n = pattern[(tx - 1) % pattern.length], start = Math.floor(rng(2144 + tx)() * 2000);
    const ids = Array.from({ length: n }, (_, i) => i < Math.floor(n / 5) ? `s${(start + i) % 2000}` : `t${tx}-${i}`);
    await send({ type: 'started', tx, n, ids });
    await write(tx, ids);
    await send({ type: 'acked', tx });
  }
}
function score(snapshot, docs) {
  const actual = new Map(docs.map(d => [d.id, d.tx])), expected = new Map();
  const acked = [{ tx: 0, ids: seedIds }, ...snapshot.acked];
  for (const { tx, ids } of acked) for (const id of ids) expected.set(id, tx);
  const inflight = snapshot.inflight, inflightIds = new Set(inflight?.ids ?? []);
  const presentCount = inflight ? docs.filter(d => d.tx === inflight.tx && inflightIds.has(d.id)).length : 0;
  const inflightPresence = !inflight ? 'none' : presentCount === 0 ? 'absent' : presentCount === inflight.n ? 'present' : 'partial';
  // Later acknowledged owners supersede earlier ones. Only actual in-flight replacements excuse
  // an old owner's absence; a partly written in-flight batch must not hide an unrelated lost ack.
  const missing = [...expected].filter(([id, tx]) => actual.get(id) !== tx && !(inflightIds.has(id) && actual.get(id) === inflight.tx));
  if (missing.length) return { outcome: 'lost', inflightPresence, missing: missing.slice(0, 20), missingCount: missing.length };
  if (inflightPresence === 'present') for (const id of inflight.ids) expected.set(id, inflight.tx);
  const partial = inflightPresence === 'partial' || actual.size !== expected.size || [...actual].some(([id, tx]) => expected.get(id) !== tx);
  return { outcome: partial ? 'partial' : 'ok', inflightPresence };
}
async function scorer(snapshot) {
  const logs = [], saved = {};
  for (const method of ['log', 'info', 'warn', 'error', 'debug', 'trace', 'assert']) {
    saved[method] = console[method]; console[method] = (...values) => logs.push(format(...values));
  }
  // Installed patches sometimes report through hooks rather than console. Observe, never repair.
  for (const hook of ['__wcposOnStorageRecovery', '__wcposOnIndexRebuild', '__wcposOnStorageRunFailure'])
    globalThis[hook] = event => logs.push(`recovery ${hook}: ${format(event)}`);
  const start = performance.now(); let engine, instance, docs, lastError, subscription;
  await send({ type: 'scoring' });
  try {
    do {
      try {
        engine ??= await openEngine(args.row, args.dir, args.db);
        instance ??= await engine.create('docs', schema);
        subscription ??= instance.changeStream().subscribe({ error: e => logs.push(`storage error: ${format(e)}`) });
        docs = (await instance.query(prepared)).documents;
        break;
      } catch (error) {
        lastError = String(error.stack ?? error);
        subscription?.unsubscribe(); subscription = null;
        await engine?.close().catch(() => {});
        // Premium caches even rejected opens by name. Release that entry before actually reopening.
        if (engine?.sqliteBasics) await Promise.resolve(closeDatabaseConnection(engine.databaseName, engine.sqliteBasics)).catch(() => {});
        engine = instance = null;
        await new Promise(resolve => setTimeout(resolve, 50));
      }
    } while (performance.now() - start < 10000);
    const reopenMs = performance.now() - start;
    if (!docs) return { outcome: 'open-failed', reopenMs, integrity: 'not checked', error: lastError, logs };
    engine.proveWal();
    await send({ type: 'read' }); // The reopen deadline stops at the first successful query.
    let integrity;
    if (args.row === 'sqlite-node') {
      try {
        const db = new DatabaseSync(engine.databaseName, { readOnly: true });
        try { integrity = db.prepare('PRAGMA integrity_check').all().map(r => Object.values(r)[0]); } finally { db.close(); }
      } catch (e) { integrity = [String(e)]; }
    } else {
      // The installed wcpos patches REPAIR a stale changelog or index on reopen and say so
      // ("rebuilt storage indexes", salvage hooks). A completed repair is the engine surviving the
      // stop, not failing it; only a reported failure, parse error or corruption is integrity-failed.
      // The repair is still recorded per trial, because an unpatched premium would not have it.
      integrity = logs.filter(l => /pars(e|ing).*fail|syntaxerror|corrupt|invalid json|storage error|_decode\(\) failed|failed|error/i.test(l) && !/rebuilt|salvaged|recovered/i.test(l));
      if (!integrity.length) integrity = ['ok'];
    }
    const repairs = logs.filter(l => /rebuilt|salvag|recover/i.test(l)).length;
    // Always score the ledger, so a repaired reopen still reports whether acked rows survived.
    const ledger = score(snapshot, docs);
    const result = integrity.length === 1 && integrity[0] === 'ok' ? ledger : { outcome: 'integrity-failed', inflightPresence: ledger.inflightPresence };
    return { ...result, ledger: ledger.outcome, missingCount: ledger.missingCount ?? 0, repairs, reopenMs, integrity: integrity.join('; '), wal: engine.wal, logs };
  } finally {
    subscription?.unsubscribe();
    for (const [method, original] of Object.entries(saved)) console[method] = original;
  }
}
try {
  if (args.score) {
    const [snapshot] = await once(process, 'message');
    const result = await scorer(snapshot);
    process.stdout.write(JSON.stringify(result) + '\n', () => process.exit(0));
  } else await writer();
} catch (error) { console.error(error); process.exit(1); }
