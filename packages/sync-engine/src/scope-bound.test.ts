import { describe, expect, it } from 'vitest';

import { StoreScopeManager } from '@wcpos/sync-core';
import type { ScopeBound, ScopeDatabase, SyncEvent } from '@wcpos/sync-core';

import { scopeBoundObserver } from './scope-bound';

/** A real manager over in-memory databases, with a ticket captured in scope A. */
async function boundInScopeA() {
	const manager = new StoreScopeManager({
		createDatabase: async () =>
			({
				listCollections: () => ['products'],
				resetCollection: async () => undefined,
				pendingMutationIds: async () => [],
				close: async () => undefined,
			}) satisfies ScopeDatabase,
	});
	await manager.switchTo('a');
	let bound!: ScopeBound;
	await manager.runGuarded(async (ticket) => {
		bound = ticket;
	});
	const rows: SyncEvent[] = [];
	const log = scopeBoundObserver(bound, (event) => rows.push(event));
	return { manager, log, rows };
}

const row: SyncEvent = { type: 'queue.write.resolve', level: 'info' };

describe('scopeBoundObserver', () => {
	it('forwards rows while the ticket is current', async () => {
		const { log, rows } = await boundInScopeA();
		log(row);
		expect(rows).toEqual([row]);
	});

	it('drops rows once the store switched (A→B)', async () => {
		const { manager, log, rows } = await boundInScopeA();
		await manager.switchTo('b');
		log(row);
		expect(rows).toEqual([]);
	});

	it('drops rows after a switch away and back (A→B→A): the epoch decides, not the id', async () => {
		const { manager, log, rows } = await boundInScopeA();
		await manager.switchTo('b');
		await manager.switchTo('a');
		expect(manager.activeScope).toBe('a');
		log(row);
		expect(rows).toEqual([]);
	});

	it('drops rows after a collection reset in the same scope', async () => {
		const { manager, log, rows } = await boundInScopeA();
		await manager.resetCollection('a', 'products');
		log(row);
		expect(rows).toEqual([]);
	});
});
