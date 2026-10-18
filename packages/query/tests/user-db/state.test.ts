import { addRxPlugin, createRxDatabase, type RxDatabase } from 'rxdb';
import { RxDBStatePlugin } from 'rxdb/plugins/state';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';

import {
	cacheTranslations,
	clearSessionPointer,
	commitSessionPointer,
	setExtraData,
	type StateSlot,
} from '../../src/user-db';

addRxPlugin(RxDBStatePlugin);
let db: RxDatabase;
beforeEach(async () => {
	db = await createRxDatabase({
		name: `slots_${Math.random().toString(36).slice(2)}`,
		storage: getRxStorageMemory(),
		multiInstance: false,
	});
});
afterEach(async () => {
	await db.close();
});

it('keeps get synchronous and get$ emits the current pointer then changes', async () => {
	const slot: StateSlot<{ current: { storeID: string } | null }> = await db.addState('v2');
	const values: unknown[] = [];
	const subscription = slot.get$('current').subscribe((value) => values.push(value));
	expect(slot.get('current')).toBeUndefined();
	await commitSessionPointer(db as never, { storeID: 'store-1' });
	expect(slot.get('current')).toEqual({ storeID: 'store-1' });
	await clearSessionPointer(db as never);
	expect(slot.get('current')).toBeNull();
	expect(values).toEqual([undefined, { storeID: 'store-1' }, null]);
	expect(db.states.v2).toBe(slot);
	subscription.unsubscribe();
});

it('skips equal catalogues rather than appending another state write', async () => {
	const slot = await db.addState('translations_v2');
	await cacheTranslations(db as never, 'fr@next', { cancel: 'Annuler' });
	const rows = await slot.collection.count().exec();
	await cacheTranslations(db as never, 'fr@next', { cancel: 'Annuler' });
	expect(await slot.collection.count().exec()).toBe(rows);
	await cacheTranslations(db as never, 'fr@next', { cancel: 'Non' });
	expect(slot.get('fr@next')).toEqual({ cancel: 'Non' });
	expect(await slot.collection.count().exec()).toBe(rows + 1);
});

it('writes each extra-data key, including the payment descriptor reset', async () => {
	const slot = await db.addState('data_v2');
	for (const key of ['taxClasses', 'shippingMethods', 'orderStatuses', 'paymentMethods'] as const) {
		await setExtraData(db as never, key, [{ id: key }]);
		expect(slot.get(key)).toEqual([{ id: key }]);
	}
	await setExtraData(db as never, 'paymentMethods', null);
	expect(slot.get('paymentMethods')).toBeNull();
});

it('preserves the fetch-start comparison when another catalogue lands during the request', async () => {
	const slot = await db.addState('translations_v2');
	await cacheTranslations(db as never, 'fr@next', { cancel: 'Annuler' });
	const cached = slot.get('fr@next');
	await cacheTranslations(db as never, 'fr@next', { cancel: 'Non' });
	await cacheTranslations(db as never, 'fr@next', { cancel: 'Annuler' }, { cached });
	expect(slot.get('fr@next')).toEqual({ cancel: 'Non' });
});
