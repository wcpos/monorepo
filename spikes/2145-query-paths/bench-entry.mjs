import { getRxStorageWorker } from 'rxdb-premium/plugins/storage-worker';
import { fillWithDefaultSettings, normalizeMangoQuery, prepareQuery, randomToken } from 'rxdb/plugins/core';

const terms = ['quartz', 'cobalt'], open = ['pos-open', 'pos-partial', 'pending'];
const fields = ['context.fold', 'message', 'context.error', 'context.errorCode', 'context.search'];
const search = n => ({ $and: terms.slice(0, n).map(t => ({ $or: fields.map((f, i) => ({ [f]: { $regex: t, ...(i ? { $options: 'i' } : {}) } })) })) });
const cashier = { 'payload.meta_data': { $elemMatch: { key: '_pos_user', value: '1' } } };
// count() IS the unlimited query plus .length (premium routes count through query() on the fallback path),
// so the unlimited cell is not measured separately: at ~340 ms per fallback page it would double a run that already takes an hour.
const cases = [1, 2].flatMap(n => ['find50', 'count'].map(op => ({ name: `logs-${n}`, collection: 'logs', op, selector: search(n) })));
for (const scoped of [false, true]) for (const op of ['find50', 'count']) cases.push({ name: scoped ? 'orders-open' : 'orders-all', collection: 'orders', op, selector: { ...cashier, ...(scoped ? { status: { $in: open } } : {}) } });
const schemaFor = collection => {
  const logs = collection === 'logs', primaryKey = logs ? 'id' : 'uuid', date = logs ? 'timestamp' : 'dateCreatedGmt';
  return fillWithDefaultSettings({ version: 0, primaryKey, type: 'object', required: [primaryKey, date],
    properties: { [primaryKey]: { type: 'string', maxLength: 64 }, [date]: { type: 'string', maxLength: 32 },
      ...(logs ? { level: { type: 'string' }, message: { type: 'string' }, context: { type: 'object' } } :
        { remoteId: { type: 'number' }, status: { type: 'string', maxLength: 32 }, payload: { type: 'object' }, sync: { type: 'object' }, local: { type: 'object' } }) },
    indexes: logs ? [[date]] : [[date], ['status', date]],
  });
};
function document(collection, i) {
  const id = String(i).padStart(8, '0'), date = new Date(1700000000000 + i * 1000).toISOString();
  const words = Array.from({ length: 10 }, (_, j) => ['amber', 'birch', 'cedar', 'delta', 'elm', 'fern', 'grove'][(Math.imul(i + 1, 1664525 + j * 2) >>> 0) % 7]).join(' ');
  const row = collection === 'logs' ? { id, timestamp: date, level: 'warn', message: words,
    context: { fold: i % 50 ? words : `quartz ${i % 100 ? words : 'cobalt'}`, error: '', errorCode: 'SYNC331', search: words, padding: '' } } :
    { uuid: id, remoteId: i, dateCreatedGmt: date, status: [...open, 'completed', 'cancelled'][Math.floor(i / 4) % 5], sync: {}, local: {},
      payload: { meta_data: [{ id: 1, key: '_pos_user', value: String(i % 4 + 1) }, { id: 2, key: '_pos_store', value: '1' },
        ...Array.from({ length: 4 + i % 5 }, (_, j) => ({ id: j + 3, key: `extra_${j}`, value: words }))] } };
  Object.assign(row, { _deleted: false, _attachments: {}, _rev: '1-seed', _meta: { lwt: 1700000000000 + i } });
  if (collection === 'logs') row.context.padding = 'x'.repeat(Math.max(0, 500 - JSON.stringify(row).length));
  return row;
}
globalThis.runBench = async () => {
  const cells = [], plans = {}, expected = new Map(), seedBytes = {}, schemas = {};
  for (const mode of ['fallback', 'modifier']) {
    const worker = new Worker(`/files/spike-2145/worker-${mode}.js`, { type: 'module' });
    const pending = new Map(); let sequence = 0;
    worker.addEventListener('message', ({ data: m }) => {
      if (m.type !== 'spike-2145-result') return;
      const p = pending.get(m.id); pending.delete(m.id); m.error ? p.reject(new Error(m.error)) : p.resolve(m.result);
    });
    const rpc = (action, extra = {}) => new Promise((resolve, reject) => {
      const id = ++sequence; pending.set(id, { resolve, reject }); worker.postMessage({ type: 'spike-2145', id, action, ...extra });
    });
    // Premium keys its global mode:one cache by String(workerInput), not function identity.
    const workerInput = mode === 'fallback' ? function fallbackWorker() { return worker; } : function modifierWorker() { return worker; };
    const storage = getRxStorageWorker({ workerInput, mode: 'one' }), instances = {};
    try {
      for (const collection of ['logs', 'orders']) {
        const schema = schemaFor(collection); schemas[collection] = schema;
        const instance = instances[collection] = await storage.createStorageInstance({ databaseInstanceToken: randomToken(10),
          databaseName: `spike2145-${mode}-${randomToken(12)}`, collectionName: collection, schema, options: {}, multiInstance: false, devMode: true });
        let bytes = 0; const count = collection === 'logs' ? 46000 : 20000;
        for (let start = 0; start < count; start += 1000) {
          const batch = Array.from({ length: 1000 }, (_, j) => ({ document: document(collection, start + j) }));
          bytes += batch.reduce((sum, r) => sum + JSON.stringify(r.document).length, 0);
          const written = await instance.bulkWrite(batch, 'spike2145');
          if (written.error.length) throw new Error(JSON.stringify(written.error));
        }
        seedBytes[collection] = bytes / count;
      }
      for (const c of cases) {
        const instance = instances[c.collection], date = c.collection === 'logs' ? 'timestamp' : 'dateCreatedGmt';
        const query = normalizeMangoQuery(instance.schema, { selector: { ...c.selector, _deleted: { $eq: false } }, sort: [{ [date]: 'desc' }], ...(c.op === 'find50' ? { limit: 50 } : {}) });
        const prepared = prepareQuery(instance.schema, query), extra = { collection: c.collection, query, count: c.op === 'count' }, key = `${c.name}/${c.op}`;
        if (mode === 'fallback') { plans[key] = await rpc('explain', extra); console.info('EXPLAIN', key, JSON.stringify(plans[key])); }
        for (const path of mode === 'fallback' ? ['fallback', 'direct'] : ['modifier']) {
          // A fallback count pages the whole table (920 pages at 46k logs, ~5 min a sample): three samples there, five elsewhere.
          const samples = [], wanted = path === 'fallback' && c.op === 'count' ? 3 : 5;
          for (let run = -1; run < wanted; run++) {
            const start = performance.now();
            const result = path === 'direct' ? await rpc('direct', extra) : await instance[c.op === 'count' ? 'count' : 'query'](prepared);
            const pageMs = performance.now() - start, metrics = await rpc('stats');
            const signature = JSON.stringify(result.documents ? result.documents.map(d => d.id ?? d.uuid) : result.count);
            if (!expected.has(key)) expected.set(key, signature);
            if (expected.get(key) !== signature) throw new Error(`Different result: ${path}/${key}`);
            const matches = result.documents?.length ?? result.count;
            const total = c.collection === 'logs' ? (c.name === 'logs-1' ? 920 : 460) : (c.name === 'orders-all' ? 5000 : 3000);
            if (matches !== (c.op === 'find50' ? 50 : total)) throw new Error(`Wrong cardinality: ${key}: ${matches}`);
            if (run >= 0) samples.push({ ...metrics, pageMs, matches });
          }
          cells.push({ query: c.name, operation: c.op, mode: path, samples }); console.info('CELL', JSON.stringify(cells.at(-1)));
        }
      }
    } finally { try { for (const instance of Object.values(instances)) await instance.close(); } finally { worker.terminate(); } }
  }
  return { cells, plans, schemas, seedBytes, rows: { logs: 46000, orders: 20000 }, terms, open };
};
