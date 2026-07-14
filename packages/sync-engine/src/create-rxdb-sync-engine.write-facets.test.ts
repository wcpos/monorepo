import { describe, expect, it } from 'vitest';
import { setPremiumFlag } from 'rxdb-premium/plugins/shared';

import { createFakeWriteServer } from '@wcpos/sync-core/testing';
import type { StoreScopeIdentity } from '@wcpos/sync-core';

import { buildReplicationHandlers } from './change-signal/change-signal-handlers';
import { createRxdbSyncEngine, type RxdbSyncEngine } from './create-rxdb-sync-engine';
import { memoryEngineStorage } from './testing';

setPremiumFlag();

type FacetName = 'products' | 'variations' | 'customers' | 'coupons';
type FacetSpec = {
	collection: FacetName;
	remoteIdField: 'wooProductId' | 'wooId' | 'wooCustomerId';
	remoteId: number;
	pullPath: string;
	parentId?: number;
};

const FACETS: readonly FacetSpec[] = [
	{
		collection: 'products',
		remoteIdField: 'wooProductId',
		remoteId: 501,
		pullPath: '/products',
	},
	{
		collection: 'variations',
		remoteIdField: 'wooId',
		remoteId: 502,
		pullPath: '/variations',
		parentId: 50,
	},
	{
		collection: 'customers',
		remoteIdField: 'wooCustomerId',
		remoteId: 503,
		pullPath: '/customers',
	},
	{ collection: 'coupons', remoteIdField: 'wooId', remoteId: 504, pullPath: '/coupons' },
];

const SITE = 'https://facets.example.test';
const UUID_A = '40000000-0000-4000-8000-000000000001';
const UUID_B = '40000000-0000-4000-8000-000000000002';
let scopeSequence = 0;

function identity(): StoreScopeIdentity {
	scopeSequence += 1;
	return { site: SITE, storeId: 7, cashierId: `facet-${scopeSequence}` };
}

function uuidMeta(id: string) {
	return [{ key: '_woocommerce_pos_uuid', value: id }];
}

function payload(spec: FacetSpec, id: string, label: string, remoteId?: number) {
	const common = {
		...(remoteId === undefined ? {} : { id: remoteId }),
		meta_data: uuidMeta(id),
	};
	switch (spec.collection) {
		case 'products':
			return {
				...common,
				name: label,
				type: 'simple',
				price: '12.50',
				stock_status: 'instock',
				stock_quantity: null,
			};
		case 'variations':
			return {
				...common,
				sku: label,
				parent_id: spec.parentId,
				price: '4.20',
				stock_status: 'instock',
				stock_quantity: null,
				attributes: [],
			};
		case 'customers':
			return { ...common, first_name: label, email: `${label}@example.test` };
		case 'coupons':
			return { ...common, code: label, amount: '10.00' };
	}
}

function storedDocument(input: {
	spec: FacetSpec;
	id: string;
	label: string;
	remoteId?: number;
	revision?: string;
}) {
	const { spec, id, label } = input;
	const remoteId = input.remoteId ?? null;
	const common = {
		id,
		[spec.remoteIdField]: remoteId,
		payload: payload(spec, id, label, input.remoteId),
		sync: {
			revision: input.revision ?? '',
			partial: false,
			source: input.remoteId === undefined ? 'local' : 'woo-rest',
		},
		local: { dirty: false, pendingMutationIds: [] },
	};
	if (spec.collection === 'products') {
		return {
			...common,
			price: 12.5,
			stockStatus: 'instock',
			type: 'simple',
			categoryIds: [],
			brandIds: [],
			onSale: false,
			featured: false,
			stockQuantity: null,
		};
	}
	if (spec.collection === 'variations') {
		return {
			...common,
			parentId: spec.parentId ?? null,
			price: 4.2,
			stockStatus: 'instock',
			attributes: [],
			stockQuantity: null,
		};
	}
	return common;
}

function pullResponse(spec: FacetSpec, document: Record<string, unknown> | null): Response {
	if (spec.collection === 'variations') {
		const body = document
			? {
					documents: [
						{
							id: document.id,
							parent_id: document.parent_id,
							payload: document,
						},
					],
				}
			: { documents: [] };
		return Response.json(body);
	}
	return Response.json(document ? [document] : []);
}

function routedServer(spec: FacetSpec, truth: () => Record<string, unknown> | null) {
	const server = createFakeWriteServer({ firstId: spec.remoteId });
	const pulls: number[][] = [];
	const state = { failPull: false };
	const fetch = async (url: string, init?: RequestInit): Promise<Response> => {
		if (url.includes('/push/')) return server.fetch(url, init);
		const parsed = new URL(url);
		if (!parsed.pathname.endsWith(spec.pullPath)) {
			throw new Error(`unexpected facet pull: ${parsed.pathname}`);
		}
		pulls.push(
			(parsed.searchParams.get('include') ?? '').split(',').map(Number).filter(Number.isSafeInteger)
		);
		if (state.failPull) return new Response('unavailable', { status: 503 });
		return pullResponse(spec, truth());
	};
	return { server, pulls, state, fetch };
}

function engine(fetch: (url: string, init?: RequestInit) => Promise<Response>): RxdbSyncEngine {
	return createRxdbSyncEngine(
		{
			site: {
				syncBaseUrl: `${SITE}/wp-json/wc-rxdb-sync/v1`,
				wpJsonRoot: `${SITE}/wp-json`,
			},
			storage: memoryEngineStorage(),
			fetcher: fetch,
			mode: 'manual',
		},
		identity()
	);
}

async function insert(engine: RxdbSyncEngine, spec: FacetSpec, document: unknown): Promise<void> {
	const scope = engine.active();
	if (!scope) throw new Error('no active scope');
	await (
		scope.database.collections[spec.collection] as { insert(row: unknown): Promise<unknown> }
	).insert(document);
}

async function record(
	engine: RxdbSyncEngine,
	spec: FacetSpec,
	id: string
): Promise<Record<string, unknown> | null> {
	const scope = engine.active();
	if (!scope) throw new Error('no active scope');
	const doc = await (
		scope.database.collections[spec.collection] as {
			findOne(key: string): { exec(): Promise<{ toJSON(): Record<string, unknown> } | null> };
		}
	)
		.findOne(id)
		.exec();
	return doc?.toJSON() ?? null;
}

async function remove(engine: RxdbSyncEngine, spec: FacetSpec, id: string): Promise<void> {
	const scope = engine.active();
	if (!scope) throw new Error('no active scope');
	const doc = await scope.database.collections[spec.collection].findOne(id).exec();
	await doc?.remove();
}

async function replaceResident(
	engine: RxdbSyncEngine,
	spec: FacetSpec,
	id: string,
	document: Record<string, unknown>
): Promise<void> {
	const scope = engine.active();
	if (!scope) throw new Error('no active scope');
	const doc = await scope.database.collections[spec.collection].findOne(id).exec();
	if (!doc) throw new Error(`no resident ${spec.collection}/${id}`);
	await doc.incrementalModify((data: Record<string, unknown>) => ({
		...data,
		...document,
		local: data.local,
	}));
}

async function applyFacetPull(
	engine: RxdbSyncEngine,
	spec: FacetSpec,
	fetch: (url: string, init?: RequestInit) => Promise<Response>
): Promise<void> {
	const scope = engine.active();
	if (!scope) throw new Error('no active scope');
	const handlers = buildReplicationHandlers({
		database: scope.database,
		fetch: fetch as never,
		syncBaseUrl: `${SITE}/wp-json/wc-rxdb-sync/v1`,
		persistState: async () => undefined,
		log: () => undefined,
	});
	switch (spec.collection) {
		case 'products':
			await handlers.pullProducts([spec.remoteId]);
			return;
		case 'variations':
			await handlers.pullVariations([spec.remoteId]);
			return;
		case 'customers':
			await handlers.pullCustomers([spec.remoteId]);
			return;
		case 'coupons':
			await handlers.refreshReferenceCollection('coupons');
	}
}

async function applyFacetPrune(engine: RxdbSyncEngine, spec: FacetSpec): Promise<void> {
	const scope = engine.active();
	if (!scope) throw new Error('no active scope');
	const handlers = buildReplicationHandlers({
		database: scope.database,
		fetch: async () => Response.json([]),
		syncBaseUrl: `${SITE}/wp-json/wc-rxdb-sync/v1`,
		persistState: async () => undefined,
		log: () => undefined,
	});
	switch (spec.collection) {
		case 'products':
			await handlers.deleteProducts([spec.remoteId]);
			return;
		case 'variations':
			await handlers.deleteVariations([spec.remoteId]);
			return;
		case 'customers':
			await handlers.deleteCustomers([spec.remoteId]);
			return;
		case 'coupons':
			await handlers.refreshReferenceCollection('coupons');
	}
}

describe('write facets beyond orders', () => {
	it('keeps non-faceted collections non-writeable and names the explicit writeable set', async () => {
		const spec = FACETS[0];
		const route = routedServer(spec, () => null);
		const subject = engine(route.fetch);
		await subject.ready;
		await expect(
			subject.write({ collection: 'tags', operation: 'create', recordId: UUID_A, payload: {} })
		).rejects.toThrow('writeable collections: orders, products, variations, customers, coupons');
		await subject.dispose();
	});

	it.each(FACETS)(
		'$collection create/update/delete round trip reconciles id, revision, and bookkeeping',
		async (spec) => {
			const route = routedServer(spec, () => null);
			const subject = engine(route.fetch);
			await subject.ready;
			await insert(subject, spec, storedDocument({ spec, id: UUID_A, label: 'created' }));

			const created = await subject.write({
				collection: spec.collection,
				operation: 'create',
				recordId: UUID_A,
				payload: payload(spec, UUID_A, 'created'),
			});
			expect(await record(subject, spec, UUID_A)).toMatchObject({
				local: { dirty: true, pendingMutationIds: [created.mutationId] },
			});
			expect(await subject.sync('write-drain')).toMatchObject({ pushed: 1, rejected: 0 });
			const afterCreate = await record(subject, spec, UUID_A);
			expect(afterCreate).toMatchObject({
				[spec.remoteIdField]: spec.remoteId,
				local: { dirty: false, pendingMutationIds: [] },
			});
			const createRevision = (afterCreate?.sync as { revision: string }).revision;
			expect(createRevision).not.toBe('');

			await subject.write({
				collection: spec.collection,
				operation: 'update',
				recordId: UUID_A,
				payload: payload(spec, UUID_A, 'updated', spec.remoteId),
			});
			expect(await subject.sync('write-drain')).toMatchObject({ pushed: 1 });
			expect((await record(subject, spec, UUID_A))?.sync).not.toMatchObject({
				revision: createRevision,
			});

			await subject.write({ collection: spec.collection, operation: 'delete', recordId: UUID_A });
			expect(await subject.sync('write-drain')).toMatchObject({ pushed: 1 });
			expect(await record(subject, spec, UUID_A)).toBeNull();
			await subject.dispose();
		}
	);

	it.each(FACETS)(
		'$collection rematerializes a missing ack target through its pull-side mapper',
		async (spec) => {
			const route = routedServer(spec, () => null);
			const subject = engine(route.fetch);
			await subject.ready;
			await insert(subject, spec, storedDocument({ spec, id: UUID_A, label: 'rematerialized' }));
			await subject.write({
				collection: spec.collection,
				operation: 'create',
				recordId: UUID_A,
				payload: payload(spec, UUID_A, 'rematerialized'),
			});
			await remove(subject, spec, UUID_A);

			expect(await subject.sync('write-drain')).toMatchObject({ pushed: 1 });
			expect(await record(subject, spec, UUID_A)).toMatchObject({
				id: UUID_A,
				[spec.remoteIdField]: spec.remoteId,
				local: { dirty: false, pendingMutationIds: [] },
			});
			await subject.dispose();
		}
	);

	it.each(FACETS)(
		'$collection keeps an optimistic write resident when pull and delete/prune land before drain',
		async (spec) => {
			const serverTruth = {
				...payload(spec, UUID_A, 'server-stale', spec.remoteId),
				_rxdb_revision: 'sha256:server-stale',
			};
			const route = routedServer(spec, () => serverTruth);
			const subject = engine(route.fetch);
			await subject.ready;
			await insert(
				subject,
				spec,
				storedDocument({
					spec,
					id: UUID_A,
					label: 'optimistic',
					remoteId: spec.remoteId,
					revision: 'sha256:local-base',
				})
			);
			const receipt = await subject.write({
				collection: spec.collection,
				operation: 'update',
				recordId: UUID_A,
				payload: payload(spec, UUID_A, 'optimistic', spec.remoteId),
			});

			await applyFacetPull(subject, spec, route.fetch);
			const afterPull = await record(subject, spec, UUID_A);
			expect(afterPull?.payload).toMatchObject(
				spec.collection === 'customers'
					? { first_name: 'optimistic' }
					: spec.collection === 'coupons'
						? { code: 'optimistic' }
						: spec.collection === 'variations'
							? { sku: 'optimistic' }
							: { name: 'optimistic' }
			);
			expect(afterPull?.local).toEqual({
				dirty: true,
				pendingMutationIds: [receipt.mutationId],
			});

			await applyFacetPrune(subject, spec);
			expect(await record(subject, spec, UUID_A)).toMatchObject({
				local: { dirty: true, pendingMutationIds: [receipt.mutationId] },
			});
			await subject.dispose();
		}
	);

	it.each(FACETS)('$collection stale 409 retries against the server revision', async (spec) => {
		const route = routedServer(spec, () => null);
		route.server.seed(UUID_A, {
			id: spec.remoteId,
			revision: 'sha256:server-base',
			collection: spec.collection,
			payload: payload(spec, UUID_A, 'server', spec.remoteId),
		});
		const subject = engine(route.fetch);
		await subject.ready;
		await insert(
			subject,
			spec,
			storedDocument({
				spec,
				id: UUID_A,
				label: 'local',
				remoteId: spec.remoteId,
				revision: 'sha256:stale',
			})
		);
		const receipt = await subject.write({
			collection: spec.collection,
			operation: 'update',
			recordId: UUID_A,
			payload: payload(spec, UUID_A, 'retry', spec.remoteId),
		});
		expect(await subject.sync('write-drain')).toMatchObject({ conflicts: 1, pushed: 0 });
		await subject.resolveConflict(receipt.mutationId, 'retry-with-server-base');
		expect(await subject.sync('write-drain')).toMatchObject({ pushed: 1 });
		expect(await subject.conflicts()).toEqual([]);
		await subject.dispose();
	});

	it.each(FACETS)(
		'$collection discard restores server truth before removing the durable conflict',
		async (spec) => {
			const truth = {
				...payload(spec, UUID_A, 'server-truth', spec.remoteId),
				_rxdb_revision: 'sha256:server-base',
			};
			const route = routedServer(spec, () => truth);
			route.server.seed(UUID_A, {
				id: spec.remoteId,
				revision: 'sha256:server-base',
				collection: spec.collection,
				payload: truth,
			});
			const subject = engine(route.fetch);
			await subject.ready;
			await insert(
				subject,
				spec,
				storedDocument({
					spec,
					id: UUID_A,
					label: 'local-stale',
					remoteId: spec.remoteId,
					revision: 'sha256:stale',
				})
			);
			const receipt = await subject.write({
				collection: spec.collection,
				operation: 'update',
				recordId: UUID_A,
				payload: payload(spec, UUID_A, 'discard-me', spec.remoteId),
			});
			await subject.sync('write-drain');
			await subject.resolveConflict(receipt.mutationId, 'discard');

			expect(route.pulls).toEqual([[spec.remoteId]]);
			expect(await subject.conflicts()).toEqual([]);
			const restored = await record(subject, spec, UUID_A);
			expect(restored?.payload).toMatchObject(
				spec.collection === 'customers'
					? { first_name: 'server-truth' }
					: spec.collection === 'coupons'
						? { code: 'server-truth' }
						: spec.collection === 'variations'
							? { sku: 'server-truth' }
							: { name: 'server-truth' }
			);
			expect(restored?.local).toEqual({ dirty: false, pendingMutationIds: [] });
			await subject.dispose();
		}
	);

	it.each(FACETS)(
		'$collection failed discard pull leaves the terminal mutation durable and re-runnable',
		async (spec) => {
			const truth = {
				...payload(spec, UUID_A, 'server-truth', spec.remoteId),
				_rxdb_revision: 'sha256:server-base',
			};
			const route = routedServer(spec, () => truth);
			route.server.seed(UUID_A, {
				id: spec.remoteId,
				revision: 'sha256:server-base',
				collection: spec.collection,
				payload: truth,
			});
			const subject = engine(route.fetch);
			await subject.ready;
			await insert(
				subject,
				spec,
				storedDocument({
					spec,
					id: UUID_A,
					label: 'local-stale',
					remoteId: spec.remoteId,
					revision: 'sha256:stale',
				})
			);
			const receipt = await subject.write({
				collection: spec.collection,
				operation: 'update',
				recordId: UUID_A,
				payload: payload(spec, UUID_A, 'discard-me', spec.remoteId),
			});
			await subject.sync('write-drain');

			route.state.failPull = true;
			await expect(subject.resolveConflict(receipt.mutationId, 'discard')).rejects.toThrow(
				/revision refresh failed/i
			);
			expect((await subject.conflicts())[0]).toMatchObject({
				mutationId: receipt.mutationId,
				status: 'conflicted',
			});

			route.state.failPull = false;
			await subject.resolveConflict(receipt.mutationId, 'discard');
			expect(await subject.conflicts()).toEqual([]);
			await subject.dispose();
		}
	);

	it.each(FACETS)(
		'$collection discard preserves a queued successor and its optimistic payload',
		async (spec) => {
			const truth = {
				...payload(spec, UUID_A, 'server-truth', spec.remoteId),
				_rxdb_revision: 'sha256:server-base',
			};
			const route = routedServer(spec, () => truth);
			route.server.seed(UUID_A, {
				id: spec.remoteId,
				revision: 'sha256:server-base',
				collection: spec.collection,
				payload: truth,
			});
			const subject = engine(route.fetch);
			await subject.ready;
			await insert(
				subject,
				spec,
				storedDocument({
					spec,
					id: UUID_A,
					label: 'local-a',
					remoteId: spec.remoteId,
					revision: 'sha256:stale',
				})
			);
			const conflicted = await subject.write({
				collection: spec.collection,
				operation: 'update',
				recordId: UUID_A,
				payload: payload(spec, UUID_A, 'local-a', spec.remoteId),
			});
			await subject.sync('write-drain');
			await replaceResident(
				subject,
				spec,
				UUID_A,
				storedDocument({
					spec,
					id: UUID_A,
					label: 'local-b',
					remoteId: spec.remoteId,
					revision: 'sha256:stale',
				})
			);
			const successor = await subject.write({
				collection: spec.collection,
				operation: 'update',
				recordId: UUID_A,
				payload: payload(spec, UUID_A, 'local-b', spec.remoteId),
			});

			await subject.resolveConflict(conflicted.mutationId, 'discard');
			const afterDiscard = await record(subject, spec, UUID_A);
			expect(afterDiscard?.payload).toMatchObject(
				spec.collection === 'customers'
					? { first_name: 'local-b' }
					: spec.collection === 'coupons'
						? { code: 'local-b' }
						: spec.collection === 'variations'
							? { sku: 'local-b' }
							: { name: 'local-b' }
			);
			expect(afterDiscard).toMatchObject({
				sync: { revision: 'sha256:server-base' },
				local: { dirty: true, pendingMutationIds: [successor.mutationId] },
			});
			expect(await subject.sync('write-drain')).toMatchObject({ pushed: 1 });
			expect(await subject.conflicts()).toEqual([]);
			expect(await record(subject, spec, UUID_A)).toMatchObject({
				local: { dirty: false, pendingMutationIds: [] },
			});
			await subject.dispose();
		}
	);

	it('discard tombstones a resident update when the server no longer returns it', async () => {
		const spec = FACETS[0];
		let truth: Record<string, unknown> | null = {
			...payload(spec, UUID_A, 'server-truth', spec.remoteId),
			_rxdb_revision: 'sha256:server-base',
		};
		const route = routedServer(spec, () => truth);
		route.server.seed(UUID_A, {
			id: spec.remoteId,
			revision: 'sha256:server-base',
			collection: spec.collection,
			payload: truth,
		});
		const subject = engine(route.fetch);
		await subject.ready;
		await insert(
			subject,
			spec,
			storedDocument({
				spec,
				id: UUID_A,
				label: 'local',
				remoteId: spec.remoteId,
				revision: 'sha256:stale',
			})
		);
		const receipt = await subject.write({
			collection: spec.collection,
			operation: 'update',
			recordId: UUID_A,
			payload: payload(spec, UUID_A, 'local', spec.remoteId),
		});
		await subject.sync('write-drain');
		truth = null;

		await subject.resolveConflict(receipt.mutationId, 'discard');
		expect(await record(subject, spec, UUID_A)).toBeNull();
		expect(await subject.conflicts()).toEqual([]);
		await subject.dispose();
	});

	it('discard removes a rejected born-local create that never existed remotely', async () => {
		const spec = FACETS.find(({ collection }) => collection === 'customers')!;
		const route = routedServer(spec, () => null);
		route.server.script(() => ({ kind: 'identity_ambiguous' }));
		const subject = engine(route.fetch);
		await subject.ready;
		await insert(subject, spec, storedDocument({ spec, id: UUID_A, label: 'born-local' }));
		const receipt = await subject.write({
			collection: spec.collection,
			operation: 'create',
			recordId: UUID_A,
			payload: payload(spec, UUID_A, 'born-local'),
		});
		expect(await subject.sync('write-drain')).toMatchObject({ rejected: 1 });

		await subject.resolveConflict(receipt.mutationId, 'discard');
		expect(await record(subject, spec, UUID_A)).toBeNull();
		expect(await subject.conflicts()).toEqual([]);
		await subject.dispose();
	});

	it.each(FACETS)(
		'$collection 428 refreshes once and retries against the targeted server revision',
		async (spec) => {
			const truth = {
				...payload(spec, UUID_A, 'refreshed', spec.remoteId),
				_rxdb_revision: 'sha256:fresh',
			};
			const route = routedServer(spec, () => truth);
			route.server.seed(UUID_A, {
				id: spec.remoteId,
				revision: 'sha256:fresh',
				collection: spec.collection,
				payload: truth,
			});
			let attempts = 0;
			route.server.script(() => {
				attempts += 1;
				return attempts === 1 ? { kind: 'precondition_required' } : undefined;
			});
			const subject = engine(route.fetch);
			await subject.ready;
			await insert(
				subject,
				spec,
				storedDocument({
					spec,
					id: UUID_A,
					label: 'local',
					remoteId: spec.remoteId,
					revision: 'sha256:old',
				})
			);
			await subject.write({
				collection: spec.collection,
				operation: 'update',
				recordId: UUID_A,
				payload: payload(spec, UUID_A, 'updated', spec.remoteId),
			});

			expect(await subject.sync('write-drain')).toMatchObject({ pushed: 1, rejected: 0 });
			expect(route.pulls).toEqual([[spec.remoteId]]);
			expect(route.server.received).toHaveLength(2);
			await subject.dispose();
		}
	);

	it.each(FACETS)(
		'$collection permanent 4xx dead-letters and clears local bookkeeping',
		async (spec) => {
			const route = routedServer(spec, () => null);
			const subject = engine(route.fetch);
			await subject.ready;
			await insert(
				subject,
				spec,
				storedDocument({
					spec,
					id: UUID_A,
					label: 'orphan',
					remoteId: spec.remoteId,
					revision: 'sha256:missing',
				})
			);
			await subject.write({
				collection: spec.collection,
				operation: 'update',
				recordId: UUID_A,
				payload: payload(spec, UUID_A, 'rejected', spec.remoteId),
			});

			expect(await subject.sync('write-drain')).toMatchObject({ pushed: 0, rejected: 1 });
			expect((await subject.conflicts())[0]).toMatchObject({ status: 'rejected' });
			expect(await record(subject, spec, UUID_A)).toMatchObject({
				local: { dirty: false, pendingMutationIds: [] },
			});
			await subject.dispose();
		}
	);

	it.each(FACETS)(
		'$collection coalesces updates and annihilates an unpushed create/delete chain',
		async (spec) => {
			const route = routedServer(spec, () => null);
			route.server.seed(UUID_A, {
				id: spec.remoteId,
				revision: 'sha256:base',
				collection: spec.collection,
				payload: payload(spec, UUID_A, 'server', spec.remoteId),
			});
			const subject = engine(route.fetch);
			await subject.ready;
			await insert(
				subject,
				spec,
				storedDocument({
					spec,
					id: UUID_A,
					label: 'server',
					remoteId: spec.remoteId,
					revision: 'sha256:base',
				})
			);
			await subject.write({
				collection: spec.collection,
				operation: 'update',
				recordId: UUID_A,
				payload: payload(spec, UUID_A, 'first', spec.remoteId),
			});
			await subject.write({
				collection: spec.collection,
				operation: 'update',
				recordId: UUID_A,
				payload: payload(spec, UUID_A, 'second', spec.remoteId),
			});
			expect(await subject.sync('write-drain')).toMatchObject({ pushed: 1 });
			expect(route.server.received).toHaveLength(1);
			expect(route.server.received[0].payload).toMatchObject(
				spec.collection === 'customers'
					? { first_name: 'second' }
					: spec.collection === 'coupons'
						? { code: 'second' }
						: spec.collection === 'variations'
							? { sku: 'second' }
							: { name: 'second' }
			);

			await insert(subject, spec, storedDocument({ spec, id: UUID_B, label: 'never-pushed' }));
			await subject.write({
				collection: spec.collection,
				operation: 'create',
				recordId: UUID_B,
				payload: payload(spec, UUID_B, 'never-pushed'),
			});
			await subject.write({ collection: spec.collection, operation: 'delete', recordId: UUID_B });
			expect(await record(subject, spec, UUID_B)).toBeNull();
			expect(route.server.received).toHaveLength(1);
			await subject.dispose();
		}
	);

	it('variation parent-required 428 refreshes once, then dead-letters when server truth is unchanged', async () => {
		const spec = FACETS.find(({ collection }) => collection === 'variations')!;
		const truth = {
			...payload(spec, UUID_A, 'server-truth', spec.remoteId),
			parent_id: 50,
			_rxdb_revision: 'sha256:server-base',
		};
		const route = routedServer(spec, () => truth);
		route.server.seed(UUID_A, {
			id: spec.remoteId,
			revision: 'sha256:server-base',
			collection: 'variations',
			payload: truth,
		});
		const subject = engine(route.fetch);
		await subject.ready;
		const bornLocal = storedDocument({
			spec,
			id: UUID_A,
			label: 'missing-parent',
			remoteId: spec.remoteId,
			revision: 'sha256:old',
		});
		(bornLocal.payload as Record<string, unknown>).parent_id = undefined;
		await insert(subject, spec, bornLocal);
		await subject.write({
			collection: 'variations',
			operation: 'create',
			recordId: UUID_A,
			payload: { sku: 'missing-parent', meta_data: uuidMeta(UUID_A) },
		});

		expect(await subject.sync('write-drain')).toMatchObject({ rejected: 1, pushed: 0 });
		expect(route.pulls).toEqual([[spec.remoteId]]);
		expect(route.server.received).toHaveLength(2);
		expect(route.server.received[1].baseRevision).toBe('sha256:server-base');
		expect((await subject.conflicts())[0]).toMatchObject({ status: 'rejected' });
		await subject.dispose();
	});

	it('born-local variation create parent-required 428 dead-letters and unblocks a queued successor', async () => {
		const spec = FACETS.find(({ collection }) => collection === 'variations')!;
		const route = routedServer(spec, () => null);
		let releaseFirstPush: (() => void) | undefined;
		let firstPushStarted: (() => void) | undefined;
		const started = new Promise<void>((resolve) => {
			firstPushStarted = resolve;
		});
		const release = new Promise<void>((resolve) => {
			releaseFirstPush = resolve;
		});
		let pushCount = 0;
		const fetch = async (url: string, init?: RequestInit): Promise<Response> => {
			if (url.includes('/push/')) {
				pushCount += 1;
				if (pushCount === 1) {
					firstPushStarted?.();
					await release;
				}
			}
			return route.fetch(url, init);
		};
		const subject = engine(fetch);
		await subject.ready;
		const missingParent = storedDocument({ spec, id: UUID_A, label: 'missing-parent' });
		(missingParent.payload as Record<string, unknown>).parent_id = undefined;
		await insert(subject, spec, missingParent);
		const first = await subject.write({
			collection: 'variations',
			operation: 'create',
			recordId: UUID_A,
			payload: { sku: 'missing-parent', meta_data: uuidMeta(UUID_A) },
		});
		const firstDrain = subject.sync('write-drain');
		await started;
		const corrected = storedDocument({ spec, id: UUID_A, label: 'corrected' });
		await replaceResident(subject, spec, UUID_A, corrected);
		const successor = await subject.write({
			collection: 'variations',
			operation: 'create',
			recordId: UUID_A,
			payload: payload(spec, UUID_A, 'corrected'),
		});
		releaseFirstPush?.();

		expect(await firstDrain).toMatchObject({ rejected: 1, conflicts: 0, pushed: 0 });
		expect((await subject.conflicts())[0]).toMatchObject({
			mutationId: first.mutationId,
			status: 'rejected',
		});
		expect(await record(subject, spec, UUID_A)).toMatchObject({
			local: { dirty: true, pendingMutationIds: [successor.mutationId] },
		});
		expect(route.pulls).toEqual([]);
		expect(await subject.sync('write-drain')).toMatchObject({ pushed: 1 });
		expect(route.server.received).toHaveLength(2);
		expect(await record(subject, spec, UUID_A)).toMatchObject({
			[spec.remoteIdField]: spec.remoteId,
			local: { dirty: false, pendingMutationIds: [] },
		});
		await subject.dispose();
	});

	it.each(['discard', 'retry-with-server-base'] as const)(
		'variation parent-mismatch 409 is durable and resolvable via %s',
		async (resolution) => {
			const spec = FACETS.find(({ collection }) => collection === 'variations')!;
			let truth = {
				...payload(spec, UUID_A, 'server-truth', spec.remoteId),
				parent_id: 50,
				_rxdb_revision: 'sha256:base',
			};
			const route = routedServer(spec, () => truth);
			route.server.seed(UUID_A, {
				id: spec.remoteId,
				revision: 'sha256:base',
				collection: 'variations',
				payload: truth,
			});
			const subject = engine(route.fetch);
			await subject.ready;
			await insert(
				subject,
				{ ...spec, parentId: 99 },
				storedDocument({
					spec: { ...spec, parentId: 99 },
					id: UUID_A,
					label: 'mismatch',
					remoteId: spec.remoteId,
					revision: 'sha256:base',
				})
			);
			const receipt = await subject.write({
				collection: 'variations',
				operation: 'update',
				recordId: UUID_A,
				payload: { ...payload(spec, UUID_A, 'mismatch', spec.remoteId), parent_id: 99 },
			});

			expect(await subject.sync('write-drain')).toMatchObject({
				conflicts: 1,
				rejected: 0,
				pushed: 0,
			});
			expect((await subject.conflicts())[0]).toMatchObject({
				mutationId: receipt.mutationId,
				status: 'conflicted',
				conflictRevision: null,
			});

			truth = { ...truth, sku: 'refreshed-server-truth', _rxdb_revision: 'sha256:refreshed' };
			route.server.seed(UUID_A, {
				id: spec.remoteId,
				revision: 'sha256:refreshed',
				collection: 'variations',
				payload: truth,
			});
			await subject.resolveConflict(receipt.mutationId, resolution);
			expect(route.pulls).toEqual([[spec.remoteId]]);
			expect(await subject.conflicts()).toEqual([]);

			if (resolution === 'discard') {
				expect(await record(subject, spec, UUID_A)).toMatchObject({
					parentId: 50,
					payload: { parent_id: 50, sku: 'refreshed-server-truth' },
					sync: { revision: 'sha256:refreshed' },
				});
			} else {
				expect(await record(subject, spec, UUID_A)).toMatchObject({
					sync: { revision: 'sha256:refreshed' },
				});
				expect(await subject.sync('write-drain')).toMatchObject({ conflicts: 1, pushed: 0 });
				expect(route.server.received[1].baseRevision).toBe('sha256:refreshed');
			}
			await subject.dispose();
		}
	);
});
