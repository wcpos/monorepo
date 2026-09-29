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
const binding = {
	resource: { hits },
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
jest.mock('observable-hooks', () => ({ useObservableSuspense: (resource: unknown) => resource }));
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
jest.mock('@wcpos/components/lib/motion', () => ({ PANE: 280, EASE: (value: number) => value }));
jest.mock('../../../components/data-table/v2/skeleton', () => ({ DataTableSkeleton: () => null }));
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
jest.mock('react-native-reanimated', () => {
	const animation = {
		delay: () => animation,
		duration: () => animation,
		easing: () => animation,
		reduceMotion: () => animation,
	};
	return {
		__esModule: true,
		default: { View: ({ children }: React.PropsWithChildren) => children },
		FadeIn: animation,
		ReduceMotion: { System: 'system' },
	};
});
const parent = {
	uuid: 'parent',
	payload: { name: 'Tea', variations: [1, 2] },
} as unknown as React.ComponentProps<typeof VariationsPane>['parent'];
it('scopes the query to published parent IDs, filters displayed stock and counts shown of parent total', () => {
	const { rerender } = render(
		<VariationsPane parent={parent} viewMode="grid" stockStatus="instock" />
	);
	expect(bind).toHaveBeenLastCalledWith(
		'variations',
		{ filters: { status: 'publish' } },
		{ remoteIds: ['1', '2'] }
	);
	expect(screen.getByTestId('hits').textContent).toBe('one');
	expect(screen.getByTestId('footer').textContent).toContain('1 of 2');
	expect(screen.getByTestId('footer').textContent).toContain('pos_products.n_variations_of');
	rerender(<VariationsPane parent={parent} viewMode="table" />);
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
