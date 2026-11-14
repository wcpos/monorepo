import { addRxPlugin, createRxDatabase } from 'rxdb';
import { disableWarnings, RxDBDevModePlugin } from 'rxdb/plugins/dev-mode';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';
import { wrappedValidateZSchemaStorage } from 'rxdb/plugins/validate-z-schema';

import { storeCollections } from '../collections';
import { resetCollectionPlugin } from './reset-collection';

import type { RxCollection, RxDatabase } from 'rxdb';

jest.mock('@wcpos/utils/logger', () => {
	const error = jest.fn();
	return {
		getLogger: jest.fn(() => ({ debug: jest.fn(), warn: jest.fn(), error })),
		__error: error,
	};
});

const mockError = (jest.requireMock('@wcpos/utils/logger') as { __error: jest.Mock }).__error;

/**
 * Unit test for the reset-collection plugin's hook contract. The reset flow
 * end to end (reset$ consumers, clear-local-data) is covered in
 * packages/core/src/screens/main/pos/cart/clear-local-data.test.tsx and
 * packages/core/src/screens/main/hooks/use-collection.test.tsx.
 */

describe('reset-collection plugin', () => {
	it('returns the post-close reset work to the RxDB hook runner', async () => {
		let finishAddCollections: (_collections: Record<string, unknown>) => void = () => undefined;
		const addCollections = jest.fn(
			() =>
				new Promise<Record<string, unknown>>((resolve) => {
					finishAddCollections = resolve;
				})
		);
		const collection = {
			name: 'logs',
			database: { name: 'store_test', collections: {}, addCollections },
		} as unknown as RxCollection;
		const hook = resetCollectionPlugin.hooks?.postCloseRxCollection?.after as unknown as (
			closedCollection: RxCollection
		) => Promise<void>;

		const hookResult = hook(collection);
		finishAddCollections({ logs: collection });

		await expect(hookResult).resolves.toBeUndefined();
		expect(addCollections).toHaveBeenCalledTimes(1);
	});

	it('codes a failed re-add as a setup failure, not an incompatible-version schema', async () => {
		const collection = {
			name: 'templates',
			database: {
				name: 'store_test',
				collections: {},
				addCollections: jest.fn().mockRejectedValue(new Error('disk I/O error')),
			},
		} as unknown as RxCollection;
		const hook = resetCollectionPlugin.hooks?.postCloseRxCollection?.after as unknown as (
			closedCollection: RxCollection
		) => Promise<void>;

		await hook(collection);

		expect(mockError).toHaveBeenCalledWith(
			'Failed to re-add collection',
			expect.objectContaining({ code: 'SYNC171' })
		);
		expect(mockError).not.toHaveBeenCalledWith(
			expect.anything(),
			expect.objectContaining({ code: 'SYNC311' })
		);
	});
});

/**
 * POS-2SZ: RxDatabase.close() closes every collection, which runs the same
 * postCloseRxCollection hook as collection.remove(). A database close is not a
 * reset, so nothing may be re-added into the closing database.
 */
describe('reset-collection plugin against a real RxDB database', () => {
	let dbCount = 0;

	beforeAll(() => {
		disableWarnings();
		addRxPlugin(RxDBDevModePlugin);
		addRxPlugin(resetCollectionPlugin);
	});

	beforeEach(() => {
		mockError.mockClear();
	});

	async function createStoreDatabase(): Promise<RxDatabase> {
		dbCount += 1;
		const database = await createRxDatabase({
			name: `store_reset_close_${dbCount}`,
			storage: wrappedValidateZSchemaStorage({ storage: getRxStorageMemory() }),
			ignoreDuplicate: true,
		});
		await database.addCollections({ logs: storeCollections.logs });
		return database;
	}

	function watchResets(database: RxDatabase): { resets: RxCollection[]; stop: () => void } {
		if (!database.reset$) throw new Error('reset$ was not attached to the store database');
		const resets: RxCollection[] = [];
		const subscription = database.reset$.subscribe((collection) => resets.push(collection));
		return { resets, stop: () => subscription.unsubscribe() };
	}

	it('does not re-add collections when the database closes', async () => {
		const database = await createStoreDatabase();
		const addCollections = jest.spyOn(database, 'addCollections');
		const { resets, stop } = watchResets(database);

		await database.close();
		stop();

		expect(addCollections).not.toHaveBeenCalled();
		expect(resets).toHaveLength(0);
		expect(mockError).not.toHaveBeenCalledWith('Failed to re-add collection', expect.anything());
	});

	it('still re-adds a removed collection on an open database and emits reset$ once', async () => {
		const database = await createStoreDatabase();
		const original = database.collections.logs;
		const { resets, stop } = watchResets(database);

		await original.remove();
		stop();

		expect(database.collections.logs).toBeDefined();
		expect(database.collections.logs).not.toBe(original);
		expect(resets).toHaveLength(1);
		expect(resets[0]).toBe(database.collections.logs);

		await database.close();
	});

	it('logs no re-add failure when a parked tab closes its database', async () => {
		const database = await createStoreDatabase();
		// The parked tab no longer owns the register, so a re-add's write is refused.
		jest
			.spyOn(database, 'addCollections')
			.mockRejectedValue(new Error('This tab no longer runs the register'));

		await database.close();

		expect(mockError).not.toHaveBeenCalledWith('Failed to re-add collection', expect.anything());
	});
});
