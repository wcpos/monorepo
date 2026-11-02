import { resetCollectionPlugin } from './reset-collection';

import type { RxCollection } from 'rxdb';

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
