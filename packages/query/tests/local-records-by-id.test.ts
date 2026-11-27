import { waitFor } from '@testing-library/react';
import { firstValueFrom } from 'rxjs';

import { observeLocalRecordsById } from '../src/reads/local-records-by-id';
import { createEngineDatabase, createFakeEngine, engineProduct } from '../src/testing';
import { residentEngine } from './helpers/resident-engine';

it('returns [] for empty ids without subscribing to the engine', async () => {
	const { engine, databases } = residentEngine();
	const db = jest.spyOn(engine, 'db$');
	expect(await firstValueFrom(observeLocalRecordsById(engine, 'products', []))).toEqual([]);
	expect(db).not.toHaveBeenCalled();
	expect(databases.observed).toBe(false);
});

it('returns [] while no scope is bound', async () => {
	const { engine } = residentEngine();
	expect(await firstValueFrom(observeLocalRecordsById(engine, 'orders', [42]))).toEqual([]);
});

it('filters local records by Woo id, returning only the uuid and payload', async () => {
	const database = await createEngineDatabase(['products']);
	try {
		await database.collections.products.bulkInsert([
			engineProduct({ uuid: 'wanted', id: 42, name: 'Tea' }),
			engineProduct({ uuid: 'other', id: 7, name: 'Coffee' }),
		]);
		const rows = await firstValueFrom(
			observeLocalRecordsById(createFakeEngine(database), 'products', [42])
		);
		expect(rows).toEqual([
			{ uuid: 'wanted', payload: expect.objectContaining({ id: 42, name: 'Tea' }) },
		]);
	} finally {
		await database.close();
	}
});

it('selects a local customer by numeric Woo id against its stored remoteId', async () => {
	const database = await createEngineDatabase(['customers']);
	try {
		await database.collections.customers.bulkInsert(
			[12, 13].map((id) => ({
				uuid: `customer-${id}`,
				remoteId: String(id),
				remoteKey: String(id),
				payload: { id, first_name: 'Ana' },
				sync: { revision: '1', partial: false, source: 'woo-rest' },
				local: { dirty: false, pendingMutationIds: [] },
			}))
		);
		expect(
			await firstValueFrom(observeLocalRecordsById(createFakeEngine(database), 'customers', [12]))
		).toEqual([{ uuid: 'customer-12', payload: { id: 12, first_name: 'Ana' } }]);
	} finally {
		await database.close();
	}
});

it('re-emits when a matching local record changes', async () => {
	const database = await createEngineDatabase(['products']);
	const seen: unknown[] = [];
	const subscription = observeLocalRecordsById(
		createFakeEngine(database),
		'products',
		[42]
	).subscribe((rows) => seen.push(rows));
	try {
		await waitFor(() => expect(seen.at(-1)).toEqual([]));
		const document = await database.collections.products.insert(
			engineProduct({ uuid: 'tea', id: 42, name: 'Tea' })
		);
		await waitFor(() =>
			expect(seen.at(-1)).toEqual([
				{ uuid: 'tea', payload: expect.objectContaining({ id: 42, name: 'Tea' }) },
			])
		);
		await document.incrementalPatch({ payload: { ...document.payload, name: 'Green tea' } });
		await waitFor(() =>
			expect(seen.at(-1)).toEqual([
				{ uuid: 'tea', payload: expect.objectContaining({ id: 42, name: 'Green tea' }) },
			])
		);
	} finally {
		subscription.unsubscribe();
		await database.close();
	}
});
