import { getRxStorageWorker } from 'rxdb-premium/plugins/storage-worker';
import {
	fillWithDefaultSettings,
	normalizeMangoQuery,
	prepareQuery,
	randomToken,
} from 'rxdb/plugins/core';

// The second term carries punctuation on purpose: buildScanSearchSelector regex-escapes it
// (`co\-balt`), so the modifier's unescaping is exercised by the cross-mode equality check.
const terms = ['quartz', 'co-balt'];
const open = ['pos-open', 'pos-partial', 'pending'];
const fields = ['context.fold', 'message', 'context.error', 'context.errorCode', 'context.search'];
// Same escape as packages/sync-core/src/scanSearchSelector.ts.
const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\-]/g, '\\$&');
const search = (n) => ({
	$and: terms.slice(0, n).map((t) => ({
		$or: fields.map((f, i) => ({
			[f]: { $regex: escapeRegex(t), ...(i ? { $options: 'i' } : {}) },
		})),
	})),
});
// The Orders screen always scopes by cashier AND store (orders/index.tsx: the store scope falls
// back to 'woocommerce-pos'), and compileQuery's `metadata` operator emits one $elemMatch per stamp
// through wooMetaCarrier.identityFilter, which joins them with $and.
const ordersDefault = {
	$and: [
		{ 'payload.meta_data': { $elemMatch: { key: '_pos_user', value: '1' } } },
		{ 'payload.meta_data': { $elemMatch: { key: '_pos_store', value: '1' } } },
	],
};
// Grid windows: the Logs grid starts at 20 rows and the Orders grid at 10 (LOGS_PAGE_SIZE,
// ORDERS_PAGE_SIZE); every scroll extension adds a page, so limits grow past premium's 50-row
// fallback batch. count() is the engine's `count({ selector })`, which RxDB normalizes to
// primary-key order (rx-query.ts: `normalizeMangoQuery(schema, query, op === 'count')`).
const cases = [
	...[20, 60, 100].map((limit) => ({
		name: 'logs-1',
		collection: 'logs',
		limit,
		selector: search(1),
	})),
	{ name: 'logs-1', collection: 'logs', selector: search(1) },
	{ name: 'logs-2', collection: 'logs', limit: 20, selector: search(2) },
	{ name: 'logs-2', collection: 'logs', selector: search(2) },
	...[10, 50, 100].map((limit) => ({
		name: 'orders',
		collection: 'orders',
		limit,
		selector: ordersDefault,
	})),
	{ name: 'orders', collection: 'orders', selector: ordersDefault },
].map((c) => ({ ...c, op: c.limit ? `find${c.limit}` : 'count' }));
const totals = { 'logs-1': 920, 'logs-2': 460, orders: 2500 };
const schemaFor = (collection) => {
	const logs = collection === 'logs',
		primaryKey = logs ? 'id' : 'uuid',
		date = logs ? 'timestamp' : 'dateCreatedGmt';
	return fillWithDefaultSettings({
		version: 0,
		primaryKey,
		type: 'object',
		required: [primaryKey, date],
		properties: {
			[primaryKey]: { type: 'string', maxLength: 64 },
			[date]: { type: 'string', maxLength: 32 },
			...(logs
				? { level: { type: 'string' }, message: { type: 'string' }, context: { type: 'object' } }
				: {
						remoteId: { type: 'number' },
						status: { type: 'string', maxLength: 32 },
						payload: { type: 'object' },
						sync: { type: 'object' },
						local: { type: 'object' },
					}),
		},
		indexes: logs ? [[date]] : [[date], ['status', date]],
	});
};
function document(collection, i) {
	const id = String(i).padStart(8, '0'),
		date = new Date(1700000000000 + i * 1000).toISOString();
	const words = Array.from(
		{ length: 10 },
		(_, j) =>
			['amber', 'birch', 'cedar', 'delta', 'elm', 'fern', 'grove'][
				(Math.imul(i + 1, 1664525 + j * 2) >>> 0) % 7
			]
	).join(' ');
	// logs: 'quartz' in 1 row of 50, 'co-balt' with it in 1 of 100.
	// orders: four cashiers, two stores; cashier 1 + store 1 is 1 row in 8.
	const row =
		collection === 'logs'
			? {
					id,
					timestamp: date,
					level: 'warn',
					message: words,
					context: {
						fold: i % 50 ? words : `quartz ${i % 100 ? words : 'co-balt'}`,
						error: '',
						errorCode: 'SYNC331',
						search: words,
						padding: '',
					},
				}
			: {
					uuid: id,
					remoteId: i,
					dateCreatedGmt: date,
					status: [...open, 'completed', 'cancelled'][Math.floor(i / 4) % 5],
					sync: {},
					local: {},
					payload: {
						meta_data: [
							{ id: 1, key: '_pos_user', value: String((i % 4) + 1) },
							{ id: 2, key: '_pos_store', value: String((Math.floor(i / 4) % 2) + 1) },
							...Array.from({ length: 4 + (i % 5) }, (_, j) => ({
								id: j + 3,
								key: `extra_${j}`,
								value: words,
							})),
						],
					},
				};
	Object.assign(row, {
		_deleted: false,
		_attachments: {},
		_rev: '1-seed',
		_meta: { lwt: 1700000000000 + i },
	});
	if (collection === 'logs')
		row.context.padding = 'x'.repeat(Math.max(0, 500 - JSON.stringify(row).length));
	return row;
}
globalThis.runBench = async () => {
	const cells = [],
		plans = {},
		expected = new Map(),
		seedBytes = {},
		schemas = {};
	for (const mode of ['fallback', 'modifier']) {
		const worker = new Worker(`/files/spike-2145/worker-${mode}.js`, { type: 'module' });
		const pending = new Map();
		let sequence = 0;
		worker.addEventListener('message', ({ data: m }) => {
			if (m.type !== 'spike-2145-result') return;
			const p = pending.get(m.id);
			pending.delete(m.id);
			if (m.error) p.reject(new Error(m.error));
			else p.resolve(m.result);
		});
		const rpc = (action, extra = {}) =>
			new Promise((resolve, reject) => {
				const id = ++sequence;
				pending.set(id, { resolve, reject });
				worker.postMessage({ type: 'spike-2145', id, action, ...extra });
			});
		// Premium keys its global mode:one cache by String(workerInput), not function identity.
		const workerInput =
			mode === 'fallback'
				? function fallbackWorker() {
						return worker;
					}
				: function modifierWorker() {
						return worker;
					};
		const storage = getRxStorageWorker({ workerInput, mode: 'one' }),
			instances = {};
		try {
			for (const collection of ['logs', 'orders']) {
				const schema = schemaFor(collection);
				schemas[collection] = schema;
				const instance = (instances[collection] = await storage.createStorageInstance({
					databaseInstanceToken: randomToken(10),
					databaseName: `spike2145-${mode}-${randomToken(12)}`,
					collectionName: collection,
					schema,
					options: {},
					multiInstance: false,
					devMode: true,
				}));
				let bytes = 0;
				const count = collection === 'logs' ? 46000 : 20000;
				for (let start = 0; start < count; start += 1000) {
					const batch = Array.from({ length: 1000 }, (_, j) => ({
						document: document(collection, start + j),
					}));
					bytes += batch.reduce((sum, r) => sum + JSON.stringify(r.document).length, 0);
					const written = await instance.bulkWrite(batch, 'spike2145');
					if (written.error.length) throw new Error(JSON.stringify(written.error));
				}
				seedBytes[collection] = bytes / count;
			}
			for (const c of cases) {
				const instance = instances[c.collection],
					date = c.collection === 'logs' ? 'timestamp' : 'dateCreatedGmt';
				const selector = { ...c.selector, _deleted: { $eq: false } };
				// A count is normalized the way RxQuery does it (skipSort → primary-key order); a
				// find carries the grid's sort and its cumulative limit.
				const query =
					c.op === 'count'
						? normalizeMangoQuery(instance.schema, { selector }, true)
						: normalizeMangoQuery(instance.schema, {
								selector,
								sort: [{ [date]: 'desc' }],
								limit: c.limit,
							});
				const prepared = prepareQuery(instance.schema, query),
					extra = { collection: c.collection, query, count: c.op === 'count' },
					key = `${c.name}/${c.op}`;
				if (mode === 'fallback') {
					plans[key] = await rpc('explain', extra);
					console.info('EXPLAIN', key, JSON.stringify(plans[key]));
				}
				for (const path of mode === 'fallback' ? ['fallback', 'direct'] : ['modifier']) {
					// A fallback count pages the whole table: three samples there, five elsewhere.
					const samples = [],
						wanted = path === 'fallback' && c.op === 'count' ? 3 : 5;
					for (let run = -1; run < wanted; run++) {
						const start = performance.now();
						const result =
							path === 'direct'
								? await rpc('direct', extra)
								: await instance[c.op === 'count' ? 'count' : 'query'](prepared);
						const pageMs = performance.now() - start,
							metrics = await rpc('stats');
						const signature = JSON.stringify(
							result.documents ? result.documents.map((d) => d.id ?? d.uuid) : result.count
						);
						if (!expected.has(key)) expected.set(key, signature);
						if (expected.get(key) !== signature)
							throw new Error(`Different result: ${path}/${key}`);
						const matches = result.documents?.length ?? result.count;
						if (matches !== (c.limit ?? totals[c.name]))
							throw new Error(`Wrong cardinality: ${key}: ${matches}`);
						if (run >= 0) samples.push({ ...metrics, pageMs, matches });
					}
					cells.push({ query: c.name, operation: c.op, mode: path, samples });
					console.info('CELL', JSON.stringify(cells.at(-1)));
				}
			}
		} finally {
			try {
				for (const instance of Object.values(instances)) await instance.close();
			} finally {
				worker.terminate();
			}
		}
	}
	return { cells, plans, schemas, seedBytes, rows: { logs: 46000, orders: 20000 }, terms, totals };
};
