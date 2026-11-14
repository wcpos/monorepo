/** @jest-environment jsdom */
import * as React from 'react';

import { act, fireEvent, render, screen } from '@testing-library/react';

import { ProductsFooter } from './footer';
import { VariationsGrid } from './variations-grid';
import { ParentTile, VariationTile } from './tiles/variation-tile';

const addVariation = jest.fn();
const order = {
	payload: {
		line_items: [
			{ product_id: 12, variation_id: 2, quantity: 2 },
			{ product_id: 12, variation_id: 2 },
			{ product_id: 12, variation_id: 1, quantity: 5 },
		],
	},
};
jest.mock('@wcpos/components/icon-button', () => ({ IconButton: () => null }));
jest.mock('../hooks/use-add-product', () => ({ useAddProduct: () => ({}) }));
jest.mock('../../components/data-table/rows', () => ({ DataTableRow: () => null }));
jest.mock('../../../../query', () => ({
	...jest.requireActual('../../../../query'),
	useQueryStateActions: () => ({}),
}));
jest.mock('@wcpos/query', () => ({
	useDocField: (record: object, select: (value: object) => unknown) => select(record),
	useRecordField: (record: object, select: (value: object) => unknown) => select(record),
}));
// The variations handle as a reader sees it (one snapshot, driven with `set`).
type FakeHandle = import('@wcpos/query').QueryHandle & {
	set(partial: Record<string, unknown>): void;
};
const { fakeQueryHandle } = jest.requireActual('@wcpos/core-test/fake-query-handle') as {
	fakeQueryHandle: (initial?: Record<string, unknown>) => FakeHandle;
};
jest.mock('react-native-reanimated', () => ({
	__esModule: true,
	default: {
		View: ({ children, testID }: React.PropsWithChildren<{ testID?: string }>) => (
			<div data-testid={testID}>{children}</div>
		),
		ScrollView: ({
			children,
			contentContainerStyle,
		}: React.PropsWithChildren<{ contentContainerStyle?: { paddingTop?: number } }>) => (
			<div data-testid="scroller" data-top={contentContainerStyle?.paddingTop}>
				{children}
			</div>
		),
	},
	useAnimatedRef: () => ({ current: null }),
	useAnimatedStyle: (style: () => object) => style(),
	useScrollViewOffset: () => ({ value: 0 }),
}));
const placeGrid = jest.fn();
// What the stage's airspace hands the grid: nothing at rest; a frame reaching over the crumb row
// while a tile is in flight.
let mockAir: { frame?: object; scroller?: object } = {};
jest.mock('./deal-stack', () => ({
	FRONT: { zIndex: 1 },
	useDeal: () => ({ placeGrid }),
	useAirspace: () => mockAir,
	useCopyPicture: () => undefined,
	useDealCards: () => null,
	DealFade: ({ children }: React.PropsWithChildren) => children,
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
}));
jest.mock('../../contexts/ui-settings', () => ({
	useUISettings: () => ({
		uiSettings: { gridColumns: 3, gridFields: { name: true, price: true, stock_quantity: true } },
	}),
}));
jest.mock('../../../../contexts/translations', () => ({
	useT: jest.fn(() => (key: string, values?: object) => JSON.stringify({ key, ...values })),
}));
jest.mock('@wcpos/components/suspense', () => ({
	Suspense: ({ children }: React.PropsWithChildren) => children,
}));
jest.mock('@wcpos/components/text', () => ({
	Text: ({ children, testID }: React.PropsWithChildren<{ testID?: string }>) => (
		<span data-testid={testID}>{children}</span>
	),
}));
jest.mock('@wcpos/components/vstack', () => ({
	VStack: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
}));
jest.mock('@wcpos/components/icon', () => ({
	Icon: ({ name }: { name: string }) => <span data-testid={name} />,
}));
jest.mock('@wcpos/components/image', () => ({ Image: () => null }));
jest.mock('@wcpos/components/status-badge', () => ({
	StatusBadge: ({ label }: { label: string }) => <span data-testid="stock">{label}</span>,
}));
// The footer row as the handle footer hands it values: the real HandleProductsFooter reads
// `active` from the handle and passes the grid's count and denominator through.
jest.mock('../../contexts/tax-rates', () => ({ useTaxSettings: () => ({ calcTaxes: false }) }));
jest.mock('../../hooks/use-collection-reset', () => ({
	useCollectionReset: () => ({ clearAndSync: jest.fn() }),
}));
jest.mock('../../components/product/tax-based-on', () => ({ TaxBasedOn: () => null }));
jest.mock('../../components/sync-button', () => ({ SyncButton: () => null }));
jest.mock('./footer', () => ({
	ProductsFooter: (props: React.ComponentProps<typeof import('./footer').ProductsFooter>) => {
		const { ProductsFooter } = jest.requireActual('./footer');
		return (
			<footer
				data-testid="footer"
				data-active={String(props.active)}
				data-collection={props.collectionName}
			>
				<ProductsFooter {...props} />
				<output>
					{props.drawnCount} of {String(props.total)}
				</output>
			</footer>
		);
	},
}));
jest.mock('../../components/product/price-with-tax', () => ({
	PriceWithTax: ({ price, strikethrough }: { price: string; strikethrough?: boolean }) => (
		<span data-testid="price" data-strike={!!strikethrough}>
			{price}
		</span>
	),
}));
jest.mock('../../hooks/use-stock-status-label', () => ({
	useStockStatusLabel: () => ({ getLabel: String }),
}));
jest.mock('../../hooks/use-currency-format', () => ({
	useCurrencyFormat: () => ({ format: String }),
}));
jest.mock('../../hooks/use-image-attachment', () => ({
	useImageAttachment: () => ({ uri: undefined, error: undefined }),
}));
jest.mock('../contexts/current-order', () => ({
	useCurrentOrder: () => ({ currentOrderRecord: order }),
}));
jest.mock('../hooks/use-add-variation', () => ({ useAddVariation: () => ({ addVariation }) }));
jest.mock('./tiles/tile-image', () => ({ TileImage: () => null, TileImageBlurred: () => null }));
jest.mock('./rows/in-cart-count', () => ({
	InCartCount: ({ count }: { count: number }) => <output data-testid="in-cart">{count}</output>,
}));

const parent = {
	uuid: 'parent',
	remoteId: 12,
	payload: { name: 'Tea', variations: [1, 2, 3, 4] },
} as unknown as React.ComponentProps<typeof VariationsGrid>['parent'];
const variation = (remoteId: number, payload: object) =>
	({ uuid: `variation-${remoteId}`, remoteId, payload }) as unknown as React.ComponentProps<
		typeof VariationTile
	>['record'];
const hits = [
	{ record: variation(1, { stock_status: 'instock', attributes: [{ option: 'Blue' }] }) },
	{ record: variation(2, { stock_status: 'outofstock', attributes: [{ option: 'Red' }] }) },
];
let handle: FakeHandle = fakeQueryHandle({ total: 99 });
beforeEach(() => {
	handle = fakeQueryHandle({ total: 99 });
	mockAir = {};
});
// The ground as the surface draws it, its inner element marked: the harness drops classNames.
jest.mock('../../components/data-table/surface', () => ({
	...jest.requireActual('../../components/data-table/surface'),
	TileGround: ({ children }: React.PropsWithChildren) => (
		<div data-testid="tile-ground">
			<div data-testid="tile-ground-inner">{children}</div>
		</div>
	),
}));

// The ground's `-mt-1` takes back the tiles' own margin; the air frame's `marginTop` reaches over
// the crumb in flight. On one element the second replaced the first and the slots sat 4 px off
// until landing (review, 2026-10-22).
it('keeps the air frame its own element inside the ground, so its marginTop never replaces the -mt-1', () => {
	mockAir = { frame: { marginTop: -40, paddingTop: 40 }, scroller: {} };
	render(<VariationsGrid parent={parent} back={jest.fn()} handle={handle} hits={undefined} />);
	const air = screen.getByTestId('variations-air');
	expect(air.style.marginTop).toBe('-40px');
	expect(air.parentElement).toBe(screen.getByTestId('tile-ground-inner'));
	expect(screen.getByTestId('tile-ground-inner').style.marginTop).toBe('');
	expect(air.contains(screen.getByTestId('variations-slots'))).toBe(true);
	expect(screen.getByTestId('variations-surface').contains(screen.getByTestId('tile-ground'))).toBe(
		true
	);
});
const gridFields = {
	name: true,
	price: true,
	tax: false,
	on_sale: true,
	category: false,
	sku: false,
	barcode: false,
	stock_quantity: true,
	cost_of_goods_sold: false,
};

it('holds a slot for every variation until the query answers, so the deal never waits for data', () => {
	const back = jest.fn();
	const { rerender } = render(
		<VariationsGrid parent={parent} back={back} handle={handle} hits={undefined} />
	);
	// The parent has four variations: five slots on the products' own three columns, the parent first.
	expect(screen.getByTestId('cell-0').dataset).toMatchObject({ count: '5', columns: '3' });
	expect(screen.getByTestId('cell-0').contains(screen.getByTestId('variations-parent-tile'))).toBe(
		true
	);
	expect(screen.getAllByTestId('variation-placeholder')).toHaveLength(4);
	// A tile's own shape: the square and the Poster band under it.
	expect(screen.getAllByTestId('variation-placeholder')[0].children).toHaveLength(2);
	expect(screen.queryByTestId('variation-tile')).toBeNull();
	// The breadcrumb is a row above the grid's card, not an overlay: the grid pads nothing and
	// sits on the shared table surface (owner's pick A, 2026-10-05).
	expect(screen.getByTestId('scroller').dataset.top).toBeUndefined();
	expect(screen.getByTestId('variations-surface').contains(screen.getByTestId('scroller'))).toBe(
		true
	);
	// The stage is told where the slots rest once they are laid out, so the deal lands on the
	// card and not on the stage the card is inset from.
	const slots = screen.getByTestId('variations-slots');
	expect(slots.contains(screen.getByTestId('scroller'))).toBe(true);
	// react-native-web drives `onLayout` from a ResizeObserver jsdom lacks; it leaves the handler
	// on the node, so a layout is delivered the way the observer would.
	type LaidOut = HTMLElement & { __reactLayoutHandler?: (event: unknown) => void };
	(slots as LaidOut).__reactLayoutHandler?.({ nativeEvent: { layout: {} } });
	expect(placeGrid).toHaveBeenCalledWith(slots);

	// The answer lands in the slots that are already there.
	rerender(<VariationsGrid parent={parent} back={back} handle={handle} hits={hits} />);
	expect(screen.queryByTestId('variation-placeholder')).toBeNull();
	expect(screen.getByTestId('cell-1').contains(screen.getByTestId('variation-tile-1'))).toBe(true);
	expect(screen.getByTestId('cell-2').contains(screen.getByTestId('variation-tile-2'))).toBe(true);
	expect(screen.getByTestId('footer').textContent).toContain('2 of 4');
	expect(screen.getByTestId('footer').textContent).toContain('common.showing_of');
});

it('keeps a slot for what a cold refresh has not brought yet, and only while it runs', () => {
	// A cold drill-in answers empty at once; the variations arrive when the refresh returns.
	handle.set({ active: true });
	const view = (found: typeof hits) => (
		<VariationsGrid parent={parent} back={jest.fn()} handle={handle} hits={found} />
	);
	const { rerender } = render(view([]));
	expect(screen.getAllByTestId('variation-placeholder')).toHaveLength(4);
	rerender(view(hits));
	expect(screen.getAllByTestId('variation-tile')).toHaveLength(2);
	expect(screen.getAllByTestId('variation-placeholder')).toHaveLength(2);
	// Refresh over: a variation the parent lists but the store does not serve holds no slot.
	// Heard from the handle itself, with no render from above.
	act(() => handle.set({ active: false }));
	expect(screen.queryByTestId('variation-placeholder')).toBeNull();
	expect(screen.getByTestId('cell-0').dataset.count).toBe('3');
});

it('filters displayed stock like the rows do and counts shown of the parent total', () => {
	render(
		<VariationsGrid
			parent={parent}
			back={jest.fn()}
			handle={handle}
			hits={hits}
			stockStatus="instock"
		/>
	);
	expect(screen.getAllByTestId('variation-tile')).toHaveLength(1);
	expect(screen.getByTestId('variation-tile-1')).not.toBeNull();
	expect(screen.getByTestId('footer').textContent).toContain('1 of 1');
});

it('without a parent list, counts against the handle total once it has answered, and resets variations', () => {
	const unlisted = {
		...parent,
		payload: { name: 'Tea' },
	} as unknown as React.ComponentProps<typeof VariationsGrid>['parent'];
	handle.set({ ready: false });
	render(<VariationsGrid parent={unlisted} back={jest.fn()} handle={handle} hits={undefined} />);
	// No denominator before the first answer: a total from no answer vouches for nothing.
	expect(screen.getByTestId('footer').textContent).toContain('0 of null');
	act(() => handle.set({ ready: true, total: 7 }));
	expect(screen.getByTestId('footer').textContent).toContain('0 of 7');
	// The footer's own sync spinner follows the handle; its clear-and-sync is the variations'.
	expect(screen.getByTestId('footer').dataset).toMatchObject({
		active: 'false',
		collection: 'variations',
	});
	act(() => handle.set({ active: true }));
	expect(screen.getByTestId('footer').dataset.active).toBe('true');
});

it('the parent tile is the way back', () => {
	const back = jest.fn();
	render(<ParentTile record={parent} gridFields={gridFields} onPress={back} />);
	expect(screen.getByTestId('chevronLeft')).not.toBeNull();
	expect(screen.getByTestId('variations-parent-tile').textContent).toContain('"count":4');
	fireEvent.click(screen.getByTestId('variations-parent-tile'));
	expect(back).toHaveBeenCalled();
});

it('a variation tile is the add control, with exactly the row’s sanitised metadata', () => {
	const record = variation(2, {
		price: '4.50',
		regular_price: '5.00',
		on_sale: true,
		stock_status: 'instock',
		attributes: [null, { name: 'Size' }, { id: 1, name: 'Colour', option: 'Blue' }],
	});
	render(<VariationTile record={record} parent={parent} gridFields={gridFields} />);
	const tile = screen.getByTestId('variation-tile');
	// Named by its own attributes, priced with the sale struck through, counted by quantity.
	expect(tile.getAttribute('aria-label')).toBe('Blue');
	expect(screen.getAllByTestId('price').map((price) => price.textContent)).toEqual([
		'4.50',
		'5.00',
	]);
	expect(screen.getByTestId('in-cart').textContent).toBe('3');
	// A variation opens onto nothing: never a stack.
	expect(screen.queryByTestId('poster-stack')).toBeNull();
	fireEvent.click(tile);
	expect(addVariation).toHaveBeenCalledWith(record, parent, [
		{ attr_id: 1, display_key: 'Colour', display_value: 'Blue' },
	]);
});

it('shows managed stock as a pill and low stock from the variation’s own threshold', () => {
	const record = variation(7, {
		manage_stock: true,
		stock_quantity: 2,
		low_stock_amount: 3,
		stock_status: 'instock',
		attributes: [{ option: 'Green' }],
	});
	render(<VariationTile record={record} parent={parent} gridFields={gridFields} />);
	expect(screen.getByTestId('variation-tile-stock-7').textContent).toBe('2');
	expect(screen.getByTestId('variation-tile-stock-7').getAttribute('aria-label')).toContain(
		'"count":2'
	);
	expect(screen.queryByTestId('stock')).toBeNull();
});

it('uses the stock matches as the footer denominator and collapses the sentence', () => {
	render(
		<VariationsGrid
			parent={parent}
			back={jest.fn()}
			handle={handle}
			hits={hits}
			stockStatus="instock"
		/>
	);
	expect(screen.getByTestId('footer').textContent).toContain('1 of 1');
	expect(screen.getByTestId('footer').textContent).toContain('pos_products.n_options');
});

it.each([
	[null, 2, 'common.showing_n'],
	[4, 2, 'common.showing_of'],
	[2, 2, 'pos_products.n_products'],
	[2, 3, 'pos_products.n_products'],
] as const)('renders the footer sentence for total %s and drawn %s', (total, drawnCount, key) => {
	render(
		<ProductsFooter
			collectionName="products"
			total={total}
			drawnCount={drawnCount}
			active={false}
			sync={jest.fn()}
		/>
	);
	expect(screen.getByTestId('data-table-count').textContent).toContain(key);
	expect(screen.getByTestId('data-table-loaded-count').textContent).toBe(String(drawnCount));
	expect(screen.getByTestId('data-table-total-count').textContent).toBe(
		total === null ? '' : String(total)
	);
});
it('a label replaces the sentence without changing the raw markers', () => {
	render(
		<ProductsFooter
			collectionName="products"
			total={218}
			drawnCount={16}
			label="3 categories · 16 products"
			prefix="7 categories"
			active={false}
			sync={jest.fn()}
		/>
	);
	expect(screen.getByTestId('data-table-count').textContent).toBe('3 categories · 16 products');
	expect(screen.getByTestId('data-table-loaded-count').textContent).toBe('16');
	expect(screen.getByTestId('data-table-total-count').textContent).toBe('218');
});

it.each([
	[16, 16, '7 categories · 16 products'],
	[161, 16, '7 categories · Showing 16 of 161'],
	[0, 0, '7 categories · 0 products'],
	[null, 16, '7 categories · Showing 16'],
] as const)(
	'prefixes the product sentence for total %s and drawn %s',
	(total, drawnCount, text) => {
		jest
			.requireMock('../../../../contexts/translations')
			.useT.mockReturnValueOnce(jest.requireActual('../../../../../jest/translate').createTestT());
		render(
			<ProductsFooter
				collectionName="products"
				total={total}
				drawnCount={drawnCount}
				prefix="7 categories"
				active={false}
				sync={jest.fn()}
			/>
		);
		expect(screen.getByTestId('data-table-count').textContent).toBe(text);
		expect(screen.getByTestId('data-table-loaded-count').textContent).toBe(String(drawnCount));
		expect(screen.getByTestId('data-table-total-count').textContent).toBe(
			total === null ? '' : String(total)
		);
	}
);
