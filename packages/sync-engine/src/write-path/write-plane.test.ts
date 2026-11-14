import { describe, expect, it, vi } from 'vitest';

import {
	createFakeMutationCollection,
	InMemoryRecordMutationStorage,
} from '@wcpos/sync-core/testing';
import { RecordMutationQueue, StoreScopeManager } from '@wcpos/sync-core';
import type { ScopeDatabase } from '@wcpos/sync-core';

import { createWritePlane } from './write-plane';
import { queueFor } from './write-intents';
import { remoteId } from '../testing';

import type { RxDatabase } from 'rxdb';

async function fixture(
	assertUsable: () => void = () => undefined,
	fetcher = async (): Promise<Response> => {
		throw new Error('not called');
	}
) {
	const database = {} as RxDatabase;
	const queue = new RecordMutationQueue(new InMemoryRecordMutationStorage());
	const queuePort = vi.fn(() => queue);
	const manager = new StoreScopeManager({
		createDatabase: async () => database as unknown as ScopeDatabase,
	});
	await manager.switchTo('scope-1');
	const settled = vi.fn(async () => undefined);
	const persistOrderRepull = vi.fn(async () => undefined);
	const repullOrdersNow = vi.fn(async () => undefined);
	const plane = createWritePlane({
		assertUsable,
		settled,
		manager,
		databaseFor: () => database,
		drainRequest: async () => {
			throw new Error('not called');
		},
		fetcher,
		syncBaseUrl: 'https://example.test',
		mintUuid: () => 'uuid',
		now: () => 0,
		diagnostics: () => undefined,
		onStatusChanged: () => undefined,
		connectivity: () => 'online',
		emitWriteEvent: () => undefined,
		persistOrderRepull,
		repullOrdersNow,
		queueFor: queuePort,
	});
	return { database, plane, queue, queuePort, settled, persistOrderRepull, repullOrdersNow };
}

describe('write-plane queue identity', () => {
	it('reuses queueFor identity and consumes the injected queue without instantiating another', async () => {
		const { database, plane, queue, queuePort } = await fixture();
		expect(queueFor(database)).toBe(queueFor(database));

		await plane.conflicts();
		await plane.conflicts();

		expect(queuePort).toHaveBeenCalledTimes(2);
		expect(queuePort.mock.results.every(({ value }) => value === queue)).toBe(true);
	});

	it('uses the module-memoized queue when no queue port is injected', async () => {
		const mutationCollection = createFakeMutationCollection();
		let residentData: Record<string, unknown> = {
			payload: {},
			sync: { revision: '' },
			local: { dirty: false, pendingMutationIds: [] },
		};
		const resident = {
			incrementalModify: async (
				modify: (data: Record<string, unknown>) => Record<string, unknown>
			) => void (residentData = modify(residentData)),
			remove: async () => undefined,
			toJSON: () => residentData,
		};
		const database = {
			collections: {
				orders: { findOne: () => ({ exec: async () => resident }) },
				recordMutations: mutationCollection,
			},
		} as unknown as RxDatabase;
		const manager = new StoreScopeManager({
			createDatabase: async () => database as unknown as ScopeDatabase,
		});
		await manager.switchTo('scope-1');
		const plane = createWritePlane({
			assertUsable: () => undefined,
			settled: async () => undefined,
			manager,
			databaseFor: () => database,
			drainRequest: async () => {
				throw new Error('not called');
			},
			fetcher: async () => {
				throw new Error('not called');
			},
			syncBaseUrl: 'https://example.test',
			mintUuid: () => 'module-queue-write',
			now: () => 0,
			diagnostics: () => undefined,
			onStatusChanged: () => undefined,
			connectivity: () => 'online',
			emitWriteEvent: () => undefined,
			persistOrderRepull: async () => undefined,
			repullOrdersNow: async () => undefined,
		});

		await plane.write({
			collection: 'orders',
			operation: 'create',
			recordId: 'order-1',
			payload: {},
		});

		expect((await queueFor(database).pending()).map(({ mutationId }) => mutationId)).toEqual([
			'module-queue-write',
		]);
	});
});

describe('write-plane status notifications', () => {
	it('notifies after a resolution even when the active database closes mid-window', async () => {
		let residentData: Record<string, unknown> = {
			remoteId: remoteId(42),
			payload: {},
			local: { dirty: true, pendingMutationIds: ['terminal'] },
		};
		const resident = {
			toJSON: () => residentData,
			incrementalModify: async (
				modify: (data: Record<string, unknown>) => Record<string, unknown>
			) => void (residentData = modify(residentData)),
			remove: async () => undefined,
		};
		const database = {
			collections: { orders: { findOne: () => ({ exec: async () => resident }) } },
			listCollections: () => [],
			resetCollection: async () => undefined,
			pendingMutationIds: async () => [],
			close: async () => undefined,
		} as unknown as RxDatabase & ScopeDatabase;
		const queue = new RecordMutationQueue(new InMemoryRecordMutationStorage());
		const pending = await queue.enqueue({
			mutationId: 'terminal',
			collectionName: 'orders',
			operation: 'update',
			recordId: 'order-1',
			origin: 'existing',
			payload: {},
			baseRevision: 'r1',
			queuedAt: '2026-08-07T00:00:00.000Z',
		});
		await queue.replace({ ...pending, status: 'rejected' });
		const manager = new StoreScopeManager({ createDatabase: async () => database });
		await manager.switchTo('scope-1');
		const onStatusChanged = vi.fn();
		const plane = createWritePlane({
			assertUsable: () => undefined,
			settled: async () => undefined,
			manager,
			databaseFor: () => database,
			drainRequest: async () => {
				throw new Error('not called');
			},
			fetcher: async () => {
				throw new Error('not called');
			},
			syncBaseUrl: 'https://example.test',
			mintUuid: () => 'resolver',
			now: () => 0,
			diagnostics: () => undefined,
			onStatusChanged,
			connectivity: () => 'online',
			emitWriteEvent: () => undefined,
			persistOrderRepull: async () => undefined,
			repullOrdersNow: async () => void (await manager.closeScope('scope-1')),
			queueFor: () => queue,
		});

		await plane.resolveConflict('terminal', 'discard');

		expect(manager.activeScope).toBeNull();
		expect(onStatusChanged).toHaveBeenCalledOnce();
	});
});

describe('write-plane resolution after a scope switch', () => {
	// An order discard whose post-commit work (claim release, re-pull) is still
	// running when the cashier switches: nothing it logs may reach the incoming
	// scope's observer.
	async function orderDiscard(hooks: {
		repull?: (manager: StoreScopeManager) => Promise<void>;
		release?: (manager: StoreScopeManager) => Promise<void>;
	}) {
		let residentData: Record<string, unknown> = {
			remoteId: remoteId(42),
			payload: {},
			local: { dirty: true, pendingMutationIds: ['terminal'] },
		};
		const resident = {
			toJSON: () => residentData,
			incrementalModify: async (
				modify: (data: Record<string, unknown>) => Record<string, unknown>
			) => void (residentData = modify(residentData)),
			remove: async () => undefined,
		};
		const database = {
			collections: { orders: { findOne: () => ({ exec: async () => resident }) } },
			listCollections: () => [],
			resetCollection: async () => undefined,
			pendingMutationCount: async () => 0,
			close: async () => undefined,
		} as unknown as RxDatabase & ScopeDatabase;
		const queue = new RecordMutationQueue(new InMemoryRecordMutationStorage());
		const pending = await queue.enqueue({
			mutationId: 'terminal',
			collectionName: 'orders',
			operation: 'update',
			recordId: 'order-1',
			origin: 'existing',
			payload: {},
			baseRevision: 'r1',
			queuedAt: '2026-08-07T00:00:00.000Z',
		});
		await queue.replace({ ...pending, status: 'rejected' });
		const manager = new StoreScopeManager({ createDatabase: async () => database });
		await manager.switchTo('scope-1');
		if (hooks.release) {
			const release = hooks.release;
			vi.spyOn(queue, 'releaseResolutionClaim').mockImplementation(() => release(manager));
		}
		const diagnostics: { type: string }[] = [];
		const plane = createWritePlane({
			assertUsable: () => undefined,
			settled: async () => undefined,
			manager,
			databaseFor: () => database,
			drainRequest: async () => {
				throw new Error('not called');
			},
			fetcher: async () => {
				throw new Error('not called');
			},
			syncBaseUrl: 'https://example.test',
			mintUuid: () => 'resolver',
			now: () => 0,
			diagnostics: (event) => diagnostics.push(event),
			onStatusChanged: () => undefined,
			connectivity: () => 'online',
			emitWriteEvent: () => undefined,
			persistOrderRepull: async () => undefined,
			repullOrdersNow: async () => hooks.repull?.(manager),
			queueFor: () => queue,
		});
		await plane.resolveConflict('terminal', 'discard');
		return { manager, diagnostics };
	}

	it('logs no deferred re-pull into the incoming scope', async () => {
		const { manager, diagnostics } = await orderDiscard({
			repull: async (scopes) => {
				await scopes.switchTo('scope-2');
				throw new Error('scope moved');
			},
		});
		expect(manager.activeScope).toBe('scope-2');
		expect(diagnostics.map((event) => event.type)).not.toContain(
			'queue.write.discard-repull-deferred'
		);
		expect(diagnostics.map((event) => event.type)).not.toContain('queue.write.resolve');
	});

	it('logs no failed claim release into the incoming scope', async () => {
		const { manager, diagnostics } = await orderDiscard({
			release: async (scopes) => {
				await scopes.switchTo('scope-2');
				throw new Error('storage closed');
			},
		});
		expect(manager.activeScope).toBe('scope-2');
		expect(diagnostics.map((event) => event.type)).not.toContain('queue.write.tick.error');
	});

	it('still logs both in the scope that resolved', async () => {
		const { diagnostics } = await orderDiscard({
			repull: async () => {
				throw new Error('offline');
			},
			release: async () => {
				throw new Error('storage busy');
			},
		});
		expect(diagnostics.map((event) => event.type)).toEqual(
			expect.arrayContaining([
				'queue.write.tick.error',
				'queue.write.discard-repull-deferred',
				'queue.write.resolve',
			])
		);
	});
});

describe('write-plane guard order', () => {
	it('reports disposal before the non-writeable facet error', async () => {
		const { plane, settled } = await fixture(() => {
			throw new Error('engine disposed');
		});

		await expect(
			plane.write({ collection: 'tags', operation: 'create', recordId: 'tag-1', payload: {} })
		).rejects.toThrow('engine disposed');
		expect(settled).not.toHaveBeenCalled();
	});

	it('uses read settlement for conflicts and write settlement for write', async () => {
		const { plane, settled } = await fixture();
		await plane.conflicts();
		await expect(
			plane.write({ collection: 'orders', operation: 'create', recordId: 'order-1', payload: {} })
		).rejects.toThrow();
		expect(settled.mock.calls).toEqual([['read'], ['write']]);
	});
});

describe('known-gone order discard', () => {
	it.each([
		[404, 'woo_rxdb_sync_record_not_found', '33827', false, 'pos-open'],
		[404, 'woo_rxdb_sync_record_not_found', '33827', true, 'completed'],
		[403, 'woo_rxdb_sync_record_not_found', '33827', false, 'completed'],
		[404, 'other_reason', '33827', false, 'completed'],
		[404, 'woo_rxdb_sync_record_not_found', null, false, 'pos-open'],
	])(
		'status %s reason %s remote %s removes %s',
		async (status, reason, remoteId, removes, orderStatus) => {
			const { database, plane, queue, persistOrderRepull, repullOrdersNow } = await fixture();
			let data: Record<string, unknown> = {
				remoteId,
				payload: { id: 33827, status: orderStatus },
				local: { dirty: true, pendingMutationIds: ['terminal'] },
			};
			let present = true;
			const resident = {
				toJSON: () => data,
				incrementalModify: async (
					fn: (row: Record<string, unknown>) => Record<string, unknown>
				) => {
					data = fn(data);
				},
				remove: vi.fn(async () => {
					present = false;
				}),
			};
			const bulkRemove = vi.fn(async () => ({ success: [], error: [] }));
			const removeRefunds = vi.fn(async () => ({ success: [], error: [] }));
			Object.assign(database, {
				collections: {
					orders: { findOne: () => ({ exec: async () => (present ? resident : null) }) },
					existenceManifestOrders: { bulkRemove },
					refunds: {
						find: () => ({ exec: async () => [{ toJSON: () => ({ uuid: 'refund' }) }] }),
						bulkRemove: removeRefunds,
					},
				},
			});
			const pending = await queue.enqueue({
				mutationId: 'terminal',
				collectionName: 'orders',
				operation: 'update',
				recordId: 'order-1',
				origin: 'existing',
				payload: {},
				baseRevision: 'r1',
				queuedAt: '2026-11-07T00:00:00.000Z',
			});
			await queue.replace({
				...pending,
				status: 'rejected',
				rejectedStatus: status,
				rejectedReason: reason,
			});
			await plane.resolveConflict('terminal', 'discard');
			expect(present).toBe(!removes);
			expect(await queue.all()).toEqual([]);
			if (removes) {
				expect(bulkRemove).toHaveBeenCalledWith(['33827']);
				expect(removeRefunds).toHaveBeenCalledWith(['refund']);
			} else {
				expect(bulkRemove).not.toHaveBeenCalled();
				expect(removeRefunds).not.toHaveBeenCalled();
			}
			expect(persistOrderRepull).toHaveBeenCalledTimes(!removes && remoteId !== null ? 1 : 0);
			expect(repullOrdersNow).toHaveBeenCalledTimes(!removes && remoteId !== null ? 1 : 0);
		}
	);
});

it('never removes an order-manifest entry when discarding a gone customer with the same id', async () => {
	const { database, plane, queue } = await fixture(
		undefined,
		async () => new Response('[]', { status: 200 })
	);
	const remove = vi.fn(async () => undefined);
	const bulkRemove = vi.fn();
	Object.assign(database, {
		collections: {
			customers: {
				findOne: () => ({
					exec: async () => ({
						toJSON: () => ({ remoteId: '33827', payload: { id: 33827 } }),
						remove,
					}),
				}),
			},
			existenceManifestOrders: { bulkRemove },
		},
	});
	const pending = await queue.enqueue({
		mutationId: 'customer-terminal',
		collectionName: 'customers',
		operation: 'update',
		recordId: 'customer-1',
		origin: 'existing',
		payload: {},
		baseRevision: 'r1',
		queuedAt: '2026-11-07T00:00:00.000Z',
	});
	await queue.replace({
		...pending,
		status: 'rejected',
		rejectedStatus: 404,
		rejectedReason: 'woo_rxdb_sync_record_not_found',
	});
	await plane.resolveConflict('customer-terminal', 'discard');
	expect(remove).toHaveBeenCalledTimes(1);
	expect(bulkRemove).not.toHaveBeenCalled();
});
