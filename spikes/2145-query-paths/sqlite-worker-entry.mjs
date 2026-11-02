/* eslint-disable import/no-unresolved -- @sqlite.org/sqlite-wasm lives in spike 2138's gitignored rxdb clone; run.sh bundles from there */
/* global MODIFIER -- injected by esbuild --define in run.sh: true for the queryModifier bundle */
import sqlite3InitModule from '@sqlite.org/sqlite-wasm';
import { getRxStorageSQLite } from 'rxdb-premium/plugins/storage-sqlite';
import { exposeWorkerRxStorage } from 'rxdb-premium/plugins/storage-worker';

import { getSQLiteBasicsOo1 } from './sqlite-basics-oo1.mjs';

// Separate pools: two live workers must never contend for the same SAH handles.
const ready = sqlite3InitModule().then((s) =>
	s.installOpfsSAHPoolVfs({ name: `spike-2145-${MODIFIER}`, initialCapacity: 64 })
);
const sqliteBasics = getSQLiteBasicsOo1({
	journalMode: 'WAL',
	openDb: async (n) => new (await ready).OpfsSAHPoolDb('/' + n),
});
let active = false,
	stats = {};
const originalAll = sqliteBasics.all;
sqliteBasics.all = async (db, q) => {
	const start = performance.now(),
		rows = await originalAll(db, q);
	if (active) {
		stats.allMs += performance.now() - start;
		stats.calls++;
		stats.rows += rows.length;
	}
	return rows;
};
async function measure(fn) {
	if (active) return fn(); // count() invokes query(): retain the outer count's timer/counters.
	stats = { allMs: 0, calls: 0, rows: 0 };
	active = true;
	const start = performance.now();
	try {
		return await fn();
	} finally {
		stats.workerMs = performance.now() - start;
		active = false;
	}
}
// Only the operators the two production selectors use; not a general Mango translator.
function predicate(selector, params) {
	return (
		'(' +
		Object.entries(selector)
			.map(([field, value]) => {
				if (field === '$and' || field === '$or')
					return value.map((s) => predicate(s, params)).join(field === '$and' ? ' AND ' : ' OR ');
				const column = field === '_deleted' ? 'deleted' : `JSON_EXTRACT(data, '$.${field}')`;
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
const storage = getRxStorageSQLite({
	sqliteBasics,
	storeAttachmentsAsBase64String: true,
	...(MODIFIER
		? {
				queryModifier(q, prepared) {
					const params = [],
						where = predicate(prepared.mangoQuery.selector, params);
					return { ...q, query: q.query.replace('ORDER BY', `WHERE ${where} ORDER BY`), params };
				},
			}
		: {}),
});
const instances = new Map(),
	create = storage.createStorageInstance.bind(storage);
storage.createStorageInstance = async (p) => {
	const instance = await create(p);
	instances.set(p.collectionName, instance);
	for (const method of ['query', 'count']) {
		const original = instance[method].bind(instance);
		instance[method] = (...args) => measure(() => original(...args));
	}
	return instance;
};
// Must expose synchronously. Remote filters on method=create/custom or connectionId;
// our type-only messages have neither and cannot reach those subscriptions.
exposeWorkerRxStorage({ storage });
self.addEventListener('message', async ({ data: m }) => {
	if (m.type !== 'spike-2145') return;
	try {
		let result = stats;
		if (m.action !== 'stats') {
			const instance = instances.get(m.collection),
				db = await instance.internals.databasePromise;
			await instance.internals.indexCreationPromise;
			const params = [],
				where = predicate(m.query.selector, params);
			const sort = m.query.sort
				.map((s) =>
					Object.entries(s)
						.map(
							([k, v]) =>
								`${k === instance.primaryPath ? 'id' : `JSON_EXTRACT(data, '$.${k}')`} ${v}`
						)
						.join(',')
				)
				.join(',');
			const query =
				`SELECT ${m.count ? 'COUNT(1) AS count' : 'data'} FROM "${instance.tableName}" WHERE ${where}` +
				(m.count
					? ''
					: ` ORDER BY ${sort}${m.query.limit === undefined ? '' : ` LIMIT ${m.query.limit}`}`);
			const q = { query, params, context: { method: 'spike-direct', data: {} } };
			if (m.action === 'explain')
				result = {
					query,
					params,
					plan: await sqliteBasics.all(db, { ...q, query: 'EXPLAIN QUERY PLAN ' + query }),
				};
			else
				result = await measure(async () => {
					const rows = await sqliteBasics.all(db, q);
					return m.count
						? { count: rows[0].count }
						: { documents: rows.map((r) => JSON.parse(r.data)) };
				});
		}
		self.postMessage({ type: 'spike-2145-result', id: m.id, result });
	} catch (e) {
		self.postMessage({ type: 'spike-2145-result', id: m.id, error: String(e.stack || e) });
	}
});
