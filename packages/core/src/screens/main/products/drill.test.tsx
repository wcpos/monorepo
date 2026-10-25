/**
 * @jest-environment jsdom
 */
import * as React from 'react';

import { act, fireEvent, render, screen } from '@testing-library/react';

import { ProductsScreen } from './index';

// The Products page drills into a variable product's variations the way the POS panel does
// (one `variationsStyle`, read from the `pos-products` doc), or expands them inline.
type FakeHandle = import('@wcpos/query').QueryHandle;
const { fakeQueryHandle } = jest.requireActual('@wcpos/core-test/fake-query-handle') as {
	fakeQueryHandle: (initial?: Record<string, unknown>) => FakeHandle;
};
const hoodie = {
	id: 'hoodie',
	record: {
		uuid: 'hoodie',
		remoteId: 5,
		payload: { type: 'variable', slug: 'hoodie', name: 'Hoodie', variations: [1, 2] },
	},
};
const mockHandle = fakeQueryHandle({
	result: { hits: [hoodie], searchActive: false, searchState: 'answered' },
	total: 1,
});
let mockStyle: string | undefined = 'drill';
// The products columns doc, and a store its readers subscribe to (a column change re-renders them).
const mockProductsDoc = {
	sortBy: 'name',
	columns: [
		{ key: 'name', show: true },
		{ key: 'sale_price', show: true },
	],
};
let mockDocVersion = 0;
const mockDocListeners = new Set<() => void>();
function patchColumns(columns: { key: string; show: boolean }[]) {
	mockProductsDoc.columns = columns;
	mockDocVersion += 1;
	mockDocListeners.forEach((listener) => listener());
}
let mockPointer = 'fine';
let mockTableProps: Record<string, unknown> = {};
let mockTable: unknown;

jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock('../contexts/pro-access', () => ({ useProAccess: () => ({ readOnly: false }) }));
jest.mock('../hooks/use-user-capabilities', () => ({
	useUserCapabilities: () => ({ caps: { canEditProducts: true, canEditVariations: true } }),
}));
jest.mock('./commands/use-catalogue-record', () => ({
	useCatalogueRecord: () => ({ saveCatalogueChange: jest.fn() }),
}));
jest.mock('../../../query', () => ({
	...jest.requireActual('../../../query'),
	useProductsQueryHandle: () => mockHandle,
}));
jest.mock('@wcpos/query', () => ({
	useDocField: (doc: object, select: (value: object) => unknown) => {
		jest.requireActual('react').useSyncExternalStore(
			(listener: () => void) => {
				mockDocListeners.add(listener);
				return () => mockDocListeners.delete(listener);
			},
			() => mockDocVersion
		);
		return select(doc);
	},
}));
jest.mock('../contexts/ui-settings', () => ({
	useUISettings: (id: string) => ({
		uiSettings: id === 'pos-products' ? { variationsStyle: mockStyle } : mockProductsDoc,
	}),
}));
jest.mock('@wcpos/components/lib/device', () => ({
	usePointer: () => mockPointer,
	useIsPhone: () => false,
}));
// The stage as a pass-through: the root, and the pane while something is drilled.
jest.mock('@wcpos/components/pane-stack', () => ({
	PaneStack: <T,>({
		children,
		detail,
		renderDetail,
	}: React.PropsWithChildren<{
		detail: T | null;
		renderDetail: (detail: T) => React.ReactNode;
	}>) => (
		<>
			{children}
			{detail !== null && renderDetail(detail)}
		</>
	),
}));
jest.mock('react-native-reanimated', () => {
	const ReactActual = jest.requireActual('react');
	return {
		...jest.requireActual('react-native-reanimated'),
		__esModule: true,
		default: {
			View: ({ children }: React.PropsWithChildren) =>
				ReactActual.createElement('div', null, children),
		},
		useSharedValue: (value: unknown) => ({ value }),
		useDerivedValue: (fn: () => unknown) => ({ value: fn() }),
		useAnimatedStyle: () => ({}),
		// Never finishes: a collapse's unmount is not this suite's subject.
		withTiming: (value: unknown) => value,
	};
});
jest.mock('react-native-worklets', () => ({
	scheduleOnRN: (fn: (...args: unknown[]) => void, ...args: unknown[]) => fn(...args),
}));
// The table: each row is handed the table's meta, as the real one's rows are.
jest.mock('../components/data-table', () => ({
	DataTable: (props: Record<string, unknown>) => {
		mockTableProps = props;
		const actual = jest.requireActual('../../../query');
		const snapshot = actual.useQuerySnapshot(props.handle, []);
		// A row's cells are the visible columns WHEN it was built; the live table builds afresh.
		const row = (hit: { id: string }) => {
			const cells = mockProductsDoc.columns
				.filter((column) => column.show)
				.map((column) => ({ column: { id: column.key } }));
			return { id: hit.id, original: hit, table, getVisibleCells: () => cells };
		};
		const table: Record<string, unknown> = {
			options: { meta: (props.tableConfig as { meta: unknown }).meta },
			getHeaderGroups: () => [
				{
					id: 'head',
					headers: mockProductsDoc.columns
						.filter((column) => column.show)
						.map((column) => ({
							id: column.key,
							column: { id: column.key, columnDef: { header: column.key, meta: {} } },
							getContext: () => ({}),
						})),
				},
			],
			getRowModel: () => ({
				rowsById: Object.fromEntries(
					(snapshot.result.hits as { id: string }[]).map((hit) => [hit.id, row(hit)])
				),
			}),
		};
		mockTable = table;
		const renderItem = props.renderItem as (args: object) => React.ReactNode;
		return (
			<div data-testid="products-table">
				{(snapshot.result.hits as { id: string }[]).map((hit, index) => (
					<React.Fragment key={hit.id}>
						{renderItem({
							item: row(hit),
							index,
							table,
						})}
					</React.Fragment>
				))}
			</div>
		);
	},
	DataTableFooter: () => null,
	getColumnStyle: () => ({}),
}));
// A row: its press, and its real actions cell (the caret).
jest.mock('../components/data-table/rows', () => {
	const { Actions } = jest.requireActual('./cells/actions');
	return {
		DataTableRow: ({
			item,
			onPress,
			testID,
		}: {
			item: { id: string; table: unknown };
			onPress?: () => void;
			testID?: string;
		}) => (
			<div data-testid={testID}>
				<button data-testid={`press-${item.id}`} onClick={onPress} />
				<Actions row={item} table={item.table} />
			</div>
		),
	};
});
jest.mock('@wcpos/components/icon-button', () => ({
	IconButton: ({
		testID,
		name,
		onPress,
		...props
	}: {
		testID?: string;
		name: string;
		onPress?: () => void;
		'aria-expanded'?: boolean;
	}) => (
		<button
			data-testid={testID}
			data-icon={name}
			aria-expanded={props['aria-expanded']}
			onClick={onPress}
		/>
	),
}));
// The pane's management variations: which product, and the query they start from.
jest.mock('../components/product/variable-product-row/variations', () => ({
	Variations: ({
		row,
	}: {
		row: {
			original: { record: { uuid: string } };
			getVisibleCells: () => { column: { id: string } }[];
		};
	}) => {
		const { useQueryState } = jest.requireActual('../../../query');
		const state = useQueryState();
		return (
			<div
				data-testid="pane-variations"
				data-parent={row.original.record.uuid}
				data-search={state.search}
				data-matches={JSON.stringify(state.filters.attributeMatches)}
			>
				{row.getVisibleCells().map((cell) => (
					<span key={cell.column.id} data-testid={`pane-cell-${cell.column.id}`} />
				))}
			</div>
		);
	},
}));
jest.mock('./row', () => ({
	ProductRow: () => null,
	VariableRow: ({
		item,
		table,
	}: {
		item: { id: string };
		table: { options: { meta: { drill?: (row: unknown) => void } } };
	}) => (
		<button data-testid={`touch-${item.id}`} onClick={() => table.options.meta.drill?.(item)} />
	),
	InlineVariations: ({ row }: { row: { id: string } }) => (
		<div data-testid="pane-inline-variations" data-parent={row.id} />
	),
}));
// The real DrillIn, short of the POS pane, the deal and the gesture.
jest.mock('../pos/products/deal-stack', () => ({
	DealFade: ({ children }: React.PropsWithChildren) => children,
}));
jest.mock('../pos/products/variations-pane', () => ({
	VariationsPane: () => <div data-testid="pos-variations-pane" />,
}));
jest.mock('react-native-gesture-handler', () => ({
	GestureDetector: ({ children }: React.PropsWithChildren) => children,
	Gesture: {
		Pan: () => {
			const pan = {
				runOnJS: () => pan,
				enabled: () => pan,
				hitSlop: () => pan,
				activeOffsetX: () => pan,
				failOffsetY: () => pan,
				onEnd: () => pan,
			};
			return pan;
		},
	},
}));
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
jest.mock('@wcpos/components/text', () => ({
	Text: ({ children, testID }: React.PropsWithChildren<{ testID?: string }>) => (
		<span data-testid={testID}>{children}</span>
	),
	TextClassContext: React.createContext(undefined),
}));
jest.mock('@wcpos/components/icon', () => ({ Icon: () => null }));
jest.mock('@wcpos/components/table', () => ({
	TableHeader: ({ children }: React.PropsWithChildren) => (
		<div data-testid="pane-head-row">{children}</div>
	),
	TableRow: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
	TableHead: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
	TableCell: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
}));
jest.mock('@wcpos/components/hstack', () => ({
	HStack: ({ children, testID }: React.PropsWithChildren<{ testID?: string }>) => (
		<div data-testid={testID}>{children}</div>
	),
}));
jest.mock('@wcpos/components/vstack', () => ({
	VStack: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
}));
jest.mock('@wcpos/components/card', () => ({
	Card: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
	CardContent: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
	CardHeader: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
}));
jest.mock('@wcpos/components/input', () => ({
	Input: ({
		value,
		onChangeText,
		testID,
	}: {
		value: string;
		onChangeText: (value: string) => void;
		testID?: string;
	}) => (
		<input
			data-testid={testID}
			value={value}
			onChange={(event) => onChangeText(event.currentTarget.value)}
		/>
	),
}));
jest.mock('@wcpos/components/error-boundary', () => ({
	ErrorBoundary: ({ children }: React.PropsWithChildren) => children,
}));
jest.mock('@wcpos/components/suspense', () => ({ Suspense: React.Suspense }));
jest.mock('@wcpos/components/virtualized-list', () => ({
	Item: ({ children }: React.PropsWithChildren) => children,
}));
jest.mock('@wcpos/components/loader', () => ({ Loader: () => null }));
jest.mock('@rn-primitives/slot', () => ({ Slot: 'span' }));
jest.mock('react-native-safe-area-context', () => ({
	useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));
jest.mock('expo-haptics', () => ({}));
jest.mock('../components/capability-tooltip', () => ({
	CapabilityTooltip: ({ children }: React.PropsWithChildren) => children,
}));
jest.mock('@wcpos/utils/open-external-url', () => ({ openExternalURL: jest.fn() }));
jest.mock('../contexts/tax-rates', () => ({
	TaxRatesProvider: ({ children }: React.PropsWithChildren) => children,
	useTaxSettings: () => ({ calcTaxes: false }),
}));
jest.mock('../../../contexts/translations', () => ({ useT: () => (key: string) => key }));
jest.mock('./use-barcode', () => ({ useBarcode: () => ({ onKeyPress: jest.fn() }) }));
jest.mock('./display-options', () => ({ ProductsDisplayOptions: () => null }));
jest.mock('../components/management-bar', () => ({
	ManagementBar: ({ children, search }: React.PropsWithChildren<{ search: React.ReactNode }>) => (
		<div>
			{search}
			{children}
		</div>
	),
}));
jest.mock('../components/pro-guard', () => ({
	withProAccess: (Body: React.ComponentType<object>) => Body,
}));
jest.mock('../components/product/filter-bar', () => ({ FilterBar: () => null }));
jest.mock('../components/data-table/skeleton', () => ({ DataTableSkeleton: () => null }));
jest.mock('./cells/barcode', () => ({ Barcode: () => null }));
jest.mock('./cells/cogs', () => ({ COGS: () => null }));
jest.mock('./cells/editable-price', () => ({ EditablePrice: () => null }));
jest.mock('./cells/name', () => ({ ProductName: () => null }));
jest.mock('./cells/price', () => ({ Price: () => null }));
jest.mock('./cells/stock-quantity', () => ({ StockQuantity: () => null }));
jest.mock('./cells/stock-status', () => ({ StockStatus: () => null }));
jest.mock('./cells/variation-actions', () => ({ VariationActions: () => null }));
jest.mock('./cells/variation-name', () => ({ ProductVariationName: () => null }));
jest.mock('../components/record-date-cell', () => ({ RecordDateCell: () => null }));
jest.mock('../components/product/brands', () => ({ ProductBrands: () => null }));
jest.mock('../components/product/categories', () => ({ ProductCategories: () => null }));
jest.mock('../components/product/image', () => ({ ProductImage: () => null }));
jest.mock('../components/product/tags', () => ({ ProductTags: () => null }));
jest.mock('../components/product/tax-based-on', () => ({ TaxBasedOn: () => null }));
jest.mock('../components/product/variable-image', () => ({ VariableProductImage: () => null }));
jest.mock('../components/product/variable-price', () => ({ VariableProductPrice: () => null }));
jest.mock('../components/product/variation-image', () => ({ ProductVariationImage: () => null }));

beforeEach(() => {
	mockStyle = 'drill';
	mockPointer = 'fine';
	mockProductsDoc.columns = [
		{ key: 'name', show: true },
		{ key: 'sale_price', show: true },
	];
});

const crumb = () => screen.queryByTestId('products-breadcrumb');
const meta = () =>
	(
		mockTableProps.tableConfig as {
			meta: { drill?: (row: unknown, match?: object) => void };
			getRowCanExpand: (row: unknown) => boolean;
		}
	).meta;

it('drills from the row press into the product’s variations, and the crumb comes back', () => {
	render(<ProductsScreen />);
	expect(crumb()).toBeNull();
	fireEvent.click(screen.getByTestId('press-hoodie'));
	expect(crumb()?.textContent).toContain('Hoodie');
	expect(screen.getByTestId('pane-variations').dataset.parent).toBe('hoodie');
	// The caller's pane, never the POS one.
	expect(screen.queryByTestId('pos-variations-pane')).toBeNull();
	fireEvent.click(screen.getByTestId('products-breadcrumb-back'));
	expect(crumb()).toBeNull();
	expect(screen.queryByTestId('pane-variations')).toBeNull();
});

it('drills from the caret too, which is a way in rather than an expander', () => {
	render(<ProductsScreen />);
	const caret = screen.getByTestId('product-expand-button');
	expect(caret.dataset.icon).toBe('chevronRight');
	expect(caret.hasAttribute('aria-expanded')).toBe(false);
	fireEvent.click(caret);
	expect(crumb()?.textContent).toContain('Hoodie');
	// No row ever expands in the drill style.
	const tableConfig = mockTableProps.tableConfig as { getRowCanExpand: (row: unknown) => boolean };
	expect(tableConfig.getRowCanExpand({ original: hoodie })).toBe(false);
});

it('returns to the products when the search changes', () => {
	jest.useFakeTimers();
	try {
		render(<ProductsScreen />);
		fireEvent.click(screen.getByTestId('press-hoodie'));
		expect(crumb()).not.toBeNull();
		fireEvent.change(screen.getByTestId('search-products'), { target: { value: 'hat' } });
		act(() => jest.advanceTimersByTime(250));
		expect(crumb()).toBeNull();
	} finally {
		jest.useRealTimers();
	}
});

it('starts the pane at a chip’s option, or at the products search its variations matched', () => {
	render(<ProductsScreen />);
	const row = { id: 'hoodie', original: hoodie, table: mockTable };
	act(() => meta().drill?.(row, { id: 1, name: 'Size', option: 'L' }));
	expect(JSON.parse(screen.getByTestId('pane-variations').dataset.matches ?? '')).toEqual([
		{ id: 1, name: 'Size', option: 'L' },
	]);
	fireEvent.click(screen.getByTestId('products-breadcrumb-back'));
	act(() =>
		meta().drill?.({
			id: 'hoodie',
			table: mockTable,
			original: { ...hoodie, childrenSearchCount: 2, parentSearchTerm: 'red' },
		})
	);
	expect(screen.getByTestId('pane-variations').dataset.search).toBe('red');
});

it('expands inline as before in the inline style, with no crumb', () => {
	mockStyle = 'inline';
	render(<ProductsScreen />);
	expect(meta().drill).toBeUndefined();
	const caret = screen.getByTestId('product-expand-button');
	expect(caret.getAttribute('aria-expanded')).toBe('false');
	fireEvent.click(screen.getByTestId('press-hoodie'));
	expect(screen.getByTestId('product-expand-button').getAttribute('aria-expanded')).toBe('true');
	expect(crumb()).toBeNull();
});

it('drills from the touch row on a coarse pointer, into the touch variations', () => {
	mockPointer = 'coarse';
	render(<ProductsScreen />);
	fireEvent.click(screen.getByTestId('touch-hoodie'));
	expect(crumb()?.textContent).toContain('Hoodie');
	expect(screen.getByTestId('pane-inline-variations').dataset.parent).toBe('hoodie');
});

it('drops a drill the search left, so restoring the search does not bring it back', () => {
	jest.useFakeTimers();
	try {
		render(<ProductsScreen />);
		fireEvent.click(screen.getByTestId('press-hoodie'));
		fireEvent.change(screen.getByTestId('search-products'), { target: { value: 'hat' } });
		act(() => jest.advanceTimersByTime(250));
		expect(crumb()).toBeNull();
		fireEvent.change(screen.getByTestId('search-products'), { target: { value: '' } });
		act(() => jest.advanceTimersByTime(250));
		expect(crumb()).toBeNull();
		expect(screen.queryByTestId('pane-variations')).toBeNull();
	} finally {
		jest.useRealTimers();
	}
});

it('draws the products head row over the pane rows, and follows a column change', () => {
	render(<ProductsScreen />);
	fireEvent.click(screen.getByTestId('press-hoodie'));
	expect(screen.getByTestId('pane-head-row').textContent).toBe('namesale_price');
	expect(screen.getByTestId('pane-cell-sale_price')).toBeTruthy();
	act(() =>
		patchColumns([
			{ key: 'name', show: true },
			{ key: 'sale_price', show: false },
		])
	);
	expect(screen.queryByTestId('pane-cell-sale_price')).toBeNull();
	expect(screen.getByTestId('pane-cell-name')).toBeTruthy();
});

it('starts afresh when the same product is reopened from another chip', () => {
	render(<ProductsScreen />);
	const row = { id: 'hoodie', original: hoodie, table: mockTable };
	act(() => meta().drill?.(row, { id: 1, name: 'Size', option: 'L' }));
	act(() => meta().drill?.(row, { id: 1, name: 'Size', option: 'M' }));
	expect(JSON.parse(screen.getByTestId('pane-variations').dataset.matches ?? '')).toEqual([
		{ id: 1, name: 'Size', option: 'M' },
	]);
});
