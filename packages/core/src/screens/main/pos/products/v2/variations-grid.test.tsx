/** @jest-environment jsdom */
import * as React from 'react';

import { act, fireEvent, render, screen } from '@testing-library/react';

import { VariationsGrid } from './variations-grid';
import { ParentTile, VariationTile } from './grid/variation-tile';

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
jest.mock('../../hooks/use-add-product', () => ({ useAddProduct: () => ({}) }));
jest.mock('../../../components/data-table/v2/rows', () => ({ DataTableRow: () => null }));
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
jest.mock('./deal-stack', () => ({
	FRONT: { zIndex: 1 },
	useDeal: () => ({ placeGrid }),
	useAirspace: () => ({}),
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
jest.mock('../../../contexts/ui-settings', () => ({
	useUISettings: () => ({
		uiSettings: { gridColumns: 3, gridFields: { name: true, price: true, stock_quantity: true } },
	}),
}));
jest.mock('../../../../../contexts/translations', () => ({
	useT: () => (key: string, values?: object) => JSON.stringify({ key, ...values }),
}));
jest.mock('@wcpos/components/suspense', () => ({
	Suspense: ({ children }: React.PropsWithChildren) => children,
}));
jest.mock('@wcpos/components/text', () => ({
	Text: ({ children }: React.PropsWithChildren) => <span>{children}</span>,
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
jest.mock('./footer', () => ({
	ProductsFooter: ({
		children,
		count,
		total,
		active,
		collectionName,
	}: React.PropsWithChildren<{
		count: number;
		total: number | null;
		active: boolean;
		collectionName: string;
	}>) => (
		<footer data-testid="footer" data-active={String(active)} data-collection={collectionName}>
			{children}
			<output>
				{count} of {String(total)}
			</output>
		</footer>
	),
}));
jest.mock('../../../components/product/price-with-tax', () => ({
	PriceWithTax: ({ price, strikethrough }: { price: string; strikethrough?: boolean }) => (
		<span data-testid="price" data-strike={!!strikethrough}>
			{price}
		</span>
	),
}));
jest.mock('../../../hooks/use-stock-status-label', () => ({
	useStockStatusLabel: () => ({ getLabel: String }),
}));
jest.mock('../../../hooks/use-currency-format', () => ({
	useCurrencyFormat: () => ({ format: String }),
}));
jest.mock('../../../hooks/use-image-attachment', () => ({
	useImageAttachment: () => ({ uri: undefined, error: undefined }),
}));
jest.mock('../../contexts/current-order', () => ({
	useCurrentOrder: () => ({ currentOrderRecord: order }),
}));
jest.mock('../../hooks/use-add-variation', () => ({ useAddVariation: () => ({ addVariation }) }));
jest.mock('../grid/tile-image', () => ({ TileImage: () => null, TileImageBlurred: () => null }));
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
	expect(screen.getByTestId('footer').textContent).toContain('pos_products.n_variations_of');
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
	expect(screen.getByTestId('footer').textContent).toContain('1 of 4');
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
