import { resetCollectionPlugin } from './reset-collection';

import type { RxCollection } from 'rxdb';

/**
 * Tests for reset-collection plugin logic.
 *
 * Note: Full RxDB integration tests are in @wcpos/query/tests/collection-swap.test.ts
 * which tests the actual swapCollection flow with the plugin.
 *
 * These tests focus on the plugin's core logic without requiring
 * actual RxDB database instances for every test.
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
});
