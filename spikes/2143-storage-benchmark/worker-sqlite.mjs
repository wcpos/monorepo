import sqlite3InitModule from '@sqlite.org/sqlite-wasm';
import { getRxStorageSQLite } from 'rxdb-premium/plugins/storage-sqlite';
import { exposeWorkerRxStorage } from 'rxdb-premium/plugins/storage-worker';
import { getSQLiteBasicsOo1 } from './sqlite-basics-oo1.mjs';
const ready = sqlite3InitModule().then(s => s.installOpfsSAHPoolVfs({ name: 'spike-2143', initialCapacity: 64 }));
const sqliteBasics = getSQLiteBasicsOo1({ journalMode: 'WAL', openDb: async n => new (await ready).OpfsSAHPoolDb('/' + n) });
// Copied from 2145; the guard below restricts it to the operators used in this workload.
function predicate(selector, params, primary) {
	return (
		'(' +
		Object.entries(selector)
			.map(([field, value]) => {
				if (field === '$and' || field === '$or')
					return value.map((s) => predicate(s, params, primary)).join(field === '$and' ? ' AND ' : ' OR ');
				const column = field === '_deleted' ? 'deleted' : field === primary ? 'id' : `JSON_EXTRACT(data, '$.${field}')`;
				if (value.$regex !== undefined) {
					// buildScanSearchSelector regex-escapes the typed term (`0\.4`, `K\-2`): undo that,
					// then escape the SQL wildcards so the pattern is a literal substring match.
					const term = value.$regex.replace(/\\(.)/g, '$1');
					if (value.$options === 'i') {
						params.push('%' + term.replace(/[\\%_]/g, '\\$&') + '%');
						return `${column} LIKE ? ESCAPE '\\'`;
					}
					params.push('*' + term.replace(/[*?[]/g, '[$&]') + '*');
					return `${column} GLOB ?`;
				}
				if (value.$elemMatch) {
					params.push(...[value.$elemMatch.key, value.$elemMatch.value].map((v) => v.$eq ?? v));
					return `EXISTS (SELECT 1 FROM json_each(${column}) WHERE json_extract(value,'$.key') = ? AND json_extract(value,'$.value') = ?)`;
				}
				if (value.$in) {
					params.push(...value.$in);
					return `${column} IN (${value.$in.map(() => '?').join(',')})`;
				}
				params.push(value.$eq ?? value);
				return `${column} = ?`;
			})
			.join(' AND ') +
		')'
	);
}
function translatable(selector) {
  return Object.entries(selector).every(([field, v]) => {
    if (field === '$and' || field === '$or') return v.length > 0 && v.every(translatable);
    if (!/^[a-zA-Z_][\w.]*$/.test(field) || !v || typeof v !== 'object') return false;
    const keys = Object.keys(v);
    return keys.length === 1 && (keys[0] === '$eq' && ['string', 'number', 'boolean'].includes(typeof v.$eq)
      || keys[0] === '$in' && v.$in.length > 0 && v.$in.every(x => ['string', 'number'].includes(typeof x))
      || keys[0] === '$elemMatch' && Object.keys(v.$elemMatch).sort().join() === 'key,value'
        && Object.values(v.$elemMatch).every(x => typeof (x?.$eq ?? x) === 'string'));
  });
}
const storage = getRxStorageSQLite({ sqliteBasics, storeAttachmentsAsBase64String: true,
  queryModifier(q, prepared) {
    if (!translatable(prepared.mangoQuery.selector)) return q;
    const params = [], where = predicate(prepared.mangoQuery.selector, params, prepared.schema?.primaryKey);
    return { ...q, query: q.query.replace('ORDER BY', `WHERE ${where} ORDER BY`), params };
  },
});
const create = storage.createStorageInstance.bind(storage);
const instances = new Map();
storage.createStorageInstance = async p => {
  const instance = await create(p);
  instances.set(p.collectionName, instance);
  for (const method of ['query', 'count']) {
    const original = instance[method].bind(instance);
    instance[method] = async prepared => {
      const q = prepared.query;
      if (!translatable(q.selector)) return original(prepared);
      const db = await instance.internals.databasePromise;
      await instance.internals.indexCreationPromise;
      const params = [], where = predicate(q.selector, params, instance.primaryPath), count = method === 'count';
      const sort = (q.sort || []).map(s => Object.entries(s).map(([k, v]) => `${k === instance.primaryPath ? 'id' : `JSON_EXTRACT(data, '$.${k}')`} ${v}`).join(',')).join(',');
      const query = `SELECT ${count ? 'COUNT(1) AS count' : 'data'} FROM "${instance.tableName}" WHERE deleted = 0 AND ${where}`
        + (count ? '' : ` ORDER BY ${sort} LIMIT ${q.limit ?? -1} OFFSET ${q.skip ?? 0}`);
      const rows = await sqliteBasics.all(db, { query, params, context: { method: 'spike-translated', data: {} } });
      return count ? { count: rows[0].count, mode: 'fast' } : { documents: rows.map(r => JSON.parse(r.data)) };
    };
  }
  return instance;
};
exposeWorkerRxStorage({ storage });
self.addEventListener('message', async ({ data: m }) => {
  if (m?.type !== 'spike-2143-probe') return;
  try {
    const instance = instances.get(m.collection), db = await instance.internals.databasePromise;
    await instance.internals.indexCreationPromise;
    // Resolve the placeholder here, without an extra SQL read before measurement (a).
    const query = m.action === 'pragma' ? `PRAGMA ${m.name}`
      : (m.action === 'explain' ? 'EXPLAIN QUERY PLAN ' : '')
        + m.query.replace('"$table"', `"${instance.tableName.replaceAll('"', '""')}"`);
    const start = performance.now();
    const rows = await sqliteBasics.all(db, { query, params: m.params ?? [], context: { method: 'spike-2143-probe', data: {} } });
    const ms = performance.now() - start;
    const result = { ms, tableName: instance.tableName, ...(m.action === 'explain' ? { plan: rows }
      : m.action === 'pragma' ? { value: Object.values(rows[0] ?? {})[0] }
        : { rows: rows.length, first: JSON.stringify(rows[0] ?? null).slice(0, 200) }) };
    self.postMessage({ type: 'spike-2143-probe-result', id: m.id, result });
  } catch (e) {
    self.postMessage({ type: 'spike-2143-probe-result', id: m.id, error: String(e.stack || e) });
  }
});
