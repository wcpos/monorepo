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

async function fixture(assertUsable: () => void = () => undefined) {
	const database = {} as RxDatabase;
	const queue = new RecordMutationQueue(new InMemoryRecordMutationStorage());
	const queuePort = vi.fn(() => queue);
	const manager = new StoreScopeManager({
		createDatabase: async () => database as unknown as ScopeDatabase,
	});
	await manager.switchTo('scope-1');
	const settled = vi.fn(async () => undefined);
	const plane = createWritePlane({
		assertUsable,
		settled,
		manager,
		databaseFor: () => database,
		fetcher: async () => {
			throw new Error('not called');
		},
		syncBaseUrl: 'https://example.test',
		mintUuid: () => 'uuid',
		now: () => 0,
		diagnostics: () => undefined,
		onStatusChanged: () => undefined,
		connectivity: () => 'online',
		emitWriteEvent: () => undefined,
		persistOrderRepull: async () => undefined,
		repullOrdersNow: async () => undefined,
		queueFor: queuePort,
	});
	return { database, plane, queue, queuePort, settled };
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
