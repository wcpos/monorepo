import { type BulkWriteRow, normalizeMangoQuery, prepareQuery } from 'rxdb/plugins/core';

import { schemas } from './schemas';
import { fixtures, line, rng, stamp, uuid } from './fixtures';
import { openEngine } from './engines';
import { diskBytes, heap, signature, sorted } from './metrics';
import { lagSampler } from './lag-sampler';

import type { Cell, Doc, Instance, Job, Send } from './types';
const SMALL = 2000,
	LARGE = 20000; // Same scales as 2143/2210.
const SEED_BATCH = 1000,
	INGEST_BATCH = 100; // Original timing vs native ingest cell.
const QUERY_SAMPLES = 7,
	WRITE_SAMPLES = 25,
	SEED_SAMPLES = 3; // 2210, each after one discarded warmup.
type Sample = {
	run: () => Promise<unknown>;
	check?: (value: unknown) => unknown | Promise<unknown>;
};
function checkedValue(result: unknown): unknown {
	const r = result as { documents?: unknown; count?: number } | undefined;
	return r?.documents ?? r?.count ?? result;
}
async function write(instance: Instance, rows: BulkWriteRow<Doc>[]) {
	const result = await instance.bulkWrite(rows, 'spike2143');
	if (result.error.length) throw new Error(JSON.stringify(result.error));
	return result;
}
async function seed(instance: Instance, documents: Doc[]) {
	for (let i = 0; i < documents.length; i += SEED_BATCH)
		await write(
			instance,
			documents.slice(i, i + SEED_BATCH).map((document) => ({ document }))
		);
}
const prepared = (collection: string, selector = {}, extra = {}, count = false) =>
	prepareQuery(
		schemas[collection],
		normalizeMangoQuery(
			schemas[collection],
			{ selector: { ...selector, _deleted: false }, ...extra },
			count
		)
	);
export async function runBench(job: Job, send: Send) {
	const { row: engine, scale, db: databaseName, dir } = job;
	const session = await openEngine(engine, dir, databaseName);
	const create = (collection: string, suffix = '') =>
		session.create(collection, schemas[collection], suffix);
	try {
		const n = scale === 'small' ? SMALL : LARGE,
			data = fixtures(n) as unknown as { products: Doc[]; orders: Doc[] },
			cells: Cell[] = [];
		const instances: Record<string, Instance> = {};
		for (const name of ['products', 'orders', 'mutations']) instances[name] = await create(name);
		await session.proveWal();
		const seedLag = scale === 'large' && !job.simulator ? lagSampler() : undefined;
		for (const name of ['products', 'orders'] as const) await seed(instances[name], data[name]);
		const seedWindow = seedLag?.();
		const lag: Record<string, unknown> = {
			seed: seedWindow
				? { maxLagMs: seedWindow.maxLagMs, ticksOver50Ms: seedWindow.ticksOver50Ms }
				: 'simulator — not meaningful',
		};
		const gridWindows: ReturnType<ReturnType<typeof lagSampler>>[] = [];
		const heapAfterSeed = heap();
		await send({ type: 'memory', window: 'after-seed', heap: heapAfterSeed });
		// Same post-resync planner statistics as 2143, outside timed cells.
		await session.analyze(instances.products);
		const disk = scale === 'large' ? diskBytes(session.directory) : undefined;
		const seedBytes = Object.fromEntries(
			Object.entries(data).map(([k, docs]) => [
				k,
				docs.reduce((a, d) => a + JSON.stringify(d).length, 0) / n,
			])
		);
		// Is `docs` in the order RxDB's normalized `sort` promises? (No-sort queries normalize to an
		// index-led sort such as [_deleted, stockStatus, uuid], not to the primary key alone.)
		const get = (doc: unknown, path: string): string | number | undefined =>
			path.split('.').reduce<unknown>((v, k) => (v as Record<string, unknown>)?.[k], doc) as
				string | number | undefined;
		const inSortOrder = (docs: Doc[], sort: Record<string, string>[]) =>
			docs.every(
				(d, j) =>
					j === 0 ||
					sort.reduce((cmp, s) => {
						if (cmp !== 0) return cmp;
						const [field, dir] = Object.entries(s)[0],
							a = get(docs[j - 1], field),
							b = get(d, field);
						return (a! < b! ? -1 : a! > b! ? 1 : 0) * (dir === 'desc' ? -1 : 1);
					}, 0) <= 0
			);
		async function sample(
			name: string,
			count: number,
			setup: (i: number) => Promise<Sample> | Sample,
			sort: Record<string, string>[] | null = null
		) {
			// `signatures` hash the result AS RETURNED (order included, 2143's rule); `setSignatures` hash
			// the same rows sorted by primary key. Content must match across engines on the set; a
			// returned-order difference between engines is recorded on the cell as `orderMismatch`, and
			// `unsortedSamples` counts results that violate the query's own normalized sort (the incumbent
			// returns whole-set finds in an unstable order in Node — seen on Mac and Windows, 2026-09-23).
			const cell: Cell = {
				name,
				samples: [],
				signatures: [],
				setSignatures: [],
				unsortedSamples: 0,
			};
			for (let i = 0; i <= count; i++) {
				const { run, check = checkedValue } = await setup(i);
				const gridLag =
					name === 'products-grid-asShipped' && i > 0 && !job.simulator ? lagSampler() : undefined;
				const start = performance.now();
				const result = await run(),
					ms = performance.now() - start;
				if (gridLag) gridWindows.push(gridLag());
				const value = await check(result);
				cell.signatures.push(await signature(value));
				cell.setSignatures.push(
					await signature(
						Array.isArray(value) && value[0] && typeof value[0] === 'object'
							? sorted(value as Doc[])
							: value
					)
				);
				if (sort && Array.isArray(value) && !inSortOrder(value as Doc[], sort))
					cell.unsortedSamples++;
				if (i)
					cell.samples.push({
						ms,
						...(Array.isArray(checkedValue(result))
							? { rows: (checkedValue(result) as unknown[]).length }
							: {}),
					});
				// Keep every sample's returned ids in memory so a cross-engine content mismatch can be judged
				// offline: small (limited) results are written whole, large ones as a set difference.
				if (Array.isArray(value) && value[0] && typeof value[0] === 'object') {
					(cell.idSets ??= []).push(value.map((d) => d.uuid ?? d.id));
					// Per-document hashes too, so a same-ids-different-content mismatch names the document.
					(cell.docHashes ??= []).push(
						await Promise.all(
							(value as Doc[]).map(
								async (d) => [d.uuid ?? d.id, await signature(d)] as [string, string]
							)
						)
					);
				}
			}
			cells.push(cell);
			await send({ type: 'cell', name, unsortedSamples: cell.unsortedSamples });
		}
		const find = (name: string, collection: string, selector: object, extra: object = {}) => {
			const q = prepared(collection, selector, extra);
			return sample(
				name,
				QUERY_SAMPLES,
				() => ({ run: () => instances[collection].query(q) }),
				q.query.sort
			);
		};
		const grid = { $and: [{ 'payload.status': 'publish' }, { stockStatus: 'instock' }] };
		await find('products-grid-asShipped', 'products', grid);
		for (const limit of [10, 50])
			await find(`products-grid-pushed-${limit}`, 'products', grid, {
				sort: [{ 'payload.name': 'asc' }, { uuid: 'asc' }],
				limit,
			});
		await find('products-catalogue-blob', 'products', {});
		const projectionQuery = prepared('products');
		await sample('products-catalogue-projection', QUERY_SAMPLES, () => ({
			run: () => session.projection(instances.products, projectionQuery),
			check: (r) => sorted(r as Doc[]),
		}));
		const random = rng(2144),
			ids: string[] = [];
		while (ids.length < 100) {
			const id = uuid(1 + Math.floor(random() * n));
			if (!ids.includes(id)) ids.push(id);
		}
		for (const limit of [10, 50])
			await sample(`products-findByIds-${limit}`, QUERY_SAMPLES, () => ({
				run: () => instances.products.findDocumentsById(ids.slice(0, limit), false),
				check: (r) => sorted(r as Doc[]),
			}));
		const remote = { remoteId: { $in: ids.map((id) => String(Number(id))) } };
		await find('products-remoteId-in-find', 'products', remote, { sort: [{ uuid: 'asc' }] });
		await sample('products-remoteId-in-count', QUERY_SAMPLES, () => {
			const q = prepared('products', remote, {}, true);
			return { run: () => instances.products.count(q) };
		});
		await sample('seed-products', SEED_SAMPLES, async (i) => {
			const instance = await create('products', `-seed-${i}`);
			return {
				run: () => seed(instance, data.products),
				check: async () => {
					const docs = (await instance.query(prepared('products', {}, { sort: [{ uuid: 'asc' }] })))
						.documents;
					if ((await signature(docs)) !== (await signature(data.products)))
						throw new Error('Seed content mismatch');
					await instance.remove();
					return docs;
				},
			};
		});
		const scope = {
			$and: [
				{ 'payload.meta_data': { $elemMatch: { key: '_pos_user', value: '1' } } },
				{ 'payload.meta_data': { $elemMatch: { key: '_pos_store', value: '1' } } },
			],
		};
		for (const limit of [10, 50])
			await find(`orders-default-find-${limit}`, 'orders', scope, {
				sort: [{ dateCreatedGmt: 'desc' }],
				limit,
			});
		await sample('orders-default-count', QUERY_SAMPLES, () => {
			const q = prepared('orders', scope, {}, true);
			return { run: () => instances.orders.count(q) };
		});
		await find('orders-open-status', 'orders', {
			status: { $in: ['pos-open', 'pos-partial', 'pending'] },
		});
		const fiveLines = data.orders.filter((d) => d.payload.line_items.length === 5);
		for (const kind of ['order-line-add', 'order-create'])
			await sample(kind, WRITE_SAMPLES, async (i) => {
				const adding = kind === 'order-line-add',
					source = adding
						? fiveLines.splice(Math.floor(random() * fiveLines.length), 1)[0]
						: data.orders[0];
				const previous = adding
					? (await instances.orders.findDocumentsById([source.uuid], false))[0]
					: undefined;
				const document = structuredClone(previous ?? source);
				if (!adding)
					Object.assign(document, {
						uuid: `new-${uuid(i)}`,
						remoteId: n + i + 1,
						number: `new-${i}`,
						...stamp(n + i),
					});
				document.payload.line_items = adding
					? [...document.payload.line_items, line(n + i)]
					: [line(n + i)];
				(
					document.payload as typeof document.payload & { date_modified_gmt?: string }
				).date_modified_gmt = new Date(1800000000000 + i * 1000).toISOString();
				document._rev = adding ? '2-line' : '1-created';
				document._meta.lwt += 100000;
				const dirty = {
					...document,
					local: { ...document.local, dirty: true },
					_rev: '3-dirty',
					_meta: { lwt: document._meta.lwt + 1 },
				};
				const mutation = {
					id: `${kind}-${i}`,
					collection: 'orders',
					operation: adding ? 'update' : 'create',
					createdAt: i,
					payload: { uuid: document.uuid },
					...stamp(n + i),
				};
				return {
					run: async () => {
						await write(instances.orders, [{ ...(previous ? { previous } : {}), document }]);
						await write(instances.mutations, [{ document: mutation as unknown as Doc }]);
						if (adding) await write(instances.orders, [{ previous: document, document: dirty }]);
					},
					check: async () => {
						const docs = [
							...(await instances.orders.findDocumentsById([document.uuid], false)),
							...(await instances.mutations.findDocumentsById([mutation.id], false)),
						];
						if (
							(await signature(docs)) !== (await signature([adding ? dirty : document, mutation]))
						)
							throw new Error(`${kind} content mismatch`);
						return docs;
					},
				};
			});
		const heapAfterLast = heap();
		await send({ type: 'memory', window: 'after-last', heap: heapAfterLast });
		lag.grid = gridWindows.length
			? {
					maxLagMs: Math.max(...gridWindows.map((w) => w.maxLagMs)),
					ticksOver50Ms: gridWindows.reduce((sum, w) => sum + w.ticksOver50Ms, 0),
				}
			: 'simulator — not meaningful';
		const ingest: number[] = [];
		if (scale === 'large') {
			// 2210 seeds in 1000s. This is a separate fresh seed in exact 100-document batches.
			const target = await create('products', '-ingest');
			for (let offset = 0; offset < data.products.length; offset += INGEST_BATCH) {
				const rows = data.products
					.slice(offset, offset + INGEST_BATCH)
					.map((document) => ({ document }));
				const start = performance.now();
				await write(target, rows);
				ingest.push(performance.now() - start);
			}
			await target.remove();
		}
		return { cells, seedBytes, disk, ...session.proofs, lag, heapAfterSeed, heapAfterLast, ingest };
	} finally {
		await session.close();
	}
}

export async function coldRead(job: Job) {
	const start = performance.now(),
		session = await openEngine(job.row, job.dir, job.db);
	try {
		const instance = await session.create('products', schemas.products);
		const docs = await instance.findDocumentsById([uuid(1)], false),
			ms = performance.now() - start;
		await session.proveWal();
		if ((await signature(docs)) !== (await signature(fixtures(1).products)))
			throw new Error('Cold read content mismatch');
		return { ms, ...session.proofs };
	} finally {
		await session.close();
	}
}
