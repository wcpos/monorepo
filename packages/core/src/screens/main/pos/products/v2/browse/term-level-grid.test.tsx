/** @jest-environment jsdom */
import * as React from 'react';

import { fireEvent, render, screen } from '@testing-library/react';

import { TermLevelGrid } from './term-grid';

jest.mock('../../../../../../contexts/translations', () => ({
	useT: () => (key: string, vars?: { count?: number }) =>
		vars?.count !== undefined ? `${vars.count} ${key}` : key,
}));
jest.mock('../../../../contexts/ui-settings', () => ({
	useUISettings: () => ({
		uiSettings: {
			gridColumns: 2,
			gridFields: {
				name: true,
				price: false,
				tax: false,
				on_sale: false,
				category: false,
				sku: false,
				barcode: false,
				stock_quantity: false,
				cost_of_goods_sold: false,
			},
		},
	}),
}));
jest.mock('@wcpos/query', () => ({
	useDocField: (doc: Record<string, unknown>, read: (value: Record<string, unknown>) => unknown) =>
		read(doc),
}));
// The guard is the products grid's own (#1221); here it reports the loaded count it was given.
const guarded = jest.fn();
jest.mock('../../../../../../query', () => ({
	useGuardedExtendLimit: (extend: () => void, count: number) => () => {
		guarded(count);
		extend();
	},
}));
jest.mock('../grid/product-tile', () => ({
	ProductTile: ({ record, grow }: { record: { uuid: string }; grow?: boolean }) => (
		<div data-testid={`product-${record.uuid}`} data-grow={!!grow} />
	),
}));
jest.mock('../grid/variable-product-tile', () => ({
	VariableProductTile: ({
		record,
		onDrill,
		variationsStyle,
		grow,
	}: {
		record: { uuid: string };
		onDrill: (record: unknown) => void;
		variationsStyle: string;
		grow?: boolean;
	}) => (
		<button
			data-testid={`variable-${record.uuid}`}
			data-style={variationsStyle}
			data-grow={!!grow}
			onClick={() => onDrill(record)}
		/>
	),
}));
// The real tiles, each reporting whether the level asked it to grow to its row.
jest.mock('./term-tile', () => {
	const actual = jest.requireActual('./term-tile');
	return {
		...actual,
		TermTile: (props: { grow?: boolean }) => (
			<div data-grow={String(!!props.grow)}>
				<actual.TermTile {...props} />
			</div>
		),
	};
});
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
const placeGrid = jest.fn();
jest.mock('../deal-stack', () => ({
	DealCell: ({
		children,
		index,
		count,
		columns,
	}: React.PropsWithChildren<{ index: number; count: number; columns: number }>) => (
		<div data-testid={`cell-${index}`} data-count={count} data-columns={columns}>
			{children}
		</div>
	),
	DealFade: ({ children }: React.PropsWithChildren) => <div data-testid="fades">{children}</div>,
	FRONT: { zIndex: 1 },
	DealStagedContext: jest.requireActual('react').createContext(null),
	useDeal: () => ({ placeGrid }),
}));
// The list renders every row it is handed, wrapped as its cells are (with the cell style the
// grid asks for), and an end-reached is a scroll on it.
jest.mock('react-native-reanimated', () => ({
	__esModule: true,
	default: {
		FlatList: ({
			data,
			renderItem,
			keyExtractor,
			testID,
			onEndReached,
			ListFooterComponent,
			CellRendererComponentStyle,
			removeClippedSubviews,
		}: {
			data: unknown[];
			renderItem: (input: { item: unknown; index: number }) => React.ReactNode;
			keyExtractor: (item: unknown, index: number) => string;
			testID: string;
			onEndReached: () => void;
			ListFooterComponent?: React.ReactNode;
			CellRendererComponentStyle?: (input: { item: unknown; index: number }) => unknown;
			removeClippedSubviews?: boolean;
		}) => (
			<div
				data-testid={testID}
				data-remove-clipped={String(removeClippedSubviews)}
				onScroll={onEndReached}
			>
				{data.map((item, index) => (
					<div
						key={keyExtractor(item, index)}
						data-testid={`row-${index}`}
						data-cell-style={JSON.stringify(CellRendererComponentStyle?.({ item, index }) ?? null)}
					>
						{renderItem({ item, index })}
					</div>
				))}
				{ListFooterComponent}
			</div>
		),
	},
	useAnimatedRef: () => ({ current: null }),
	useScrollViewOffset: () => ({ value: 0 }),
}));
jest.mock('@wcpos/components/lib/device', () => ({ usePointer: () => 'fine' }));
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
jest.mock('@wcpos/components/vstack', () => ({
	VStack: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
}));
jest.mock('@wcpos/components/icon', () => ({
	Icon: ({ name }: { name: string }) => <span data-testid={`icon-${name}`} />,
}));
jest.mock('@wcpos/components/image', () => ({ Image: () => null }));
jest.mock('../../../../components/product/product-image-placeholder', () => ({
	PRODUCT_IMAGE_PLACEHOLDER: 'placeholder.png',
}));

const drinks = { kind: 'term' as const, id: 1, name: 'Drinks', count: 12 };
const hot = { kind: 'term' as const, id: 2, name: 'Hot', count: 6, parent: 1 };
const latte = { uuid: 'l', payload: { type: 'variable', name: 'Latte' } };
const flat = { uuid: 'f', payload: { type: 'simple', name: 'Flat White' } };
const binding = { active$: {}, sync: jest.fn() };
const base = () => ({
	term: drinks,
	children: [hot],
	answer: { hits: [{ record: latte }, { record: flat }], total: 80 },
	settled: true,
	showProducts: true,
	crumb: { parents: [{ label: 'Categories', onPress: jest.fn() }], here: 'Drinks' },
	back: jest.fn(),
	onOpenTerm: jest.fn(),
	onDrillProduct: jest.fn(),
	variationsStyle: 'drill',
	binding,
	actions: { extendLimit: jest.fn() },
	empty: <span data-testid="no-data-message">nothing</span>,
});
type Props = React.ComponentProps<typeof TermLevelGrid>;
const level = (overrides: Record<string, unknown> = {}) =>
	({ ...base(), ...overrides }) as unknown as Props & ReturnType<typeof base>;

beforeEach(() => {
	guarded.mockClear();
	placeGrid.mockClear();
});

it('deals the parent first, then child terms, then products, on the grid columns', () => {
	const props = level();
	render(<TermLevelGrid {...props} />);
	const cells = ['browse-parent', 'browse-term-2', 'variable-l', 'product-f'];
	cells.forEach((id, index) => {
		expect(screen.getByTestId(`cell-${index}`).contains(screen.getByTestId(id))).toBe(true);
		expect(screen.getByTestId(`cell-${index}`).dataset).toMatchObject({ count: '4', columns: '2' });
	});
	// A dealt product tile grows to its row (the cell gives it no height of its own).
	expect(screen.getByTestId('product-f').dataset.grow).toBe('true');
	expect(screen.getByTestId('variable-l').dataset).toMatchObject({ grow: 'true', style: 'drill' });
	// So does a child term: a subcategories level has rows made only of them.
	expect(screen.getByTestId('browse-term-2').parentElement!.dataset.grow).toBe('true');
	// Rows below the fold but inside the render window stay attached, so their tiles are seen
	// for the whole of their flight (Android detaches clipped subviews by default).
	expect(screen.getByTestId('browse-level-scroller').dataset.removeClipped).toBe('false');
	// The parent's row stays above the rows that come out from under it.
	expect(screen.getByTestId('row-0').dataset.cellStyle).toBe('{"zIndex":1}');
	expect(screen.getByTestId('row-1').dataset.cellStyle).toBe('null');
	fireEvent.click(screen.getByTestId('browse-parent'));
	expect(props.back).toHaveBeenCalled();
	fireEvent.click(screen.getByTestId('browse-term-2'));
	expect(props.onOpenTerm).toHaveBeenCalledWith(hot, expect.anything());
	fireEvent.click(screen.getByTestId('variable-l'));
	expect(props.onDrillProduct).toHaveBeenCalledWith(latte);
});

it('puts the crumb in a row of its own above the grid, its detail the query total', () => {
	const props = level();
	render(<TermLevelGrid {...props} />);
	const crumb = screen.getByTestId('products-breadcrumb');
	const slots = screen.getByTestId('browse-level-slots');
	// Never inside the grid: a row on the ground above it, fading with the furniture.
	expect(slots.contains(crumb)).toBe(false);
	expect(crumb.compareDocumentPosition(slots) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
	expect(screen.getAllByTestId('fades')[0].contains(crumb)).toBe(true);
	// The query TOTAL, not the two loaded rows.
	expect(screen.getByTestId('products-breadcrumb-detail').textContent).toBe(
		'80 pos_products.n_products'
	);
	expect(screen.getByTestId('products-breadcrumb-here').textContent).toBe('Drinks');
	// The last parent is the crumb's way back and keeps the stable back testID.
	fireEvent.click(screen.getByTestId('products-breadcrumb-back'));
	expect(props.crumb.parents[0].onPress).toHaveBeenCalled();
	// The footer counts the loaded rows of the level's own total.
	expect(screen.getByTestId('products-footer').dataset).toMatchObject({
		count: '2',
		total: '80',
	});
});

it('reports the node its slots rest in, so the deal lands on the grid', () => {
	render(<TermLevelGrid {...level()} />);
	const slots = screen.getByTestId('browse-level-slots');
	expect(slots.contains(screen.getByTestId('browse-level-scroller'))).toBe(true);
	// react-native-web drives `onLayout` from a ResizeObserver jsdom lacks; it leaves the handler
	// on the node, so a layout is delivered the way the observer would.
	type LaidOut = HTMLElement & { __reactLayoutHandler?: (event: unknown) => void };
	(slots as LaidOut).__reactLayoutHandler?.({ nativeEvent: { layout: {} } });
	expect(placeGrid).toHaveBeenCalledWith(slots);
});

it('keeps its own products while a child level is over it', () => {
	const { rerender } = render(<TermLevelGrid {...level()} />);
	const other = { uuid: 'x', payload: { type: 'simple', name: 'Other' } };
	rerender(
		<TermLevelGrid
			{...level({ settled: false, answer: { hits: [{ record: other }], total: 1 } })}
		/>
	);
	expect(screen.getByTestId('product-f')).not.toBeNull();
	expect(screen.queryByTestId('product-x')).toBeNull();
	expect(screen.getByTestId('products-breadcrumb-detail').textContent).toBe(
		'80 pos_products.n_products'
	);
});

it('shows only child terms, and no products footer, for a subcategories display type', () => {
	render(<TermLevelGrid {...level({ showProducts: false })} />);
	expect(screen.queryByTestId('product-f')).toBeNull();
	expect(screen.queryByTestId('product-placeholder')).toBeNull();
	expect(screen.getByTestId('browse-term-2')).not.toBeNull();
	expect(screen.getByTestId('cell-0').dataset.count).toBe('2');
	expect(screen.queryByTestId('products-footer')).toBeNull();
	// Products hidden by the display type are not an empty level.
	expect(screen.queryByTestId('no-data-message')).toBeNull();
});

it('holds a row of placeholders for products until the query answers', () => {
	render(<TermLevelGrid {...level({ answer: undefined })} />);
	// One row's worth on the two columns: the deal goes out with shape.
	expect(screen.getAllByTestId('product-placeholder')).toHaveLength(2);
	expect(screen.getByTestId('cell-0').dataset.count).toBe('4');
	expect(screen.queryByTestId('products-breadcrumb-detail')).toBeNull();
	expect(screen.queryByTestId('no-data-message')).toBeNull();
	expect(screen.getByTestId('products-footer').dataset).toMatchObject({
		count: '0',
		total: 'null',
	});
});

it('extends the query window when the cashier nears the end of the level', () => {
	const props = level();
	render(<TermLevelGrid {...props} />);
	fireEvent.scroll(screen.getByTestId('browse-level-scroller'));
	expect(props.actions.extendLimit).toHaveBeenCalled();
	// Guarded on the level's own loaded rows.
	expect(guarded).toHaveBeenCalledWith(2);
});

it('does not page the shared products query from a level that shows only subcategories', () => {
	const props = level({ showProducts: false });
	render(<TermLevelGrid {...props} />);
	fireEvent.scroll(screen.getByTestId('browse-level-scroller'));
	expect(props.actions.extendLimit).not.toHaveBeenCalled();
	expect(guarded).not.toHaveBeenCalled();
});

it('does not page the shared products query from a level a child is over', () => {
	const props = level({ settled: false });
	render(<TermLevelGrid {...props} />);
	fireEvent.scroll(screen.getByTestId('browse-level-scroller'));
	expect(props.actions.extendLimit).not.toHaveBeenCalled();
});

it('shows the empty state under the parent tile when the level answered with nothing and has no children', () => {
	render(<TermLevelGrid {...level({ children: [], answer: { hits: [], total: 0 } })} />);
	expect(screen.getByTestId('browse-parent')).not.toBeNull();
	expect(screen.getByTestId('no-data-message')).not.toBeNull();
	expect(screen.queryByTestId('product-placeholder')).toBeNull();
	// Under slot 0, inside the list: the way back stays where it landed.
	expect(
		screen.getByTestId('browse-level-scroller').contains(screen.getByTestId('no-data-message'))
	).toBe(true);
	// Furniture, not a cell: it fades with the crumb and the footer, never drawn at rest over a
	// deal in flight nor blinking out on the way back.
	const fade = screen.getByTestId('no-data-message').closest('[data-testid="fades"]');
	expect(fade).not.toBeNull();
	expect(screen.getByTestId('browse-level-scroller').contains(fade)).toBe(true);
});

it('Escape goes back one level', () => {
	const props = level();
	render(<TermLevelGrid {...props} />);
	fireEvent.keyDown(screen.getByTestId('browse-level'), { key: 'Escape' });
	expect(props.back).toHaveBeenCalled();
});

it('is the All products level too: the All products tile in slot 0, no children', () => {
	render(<TermLevelGrid {...level({ term: { kind: 'all' }, children: [] })} />);
	expect(screen.getByTestId('cell-0').contains(screen.getByTestId('browse-parent'))).toBe(true);
	expect(screen.getByTestId('browse-parent').textContent).toContain(
		'pos_products.browse_all_products'
	);
	expect(screen.queryByTestId('browse-term-2')).toBeNull();
	expect(screen.getByTestId('cell-2').contains(screen.getByTestId('product-f'))).toBe(true);
});
