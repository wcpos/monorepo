/** @jest-environment jsdom */
import { act, renderHook } from '@testing-library/react';

import { useCollectionSizes } from './use-collection-sizes';

const mockScope = {
	database: {
		collections: {
			products: { find: () => ({ exec: async () => [{ toJSON: () => ({ a: 1 }) }] }) },
		},
	},
};
let mockActiveScope: typeof mockScope | null = mockScope;
const mockEngine = { active: () => mockActiveScope };

jest.mock('@wcpos/query', () => ({
	COLLECTION_VOCABULARY: jest.requireActual('@wcpos/query').COLLECTION_VOCABULARY,
	useQueryRuntime: () => ({ engine: mockEngine }),
	readCollectionSampleSizes: jest.requireActual('@wcpos/query').readCollectionSampleSizes,
}));

it('clears the previous size when sampling no longer has an active scope', async () => {
	jest.useFakeTimers();
	try {
		const { result, rerender } = renderHook(
			({ count }) => useCollectionSizes({ products: count }, ['products']),
			{ initialProps: { count: 10 } }
		);
		await act(async () => {
			jest.advanceTimersByTime(2_000);
		});
		expect(result.current.products).toBe(70);
		mockActiveScope = null;
		rerender({ count: 11 });
		await act(async () => {
			jest.advanceTimersByTime(2_000);
		});
		expect(result.current.products).toBeNull();
	} finally {
		mockActiveScope = mockScope;
		jest.useRealTimers();
	}
});
