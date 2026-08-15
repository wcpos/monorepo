/**
 * @jest-environment jsdom
 */
import * as React from 'react';

import { fireEvent, render, screen } from '@testing-library/react';

import { QueryStateProvider, useQueryState, useQueryStateActions } from '../../../../query';
import { ProductBrands } from './brands';
import { ProductCategories } from './categories';
import { ProductTags } from './tags';
import { StockStatus } from '../../products/cells/stock-status';

jest.mock('observable-hooks', () => ({
	useObservableEagerState: (value: unknown) => value,
}));
jest.mock('@wcpos/components/button', () => ({
	ButtonPill: ({ children, onPress }: { children: React.ReactNode; onPress?: () => void }) => (
		<button onClick={onPress}>{children}</button>
	),
	ButtonText: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));
jest.mock('@wcpos/components/hstack', () => ({
	HStack: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
jest.mock('../../hooks/use-stock-status-label', () => ({
	useStockStatusLabel: () => ({ getLabel: (value: string) => value }),
}));

type CellName = 'brands' | 'categories' | 'tags' | 'stock_status';

function Harness({ cell }: { cell: CellName }) {
	const actions = useQueryStateActions<'products'>();
	const filters = useQueryState<'products', string>((state) => JSON.stringify(state.filters));
	const document = {
		brands$: [{ id: 12, name: 'Acme' }],
		categories$: [{ id: 23, name: 'Shirts' }],
		tags$: [{ id: 34, name: 'Sale' }],
		stock_status$: 'instock',
	};
	const props = {
		row: { original: { document } },
		table: { options: { meta: { actions: { setFilter: actions.setFilter } } } },
	};
	const cells = {
		brands: ProductBrands,
		categories: ProductCategories,
		tags: ProductTags,
		stock_status: StockStatus,
	};
	const Cell = cells[cell] as unknown as React.ComponentType<Record<string, unknown>>;

	return (
		<>
			<Cell {...props} />
			<div data-testid="product-filters">{filters}</div>
		</>
	);
}

function renderCell(cell: CellName) {
	return render(
		<QueryStateProvider
			collection="products"
			initialPageSize={10}
			initialSort={{ field: 'name', direction: 'asc' }}
		>
			<Harness cell={cell} />
		</QueryStateProvider>
	);
}

describe('product filter cells', () => {
	it.each([
		['brands', { brands: [12] }],
		['categories', { categories: [23] }],
		['tags', { tags: [34] }],
		['stock_status', { stock_status: 'instock' }],
	] as const)('filters by %s through the narrow table-meta action', (cell, expected) => {
		renderCell(cell);

		fireEvent.click(screen.getByRole('button'));

		expect(JSON.parse(screen.getByTestId('product-filters').textContent ?? '{}')).toMatchObject(
			expected
		);
	});
});
