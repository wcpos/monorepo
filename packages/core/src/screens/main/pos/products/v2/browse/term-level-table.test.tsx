/** @jest-environment jsdom */
import * as React from 'react';

import { fireEvent, render, screen } from '@testing-library/react';

import { TermLevelTable } from './term-table';

jest.mock('../../../../../../contexts/translations', () => ({
	useT: () => (key: string, vars?: { count?: number }) =>
		vars?.count !== undefined ? `${vars.count} ${key}` : key,
}));
jest.mock('@wcpos/components/lib/device', () => ({
	usePointer: () => 'fine',
	useIsPhone: () => false,
}));
jest.mock('@wcpos/query', () => ({
	useDocField: (doc: Record<string, unknown>, read: (value: Record<string, unknown>) => unknown) =>
		read(doc),
}));
// The real export pulls in the whole products screen; the level only hands it on.
jest.mock('../../index', () => ({ cellsForRow: jest.fn() }));
// The way back is the variations pane's own (level-back.test.tsx): Escape here.
jest.mock('../level-back', () => ({
	LevelBack: ({
		onBack,
		testID,
		children,
	}: React.PropsWithChildren<{ onBack: () => void; testID?: string }>) => (
		<div data-testid={testID} onKeyDown={(event) => event.key === 'Escape' && onBack()}>
			{children}
		</div>
	),
}));
type Row = { id?: string; record?: { uuid: string } };
// As the real DataTable: rows are `tableConfig.data`, keyed by `getRowId` and drawn through
// `renderItem`; an empty list draws `noDataMessage`, and an `undefined` one falls back to the
// translated default; the footer gets the table's own props (its `count` the LIVE binding's
// loaded rows); an end-reached is a scroll and calls the extend it was handed.
jest.mock('../../../../components/data-table/v2', () => ({
	DataTable: ({
		tableConfig,
		renderItem,
		noDataMessage,
		getItemType,
		actions,
		TableFooterComponent,
		total$,
		active$,
		sync,
		cellsForRow: cells,
	}: {
		tableConfig: {
			data: Row[];
			getRowId?: (row: Row) => string;
			getRowCanExpand?: (row: { original: Row }) => boolean;
			meta?: { marker?: string };
		};
		renderItem: (input: { item: unknown; index: number; table: unknown }) => React.ReactNode;
		noDataMessage?: React.ReactNode;
		getItemType: (row: { original: Row }) => string;
		actions: { extendLimit: () => void };
		TableFooterComponent?: React.ComponentType<Record<string, unknown>>;
		total$: unknown;
		active$: unknown;
		sync: unknown;
		cellsForRow: unknown;
	}) => (
		<div
			data-testid="table"
			data-meta={tableConfig.meta?.marker}
			data-cells={String(cells === jest.requireMock('../../index').cellsForRow)}
			onScroll={() => actions.extendLimit()}
		>
			{tableConfig.data.length === 0 ? (
				noDataMessage === undefined ? (
					<span>common.no_results_found</span>
				) : (
					noDataMessage
				)
			) : (
				tableConfig.data.map((row, index) => {
					const id = tableConfig.getRowId ? tableConfig.getRowId(row) : String(row.id);
					const item = { id, original: row };
					return (
						<div
							key={id}
							data-testid={`item-${id}`}
							data-type={getItemType(item)}
							data-expands={String(tableConfig.getRowCanExpand?.(item) ?? false)}
						>
							{renderItem({ item, index, table: {} })}
						</div>
					);
				})
			)}
			{TableFooterComponent && (
				<TableFooterComponent
					collectionName="products"
					total$={total$}
					active$={active$}
					sync={sync}
					count={999}
				/>
			)}
		</div>
	),
}));
jest.mock('../rows/product-row', () => ({
	ProductRow: ({ item }: { item: { original: { record: { uuid: string } } } }) => (
		<div data-testid={`row-${item.original.record.uuid}`} />
	),
}));
jest.mock('../rows/variable-product-row', () => ({
	VariableProductRow: ({
		item,
		variationsStyle,
		onDrill,
	}: {
		item: { original: { record: { uuid: string } } };
		variationsStyle: string;
		onDrill: (record: unknown) => void;
	}) => (
		<button
			data-testid={`vrow-${item.original.record.uuid}`}
			data-style={variationsStyle}
			onClick={() => onDrill(item.original.record)}
		/>
	),
}));
jest.mock('../footer', () => ({
	ProductsFooter: ({
		count,
		total$,
	}: {
		count: number;
		total$: { subscribe: (next: (value: number | null) => void) => { unsubscribe: () => void } };
	}) => {
		let total: number | null = null;
		total$.subscribe((value) => (total = value)).unsubscribe();
		return <footer data-testid="products-footer" data-count={count} data-total={String(total)} />;
	},
}));
// The leaf components pull in native-only modules; the level's structure is what is tested.
jest.mock('@wcpos/components/button', () => ({
	Button: React.forwardRef<
		HTMLButtonElement,
		React.PropsWithChildren<{ testID: string; onPress: () => void }>
	>(function Button({ children, testID, onPress }, ref) {
		return (
			<button ref={ref} data-testid={testID} onClick={onPress}>
				{children}
			</button>
		);
	}),
}));
jest.mock('@wcpos/components/hstack', () => ({
	HStack: ({ children, testID }: React.PropsWithChildren<{ testID?: string }>) => (
		<div data-testid={testID}>{children}</div>
	),
}));
jest.mock('@wcpos/components/text', () => ({
	Text: ({ children, testID }: React.PropsWithChildren<{ testID?: string }>) => (
		<span data-testid={testID}>{children}</span>
	),
	TextClassContext: React.createContext(undefined),
}));
jest.mock('@wcpos/components/icon', () => ({
	Icon: ({ name }: { name: string }) => <span data-testid={`icon-${name}`} />,
}));
jest.mock('@wcpos/components/image', () => ({ Image: () => null }));
jest.mock('@wcpos/components/virtualized-list', () => ({
	Root: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
	List: ({
		data,
		renderItem,
	}: {
		data: unknown[];
		renderItem: (input: { item: unknown; index: number }) => React.ReactNode;
	}) => (
		<div>
			{data.map((item, index) => (
				<React.Fragment key={index}>{renderItem({ item, index })}</React.Fragment>
			))}
		</div>
	),
	Item: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
}));
jest.mock('../../../../components/product/product-image-placeholder', () => ({
	PRODUCT_IMAGE_PLACEHOLDER: 'placeholder.png',
}));

const drinks = { kind: 'term' as const, id: 1, name: 'Drinks', count: 12 };
const hot = { kind: 'term' as const, id: 2, name: 'Hot', count: 6, parent: 1 };
const latte = { uuid: 'l', payload: { type: 'variable' } };
const flat = { uuid: 'f', payload: { type: 'simple' } };
const base = () => ({
	term: drinks,
	children: [hot],
	answer: {
		hits: [
			{ id: 'hit-l', record: latte },
			{ id: 'hit-f', record: flat },
		],
		total: 80,
	},
	settled: true,
	showProducts: true,
	crumb: { parents: [{ label: 'Categories', onPress: jest.fn() }], here: 'Drinks' },
	back: jest.fn(),
	onOpenTerm: jest.fn(),
	onDrillProduct: jest.fn(),
	variationsStyle: 'drill',
	binding: { resource: {}, active$: {}, sync: jest.fn() },
	state: { sort: { field: 'name', direction: 'asc' } },
	actions: { extendLimit: jest.fn(), setSort: jest.fn(), setFilter: jest.fn() },
	tableConfig: {
		meta: { marker: 'products-table' },
		getRowCanExpand: (row: { original: { record: { payload: { type: string } } } }) =>
			row.original.record.payload.type === 'variable',
	},
	empty: <span data-testid="no-data-message">nothing</span>,
});
type Props = React.ComponentProps<typeof TermLevelTable>;
const level = (overrides: Record<string, unknown> = {}) =>
	({ ...base(), ...overrides }) as unknown as Props & ReturnType<typeof base>;

const before = (a: HTMLElement, b: HTMLElement) =>
	!!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);

it('renders the crumb above the table, then child term rows, then product rows', () => {
	const props = level();
	render(<TermLevelTable {...props} />);
	const crumb = screen.getByTestId('products-breadcrumb');
	const table = screen.getByTestId('table');
	// Above the rows, never inside the table card.
	expect(table.contains(crumb)).toBe(false);
	expect(before(crumb, table)).toBe(true);
	// The child terms are the table's first rows, then its products, in the answer's order.
	expect(table.contains(screen.getByTestId('browse-term-2'))).toBe(true);
	expect(before(screen.getByTestId('browse-term-2'), screen.getByTestId('vrow-l'))).toBe(true);
	expect(before(screen.getByTestId('vrow-l'), screen.getByTestId('row-f'))).toBe(true);
	expect(screen.getByTestId('vrow-l').dataset.style).toBe('drill');
	expect(table.dataset.cells).toBe('true');
	fireEvent.click(screen.getByTestId('browse-term-2'));
	expect(props.onOpenTerm).toHaveBeenCalledWith(hot);
	fireEvent.click(screen.getByTestId('vrow-l'));
	expect(props.onDrillProduct).toHaveBeenCalledWith(latte);
});

it('puts the query total in the crumb, and keeps the stable back testID on the last parent', () => {
	const props = level();
	render(<TermLevelTable {...props} />);
	expect(screen.getByTestId('products-breadcrumb-detail').textContent).toBe(
		'80 pos_products.n_products'
	);
	expect(screen.getByTestId('products-breadcrumb-here').textContent).toBe('Drinks');
	fireEvent.click(screen.getByTestId('products-breadcrumb-back'));
	expect(props.crumb.parents[0].onPress).toHaveBeenCalled();
});

it('keys the rows apart: a term row never expands, products keep the table’s own config', () => {
	render(<TermLevelTable {...level()} />);
	const table = screen.getByTestId('table');
	// The products table's config travels (inline variations read its meta).
	expect(table.dataset.meta).toBe('products-table');
	expect(screen.getByTestId('item-browse:term-2').dataset).toMatchObject({
		type: 'term',
		expands: 'false',
	});
	// A product keeps the id the products table gives it, so an inline expansion carries over.
	expect(screen.getByTestId('item-hit-l').dataset).toMatchObject({
		type: 'variable',
		expands: 'true',
	});
	expect(screen.getByTestId('item-hit-f').dataset).toMatchObject({
		type: 'simple',
		expands: 'false',
	});
});

it('footers the level’s own loaded rows and total, not the live binding’s', () => {
	render(<TermLevelTable {...level()} />);
	expect(screen.getByTestId('products-footer').dataset).toMatchObject({
		count: '2',
		total: '80',
	});
});

it('holds row-shaped slots under the child rows until the products answer, the total pending', () => {
	render(<TermLevelTable {...level({ answer: undefined })} />);
	expect(screen.getByTestId('browse-term-2')).not.toBeNull();
	const held = screen.getAllByTestId('row-placeholder');
	expect(held).toHaveLength(4);
	expect(before(screen.getByTestId('browse-term-2'), held[0])).toBe(true);
	expect(screen.queryByTestId('no-data-message')).toBeNull();
	expect(screen.queryByText('common.no_results_found')).toBeNull();
	expect(screen.queryByTestId('products-breadcrumb-detail')).toBeNull();
	// Pending, never 0.
	expect(screen.getByTestId('products-footer').dataset).toMatchObject({
		count: '0',
		total: 'null',
	});
});

it('shows only child terms for a subcategories display: no products, no slots, no footer, no paging', () => {
	const props = level({ showProducts: false, answer: undefined });
	const { rerender } = render(<TermLevelTable {...props} />);
	expect(screen.getByTestId('browse-term-2')).not.toBeNull();
	expect(screen.queryByTestId('row-placeholder')).toBeNull();
	expect(screen.queryByTestId('products-footer')).toBeNull();
	expect(screen.queryByTestId('no-data-message')).toBeNull();
	expect(screen.queryByText('common.no_results_found')).toBeNull();
	// Answered, still none of the products, and nothing it could page.
	rerender(<TermLevelTable {...level({ showProducts: false, actions: props.actions })} />);
	expect(screen.getByTestId('browse-term-2')).not.toBeNull();
	expect(screen.queryByTestId('row-f')).toBeNull();
	expect(screen.queryByTestId('products-footer')).toBeNull();
	// No products table at all: no product columns over term rows, no window to extend.
	expect(screen.queryByTestId('table')).toBeNull();
	expect(props.actions.extendLimit).not.toHaveBeenCalled();
});

it('hands the empty state to the table when the level answered with nothing and has no children', () => {
	render(<TermLevelTable {...level({ children: [], answer: { hits: [], total: 0 } })} />);
	expect(screen.getByTestId('table').contains(screen.getByTestId('no-data-message'))).toBe(true);
});

it('shows neither the empty state nor the table fallback under child rows with no products', () => {
	render(<TermLevelTable {...level({ answer: { hits: [], total: 0 } })} />);
	expect(screen.getByTestId('browse-term-2')).not.toBeNull();
	expect(screen.queryByTestId('no-data-message')).toBeNull();
	expect(screen.queryByText('common.no_results_found')).toBeNull();
});

it('Escape goes back one level', () => {
	const props = level();
	render(<TermLevelTable {...props} />);
	fireEvent.keyDown(screen.getByTestId('browse-level'), { key: 'Escape' });
	expect(props.back).toHaveBeenCalled();
});

it('keeps its own rows while a child pane is over it', () => {
	const { rerender } = render(<TermLevelTable {...level()} />);
	const other = { uuid: 'x', payload: { type: 'simple' } };
	rerender(
		<TermLevelTable
			{...level({ settled: false, answer: { hits: [{ id: 'hit-x', record: other }], total: 1 } })}
		/>
	);
	expect(screen.getByTestId('row-f')).not.toBeNull();
	expect(screen.queryByTestId('row-x')).toBeNull();
	expect(screen.getByTestId('products-breadcrumb-detail').textContent).toBe(
		'80 pos_products.n_products'
	);
	expect(screen.getByTestId('products-footer').dataset).toMatchObject({
		count: '2',
		total: '80',
	});
});

it('pages the products query from the deepest level only', () => {
	const props = level();
	const { unmount } = render(<TermLevelTable {...props} />);
	fireEvent.scroll(screen.getByTestId('table'));
	expect(props.actions.extendLimit).toHaveBeenCalledTimes(1);
	unmount();
	const covered = level({ settled: false });
	render(<TermLevelTable {...covered} />);
	fireEvent.scroll(screen.getByTestId('table'));
	expect(covered.actions.extendLimit).not.toHaveBeenCalled();
});

it('is the All products pane too: no child rows, the catalogue under the crumb', () => {
	render(
		<TermLevelTable
			{...level({
				term: { kind: 'all' },
				children: [],
				crumb: { parents: [{ label: 'Categories', onPress: jest.fn() }], here: 'All products' },
			})}
		/>
	);
	expect(screen.queryByTestId('browse-term-2')).toBeNull();
	expect(screen.getByTestId('row-f')).not.toBeNull();
	expect(screen.getByTestId('products-breadcrumb-here').textContent).toBe('All products');
});
