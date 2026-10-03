/** @jest-environment jsdom */
import * as React from 'react';

import { fireEvent, render, screen } from '@testing-library/react';
import { of } from 'rxjs';

import { VariationsPane } from './variations-pane';
import { VariationRow } from './rows/variation-row';

const addVariation = jest.fn();
const hits = [
	{ id: 'one', record: { remoteId: 1, payload: { stock_status: 'instock' } } },
	{ id: 'two', record: { remoteId: 2, payload: { stock_status: 'outofstock' } } },
];
const mockRead = jest.fn();
const binding = {
	resource: { hits, read: mockRead },
	sync: jest.fn(async () => {}),
	total$: of(99),
	active$: of(false),
};
const bind = jest.fn(() => binding);
jest.mock('../../../../../query', () => ({
	useCollectionBinding: (...args: unknown[]) => bind(...(args as [])),
	useQueryState: () => ({ filters: { status: 'publish' } }),
	useQueryStateActions: () => ({}),
}));
jest.mock('@wcpos/query', () => ({
	useDocField: (record: object, select: (value: object) => unknown) => select(record),
}));
const answered = { value: true };
// Whether the answer carried a value; an answer without one is a failed query.
const valued = { value: true };
jest.mock('observable-hooks', () => ({
	useObservableSuspense: (resource: unknown) => resource,
	// The answer as state, for the grid: `undefined` until the query has spoken.
	useObservableEagerState: () =>
		answered.value && valued.value ? { current: { hits } } : undefined,
}));
// The resource's first answer: false until the query has spoken (or failed).
jest.mock('../../../hooks/use-first-answer', () => ({ useFirstAnswer: () => answered.value }));
jest.mock('../../../../../contexts/translations', () => ({
	useT: () => (key: string, values?: object) => JSON.stringify({ key, ...values }),
}));
jest.mock('@wcpos/components/suspense', () => ({
	Suspense: ({ children }: React.PropsWithChildren) => children,
}));
jest.mock('@wcpos/components/text', () => ({
	Text: ({ children }: React.PropsWithChildren) => <span>{children}</span>,
}));
jest.mock('@wcpos/components/status-badge', () => ({ StatusBadge: () => null }));
jest.mock('@wcpos/components/virtualized-list', () => ({
	Item: ({ children }: React.PropsWithChildren) => children,
}));
jest.mock('../../../components/data-table/v2/skeleton', () => ({
	DataTableSkeleton: ({ rowCount }: { rowCount: number }) => (
		<div data-testid="skeleton" data-rows={rowCount} />
	),
}));
jest.mock('../../../components/data-table/v2', () => ({
	DataTable: ({
		tableConfig,
		resource,
		TableFooterComponent,
	}: {
		tableConfig?: { data: typeof hits };
		resource: { hits: typeof hits };
		TableFooterComponent: React.ComponentType<{ count: number; total$: unknown }>;
	}) => (
		<>
			<output data-testid="hits">
				{(tableConfig?.data ?? resource.hits).map((hit) => hit.id).join(',')}
			</output>
			<TableFooterComponent count={resource.hits.length} total$={binding.total$} />
		</>
	),
}));
jest.mock('../../../components/data-table/v2/rows', () => ({
	DataTableRow: ({ onPress, testID }: { onPress: () => void; testID: string }) => (
		<button data-testid={testID} onClick={onPress} />
	),
}));
jest.mock('./variations-grid', () => ({
	VariationsGrid: ({ hits: found, back }: { hits?: typeof hits; back: () => void }) => (
		<button data-testid="grid" onClick={back}>
			{found ? found.map((hit) => hit.id).join(',') : 'unanswered'}
		</button>
	),
}));
jest.mock('./footer', () => ({
	ProductsFooter: ({
		children,
		count,
		total$,
	}: React.PropsWithChildren<{
		count: number;
		total$: { subscribe: (next: (value: number) => void) => { unsubscribe: () => void } };
	}>) => {
		let total = 0;
		const sub = total$.subscribe((value) => {
			total = value;
		});
		sub.unsubscribe();
		return (
			<footer data-testid="footer">
				{children}
				<output>
					{count} of {total}
				</output>
			</footer>
		);
	},
}));
jest.mock('../cells/price', () => ({ Price: () => null }));
jest.mock('../cells/sku', () => ({ SKU: () => null }));
jest.mock('../cells/cogs', () => ({ COGS: () => null }));
jest.mock('../../../components/product/variation-image', () => ({
	ProductVariationImage: () => null,
}));
jest.mock('../../../hooks/use-stock-status-label', () => ({
	useStockStatusLabel: () => ({ getLabel: String }),
}));
jest.mock('../../hooks/use-add-variation', () => ({ useAddVariation: () => ({ addVariation }) }));
const parent = {
	uuid: 'parent',
	payload: { name: 'Tea', variations: [1, 2] },
} as unknown as React.ComponentProps<typeof VariationsPane>['parent'];
it('scopes the query to published parent IDs, filters displayed stock and counts shown of parent total', () => {
	const { rerender } = render(<VariationsPane parent={parent} stockStatus="instock" />);
	expect(bind).toHaveBeenLastCalledWith(
		'variations',
		{ filters: { status: 'publish' } },
		{ remoteIds: ['1', '2'] }
	);
	expect(screen.getByTestId('hits').textContent).toBe('one');
	expect(screen.getByTestId('footer').textContent).toContain('1 of 2');
	expect(screen.getByTestId('footer').textContent).toContain('pos_products.n_variations_of');
	rerender(<VariationsPane parent={parent} />);
	expect(screen.getByTestId('hits').textContent).toBe('one,two');
	expect(screen.getByTestId('footer').textContent).toContain('2 of 2');
});
it('adds a variation with exactly the old cell’s sanitised metadata', () => {
	const variation = {
		remoteId: 2,
		payload: { attributes: [null, { name: 'Size' }, { id: 1, name: 'Colour', option: 'Blue' }] },
	};
	const item = { original: { record: variation } } as unknown as React.ComponentProps<
		typeof VariationRow
	>['item'];
	render(<VariationRow item={item} parent={parent} />);
	fireEvent.click(screen.getByTestId('data-table-row-variation-2'));
	expect(addVariation).toHaveBeenCalledWith(variation, parent, [
		{ attr_id: 1, display_key: 'Colour', display_value: 'Blue' },
	]);
});
it('holds the skeleton, one row per variation, until the query has answered', () => {
	// Outside Suspense on purpose: a fallback React has committed stays up for 300 ms.
	answered.value = false;
	const { rerender } = render(<VariationsPane parent={parent} />);
	expect(screen.getByTestId('skeleton').dataset.rows).toBe('2');
	expect(screen.queryByTestId('hits')).toBeNull();
	answered.value = true;
	rerender(<VariationsPane parent={parent} />);
	expect(screen.queryByTestId('skeleton')).toBeNull();
	expect(screen.getByTestId('hits').textContent).toBe('one,two');
});
it('given a way back, hands the grid the answer itself and never a skeleton or a suspense fallback', () => {
	// A tile that suspended or was swapped for a skeleton mid-deal would lose its place.
	const back = jest.fn();
	answered.value = false;
	const { rerender } = render(<VariationsPane parent={parent} back={back} />);
	expect(screen.getByTestId('grid').textContent).toBe('unanswered');
	expect(screen.queryByTestId('skeleton')).toBeNull();
	answered.value = true;
	rerender(<VariationsPane parent={parent} back={back} />);
	expect(screen.getByTestId('grid').textContent).toBe('one,two');
	expect(screen.queryByTestId('hits')).toBeNull();
	fireEvent.click(screen.getByTestId('grid'));
	expect(back).toHaveBeenCalled();
});
it('reads a query that failed, so its error reaches the boundary instead of an empty grid', () => {
	answered.value = true;
	mockRead.mockClear();
	const { rerender } = render(<VariationsPane parent={parent} back={jest.fn()} />);
	expect(mockRead).not.toHaveBeenCalled();
	// Answered, but with no value: the resource's own read is what rethrows the failure.
	valued.value = false;
	rerender(<VariationsPane parent={parent} back={jest.fn()} />);
	expect(mockRead).toHaveBeenCalled();
	valued.value = true;
});
