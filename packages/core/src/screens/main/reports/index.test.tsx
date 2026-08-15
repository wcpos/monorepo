/**
 * @jest-environment jsdom
 */
import * as React from 'react';

import { endOfDay, startOfDay } from 'date-fns';
import { render } from '@testing-library/react';
import { of } from 'rxjs';

import { ReportsScreen } from './index';

import type { QueryStateOf } from '../../../query';

const mockBinding = {
	resource: { kind: 'reports-orders-resource' },
	active$: of(false),
	total$: of(24),
	totalSource$: of('coverage' as const),
	sync: jest.fn(async () => undefined),
};
const mockUseCollectionBinding = jest.fn((_collection: unknown, _state: unknown) => mockBinding);
let mockSortBy = 'date_created_gmt';
let mockSortDirection = 'desc';
let mockStoreID: number | undefined = 9;

jest.mock('../../../query', () => {
	const actual = jest.requireActual('../../../query');
	return {
		...actual,
		useCollectionBinding: (collection: unknown, state: unknown) =>
			mockUseCollectionBinding(collection, state),
	};
});
jest.mock('@wcpos/query', () => ({
	useQuery: () => {
		throw new Error('legacy useQuery reached');
	},
}));
jest.mock('@wcpos/components/error-boundary', () => ({
	ErrorBoundary: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock('@wcpos/components/suspense', () => ({
	Suspense: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock('./context', () => ({
	ReportsProvider: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock('./reports', () => ({ Reports: () => null }));
jest.mock('../../../contexts/app-state', () => ({
	useAppState: () => ({
		wpCredentials: { id: 7 },
		store: mockStoreID === undefined ? undefined : { id: mockStoreID },
	}),
}));
jest.mock('../../../hooks/use-local-date', () => ({
	convertLocalDateToUTCString: (date: Date) => date.toISOString(),
}));
jest.mock('../contexts/ui-settings', () => ({
	useUISettings: () => ({
		uiSettings: { sortBy: mockSortBy, sortDirection: mockSortDirection },
	}),
}));

function latestState(): QueryStateOf<'orders'> {
	const call = mockUseCollectionBinding.mock.calls.at(-1);
	if (!call) throw new Error('reports orders binding was not called');
	return call[1] as QueryStateOf<'orders'>;
}

describe('ReportsScreen query-state wiring', () => {
	beforeEach(() => {
		jest.useFakeTimers();
		jest.setSystemTime(new Date(2026, 6, 15, 12));
		jest.clearAllMocks();
		mockSortBy = 'date_created_gmt';
		mockSortDirection = 'desc';
		mockStoreID = 9;
	});

	afterEach(() => jest.useRealTimers());

	it('binds the completed current-day report window and current cashier/store scope', () => {
		render(<ReportsScreen />);

		const today = new Date(2026, 6, 15, 12);
		expect(mockUseCollectionBinding).toHaveBeenCalledWith('orders', expect.any(Object));
		expect(latestState()).toEqual({
			search: '',
			filters: {
				status: 'completed',
				dateRange: {
					from: startOfDay(today).toISOString(),
					to: endOfDay(today).toISOString(),
				},
				cashier: '7',
				store: '9',
			},
			sort: { field: 'date_created_gmt', direction: 'desc' },
			limit: Number.MAX_SAFE_INTEGER,
		});
	});

	it('preserves the POS created-via fallback and valid persisted report sort', () => {
		mockStoreID = undefined;
		mockSortBy = 'status';
		mockSortDirection = 'asc';

		render(<ReportsScreen />);

		expect(latestState()).toMatchObject({
			filters: { cashier: '7', store: 'woocommerce-pos' },
			sort: { field: 'status', direction: 'asc' },
		});
	});

	it('rejects sort fields outside the orders surface', () => {
		mockSortBy = 'shipping';

		render(<ReportsScreen />);

		expect(latestState().sort).toEqual({ field: 'date_created_gmt', direction: 'desc' });
	});

	it('re-initializes report filters when the selected store scope changes', () => {
		const { rerender } = render(<ReportsScreen />);
		expect(latestState().filters.store).toBe('9');

		mockStoreID = 12;
		rerender(<ReportsScreen />);

		expect(latestState().filters.store).toBe('12');
	});
});
