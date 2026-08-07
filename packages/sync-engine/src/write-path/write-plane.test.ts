import { describe, expect, it, vi } from 'vitest';

import { InMemoryRecordMutationStorage } from '@wcpos/sync-core/testing';
import { RecordMutationQueue, StoreScopeManager } from '@wcpos/sync-core';
import type { ScopeDatabase } from '@wcpos/sync-core';

import { createWritePlane } from './write-plane';
import { queueFor } from './write-intents';

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
		isWritePlaneOwner: () => true,
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
