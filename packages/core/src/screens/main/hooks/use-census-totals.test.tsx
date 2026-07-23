/**
 * @jest-environment jsdom
 */
import { act, renderHook } from '@testing-library/react';

import type { CensusTotals } from '@wcpos/query';

import { useCensusTotals } from './use-census-totals';

const emptyTotals: CensusTotals = {
	orders: null,
	products: null,
	variations: null,
	customers: null,
	taxRates: null,
	categories: null,
	brands: null,
	tags: null,
	coupons: null,
};
const mockSubscribers = new Set<(totals: CensusTotals) => void>();
const mockUnsubscribe = jest.fn();
const mockEngine = { id: 'engine' };

jest.mock('@wcpos/query', () => ({
	useQueryManager: () => ({ engine: mockEngine }),
	observeEngineCensus: (_engine: unknown, cb: (totals: CensusTotals) => void) => {
		mockSubscribers.add(cb);
		cb(emptyTotals);
		return () => {
			mockSubscribers.delete(cb);
			mockUnsubscribe();
		};
	},
}));

describe('useCensusTotals', () => {
	beforeEach(() => mockUnsubscribe.mockClear());

	it('observes server census snapshots and unsubscribes on unmount', () => {
		const { result, unmount } = renderHook(() => useCensusTotals());
		expect(result.current).toEqual(emptyTotals);

		act(() => {
			for (const subscriber of mockSubscribers) {
				subscriber({
					...emptyTotals,
					orders: { total: 9, updatedAtMs: 1_000, freshUntilMs: 901_000, fresh: true },
				});
			}
		});
		expect(result.current.orders).toEqual({
			total: 9,
			updatedAtMs: 1_000,
			freshUntilMs: 901_000,
			fresh: true,
		});

		unmount();
		expect(mockUnsubscribe).toHaveBeenCalledTimes(1);
	});
});
