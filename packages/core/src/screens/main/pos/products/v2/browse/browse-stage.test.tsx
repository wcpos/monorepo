/** @jest-environment jsdom */
import * as React from 'react';

import { act, fireEvent, render, screen } from '@testing-library/react';
import { BehaviorSubject, of, Subject } from 'rxjs';

import { isQuickFilterActive } from '../../filter-bar/apply-quick-filter';
import { BrowseStage } from './browse-stage';

// A tiny in-memory query store (as use-browse-path.test.tsx's), so the stage's path is driven
// through real query transitions: entering a term writes its filter, and a search drops it.
const CLEARED = { categories: [] as number[], tags: [] as number[], brands: [] as number[] };
const baseline = (): Record<string, unknown> => ({ ...CLEARED, status: 'publish' });
let mockState = {
	search: '',
	filters: {} as Record<string, unknown>,
	sort: { field: 'name', direction: 'asc' },
};
const mockListeners = new Set<() => void>();
const mockEmit = () => mockListeners.forEach((listener) => listener());
const mockActions = {
	setFilter: jest.fn((field: string, value: unknown) => {
		mockState = { ...mockState, filters: { ...mockState.filters, [field]: value } };
		mockEmit();
	}),
	clearFilter: jest.fn((field: string) => {
		const { [field]: _, ...rest } = mockState.filters;
		mockState = { ...mockState, filters: field in CLEARED ? { ...rest, [field]: [] } : rest };
		mockEmit();
	}),
	resetFilters: jest.fn(() => {
		mockState = { ...mockState, filters: baseline() };
		mockEmit();
	}),
	clearSearch: jest.fn(() => {
		mockState = { ...mockState, search: '' };
		mockEmit();
	}),
	setSearch: jest.fn((search: string) => {
		mockState = { ...mockState, search };
		mockEmit();
	}),
	setSort: jest.fn((field: string, direction: 'asc' | 'desc') => {
		mockState = { ...mockState, sort: { field, direction } };
		mockEmit();
	}),
};
const queryActions = mockActions;
jest.mock('../../../../../../query', () => {
	const { useSyncExternalStore } = jest.requireActual('react');
	return {
		useQueryState: () =>
			useSyncExternalStore(
				(listener: () => void) => {
					mockListeners.add(listener);
					return () => mockListeners.delete(listener);
				},
				() => mockState
			),
		useQueryStateActions: () => mockActions,
		useGuardedExtendLimit: () => () => {},
	};
});
// Whether the root products binding has answered once (a cold open has not).
let mockAnswered = true;
// Child terms synced under Drinks on the server while it is open (its set re-projects in place).
let mockAddedUnderDrinks: number[] = [];
jest.mock('../../../../hooks/use-first-answer', () => ({ useFirstAnswer: () => mockAnswered }));
jest.mock('./use-browse-terms', () => {
	const drinks = { kind: 'term', id: 1, name: 'Drinks', count: 12 };
	const hot = { kind: 'term', id: 2, name: 'Hot', count: 6, parent: 1 };
	const food = { kind: 'term', id: 3, name: 'Food', count: 4 };
	// One object, as the hook's memo hands out per projection.
	const terms = {
		all: [drinks, hot, food],
		rootsOf: () => [drinks, food],
		childrenOf: (term: { id?: number }) => (term.id === 1 ? [hot] : []),
		idsFor: (term: { id?: number }) =>
			term.id === 1
				? [1, 2, ...mockAddedUnderDrinks]
				: term.id === 2
					? [2]
					: term.id === 3
						? [3]
						: [],
		quickFilterFor: () => undefined,
	};
	// A shortcut whose own conditions carry a search (and a filter and a sort).
	const lattes = {
		type: 'quick',
		id: 'qf-lattes',
		label: 'Lattes',
		conditions: [
			{ field: 'search', value: 'latte' },
			{ field: 'on_sale', value: true },
		],
		sort: { field: 'sortable_price', direction: 'desc' },
	};
	const shortcut = { kind: 'shortcut', id: 'qf-lattes', name: 'Lattes', description: '' };
	const shortcuts = {
		all: [shortcut],
		rootsOf: () => [shortcut],
		childrenOf: () => [],
		idsFor: () => [],
		quickFilterFor: (term: { kind: string; id?: string }) =>
			term.kind === 'shortcut' && term.id === lattes.id ? lattes : undefined,
	};
	return {
		useBrowseTerms: (source: string) => (source === 'shortcuts' ? shortcuts : terms),
		mockLattes: lattes,
	};
});
jest.mock('../../../../../../contexts/translations', () => ({
	useT: () => (key: string, vars?: { count?: number }) =>
		vars?.count !== undefined ? `${vars.count} ${key}` : key,
}));
jest.mock('../../../../contexts/ui-settings', () => ({
	useUISettings: () => ({
		uiSettings: {
			gridColumns: 2,
			gridFields: { name: true },
			sortBy: 'name',
			sortDirection: 'asc',
			showOutOfStock: true,
		},
	}),
}));
jest.mock('@wcpos/query', () => ({
	useDocField: (doc: Record<string, unknown>, read: (value: Record<string, unknown>) => unknown) =>
		read(doc),
}));
// As the real stacks: the staged detail outlives a null `detail` for the gather (until it ends,
// which here is at once unless a test holds the gathers open).
let mockHoldGathers = false;
function MockStack({
	detail,
	renderDetail,
	children,
	testID,
	collapse,
}: React.PropsWithChildren<{
	detail: unknown;
	renderDetail: (detail: unknown) => React.ReactNode;
	testID?: string;
	collapse?: boolean;
}>) {
	const [staged, setStaged] = React.useState(detail);
	if (detail !== null && detail !== staged) setStaged(detail);
	if (detail === null && staged !== null && !mockHoldGathers) setStaged(null);
	const shown = detail ?? (mockHoldGathers ? staged : null);
	return (
		<div data-testid={testID} data-collapse={String(!!collapse)}>
			<div data-testid="stack-root">{children}</div>
			{shown ? <div data-testid="stack-detail">{renderDetail(shown)}</div> : null}
		</div>
	);
}
jest.mock('../deal-stack', () => ({
	DealStack: (props: Parameters<typeof MockStack>[0]) => <MockStack {...props} />,
	DealStagedContext: jest.requireActual('react').createContext(null),
	DealCell: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
	DealFade: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
	FRONT: {},
	useDeal: () => ({ grid: null, placeGrid: () => {}, dealt: true }),
}));
jest.mock('@wcpos/components/pane-stack', () => ({
	PaneStack: (props: Parameters<typeof MockStack>[0]) => <MockStack {...props} />,
}));
jest.mock('../drill-in', () => ({
	DrillIn: ({
		parents,
		back,
	}: {
		parents?: { label: string; onPress: () => void }[];
		back: () => void;
	}) => (
		<div>
			<span data-testid="drill-in">
				{(parents ?? []).map((parent) => parent.label).join(' › ')}
			</span>
			<button
				data-testid="drill-in-last-parent"
				onClick={parents?.length ? parents[parents.length - 1].onPress : back}
			/>
		</div>
	),
}));
// The way back is level-back.test.tsx's: Escape here, stopping at the deepest level.
jest.mock('../level-back', () => ({
	LevelBack: ({
		onBack,
		testID,
		children,
	}: React.PropsWithChildren<{ onBack: () => void; testID?: string }>) => (
		<div
			data-testid={testID}
			onKeyDown={(event) => {
				if (event.key !== 'Escape') return;
				event.stopPropagation();
				onBack();
			}}
		>
			{children}
		</div>
	),
}));
// The crumb as its parents (the last keeps the level's stable back testID), here and detail.
jest.mock('@wcpos/components/breadcrumb', () => ({
	Breadcrumb: ({
		parents,
		here,
		detail,
		testID,
	}: {
		parents: { label: string; onPress: () => void; testID?: string }[];
		here?: string;
		detail?: string;
		testID: string;
	}) => (
		<nav data-testid={testID}>
			{parents.map((parent, index) => (
				<button
					key={index}
					data-testid={parent.testID ?? `${testID}-parent-${index}`}
					onClick={parent.onPress}
				>
					{parent.label}
				</button>
			))}
			<span data-testid={`${testID}-here`}>{here}</span>
			<span data-testid={`${testID}-detail`}>{detail}</span>
		</nav>
	),
}));
jest.mock('../grid/product-tile', () => ({
	ProductTile: ({ record }: { record: { uuid: string } }) => (
		<div data-testid={`product-${record.uuid}`} />
	),
}));
jest.mock('../grid/variable-product-tile', () => ({
	VariableProductTile: ({
		record,
		onDrill,
	}: {
		record: unknown;
		onDrill: (record: unknown) => void;
	}) => <button data-testid="variable-product-drill" onClick={() => onDrill(record)} />,
}));
jest.mock('../footer', () => ({ ProductsFooter: () => null }));
// As the real DataTable: rows are `tableConfig.data`, drawn through `renderItem`; a header sort
// is the `setSort` it was handed.
jest.mock('../../../../components/data-table/v2', () => ({
	DataTable: ({
		tableConfig,
		renderItem,
		actions,
	}: {
		tableConfig: { data: { id?: string }[]; getRowId: (row: unknown) => string };
		renderItem: (input: { item: unknown; index: number; table: unknown }) => React.ReactNode;
		actions: { setSort: (field: string, direction: 'asc' | 'desc') => void };
	}) => (
		<div data-testid="table">
			<button data-testid="table-sort-name" onClick={() => actions.setSort('name', 'asc')} />
			{tableConfig.data.map((row, index) => (
				<React.Fragment key={tableConfig.getRowId(row)}>
					{renderItem({ item: { id: tableConfig.getRowId(row), original: row }, index, table: {} })}
				</React.Fragment>
			))}
		</div>
	),
}));
jest.mock('../../index', () => ({ cellsForRow: jest.fn() }));
jest.mock('../rows/product-row', () => ({
	ProductRow: ({ item }: { item: { original: { record: { uuid: string } } } }) => (
		<div data-testid={`product-${item.original.record.uuid}`} />
	),
}));
jest.mock('../rows/variable-product-row', () => ({
	VariableProductRow: ({
		item,
		onDrill,
	}: {
		item: { original: { record: unknown } };
		onDrill: (record: unknown) => void;
	}) => (
		<button data-testid="variable-product-drill" onClick={() => onDrill(item.original.record)} />
	),
}));
jest.mock('react-native-reanimated', () => ({
	__esModule: true,
	default: {
		FlatList: ({
			data,
			renderItem,
			keyExtractor,
			testID,
			ListFooterComponent,
		}: {
			data: unknown[];
			renderItem: (input: { item: unknown; index: number }) => React.ReactNode;
			keyExtractor: (item: unknown, index: number) => string;
			testID: string;
			ListFooterComponent?: React.ReactNode;
		}) => (
			<div data-testid={testID}>
				{data.map((item, index) => (
					<div key={keyExtractor(item, index)}>{renderItem({ item, index })}</div>
				))}
				{ListFooterComponent}
			</div>
		),
	},
	useAnimatedRef: () => ({ current: null }),
	useScrollViewOffset: () => ({ value: 0 }),
}));
jest.mock('@wcpos/components/lib/device', () => ({
	usePointer: () => 'fine',
	useIsPhone: () => false,
}));
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
jest.mock('@wcpos/components/text', () => ({
	Text: ({ children }: React.PropsWithChildren) => <span>{children}</span>,
	TextClassContext: jest.requireActual('react').createContext(undefined),
}));
jest.mock('@wcpos/components/vstack', () => ({
	VStack: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
}));
jest.mock('@wcpos/components/icon', () => ({ Icon: () => null }));
jest.mock('@wcpos/components/image', () => ({ Image: () => null }));
jest.mock('../../../../components/product/product-image-placeholder', () => ({
	PRODUCT_IMAGE_PLACEHOLDER: 'placeholder.png',
}));

const variable = { uuid: 'v', payload: { type: 'variable', name: 'Latte' } };
const simple = { uuid: 's', payload: { type: 'simple', name: 'Flat White' } };
const HITS = [
	{ id: 'hit-v', record: variable },
	{ id: 'hit-s', record: simple },
];
const makeBinding = () => ({
	resource: { valueRef$$: new BehaviorSubject({ current: { hits: HITS } }), read: jest.fn() },
	// `count`: the local rows matching the query before the window. `total$` is the coverage
	// verdict, which prefers the whole collection's census — the catalogue size, never a level's.
	result$: new BehaviorSubject({ hits: HITS, count: 80 }),
	total$: new BehaviorSubject<number | null>(220),
	active$: of(false),
	pending$: of(false),
	sync: jest.fn(),
});
type Props = React.ComponentProps<typeof BrowseStage>;
const stageProps = (overrides: Record<string, unknown> = {}) =>
	({
		source: 'categories',
		viewMode: 'grid',
		renderProducts: (onDrill: (record: unknown) => void) => (
			<button data-testid="products" onClick={() => onDrill(variable)} />
		),
		empty: <span data-testid="no-data-message" />,
		variationsStyle: 'drill',
		binding: makeBinding(),
		state: { sort: { field: 'name', direction: 'asc' } },
		actions: { extendLimit: jest.fn(), setSort: jest.fn(), setFilter: jest.fn() },
		tableConfig: { getRowCanExpand: () => false },
		onDrilledChange: jest.fn(),
		initialFilters: { status: 'publish' },
		...overrides,
	}) as unknown as Props;

beforeEach(() => {
	mockState = { search: '', filters: baseline(), sort: { field: 'name', direction: 'asc' } };
	mockListeners.clear();
	mockHoldGathers = false;
	mockAnswered = true;
	mockAddedUnderDrinks = [];
	jest.clearAllMocks();
});

it('opens on the root term set, not the products, in grid and table', () => {
	const { rerender } = render(<BrowseStage {...stageProps({ viewMode: 'grid' })} />);
	expect(screen.getByTestId('browse-root')).toBeTruthy();
	expect(screen.getByTestId('browse-term-1')).toBeTruthy();
	expect(screen.queryByTestId('products')).toBeNull();
	rerender(<BrowseStage {...stageProps({ viewMode: 'table' })} />);
	expect(screen.getByTestId('browse-root')).toBeTruthy();
	expect(screen.getByTestId('browse-term-1')).toBeTruthy();
	expect(screen.queryByTestId('products')).toBeNull();
});

it('tapping a root term opens its level; a child term nests; the crumb goes back', () => {
	render(<BrowseStage {...stageProps()} />);
	fireEvent.click(screen.getByTestId('browse-term-1'));
	expect(screen.getByTestId('browse-level')).toBeTruthy();
	expect(screen.getByTestId('browse-parent')).toBeTruthy();
	expect(mockState.filters.categories).toEqual([1, 2]);
	fireEvent.click(screen.getByTestId('browse-term-2')); // Hot, a child of Drinks
	expect(screen.getAllByTestId('browse-level').length).toBe(2);
	expect(mockState.filters.categories).toEqual([2]);
	// The deepest crumb: Categories › Drinks (its back) › Hot.
	const hereLabels = screen.getAllByTestId('products-breadcrumb-here').map((el) => el.textContent);
	expect(hereLabels).toEqual(['Drinks', 'Hot']);
	fireEvent.click(screen.getByTestId('products-breadcrumb-parent-0')); // Categories, from Hot
	expect(screen.queryByTestId('browse-level')).toBeNull();
	expect(mockState.filters.categories).toEqual([]);
});

it('the crumb back steps one level; a live level shows the products with its own count, never the census total', () => {
	render(<BrowseStage {...stageProps()} />);
	fireEvent.click(screen.getByTestId('browse-term-1'));
	fireEvent.click(screen.getByTestId('browse-term-2'));
	const backs = screen.getAllByTestId('products-breadcrumb-back');
	fireEvent.click(backs[backs.length - 1]); // Drinks, from Hot
	expect(screen.getAllByTestId('browse-level').length).toBe(1);
	expect(screen.getByTestId('products-breadcrumb-here').textContent).toBe('Drinks');
	expect(screen.getByTestId('products-breadcrumb-detail').textContent).toBe(
		'80 pos_products.n_products'
	);
	expect(screen.getByTestId('variable-product-drill')).toBeTruthy();
	expect(screen.getByTestId('product-s')).toBeTruthy();
});

it('All products is a dealt level with the All products tile in slot 0', () => {
	render(<BrowseStage {...stageProps()} />);
	fireEvent.click(screen.getByTestId('browse-all-products'));
	expect(screen.getByTestId('browse-level')).toBeTruthy();
	expect(screen.getByTestId('browse-parent')).toBeTruthy();
	expect(screen.getByTestId('products-breadcrumb')).toBeTruthy();
	expect(screen.getByTestId('products-breadcrumb-here').textContent).toBe(
		'pos_products.browse_all_products'
	);
	// No children: the products straight under slot 0; the products element is not on stage.
	expect(screen.queryByTestId('browse-term-2')).toBeNull();
	expect(screen.getByTestId('variable-product-drill')).toBeTruthy();
	expect(screen.queryByTestId('products')).toBeNull();
});

it('a Brand pill pressed under All products drops its crumb and shows the narrowed products', () => {
	render(<BrowseStage {...stageProps()} />);
	fireEvent.click(screen.getByTestId('browse-all-products'));
	expect(screen.getByTestId('browse-level')).toBeTruthy();
	act(() => queryActions.setFilter('brands', [8]));
	expect(screen.queryByTestId('browse-level')).toBeNull();
	expect(screen.queryByTestId('products-breadcrumb')).toBeNull();
	expect(screen.getByTestId('products')).toBeTruthy();
});

it('a product drilled inside a term gets the term crumb as its ancestors, and the term crumb closes the drill', () => {
	const onDrilledChange = jest.fn();
	render(<BrowseStage {...stageProps({ viewMode: 'table', onDrilledChange })} />);
	fireEvent.click(screen.getByTestId('browse-term-1'));
	fireEvent.click(screen.getByTestId('variable-product-drill'));
	expect(screen.getByTestId('drill-in').textContent).toBe(
		'pos_products.browse_categories › Drinks'
	);
	expect(onDrilledChange).toHaveBeenLastCalledWith(true);
	fireEvent.click(screen.getByTestId('drill-in-last-parent'));
	expect(screen.queryByTestId('drill-in')).toBeNull();
	expect(screen.getByTestId('browse-level')).toBeTruthy(); // still inside Drinks
	expect(onDrilledChange).toHaveBeenLastCalledWith(false);
});

it('hands the filter bar its level back when the stage unmounts while drilled', () => {
	const onDrilledChange = jest.fn();
	const { unmount } = render(<BrowseStage {...stageProps({ onDrilledChange })} />);
	fireEvent.click(screen.getByTestId('browse-term-1'));
	fireEvent.click(screen.getByTestId('variable-product-drill'));
	expect(onDrilledChange).toHaveBeenLastCalledWith(true);
	unmount();
	expect(onDrilledChange).toHaveBeenLastCalledWith(false);
});

it('a search typed inside a term shows the catalogue-wide products with no crumb; clearing it shows the root set', () => {
	render(<BrowseStage {...stageProps()} />);
	fireEvent.click(screen.getByTestId('browse-term-1'));
	act(() => queryActions.setSearch('lat'));
	expect(screen.getByTestId('products')).toBeTruthy();
	expect(screen.queryByTestId('products-breadcrumb')).toBeNull();
	expect(screen.queryByTestId('browse-level')).toBeNull();
	// The term's filter went with the path: the search spans the catalogue.
	expect(mockState.filters.categories).toEqual([]);
	act(() => queryActions.clearSearch());
	expect(screen.queryByTestId('products')).toBeNull();
	expect(screen.getByTestId('browse-term-1')).toBeTruthy();
});

it('a pill narrowing the query at the root shows its products, not the term set; Clear filters brings the terms back', () => {
	render(<BrowseStage {...stageProps()} />);
	act(() => queryActions.setFilter('categories', [9]));
	expect(screen.getByTestId('products')).toBeTruthy();
	expect(screen.queryByTestId('browse-root')).toBeNull();
	expect(screen.queryByTestId('products-breadcrumb')).toBeNull();
	act(() => queryActions.resetFilters());
	expect(screen.queryByTestId('products')).toBeNull();
	expect(screen.getByTestId('browse-term-1')).toBeTruthy();
});

// showOutOfStock off: the baseline carries stock_status 'instock', and clearing the default
// In-stock pill DELETES it — a broader query, which is not the baseline either.
it('the default In-stock pill cleared at the root shows the broadened products, not the term set', () => {
	mockState = { ...mockState, filters: { ...baseline(), stock_status: 'instock' } };
	render(
		<BrowseStage
			{...stageProps({ initialFilters: { status: 'publish', stock_status: 'instock' } })}
		/>
	);
	expect(screen.getByTestId('browse-root')).toBeTruthy();
	act(() => queryActions.clearFilter('stock_status'));
	expect(mockState.filters.stock_status).toBeUndefined();
	expect(screen.getByTestId('products')).toBeTruthy();
	expect(screen.queryByTestId('browse-root')).toBeNull();
});

it('a pill pressed inside a level leaves its products at the root, not the term tiles over a filtered query', () => {
	render(<BrowseStage {...stageProps()} />);
	fireEvent.click(screen.getByTestId('browse-term-1'));
	act(() => queryActions.setFilter('brands', [8]));
	expect(screen.queryByTestId('browse-level')).toBeNull();
	expect(screen.getByTestId('products')).toBeTruthy();
	expect(screen.queryByTestId('browse-root')).toBeNull();
	act(() => queryActions.resetFilters());
	expect(screen.getByTestId('browse-root')).toBeTruthy();
});

it('a product drilled from the search-displaced root opens in the stage, through one stable handler', () => {
	const renderProducts = jest.fn((onDrill: (record: unknown) => void) => (
		<button data-testid="products" onClick={() => onDrill(variable)} />
	));
	render(<BrowseStage {...stageProps({ renderProducts })} />);
	act(() => queryActions.setSearch('lat'));
	act(() => queryActions.setSearch('latt'));
	const handlers = new Set(renderProducts.mock.calls.map(([onDrill]) => onDrill));
	expect(handlers.size).toBe(1);
	fireEvent.click(screen.getByTestId('products'));
	expect(screen.getByTestId('drill-in')).toBeTruthy();
	// A search that moves forgets it: the same search again shows the results.
	act(() => queryActions.setSearch('lat'));
	expect(screen.queryByTestId('drill-in')).toBeNull();
	act(() => queryActions.setSearch('latt'));
	expect(screen.queryByTestId('drill-in')).toBeNull();
});

it('a product drilled from a pill-displaced root is forgotten when Clear filters brings the term set back', () => {
	const onDrilledChange = jest.fn();
	render(<BrowseStage {...stageProps({ onDrilledChange })} />);
	act(() => queryActions.setFilter('brands', [8]));
	fireEvent.click(screen.getByTestId('products'));
	expect(screen.getByTestId('drill-in')).toBeTruthy();
	expect(onDrilledChange).toHaveBeenLastCalledWith(true);
	act(() => queryActions.resetFilters());
	expect(screen.queryByTestId('drill-in')).toBeNull();
	expect(screen.getByTestId('browse-term-1')).toBeTruthy();
	// The filter bar is back at the products level.
	expect(onDrilledChange).toHaveBeenLastCalledWith(false);
	// Forgotten, not hidden: the same pill again shows its products, not the old drill.
	act(() => queryActions.setFilter('brands', [8]));
	expect(screen.queryByTestId('drill-in')).toBeNull();
	expect(screen.getByTestId('products')).toBeTruthy();
});

it('a product drilled inside a level stays open when the level is re-projected under it', () => {
	const props = stageProps();
	const { rerender } = render(<BrowseStage {...props} />);
	fireEvent.click(screen.getByTestId('browse-term-1'));
	fireEvent.click(screen.getByTestId('variable-product-drill'));
	expect(screen.getByTestId('drill-in')).toBeTruthy();
	// A child synced under Drinks: the level's filter moves with no cashier action, and the
	// level stays — so does the drill over it (`under` is what holds a drill inside a level).
	mockAddedUnderDrinks = [7];
	rerender(<BrowseStage {...props} />);
	expect(mockState.filters.categories).toEqual([1, 2, 7]);
	expect(screen.getByTestId('browse-level')).toBeTruthy();
	expect(screen.getByTestId('drill-in')).toBeTruthy();
});

it('a shortcut with its own search keeps its level live with its chip lit, and the root takes all of it back out', () => {
	const { mockLattes: lattes } = jest.requireMock('./use-browse-terms');
	const resetState = { filters: baseline(), sort: { field: 'name', direction: 'asc' } };
	const before = mockState;
	render(<BrowseStage {...stageProps({ source: 'shortcuts' })} />);
	fireEvent.click(screen.getByTestId('browse-shortcut-qf-lattes'));
	// The shortcut's search is its own: the level stays, under its crumb — not displaced.
	expect(mockState.search).toBe('latte');
	expect(screen.getByTestId('browse-level')).toBeTruthy();
	expect(screen.getByTestId('products-breadcrumb-here').textContent).toBe('Lattes');
	expect(screen.queryByTestId('products')).toBeNull();
	// …and the chip's own rule reads it active.
	expect(isQuickFilterActive(lattes, mockState as never, resetState as never)).toBe(true);
	fireEvent.click(screen.getByTestId('products-breadcrumb-back')); // Shortcuts: the root
	expect(screen.queryByTestId('browse-level')).toBeNull();
	expect(screen.getByTestId('browse-shortcut-qf-lattes')).toBeTruthy();
	// No residue: filters, search and sort are the baseline again.
	expect(mockState).toEqual(before);
});

it('a header sort inside a shortcut level keeps the level and its filters', () => {
	render(
		<BrowseStage
			{...stageProps({
				source: 'shortcuts',
				viewMode: 'table',
				actions: { ...queryActions, extendLimit: jest.fn() },
			})}
		/>
	);
	fireEvent.click(screen.getByTestId('browse-shortcut-qf-lattes'));
	expect(mockState.sort).toEqual({ field: 'sortable_price', direction: 'desc' });
	fireEvent.click(screen.getByTestId('table-sort-name'));
	expect(mockState.sort).toEqual({ field: 'name', direction: 'asc' });
	// Still inside Lattes, its conditions untouched.
	expect(screen.getByTestId('browse-level')).toBeTruthy();
	expect(screen.getByTestId('products-breadcrumb-here').textContent).toBe('Lattes');
	expect(mockState.search).toBe('latte');
	expect(mockState.filters.on_sale).toBe(true);
});

it('a crumb jump of two levels cross-fades the stack it lands on; one step back still gathers', () => {
	mockHoldGathers = true;
	const collapse = (testID: string) => screen.getByTestId(testID).dataset.collapse;
	const { unmount } = render(<BrowseStage {...stageProps()} />);
	fireEvent.click(screen.getByTestId('browse-term-1'));
	fireEvent.click(screen.getByTestId('browse-term-2'));
	// Opening never collapses anything.
	expect(collapse('products-pane-stack')).toBe('false');
	expect(collapse('browse-stack-1')).toBe('false');
	// Categories, from Hot: two levels at once. The root's stack cross-fades; the stack inside
	// its detail is not told to (it holds, inside the surface that fades).
	fireEvent.click(screen.getByTestId('products-breadcrumb-parent-0'));
	expect(collapse('products-pane-stack')).toBe('true');
	expect(collapse('browse-stack-1')).toBe('false');
	unmount();

	render(<BrowseStage {...stageProps()} />);
	fireEvent.click(screen.getByTestId('browse-term-1'));
	fireEvent.click(screen.getByTestId('browse-term-2'));
	const backs = screen.getAllByTestId('products-breadcrumb-back');
	fireEvent.click(backs[backs.length - 1]); // Drinks, from Hot: one step
	expect(collapse('products-pane-stack')).toBe('false');
	expect(collapse('browse-stack-1')).toBe('false');
	// …and from there to the root is one step too.
	fireEvent.click(screen.getAllByTestId('products-breadcrumb-back')[0]);
	expect(collapse('products-pane-stack')).toBe('false');
});

it('the jump’s cross-fade is one-shot: a product drilled where it landed gathers home on close', () => {
	mockHoldGathers = true;
	const collapse = (testID: string) => screen.getByTestId(testID).dataset.collapse;
	render(<BrowseStage {...stageProps()} />);
	fireEvent.click(screen.getByTestId('browse-term-1'));
	fireEvent.click(screen.getByTestId('browse-term-2'));
	// A search typed two levels in drops the path to the root at once: the root's stack fades.
	act(() => queryActions.setSearch('lat'));
	expect(collapse('products-pane-stack')).toBe('true');
	// A result drilled there is a new detail on that stack: it opens, and closes, by the tile.
	fireEvent.click(screen.getByTestId('products'));
	expect(screen.getByTestId('drill-in')).toBeTruthy();
	expect(collapse('products-pane-stack')).toBe('false');
	fireEvent.click(screen.getByTestId('drill-in-last-parent'));
	expect(collapse('products-pane-stack')).toBe('false');
});

it('a level stays rendered from its staged entry while its stack gathers after the path was truncated', () => {
	mockHoldGathers = true;
	render(<BrowseStage {...stageProps()} />);
	fireEvent.click(screen.getByTestId('browse-term-1'));
	fireEvent.click(screen.getByTestId('browse-term-2'));
	fireEvent.click(screen.getByTestId('products-breadcrumb-parent-0')); // Categories: path → []
	expect(mockState.filters.categories).toEqual([]);
	expect(screen.getAllByTestId('browse-level').length).toBe(2); // both levels gathering
	expect(screen.queryByText('undefined')).toBeNull();
	// The deepest level's crumb still carries its middle: Categories › Drinks › Hot.
	const hot = screen.getAllByTestId('products-breadcrumb')[1];
	expect([...hot.querySelectorAll('button')].map((button) => button.textContent)).toEqual([
		'pos_products.browse_categories',
		'Drinks',
	]);
	expect(screen.getAllByTestId('products-breadcrumb-here').map((el) => el.textContent)).toEqual([
		'Drinks',
		'Hot',
	]);
});

it('a product drilled inside a term keeps its crumb while it gathers after the path was cut from under it', () => {
	mockHoldGathers = true;
	render(<BrowseStage {...stageProps()} />);
	fireEvent.click(screen.getByTestId('browse-term-1'));
	fireEvent.click(screen.getByTestId('variable-product-drill'));
	act(() => queryActions.setSearch('lat')); // path → [], drill hidden; both stacks still gathering
	expect(screen.getByTestId('drill-in').textContent).toBe(
		'pos_products.browse_categories › Drinks'
	);
});

it('one Escape goes back exactly one level when levels are nested', () => {
	render(<BrowseStage {...stageProps()} />);
	fireEvent.click(screen.getByTestId('browse-term-1'));
	fireEvent.click(screen.getByTestId('browse-term-2'));
	const levels = screen.getAllByTestId('browse-level');
	fireEvent.keyDown(levels[levels.length - 1], { key: 'Escape' });
	expect(screen.getAllByTestId('browse-level').length).toBe(1); // Hot gone, Drinks still open
	expect(mockState.filters.categories).toEqual([1, 2]);
});

it('a new projection shows held slots until ITS query answers, never the last query’s rows or total', () => {
	const first = makeBinding();
	const { rerender } = render(<BrowseStage {...stageProps({ binding: first })} />);
	// The query re-projects: a new result$ (and total$ derived from it) that has not emitted.
	const result$ = new Subject<{ hits: typeof HITS; count: number }>();
	const total$ = new Subject<number | null>();
	const second = { ...first, result$, total$ };
	rerender(<BrowseStage {...stageProps({ binding: second })} />);
	fireEvent.click(screen.getByTestId('browse-term-1'));
	expect(screen.getAllByTestId('product-placeholder').length).toBeGreaterThan(0);
	expect(screen.queryByTestId('variable-product-drill')).toBeNull();
	expect(screen.getByTestId('products-breadcrumb-detail').textContent).toBe('');
	act(() => {
		result$.next({ hits: [HITS[1]], count: 12 });
		total$.next(220);
	});
	expect(screen.queryByTestId('product-placeholder')).toBeNull();
	expect(screen.getByTestId('product-s')).toBeTruthy();
	expect(screen.getByTestId('products-breadcrumb-detail').textContent).toBe(
		'12 pos_products.n_products'
	);
});

it('a table level is not pushed before the root products have answered once', () => {
	mockAnswered = false;
	const props = stageProps({ viewMode: 'table' });
	const { rerender } = render(<BrowseStage {...props} />);
	fireEvent.click(screen.getByTestId('browse-term-1'));
	expect(screen.queryByTestId('browse-level')).toBeNull();
	expect(screen.queryByTestId('table')).toBeNull();
	mockAnswered = true;
	rerender(<BrowseStage {...props} />);
	expect(screen.getByTestId('browse-level')).toBeTruthy();
	expect(screen.getByTestId('table')).toBeTruthy();
});

it('a second tap while the first level is held opens the term tapped, never one nested under it', () => {
	mockAnswered = false;
	const props = stageProps({ viewMode: 'table' });
	const { rerender } = render(<BrowseStage {...props} />);
	fireEvent.click(screen.getByTestId('browse-term-1'));
	fireEvent.click(screen.getByTestId('browse-term-1'));
	mockAnswered = true;
	rerender(<BrowseStage {...props} />);
	expect(screen.getAllByTestId('browse-level').length).toBe(1);
	expect(screen.getByTestId('products-breadcrumb-here').textContent).toBe('Drinks');
	expect(mockState.filters.categories).toEqual([1, 2]);
});

it('tapping another root term while one is held opens that term alone', () => {
	mockAnswered = false;
	const props = stageProps({ viewMode: 'table' });
	const { rerender } = render(<BrowseStage {...props} />);
	fireEvent.click(screen.getByTestId('browse-term-1'));
	fireEvent.click(screen.getByTestId('browse-term-3'));
	mockAnswered = true;
	rerender(<BrowseStage {...props} />);
	expect(screen.getAllByTestId('browse-level').length).toBe(1);
	expect(screen.getByTestId('products-breadcrumb-here').textContent).toBe('Food');
	expect(mockState.filters.categories).toEqual([3]);
});

it('a child tapped twice on its parent’s level opens one level', () => {
	render(<BrowseStage {...stageProps()} />);
	fireEvent.click(screen.getByTestId('browse-term-1'));
	fireEvent.click(screen.getByTestId('browse-term-2'));
	fireEvent.click(screen.getAllByTestId('browse-term-2')[0]);
	expect(screen.getAllByTestId('browse-level').length).toBe(2);
	expect(mockState.filters.categories).toEqual([2]);
});

it('a whitespace-only search is no search: the root term set stays, and a level and its drill stay', () => {
	mockState = { ...mockState, search: '  ' };
	render(<BrowseStage {...stageProps()} />);
	expect(screen.getByTestId('browse-root')).toBeTruthy();
	expect(screen.queryByTestId('products')).toBeNull();
	fireEvent.click(screen.getByTestId('browse-term-1'));
	fireEvent.click(screen.getByTestId('variable-product-drill'));
	act(() => queryActions.setSearch(' '));
	expect(screen.getByTestId('browse-level')).toBeTruthy();
	expect(screen.getByTestId('drill-in')).toBeTruthy();
});
