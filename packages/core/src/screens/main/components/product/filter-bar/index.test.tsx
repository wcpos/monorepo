/**
 * @jest-environment jsdom
 */
import * as React from 'react';

import { fireEvent, render, screen } from '@testing-library/react';

import {
	type FiltersOf,
	QueryStateProvider,
	useQueryState,
	useQueryStateActions,
} from '../../../../../query';
import { FilterBar } from './index';

const mockUseEngineRecordByWooId = jest.fn((_collection: string, _id: number) => ({
	kind: 'resource',
}));

jest.mock('../../../hooks/use-engine-document', () => ({
	useEngineRecordByWooId: (collection: string, id: number) =>
		mockUseEngineRecordByWooId(collection, id),
}));
jest.mock('@wcpos/components/hstack', () => ({
	HStack: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
jest.mock('@wcpos/components/suspense', () => ({
	Suspense: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock('./stock-status-pill', () => ({
	StockStatusPill: () => <div data-testid="stock-status-pill" />,
}));
jest.mock('./featured-pill', () => ({ FeaturedPill: () => <div data-testid="featured-pill" /> }));
jest.mock('./on-sale-pill', () => ({ OnSalePill: () => <div data-testid="on-sale-pill" /> }));
jest.mock('./category-pill', () => ({ CategoryPill: () => <div data-testid="category-pill" /> }));
jest.mock('./tag-pill', () => ({ TagPill: () => <div data-testid="tag-pill" /> }));
jest.mock('./brands-pill', () => ({ BrandsPill: () => <div data-testid="brands-pill" /> }));

describe('product FilterBar query-state fan-out', () => {
	it('reads tag and brand ids from state and renders all six filters without a fluent Query', () => {
		render(
			<QueryStateProvider
				collection="products"
				initialPageSize={10}
				initialSort={{ field: 'name', direction: 'asc' }}
				initialFilters={{ tags: [17], brands: [29] }}
			>
				{React.createElement(FilterBar as unknown as React.ComponentType)}
			</QueryStateProvider>
		);

		for (const name of ['stock-status', 'featured', 'on-sale', 'category', 'tag', 'brands']) {
			expect(screen.getByTestId(`${name}-pill`)).toBeTruthy();
		}
		expect(mockUseEngineRecordByWooId).toHaveBeenCalledWith('tags', 17);
		expect(mockUseEngineRecordByWooId).toHaveBeenCalledWith('brands', 29);
	});
});
function Probe({ filters }: { filters: Partial<FiltersOf<'products'>> }) {
	const state = useQueryState<'products'>();
	const actions = useQueryStateActions<'products'>();
	return (
		<>
			<button
				data-testid="set"
				onClick={() =>
					Object.entries(filters).forEach(([key, value]) =>
						actions.setFilter(key as keyof FiltersOf<'products'>, value as never)
					)
				}
			/>
			<span data-testid="state">{JSON.stringify(state.filters)}</span>
		</>
	);
}
it.each([
	{ featured: true },
	{ categories: [1, 2] },
	{ featured: true, on_sale: true },
	{ status: 'draft', tags: [2] },
] as Partial<FiltersOf<'products'>>[])(
	'counts groups against published baseline: %j',
	(filters) => {
		render(
			<QueryStateProvider
				collection="products"
				initialFilters={{ status: 'publish' }}
				initialPageSize={10}
				initialSort={{ field: 'name', direction: 'asc' }}
			>
				<FilterBar />
				<Probe filters={filters} />
			</QueryStateProvider>
		);
		expect(screen.queryByTestId('products-filter-clear-all')).toBeNull();
		fireEvent.click(screen.getByTestId('set'));
		if (Object.keys(filters).length < 2)
			expect(screen.queryByTestId('products-filter-clear-all')).toBeNull();
		else {
			fireEvent.click(screen.getByTestId('products-filter-clear-all'));
			expect(JSON.parse(screen.getByTestId('state').textContent!)).toEqual({
				status: 'publish',
				categories: [],
				tags: [],
				brands: [],
			});
			expect(screen.queryByTestId('products-filter-clear-all')).toBeNull();
		}
	}
);

jest.mock('@rn-primitives/slot', () => ({ Slot: 'span' }));
jest.mock('@wcpos/components/loader', () => ({ Loader: () => null }));

jest.mock('expo-haptics', () => ({}));
jest.mock('@wcpos/components/icon', () => ({ Icon: () => null }));
jest.mock('../../../../../contexts/translations', () => ({ useT: () => (key: string) => key }));
