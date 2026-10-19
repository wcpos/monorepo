import { addRxPlugin, createRxDatabase, type RxDatabase } from 'rxdb';
import { RxDBStatePlugin } from 'rxdb/plugins/state';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';

import { openStoreState, StoreDatabaseUnavailableError } from '../../src/store-local';

addRxPlugin(RxDBStatePlugin);
let db: RxDatabase;
beforeEach(async () => {
	db = await createRxDatabase({
		name: `store_state_${Math.random().toString(36).slice(2)}`,
		storage: getRxStorageMemory(),
		multiInstance: false,
	});
});
afterEach(async () => {
	await db.close();
});

it('opens the original slot and observes writes when the same key is opened twice', async () => {
	const state = await openStoreState<{ width: number }>(db, 'products_v2');
	const values: unknown[] = [];
	const subscription = state.get$('width').subscribe((value) => values.push(value));
	expect(state.get('width')).toBeUndefined();
	await state.set('width', () => 120);
	const reopened = await openStoreState<{ width: number }>(db, 'products_v2');
	expect(reopened).toBe(state);
	expect(reopened).toBe(db.states.products_v2);
	expect(reopened.get()).toEqual({ width: 120 });
	await reopened.set('width', (width) => width + 20);
	expect(state.get('width')).toBe(140);
	expect(values).toEqual([undefined, 120, 140]);
	subscription.unsubscribe();
});

it.each([null, undefined])('rejects an unavailable database (%s)', async (db) => {
	await expect(openStoreState(db, 'products_v2')).rejects.toBeInstanceOf(
		StoreDatabaseUnavailableError
	);
});
