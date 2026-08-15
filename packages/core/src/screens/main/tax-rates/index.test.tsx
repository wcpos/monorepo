/**
 * @jest-environment jsdom
 */
import * as React from 'react';

import { cleanup, render } from '@testing-library/react';
import { of } from 'rxjs';

import { TaxRatesModal } from './index';
import { TaxRatesTabs } from './tabs';
import { QueryStateProvider } from '../../../query';

import type { QueryStateOf } from '../../../query';

const rates = [
	{ id: 1, name: 'Standard', class: 'standard' },
	{ id: 2, name: 'Reduced', class: 'reduced-rate' },
	{ id: 3, name: 'Second standard', class: 'standard' },
];
const mockBinding = {
	resource: { hits: rates.map((document) => ({ document })) },
	active$: of(false),
	total$: of(3),
	totalSource$: of('coverage' as const),
	sync: jest.fn(async () => undefined),
};
const mockUseCollectionBinding = jest.fn((_collection: unknown, _state: unknown) => mockBinding);
const mockRateTable = jest.fn((_props: { rates: typeof rates }) => null);
const mockFooter = jest.fn((_props: Record<string, unknown>) => null);

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
jest.mock('observable-hooks', () => ({
	useObservableSuspense: (resource: unknown) => resource,
	useObservableEagerState: () => [
		{ name: 'Standard', slug: 'standard' },
		{ name: 'Reduced', slug: 'reduced-rate' },
	],
}));
jest.mock('@wcpos/components/error-boundary', () => ({
	ErrorBoundary: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock('@wcpos/components/suspense', () => ({
	Suspense: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock('@wcpos/components/modal', () => ({
	Modal: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
	ModalBody: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
	ModalClose: ({ children }: { children: React.ReactNode }) => <button>{children}</button>,
	ModalContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
	ModalFooter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
	ModalHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
	ModalTitle: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
jest.mock('@wcpos/components/tabs', () => ({
	Tabs: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
	ScrollableTabsList: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
	TabsList: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
	TabsContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
	TabsTrigger: ({ children }: { children: React.ReactNode }) => <button>{children}</button>,
}));
jest.mock('@wcpos/components/text', () => ({
	Text: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));
jest.mock('../../../contexts/translations', () => ({ useT: () => (key: string) => key }));
jest.mock('../contexts/extra-data', () => ({
	useExtraData: () => ({ extraData: { taxClasses$: of([]) } }),
}));
jest.mock('./rate-table', () => ({
	TaxRateTable: (props: { rates: typeof rates }) => mockRateTable(props),
}));
jest.mock('./footer', () => ({
	TaxRatesFooter: (props: Record<string, unknown>) => mockFooter(props),
}));

function latestState(): QueryStateOf<'tax-rates'> {
	const call = mockUseCollectionBinding.mock.calls.at(-1);
	if (!call) throw new Error('tax-rates binding was not called');
	return call[1] as QueryStateOf<'tax-rates'>;
}

function expectGroupingPreserved() {
	expect(mockRateTable.mock.calls.map(([props]) => props.rates.map((rate) => rate.id))).toEqual([
		[1, 3],
		[2],
	]);
}

describe('tax-rates query-state wiring', () => {
	beforeEach(() => jest.clearAllMocks());
	afterEach(cleanup);

	it('binds the unsearched, unfiltered Tier-0 tax-rates view and passes binding projections', () => {
		render(<TaxRatesModal />);

		expect(latestState()).toEqual({
			search: '',
			filters: {},
			sort: { field: 'id', direction: 'asc' },
			limit: Number.MAX_SAFE_INTEGER,
		});
		expect(mockUseCollectionBinding).toHaveBeenLastCalledWith('tax-rates', latestState());
		expect(mockFooter).toHaveBeenCalledWith({
			count: 3,
			active$: mockBinding.active$,
			total$: mockBinding.total$,
			totalSource$: mockBinding.totalSource$,
			sync: mockBinding.sync,
		});
		expect(mockFooter.mock.calls[0]?.[0]).not.toHaveProperty('query');
		expectGroupingPreserved();
	});

	it('keeps the unused tabs component on the same binding and client-side grouping path', () => {
		render(
			<QueryStateProvider
				collection="tax-rates"
				initialPageSize={Number.MAX_SAFE_INTEGER}
				initialSort={{ field: 'id', direction: 'asc' }}
			>
				<TaxRatesTabs />
			</QueryStateProvider>
		);

		expect(latestState().search).toBe('');
		expectGroupingPreserved();
	});
});
