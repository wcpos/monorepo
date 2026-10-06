/** @jest-environment jsdom */
import * as React from 'react';

import { act, fireEvent, render, screen } from '@testing-library/react';
import { BehaviorSubject, of } from 'rxjs';

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
// The guard is the products grid's own (#1221); here it passes through.
jest.mock('../../../../../../query', () => ({
	useGuardedExtendLimit: (extend: () => void) => () => extend(),
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
// The real DataTable's header sort: written to its settings id's `sortBy`/`sortDirection` unless
// `persistSort` is off, then applied to the query.
const mockPatchUI = jest.fn();
// As the real DataTable: rows are `tableConfig.data`, keyed by `getRowId` and drawn through
// `renderItem`; an empty list draws `noDataMessage`, and an `undefined` one falls back to the
// translated default; the footer gets the table's own props (its `count` the LIVE binding's
// loaded rows); an end-reached is a scroll and calls the `onEndReached` it was handed, which
// replaces the extend behind its own guard; a header sort persists as the real one does.
jest.mock('../../../../components/data-table/v2', () => ({
	DataTable: ({
		id,
		persistSort = true,
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
		ListFooterComponent,
		onEndReached,
	}: {
		id: string;
		persistSort?: boolean;
		tableConfig: {
			data: Row[];
			getRowId?: (row: Row) => string;
			getRowCanExpand?: (row: { original: Row }) => boolean;
			meta?: { marker?: string };
		};
		renderItem: (input: { item: unknown; index: number; table: unknown }) => React.ReactNode;
		noDataMessage?: React.ReactNode;
		getItemType: (row: { original: Row }) => string;
		actions: { extendLimit: () => void; setSort: (field: string, direction: string) => void };
		TableFooterComponent?: React.ComponentType<Record<string, unknown>>;
		total$: unknown;
		active$: unknown;
		sync: unknown;
		cellsForRow: unknown;
		ListFooterComponent?: React.ComponentType<{ active$: unknown }>;
		onEndReached?: () => void;
	}) => (
		<div
			data-testid="table"
			data-meta={tableConfig.meta?.marker}
			data-cells={String(cells === jest.requireMock('../../index').cellsForRow)}
			data-list-footer={String(!!ListFooterComponent)}
			onScroll={() => (onEndReached ?? actions.extendLimit)()}
		>
			<button
				data-testid="table-sort-price"
				onClick={() => {
					if (persistSort) mockPatchUI(id, { sortBy: 'price', sortDirection: 'desc' });
					actions.setSort('price', 'desc');
				}}
			/>
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
			{/* Undefined falls back to the list's loading strip, as the real DataTable does. */}
			{ListFooterComponent ? (
				<ListFooterComponent active$={active$} />
			) : (
				<span data-testid="list-loading-strip" />
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
// The footer reads its denominator as the real one does: `total` when handed one, else `total$`
// through `useObservableState` (a replaced stream keeps its last value until the new one emits,
// one commit after the swap). Every render's pair is logged, so a test can see what each commit
// would have painted, not only where the DOM settled.
const mockFooterRenders: { count: number; total: number | null }[] = [];
jest.mock('../footer', () => ({
	ProductsFooter: ({
		count,
		total$,
		total: heldTotal,
	}: {
		count: number;
		total$: import('rxjs').Observable<number | null>;
		total?: number | null;
	}) => {
		const streamTotal = jest.requireActual('observable-hooks').useObservableState(total$, null);
		const total = heldTotal !== undefined ? heldTotal : streamTotal;
		mockFooterRenders.push({ count, total });
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
	// `total$` is the live binding's census — never a pane's denominator (the pane hands its own).
	binding: {
		resource: {},
		active$: {},
		pending$: new BehaviorSubject(false),
		total$: of(220),
		sync: jest.fn(),
	},
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

// react-native-web drives `onLayout` from a ResizeObserver jsdom lacks; it leaves the handler on
// the node, so a layout is delivered the way the observer would.
type LaidOut = HTMLElement & { __reactLayoutHandler?: (event: unknown) => void };
const layOut = (height: number) =>
	act(() =>
		(screen.getByTestId('browse-level-rows') as LaidOut).__reactLayoutHandler?.({
			nativeEvent: { layout: { x: 0, y: 0, width: 400, height } },
		})
	);

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

it('footers a replaced total in the same commit as its new count, never the old denominator for a frame', () => {
	const { rerender } = render(<TermLevelTable {...level()} />);
	expect(screen.getByTestId('products-footer').dataset).toMatchObject({ count: '2', total: '80' });
	// The pane's answer changes under it (a sync): both numbers land in ONE commit.
	const other = { uuid: 'x', payload: { type: 'simple' } };
	mockFooterRenders.length = 0;
	rerender(
		<TermLevelTable
			{...level({
				answer: {
					hits: [
						{ id: 'hit-l', record: latte },
						{ id: 'hit-f', record: flat },
						{ id: 'hit-x', record: other },
					],
					total: 81,
				},
			})}
		/>
	);
	expect(screen.getByTestId('products-footer').dataset).toMatchObject({ count: '3', total: '81' });
	// …and no commit painted the new count over the old denominator ("3 of 80").
	expect(mockFooterRenders.length).toBeGreaterThan(0);
	expect(mockFooterRenders).toEqual(mockFooterRenders.map(() => ({ count: 3, total: 81 })));
});

// The footer DataTable mounts must be ONE component identity: one made per count would remount
// the footer, and its sync button, on every page.
it('keeps the same footer node across a count change: the footer is never remounted', () => {
	const { rerender } = render(<TermLevelTable {...level()} />);
	const footer = screen.getByTestId('products-footer');
	const other = { uuid: 'x', payload: { type: 'simple' } };
	rerender(
		<TermLevelTable
			{...level({
				answer: {
					hits: [
						{ id: 'hit-l', record: latte },
						{ id: 'hit-f', record: flat },
						{ id: 'hit-x', record: other },
					],
					total: 81,
				},
			})}
		/>
	);
	expect(screen.getByTestId('products-footer')).toBe(footer);
	expect(footer.dataset).toMatchObject({ count: '3', total: '81' });
	// A re-ask (no answer) is the same node too; its numbers are the held snapshot's.
	rerender(<TermLevelTable {...level({ answer: undefined })} />);
	expect(screen.getByTestId('products-footer')).toBe(footer);
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
	layOut(600);
	fireEvent.scroll(screen.getByTestId('table'));
	expect(props.actions.extendLimit).toHaveBeenCalledTimes(1);
	unmount();
	const covered = level({ settled: false });
	render(<TermLevelTable {...covered} />);
	layOut(600);
	fireEvent.scroll(screen.getByTestId('table'));
	expect(covered.actions.extendLimit).not.toHaveBeenCalled();
});

// Every products table under a browse source is this one: a header sort lost on remount would
// be lost for good.
it('persists a header sort to the products table settings, as the products table does', () => {
	const props = level();
	render(<TermLevelTable {...props} />);
	fireEvent.click(screen.getByTestId('table-sort-price'));
	expect(mockPatchUI).toHaveBeenCalledWith('pos-products', {
		sortBy: 'price',
		sortDirection: 'desc',
	});
	expect(props.actions.setSort).toHaveBeenCalledWith('price', 'desc');
});

// On native, FlashList's first end-reached can land while the demand is pending; the guard
// ignores it, and the list will not fire again for the same content length.
it('pages once when pending clears after an end-reached it ignored while pending', () => {
	const pending$ = new BehaviorSubject(true);
	const props = level({ binding: { ...base().binding, pending$ } });
	render(<TermLevelTable {...props} />);
	layOut(600);
	fireEvent.scroll(screen.getByTestId('table'));
	expect(props.actions.extendLimit).not.toHaveBeenCalled();
	act(() => pending$.next(false));
	expect(props.actions.extendLimit).toHaveBeenCalledTimes(1);
	// Armed once, fired once: a later pending round-trip with no end-reached does not page.
	act(() => pending$.next(true));
	act(() => pending$.next(false));
	expect(props.actions.extendLimit).toHaveBeenCalledTimes(1);
});

it('drops an armed end-reached when a child pane covers the level before pending clears', () => {
	const pending$ = new BehaviorSubject(true);
	const props = level({ binding: { ...base().binding, pending$ } });
	const { rerender } = render(<TermLevelTable {...props} />);
	layOut(600);
	fireEvent.scroll(screen.getByTestId('table'));
	rerender(<TermLevelTable {...props} settled={false} />);
	act(() => pending$.next(false));
	expect(props.actions.extendLimit).not.toHaveBeenCalled();
});

// On native small screens the products screen stays mounted at `display: 'none'` while Cart
// shows, and zero geometry reads as end-reached: the hidden level must not extend the shared
// query (each new limit would hand the list a new handler and page again), and the end it saw is
// checked once when it shows again.
it('ignores an end-reached on a zero-size viewport, and pages once when the viewport is back', () => {
	const props = level();
	render(<TermLevelTable {...props} />);
	// Not measured yet: no viewport.
	fireEvent.scroll(screen.getByTestId('table'));
	expect(props.actions.extendLimit).not.toHaveBeenCalled();
	layOut(0);
	fireEvent.scroll(screen.getByTestId('table'));
	fireEvent.scroll(screen.getByTestId('table'));
	expect(props.actions.extendLimit).not.toHaveBeenCalled();
	// Shown again: the held end-reached is fired once, not once per zero-size report.
	layOut(600);
	expect(props.actions.extendLimit).toHaveBeenCalledTimes(1);
	layOut(640);
	expect(props.actions.extendLimit).toHaveBeenCalledTimes(1);
});

it('holds an end-reached armed while pending until the viewport is back too', () => {
	const pending$ = new BehaviorSubject(true);
	const props = level({ binding: { ...base().binding, pending$ } });
	render(<TermLevelTable {...props} />);
	layOut(0);
	fireEvent.scroll(screen.getByTestId('table'));
	// Pending clears while the screen is still hidden: nothing moves yet.
	act(() => pending$.next(false));
	expect(props.actions.extendLimit).not.toHaveBeenCalled();
	layOut(600);
	expect(props.actions.extendLimit).toHaveBeenCalledTimes(1);
});

it('pages on an end-reached once the viewport is measured, and stops when it goes to zero', () => {
	const props = level();
	render(<TermLevelTable {...props} />);
	layOut(600);
	expect(props.actions.extendLimit).not.toHaveBeenCalled();
	fireEvent.scroll(screen.getByTestId('table'));
	expect(props.actions.extendLimit).toHaveBeenCalledTimes(1);
	(props.actions.extendLimit as jest.Mock).mockClear();
	layOut(0);
	fireEvent.scroll(screen.getByTestId('table'));
	expect(props.actions.extendLimit).not.toHaveBeenCalled();
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

it('draws no loading strip under its rows: the pane moves, and the live sync is not its own', () => {
	render(<TermLevelTable {...level()} />);
	expect(screen.getByTestId('table').dataset.listFooter).toBe('true');
	expect(screen.queryByTestId('list-loading-strip')).toBeNull();
	// Held slots too: the strip would sit under them through the push.
	render(<TermLevelTable {...level({ answer: undefined })} />);
	expect(screen.queryByTestId('list-loading-strip')).toBeNull();
});
